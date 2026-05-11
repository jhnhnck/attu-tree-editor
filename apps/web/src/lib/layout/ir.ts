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
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";
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
export function parseGhostNodeId(id: LayoutNodeId): { ghostOf: PersonId; nearId: PersonId } | null {
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
    /**
     * Person ids implicated in a parent-DAG cycle. Kahn's BFS in computeRanks
     * cannot rank these (their visible in-degree never reaches zero); they
     * fall back to rank 0. Surfaced for diagnosis via window.__treeDebug.
     * Empty / absent when the visible graph is acyclic.
     */
    readonly cycleNodes?: readonly LayoutNodeId[];
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

/**
 * A non-fatal anomaly captured during a layout pass. The pipeline keeps
 * running and emits a partial result; the warning surfaces on
 * `window.__treeDebug.warnings[]` for diagnosis.
 *
 * `kind` is a small closed vocabulary so consumers can filter without parsing
 * messages. New kinds can be added without breaking older readers (unknown
 * kinds simply aren't filtered on).
 */
export interface LayoutWarning {
    readonly kind: "negative-drop" | "rank-cycle" | "route-budget" | "other";
    readonly pass: "layer" | "order" | "place" | "route";
    readonly message: string;
    /** ids most directly implicated; usually one. Optional. */
    readonly ids?: readonly LayoutNodeId[];
    /** free-form numeric context (e.g. y1, y2, drop, span). Optional. */
    readonly data?: Readonly<Record<string, number | string>>;
}

/** Output of the routing pass: edge segments + non-fatal warnings. */
export interface RoutedGraph {
    readonly placed: PlacedGraph;
    readonly segments: readonly Segment[];
    /** Non-fatal anomalies from the routing pass. Empty on a clean run. */
    readonly warnings: readonly LayoutWarning[];
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
    readonly cycleNodes?: readonly LayoutNodeId[];
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
    return {
        nodes: [...g.nodes],
        ranks: g.ranks,
        parentEdges: g.parentEdges,
        spouseEdges: g.spouseEdges,
        ...(g.cycleNodes !== undefined && g.cycleNodes.length > 0
            ? { cycleNodes: g.cycleNodes }
            : {}),
    };
}
export function serializeOrdered(g: OrderedGraph): OrderedGraphWire {
    return { ...serializeLayered(g), order: [...g.order] };
}
export function serializePlaced(g: PlacedGraph): PlacedGraphWire {
    return { ...serializeOrdered(g), x: [...g.x], y: [...g.y], bbox: g.bbox };
}

export function hydrateLayered(w: LayeredGraphWire): LayeredGraph {
    return {
        nodes: new Map(w.nodes),
        ranks: w.ranks,
        parentEdges: w.parentEdges,
        spouseEdges: w.spouseEdges,
        ...(w.cycleNodes !== undefined ? { cycleNodes: w.cycleNodes } : {}),
    };
}
export function hydrateOrdered(w: OrderedGraphWire): OrderedGraph {
    return { ...hydrateLayered(w), order: new Map(w.order) };
}
export function hydratePlaced(w: PlacedGraphWire): PlacedGraph {
    return { ...hydrateOrdered(w), x: new Map(w.x), y: new Map(w.y), bbox: w.bbox };
}
