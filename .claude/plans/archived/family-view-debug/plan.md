# family-view debug overlay & diagnostics

## context

the tree canvas in this project has two rendering engines:

- **layered (tree-view)** - full-graph rank-based renderer, async layout in a worker. has a rich `DebugOverlay` (16 toggles, ctrl+shift+d) and a `window.__treeDebug` console handle.
- **family-view** - the *default* engine, a synchronous bounded-window renderer focused on a single person and their relatives. has **zero** debug instrumentation today.

four bug classes in family-view are currently hard to chase without diagnostics:

1. **floating people** - persons that exist in the tree but render with no incoming/outgoing edges. suspected cause: `subset.placeSecondaryUnions` is only called for the focus's rank-0 unions; ancestor secondary partners never enter the visible set, so their bond edges disappear.
2. **jump-to-person silently fails** - picking from the palette closes it but the canvas doesn't recenter (already on `notes/bugs.md:41`). either the selection doesn't propagate to `canvasController.centerOnPerson`, or the target lands outside the auto-fit viewport.
3. **many-spouse layout** - n-partner unions render edges via `nPartnerGeometry.ts` but the card-positioning pass doesn't reserve enough width, so bus edges route through occupied card space.
4. **coi viewer** - wright-formula coi is computed (`domain/consanguinity.ts`) and shown as a badge, but `notes/bugs.md:29` flags a suspected rounding/precision issue at deep pedigrees, and the duplicate-ancestor tint isn't visibly wired through to the cards.

a debug overlay does not *fix* any of these. it surfaces enough state to make each one diagnosable on a live tree, so the follow-up fix PRs can target root cause instead of guessing.

## goals

- parity in spirit, not in toggle list, with the layered debug story: a ctrl+shift+d panel of toggles, a console handle, and visual overlays for layout invariants.
- every new toggle must illuminate at least one reported issue. nothing added "for completeness".
- synchronous render path stays synchronous. overlays are purely additive svg / dom.
- off-toggle cost is zero - each layer renders inside its own `{#if}` block; no work happens when a layer is off.

## non-goals

- fixing the four bugs themselves. that's follow-up PRs tracked in `notes/bugs.md`.
- sharing components with the layered `DebugOverlay`. family-view has no segment grammar; copying the existing component would mostly delete things.
- persisting debug toggles across sessions. transient state, same as layered.
- extending the layered engine. tree-view is already fine.

## scope

in-scope files:

- `apps/web/src/lib/components/tree/FamilyViewDebugOverlay.svelte` (new)
- `apps/web/src/lib/components/tree/FamilyViewCanvas.svelte` (prop wiring, window handle, overlay mount)
- `apps/web/src/lib/components/tree/debugTypes.ts` (extend with `FamilyViewDebugLayerOptions`)
- `apps/web/src/App.svelte` (family-view section in the debug panel; ctrl+shift+d already wired)
- `apps/web/src/lib/layout/engines/family-view/*` - read-only; expose existing data, do not refactor

out-of-scope:

- the four-pass IR (`apps/web/src/lib/layout/passes/`)
- `domain/consanguinity.ts` algorithm changes - we surface its output, never tweak it
- new worker plumbing - family-view is sync, stays sync
- bug-fix tests - the diagnostics PR delivers a panel smoke test; per-bug regression tests live with the bug-fix PRs

## constraints

- project style: lowercase inline comments, no trailing periods, regular dashes, american english, spaces for indent, brief over long
- svelte 5 runes; tailwind v4 tokens; `exactOptionalPropertyTypes` ts
- no committed secrets, no `data/` writes
- no backwards-compat shims or feature flags beyond the existing transient toggle
- family-view hot path is ~6ms; overlay work happens off the critical path, gated on each toggle

## approach (summary)

a standalone `FamilyViewDebugOverlay.svelte`, sibling to the existing `DebugOverlay.svelte`, with its own toggle interface in `debugTypes.ts`. the App-level state and ctrl+shift+d shortcut already exist; the family-view debug section reuses the same panel chrome but is a distinct group of toggles, gated on `selectedEngine === "family-view"`.

`window.__treeDebug` is *extended* (not replaced) and gets an `engine: "family-view" | "layered" | "hyperbolic"` discriminator. only one canvas is mounted at a time, so there's no race; the discriminator just makes the source unambiguous in devtools.

phases progress risk-first: prove the wiring with a walking skeleton in phase 0, then add overlays in the order that most directly attacks each reported bug class.

note that issues 1 (floating people) and 3 (many spouses) may share a root cause around secondary-union expansion. the phase-1 overlays should surface that overlap if it exists, which lets us decide whether phase 2 needs to be reframed before starting it.

## phases

### phase 0 - walking skeleton: wire debug into family-view, probe upstream data shapes

