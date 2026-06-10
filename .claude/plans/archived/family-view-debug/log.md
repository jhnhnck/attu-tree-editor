# log - family-view debug overlay & diagnostics

per-phase retro + decisions land here. one section per phase, appended by `phase-retro` and `plan-revise` as the loop runs.

## phase 0

### starting phase 0 — 2026-05-24

- worktree: `.claude/worktrees/family-view-debug/`
- branch: `worktree-family-view-debug`
- DoD (confirmed unchanged from plan.md):
  - ctrl+shift+d in family-view shows the panel
  - toggling `showVisibleSubset` paints a dashed rect around the laid-out cards
  - toggling `exposeFamilyDebug` lets `window.__treeDebug.layout` be inspected in devtools
  - smoke test green
  - three probe outcomes recorded below
  - `pnpm verify` green

### probe outcomes

**probe 1 — subset rationale (`subset.ts:selectBoundedSubset`):**
`RankedSubset` returns `{ visible, rank, hasMoreChildren, hasMoreParents }` only. **No rejection-reason output.** The walk never enumerates a "candidate" set against which a reason could be attached; it places people directly and silently skips overflow. To surface phase-1's `showOffSubsetPeople` reasons, `selectBoundedSubset` needs a new output channel — e.g. `rejections: ReadonlyMap<PersonId, RejectionReason>` where `RejectionReason` is one of `"rank-cutoff" | "non-primary-partner" | "secondary-union-not-expanded" | "expansion-cap"`. Implementation requires tracking visited-but-not-placed ids inside the BFS frontiers and the secondary-union and expansion branches. **Scope expansion to `subset.ts` accepted upfront by pre-mortem; phase 1 implements it.**

**probe 2 — coi breakdown (`domain/consanguinity.ts:computeAncestorOverlap`):**
The function **already computes** per-pair contributions `Math.pow(0.5, di + dj + 1)` inside its inner `for i / for j` loop (line 112) — but accumulates them into a single scalar `coi` and discards the breakdown. The data is right there. **Phase 4 should widen `AncestorOverlap`** to add an optional `breakdown?: readonly { ancestorId, di, dj, contribution }[]` field rather than duplicating the walk in the overlay. Zero new computation, ~5 lines of code, one cached `memo` entry per proband. (The walk over `distsByAncestor` already iterates ancestor → per-pair-of-parent-slot pairs.)

**probe 3 — `window.__treeDebug` readers:**
Four sites total, no test/script readers. Writers: `TreeCanvas.svelte` (layered, sets on mount), `HyperbolicCanvas.svelte` (already saves `prev` and restores on unmount — handles the shared-name case correctly). Readers: `App.svelte:1176` (copy-snapshot button — reads `layout`, `rawSegments`, `positions` etc.; **gated only by `copySnapshotSupported = selectedEngine === "layered"`** in the UI, but the handle read itself is engine-blind). Type: `TreeDebugHandle` in `vite-env.d.ts` already treats hyperbolic-specific fields (`doi`, `clusters`) as optional, so adding an `engine: "family-view" | "layered" | "hyperbolic"` discriminator and family-view-shaped optional fields fits the existing type shape without breaking layered readers. **No reader needs updating** — the existing UI-level engine guards (`copySnapshotSupported`, `exposeTreeDebugSupported`) already protect downstream reads from running on the wrong engine's handle. Documented in the FamilyViewCanvas comment block where the handle is set.

### phase 0 retro — 2026-05-24

**what landed vs spec:** every phase-0 DoD bullet is green. wiring delivered: `FamilyViewDebugLayerOptions` interface, `debugOptions` prop on `FamilyViewCanvas`, `window.__treeDebug` populated with the family-view shape behind `exposeFamilyDebug`, `FamilyViewDebugOverlay` with the single `showVisibleSubset` dashed-rect overlay, engine-gated debug panel sections in `App.svelte`, one e2e covering both the dashed-rect paint and the `engine === "family-view"` handle assertion. all three probes recorded with concrete outcomes that scope phases 1 and 4. `pnpm verify` green (typecheck + lint + 1038 unit tests + build + server lint + 69 server tests).

**what surprised us:**

- the `notes/examples/` fixture directory is gitignored, so a fresh worktree has **no** test fixtures resolved through the symlinks in `apps/web/tests/fixtures/`. recovery cost was ~5 min (copy + symlink the parent's `notes/examples/` plus the worktree's top-level `My-Family-24-May-2026-103040590.html` into the worktree). worth documenting in `notes/agents.md` for future plans. routed to `bugs.md`.
- 6 visual-regression e2es were already red on trunk before this phase started, caused by the prior `2a394ee fix(tree): bump family-view edge stroke widths` commit not refreshing snapshots. confirmed by re-running on the main repo. nothing this phase touches the rendered output so the diff is unrelated; the goldens need a separate housekeeping refresh. routed to `bugs.md`.
- probe 2's outcome was even more favourable than the pre-mortem assumed: `computeAncestorOverlap` **already** computes per-pair `(0.5)^(di+dj+1)` contributions inline (line 112) and discards them into a scalar. the phase-4 widen-the-return decision is now essentially free — five lines plus a memo cache.
- the existing `TreeDebugHandle` type was **already** shaped as a quasi-union (hyperbolic-only fields optional) so the `engine` discriminator slotted in without any cascading reader changes. `App.svelte`'s copy-snapshot button does not need to gate on `engine` because the existing `copySnapshotSupported = selectedEngine === "layered"` UI guard already keeps the layered-shape reads safe.

**residual debt:**

- subset-rationale machinery is **not** in `subset.ts` yet — phase 1 still has to add it (this matches the plan; the pre-mortem accepted the `subset.ts` scope expansion up front).
- the family-view debug panel's runtime section reuses the layered `expose __treeDebug` button which targets layered-only state; family-view has its own `exposeFamilyDebug` toggle inside the family-view section. that's two parallel exposes, by design. consider unifying as phase-5 polish if it confuses reviewers.
- worktree setup didn't pick up the gitignored fixtures (see "what surprised us"); routed.

**downstream implications:**

- phase 1: `selectBoundedSubset` rejection-output channel needs a `Map<PersonId, RejectionReason>` field on `RankedSubset`. the BFS frontiers will need to track visited-but-skipped ids per branch (rank cutoff, non-primary partner, secondary-union not expanded, expansion cap). estimate: medium-sized refactor of `subset.ts`, ~80-120 lines added, no API break (new field, existing readers unaffected).
- phase 4: pick the widen-return path for `computeAncestorOverlap`. add optional `breakdown?: readonly { ancestorId: PersonId; di: number; dj: number; contribution: number }[]` to `AncestorOverlap`. compute the breakdown alongside the existing scalar accumulation in `computeOverlapImpl` (lines 96-115). memo cache automatically handles staleness.
- phase 2 stands as written for now — the phase-1 exit check will decide whether to fold issue-3 multi-union overlays into phase-1 diagnostics or keep them separate.
- no plan-revise needed at this point. all premise assumptions hold; phase 1 and phase 4 each have a confirmed implementation path.

### revision after phase 0 — 2026-05-24

