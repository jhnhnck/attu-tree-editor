# FamilyTreeEditor bug log

*known defects with reproducible misbehavior. feature work, deployment plumbing, and "this could be nicer" items live in [to-do.md](to-do.md). see the [meta](#meta) section at the end for format.*

---

## open

### layout / edge routing

🎯 *all items below are layered-engine specific; demoted to lower priority by the wave-1 family-view rollout (retired plan; family-view-w2 successor also retired 23 May 2026, recoverable via git history).*

- ⭕ `high priority` `medium effort` ghost-near adjacency miss for ~5% of ghosts - `passes/place.ts` `closePairs` now correctly registers ghost↔near and ghost-cluster pairs (DELTA=2.5u), eliminating the catastrophic 100u+ stranding. But the gap policy only fires for *adjacent* nodes in `rank[i-1]` vs `rank[i]`; if `passes/order.ts` interleaves a foreign node between a ghost and its near, the gap stays at BRANCH_GAP. On the Akaria DEMO fixture (1802 people, 167 ghosts) this leaves ~8 ghosts at 5-17.5u from their near (worst is a 4-ghost cluster around id `15LJ6`). Fix in `passes/order.ts`: post-pass that pulls each ghost-cluster contiguous to its near in the within-rank ordering, before crossing-min reshuffles
- ⭕ `high priority` `medium effort` multi-spouse bond passes through intervening ghost card - when a person has 2+ cross-rank spouses and both become ghosts on the same rank, the bond from the original to the *farther* ghost runs horizontally through the *closer* ghost's card. Concrete repro on the DEMO fixture: Kadar Arkaran and Amarkan (rank 3, x=154.76) has Araim Deram ghost at x=157.26 (DELTA-close, primary) and Harmain Perat ghost at x=159.76 (DELTA-close to Araim's ghost). The `bond:COAZS|SQKM4` segment spans x=156.76→159.76 at y=6.6 (mid-card) - that horizontal line crosses Araim's card AABB. Same problem for the parent-drop of the further-spouse family (lands inside the closer ghost's card). Two viable fixes, both in route.ts: (a) route the second-spouse bond as an L-bond (vertical leg + over-the-top horizontal) when an intervening ghost would be crossed; (b) allocate per-couple y-lanes in the inter-rank gutter so concurrent bonds don't stack on the same y. Option (a) is cheaper; option (b) generalises better to the obstacle-avoidance work tracked in to-do.md 🎯 *was planned in relationship-vocabulary.md (retired plan)*
- ⭕ `low priority` `low effort` cross-rank couple orientation remains order-driven after the Phase 1 father-left tie-break in `passes/order.ts`. The tie-break is 100% effective on same-rank both-known couples (37/37 on the Akarians DEMO fixture) but cannot reach cross-rank pairs because their real-person X positions are decided by independent per-rank ordering - `repairCoupleAdjacency` only operates within a rank. **Partial close as of Phase 2b.1 (commit 7f12a72)**: the couple-equalisation post-pass collapses cross-rank cases where one partner is unparented to same-rank (the tie-break then applies). Genuinely-different-generation couples (both partners parented at different depths) remain order-driven. Until then, on Akarians the overall both-known male-left ratio sits at ~57% (100% on same-rank + ~50% on cross-rank). Original bug:18 (same-rank inversion) is fixed; this is the residual cross-rank scope. 🎯 *partially closed by relationship-vocabulary.md Phase 2b.1 (retired plan; see git history); the both-parented residual stays open*

### a11y

- ⭕ `medium priority` `low effort` Inspector date fields are unreachable by keyboard - tabbing into a `DateInput` neither opens the calendar popup nor lets you type into the box; should do one or the other (probably: focus opens an editable text field, with the picker still available via click / down-arrow)

### ui / interaction