prove the entire data path works end-to-end *and* confirm the two upstream assumptions phases 1 and 4 depend on, before adding overlay surface area.

wiring:

- extend `debugTypes.ts` with `FamilyViewDebugLayerOptions` (start with two flags: `exposeFamilyDebug`, `showVisibleSubset`)
- add `debugOptions?: { layers: FamilyViewDebugLayerOptions }` prop to `FamilyViewCanvas`
- when `debugOptions` is defined, populate `window.__treeDebug` with: `engine: "family-view"`, `layout`, `subset`, `expansion`, `primaryUnion`, `secondaryUnion`, `selectedId`, `pathHighlight`
- create `FamilyViewDebugOverlay.svelte` skeleton: receives layout + options, renders ONE overlay (dashed rect around the laid-out cards) when `showVisibleSubset` is on
- in `App.svelte`, refactor the debug panel so each engine's section is visible **only** when that engine is the active one: layered toggles hidden in family-view mode, family-view toggles hidden in layered mode, hyperbolic likewise. add the new "family-view" section under this scheme. shared `Runtime` controls (copy snapshot, force conflict, dump/load tree json) stay visible in all modes
- one e2e smoke test (`tests/e2e/family-view-debug.spec.ts`): open panel, toggle `showVisibleSubset`, assert dashed rect svg group present; toggle `exposeFamilyDebug`, assert `window.__treeDebug.engine === "family-view"`

probes (read-only, outcomes recorded in this plan):

- **subset rationale probe:** read `subset.ts:selectBoundedSubset`. does it compute / expose a per-person rejection reason (rank cutoff, secondary-union not expanded, expansion collapsed)? if not, note what would need to change to surface them. result feeds phase-1 scope decision.
- **coi breakdown probe:** read `domain/consanguinity.ts:computeAncestorOverlap`. is the per-pair `(d_i, d_j, contribution)` table computed and discarded, or not computed at all? result feeds phase-4 decision (widen return type vs duplicate the walk in the overlay).
- **window.__treeDebug readers probe:** grep tests + scripts for existing readers of `window.__treeDebug.*`. confirm they either gate on `engine` or are layered-only; document any that need updating.

**DoD:** ctrl+shift+d in family-view shows the panel; toggling `showVisibleSubset` paints a dashed rect around the laid-out cards; toggling `exposeFamilyDebug` lets `window.__treeDebug.layout` be inspected in devtools; smoke test green; three probe outcomes recorded in the plan log; `pnpm verify` green.

### phase 1 - connectivity overlays: chase floating people (issue 1)

surface why some persons render disconnected. this is the highest-uncertainty phase because the floating-people root cause is still a hypothesis.

- `showOrphanBadge` - circle + label on every visible person whose in-edges + out-edges count is zero (parity with layered orphan badge)
- `showEdgeRoles` - color edges by role (couple-bond, parent-drop, child-drop, sibling-bus, n-partner-bus); emit `data-edge-role` / `data-edge-id` on the path elements
- `showOffSubsetPeople` - side-panel count + list of `tree.people` ids that exist but aren't in the visible subset; for each, the reason (rank cutoff, secondary-union not expanded, expansion collapse)
- `showSecondaryUnionState` - pill on each card showing its unions' state (primary/secondary, expanded/collapsed)

scope adjustment based on phase-0 probe:

- if the subset-rationale probe found that `subset.ts` does not expose reasons, modifying `subset.ts` to surface them is **in scope for this phase**. the "read-only / do not refactor" rule for family-view internals is lifted here specifically, and only for adding rationale output. this scope expansion is accepted up front so phase 1 doesn't stall on a deferred decision.

**DoD:** loading a tree with a known floating person, the overlay shows them in the off-subset list with a "secondary-union, not expanded" reason; an orphan badge appears on any visible person with zero edges; one e2e covers `showOffSubsetPeople` and `showOrphanBadge`; `pnpm verify` green.

**phase exit check:** review the off-subset reasons. if a meaningful fraction trace to n-partner/secondary-union mechanics, phase 2's first task is to fold its multi-union overlays into phase 1's diagnostics rather than build parallel ones. if not, phase 2 stands as written. the decision is recorded in the plan log.

### phase 2 - multi-union geometry: chase polygamy issues (issue 3)

specifically attack the n-partner / many-spouse layout bugs. depends on phase-1's edge-role coloring (now landed: every edge carries `data-edge-role` and the `showEdgeRoles` toggle tints by role, so phase 2 can stack its overlays on top instead of restating them).

