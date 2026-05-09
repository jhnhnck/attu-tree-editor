/*
 * FamilyTreeEditor - intermediate representation types for the layered layout pipeline.
 *
 * The layout pipeline is split into four pure passes, each consuming one IR
 * type and producing the next:
 *
 *   Tree + LayoutOverrides
 *     → layer()    → LayeredGraph   (assign ranks; insert ghosts as first-class nodes)
 *     → order()    → OrderedGraph   (crossing-minimisation; couple/sibling constraints)
 *     → place()    → PlacedGraph    (coordinate assignment; Brandes–Köpf)
 *     → route()    → RoutedGraph    (gutter-channel obstacle-avoiding edge routing)
 *
 * For the incremental migration, two adapter functions allow the existing
 * hvLayout output to be round-tripped through PlacedGraph so downstream
 * code can be ported pass-by-pass without a flag day.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";
import type { HvLayoutResult, GhostNode } from "$lib/layout/hvLayout";
import { ROW_H } from "$lib/layout/hvLayout";
import type { Segment } from "$lib/layout/edgeRouter";

// ---------------------------------------------------------------------------
// Core ID type
// ---------------------------------------------------------------------------

/**
 * A stable identifier for a layout node. For real people this is their
 * PersonId. For ghost duplicates it is `ghost:<ghostOf>|<nearId>`, matching
 * the existing `${ghostOf}|${nearId}` key convention used by edgeRouter's
 * ghostPositions map.
 */
export type LayoutNodeId = string;

/** Produce the canonical LayoutNodeId for a ghost copy. */
export function ghostNodeId(ghostOf: PersonId, nearId: PersonId): LayoutNodeId {
    return `ghost:${ghostOf}|${nearId}`;
}

/** Parse a ghost LayoutNodeId back to its constituent PersonIds, or null for real nodes. */
export function parseGhostNodeId(
    id: LayoutNodeId,
): { ghostOf: PersonId; nearId: PersonId } | null {
    if (!id.startsWith("ghost:")) return null;
    const rest = id.slice(6);
    const sep = rest.indexOf("|");
    if (sep === -1) return null;
    return { ghostOf: rest.slice(0, sep), nearId: rest.slice(sep + 1) };
}

// ---------------------------------------------------------------------------
// LayoutNode
// ---------------------------------------------------------------------------

export interface LayoutNode {
    readonly id: LayoutNodeId;
    readonly kind: "person" | "ghost";
    /** For real nodes: the person's own id. For ghosts: the id of the person being duplicated. */
    readonly personId: PersonId;
    /** Generation row index (0 = oldest). Computed by the layering pass. */
    readonly rank: number;
    /**
     * Adjacency-constraint key: nodes sharing this key must appear horizontally
     * adjacent in the ordering pass (i.e. spouse pairs).
     */
    readonly spouseGroup?: string;
    /**
     * Block key: nodes sharing this key must occupy contiguous order indices
     * in the ordering pass (i.e. sibling groups under one couple).
     */
    readonly siblingBlockId?: string;
    /**
     * Cluster key: nodes sharing this key must form a contiguous run within
     * their rank in the ordering pass. Used for cross-rank ghost groups (a
     * near person plus every ghost copy whose nearId is that person) so
     * multiple ghosts cluster around their near partner instead of drifting
     * to opposite ends of the rank.
     */
    readonly clusterBlockId?: string;
}

// ---------------------------------------------------------------------------
// Pass outputs
// ---------------------------------------------------------------------------

/** Output of the layering pass: nodes assigned to ranks, edges recorded. */
export interface LayeredGraph {
    /** All layout nodes, keyed by LayoutNodeId. */
    readonly nodes: ReadonlyMap<LayoutNodeId, LayoutNode>;
    /**
     * `ranks[r]` = ids of nodes at rank r, in insertion order (unordered
     * within rank — ordering is the job of the next pass).
     */
    readonly ranks: readonly (readonly LayoutNodeId[])[];
    /** Parent → child edges derived from the domain tree's motherId/fatherId links. */
    readonly parentEdges: readonly {
        readonly parent: LayoutNodeId;
        readonly child: LayoutNodeId;
        readonly coupleKey?: string;
    }[];
    /** Spouse edges derived from the domain tree's CoupleRecord list. */
    readonly spouseEdges: readonly {
        readonly a: LayoutNodeId;
        readonly b: LayoutNodeId;
        readonly coupleKey: string;
    }[];
}

