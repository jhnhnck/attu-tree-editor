# FamilyTreeEditor bug log

*known defects with reproducible misbehavior. feature work, deployment plumbing, and "this could be nicer" items live in [to-do.md](to-do.md). see the [meta](#meta) section at the end for format.*

---

## open

### family-view

- :o: `high priority` `medium effort` family-view "also show {partner} alongside" union-picker action does nothing - picker menu in `FamilyViewCanvas.svelte:1145` calls `secondaryUnionState.expand()` via `onPickerShowAlongside()` (line 557); gated by `fte.layout.familyViewSecondaryUnion` flag (default on). picker opens but canvas doesn't change. likely either the expand store isn't reaching `planRank`, or the secondary-slot emission silently drops for the fixture shape
- :o: `high priority` `medium effort` family-view selection→focus path highlight does not paint - the `--fte-on-path-stroke-width` / `--fte-on-path-ring-color` tokens + `.family-view-onpath-edge` selector shipped 23 May 2026 (see fixed section) but on current trunk the highlight is invisible. likely a regression in the family-view edge classname pipeline or a specificity loss. verify View > Overlays > Path highlight is on, then inspect computed styles on a selected card's edges
- :o: `medium priority` `medium effort` family-view `+` expand-subtree action auto-refits viewport, losing the user's zoom/pan - expected: extend canvas content, let new branches overflow off-screen, keep zoom stable. fix in the expand handler's post-layout step (`FamilyViewCanvas.svelte:530`) - skip the auto-fit when expansion is user-driven mid-session
- :o: `medium priority` `low effort` family-view "N people" stats pill mounts in the wrong corner - layered engine renders the stats pill into the bottom-left `data-canvas-chrome` bar alongside the debug + save-status pills (24 May 2026 unification); under family-view it lands elsewhere (floating / top-right) so the three ambient-status pills no longer group together and fit-to-window chrome insets are off by the pill's footprint. fix in `App.svelte` so the family-view stats pill mounts into the same bottom-left bar as the layered one.
- :o: `medium priority` `medium effort` family-view path-highlight spills into the selected spouse's *other* unions - selecting a person highlights edges along the focus→target path correctly, but when the target is a spouse with additional partners, those other unions also light up. expected: highlight stops at the selected spouse; their other-partner unions remain unhighlighted. trace the family-view edge classification feeding `.family-view-onpath-edge` - likely a one-hop overshoot in the union walk.
- :o: `medium priority` `low effort` family-view e2e tests on mobile viewport (Pixel 7) are flaky - inspector overlay intercepts canvas pointer events. 4 confirmed signatures (selection-survives-engine-swap, edit-visible-after-switch, path-highlight-clear, engine-swap-branch-on-collapse-badge); each spec skips on mobile via `test.skip(isMobile, "B4: ...")`. all pass on chromium. root cause: `<aside aria-label="person inspector">` is bottom-anchored on narrow viewport and intercepts subsequent card clicks. fix: add a close-inspector step before the second canvas interaction, or viewport-clip the test to a wider width for canvas-heavy scenarios

### tree-view (layered engine)

*all items below are layered-engine specific; demoted to lower priority by the family-view rollout.*

- :o: `high priority` `medium effort` ghost-near adjacency miss for ~5% of ghosts - `passes/place.ts` `closePairs` now correctly registers ghost↔near and ghost-cluster pairs (DELTA=2.5u), eliminating the catastrophic 100u+ stranding. But the gap policy only fires for *adjacent* nodes in `rank[i-1]` vs `rank[i]`; if `passes/order.ts` interleaves a foreign node between a ghost and its near, the gap stays at BRANCH_GAP. On the Akaria DEMO fixture (1802 people, 167 ghosts) this leaves ~8 ghosts at 5-17.5u from their near (worst is a 4-ghost cluster around id `15LJ6`). Fix in `passes/order.ts`: post-pass that pulls each ghost-cluster contiguous to its near in the within-rank ordering, before crossing-min reshuffles
- :o: `high priority` `medium effort` multi-spouse bond passes through intervening ghost card - when a person has 2+ cross-rank spouses and both become ghosts on the same rank, the bond from the original to the *farther* ghost runs horizontally through the *closer* ghost's card. Concrete repro on the DEMO fixture: Kadar Arkaran and Amarkan (rank 3, x=154.76) has Araim Deram ghost at x=157.26 (DELTA-close, primary) and Harmain Perat ghost at x=159.76 (DELTA-close to Araim's ghost). The `bond:COAZS|SQKM4` segment spans x=156.76→159.76 at y=6.6 (mid-card) - that horizontal line crosses Araim's card AABB. Same problem for the parent-drop of the further-spouse family (lands inside the closer ghost's card). Two viable fixes, both in route.ts: (a) route the second-spouse bond as an L-bond (vertical leg + over-the-top horizontal) when an intervening ghost would be crossed; (b) allocate per-couple y-lanes in the inter-rank gutter so concurrent bonds don't stack on the same y. Option (a) is cheaper; option (b) generalises better to the obstacle-avoidance work tracked in to-do.md
- :o: `medium priority` `low effort` tree-view (layered engine) zoom doesn't behave as expected - user-reported, unspecified misbehaviour. needs concrete repro - probable candidates: zoom anchor (wheel vs. button), zoom-aware label thresholds, or perceived 100% reference (semantic 100% is correct per recent audit but cards below the 320px design width may feel "wrong")
- :o: `low priority` `low effort` cross-rank couple orientation remains order-driven after the father-left tie-break in `passes/order.ts`. The tie-break is 100% effective on same-rank both-known couples (37/37 on the Akarians DEMO fixture) but cannot reach cross-rank pairs because their real-person X positions are decided by independent per-rank ordering - `repairCoupleAdjacency` only operates within a rank. **Partial close (commit 7f12a72)**: the couple-equalisation post-pass collapses cross-rank cases where one partner is unparented to same-rank (the tie-break then applies). Genuinely-different-generation couples (both partners parented at different depths) remain order-driven. On Akarians the overall both-known male-left ratio sits at ~57% (100% on same-rank + ~50% on cross-rank). The both-parented residual stays open.