- `showMultiUnionManifold` - highlight the bus polyline of every union with `partnerIds.length > 2`, mark its `childAnchor`, mark each partner's connection point, label the union index
- `showCardCollisions` - same-rank cards whose bounding rects overlap get a red dashed rect (parity with layered `showOverlapPairs`)
- `showCoupleCentroidDelta` - for each couple, draw the bond midpoint vs the children's centroid, with the delta as a line + label (parity with layered `showBondCentroidDelta`)
- `showRankGutterLabels` - `g-2`, `g-1`, `g0`, `g+1`... labels on the left margin

fixture:

- name the canonical 3-spouse fixture for this phase. audit existing trees in `tests/e2e/visual-multi-union.spec.ts` and `tests/e2e/family-view-multi-union.spec.ts` first; reuse if either covers a 3-spouse focus. if not, minting a fixture is part of this phase, not deferred.
- chosen (phase 2 retro): `apps/web/tests/fixtures/multi-union-3.ged` — minted in phase 2. existing `multi-union.ged` is 2-spouse only. the new fixture combines a 3-partner `_TREES_UNION` (Aron + Sera + Tess → Iva) with a primary 2-partner FAM (Aron + Mira → Calen, `_PRIMARY Y`) and a secondary 2-partner FAM (Aron + Brigitta → Helga, `_PRIMARY N`), so a single tree covers both the multi-union geometry overlays and phase 1's `secondary-union-not-expanded` off-subset assertion.

**DoD:** on the named 3-spouse fixture, the bus polyline is visually distinct; the child-anchor is plainly visible; any card-overlap is red-flagged; one e2e covers `showMultiUnionManifold` and `showCardCollisions`; `pnpm verify` green.

### phase 3 - navigation diagnostics: chase jump-to-person (issue 2)

instrument the focus / centerOn / viewport pipeline so the silent-no-op failure becomes visible.