- ⭕ `medium priority` `low effort` family-view e2e tests on mobile viewport (Pixel 7) are flaky - inspector overlay intercepts canvas pointer events. across wave-2's 5 phases this surfaced 4 confirmed signatures (selection-survives-engine-swap, edit-visible-after-switch, path-highlight-clear, engine-swap-branch-on-collapse-badge); each spec skips on mobile via `test.skip(isMobile, "B4: ...")`. all pass on chromium. root cause: `<aside aria-label="person inspector">` is bottom-anchored on narrow viewport and intercepts subsequent card clicks. fix: add a close-inspector step before the second canvas interaction, or viewport-clip the test to a wider width for canvas-heavy scenarios 🎯 *deferred from family-view-w2 (retired plan; see git history) — confirmed not a wave-2 regression*
- ⭕ `medium priority` `low effort` family-view collapse-badge click is a no-op for ancestor-side badges - `onBadgeClick` adds `sourceId` to the explicit-expansion set, but for ancestor sources whose adjacent generation is already in the bounded default, `revealChildren` / `revealParents` return no-op and the visible set doesn't change. `pickCollapseVictim` re-picks the same source on the next pass because its `protect` argument only protects CHILDREN from being hidden, not source persons from being chosen again. net effect: click writes to localStorage but the badge visually reappears immediately. fix: 2-3-line patch in `pickCollapseVictim` extending the `protect` rule to also skip already-picked sources. 🎯 *carried in from family-view-w2 (retired plan; see git history, phase 1 finding 2026-05-23)*
- ⭕ `low priority` `low effort` Menu's first item is always visually highlighted on open even when the user opened it with the mouse - only auto-highlight after an explicit keyboard nav (↑/↓ or End/Home), not on mouse open
- ⭕ `low priority` `low effort` cursor correctness audit - the canvas root's `cursor-grab` overrides cards / buttons inside it (should show pointer over PersonNodes), and the cursor occasionally stays in `grabbing` after a pan ends outside the window. fix the grab/grabbing/default/pointer transitions so the OS cursor always matches what's under the pointer
- ⭕ `high priority` `low effort` portrait cropper mobile interface unverified - ios safari `<canvas>` inside a native `<dialog>` may not deliver two distinct `pointerId`s for two-finger pinch-zoom; phase 0a probe scaffolded at `apps/web/public/probes/touch.html` but never run on real hardware. paired exif-orientation probe at `apps/web/public/probes/exif.html` is also unrun. cropperjs (which handled mobile) is already removed; if the multi-touch probe returns "no", recovery is `git revert d3693a9 && pnpm install` to restore the legacy dialog. probes themselves are ~1 afternoon on a real iphone. 🎯 *carried in from portrait-cropper-rewrite (retired plan; see git history, ship-override 2026-05-23)*

### tests

