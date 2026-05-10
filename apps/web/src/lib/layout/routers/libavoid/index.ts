/*
 * FamilyTreeEditor - StubLibavoidRouter: straight-line polyline placeholder.
 *
 * Phase 0 walking-skeleton scaffold. Implements `EdgeRouter` by returning a
 * 2-point polyline per logical edge — no obstacle avoidance, no port
 * assignment, no nudging. Phase 4 swaps the body for the real libavoid-js
 * bridge: WASM router init, `ShapeRef` per obstacle, `ConnRef` per logical
 * edge with directional ports, `processTransaction()`, `displayRoute()`
 * polylines, sibling-fan bundling, deletion of WASM memory.
 *
 * Not invoked yet — Phase 4 wires it in once the spike has validated perf,
 * WASM-in-worker, and LGPL compliance.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type {
    EdgeRouter,
    LayoutEdge,
    LayoutObstacle,
    LayoutPosition,
    LogicalEdge,
} from "$lib/layout/engine";
import type { LayoutNodeId } from "$lib/layout/ir";

export class StubLibavoidRouter implements EdgeRouter {
    readonly id = "libavoid-stub";

    route(
        positions: ReadonlyMap<LayoutNodeId, LayoutPosition>,
        _obstacles: readonly LayoutObstacle[],
        edges: readonly LogicalEdge[],
    ): readonly LayoutEdge[] {
        const out: LayoutEdge[] = [];
        for (const e of edges) {
            const from = positions.get(e.from);
            const to = positions.get(e.to);
            if (!from || !to) continue;
            const edge: LayoutEdge = {
                id: e.id,
                persons: e.persons,
                style: e.style,
                route: { kind: "polyline", points: [from, to], corners: "sharp" },
                ...(e.bundleHint !== undefined ? { bundleId: e.bundleHint } : {}),
            };
            out.push(edge);
        }
        return out;
    }
}
