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
import type { OverlaySegment } from "$lib/layout/engines/family-view/overlays";
import type { GroupFrame } from "$lib/layout/engines/family-view/groups";
import type { SibshipFrame } from "$lib/layout/engines/family-view/sibships";

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
    /** Top-left in unit space; width is PERSON_W. */
    readonly x: number;
    readonly y: number;
    /**
     * Card height in unit space. Optional for backward-compat; consumers
     * fall back to `CARD_H` when absent. Phase 1 of the visual fix-up plan
     * will vary this per node based on photo presence + name length.
     */
    readonly h?: number;
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

/**
 * A "+N FirstName" badge node that stands in for a collapsed sibling /
 * descendant block. Auto-collapse and user-driven `−` both produce
 * badges. Clicking a badge re-expands its members back into person
 * cards.
 *
 * `sourceId` is the person whose children block was collapsed (the
 * parent / ancestor). `parentId` is the upstream rank's anchor that
 * the badge hangs from in the drawing; today they're the same, but
 * the field stays separate for future single-parent / multi-anchor
 * cases.
 */
export interface BadgeNode {
    readonly id: string;
    /** Rank where the badge appears (one below the source). */
    readonly rank: Rank;
    readonly x: number;
    readonly y: number;
    /** Person whose adjacent generation was collapsed. */
    readonly sourceId: PersonId;
    /** Members hidden behind this badge. */
    readonly members: readonly PersonId[];
    /** Sample name shown on the badge (highest-DOI member). */
    readonly sampleName: string;
    /** "auto" = capped by the visible-count budget; "manual" = user click. */
    readonly origin: "auto" | "manual";
}

/**
 * Per-card descriptor for the multi-union picker (`˅` affordance). For
 * each visible card we say: "your couple-mate has multi unions; here
 * are the other options the user can swap in". Empty when the mate has
 * only one union or when this card has no couple-mate visible. Used by
 * the renderer to decide whether to render a `˅` and what menu it shows.
 */
export interface MultiUnionMate {
    /** The couple-mate (the other person currently in this card's couple). */
    readonly mateId: PersonId;
    /** Currently-primary coupleIndex for `mateId`. */
    readonly primaryCoupleIndex: number;
    /** Alternates: mate's other unions, surfacing the partner id. */
    readonly alternates: readonly {
        readonly coupleIndex: number;
        readonly partnerId: PersonId | undefined;
    }[];
}

/** Result of one family-view layout pass. */
export interface FamilyViewLayout {
    readonly focus: PersonId;
    readonly nodes: ReadonlyMap<PersonId, FamilyViewNode>;
    readonly anchors: readonly UnionAnchor[];
    readonly edges: readonly FamilyViewEdge[];
    readonly badges: readonly BadgeNode[];
    readonly bbox: { readonly width: number; readonly height: number };
    /** Persons whose `+` should appear (un-shown children). */
    readonly hasMoreChildren: ReadonlySet<PersonId>;
    /** Persons whose `+` should appear (un-shown parents; topmost rank). */
    readonly hasMoreParents: ReadonlySet<PersonId>;
    /** Persons whose `−` should appear (explicitly expanded by the user). */
    readonly canCollapse: ReadonlySet<PersonId>;
    /** Persons whose children block was demoted by auto-collapse this pass. */
    readonly autoCollapsed: ReadonlySet<PersonId>;
    /**
     * Per-card multi-union picker info (Phase 2). Keyed by personId; an
     * entry means the renderer should draw a `˅` on that card and use the
     * `alternates` for the picker menu. Persons without multi-union mates
     * have no entry.
     */
    readonly multiUnionMates: ReadonlyMap<PersonId, MultiUnionMate>;
    /**
     * Overlay segments (sworn bonds, transformations, severances).
     * Optional; empty/absent in v1 (Phase 0 of the relationship-vocabulary
     * plan). Phase 4 populates this from `tree.relationships[]` once schema
     * 3.1.0 lands. Renderers treat `undefined` and `[]` identically.
     */
    readonly overlays?: readonly OverlaySegment[];
    /**
     * Group frames (dynasties, houses, factions, etc.).
     * Optional; empty/absent in v1 (Phase 0 of the relationship-vocabulary
     * plan). Phase 6a populates this from `tree.groups[]` once schema
     * 3.3.0 lands. Renderers treat `undefined` and `[]` identically.
     */
    readonly groups?: readonly GroupFrame[];
    /**
     * Sibship brackets (twins, triplets, clone-batches, litters).
     * Optional; empty/absent in v1. Phase 6b populates this from
     * `tree.sibshipDecorators[]` once schema 3.4.0 lands. Renderers
     * treat `undefined` and `[]` identically.
     */
    readonly sibships?: readonly SibshipFrame[];
}