- `logFocusEvents` - append-only side panel listing the last N selection / focus change events with timestamps and source (palette / canvas click / keyboard) and whether `canvasController.centerOnPerson` was invoked in response
- `showViewportFitTarget` - when a recenter is requested, draw the target person's expected bounding rect plus the current viewport rect, so off-screen targets are visually obvious
- `showOffSubsetWarning` - if `selectedPersonId` is set but not in the visible subset, show a corner badge naming the missing person and the reason (drawn from phase 1's off-subset machinery)
- `showPendingRecenter` - flash the canvas border green when `centerOnPerson` is invoked; if no centerOn happens within ~200ms of a selection change, show a red corner badge

prerequisite:

- before instrumenting, document the palette-jump call path end-to-end in the plan log: where the selection change originates, where `canvasController.centerOnPerson` is invoked, which component owns the recenter intention. this is a 15-minute trace; it determines whether the event source belongs inside `FamilyViewCanvas` or in `App.svelte`.
- trace recorded (phase 3 starting block): event source rooted in `App.svelte` (palette pick / `viewFocus` command / card-click bubble); canvas owns `recenterOn` + the off-subset focus-shift; canvas reports back via `onrecenter` so App's watchdog can cancel and the focus-event log can flip `didTriggerCenterOn`.

**DoD:** call-path trace recorded in plan log; clicking a person in the palette either visibly recenters (green flash) or the corner badge explains why not (off-subset / no centerOn fired / target outside auto-fit bounds); one e2e covers `showOffSubsetWarning` and `showPendingRecenter`; `pnpm verify` green.

### phase 4 - coi inspector (issue 4)

surface enough of the wright-formula computation to spot the rounding issue, without touching the algorithm.

- `showCoiBreakdown` - when a focus is selected and the consanguinity overlay is on, the debug panel shows a per-pair wright contribution table: each `(ancestor_i, ancestor_j)` pair with depths `d_i`, `d_j` and contribution `(0.5)^(d_i+d_j+1)`, plus the raw float vs the displayed rounded percent
- `showDuplicateAncestors` - render a halo on each duplicate-ancestor card (the persons appearing in both lineages), styled distinctly from the focus ring
- expose `window.__treeDebug.coi = { duplicates, rawCoi, breakdown, cacheHits, cacheMisses, editRev }`
- emit a one-line `console.warn` the first time a focus with `duplicates.length > 0` is loaded, naming the duplicates

decision (driven by phase-0 probe, final shape landed in phase 4):

- phase-0 probe confirmed `computeAncestorOverlap` already computes per-pair `(0.5)^(di+dj+1)` contributions inline at `consanguinity.ts:112` and discards them into the scalar `coi`. **path chosen: widen `AncestorOverlap` to include an optional `breakdown?: readonly CoiBreakdownRow[]` field** (`CoiBreakdownRow` = `{ ancestorId, di, dj, contribution }`), populated alongside the existing scalar accumulation in `computeOverlapImpl`. zero new computation; memo cache automatically handles staleness.
- `getCoiCacheStats()` exported from `consanguinity.ts` exposes module-level `cacheHits` / `cacheMisses` counters for the `__treeDebug.coi` handle. existing tests of `computeAncestorOverlap` pass unchanged; 3 new unit tests cover the sum-rows-equals-scalar invariant on full-sibling + first-cousin pedigrees.

**DoD:** decision recorded; on a pedigree with hand-computed coi, the breakdown table rows sum to the raw float; duplicate-ancestor halos light up the expected ancestors; raw vs displayed numbers make any rounding bug obvious; one e2e covers `showCoiBreakdown` and `showDuplicateAncestors`; `pnpm verify` green.

### phase 5 - polish, parity, and metrics

last pass to close gaps with the layered overlay and add metrics. each parity toggle below carries a one-line "matches `DebugOverlay.svelte` X" note for the reviewer; `showLayoutMetrics` is cuttable if the phase runs hot.

- `showGrid` - unit grid + 10x emphasis lines (parity with layered `showGrid`)
- `showNodeBounds` - green rects around each laid-out card (parity with layered `showNodeBounds`)
- `showLastEditHalo` - 1s yellow ring on the most recently mutated card (parity with layered `showLastEditHalo`)
- `showLayoutMetrics` - derived readout: visible card count, badge count, expansion state size, rank distribution, layout duration ms (cuttable)
- `data-testid` parity audit - confirm overlay-relevant nodes have stable testids
- audit color contrast of all new overlay strokes against light + dark themes; adjust any that conflict with existing ui chrome
- final smoke e2e: open panel, toggle every layer in sequence, assert no console errors

**DoD:** every layered debug feature with a meaningful family-view analogue is present; final smoke e2e passes; `pnpm verify` green.

## risk callout (accepted)

pre-mortem (see sibling `pre-mortem.md`) flagged two high-severity premise risks - phase 1 depends on `subset.ts` exposing rejection reasons, and phase 4 depends on `computeAncestorOverlap` exposing per-pair contributions. both are folded into phase 0 as read-only probes whose outcomes scope phases 1 and 4 explicitly. lower-severity risks accepted:

- panel never shows two engines' toggles at once (sections gated by `selectedEngine`); shared runtime controls always visible
- per-toggle perf cost when many are on - each layer renders in its own `{#if}` block; off-toggles cost nothing
- shared `window.__treeDebug` name across engines - mitigated by the `engine` discriminator; documented at the top of `FamilyViewCanvas` where the handle is populated
- issues 1 and 3 may share a root cause; phase-1 exit check explicitly decides whether phase 2 stands or folds in, so we don't build parallel overlays for the same bug

## verification

- `pnpm verify` (lint + typecheck + unit + e2e) at the end of every phase
- per-phase manual smoke: open a known tree, switch to family-view, hit ctrl+shift+d, toggle each new layer, screenshot
- bug-specific verification per phase, listed in each phase's DoD
- fixtures: reuse the existing `tests/e2e/visual-akarians-family-view.spec.ts` test tree where it covers the case; add a fixture only if no existing tree exercises the bug

## critical files

- `apps/web/src/lib/components/tree/FamilyViewCanvas.svelte` - props, window-handle wiring, overlay mount (1056-line file; current debug surface is zero, see lines 51-155 props block and 199 engine instantiation)
- `apps/web/src/lib/components/tree/FamilyViewDebugOverlay.svelte` - new file, structurally mirrors `DebugOverlay.svelte` but with family-view's geometry primitives
- `apps/web/src/lib/components/tree/debugTypes.ts` - extend with `FamilyViewDebugLayerOptions`, keep existing `DebugLayerOptions` untouched
- `apps/web/src/App.svelte` - family-view section in the debug panel; conditional on `selectedEngine`; lines around 1920-2104 host the existing panel
- `apps/web/src/lib/layout/engines/family-view/layout.ts` - read-only, source of `FamilyViewLayout`, `FamilyViewNode[]`, `FamilyViewEdge[]`
- `apps/web/src/lib/layout/engines/family-view/subset.ts` - read-only, source of subset coverage info for phase 1
- `apps/web/src/lib/layout/engines/family-view/nPartnerGeometry.ts` - read-only, source of bus geometry for phase 2
- `apps/web/src/lib/domain/consanguinity.ts` - read-only, source of coi breakdown for phase 4
- `apps/web/tests/e2e/family-view-debug.spec.ts` - new in phase 0, extended in phase 5

## notes / followups

- bug fixes themselves (issues 1-4) are tracked in `notes/bugs.md`; this plan only delivers the diagnostics
- if the coi breakdown surfaces a real precision issue, file it as a separate bug; do not fix it in this plan
- consider promoting `window.__treeDebug` to a typed singleton in a future cleanup (out-of-scope here)
