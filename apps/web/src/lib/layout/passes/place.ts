/*
 * FamilyTreeEditor - coordinate assignment pass.
 *
 * `place()` is the third pass in the layered layout pipeline:
 *
 *   order()  → OrderedGraph
 *     → place()  → PlacedGraph  (this file)
 *     → route()  → RoutedGraph
 *
 * Algorithm: four-pass median-compact (Brandes–Köpf-inspired).
 *   1. Four independent passes — (top-down | bottom-up) × (left-compact | right-compact):
 *      a. Compute a preferred x for each node = median of its cross-rank
 *         neighbours' current x (already updated earlier in the same pass).
 *      b. Compact within each rank in the pass's horizontal direction so that
 *         no two nodes in the same rank are closer than the required gap.
 *   2. Normalise each pass so its leftmost node is at x = 0.
 *   3. Average the four passes; final separation enforcement cleans up any
 *      sub-gap values introduced by averaging.
 *   4. Apply pinned overrides (x only; y is rank-derived) then re-enforce.
 *   5. Translate so overall min x = 0; compute bounding box.
 *
 * Gap policy:
 *   - DELTA (= PERSON_W + SIBLING_GAP = 2.5 u) between adjacent nodes that
 *     share a parent, are spouses, or are a ghost/near pair.
 *   - BRANCH_GAP (= PERSON_W + SIBLING_GAP * 4 = 4.0 u) between adjacent
 *     nodes from unrelated branches. This creates a clear visual grouping
 *     between family clusters without requiring explicit component detection.
 *
 * y = rank × ROW_H (exact; not influenced by overrides).
 *
 * Type-1 conflict marking: edges that involve a ghost node are treated as
 * "inner segments". Non-ghost edges that cross an inner segment are excluded
 * from the median computation so that ghost alignment does not corrupt the
 * layout of real parent-child pairs.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { PERSON_W, ROW_H, SIBLING_GAP } from "$lib/layout/constants";
import { parseGhostNodeId } from "$lib/layout/ir";
import type {
    LayoutNode,
    LayoutNodeId,
    LayoutOverrides,
    OrderedGraph,
    PlacedGraph,
} from "$lib/layout/ir";
import type { PersonId } from "$lib/domain/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum distance between left edges of adjacent nodes in the same rank. */
const DELTA = PERSON_W + SIBLING_GAP; // 2.5 units

/** Minimum distance between left edges of nodes from different family branches. */
const BRANCH_GAP = PERSON_W + SIBLING_GAP * 2; // 3.0 units

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assign unit-space x/y coordinates to every node in an OrderedGraph.
 *
 * @param graph     - Output of the ordering pass.
 * @param overrides - Optional pinned x values and lane hints (applied here:
 *                    pinned x only; swap already consumed by order()).
 */