### inspector

- :o: `high priority` `medium effort` editing a person's gender silently drops them from their children's `parentIds` - user-reported data-loss bug. `updatePerson()` in `lib/domain/tree.ts:150` is a field-level patch with no `parentIds` mutation, so the disconnect can't be in the domain layer. suspected: a `PersonPatch` derivation somewhere in `PersonalTab.svelte` commit chain that re-infers couple/parent assignments from gender. needs urgent repro and root-cause trace; treat as data-loss class
- :o: `medium priority` `low effort` Inspector date fields are unreachable by keyboard - tabbing into a `DateInput` neither opens the calendar popup nor lets you type into the box; should do one or the other (probably: focus opens an editable text field, with the picker still available via click / down-arrow)

### canvas

- :o: `medium priority` `medium effort` path highlight does not include the selected person's children - the selection→focus highlight covers ancestor edges but stops at the selected card; descendant edges (selected → child unions → child cards) stay unhighlighted. expected: highlight covers both directions of the visible neighbourhood. trace `pathHighlight.ts` `bundlesForPath` to confirm whether descendant edges are emitted but filtered downstream, or never emitted in the first place.
- :o: `low priority` `low effort` 5 visual snapshot e2e specs drift on a fresh-worktree first run: `visual-add-relative`, `visual-dense-tree`, `visual-multi-union`, `visual-path-highlight`, `visual-secondary-union`. typical visual-golden flakiness across chromium build / antialiasing variants. fix: re-baseline on the standard CI image and commit, or move the specs behind a `playwright test --update-snapshots` opt-in until the baselines are stable. :dart: *carried in from plan: import-wizard-and-family-echo (2026-05-24)*

### shell

- :o: `high priority` `medium effort` picking a person from the command palette / find-person search closes the palette but doesn't update selection - canvas may re-centre via `focusSelection()` (`App.svelte:1156`) but the selection-store write either doesn't fire or doesn't propagate. trace the `select.person` action path
- :o: `medium priority` `medium effort` selected person is lost on page reload - selection state isn't persisted. add a `fte.selection.lastPersonId` localStorage key restored on tree load (gate restoration on the loaded tree containing that id)

### portrait cropper

- :o: `high priority` `low effort` portrait cropper mobile interface unverified - ios safari `<canvas>` inside a native `<dialog>` may not deliver two distinct `pointerId`s for two-finger pinch-zoom; probe scaffolded at `apps/web/public/probes/touch.html` but never run on real hardware. paired exif-orientation probe at `apps/web/public/probes/exif.html` is also unrun. cropperjs (which handled mobile) is already removed; if the multi-touch probe returns "no", recovery is `git revert d3693a9 && pnpm install` to restore the legacy dialog. probes themselves are ~1 afternoon on a real iphone.

---

## fixed

### family-view