/** Output of the ordering pass: within-rank ordering added. */
export interface OrderedGraph extends LayeredGraph {
    /** Maps each LayoutNodeId to its 0-based position within its rank. */
    readonly order: ReadonlyMap<LayoutNodeId, number>;
}

/** Output of the coordinate-assignment pass: unit-space x/y added. */
export interface PlacedGraph extends OrderedGraph {
    /** Unit-space top-left x for each node. */
    readonly x: ReadonlyMap<LayoutNodeId, number>;
    /** Unit-space top-left y for each node (= rank × ROW_H). */
    readonly y: ReadonlyMap<LayoutNodeId, number>;
    /** Bounding box in unit space. */
    readonly bbox: { readonly width: number; readonly height: number };
}

/** Output of the routing pass: edge segments added. */
export interface RoutedGraph {
    readonly placed: PlacedGraph;
    readonly segments: readonly Segment[];
}

// ---------------------------------------------------------------------------
// Override layer (Step 6)
// ---------------------------------------------------------------------------

/**
 * Persistent user overrides that survive re-layout.
 * - `pinned`: per-person x override (y is rank-derived and not pinnable).
 * - `swap`: pairs of node ids whose ordering should be forced-swapped after
 *   the crossing-minimisation pass.
 * - `laneHints`: per relation-group preferred gutter lane for the router.
 */
export interface LayoutOverrides {
    readonly pinned?: ReadonlyMap<PersonId, { readonly x: number }>;
    readonly swap?: ReadonlyArray<readonly [LayoutNodeId, LayoutNodeId]>;
    readonly laneHints?: ReadonlyMap<string, number>;
}

// ---------------------------------------------------------------------------
// Adapters — bridge between hvLayout and the new IR during migration
// ---------------------------------------------------------------------------

/**
 * Convert an `HvLayoutResult` (from the current hvLayout pipeline) into a
 * `PlacedGraph` so that downstream passes and the renderer can be ported
 * incrementally against the IR without a flag day.
 *
 * Edge data is derived from the domain `tree`; ghost nodes are promoted to
 * first-class LayoutNodes. The ordering within each rank is derived from the
 * x positions produced by hvLayout (left-to-right).
 */
export function hvLayoutToPlacedGraph(result: HvLayoutResult, tree: Tree): PlacedGraph {
    const nodes = new Map<LayoutNodeId, LayoutNode>();
    const x = new Map<LayoutNodeId, number>();
    const y = new Map<LayoutNodeId, number>();

    // Real person nodes
    for (const [id, pos] of result.positions) {
        const rank = Math.round(pos.y / ROW_H);
        nodes.set(id, { id, kind: "person", personId: id, rank });
        x.set(id, pos.x);
        y.set(id, pos.y);
    }

    // Ghost nodes — first-class participants in the IR
    for (const ghost of result.ghosts) {
        const nodeId = ghostNodeId(ghost.ghostOf, ghost.nearId);
        const rank = Math.round(ghost.y / ROW_H);
        nodes.set(nodeId, { id: nodeId, kind: "ghost", personId: ghost.ghostOf, rank });
        x.set(nodeId, ghost.x);
        y.set(nodeId, ghost.y);
    }

    // Build ranks arrays: group node ids by rank, then sort within rank by x
    const rankBuckets = new Map<number, LayoutNodeId[]>();
    for (const [nodeId, node] of nodes) {
        const bucket = rankBuckets.get(node.rank);
        if (bucket) bucket.push(nodeId);
        else rankBuckets.set(node.rank, [nodeId]);
    }
    const maxRank = rankBuckets.size > 0 ? Math.max(...rankBuckets.keys()) : -1;
    const rankArrays: (readonly LayoutNodeId[])[] = [];
    for (let r = 0; r <= maxRank; r++) {
        rankArrays.push(rankBuckets.get(r) ?? []);
    }

    // Build ordering within each rank from x positions (left-to-right)
    const order = new Map<LayoutNodeId, number>();
    for (const rankIds of rankArrays) {
        const sorted = [...rankIds].sort((a, b) => (x.get(a) ?? 0) - (x.get(b) ?? 0));
        sorted.forEach((id, i) => order.set(id, i));
    }

    // Parent edges: follow motherId/fatherId links visible in positions
    const parentEdges: {
        parent: LayoutNodeId;
        child: LayoutNodeId;
        coupleKey?: string;
    }[] = [];
    for (const person of Object.values(tree.people)) {
        if (!result.positions.has(person.id)) continue;
        if (person.motherId && result.positions.has(person.motherId)) {
            parentEdges.push({ parent: person.motherId, child: person.id });
        }
        if (person.fatherId && result.positions.has(person.fatherId)) {
            parentEdges.push({ parent: person.fatherId, child: person.id });
        }
    }

    // Spouse edges: from CoupleRecord, both members visible
    const spouseEdges: { a: LayoutNodeId; b: LayoutNodeId; coupleKey: string }[] = [];
    for (const couple of tree.couples) {
        if (couple.leftId === couple.rightId) continue;
        if (result.positions.has(couple.leftId) && result.positions.has(couple.rightId)) {
            spouseEdges.push({
                a: couple.leftId,
                b: couple.rightId,
                coupleKey: `${couple.leftId}|${couple.rightId}`,
            });
        }
    }

    return { nodes, ranks: rankArrays, parentEdges, spouseEdges, order, x, y, bbox: result.canvas };
}