export function place(graph: OrderedGraph, overrides?: LayoutOverrides): PlacedGraph {
    const { nodes } = graph;

    if (nodes.size === 0) {
        return { ...graph, x: new Map(), y: new Map(), bbox: { width: 1, height: 1 } };
    }

    // Sort each rank by order position (order() gives 0-based indices per rank)
    const ranksOrdered: LayoutNodeId[][] = graph.ranks.map((rank) =>
        [...rank].sort((a, b) => (graph.order.get(a) ?? 0) - (graph.order.get(b) ?? 0)),
    );

    // y = rank * ROW_H (exact; determined solely by layering, not by this pass)
    const y = new Map<LayoutNodeId, number>();
    for (const [id, node] of nodes) y.set(id, node.rank * ROW_H);

    // Build cross-rank adjacency for x alignment
    const parentsOf = new Map<LayoutNodeId, LayoutNodeId[]>();
    const childrenOf = new Map<LayoutNodeId, LayoutNodeId[]>();
    for (const e of graph.parentEdges) {
        push(parentsOf, e.child, e.parent);
        push(childrenOf, e.parent, e.child);
    }

    // ---------------------------------------------------------------------------
    // Gap policy: build rankGaps[ri][i] = min gap before node at position i in
    // rank ri (0 for the leftmost node in each rank).
    //
    // Two adjacent nodes get DELTA when they:
    //   • share at least one common parent (siblings / half-siblings), OR
    //   • are spouses (appear in a spouseEdge), OR
    //   • are a ghost/near pair (ghost node placed at its partner's rank), OR
    //   • are two ghosts whose nearId is the same person (both members of
    //     one near's ghost cluster, placed contiguously by order()).
    // All other adjacent pairs get BRANCH_GAP.
    // ---------------------------------------------------------------------------
    const closePairs = new Set<string>();
    for (const e of graph.spouseEdges) {
        closePairs.add(`${e.a}|${e.b}`);
        closePairs.add(`${e.b}|${e.a}`);
    }
    const ghostsByNearId = new Map<LayoutNodeId, LayoutNodeId[]>();
    for (const [nodeId, node] of nodes) {
        if (node.kind !== "ghost") continue;
        const g = parseGhostNodeId(nodeId);
        if (!g) continue;
        closePairs.add(`${nodeId}|${g.nearId}`);
        closePairs.add(`${g.nearId}|${nodeId}`);
        const list = ghostsByNearId.get(g.nearId);
        if (list) list.push(nodeId);
        else ghostsByNearId.set(g.nearId, [nodeId]);
    }
    for (const ghostList of ghostsByNearId.values()) {
        if (ghostList.length < 2) continue;
        for (let i = 0; i < ghostList.length; i++) {
            for (let j = i + 1; j < ghostList.length; j++) {
                closePairs.add(`${ghostList[i]!}|${ghostList[j]!}`);
                closePairs.add(`${ghostList[j]!}|${ghostList[i]!}`);
            }
        }
    }

    // rankGaps[ri][i] = min gap to apply BEFORE node at position i in rank ri.
    // gaps[0] is always 0 (no left neighbour).
    const rankGaps: number[][] = ranksOrdered.map((rank) => {
        const gaps: number[] = [0];
        for (let i = 1; i < rank.length; i++) {
            const prev = rank[i - 1]!;
            const curr = rank[i]!;
            const prevParents = parentsOf.get(prev) ?? [];
            const currParents = parentsOf.get(curr) ?? [];
            const close =
                prevParents.some((p) => currParents.includes(p)) ||
                closePairs.has(`${prev}|${curr}`);
            gaps.push(close ? DELTA : BRANCH_GAP);
        }
        return gaps;
    });

    // Type-1 conflict detection: mark non-ghost edges that cross ghost edges
    const conflicted = markType1Conflicts(ranksOrdered, nodes, graph.parentEdges);

    // Four alignment passes
    const passes: Map<LayoutNodeId, number>[] = [];
    for (const vDir of ["TB", "BT"] as const) {
        for (const hDir of ["LR", "RL"] as const) {
            const xi = computePass(
                ranksOrdered,
                parentsOf,
                childrenOf,
                conflicted,
                vDir,
                hDir,
                rankGaps,
            );
            normalise(xi, ranksOrdered); // shift so leftmost node is at x = 0
            passes.push(xi);
        }
    }

    // Average the four passes
    const x = new Map<LayoutNodeId, number>();
    for (const [id] of nodes) {
        let sum = 0;
        for (const xi of passes) sum += xi.get(id) ?? 0;
        x.set(id, sum / 4);
    }

    // Enforce minimum separation (averaging can create sub-gap values)
    enforceSeparation(x, ranksOrdered, rankGaps);

    // Center each sibling block under its parent(s). The B-K averaging leaves
    // children offset when their initial order indices are far from parent
    // positions; this post-pass corrects that directly.
    centerUnderParents(x, ranksOrdered, graph.parentEdges, nodes, rankGaps);

    // Apply pinned overrides (x only)
    if (overrides?.pinned) {
        applyPinned(x, overrides.pinned, ranksOrdered, rankGaps);
    }

    // Translate so min x = 0
    let minX = Infinity;
    for (const v of x.values()) if (v < minX) minX = v;
    if (isFinite(minX) && minX !== 0) {
        for (const [id, v] of x) x.set(id, v - minX);
    }

    // Compute bounding box
    let maxX = 0;
    let maxY = 0;
    for (const [id] of nodes) {
        const xv = x.get(id) ?? 0;
        const yv = y.get(id) ?? 0;
        if (xv + PERSON_W > maxX) maxX = xv + PERSON_W;
        if (yv + ROW_H > maxY) maxY = yv + ROW_H;
    }

    return {
        ...graph,
        x,
        y,
        bbox: { width: Math.max(maxX, 1), height: Math.max(maxY, 1) },
    };
}