- :red_circle: `24 May 2026` family-view union picker dropdown ("˅ chevron") rendered behind adjacent cards and looked partially transparent - each card container in `FamilyViewCanvas.svelte` carries a `transform: translate3d(...)` which creates a stacking context, so the picker menu's internal `z-40` could not escape and later-DOM-order sibling cards painted over it. fix: hoist the focused card container to `z-index: 50` only while `pickerOpenFor === node.personId`, and bump the menu itself to `z-50` with a `shadow-lg` for visual lift. `bg-canvas-elev` token already paints solid; no opacity changes needed.
- :red_circle: `24 May 2026` debug pill was hidden under the family-view engine - the bottom-left bottom-bar wrapper rendered only when `layoutStats` was truthy *or* the user hadn't manually hidden the pill; the stats pill itself rendered unconditionally on any engine that emitted layoutStats. fix in `App.svelte`: gate the stats pill on `selectedEngine === "layered"` (no cluster analogue under family-view / hyperbolic) and keep the debug pill engine-agnostic via the `!debugPillHidden` branch, so family-view users now get the Ctrl+Shift+D entry point.
- :red_circle: `24 May 2026` many debug-panel toggles silently no-op under family-view - layered-IR toggles (grid, node bounds, segment ids, components, ghost arrows, bridge hops, overlap pairs, cycle nodes, bond/centroid Δ, orphans, rank labels, last-edit halo) only render inside the layered `DebugOverlay`. fix in `App.svelte`: `layeredOnlyToggleKeys` derived set drives a `disabled` + `(layered-only)` section suffix + tooltip; runtime `expose __treeDebug` is also disabled on family-view, `copy snapshot` is disabled outside layered, while `force conflict` / `dump` / `load` stay universal.
- :red_circle: `24 May 2026` family-view collapse-badge click was a no-op for ancestor-side badges when the source's co-parent was also visible - the prior fix (`0fc5cdf`) skipped the same source in `pickCollapseVictim`, but the co-parent's children-set is the identical sibship, so the next pass picked the co-parent and the same badge reappeared. fix: extend the `protect` set built in `computeLayout` to also include the children of every explicitly-expanded source, so any co-parent of that source gets rejected too.
- :red_circle: `23 May 2026` on-path stroke and ring are raw Tailwind classes - `--fte-on-path-stroke-width` + `--fte-on-path-ring-color` theme tokens added in `app.css`; consumed by `.family-view-onpath-edge` + `.family-view-onpath` rules.
- :red_circle: `23 May 2026` smooth-diff animation absent - CSS-transition-on-transform (250ms cubic-bezier) on card + badge wrapper divs; `fte.overlays.smoothDiff` localStorage flag default-on; `.family-view-smooth-card` class + `data-smooth-diff="true"` attribute drive declarative wiring; global `prefers-reduced-motion: reduce` zeroes the transition. SVG edges + mount/unmount jump-cut as known scope-bounds (see to-do.md for the completeness follow-ups).
- :red_circle: `23 May 2026` Akarians visual-golden specs duplicate the mask shape - shared `maskUnstableUI(page, opts?)` helper landed at `tests/e2e/_helpers/visual-mask.ts` with typed `MaskOptions`. 5 goldens migrated; 4 byte-identical, 1 regenerated to absorb the path-highlight document-height bug.
- :red_circle: `23 May 2026` `visual-path-highlight-multi-union.png` snapshot dimension mismatch (expected 920×806, received 920×1241) - snapshot rebased to 920×1241 at commit `230711e`. not a regression.

### tree-view (layered engine)

- :red_circle: `14 May 2026` same-rank short couple bond renders as two stub segments on small fixtures - `route.ts:296` `maxBondSpan = min(MAX_BOND_SPAN_CEILING, bbox.width/4)` collapsed to ~3.5u on tiny trees (8-person fixture, bbox 7.9u wide), so any couple with children pulling bondSpan past that became a `/stub-l` + `/stub-r` pair. Fix: floor the threshold at `BUNDLE_THRESHOLD` (= 8 × `ROW_H`). Effect: same-rank short-bond stub pairs dropped 1→0 / 2→0 / 3→1 across `eightPersonFamily`, `ghostStrandingDistilled`, and Akarians; Akarians' remaining stub is a legitimate cross-cluster long-bond
- :red_circle: `14 May 2026` same-rank both-known couple orientation was order-driven (50/50 male-left vs female-left) - `passes/order.ts` `repairCoupleAdjacency` gained a `preferredLeft` map (built from `tree` when threaded by `LayeredEngine`) that picks the male partner as anchor for mixed-gender both-known couples. Same-sex couples, unknown-gender pairs, and multi-spouse secondary unions fall through to position-based ordering. Matches the hyperbolic engine convention from commit `e3e7d8c`. Result: 100% male-left on all 37 same-rank both-known couples on the Akarians DEMO fixture. Cross-rank orientation remains a separate open item per the entry above
- :red_circle: `14 May 2026` ~12% of drops had negative height - root cause: `passes/layer.ts`'s `computeRanks` longest-path BFS ignored spouse edges, so a couple with one parented + one unparented partner ended up on different ranks. The joint child then took max(parent ranks) + 1, which could be above the unparented partner's rank, producing a negative-height drop. Fixed by a couple-equalisation post-pass in `layer.ts` that raises unparented partners to match the parented partner's rank. Commit 7f12a72.
- :red_circle: `14 May 2026` spurious ghost on the top rank after "add parent" when the added-to person's spouse has no parents - same root cause as the negative-drop bug above (computeRanks parent-DAG-only). Fixed by the same `layer.ts` couple-equalisation post-pass that closes the negative-drop. Commit 7f12a72.

