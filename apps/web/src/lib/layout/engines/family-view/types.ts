/*
 * FamilyTreeEditor - family-view engine private IR types.
 *
 * The shapes here are engine-private; the shared `LayoutEngine` interface
 * (lib/layout/engine.ts) carries positions + edges only. Future phases can
 * promote anything below into the shared IR if a second engine ever needs
 * it; until then keep the surface local.
 *
 * Naming: `union-anchor` (not `marriage-anchor`) is deliberate — the
 * relationship-vocabulary workstream will introduce N-partner unions and
 * non-romantic bonds that the same anchor renders, so the name stays
 * neutral on day one. `partnerIds` is `PersonId[]` for the same reason
 * even though today every union has exactly 1 or 2 partners.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";

/** Generation rank relative to focus: 0 = focus, -1 = parents, +1 = children. */
export type Rank = number;

/**
 * A virtual node that anchors children to a parent-couple (or single parent).
 * Engine-private — does not appear in the shared `LayoutResult.nodes`.
 *
 * The renderer draws the connector between the two partner cards (or omits
 * it for a degenerate single-partner anchor) and uses `id` as the bus
 * attachment point for child drops.
 */
export interface UnionAnchor {
    readonly id: string;
    readonly partnerIds: readonly PersonId[];
    readonly childIds: readonly PersonId[];
    /** Source CoupleRecord index in `tree.couples`, or undefined for synthesized single-parent anchors. */
    readonly coupleIndex?: number;
    /** Rank of the anchor itself, halfway between parent and child rows. */
    readonly rank: Rank;
}

/** Visible person node with an assigned screen position in unit space. */
export interface FamilyViewNode {
    readonly personId: PersonId;
    readonly rank: Rank;
    /** Top-left in unit space; width is PERSON_W, height fixed (see layout.ts). */
    readonly x: number;
    readonly y: number;
}

/** Edge role surfaced to the renderer; data-driven per design rule #3. */
export type FamilyViewEdgeRole = "blood" | "adopted" | "half" | "married" | "divorced";

/**
 * One rendered segment. Family-view edges are simple polylines (the union
 * connector + the bus/drop pair); geodesic arcs are hyperbolic-only.
 */
export interface FamilyViewEdge {
    readonly id: string;
    /** People implicated; first is upstream, last is downstream. */
    readonly persons: readonly PersonId[];
    readonly role: FamilyViewEdgeRole;
    readonly points: readonly { readonly x: number; readonly y: number }[];
}

/** Result of one family-view layout pass. */
export interface FamilyViewLayout {
    readonly focus: PersonId;
    readonly nodes: ReadonlyMap<PersonId, FamilyViewNode>;
    readonly anchors: readonly UnionAnchor[];
    readonly edges: readonly FamilyViewEdge[];
    readonly bbox: { readonly width: number; readonly height: number };
}