// ---------------------------------------------------------------------------
// Single alignment pass
// ---------------------------------------------------------------------------

/**
 * One of the four alignment passes.
 *
 * vDir = "TB": compute preferred x from parents (top-down propagation).
 * vDir = "BT": compute preferred x from children (bottom-up propagation).
 * hDir = "LR": compact left-to-right within each rank (left-biased).
 * hDir = "RL": compact right-to-left within each rank (right-biased).
 *
 * rankGaps[ri][i] = minimum gap before node at position i in rank ri.
 */
function computePass(
    ranksOrdered: readonly (readonly LayoutNodeId[])[],
    parentsOf: ReadonlyMap<LayoutNodeId, LayoutNodeId[]>,
    childrenOf: ReadonlyMap<LayoutNodeId, LayoutNodeId[]>,
    conflicted: ReadonlySet<string>,
    vDir: "TB" | "BT",
    hDir: "LR" | "RL",
    rankGaps: readonly (readonly number[])[],
): Map<LayoutNodeId, number> {
    // Initialise: cumulative-gap positions so every node starts at a valid
    // non-overlapping location that already respects DELTA vs BRANCH_GAP.
    const x = new Map<LayoutNodeId, number>();
    for (let ri = 0; ri < ranksOrdered.length; ri++) {
        const rank = ranksOrdered[ri]!;
        const gaps = rankGaps[ri]!;
        let cumX = 0;
        for (let i = 0; i < rank.length; i++) {
            x.set(rank[i]!, cumX);
            if (i + 1 < rank.length) cumX += gaps[i + 1]!;
        }
    }

    // Median propagation: sweep in vDir direction, updating each node's x to
    // the median of its cross-rank neighbours' (already-updated) x.
    const ranks = vDir === "TB" ? ranksOrdered : [...ranksOrdered].reverse();
    const neighborMap = vDir === "TB" ? parentsOf : childrenOf;

    for (let ri = 1; ri < ranks.length; ri++) {
        const rank = ranks[ri]!;
        for (const v of rank) {
            const nbrs = neighborMap.get(v) ?? [];
            // Skip edges flagged as type-1 conflicts
            const valid = nbrs.filter((u) => {
                const [parent, child] = vDir === "TB" ? [u, v] : [v, u];
                return !conflicted.has(`${parent}|${child}`);
            });
            if (valid.length > 0) {
                x.set(v, median(valid.map((u) => x.get(u) ?? 0)));
            }
        }
    }

    // Compaction: sweep each rank in hDir to enforce gap separation.
    // For LR: cursor tracks right edge of the last-placed node; each new node
    //   must be at least rankGaps[ri][i] to the right of the cursor.
    // For RL: cursor tracks left edge of the last-placed node (from the right);
    //   each new node must be at most cursor - rankGaps[ri][i+1] from the left.
    for (let ri = 0; ri < ranksOrdered.length; ri++) {
        const rank = ranksOrdered[ri]!;
        const gaps = rankGaps[ri]!;
        if (hDir === "LR") {
            let cursor = -Infinity;
            for (let i = 0; i < rank.length; i++) {
                const v = rank[i]!;
                const pref = x.get(v) ?? 0;
                const actual = Math.max(pref, cursor + (gaps[i] ?? DELTA));
                x.set(v, actual);
                cursor = actual;
            }
        } else {
            let cursor = Infinity;
            for (let i = rank.length - 1; i >= 0; i--) {
                const v = rank[i]!;
                const pref = x.get(v) ?? 0;
                // gap to the right of node i = gap before node i+1
                const gapRight = i + 1 < rank.length ? (gaps[i + 1] ?? DELTA) : 0;
                const actual = Math.min(pref, cursor - gapRight);
                x.set(v, actual);
                cursor = actual;
            }
        }
    }

    return x;
}