### inspector

- :red_circle: `24 May 2026` `inspector-more-actions-smoke.spec.ts:59` asserted `getByText("root updated")` but the post-24 May 2026 toast copy is `"${name} is now the tree root"` - the wave-1 toast-z-index fix (`f88b7c4`) rewrote the assertion to `getByText(/is now the tree root/i)` so chromium + mobile e2e now match the actual toast. carried in from the import-wizard-and-family-echo plan; resolved as a side effect of the toast-intercepts-menu slice.
- :red_circle: `24 May 2026` Connections-tab "trace path to…" action set `traceTargetId` but no canvas highlight painted - removed the action; the in-flight "selectable lineage trace" feature in to-do.md is the canonical replacement and selection→focus path highlight already ships. cleaned up the full prop chain (`traceTargetId` / `onsetTraceTarget` from `ConnectionsTab.svelte` + `Inspector.svelte`, `traceIds` / `tracePath` plumbing in `App.svelte` + `TreeCanvas.svelte` + `DebugOverlay.svelte` + `debugTypes.ts`). `__treeDebug.findPath` console helper kept; `pathHighlight.ts` `bundlesForPath` util kept as a building block for the upcoming feature.
- :red_circle: `23 May 2026` inspector panel grew the document height instead of scrolling internally - `<aside aria-label="person inspector">` gained `min-h-0 overflow-hidden` so it stays bounded by the flex row, and the tab body gained `min-h-0` so `flex-1 overflow-y-auto` actually engages. empty-state summary panel got the same min-h-0 fix.
- :red_circle: `23 May 2026` inspector panel content couldn't scroll - same fix as the document-height bug above. flex children need `min-height: 0` to allow `overflow-y: auto` to clip their content; without it the panel grows past its parent and neither wheel nor drag intercepts a scrollable surface.
- :red_circle: `23 May 2026` inspector header more-actions menu items (duplicate / set as root / copy id / delete) fire correctly.

### canvas

- :red_circle: `24 May 2026` cursor correctness audit - HyperbolicCanvas drove `grab`/`grabbing` off the `:active` pseudoclass which could stick when pointerup landed outside the window; replaced with a JS-driven `.is-dragging` class wired to the existing drag state and added a window-blur cleanup. inherited `cursor: grab` no longer bleeds onto PersonNode cards or the tuning-panel controls (explicit `cursor: pointer` / `default` / `ew-resize` on `.hyp-person`, `.hyp-tuning button`, `.hyp-tuning input[type="range"]`). TreeCanvas and FamilyViewCanvas already used window listeners + setPointerCapture so were left alone.
- :red_circle: `24 May 2026` zoom fit-to-window overflowed the canvas UI box - extracted the fit math into `lib/components/canvas/fitMath.ts` (`computeFit` + `measureCanvasChromeInsets`); both `TreeCanvas` and `FamilyViewCanvas` now subtract chrome insets from the host rect before solving scale + pan. chrome producers (bottom-pill bar, debug panel, debug readouts, mobile sheet inspector) opt in via `data-canvas-chrome`.
- :red_circle: `24 May 2026` auto-fit (fit-to-window) did not vertically centre the tree in the viewport - `computeFit` places the content bbox at the centre of the chrome-aware visible band rather than at the host centre; `contentOriginY` accounts for family-view's negative-y ancestor rows.
- :red_circle: `23 May 2026` PersonNode portrait img already uses `object-cover object-top` (apps/web/src/lib/components/tree/PersonNode.svelte:175); square 600x600 source crops cleanly into the 3:4 slot, no stretch path remains.
- :red_circle: `23 May 2026` clicking the empty canvas background doesn't clear the selection - pointerup-with-no-drag deselect added to TreeCanvas / FamilyViewCanvas / HyperbolicCanvas; cards / cluster glyphs / tuning panel filtered out.
- :red_circle: `23 May 2026` family-view zoom is not centered and 100% is not a stable reference - anchor-aware `setScale` shipped across all 3 engine canvases (FamilyViewCanvas, TreeCanvas, HyperbolicCanvas); widget +/- / slider / exact-percent paths default to viewport-center, wheel + pinch keep cursor anchors. semantic 100% derived from `getBoundingClientRect().width / DESIGN_CARD_WIDTH_PX (320)`; `fte.zoom.semantic100` localStorage flag default-on.
- :red_circle: `23 May 2026` `card-height.test.ts` referenced `CARD_H_COMPACT` after `cardHeight()` simplified to portrait-only - stale assertions rewritten to use `CARD_H`; `CARD_H_COMPACT` constant removed.

