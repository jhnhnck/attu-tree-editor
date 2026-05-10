/*
 * FamilyTreeEditor - typed edge segments shared between the layout
 * pipeline and the renderer.
 *
 * The old top-level `routeEdges()` function in this file (from before
 * the four-pass IR landed) was deleted in Phase 3 — the production
 * routing path is `passes/route.ts`, which emits the same `Segment` /
 * `EdgeRole` types. This file is types-only.
 *
 * All segment coordinates are in unit space (the same space the layered
 * pipeline emits). The renderer converts unit → px by multiplying by
 * the canvas's UNIT constant (currently 80 px).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";

export type EdgeKind = "bond" | "parent-drop" | "sibling-bus" | "child-drop" | "stub";
export type EdgeRole = "blood" | "adopted" | "half" | "married" | "divorced";

export interface Segment {
    /** stable id; useful for path-trace highlighting */
    readonly id: string;
    readonly kind: EdgeKind;
    readonly role: EdgeRole;
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    /**
     * When this segment is vertical and crosses one or more perpendicular
     * horizontal segments, the y-values of those crossings are recorded
     * here so the renderer can draw a small arc ("bridge hop") at each.
     */
    readonly hops?: readonly number[];
    /**
     * PersonIds that this segment connects; used for pathfinding UI.
     * For bonds: [leftId, rightId]. For drops: [parentId, childId].
     */
    readonly persons: readonly PersonId[];
}