// ---------------------------------------------------------------------------
// Type-1 conflict detection
// ---------------------------------------------------------------------------

/**
 * Return the set of "parent|child" edge keys that are type-1 conflicted:
 * a non-ghost edge (u, v) is conflicted when it crosses any ghost edge at
 * the same rank boundary, because allowing it into the median computation
 * would corrupt the alignment of the ghost's real counterpart.
 */
function markType1Conflicts(
    ranksOrdered: readonly (readonly LayoutNodeId[])[],
    nodes: ReadonlyMap<LayoutNodeId, LayoutNode>,
    parentEdges: readonly { parent: LayoutNodeId; child: LayoutNodeId }[],
): Set<string> {
    const conflicted = new Set<string>();

    // Position-in-rank lookup (used to detect crossing)
    const pos = new Map<LayoutNodeId, number>();
    for (const rank of ranksOrdered) {
        rank.forEach((id, i) => pos.set(id, i));
    }

    // Check each adjacent rank pair
    for (let r = 1; r < ranksOrdered.length; r++) {
        // Partition edges at this rank boundary into ghost (inner) and non-ghost
        const ghostEdges: { p: number; c: number }[] = [];
        const realEdges: { parent: LayoutNodeId; child: LayoutNodeId; p: number; c: number }[] = [];

        for (const e of parentEdges) {
            const pNode = nodes.get(e.parent);
            const cNode = nodes.get(e.child);
            if (!pNode || !cNode) continue;
            if (pNode.rank !== r - 1 || cNode.rank !== r) continue;
            const p = pos.get(e.parent) ?? 0;
            const c = pos.get(e.child) ?? 0;
            if (pNode.kind === "ghost" || cNode.kind === "ghost") {
                ghostEdges.push({ p, c });
            } else {
                realEdges.push({ parent: e.parent, child: e.child, p, c });
            }
        }

        if (ghostEdges.length === 0) continue;

        for (const re of realEdges) {
            for (const ge of ghostEdges) {
                // Two edges cross when one goes "left-right" and the other "right-left"
                if ((re.p < ge.p && re.c > ge.c) || (re.p > ge.p && re.c < ge.c)) {
                    conflicted.add(`${re.parent}|${re.child}`);
                    break;
                }
            }
        }
    }

    return conflicted;
}

// ---------------------------------------------------------------------------
// Post-processing helpers
// ---------------------------------------------------------------------------

/** Shift all x values so the leftmost node in any rank sits at x = 0. */
function normalise(
    x: Map<LayoutNodeId, number>,
    ranksOrdered: readonly (readonly LayoutNodeId[])[],
): void {
    let min = Infinity;
    for (const rank of ranksOrdered) {
        for (const id of rank) {
            const v = x.get(id) ?? 0;
            if (v < min) min = v;
        }
    }
    if (isFinite(min) && min !== 0) {
        for (const [id, v] of x) x.set(id, v - min);
    }
}

/**
 * Left-to-right sweep to guarantee no two adjacent nodes in a rank violate
 * their required gap (DELTA for siblings/spouses, BRANCH_GAP for others).
 */
function enforceSeparation(
    x: Map<LayoutNodeId, number>,
    ranksOrdered: readonly (readonly LayoutNodeId[])[],
    rankGaps: readonly (readonly number[])[],
): void {
    for (let ri = 0; ri < ranksOrdered.length; ri++) {
        const rank = ranksOrdered[ri]!;
        const gaps = rankGaps[ri]!;
        let cursor = -Infinity;
        for (let i = 0; i < rank.length; i++) {
            const id = rank[i]!;
            const v = x.get(id) ?? 0;
            const actual = Math.max(v, cursor + (gaps[i] ?? DELTA));
            x.set(id, actual);
            cursor = actual;
        }
    }
}