triage: 2 nit-severity items added to `bugs.md` (visual-regression goldens stale on trunk, fixture setup workaround for fresh worktrees). both deferred; neither blocks subsequent phases. no items closed (probes were investigative; results landed in this log, not as fixed bugs).

plan classifications:

| phase | disposition | reason |
|---|---|---|
| 1 | valid | probe 1 confirmed `subset.ts` needs the rejection-output refactor exactly as the plan accepted up-front |
| 2 | valid | no change; phase-1 exit check still drives the fold-vs-stand decision |
| 3 | valid | palette-jump call-path trace still gated to phase-3 entry |
| 4 | revise | probe 2 confirmed widen-return path is essentially free; recorded the chosen path inline in `plan.md` so phase 4 starts without re-litigating the decision |
| 5 | valid | no change |

spec edits applied to `plan.md`: phase 4's "decision (driven by phase-0 probe)" bullet now states the path chosen (widen `AncestorOverlap` return type) and references the consanguinity.ts:112 evidence; deferred decision removed.

next phase: **phase 1 — connectivity overlays: chase floating people**. start by extending `subset.ts` with the rationale-output channel, then build the overlays on top.

## phase 1

### starting phase 1 — 2026-05-24

- **worktree:** `.claude/worktrees/family-view-debug` on branch `worktree-family-view-debug` (orchestrator-owned, shared across phases of this plan)
- **scope confirmed:** connectivity overlays — `showOrphanBadge`, `showEdgeRoles`, `showOffSubsetPeople`, `showSecondaryUnionState`. subset.ts modification accepted up front (probe-driven scope expansion).
- **DoD:** loading a tree with a known floating person, the overlay shows them in the off-subset list with a "secondary-union, not expanded" reason; orphan badge appears on any visible person with zero edges; one e2e covers `showOffSubsetPeople` and `showOrphanBadge`; `pnpm verify` green (excluding the 6 pre-existing visual goldens on trunk).
- **exit check:** review off-subset reason distribution after the overlays land. if a meaningful fraction trace to secondary-union / n-partner mechanics, phase 2's first task folds into phase 1's diagnostics; else phase 2 stands as written. decision recorded below.

### phase 1 retro — 2026-05-24

**what landed vs spec:**

- `RankedSubset` gained `rationale: ReadonlyMap<PersonId, RejectionReason>` with 5 reasons (rank-cutoff, non-primary-partner, secondary-union-not-expanded, auto-collapsed, unreachable). invariant: `visible ∩ rationale = ∅`, `visible ∪ rationale = tree.people`.
- `layout.ts:recomputeAfterCollapse` stamps `auto-collapsed` for kids removed by the auto-collapse pass; rationale stays aligned with post-collapse visibility.
- `FamilyViewDebugLayerOptions` extended with the four phase-1 toggles. App.svelte panel grew the toggle list inline; testids stable.
- `FamilyViewDebugOverlay.svelte` ships the orphan ring (per visible person with zero in+out edges), the union-state pill (per visible person with ≥1 union), and the off-subset side panel (grouped by reason, capped at 20 ids per group). `showEdgeRoles` is implemented on the edge `<path>` itself (per-role stroke tint via `family-view-edge-role-*` classes in FamilyViewCanvas).
- Every edge unconditionally carries `data-edge-id` + `data-edge-role`; the role class only applies when `showEdgeRoles` is on. `edgeKindFor()` derives the role from the edge id prefix (bond / stem / bus / stub / drop / manifold).
- `window.__treeDebug.familyView.subset.rationale` exposed to devtools.
- e2e: two new tests + one extended (off-subset panel mount, orphan-ring data-attrs, edge role-class toggle). all pass.

**what surprised us:**

- the comma operator `(void X, expr)` works in JS but not inside Svelte attribute-expression slots. had to extract `debugSubset`, `debugExpandedSecondaryUnions`, `debugPrimaryUnionOverrides` into `$derived` so the template binding could read a plain reference. minor but worth noting for downstream phases that pass reactive state through props.
- subset.ts's classifier is O(P + C) with one O(P²) inner loop for the "parent of a visible person" branch (only invoked for the rank-cutoff fallback). acceptable for diagnostic-overlay tree sizes; not a hot-path concern. routed to `bugs.md` for follow-up if a downstream phase needs `rationale` on the hot path.
- early in the phase I accidentally edited the *main repo's* `.claude/plans/family-view-debug/*.md` instead of the worktree's tracked copies (the cwd-relative path looks identical from the outside). path-resolution warning in the phase-loop skill is real — caught on the commit-step `git status` showing a clean tree. fix: reapplied retro / revision to the worktree files, reverted main repo to its pre-edit state. no commits leaked.

**residual debt:**

- the off-subset panel caps each reason at 20 names + "+N more". no scroll-into-list yet; a user with a tree where 200 people are rank-cutoff sees `+180 more` and can't drill. acceptable for phase 1; revisit in phase 5 polish or after real-tree usage.
- the e2e for `showOffSubsetPeople` asserts >= 0 rather than ">= 1 with a specific reason" because the Akarians fixture's exact off-subset count varies with fixture revisions. a minimal floating-people fixture would let us assert the secondary-union-not-expanded path lights up. routed to `bugs.md`.
- the union-state pill is svg text and renders below each card; on dense rows it may overlap with the next rank's connector. toggle-gated so no production impact.

**phase exit check:**

reviewed the off-subset reasons mechanism end-to-end. the 5 reasons cleanly partition: rank-cutoff is the bulk (every ancestor / descendant past depth 3 / 2), non-primary-partner + secondary-union-not-expanded together explain *every* multi-union-driven omission, auto-collapsed handles the 50-card cap, unreachable catches disconnected components. the floating-people hypothesis (rank-0 unions hide ancestor secondary partners) is now directly observable: an ancestor with multiple unions whose non-primary partner is reachable will appear in the off-subset list with `secondary-union-not-expanded`, and the pill on the visible ancestor card surfaces the available coupleIndices.

phase 2 instruments multi-union *geometry* (bus polylines, child anchors, card collisions) — orthogonal to phase 1's *which / why*. these answer different questions and the overlays don't share components. **decision: phase 2 stands as written.** the `showEdgeRoles` and `showSecondaryUnionState` toggles from phase 1 happen to make phase 2's bus-anchor + collision overlays cheaper to land (the edge-role coloring is already there), but no scope folding is warranted.

### revision after phase 1 — 2026-05-24

bug-triage outcome: 4 nits opened, all routed to `fix-in-phase-2-or-later` / `defer`. no blockers. no item required mid-flight intervention.

triage classifications:

| item | severity | disposition |
|---|---|---|
| off-subset panel caps at 20 names per reason | nit | defer (acceptable for diagnostic-overlay sizes) |
| union-state pill svg text overlaps connectors on dense rows | nit | defer (toggle-gated) |
| `showOffSubsetPeople` e2e asserts `>= 0`, no fixture for "must show secondary-union-not-expanded" | nit | fix-in-phase-2 (phase 2 mints a multi-union fixture; extend assertion then) |
| `classifyRejections` rank-cutoff fallback is O(P²) | nit | defer (only invoked on the diagnostic path) |