// ---------------------------------------------------------------------------
// Wire representations — Maps converted to [K, V][] for structured-clone transfer
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Overrides wire representation
// ---------------------------------------------------------------------------

/** `LayoutOverrides` serialised for postMessage (Maps → entry arrays). */
export interface LayoutOverridesWire {
    readonly pinned?: [PersonId, { readonly x: number }][];
    readonly swap?: ReadonlyArray<readonly [LayoutNodeId, LayoutNodeId]>;
    readonly laneHints?: [string, number][];
}

export function serializeOverrides(o: LayoutOverrides): LayoutOverridesWire {
    return {
        ...(o.pinned ? { pinned: [...o.pinned] } : {}),
        ...(o.swap ? { swap: o.swap } : {}),
        ...(o.laneHints ? { laneHints: [...o.laneHints] } : {}),
    };
}

export function hydrateOverrides(w: LayoutOverridesWire): LayoutOverrides {
    return {
        ...(w.pinned ? { pinned: new Map(w.pinned) } : {}),
        ...(w.swap ? { swap: w.swap } : {}),
        ...(w.laneHints ? { laneHints: new Map(w.laneHints) } : {}),
    };
}

// ---------------------------------------------------------------------------
// Wire representations — Maps converted to [K, V][] for structured-clone transfer
// ---------------------------------------------------------------------------

/** `LayeredGraph` with every `Map` flattened to an entry array for postMessage. */
export interface LayeredGraphWire {
    readonly nodes: [LayoutNodeId, LayoutNode][];
    readonly ranks: LayeredGraph["ranks"];
    readonly parentEdges: LayeredGraph["parentEdges"];
    readonly spouseEdges: LayeredGraph["spouseEdges"];
}
/** `OrderedGraph` wire form. */
export interface OrderedGraphWire extends LayeredGraphWire {
    readonly order: [LayoutNodeId, number][];
}
/** `PlacedGraph` wire form. */
export interface PlacedGraphWire extends OrderedGraphWire {
    readonly x: [LayoutNodeId, number][];
    readonly y: [LayoutNodeId, number][];
    readonly bbox: PlacedGraph["bbox"];
}

export function serializeLayered(g: LayeredGraph): LayeredGraphWire {
    return { nodes: [...g.nodes], ranks: g.ranks, parentEdges: g.parentEdges, spouseEdges: g.spouseEdges };
}
export function serializeOrdered(g: OrderedGraph): OrderedGraphWire {
    return { ...serializeLayered(g), order: [...g.order] };
}
export function serializePlaced(g: PlacedGraph): PlacedGraphWire {
    return { ...serializeOrdered(g), x: [...g.x], y: [...g.y], bbox: g.bbox };
}

export function hydrateLayered(w: LayeredGraphWire): LayeredGraph {
    return { nodes: new Map(w.nodes), ranks: w.ranks, parentEdges: w.parentEdges, spouseEdges: w.spouseEdges };
}
export function hydrateOrdered(w: OrderedGraphWire): OrderedGraph {
    return { ...hydrateLayered(w), order: new Map(w.order) };
}
export function hydratePlaced(w: PlacedGraphWire): PlacedGraph {
    return { ...hydrateOrdered(w), x: new Map(w.x), y: new Map(w.y), bbox: w.bbox };
}

/**
 * Convert a `PlacedGraph` back into an `HvLayoutResult` shape for use by
 * existing rendering code during the migration.
 *
 * The `components` field is returned as an empty array — it is internal
 * hvLayout metadata that the new pipeline will compute directly. All other
 * fields are derived from the PlacedGraph's node/position data.
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

    // Isolated = real nodes with no recorded edges (components of size 1)
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