/**
 * Center each sibling block under its parent(s).
 *
 * Groups children by their common parent set (within the same rank), then
 * shifts each block so its horizontal midpoint aligns with the average
 * midpoint of its parents. A final separation sweep resolves any overlaps
 * introduced by the shifts.
 *
 * This corrects the B-K asymmetry that arises when children's initial order
 * indices are far from their parents' positions: TB passes pull children
 * toward parents but BT passes anchor children at initial positions, so the
 * average skews. Running this after the average and before pinned overrides
 * gives clean centering without invalidating the B-K compaction.
 */
function centerUnderParents(
    x: Map<LayoutNodeId, number>,
    ranksOrdered: readonly (readonly LayoutNodeId[])[],
    parentEdges: readonly { parent: LayoutNodeId; child: LayoutNodeId }[],
    nodes: ReadonlyMap<LayoutNodeId, LayoutNode>,
    rankGaps: readonly (readonly number[])[],
): void {
    // child → [parents]
    const parentListOf = new Map<LayoutNodeId, LayoutNodeId[]>();
    for (const e of parentEdges) {
        const list = parentListOf.get(e.child);
        if (list) list.push(e.parent);
        else parentListOf.set(e.child, [e.parent]);
    }

    // Group children by (rank, sorted parent set key)
    const blocks = new Map<string, { children: LayoutNodeId[]; parents: LayoutNodeId[] }>();
    for (const [child, parents] of parentListOf) {
        const rank = nodes.get(child)?.rank ?? -1;
        if (rank < 0) continue;
        const key = `${rank}:${[...parents].sort().join("|")}`;
        const block = blocks.get(key);
        if (block) block.children.push(child);
        else blocks.set(key, { children: [child], parents });
    }

    // Build a per-cluster member index so we can drag ghost cluster mates
    // along when we centre the near. Ghost nodes have no parent edges of
    // their own (parents come from real motherId/fatherId links only), so
    // they would otherwise be left behind by this pass and the cluster's
    // DELTA spacing from place()'s gap policy would be violated.
    const clusterMembers = new Map<string, LayoutNodeId[]>();
    for (const [nodeId, node] of nodes) {
        if (!node.clusterBlockId) continue;
        const list = clusterMembers.get(node.clusterBlockId);
        if (list) list.push(nodeId);
        else clusterMembers.set(node.clusterBlockId, [nodeId]);
    }

    for (const { children, parents } of blocks.values()) {
        if (children.length === 0 || parents.length === 0) continue;

        // Average of parent card centers
        const parentCenterX =
            parents.reduce((s, p) => s + (x.get(p) ?? 0) + PERSON_W / 2, 0) / parents.length;

        const childXs = children.map((c) => x.get(c) ?? 0);
        const childCenterX = (Math.min(...childXs) + Math.max(...childXs) + PERSON_W) / 2;

        const shift = parentCenterX - childCenterX;
        if (Math.abs(shift) < 0.01) continue;

        const shifted = new Set<LayoutNodeId>();
        for (const c of children) {
            x.set(c, (x.get(c) ?? 0) + shift);
            shifted.add(c);
        }
        for (const c of children) {
            const clusterId = nodes.get(c)?.clusterBlockId;
            if (!clusterId) continue;
            for (const other of clusterMembers.get(clusterId) ?? []) {
                if (shifted.has(other)) continue;
                x.set(other, (x.get(other) ?? 0) + shift);
                shifted.add(other);
            }
        }
    }

    enforceSeparation(x, ranksOrdered, rankGaps);
}

/**
 * Apply pinned x overrides then re-enforce separation.
 * Only PersonIds (not ghost LayoutNodeIds) appear in the pinned map.
 */
function applyPinned(
    x: Map<LayoutNodeId, number>,
    pinned: ReadonlyMap<PersonId, { readonly x: number }>,
    ranksOrdered: readonly (readonly LayoutNodeId[])[],
    rankGaps: readonly (readonly number[])[],
): void {
    for (const [personId, pin] of pinned) {
        if (x.has(personId)) x.set(personId, pin.x);
    }
    enforceSeparation(x, ranksOrdered, rankGaps);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
}
