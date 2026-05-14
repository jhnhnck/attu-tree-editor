# family-view visual & rendering fix-up

tracker for the 10-item visual cleanup plan ([wise-skipping-meerkat](../../../home/jhn/.claude/plans/wise-skipping-meerkat.md)). source observations in [ticklish-humming-plum](../../../home/jhn/.claude/plans/ticklish-humming-plum.md).

## status

| # | issue | phase | status |
|---|---|---|---|
| 1 | two-line name clipped at card bottom | 1 | open |
| 2 | empty date row leaves empty band | 3 | open (decision: vertically center) |
| 3 | card height grows with photo presence | 1 | open (decision: 2:3 portrait when photo present) |
| 4 | couple connector overruns card edge | 2 | open |
| 5 | sibling bus not centered between parents | 2 | open (post-probe: rescope, see below) |
| 6 | sub-pixel stroke artifacts on T-junctions | 2 | open |
| 7 | selection ring radius doesn't match card | 3 | open |
| 9 | generation badge togglable in view menu | 4 | open (decision: default off; phase-0 wiring landed) |
| 11 | avatar slot too large for placeholder | 1 (or 3) | open |
| 12 | bug icon contrast | 5 | open |

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
