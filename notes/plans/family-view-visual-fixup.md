# family-view visual & rendering fix-up

tracker for the 10-item visual cleanup plan ([wise-skipping-meerkat](../../../home/jhn/.claude/plans/wise-skipping-meerkat.md)). source observations in [ticklish-humming-plum](../../../home/jhn/.claude/plans/ticklish-humming-plum.md).

## status

| # | issue | phase | status |
|---|---|---|---|
| 1 | two-line name clipped at card bottom | 1 | closed in phase 1 (`9f8a784`) |
| 2 | empty date row leaves empty band | 3 -> 5 | closed in phase 5 (`3bba83c`) — `data-has-date` attribute on the card, level-0+`[data-has-date="false"]` adds `justify-content: center` |
| 3 | card height grows with photo presence | 1 -> 3 | closed in phase 3 (`e59edc9` + `4a0578b`) — portrait card now `CARD_H * 2 = 2.4u` with cumulative rank spacing so portrait rows expand the row pitch instead of overlapping the next rank |
| 4 | couple connector overruns card edge | 2 | closed in phase 2 (`7744dcd`) |
| 5 | sibling bus not centered between parents | 2 | closed in phase 2 (`7744dcd`) — explicit bus + stem + stubs |
| 6 | sub-pixel stroke artifacts on T-junctions | 2 | closed in phase 2 (`7744dcd`) — integer-rounded path coords |
| 7 | selection ring radius doesn't match card | 3 -> 5 | closed in phase 5 (`3bba83c`) — card border-radius bumped 0.375rem → 0.5rem so the inset-3px ring's outer corner has enough arc to render flush against the border's inner corner; `box-shadow: inset` preserved |
| 9 | generation badge togglable in view menu | 4 | closed in phase 4 (`ed69fa2` + snapshot regen `2f51223`) — default off, View-menu + palette entry, localStorage round-trip across reload + tab close/reopen |
| 11 | avatar slot too large for placeholder | 1 -> 3 | closed in phase 3 (`e59edc9`): silhouette placeholder removed entirely; no-portrait cards render only name + date. portrait-blob-loading state shows a neutral slot bg so the tall card never shows an empty top band |
| 12 | bug icon contrast | 5 | closed in phase 5 (`3bba83c`) — debug-pill `text-fg-muted` → `text-fg` so the lucide Bug glyph reads at parity with the "N people" pill text |

dropped: #8 (defer), #10 (skip — zoom levels broken on family-view, separate concern), #13 (not-a-bug).

## probe outcomes (phase 0)

### akarians photo probe

verdict: **no photos in fixture.** `grep "OBJE" apps/web/tests/fixtures/Akarians.ged apps/web/tests/fixtures/golden/Akarians.canonical.ged` returns 0 matches. the single `FILE` match (line 4 of each) is the gedcom file header, not a media reference.

decision: phase 1 will add a small synthetic two-person fixture (one with `photoUrl`, one without) to verify the height-grows-with-photo behavior. akarians stays photo-less; the 1802-person visual snapshot exercises the no-photo path.

### #5 sibling-bus centering probe

verdict: **formula matches what's drawn; visual asymmetry is real but not from the formula.**

algorithmic reading (no dev-server step needed — code is unambiguous):

