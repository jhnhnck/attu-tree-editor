/*
 * FamilyTreeEditor - renderer-side layout shape consumed by TreeCanvas.
 *
 * This module owns the `HvLayoutResult` shape that the euclidean canvas
 * renders from and the adapter that bridges from the four-pass IR's
 * `PlacedGraph` into it. Lifted here in Phase 4.4.5 from the dual homes
 * of `$lib/layout/hvLayout.ts` (types) and `$lib/layout/ir.ts` (adapter),
 * neither of which expressed a clear ownership boundary: the types are
 * renderer-only, and the adapter is a thin geometry remap that only the
 * renderer needs.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { LayoutNodeId, PlacedGraph } from "$lib/layout/ir";
import { parseGhostNodeId } from "$lib/layout/ir";
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
     * boundary markers from this list. The IR adapter returns `[]` (the
     * new pipeline doesn't track components separately); consumers
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

/**
 * Convert a `PlacedGraph` (output of the four-pass IR) into the renderer's
 * canvas-layout shape. The transform is geometry-only: copies positions,
 * splits real-person vs ghost nodes, and gathers isolates as anything with
 * no parent/spouse edges incident.
 */
export function placedGraphToHvLayout(pg: PlacedGraph): HvLayoutResult {
    const positions = new Map<PersonId, { x: number; y: number }>();
    const ghosts: GhostNode[] = [];

    for (const [nodeId, node] of pg.nodes) {
        const nx = pg.x.get(nodeId) ?? 0;
        const ny = pg.y.get(nodeId) ?? 0;
        if (node.kind === "person") {
            positions.set(node.personId, { x: nx, y: ny });
        } else {
            const parsed = parseGhostNodeId(nodeId);
            if (parsed) {
                ghosts.push({ ghostOf: parsed.ghostOf, nearId: parsed.nearId, x: nx, y: ny });
            }
        }
    }

    const hasEdge = new Set<LayoutNodeId>();
    for (const e of pg.parentEdges) {
        hasEdge.add(e.parent);
        hasEdge.add(e.child);
    }
    for (const e of pg.spouseEdges) {
        hasEdge.add(e.a);
        hasEdge.add(e.b);
    }
    const isolated: PersonId[] = [];
    for (const [nodeId, node] of pg.nodes) {
        if (node.kind === "person" && !hasEdge.has(nodeId)) isolated.push(node.personId);
    }

    const personCount = [...pg.nodes.values()].filter((n) => n.kind === "person").length;

    return {
        positions,
        canvas: pg.bbox,
        components: [],
        isolated,
        ghosts,
        totalPeople: personCount,
        laidOutPeople: positions.size,
    };
}
