/*
 * FamilyTreeEditor - LayeredEngine: wraps the existing four-pass pipeline.
 *
 * Phase 0 walking-skeleton scaffold. Implements `LayoutEngine` by composing
 * the existing layer → order → place → route passes and adapting the output
 * to the new `LayoutResult` shape. The legacy four-tuple
 * (`{ layered, ordered, placed, segments }`) the worker still posts to the
 * renderer is exposed via `legacy` on the return value so the worker can
 * keep emitting the legacy wire format unchanged through Phase 3.
 *
 * Not invoked yet — Phase 3 wires the worker to dispatch through this.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { layer } from "$lib/layout/passes/layer";
import { order } from "$lib/layout/passes/order";
import { place } from "$lib/layout/passes/place";
import { route } from "$lib/layout/passes/route";
import { PERSON_W } from "$lib/layout/hvLayout";
import type {
    LayeredGraph,
    LayoutNodeId,
    LayoutWarning,
    OrderedGraph,
    PlacedGraph,
} from "$lib/layout/ir";
import type { Segment } from "$lib/layout/edgeRouter";
import type {
    EdgeStyle,
    LayoutEdge,
    LayoutEngine,
    LayoutInput,
    LayoutObstacle,
    LayoutPosition,
    LayoutResult,
    LogicalEdge,
} from "$lib/layout/engine";

/** Card height in unit space — matches `route.ts`'s CARD_H constant. */
const CARD_H = 1.2;

/**
 * `LayoutResult` augmented with the legacy four-tuple the worker still
 * posts to the renderer. Phase 3 deletes this branch and the renderer
 * consumes `LayoutResult` directly.
 */
export interface LayeredEngineResult extends LayoutResult {
    readonly space: "euclidean";
    readonly legacy: {
        readonly layered: LayeredGraph;
        readonly ordered: OrderedGraph;
        readonly placed: PlacedGraph;
        readonly segments: readonly Segment[];
        readonly warnings: readonly LayoutWarning[];
    };
}

export class LayeredEngine implements LayoutEngine {
    readonly id = "layered";

    layout(input: LayoutInput): LayeredEngineResult {
        const lg = layer(input.tree, input.visible, input.focus, input.overrides);
        const og = order(lg, input.overrides);
        const pg = place(og, input.overrides);
        const { segments, warnings } = route(pg, input.tree);

        return {
            engineId: this.id,
            space: "euclidean",
            positions: extractPositions(pg),
            edges: segmentsToLayoutEdges(segments),
            bbox: pg.bbox,
            nodes: pg.nodes,
            obstacles: extractObstacles(pg),
            legacy: { layered: lg, ordered: og, placed: pg, segments, warnings },
        };
    }
}

function extractPositions(pg: PlacedGraph): ReadonlyMap<LayoutNodeId, LayoutPosition> {
    const out = new Map<LayoutNodeId, LayoutPosition>();
    for (const id of pg.nodes.keys()) {
        out.set(id, {
            space: "euclidean",
            x: pg.x.get(id) ?? 0,
            y: pg.y.get(id) ?? 0,
        });
    }
    return out;
}

function extractObstacles(pg: PlacedGraph): readonly LayoutObstacle[] {
    const out: LayoutObstacle[] = [];
    for (const [id] of pg.nodes) {
        out.push({
            id,
            x: pg.x.get(id) ?? 0,
            y: pg.y.get(id) ?? 0,
            w: PERSON_W,
            h: CARD_H,
        });
    }
    return out;
}

/**
 * Adapt legacy `Segment[]` to `LayoutEdge[]`. Each segment becomes a
 * 2-point polyline with the role-derived style; bundling (Phase 4.3)
 * collapses runs sharing a `bundleId` into one `<path>` at render time.
 */
function segmentsToLayoutEdges(segments: readonly Segment[]): readonly LayoutEdge[] {
    const out: LayoutEdge[] = [];
    for (const s of segments) {
        const style = roleToStyle(s);
        const points: LayoutPosition[] = [
            { space: "euclidean", x: s.x1, y: s.y1 },
            { space: "euclidean", x: s.x2, y: s.y2 },
        ];
        const edge: LayoutEdge = {
            id: s.id,
            persons: s.persons,
            style,
            route: { kind: "polyline", points, corners: "sharp" },
        };
        out.push(edge);
    }
    return out;
}

/**
 * Map the legacy `Segment` role + kind to `EdgeStyle`. Drops and bus
 * segments inherit their parent edge's style; the legacy `role` field
 * already carries "blood" / "married" / "divorced" so this is mostly a
 * passthrough.
 */
function roleToStyle(s: Segment): EdgeStyle {
    const role = s.role;
    if (role === "married") return "married";
    if (role === "divorced") return "divorced";
    if (role === "adopted") return "adopted";
    if (role === "half") return "half";
    return "blood";
}

/**
 * Extract the logical edges (parent / spouse / joint-child) from a placed
 * graph. Phase 4's libavoid bridge consumes this; Phase 0 emits it through
 * the engine for future use.
 */
export function logicalEdgesFor(pg: PlacedGraph): readonly LogicalEdge[] {
    const out: LogicalEdge[] = [];
    for (const e of pg.parentEdges) {
        out.push({
            id: `parent:${e.parent}|${e.child}`,
            from: e.parent,
            to: e.child,
            relationship: "parent",
            persons: [e.parent, e.child],
            style: "blood",
            ...(e.coupleKey !== undefined ? { bundleHint: `couple:${e.coupleKey}` } : {}),
        });
    }
    for (const e of pg.spouseEdges) {
        out.push({
            id: `spouse:${e.coupleKey}`,
            from: e.a,
            to: e.b,
            relationship: "spouse",
            persons: [e.a, e.b],
            style: "married",
            bundleHint: `couple:${e.coupleKey}`,
        });
    }
    return out;
}
