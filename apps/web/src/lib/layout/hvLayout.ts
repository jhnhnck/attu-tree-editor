/*
 * FamilyTreeEditor - vestigial types from the old hvLayout pipeline.
 *
 * The `hvLayout()` function was the original single-pass layout from
 * before the four-pass IR (`layer → order → place → route`) landed. It
 * has been dead in production since the worker switched to the IR
 * pipeline. Phase 3's boundary refactor (10 May 2026) deleted the
 * function body and moved constants to `$lib/layout/constants.ts`.
 *
 * The two types here (`GhostNode`, `HvLayoutResult`) remain because the
 * `placedGraphToHvLayout` adapter in `ir.ts` still serves
 * `TreeCanvas.svelte` (Phase 4 will inline both the adapter and these
 * types into TreeCanvas, then this file goes away entirely).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";

export interface GhostNode {
    /** the real person being duplicated as a ghost */
    ghostOf: PersonId;
    /** partner they're placed next to */
    nearId: PersonId;
    /** position in unit coords (adjacent to nearId) */
    x: number;
    y: number;
}

export interface ComponentInfo {
    /** the focus chosen for this component */
    rootId: PersonId;
    /** number of people laid out in this component */
    size: number;
    /** horizontal offset where this component starts (unit coords) */
    offsetLeft: number;
}

export interface HvLayoutResult {
    /** every visible person → top-left in unit coords */
    positions: ReadonlyMap<PersonId, { x: number; y: number }>;
    /** bounding box in unit coords */
    canvas: { width: number; height: number };
    /**
     * Connected components — TreeCanvas / DebugOverlay render component
     * boundary markers from this list. `placedGraphToHvLayout` returns
     * `[]` (the new IR doesn't track components separately); the consumers
     * tolerate an empty array.
     */
    components: readonly ComponentInfo[];
    /** people with zero edges; rendered in a grid below the main components */
    isolated: readonly PersonId[];
    /** people rendered as ghosts adjacent to long-span spouses */
    ghosts: readonly GhostNode[];
    totalPeople: number;
    laidOutPeople: number;
}
