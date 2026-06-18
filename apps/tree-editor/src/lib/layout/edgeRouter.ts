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
    /** stable id; unique per segment. */
    readonly id: string;
    /**
     * Group key that links this segment to siblings emitted by the same
     * topology event — a couple-family fan, a single-parent fan, or a bond
     * cluster. The renderer emits one `<path>` per (bundleId, role) and
     * path-trace highlighting matches the user mental model when keyed on
     * bundleId rather than segment id.
     *
     * Shapes:
     *   - `bond:<sortedIds>:<unionIndex>` — bond segment + its L-bond legs
     *     + long-bond stub caps share this bundle.
     *   - `couple:<sortedIds>:<unionIndex>` — joint-child drop, bus, and
     *     child-drops emitted for the couple.
     *   - `single:<parentId>` — single-parent drop fan to all kids.
     */
    readonly bundleId: string;
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
    /**
     * Hierarchical-edge-bundling control point (Holten 2006). Set on long
     * cross-lineage bonds; the renderer emits a quadratic Bezier from
     * (x1,y1) through this control to (x2,y2) instead of a straight line,
     * so the bond bows toward the proband-LCA's column and visually
     * follows the inclusion hierarchy.
     */
    readonly bundleControl?: { readonly x: number; readonly y: number };
}