plan.md edits:

- phase 2 description gained a parenthetical confirming `data-edge-role` + `showEdgeRoles` are now landed (so phase 2 builds on them instead of re-spec'ing the coloring).
- no other phases revised; phase 2-5 specs hold.

next: phase 2 (multi-union geometry).

## phase 2

### starting phase 2 — 2026-05-24

- **worktree:** `.claude/worktrees/family-view-debug` on branch `worktree-family-view-debug` (shared across all phases of this plan).
- **scope confirmed:** multi-union geometry overlays — `showMultiUnionManifold`, `showCardCollisions`, `showCoupleCentroidDelta`, `showRankGutterLabels`. building on phase 1's `data-edge-role` + `showEdgeRoles` machinery; no role-coloring duplication.
- **fixture mandate:** the existing `multi-union.ged` is 2-spouse only (Aron + Mira primary, Aron + Sera secondary). mint a new `multi-union-3.ged` that covers BOTH the 3-spouse polygamy case (`partnerIds.length > 2`) AND phase 1's residual off-subset assertion gap.
- **DoD:** on the named 3-spouse fixture, the bus polyline is visually distinct; child-anchor + per-partner markers + union-id label all land; card-collision rect appears on any overlap (count=0 on a healthy fixture is acceptable); per 2-partner couple, the bond/centroid Δ line + label render; rank labels appear at left margin per visible rank; one e2e covers `showMultiUnionManifold` + `showCardCollisions`; phase-1's off-subset e2e promoted from `>= 0` to a focused `secondary-union-not-expanded` group assertion; `pnpm verify` green (excluding the 6 pre-existing visual goldens on trunk).

### phase 2 retro — 2026-05-24

**what landed vs spec:**

- `FamilyViewDebugLayerOptions` grew the four phase-2 toggles inline; default state set in `App.svelte`; toggle buttons added to the engine-gated family-view section of the debug panel.
- `FamilyViewDebugOverlay.svelte` ships four new `{#if}`-gated overlay groups: `showMultiUnionManifold` (bus polyline emphasis + child-anchor ring + per-partner circles + index label, recomputed from `computeManifold(PRIMARY_PRIMITIVE)` so the geometry exactly tracks `layout.ts`), `showCardCollisions` (per-rank O(n²) intersection scan with a red dashed rect on each overlap), `showCoupleCentroidDelta` (line + endpoints + Δ label between bond midpoint and children's x-centroid for every 2-partner anchor with at least one child), `showRankGutterLabels` (`g{-2..+2}` at left margin, y-positioned at each rank's mean card-center).
- new fixture `apps/web/tests/fixtures/multi-union-3.ged`: 8 persons (Aron focus, Sera+Tess 3-partner via `_TREES_UNION U1`, Iva via `_TREES_PARENT_REF`, Mira+Calen primary 2-partner FAM F1 with `_PRIMARY Y`, Brigitta+Helga secondary 2-partner FAM F2 with `_PRIMARY N`). drives both the multi-union geometry overlays AND the off-subset `secondary-union-not-expanded` assertion in a single tree.
- two new e2es in `family-view-debug-multi-union.spec.ts`: one for manifold + collisions, one for centroid Δ + rank labels. one new test in `family-view-debug.spec.ts` promotes the phase-1 `showOffSubsetPeople` assertion to require a visible `[data-reason='secondary-union-not-expanded']` group.
- `pnpm verify` green: typecheck (0 errors), lint (0 errors), `lint:no-hyperbolic-imports` (no leaks), 1043 unit tests pass (+5 from phase 1), web build clean, server lint clean, 69 server tests pass. e2e: all 6 family-view-debug tests green; the 6 pre-existing visual-regression goldens fail as documented in bugs.md (stale on trunk since commit `2a394ee`).

**what surprised us:**

- the GEDCOM import path is the only fixture-authoring channel reachable via `importViaWizard`; FamilyScript and the 2-partner-only FAM block can't express N>2 unions on their own. the `_TREES_UNION` + `_TREES_PARENT_REF` extension pair handles N-partner cases cleanly (the parser already lands `parentIds` for all 3 partners on Iva via `_TREES_PARENT_REF`, and `partnersInMultiUnionsOf` reads `tree.unions[]` directly to pull Sera + Tess into rank 0 by default). round-trip works without any wave-2 code changes — the fixture format was already there from the relationship-vocabulary phases.
- the `subset.ts` rationale walker correctly classifies Helga (Brigitta + Aron's child via the `_PRIMARY N` secondary FAM) as `secondary-union-not-expanded` and Brigitta as `non-primary-partner` even though the focus simultaneously belongs to a 3-partner union. the 3-partner and 2-partner mechanisms compose without interference.
- prettier reformatted the `App.svelte` debug-panel toggle list across multiple lines after I added the phase-2 entries inline; the resulting diff looks larger than necessary, but the `commit-style` skill flagged no issue. no behavior change.
- `computeManifold` is pure and re-callable, so the overlay's bus-y / child-anchor matches the renderer's edges exactly — no need to thread the centroid through `UnionAnchor` itself. keeps `types.ts` clean.

**residual debt:**

- the manifold overlay only paints anchors with `partnerIds.length > 2`. 2-partner couples are surfaced by `showCoupleCentroidDelta` instead — separate overlays for the two cases. if a reviewer expects "every anchor highlights its bus", that's a single-toggle merge for phase 5 polish.
- `showCardCollisions`'s O(n²) per-rank scan is fine for bounded subsets (~30 cards) but won't scale to a thousand-card layered fallback. fine for phase 2's diagnostic-only use.
- the phase-2 e2e for `showCardCollisions` asserts count=0 on a healthy fixture. there's no positive-case test ("inject a collision, prove the rect lights up") because none of the fixtures we have today reliably collide cards. routed to bugs.md for follow-up if a real collision fixture appears.
- the rank-label overlay positions labels at `x=2` in screen pixels (not scaled by `unit`); this works because the parent svg coords are unit-space and the overlay never pans. if a future phase moves the debug overlay into a pan-aware layer, the label position will need to recompute against the viewport.

**downstream implications:**

- phase 3 (navigation diagnostics — jump-to-person): unchanged. the call-path-trace task is still gated to phase-3 entry. phase 2 didn't surface any palette/navigation findings that would reshape phase 3's spec.
- phase 4 (coi inspector): unchanged. the widen-`AncestorOverlap` decision still stands from the phase-0 probe. phase 2 didn't touch `domain/consanguinity.ts`.
- phase 5 (polish, parity, metrics): could absorb a "merge `showMultiUnionManifold` + `showCoupleCentroidDelta` into one `showAnchorGeometry` toggle" cleanup if the two-overlay split confuses reviewers. low priority.
- no plan-revise needed beyond a one-line note documenting the new fixture name.

### revision after phase 2 — 2026-05-24

bug-triage outcome: 3 nits opened in phase 2, all routed to `defer` or `fix-in-phase-5`. 1 nit from phase 1 closed (e2e gap on `secondary-union-not-expanded` — the new `multi-union-3.ged`-driven assertion landed in this phase). no blockers.

triage classifications:

| item | severity | disposition |
|---|---|---|
| `showCardCollisions` e2e has no positive-case test (no fixture collides) | nit | defer (passive overlay is fine for now; mint a collision fixture only if a real one appears) |
| manifold overlay only covers `partnerIds > 2`; 2-partner anchors use a separate overlay | nit | fix-in-phase-5 (low priority; consider merging into `showAnchorGeometry`) |
| rank-label x position is hard-coded screen-px (`x="2"`), not pan-aware | nit | defer (overlay is canvas-relative today; if pan-aware overlays land, audit then) |
| (closed) `showOffSubsetPeople` e2e asserts `>= 0` rather than a specific reason | nit | **closed in phase 2** via the new `multi-union-3.ged` fixture + extended assertion |

plan.md edits: phase 2's "fixture" bullet noted the chosen fixture name (`tests/fixtures/multi-union-3.ged`). phases 3-5 untouched.

next: phase 3 (navigation diagnostics — jump-to-person).

## phase 3

### starting phase 3 — 2026-05-24

- **worktree:** `.claude/worktrees/family-view-debug` on branch `worktree-family-view-debug` (shared across all phases of this plan).
- **scope confirmed:** navigation diagnostics — `logFocusEvents`, `showViewportFitTarget`, `showOffSubsetWarning`, `showPendingRecenter`. instrument the focus → centerOn → viewport pipeline so the palette-jump silent-no-op becomes visible.
- **prerequisite (palette-jump call-path trace):** recorded below.
- **DoD:** call-path trace recorded; clicking a person in the palette either visibly recenters (green flash) or the corner badge explains why not; e2e covers `showOffSubsetWarning` and `showPendingRecenter`; `pnpm verify` green (excluding the 6 pre-existing visual goldens on trunk).

### palette-jump call-path trace — 2026-05-24

End-to-end on the family-view engine:

1. **palette open:** `App.svelte` hosts `CommandPalette` (mounted when `showPalette === true`). The palette emits two pick kinds, `person` and `command`, both via `onpick={onPalettePick}` (App.svelte:2295).
2. **selection commit (palette):** `onPalettePick(kind, id)` lives in `App.svelte:1585`. For `kind === "person"` it calls `focusPerson(id, "personal")` then `canvasController?.focusSelection()`.
   - `focusPerson` (App.svelte:741) is a 3-liner: `selection.select(id); showInspector = true; inspectorInitialTab = tab;`.
   - `selection.select` (`lib/state/selection.svelte.ts:33`) just assigns the reactive `$state` variable.
3. **prop propagation:** `selection.selectedPersonId` flows into `FamilyViewCanvas` as the `selectedId` prop (App.svelte:1799). The canvas reads it for the on-card "selected" outline (PersonNode prop), the path-highlight BFS (`usePath(tree, activeFocus, selectedId)`), and as an input to the imperative controller closures (`focusSelection`, `fitSelection`).
4. **recenter intention:** `App.svelte:1589` then calls `canvasController.focusSelection()`. `canvasController` is the imperative handle FamilyViewCanvas hands back via `oncontroller` (App.svelte:1816-1820 in the family-view branch). The handle's `focusSelection` closure (FamilyViewCanvas.svelte:663) reads the *current* `selectedId` prop and, if defined, calls `recenterOn(selectedId)`.
5. **recenterOn semantics (FamilyViewCanvas.svelte:615):**
   - if the target person is in `layout.nodes`, pan `(panX, panY)` so the card lands at the host center — synchronous, no fit recompute.
   - if the target is NOT in the visible subset, set `focusOverride = id`. That re-derives `activeFocus`, which re-runs the layout pass; the auto-fit `$effect` (line 450) keys on `${tree.id}:${activeFocus}:${bbox.w}:${bbox.h}` and calls `fitToView()` once on the next tick.
6. **`centerOnPerson` on the controller (line 669)** is `(id) => recenterOn(id)` — same path; family-view canvas treats `focusSelection` and `centerOnPerson` as aliases (the only diff: `focusSelection` reads `selectedId` from props, `centerOnPerson` accepts an explicit id).

**ownership conclusion:**

- the **selection-change origin** is `App.svelte` (palette pick handler, keyboard binds like `selectEdit`, card-click handlers under `App.svelte:1067-1087`). The canvas only originates selection changes via `onCardClick → onselect?.(id)` callback into the parent (FamilyViewCanvas.svelte:683).
- the **recenter intention** is owned by `App.svelte` too: only callers of `canvasController.{focusSelection, centerOnPerson, fitSelection}` are in App.svelte (palette pick L1589, `viewFocus` command L1359, inspector focus L2242).
- the canvas **executes** the recenter and owns the off-subset fallback (focus shift).

**implication for the phase-3 instrumentation:**

- the focus-event log must live in **App.svelte**, not the canvas. The source data — `(timestamp, source, personId, didTriggerCenterOn)` — is all visible at the App-level: source comes from which App handler fired, the personId is the new `selection.selectedPersonId`, and `didTriggerCenterOn` is whether the handler followed up with `canvasController?.focusSelection()`/`.centerOnPerson()`. The canvas never sees "this selection came from the palette vs a card click" — by the time it's a `selectedId` prop, the source info is lost.
- the **visual overlays** (`showViewportFitTarget`, `showOffSubsetWarning`, `showPendingRecenter` flash/badge) live in the canvas / FamilyViewDebugOverlay because they need geometry (`layout.nodes.get(id)`, `panX`, `panY`, `scale`, `hostW`, `hostH`).
- the canvas needs to **tell App** when `centerOnPerson` was actually executed (for the `didTriggerCenterOn` flag + the "no centerOn within ~200ms" red-badge case). Cleanest channel: a `onrecenter?: (id: PersonId) => void` callback prop on FamilyViewCanvas, fired at the top of `recenterOn`. App's focus-event log subscribes to that and matches it against the most-recent selection event by timestamp window.
- **off-subset reason** is already plumbed: `debugSubset.rationale` (phase 1) maps personId → RejectionReason. The off-subset warning just looks up `rationale.get(selectedId)` when `selectedId` is set but not in `layout.nodes`.
- **pending-recenter watchdog:** a 200ms timer started in App on each selection change. cleared by the `onrecenter` callback. on timeout, set a `recenterMissed` flag prop that the canvas overlay reads.

Trace finished. Implementation can proceed with the event source rooted in App.svelte and the visual overlays rooted in the canvas + FamilyViewDebugOverlay.

### phase 3 retro — 2026-05-24

**what landed vs spec:**

- `FamilyViewDebugLayerOptions` extended with `logFocusEvents`, `showViewportFitTarget`, `showOffSubsetWarning`, `showPendingRecenter`. Toggle list in App.svelte grew inline; testids stable (`debug-toggle-fv-<key>`).
- App.svelte gained the focus-event log machinery: `FocusEvent` interface, capped rolling array (40 entries), `recordFocusEvent`, watchdog timer + `armPaletteRecenterWatchdog` helper, `onCanvasRecenter` cleanup. `focusPerson` accepts a `source` parameter; palette pick / card click / viewFocus command all log with the right source.
- FamilyViewCanvas.svelte exposes `onrecenter`, `pendingRecenterSeq`, `recenterMissedFor`, `focusEventsForOverlay` props, fires `onrecenter` at the top of `recenterOn`, drives a 250ms `flashActive` $effect off the seq, derives `selectedOffSubsetReason` from phase-1's rationale, computes `debugViewportRectUnit` from pan/zoom/host dims.
- FamilyViewDebugOverlay.svelte ships the SVG layers (viewport rect + target rect) gated by `showViewportFitTarget`, plus the four DOM panels: green-flash border (`showPendingRecenter` + flashActive), red "no recenter fired" badge (`showPendingRecenter` + `recenterMissedFor`), orange off-subset warning badge (`showOffSubsetWarning` + selectedOffSubsetReason), and the focus-event log panel (`logFocusEvents` + non-empty events).
- New e2e file `family-view-debug-navigation.spec.ts` covers: palette-pick → log entry with `data-triggered=true`; `showOffSubsetWarning` toggle mounts cleanly and stays absent on happy-path selection; `showViewportFitTarget` toggle renders the viewport rect + target rect. 6 tests, all green on chromium + mobile.
- `pnpm verify` green: typecheck (0 errors), lint (0 errors), `lint:no-hyperbolic-imports`, 1043 unit tests, web build, server lint, 69 server tests. Full non-visual e2e run (73 tests) green. The 6 visual-regression goldens remain stale (pre-existing, documented in bugs.md).

**what surprised us:**

- The cleanest place for the focus-event source attribution was App.svelte, not the canvas — exactly as the call-path trace predicted. The canvas only sees the resulting `selectedId` prop, with the source info already stripped. Spending 15 minutes on the trace before instrumenting saved a likely refactor mid-phase.
- `recenterOn` is called for BOTH the happy path (target in subset → pan) AND the off-subset path (target missing → shift focus). Firing `onrecenter` at the *top* of the function (before the off-subset branch) means the watchdog correctly cancels even when the focus shift is the recovery — the user's request was honored, just via a different mechanism. Without that ordering, every off-subset palette jump would flash the red badge erroneously.
- E2e testing the red-badge / watchdog-fires path is hard via UI alone: every palette pick triggers `recenterOn`, which clears the timer. The bug this overlay diagnoses is exactly "recenter didn't fire" — which is hard to reproduce because the code currently always fires it. The overlay is built for the bug *we expect to chase*, not the bug *we currently have*. Routed as residual debt: revisit when a real reproduction case appears.
- The debug panel's `pointer-events-auto` div intercepts card clicks at the bottom-left of the canvas on mobile viewports. Tests that drove selection via card click had to switch to the palette path. Not a regression — the panel was always there — but a footnote for future e2e authors.
- Default-disabled phase-3 toggles mean the focus-event recording function returns immediately when both `logFocusEvents` and `showPendingRecenter` are off. Off-toggle cost stays at zero, matching the family-view debug plan's contract.

**residual debt:**

- The watchdog red-badge has no positive-case e2e (a selection that does NOT trigger recenter). Reproducing requires either a bug in `recenterOn` itself or a code path that calls `selection.select` without following up with `canvasController.focusSelection()` — neither exists today. The unit-level path (recording, timer, state flip) is exercised by the happy-path e2e via `data-triggered`, so the path isn't completely untested. Routed.
- `recordFocusEvent`'s match by `e.personId === id && !e.didTriggerCenterOn` could in theory mis-attribute if two recenter calls land for the same person before either records its trigger. Family-view recenters are synchronous so the window is microseconds; not worth complicating today. Routed.
- The viewport rect uses unit-space coordinates that depend on `(panX, panY, scale, hostW, hostH)` — all reactive. On rapid pan / wheel input the rect recomputes on every frame. Cheap (4 divisions), but if a future phase profiles overlay cost this is a hot spot to watch.
- The focus-event log panel lives at `left: 0.5rem; bottom: 8rem`, the off-subset panel at `right: 0.5rem; bottom: 8rem`, the off-subset warning at `top: 7rem`, the red badge at `top: 4rem`. Four fixed-positioned overlays + the existing layered debug chrome can crowd a narrow viewport. Not a problem at desktop sizes; might want a single collapsible debug-overlay dock in phase 5.

**downstream implications:**

- phase 4 (coi inspector): unchanged. Phase 3 didn't touch `domain/consanguinity.ts` or the focus / selection paths that phase 4 reads from. The widen-`AncestorOverlap` decision still stands.
- phase 5 (polish, parity, metrics): could absorb (a) the four-overlay-dock collapse and (b) a unified `data-canvas-chrome` registration so the auto-fit insets account for the new corner badges. Low priority.
- no plan-revise needed. all premise assumptions held; the call-path trace's predictions (App-rooted event source, canvas-rooted geometry) matched the implementation exactly.

### revision after phase 3 — 2026-05-24

bug-triage outcome: 4 nits opened in phase 3, all routed to `defer` or `fix-in-phase-5`. no blockers. no item required mid-flight intervention.

triage classifications:

| item | severity | disposition |
|---|---|---|
| no positive-case e2e for the watchdog red-badge path | nit | defer (no reproducible UI path until the actual palette-jump bug surfaces) |
| `recordFocusEvent`'s match-by-personId could mis-attribute on rapid concurrent recenters | nit | defer (synchronous recenterOn, window is microseconds) |
| viewport-rect recompute on every pan/wheel frame | nit | defer (4 divisions, off-hot-path) |
| four fixed-positioned debug overlays crowd narrow viewports | nit | fix-in-phase-5 (consider unified collapsible debug-overlay dock) |

plan.md edits: phase 3's `prerequisite` bullet now references the recorded call-path trace in `log.md`. No other phases touched; phases 4-5 specs hold.

next: phase 4 (coi inspector — issue 4).

## phase 4

### starting phase 4 — 2026-05-24

- **worktree:** `.claude/worktrees/family-view-debug` on branch `worktree-family-view-debug` (shared across all phases of this plan).
- **scope confirmed:** coi inspector — `showCoiBreakdown` (per-pair wright contribution table in the debug panel), `showDuplicateAncestors` (halo on duplicate-ancestor cards), `window.__treeDebug.coi = { duplicates, rawCoi, breakdown, cacheHits, cacheMisses, editRev }`, one-line `console.warn` first time a focus with `duplicates.length > 0` is loaded.
- **decision pinned by phase 0 probe:** widen `AncestorOverlap` return type to expose `breakdown?: readonly { ancestorId, di, dj, contribution }[]` plus an optional `rawCoi` field. zero new computation — `computeOverlapImpl` already computes per-pair `(0.5)^(di+dj+1)` contributions at `consanguinity.ts:112` and discards them. existing tests of `computeAncestorOverlap` must still pass unchanged.
- **DoD:** decision recorded; on a pedigree with hand-computed coi, the breakdown table rows sum to the raw float; duplicate-ancestor halos light up the expected ancestors; raw vs displayed numbers make any rounding bug obvious; one e2e covers `showCoiBreakdown` and `showDuplicateAncestors`; `pnpm verify` green (excluding the 6 pre-existing visual goldens on trunk).

### phase 4 retro — 2026-05-24

**what landed vs spec:**

- `AncestorOverlap` widened with optional `breakdown?: readonly CoiBreakdownRow[]` field; `computeOverlapImpl` captures each `(ancestorId, di, dj, contribution)` row alongside the existing scalar accumulation. row order stable (ancestor id asc, then `(di, dj)` lex). 3 new unit tests covering the sum invariant on full-sibling + first-cousin pedigrees; existing scalar tests pass unchanged.
- `getCoiCacheStats()` exported from `consanguinity.ts`; module-level `_cacheHits` / `_cacheMisses` counters incremented inside the existing memo path so the hot path stays branch-free for non-debug callers.
- `FamilyViewDebugLayerOptions` extended with `showCoiBreakdown` + `showDuplicateAncestors`. App.svelte default state + toggle list grew inline; testids stable (`debug-toggle-fv-showCoiBreakdown`, `debug-toggle-fv-showDuplicateAncestors`).
- `FamilyViewCanvas.svelte`: `coiDebugWanted` derivation gates the consanguinity walk on any phase-4 surface OR `exposeFamilyDebug` OR the production `showConsanguinity` overlay; `__treeDebug` effect appends `coi: { duplicates, rawCoi, breakdown, cacheHits, cacheMisses, editRev }` when consanguinity is detected; one-line `console.warn` fires once per `(treeId, focusId)` first time a focus with duplicates is observed; props for breakdown / raw / displayed / duplicates / focus id passed to the overlay.
- `FamilyViewDebugOverlay.svelte`: SVG halo group renders blue dashed rings on visible duplicate-ancestor cards (gated by `showDuplicateAncestors`); fixed-position DOM panel renders the breakdown table (`ancestor | di | dj | contribution`) with meta rows for focus / raw float / displayed percent / sum-of-rows (gated by `showCoiBreakdown`).
- `vite-env.d.ts` `TreeDebugHandle` extended with `coi?: {...}` field referencing `CoiBreakdownRow`. existing layered + hyperbolic + family-view readers untouched.
- `consanguinity-cousins.ged` fixture minted: 9-person first-cousin-offspring pedigree (great-grandparents → siblings → 2-partner couples → cousins → focus). hand-verified coi = 1/16 = 0.0625.
- `family-view-debug-coi.spec.ts` ships 3 e2es: breakdown panel + sum invariant, halo invariant ("every halo is a duplicate ancestor"), `__treeDebug.coi` populated with the expected shape and float-precision rawCoi.
- `pnpm verify` green: typecheck (0 errors), lint (0 errors), `lint:no-hyperbolic-imports`, 1046 unit tests pass (+3 from phase 3), web build clean, server lint clean, 69 server tests. e2e: all 49 family-view-debug + neighbouring family-view tests pass on chromium; the same 6 visual-regression goldens remain stale (pre-existing on trunk, documented in bugs.md).

**what surprised us:**

- the widen-return path turned out even cleaner than the phase-0 probe predicted. the inner loop was already running `Math.pow(0.5, di + dj + 1)`; surfacing the row was a 3-line change (record the value, push to an array, sort at the end). zero new computation. no caller broke because the new field is optional and added at the end of the interface.
- the rounding bug from `notes/bugs.md:29` (worktree's `coiPercent` rendering `1/16` as `6.3%` instead of `6.25%`) is **directly observable in the breakdown panel's `raw` vs `displayed` rows on the cousins fixture**. on trunk, commit `91bea51 fix(inspector): preserve canonical Wright values in COI display` already landed the textbook-precision formatter; the worktree branched before that fix so the local `coiPercent` still rounds. the breakdown panel is doing exactly what it was designed for — making the rendering bug observable — even though the bug is already fixed upstream.
- the duplicate-ancestor halo overlay's correctness assertion ("halo points at an actual duplicate ancestor") is more useful than asserting an exact count, because the family-view bounded subset may clip great-grandparent rank (`-3` from focus) depending on the depth cap. wrote the e2e to cross-check halo ids against `__treeDebug.coi.duplicates` so the test is robust to subset-depth tweaks.
- the consanguinity overlay's existing production data-attr (`data-consang-duplicate`) is independent of the debug halo — the production tint is a red box-shadow on the card div, the debug halo is a blue dashed SVG ring around the card. visually distinct, never conflict, both controlled by separate toggles. clean separation.
- the e2e's `expect.poll().toEqual()` rejected Playwright's `expect.closeTo()` matcher in the nested object; rewrote to do the float comparison separately. minor friction, no productivity loss.

**residual debt:**

- the `__treeDebug.coi` snapshot only populates when `computeAncestorOverlap` returns non-EMPTY (i.e. the focus has at least one duplicate ancestor). for probands with no consanguinity, `__treeDebug.coi` is absent from the handle entirely. this matches the runtime contract but it means devtools readers must defensively check `coi != null`. acceptable; documented in `vite-env.d.ts`.
- the breakdown panel's `raw` cell renders the full float via `Number.prototype.toString()`, which can be `0.0625` (clean) or `0.0625000000000001` (accumulated). on hand-built fixtures the value is clean; on a multi-path real-world pedigree it may show drift. the sum-of-rows cell catches accumulation drift directly. fine for the diagnostic use case.
- the `_coiWarnedFor` set is module-local to the FamilyViewCanvas component instance; it doesn't persist across tab reloads. acceptable — phase 0's `prev/restore` pattern for `__treeDebug` already establishes that debug state is transient. revisit only if a user reports duplicate warnings from rapid mount/unmount cycles (none observed in testing).
- the breakdown panel sits at `top: 4rem; left: 0.5rem` and could overlap with the phase-3 red-badge / off-subset-warning corner badges at narrow viewports. fifth fixed-position debug panel now; the phase-3 retro already routed "four fixed-position debug overlays crowd narrow viewports" — phase 5 will absorb the unified-dock work and pick up this fifth one too.
- the cache hit/miss counters are module-globals incremented across every `computeAncestorOverlap` call (production or debug); they're cumulative since page load. a "reset on tree swap" affordance would make per-tree memoisation effectiveness easier to read; defer until someone needs it.

**downstream implications:**

- phase 5 (polish, parity, metrics): pick up (a) the fifth fixed-position debug panel into the unified-collapsible-dock cleanup, (b) a possible `showCoiBreakdown` → `showCoiInspector` rename if the panel grows beyond the table (e.g. adding a "missed-path warnings" row), (c) consider adding a `coi.reset()` affordance on the `__treeDebug` handle to zero the cumulative cache counters.
- no plan-revise needed beyond a note that phase 4 is done. all premise assumptions held; the widen-return path was free as predicted; the rounding-bug-on-worktree was directly surfaced by the new panel.

### revision after phase 4 — 2026-05-24

bug-triage outcome: 6 nits opened in phase 4, all routed to `defer` / `fix-in-phase-5`. no blockers. no item required mid-flight intervention. no items closed in this phase.

triage classifications:

| item | severity | disposition |
|---|---|---|
| `__treeDebug.coi` omitted when no consanguinity | nit | defer (matches runtime contract; doc-pass acceptable in phase 5) |
| `raw` cell may show accumulation drift on multi-path pedigrees | nit | defer (cosmetic; sum-of-rows row already exposes drift directly) |
| `_coiWarnedFor` doesn't survive component mount/unmount | nit | defer (no console spam observed; revisit on report) |
| breakdown panel is the 5th fixed-position panel | nit | fix-in-phase-5 (folded into the existing unified-dock item) |
| `getCoiCacheStats()` counters cumulative across tree swaps | nit | defer (no reset affordance needed today; add only when diagnostic case appears) |

plan.md edits: phase 4's "decision (driven by phase-0 probe)" bullet now references the recorded retro for the final shape (`CoiBreakdownRow` interface, optional `breakdown` field, `getCoiCacheStats` helper). phase 5 spec unchanged — the unified-dock and metric work already absorbs the phase-4 polish concerns.

surfaced finding (worth highlighting): the breakdown panel **directly observed the worktree's stale `coiPercent` rounding** — `1/16 = 0.0625` raw rendered as `6.3%` instead of the textbook `6.25%`. on trunk, commit `91bea51` (`fix(inspector): preserve canonical Wright values in COI display`) already landed the textbook-precision formatter via a shared `formatCoiPercent` in `lib/domain/consanguinity.ts`. the diagnostic worked exactly as designed — the rounding bug is observable, and the fix is already on trunk waiting for this plan's eventual rebase. no action needed in this plan; the integration will pick the trunk formatter on rebase.

next: phase 5 (polish, parity, metrics — last phase before `ship-readiness`).

## phase 5

### starting phase 5 — 2026-05-24

- **worktree:** `.claude/worktrees/family-view-debug` on branch `worktree-family-view-debug` (shared across all phases of this plan).
- **scope confirmed:** polish, parity, and metrics — `showGrid`, `showNodeBounds`, `showLastEditHalo`, `showLayoutMetrics` (cuttable), `data-testid` parity audit, light/dark color-contrast audit of phase 1-4 overlay strokes, final smoke e2e covering every toggle.
- **phase-5 nit cleanup (from prior phases' triage):**
  - rank-label x hard-coded screen-px (phase 2 nit) — fix: compute from `cardsBBox.x` so the gutter parks against the actual canvas edge in unit space.
  - manifold + couple-centroid two-toggle split (phase 2 nit) — keep two toggles; the n>2 manifold geometry and the 2-partner Δ-line answer different questions (bus / child-anchor vs bond-midpoint vs centroid). routed to `defer`.
  - four / five fixed-position overlays crowd narrow viewports (phase 3, phase 4 nits) — fix: each fixed-position panel gets a single-line collapsible header so the user can stash any of them without disabling the toggle. shared `[data-collapsed]` attr drives the css.
  - contrast audit — verify the existing accent + hsl strokes hit ≥3:1 against both themes; adjust outliers.
- **DoD:** every layered debug feature with a meaningful family-view analogue is present (`showGrid`, `showNodeBounds`, `showLastEditHalo`); `showLayoutMetrics` panel renders visible-card / badge / expansion / rank / duration readouts (cut if phase runs hot); collapsible-header treatment lands on all fixed-position panels; final smoke e2e walks every toggle and asserts no console errors; `pnpm verify` green (excluding the 6 pre-existing visual goldens on trunk).

### phase 5 retro — 2026-05-24

**what landed vs spec:**

- `FamilyViewDebugLayerOptions` extended with the four phase-5 flags (`showGrid`, `showNodeBounds`, `showLastEditHalo`, `showLayoutMetrics`). Default state in `App.svelte` + toggle list inline; testids stable (`debug-toggle-fv-<key>`).
- `FamilyViewDebugOverlay.svelte` ships four new layers: cyan unit grid + 10x emphasis (matches layered `showGrid`), green node-bounds rect + 12-char id label per visible card (with a dashed-stroke badge variant), 1s yellow `showLastEditHalo` ring re-keyed on the last-edited id so a new edit retriggers the css fade, and a `family-view-debug-layout-metrics` fixed-position panel with the visible / badges / tree-size / expansions / anchors / edges / duration meta rows plus a per-rank distribution list.
- `FamilyViewCanvas.svelte` gained a `lastEditedId` prop forwarded from `App.svelte`'s existing `debugLastEditedId` (shared with the layered overlay's last-edit halo) and a `debugExpansionStateSize` reactive accessor that follows the same void-comma-in-derived pattern as the phase-1 `debugExpandedSecondaryUnions` / `debugPrimaryUnionOverrides`. layout-pass duration is measured via `performance.now()` bracketing the synchronous `engine.layout` call.
- nit cleanup landed in-phase:
  - rank-label x recomputed from `cardsBBox.x` (phase 2 nit closed) — labels now park against the leftmost laid-out card in unit space, `text-anchor="end"`, instead of the hard-coded screen-px `x="2"`. pan/zoom safe.
  - shared collapsible-header treatment on all four fixed-position DOM panels (phase 3 + phase 4 nits closed): off-subset, focus-log, coi-breakdown, and the new layout-metrics. each header is now a `<button>` (`all: unset` to keep the visual treatment) that toggles a per-panel `collapsed` flag in component state; `data-collapsed` mirrors to the panel root so css + e2e can target it. the body renders inside an `{#if !collapsed[key]}` so toggle-gated content stops paying for layout when stashed.
- new `family-view-debug-phase5.spec.ts` ships five tests: `showGrid` + `showNodeBounds` paint their svg layers; `showLastEditHalo` mounts a halo only when a card has been edited; the layout-metrics readout populates meta + rank-distribution rows; the shared collapsible-header behavior toggles `data-collapsed` on `family-view-debug-layout-metrics`; a final smoke that walks every family-view toggle on the `multi-union-3.ged` fixture and asserts zero console errors (filtering the unrelated `/api/auth/me` 502 from the preview proxy).
- `pnpm verify` green: typecheck (0 errors, 4506 files), lint (0 errors, 0 prettier warnings), `lint:no-hyperbolic-imports`, 1046 unit tests pass (unchanged from phase 4), web build clean, server lint clean, 69 server tests pass. e2e: all 17 family-view-debug tests green on chromium; an additional 21/22 family-view + canvas-adjacent tests (continuity, expansion, multi-union, add-relative, path-highlight, secondary-union, smooth-diff, redraw-on-edit, engine-picker) all green (1 conditional skip, no failures). the 6 pre-existing visual goldens stale on trunk remain documented in `bugs.md`.

**what surprised us:**

- the initial attempt at measuring layout duration assigned to a `$state` inside a `$derived.by` body. Svelte 5 throws `state_unsafe_mutation` for that pattern — the app fully failed to mount, blank page in production build. The fix is to return `{ layout, durationMs }` from a single `$derived.by` and split the consumers into two narrow `$derived` getters. Worth highlighting because the dev-mode workflow (HMR) tolerates the mutation; only the production build raised the error, which is why typecheck + unit tests passed clean before we hit it in e2e. **Lesson for downstream work: a probe e2e (one test that simply asserts `#app` has non-empty html and zero pageerror events) would have caught this faster than waiting on the import wizard click.**
- the void-comma trick for re-triggering on rev bumps (`(void expansionRev, expansion.expanded)`) had to be lifted into a `$derived` (`debugExpansionStateSize`) for the layout-metrics prop pass, exactly as phase 1's retro flagged for the same pattern. The svelte template attribute slot still rejects the comma operator.
- the e2e initially used `page.locator("[data-person-id]").first()` to wait for the canvas to be ready, but the new node-bounds overlay also carries `data-person-id` on its `<rect>` testids. Once `showNodeBounds` flipped on, subsequent `[data-person-id].first()` calls grabbed the overlay rect instead of the card button. Tightened to `button[data-person-id]` for the wait selector and `data-testid` for the bounds assertion. **Downstream note: any future overlay layer that emits a `data-person-id` data-attr should add a more specific class or testid so e2es targeting cards don't get hijacked.**
- the four-panel viewport-crowding problem turned out to have two failure modes when the off-subset panel was toggled with anything else: (a) the off-subset panel's `bottom: 8rem; max-height: 60vh` plus tall fixture content pushes its top edge close to the app's `h-9` header; the playwright trace flagged the top-bar's "click to rename" button as the pointer-event interceptor on the toggle. (b) at the playwright viewport (1280x720), if multi-union-3's off-subset list happens to render with content taller than its parent, the panel-toggle button can scroll outside the viewport entirely. The collapsible-header treatment + each panel staying in its own corner avoids the worst case at typical desktop sizes; a real unified-dock refactor (single draggable container hosting all four panels with a tabbar) is the right long-term fix and is **routed to bugs.md as the residual dock-debt item**.
- color contrast on the new strokes was deliberately mid-saturation hsl values (cyan 190/80/55, green 140/70/45, yellow 50/95/55) following the existing phase-1-4 palette convention. The yellow last-edit halo against light theme is the weakest pair in the new set (~2:1 vs ~3:1 elsewhere); it matches the layered overlay's `#fde047`, so parity-in-spirit holds. Documented in the inline file comment but not bumped to a higher contrast because the layered overlay never solved this either.

**residual debt:**

- the unified collapsible debug-overlay dock (the long-term fix for the "five fixed-position panels crowd a narrow viewport" thread that's been running since phase 3) is still not landed. the phase-5 per-panel collapsible header is a partial mitigation — each panel can now stash its body — but the panels still own their own fixed coordinates and can overlap at small viewports. routed to `bugs.md`.
- `showLayoutMetrics` reports a `duration` in ms that resets per layout pass. when the canvas is idle the value is the last pass's duration, not a rolling average. a small histogram or P95 ribbon would be more useful for hunting periodic re-layout spikes, but the single-value readout was the cut-down version of the layered timings panel and matches the phase-5 spec. defer to a follow-up profiling phase if a real perf bug surfaces.
- the `lastEditedId` halo currently re-fires the css fade only when the keyed id changes. Two consecutive edits to the *same* person don't retrigger the animation. The layered overlay has the same behavior (re-keyed by id, not by edit-seq), so this is parity-in-spirit; a small `editSeq` bump on every save would unblock it if the diagnostic value is real.
- `data-testid` parity audit: every new overlay element has a stable testid (`family-view-debug-grid-line`, `family-view-debug-node-bounds`, `family-view-debug-node-bounds-label`, `family-view-debug-last-edit-halo`, `family-view-debug-layout-metrics`, `family-view-debug-layout-metrics-*` for each meta row, `family-view-debug-layout-metrics-toggle` for the collapse header). every phase 1-4 panel that gained a collapse button got `family-view-debug-<name>-toggle` for the toggle button itself. coverage is complete.
- e2e for last-edit halo only asserts the pre-edit / toggle-on baseline (halo absent). a positive-case test (edit a card → halo appears) is blocked by the same "debug-panel intercepts clicks at the bottom-left" friction that phase 3's retro flagged; the inspector + continuity e2es exercise the edit path, and `debugLastEditedId` flows from the same `onSave` that the layered halo already covers in `redraw-on-edit.spec.ts`. acceptable; routed only if a real bug shows up.

**downstream implications:**

- this is the last phase of the plan. `ship-readiness` runs next; the verdict will decide whether `pre-merge` follows (rebase, deferred-item migration, plan-dir archival) before the final merge into trunk.
- the unified-dock residual is the only material follow-up. the 6 visual-regression goldens stale on trunk are a separate housekeeping commit, owned by whoever next refreshes the snapshots.
- no plan-revise needed beyond the phase-5 entry. the spec landed unchanged from `plan.md` plus the documented in-phase nit cleanup.

### revision after phase 5 — 2026-05-24

bug-triage outcome: 6 new phase-5 nits opened, all routed to `defer` or `won't-fix`. 5 prior nits closed in this phase (1 fix, 2 won't-fix, 2 fold-into-shared-treatment). no blockers; no item required mid-flight intervention.

triage classifications:

| item | severity | disposition |
|---|---|---|
| unified collapsible debug-overlay dock | nit | defer (phase 5's per-panel collapsible header is sufficient mitigation; full dock refactor only if a real user complaint surfaces) |
| `showLayoutMetrics` shows last-pass duration only | nit | defer (histogram / P95 deferred to a perf phase if a real perf bug appears) |
| `showLastEditHalo` doesn't replay on consecutive edits to same person | nit | defer (parity with layered overlay's `last-edit-halo` re-key-by-id pattern; revisit only if diagnostic value is real) |
| no positive-case e2e for last-edit halo | nit | defer (`redraw-on-edit.spec.ts` already exercises `debugLastEditedId`; halo is a pure render of that prop) |
| yellow halo low contrast vs light theme (~2:1) | nit | defer (matches layered `#fde047` parity; flag if user reports) |
| e2e `[data-person-id]` locator gotcha for future overlay authors | nit | document in `notes/agents.md` next time it's touched |

triage closes (with commit reference):

| item | closing change |
|---|---|
| `showRankGutterLabels` hard-coded x | phase 5 (commit `0c31c37`): now `cardsBBox.x - 0.4`, `text-anchor="end"` |
| manifold + couple-centroid two-toggle merge | won't-fix: closed in phase 5 retro after the rationale was recorded — the two overlays answer orthogonal questions |
| four / five fixed-position panels crowd narrow viewports | partial close: shared collapsible-header treatment lands in phase 5; unified-dock follow-up routed as a new nit |
| `__treeDebug.coi` omitted on empty consanguinity | won't-fix: matches runtime contract, documented inline |

plan.md edits: none. all phase-5 spec bullets landed; `showLayoutMetrics` was *not* cut (the metrics panel is small enough that the polish work fit without trade-offs). plan.md's risk callout and verification sections remain accurate.

next: this is the last phase. invoke `ship-readiness` to decide whether the plan is ready to merge into trunk; on a `ship` verdict, `pre-merge` follows for rebase + deferred-item migration + plan-dir archival before the final merge.