### shell

- :red_circle: `24 May 2026` SaveStatusPill read "not saved yet" on first paint after a clean tree load - added a `dirty` prop sourced from `treeStore.dirty`; when `lastSavedAt` is undefined and the tree hasn't been mutated, the pill now reports "Saved" instead of the misleading unsaved label.
- :red_circle: `24 May 2026` "set as tree root" success toast intercepted subsequent inspector / file-menu pointer events on mobile e2e - dropped the `Toasts.svelte` container z-index from `z-50` to `z-30` so open menus (z-40) and modals / context menus (z-50) reliably overlay the toast; the existing `pointer-events-none` container + `pointer-events-auto` toast-body pattern stays in place. `inspector-more-actions-smoke.spec.ts` + `persistence.spec.ts` now pass on both chromium and mobile.
- :red_circle: `24 May 2026` toasts (top-right corner) overlapped the inspector panel when it docked right - re-anchored the toast container to top-center (`top-12 left-1/2 -translate-x-1/2`) in `Toasts.svelte`, sidestepping the inspector regardless of dock side.
- :red_circle: `23 May 2026` Menu / command palette auto-highlighted the first item on mouse open - `activeIdx` now starts at -1; only ↑/↓/Home/End sets the highlight. ArrowDown on the menu-bar trigger still auto-focuses the first item (matches the WAI-ARIA convention).
- :red_circle: `23 May 2026` Tree > "center on root" recentred viewport without selecting the root - `viewCenterRoot` command handler in `App.svelte` now calls `selection.select(treeStore.tree.rootId)` alongside `c.centerOnRoot()`.
- :red_circle: `14 May 2026` command-palette pick left canvas in place - `App.svelte:1156` now calls `canvasController?.focusSelection()` after `focusPerson`; all three engines recenter on the picked person.

---

## meta

### format

mirrors [to-do.md](to-do.md) so the same `commit-style` / triage habits apply.

open bug: `- :o: \`priority\` \`effort\` short summary - repro / context / suspected root cause / suggested fix`

fixed bug: `- :red_circle: \`9 May 2026\` short summary - one-line note on the fix`

cross-reference to a plan file: append `:dart: *planned in [<file>.md](<path>)*` to the item, or hoist it onto a section header line if every item in the section shares the same plan. keep it terse - no inline rationale.

priority levels (highest to lowest): `high priority`, `medium priority`, `low priority`, `future idea`

effort levels: `no effort`, `low effort`, `medium effort`, `high effort`, `very high effort`

### scope

a "bug" here is a defect with observable wrong behavior on a working build - a wrong line on the canvas, a focused field that swallows input, a stuck cursor. **not** a bug:

- missing functionality that was never wired up (e.g. arrow-key canvas pan, keyboard tree navigation) - those are features in `to-do.md`
- known architectural limitations the team has chosen not to address yet (e.g. last-write-wins autosave conflict resolution) - features
- polish or quality bumps without a wrong-output repro (e.g. zoom-aware label sizing, edge thickness at far zoom) - features
- deployment / infra plumbing - features

if a feature in `to-do.md` turns up a defect during implementation, file the defect here and link from the feature.

### sections

items are grouped first by view if specific to one (family-view, tree-view, hyperbolic), then by component (inspector, canvas, shell, portrait cropper, etc.). within each section, open items sort by priority (high first); fixed items sort by date (newest first).

- **open** - active defects
- **fixed** - resolved defects kept for reference; pruned when no longer informative
- **meta** - this section; describes the doc format

### metadata

```yaml
last_updated: 24 May 2026
total_fixed: 30
```
