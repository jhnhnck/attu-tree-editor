/*
 * FamilyTreeEditor - LayoutEngine + EdgeRouter boundary types.
 *
 * Phase 0 walking-skeleton scaffold. The interfaces here are the seam every
 * later phase plugs into:
 *   - LayeredEngine    (engines/layered-hv)        wraps the existing pipeline
 *   - StubHyperbolicEngine (engines/hyperbolic-lr) returns z=0 placeholders
 *   - StubLibavoidRouter (routers/libavoid)        returns straight-line polylines
 *   - stubDoiPass       (lib/layout/doi.ts)        pass-through
 *
 * The worker does not dispatch on these yet (Phase 3) and the renderer does
 * not consume `LayoutResult` directly yet (Phase 3). Engines and routers
 * declared here exist so future phases replace bodies, not introduce new
 * layers.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { LayoutNode, LayoutNodeId, LayoutOverrides } from "$lib/layout/ir";
import type { PersonId, Tree } from "$lib/domain/types";

// ---------------------------------------------------------------------------
// Position spaces
// ---------------------------------------------------------------------------

/**
 * Minimal complex-number value used in the hyperbolic position branch. Phase 5
 * promotes this to `lib/layout/hyperbolic/poincare.ts` with full primitives;
 * Phase 0 only needs the type.
 */
export interface Complex {
    readonly re: number;
    readonly im: number;
}

/**
 * Discriminated union over the two position spaces the project will support.
 * The renderer dispatches on `space` to pick the right canvas component;
 * engines never mix the two within one `LayoutResult`.
 */
export type LayoutPosition =
    | { readonly space: "euclidean"; readonly x: number; readonly y: number }
    | { readonly space: "hyperbolic"; readonly z: Complex };

// ---------------------------------------------------------------------------
// Edge primitives
// ---------------------------------------------------------------------------

/**
 * The geometric route emitted by an engine + router for a single visual
 * edge. `polyline` is the libavoid output; `geodesic-arc` is the hyperbolic
 * primitive; `spline` is the bundled-edge primitive (HEB) used in both
 * spaces. The renderer paints whichever variant arrives.
 */
export type EdgeRoute =
    | {
          readonly kind: "polyline";
          readonly points: readonly LayoutPosition[];
          readonly corners?: "sharp" | "rounded";
      }
    | {
          readonly kind: "geodesic-arc";
          readonly from: LayoutPosition;
          readonly to: LayoutPosition;
      }
    | {
          readonly kind: "spline";
          readonly controls: readonly LayoutPosition[];
      };

/** Visual style for an edge. Maps to CSS classes in `EdgeLayer.svelte`. */
export type EdgeStyle = "blood" | "adopted" | "half" | "married" | "divorced";

/**
 * One painted edge (or one bundle merged at the renderer). Replaces the
 * legacy `Segment.kind = "bond" | "parent-drop" | ...` grammar with a
 * route + style + bundle key, decoupled from rank/x/y semantics.
 */
export interface LayoutEdge {
    readonly id: string;
    /** People implicated in this edge — used for hover-trace highlighting. */
    readonly persons: readonly PersonId[];
    readonly style: EdgeStyle;
    readonly route: EdgeRoute;
    /**
     * Family-fan key. Edges sharing a `bundleId` collapse to one `<path>` in
     * the renderer (Phase 4.3). Conventional values:
     *   - `couple:<a>|<b>:<unionIndex>` for joint-child fans
     *   - `single:<parent>|<child>` for single-parent drops
     *   - undefined for standalone edges
     */
    readonly bundleId?: string;
}

/**
 * The "who connects to whom and why" view that engines emit and routers
 * consume. Logical edges are space-agnostic — `LayeredEngine` and
 * `StubHyperbolicEngine` both produce them. Routers (Phase 4 libavoid)
 * turn them into geometric routes against `LayoutResult.obstacles`.
 */
export interface LogicalEdge {
    readonly id: string;
    readonly from: LayoutNodeId;
    readonly to: LayoutNodeId;
    readonly relationship: "parent" | "spouse" | "joint-child";
    readonly persons: readonly PersonId[];
    readonly style: EdgeStyle;
    /** Hint for downstream bundling. See `LayoutEdge.bundleId`. */
    readonly bundleHint?: string;
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------

/**
 * Card AABB in layout space. Engines populate `obstacles`; libavoid routes
 * around them. Hyperbolic engine returns an empty array (geodesic arcs avoid
 * cards by construction of the radial wedge layout).
 */
export interface LayoutObstacle {
    readonly id: LayoutNodeId;
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
}

// ---------------------------------------------------------------------------
// LayoutEngine + EdgeRouter
// ---------------------------------------------------------------------------

export interface LayoutInput {
    readonly tree: Tree;
    readonly visible: ReadonlySet<PersonId>;
    readonly focus: PersonId;
    readonly overrides?: LayoutOverrides;
}

export interface LayoutResult {
    /** Echoes the engine that produced this result; useful for cache keys. */
    readonly engineId: string;
    /** Determines which canvas component renders this result. */
    readonly space: "euclidean" | "hyperbolic";
    readonly positions: ReadonlyMap<LayoutNodeId, LayoutPosition>;
    readonly edges: readonly LayoutEdge[];
    readonly bbox?: { readonly width: number; readonly height: number };
    /** Full node table for downstream passes (DOI, hover, debug). */
    readonly nodes: ReadonlyMap<LayoutNodeId, LayoutNode>;
    /**
     * Card AABBs in layout space for the router. Empty for hyperbolic
     * (no router applies).
     */
    readonly obstacles: readonly LayoutObstacle[];
}

export interface LayoutEngine {
    /** Stable identifier matched by `LayoutInput.engineId`. */
    readonly id: string;
    layout(input: LayoutInput): LayoutResult;
}

/**
 * Edge router contract. Engines emit positions + obstacles + a logical edge
 * list; routers emit geometric routes. Phase 4 swaps `StubLibavoidRouter`
 * for the real libavoid bridge here without touching this interface.
 */
export interface EdgeRouter {
    readonly id: string;
    route(
        positions: ReadonlyMap<LayoutNodeId, LayoutPosition>,
        obstacles: readonly LayoutObstacle[],
        edges: readonly LogicalEdge[],
    ): readonly LayoutEdge[];
}
