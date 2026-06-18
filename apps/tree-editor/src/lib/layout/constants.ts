/*
 * FamilyTreeEditor - layout-space constants.
 *
 * Moved out of `hvLayout.ts` during Phase 3's boundary refactor so the
 * layout pipeline can share them without depending on the (now-dead)
 * `hvLayout()` function.
 *
 * Units: one unit corresponds to half a card width (a card is
 * PERSON_W = 2 units across). TreeCanvas multiplies by UNIT (80 px) to
 * project to screen.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

/** width of a single person card in unit coords (matches CELL_W / UNIT) */
export const PERSON_W = 2;
/** vertical step between generation rows in unit coords */
export const ROW_H = 2;
/** minimum gap between adjacent siblings within a sibship */
export const SIBLING_GAP = 0.5;
/** minimum gap between adjacent subtrees that are not siblings */
export const SUBTREE_GAP = 1;
/** gap between disconnected components */
export const COMPONENT_GAP = 4;
/** grid step for isolated (zero-relation) people */
export const ISOLATED_STEP = 3;
/** max horizontal span for a couple bond; longer bonds trigger ghost placement */
export const GHOST_THRESHOLD = 8;