- ⭕ `medium priority` `no effort` `card-height.test.ts` references `CARD_H_COMPACT` after the `cardHeight()` heuristic was simplified to portrait-only ([engines/family-view/layout.ts:83](../apps/web/src/lib/layout/engines/family-view/layout.ts#L83)). The constant is still exported but `cardHeight()` no longer returns it for short-name no-portrait cards - they now resolve to `CARD_H`. Two stale assertions: [card-height.test.ts:33](../apps/web/tests/unit/engines/family-view/card-height.test.ts#L33) `cardHeight({ given: "Ann", surname: "Lee" }) === CARD_H_COMPACT` (now `=== CARD_H`); [card-height.test.ts:97](../apps/web/tests/unit/engines/family-view/card-height.test.ts#L97) `rightNode.h === CARD_H_COMPACT` in the mixed-height fixture (now `=== CARD_H`). Next `pnpm test:unit` run fails. Fix: rewrite the assertions to match the portrait-only heuristic (drop the short-name branch); decide whether `CARD_H_COMPACT` stays exported as an unused constant or gets removed too.
- ⭕ `low priority` `low effort` `visual-path-highlight-multi-union.png` snapshot fails in a fresh playwright environment (expected 920×806, received 920×1241). last rebaselined at commit `f00d718`. likely cause: chromium-headless-shell rendering the auto-sized family-view canvas slightly taller than the captured baseline. other visual goldens (akarians, multi-union, add-relative, family-view) all pass on the same fresh env. verify reproduces on `trunk` before re-baselining. not a regression of any specific feature work - first observed during portrait-cropper-rewrite. 🎯 *first observed during portrait-cropper-rewrite (retired plan; see git history)*

---

## fixed

- 🔴 `23 May 2026` family-view zoom is not centered and 100% is not a stable reference - anchor-aware `setScale` shipped across all 3 engine canvases (FamilyViewCanvas, TreeCanvas, HyperbolicCanvas); widget +/- / slider / exact-percent paths default to viewport-center, wheel + pinch keep cursor anchors. semantic 100% derived from `getBoundingClientRect().width / DESIGN_CARD_WIDTH_PX (320)`; `fte.zoom.semantic100` localStorage flag default-on. closed by family-view-w2 (retired plan; see git history) phase 0b.
- 🔴 `23 May 2026` on-path stroke and ring are raw Tailwind classes - `--fte-on-path-stroke-width` + `--fte-on-path-ring-color` theme tokens added in `app.css`; consumed by `.family-view-onpath-edge` + `.family-view-onpath` rules. closed by family-view-w2 (retired plan; see git history) phase 0.
- 🔴 `23 May 2026` smooth-diff animation absent - CSS-transition-on-transform (250ms cubic-bezier) on card + badge wrapper divs; `fte.overlays.smoothDiff` localStorage flag default-on; `.family-view-smooth-card` class + `data-smooth-diff="true"` attribute drive declarative wiring; global `prefers-reduced-motion: reduce` zeroes the transition. SVG edges + mount/unmount jump-cut as known scope-bounds (see to-do.md for the completeness follow-ups). closed by family-view-w2 (retired plan; see git history) phase 3.
- 🔴 `23 May 2026` Akarians visual-golden specs duplicate the mask shape - shared `maskUnstableUI(page, opts?)` helper landed at `tests/e2e/_helpers/visual-mask.ts` with typed `MaskOptions`. 5 wave-1 goldens migrated; 4 byte-identical, 1 regenerated to absorb the path-highlight document-height bug (B13). closed by family-view-w2 (retired plan; see git history) phase 1.
- 🔴 `14 May 2026` command-palette pick left canvas in place - `App.svelte:1156` now calls `canvasController?.focusSelection()` after `focusPerson`; all three engines recenter on the picked person. Phase 6.
- 🔴 `14 May 2026` same-rank short couple bond renders as two stub segments on small fixtures - `route.ts:296` `maxBondSpan = min(MAX_BOND_SPAN_CEILING, bbox.width/4)` collapsed to ~3.5u on tiny trees (8-person fixture, bbox 7.9u wide), so any couple with children pulling bondSpan past that became a `/stub-l` + `/stub-r` pair. Fix: floor the threshold at `BUNDLE_THRESHOLD` (= 8 × `ROW_H`). Effect: same-rank short-bond stub pairs dropped 1→0 / 2→0 / 3→1 across `eightPersonFamily`, `ghostStrandingDistilled`, and Akarians; Akarians' remaining stub is a legitimate cross-cluster long-bond
- 🔴 `14 May 2026` same-rank both-known couple orientation was order-driven (50/50 male-left vs female-left) - `passes/order.ts` `repairCoupleAdjacency` gained a `preferredLeft` map (built from `tree` when threaded by `LayeredEngine`) that picks the male partner as anchor for mixed-gender both-known couples. Same-sex couples, unknown-gender pairs, and multi-spouse secondary unions fall through to position-based ordering. Matches the hyperbolic engine convention from commit `e3e7d8c`. Result: 100% male-left on all 37 same-rank both-known couples on the Akarians DEMO fixture. Cross-rank orientation remains a separate open item per the entry above
- 🔴 `14 May 2026` ~12% of drops had negative height - root cause: `passes/layer.ts`'s `computeRanks` longest-path BFS ignored spouse edges, so a couple with one parented + one unparented partner ended up on different ranks. The joint child then took max(parent ranks) + 1, which could be above the unparented partner's rank, producing a negative-height drop. Fixed by a couple-equalisation post-pass in `layer.ts` that raises unparented partners to match the parented partner's rank. Regression test `korakWifeChildrenThenAddParent > emits no negative-height parent drops` covers the bugs.md repro. Phase 2b.1 of relationship-vocabulary.md (retired plan). Commit 7f12a72.
- 🔴 `14 May 2026` spurious ghost on the top rank after "add parent" when the added-to person's spouse has no parents - same root cause as the negative-drop bug above (computeRanks parent-DAG-only). Fixed by the same `layer.ts` couple-equalisation post-pass that closes the negative-drop. Regression test `korakWifeChildrenThenAddParent > inserts no ghost of Wife on the top rank after add-parent` covers the exact repro. Phase 2b.1 of relationship-vocabulary.md (retired plan). Commit 7f12a72.

---

## meta

### format

mirrors [to-do.md](to-do.md) so the same `commit-style` / triage habits apply.

open bug: `- ⭕ \`priority\` \`effort\` short summary - repro / context / suspected root cause / suggested fix`

fixed bug: `- 🔴 \`9 May 2026\` short summary - one-line note on the fix`

cross-reference to a plan file: append `🎯 *planned in [<file>.md](<path>)*` to the item, or hoist it onto a section header line if every item in the section shares the same plan. keep it terse - no inline rationale.

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

- **open** - active defects grouped by area; sorted within each section by priority (high first)
- **fixed** - resolved defects kept for reference; sorted chronologically; pruned when no longer informative
- **meta** - this section; describes the doc format

### metadata

```yaml
last_updated: 16 May 2026
total_fixed: 5
```