- [layout.ts:391](../../apps/web/src/lib/layout/engines/family-view/layout.ts#L391) computes `anchorCenterX = (midX(leftNode) + midX(rightNode)) / 2`. correct as "midpoint between the two parent card centers."
- [layout.ts:407-417](../../apps/web/src/lib/layout/engines/family-view/layout.ts#L407-L417) emits one L-shaped drop per child via [layout.ts:621-642](../../apps/web/src/lib/layout/engines/family-view/layout.ts#L621-L642). each drop is a four-point polyline: `(anchorCenterX, parent_y) → (anchorCenterX, midY) → (child_x, midY) → (child_x, child_y)`.
- there is no explicit "sibling bus" edge. the visual "bus" the user sees is the **overlap of per-child horizontal segments** at the shared `midY`.
- consequence: when children are distributed asymmetrically around `anchorCenterX`, the visual bus is *not* centered between the parents — it spans from `min(anchorCenterX, leftmost_child_x)` to `max(anchorCenterX, rightmost_child_x)`, and its midpoint is the centroid of {anchorCenterX} ∪ {child_xs}.

phase 2 rescope for #5: replace per-child L-drops with **one explicit sibling-bus segment** (horizontal, from leftmost child to rightmost child at midY) plus per-child stub drops. this makes the visible bus a real bus, and decides on a centering rule (parents' anchor vs children's centroid) explicitly rather than as an emergent property. recommendation: anchor the bus to the parents' midpoint and extend visually past any over-hanging children so the parent-children relationship reads symmetrically. final decision deferred to phase-2 implementation.

## phase 0 ship summary

walking-skeleton wiring landed:

- [types.ts](../../apps/web/src/lib/layout/engines/family-view/types.ts): `FamilyViewNode.h?: number` field added (optional; behavior unchanged when absent).
- [layout.ts:301](../../apps/web/src/lib/layout/engines/family-view/layout.ts#L301): `placeAt` populates `h: CARD_H` so every produced node carries the explicit height.
- [FamilyViewCanvas.svelte](../../apps/web/src/lib/components/tree/FamilyViewCanvas.svelte): card-height styling and pan-to-focus math both read `node.h ?? CARD_H`. `showGenerationBadge?: boolean` prop added, default `true`, guards the badge render block.
- [App.svelte](../../apps/web/src/App.svelte): `fte.overlays.generationBadge` localStorage key + `generationBadgeEnabled` state, mirroring the path-highlight pattern. default `true` (phase 4 flips to `false`).
- layered + hyperbolic engines untouched (they don't consume `FamilyViewNode`).

phase 1 replaces `h: CARD_H` with a content-driven heuristic; phase 4 flips the badge default + adds the view-menu command.

## phase 2 implementation summary (pending visual e2e + commit)

closes connector-geometry items #4, #5, #6.

- [layout.ts](../../apps/web/src/lib/layout/engines/family-view/layout.ts): added `CARD_VISIBLE_INSET_U = 3 / 80` (matches the 3 px selection-ring inset in `PersonNode.svelte`); `coupleConnector` now terminates at `left.x + PERSON_W - CARD_VISIBLE_INSET_U` and `right.x + CARD_VISIBLE_INSET_U` (#4); the per-couple sibling block emits one `stem:union:…` (parent stem) + one `bus:union:…` (explicit horizontal sibling bus) + N `stub:union:…|kid` (per-child verticals), replacing the old N `drop:union:…|kid` L-drops whose horizontal segments overlapped into an emergent bus (#5). Bus extent = `[min(anchorCenterX, kidsMinX), max(anchorCenterX, kidsMaxX)]` so the parent stem always lands on the bus. Bus Y = midpoint between parent rank midline (anchorY) and child top.
- new [edgePath.ts](../../apps/web/src/lib/layout/engines/family-view/edgePath.ts): pulled `edgePath` out of `FamilyViewCanvas.svelte` into a worker-safe pure module so the integer-pixel rounding (#6) is unit-testable. Every coordinate snaps to the nearest pixel via `Math.round` after the UNIT scale.
- [FamilyViewCanvas.svelte](../../apps/web/src/lib/components/tree/FamilyViewCanvas.svelte): inline `edgePath` replaced with import from the new module; behavior identical except for the integer rounding.
- new test file [connector-geometry.test.ts](../../apps/web/tests/unit/engines/family-view/connector-geometry.test.ts): 5 assertions across the 3 issues — couple-bus endpoint inset (#4); explicit bus + stem + stubs emitted, no old drops, bus extent covers parents' midpoint + every kid (#5); edgePath rounds non-integer coords, returns "" for empty polyline, uses M+L tokens (#6).
- existing tests adjusted to new edge ids: `card-height.test.ts:122` (`drop:union:` → `stem:union:`); `multi-parent.test.ts:122-127` (half-sibling assertion: `drop:` → `stub:`).

verify (phase 2 close, 2026-05-16): `pnpm typecheck` clean; `pnpm lint` clean; `pnpm test:unit` 759/759 + 2 todo (was 757/757 + 2 todo before phase 2). Playwright visual e2e ran clean — `visual-akarians-family-view` and `visual-akarians` (layered) both passed without baseline regen, the family-view connector-geometry change came in below the existing `maxDiffPixelRatio: 0.02` on the 1802-card fixture. `family-view-continuity` desktop green; the 2 mobile failures are the pre-existing **B4** bug (empty-state overlay intercepts click during engine swap on Pixel 7), confirmed pre-existing on phase-2 commit `7744dcd` — not a regression. Layered baseline unchanged ✓.

closed: phase 2 work landed in commit [7744dcd](../../) (`feat(tree/family-view): phase 2 connector geometry — couple-bus inset, explicit sibling bus, integer-rounded paths`). retro + plan revision are in the canonical plan at `~/.claude/plans/wise-skipping-meerkat.md`.

## phase 3 implementation summary

closes #3 (re-opened) and #11 (silhouette removed). **DoD items #2 and #7 not delivered** — scope was consumed by the cross-rank overlap regression triggered by bumping `CARD_H_WITH_PORTRAIT` to `CARD_H * 2` (= 2.4u). Both rolled into phase 5 as bug-log entries B8 / B9 (see `~/.claude/plans/wise-skipping-meerkat.md` revision after phase 3 — 2026-05-17).

- [layout.ts](../../apps/web/src/lib/layout/engines/family-view/layout.ts): `CARD_H_WITH_PORTRAIT = CARD_H * 2` (= 2.4u) exceeds `ROW_H = 2`, so the pre-fix `y = rank * ROW_H` placed portrait cards 0.4u into the next rank. New cumulative rank-y pass walks ranks in sorted order, accumulating `max(CARD_H, maxHByRank[r]) + RANK_GUTTER` where `RANK_GUTTER = ROW_H - CARD_H = 0.8`. Default-height rows keep the old `rank * ROW_H` spacing exactly; portrait rows push every subsequent rank down by the height delta. `bbox.height` switched to the same cumulative formula so a tall card on the bottom rank is included in the bbox.
- [layout.ts](../../apps/web/src/lib/layout/engines/family-view/layout.ts): sibling-bus + parent-stem `busY` now clamps to `max(midpoint, parentRowBottom + 0.05)` so the bus + stem + stub-tops stay outside the parent card. SVG edges render behind cards, so a bus inside the parent card was invisible; the clamp moves it 0.05u into the gutter. Same clamp applied to the N>2 multi-union manifold drops (`dropFromY`).
- [layout.ts](../../apps/web/src/lib/layout/engines/family-view/layout.ts): `emitAnchorsAndEdges` now takes a `RowGeometry` lookup (`topY` / `bottomY` per rank) instead of reading per-node y inside the loops; kid-rank top derives from `rowGeometry.topY(kid.rank)` rather than `visibleKidNodes[0].y` (the latter shifts under per-row centering when sibling cards have mixed heights).
- [PersonNode.svelte](../../apps/web/src/lib/components/tree/PersonNode.svelte): renders the portrait slot whenever `portraitBlobId` is set, not just when `portraitUrl` is resolved. While the blob URL is pending, the slot is empty and gets an `.is-portrait-pending` neutral background, so the tall card never shows an empty top band during blob load.
- [card-height.test.ts](../../apps/web/tests/unit/engines/family-view/card-height.test.ts): new assertions for cross-rank clearance (rank-bottom to next-rank-top = `RANK_GUTTER`), bus / stem / stub Y > parent row bottom, and `bbox.height` covering a portrait card on the bottom rank. Updated the per-row centering assertion to be robust against `orientCouple` swapping left / right by personId order.
- [PersonNode.test.ts](../../apps/web/tests/component/PersonNode.test.ts): new assertion that `portraitBlobId` without `portraitUrl` renders the slot (no img) with `data-portrait-pending="true"`.

verify (phase 3 close, 2026-05-22): `pnpm typecheck` clean (4308 files, 0 errors, 0 warnings); `pnpm lint` clean; `pnpm test:unit` 778/778 + 2 todo (was 759 + 2 todo entering the phase, +19 assertions). Visual e2e (`visual-akarians`, `visual-akarians-family-view`, `visual-multi-union`, `visual-add-relative`, `visual-path-highlight`, desktop `family-view-continuity`): all green; 3 snapshots intentionally updated in `4a0578b` for fixtures with portraits (`add-relative-menu-open`, `multi-union-family-view`, `path-highlight-multi-union`); Akarians + layered baselines unchanged. Mobile `family-view-continuity` 2 failures: pre-existing B4 (empty-state overlay intercepts click during engine swap on Pixel 7), confirmed pre-existing on phase-3 commits — not a regression. Server tests 69/69. Closed: phase 3 work landed in commits [e59edc9](../../) (`feat(tree/family-view): drop silhouette path, double-height portrait, per-row centering`) + [4a0578b](../../) (`fix(tree/family-view): cumulative rank y so portrait rows stop overlapping the next rank`). Retro + plan revision are in the canonical plan at `~/.claude/plans/wise-skipping-meerkat.md`.

## phase 4 implementation summary

closes #9 (generation-badge view toggle).

- [App.svelte](../../apps/web/src/App.svelte): `readGenerationBadgePref` default flipped (`null → off`, only `"true"` reads as on, `catch → false`); new `writeGenerationBadgePref(on)` mirror of `writePathHighlightPref`; new `viewOverlayGenerationBadgeToggle` handler in the command-action map; new `overlayGenerationBadgeActive` enabled flag in the `buildCommands` call.
- [commands.ts](../../apps/web/src/lib/components/palette/commands.ts): new `viewOverlayGenerationBadgeToggle` handler type + `overlayGenerationBadgeActive` enabled flag + new "Overlay: generation badges" command entry under the View overlays sub-list with `checked` bound to the active flag.
- [family-view-continuity.spec.ts](../../apps/web/tests/e2e/family-view-continuity.spec.ts): new sibling describe block "family view — generation-badge toggle (phase 4)" with its own one-shot `beforeEach` (cleanup via `page.evaluate` after initial navigation rather than `addInitScript`, so reload + tab close/reopen actually exercise the persisted choice). Asserts default-off, toggle-on writes `"true"` to localStorage, badges survive `page.reload()`, badges survive `page.close()` + `context.newPage()`.

verify (phase 4 close, 2026-05-22): `pnpm typecheck` clean (4308 files, 0/0/0); `pnpm lint` + prettier clean; `pnpm test:unit` 778 + 2 todo (unchanged — phase 4 added e2e only). Visual e2e (chromium): all 5 visual specs green after 2 intentional baseline regens for `multi-union-family-view` and `path-highlight-multi-union` (badges no longer rendered at default); `visual-akarians-family-view` stayed under `maxDiffPixelRatio` despite visibly losing badges (20 small cards at fit zoom). Desktop `family-view-continuity` 6/6 (one more than phase 3 entered with — the new phase-4 round-trip test). Mobile `family-view-continuity` 4 pass / 2 fail (B4 carryover unchanged; the new phase-4 round-trip passes on mobile too, confirming the badge plumbing is mobile-safe). Server tests 69/69. Closed: phase 4 work landed in commits [ed69fa2](../../) (`feat(tree/family-view): phase 4 generation-badge view toggle (default off + view-menu command)`) + baseline regen [2f51223](../../) (`test(e2e): regen 2 visual snapshots after phase 4 badge default flip`). Retro + plan revision are in the canonical plan at `~/.claude/plans/wise-skipping-meerkat.md`.

## phase 5 implementation summary

closes #2, #7, #12. final phase of the plan.

- [App.svelte](../../apps/web/src/App.svelte): debug-pill button class `text-fg-muted` → `text-fg` so the lucide `Bug` icon reads at parity with the "N people" pill text (#12). Icons typically need more contrast than text to feel equally weighted at the same token value.
- [PersonNode.svelte](../../apps/web/src/lib/components/tree/PersonNode.svelte): new `data-has-date` attribute on the card button (`"true"` / `"false"` based on `dateRange` presence); CSS rule extends the existing `[data-portrait="0"]` centering to `[data-portrait="0"], [data-has-date="false"]` so any level-0 card without a date now vertically centers the portrait+name block (#2 / B8). Covers the portrait-card-without-date case that was leaving an empty band below the name.
- [PersonNode.svelte](../../apps/web/src/lib/components/tree/PersonNode.svelte): `button { border-radius }` bumped from `0.375rem` (6px) to `0.5rem` (8px). With border-width 2px the padding-box inner radius becomes 6px (was 4px), so the inset-3px selection-ring's outer corner has enough arc to render flush against the border's inner corner — closes the visible corner gap (#7 / B9). `box-shadow: inset 0 0 0 3px` preserved per the plan's first-attempt strategy; `CARD_VISIBLE_INSET_U = 3/80` in `engines/family-view/layout.ts` stays unchanged because the inset value didn't change.
- B10 (SetNeedStyleFlush hover-sweep measurement): **N/A** — the box-shadow approach is preserved (no `ring-inset` switch), no dynamic style-flush risk to validate. The plan flagged this as a perf risk gated on the #7 implementation choice; the gate is closed in the safe direction.
- [PersonNode.test.ts](../../apps/web/tests/component/PersonNode.test.ts): converts the 2 phase-5 `.todo` stubs (`issue #2`, `issue #7`) into 3 real assertions — `data-has-date='false'` when birth + death both absent, `data-has-date='true'` when at least one is present, `is-selected` class + `aria-selected="true"` attr apply when `selected={true}`. Class hooks are jsdom-verifiable; CSS geometry is the e2e snapshot's job.

verify (phase 5 close, 2026-05-22): on phase-5 files only — `pnpm typecheck` clean (4308 files, 0 errors), `pnpm lint` + prettier clean, PersonNode unit tests 23/23 including 3 new phase-5 assertions. Visual e2e (chromium): 10/11 visual + continuity tests pass; 1 baseline regen for `path-highlight-multi-union` (the border-radius bump exceeded the 100-pixel diff tolerance only on multi-union's larger cards; akarians, multi-union-family-view, add-relative, akarians-layered all under tolerance). **Full-tree verify (`pnpm verify`) currently blocked by foreign concurrent work in the working tree** — the relationship-vocabulary phase-5 workstream (parse.ts +91, serialize.ts +96, types.ts +83, schema.ts +33, tree.ts, cardDecorator.ts +163/-46, new personIdentity.ts + .test.ts, couples.ts, kinship.ts, order.ts, merge.ts, PersonalTab.svelte) introduces 13 typecheck errs in parse.ts, 14 lint errs in types.ts, 1 unit failure in serialize.test.ts. Not phase-5 work; routed to bug log as **B13** (defer-until-foreign-workstream-commits). Closed: phase 5 work landed in commits [3bba83c](../../) (`feat(tree): phase 5 chrome polish — #2 + #7 + #12 + B10`) + baseline regen [ee6b5a5](../../) (`test(e2e): regen path-highlight-multi-union snapshot after phase 5 border-radius bump`). Retro + plan revision are in the canonical plan at `~/.claude/plans/wise-skipping-meerkat.md`. **Plan complete; next step is `ship-readiness`, not `phase-loop`.**
