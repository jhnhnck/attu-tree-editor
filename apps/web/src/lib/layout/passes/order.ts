/*
 * FamilyTreeEditor - ordering pass: within-rank crossing minimisation.
 *
 * `order()` is the second pass in the layered layout pipeline:
 *
 *   layer()  → LayeredGraph   (ranks + ghost nodes)
 *     → order()  → OrderedGraph  (this file)
 *     → place()  → PlacedGraph
 *     → route()  → RoutedGraph
 *
 * Algorithm: iterative median heuristic (Sugiyama et al. 1981), alternating
 * top-down and bottom-up sweeps, up to MAX_PASSES iterations or until
 * STALL_LIMIT consecutive non-improving sweeps.  After each sweep, two
 * constraint-repair steps enforce within-rank structural invariants:
 *
 *   1. Couple-adjacency repair: nodes sharing a `spouseGroup` key are moved
 *      to be immediately adjacent (Sander 1996 local repair).
 *   2. Sibling-block contiguity: nodes sharing a `siblingBlockId` key are
 *      compacted into a contiguous run anchored at their leftmost member.
 *
 * `swap` overrides from LayoutOverrides are applied after the final sweep
 * so that user intent is never overwritten by crossing-minimisation.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type {
    LayoutNode,
    LayoutNodeId,
    LayeredGraph,
    LayoutOverrides,
    OrderedGraph,
} from "$lib/layout/ir";
import type { Tree } from "$lib/domain/types";
import { legacyGenderCode } from "$lib/domain/personIdentity";

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

const MAX_PASSES = 48;
const STALL_LIMIT = 6;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an initial per-rank ordering via DFS pre-order from every root node.
 *
 * DFS naturally groups each parent's children as a contiguous block, giving
 * the median heuristic a much better starting point than the arbitrary
 * insertion order from layer() and significantly reducing the number of
 * crossing-minimization passes needed to reach a good layout.
 */
export function computeInitialOrder(graph: LayeredGraph): LayoutNodeId[][] {
    const childrenOf = new Map<LayoutNodeId, LayoutNodeId[]>();
    for (const e of graph.parentEdges) {
        const list = childrenOf.get(e.parent);
        if (list) list.push(e.child);
        else childrenOf.set(e.parent, [e.child]);
    }

    const result: LayoutNodeId[][] = graph.ranks.map(() => []);
    const visited = new Set<LayoutNodeId>();

    // Iterative DFS with an explicit stack. Recursive DFS blows the call
    // stack on deep straight-line ancestry (genealogy data routinely has
    // 50+ generation chains, V8 default stack ~10-15k frames).
    const stack: LayoutNodeId[] = [];
    function dfs(start: LayoutNodeId): void {
        if (visited.has(start)) return;
        stack.push(start);
        while (stack.length > 0) {
            const id = stack.pop()!;
            if (visited.has(id)) continue;
            visited.add(id);
            const rank = graph.nodes.get(id)?.rank;
            if (rank !== undefined) result[rank]?.push(id);
            const kids = childrenOf.get(id);
            if (!kids) continue;
            // Push in reverse so the first child is processed first
            // (matches the recursive pre-order traversal output).
            for (let i = kids.length - 1; i >= 0; i--) {
                const c = kids[i]!;
                if (!visited.has(c)) stack.push(c);
            }
        }
    }

    // First pass: roots (nodes with no visible parents) in layer-insertion order.
    const hasParent = new Set(graph.parentEdges.map((e) => e.child));
    for (const rank of graph.ranks) {
        for (const id of rank) {
            if (!hasParent.has(id)) dfs(id);
        }
    }
    // Second pass: catch any remaining unvisited nodes (cycles, disconnected ghosts).
    for (const rank of graph.ranks) {
        for (const id of rank) dfs(id);
    }

    return result;
}

/**
 * Assign a within-rank order to every node in a LayeredGraph.
 *
 * @param graph     - Output of the layering pass.
 * @param overrides - Optional swap hints applied after the final sweep.
 * @param tree      - Optional domain tree; when present, enables the
 *                    genealogy-conventional father-left tie-break on
 *                    mixed-gender couples (matches the hyperbolic engine,
 *                    see commit e3e7d8c). Falls through to position-based
 *                    ordering for same-sex pairs or any pair with an
 *                    unknown-gender partner.
 * @returns         An OrderedGraph with an `order` map (0-based position per rank).
 */
export function order(graph: LayeredGraph, overrides?: LayoutOverrides, tree?: Tree): OrderedGraph {
    const { nodes } = graph;

    if (nodes.size === 0) {
        return { ...graph, order: new Map() };
    }

    // Working copy: rankOrder[r] is the mutable current ordering for rank r.
    // Start from DFS pre-order (groups siblings contiguously) rather than
    // insertion order so the median heuristic starts from a better initial state.
    const rankOrder: LayoutNodeId[][] = computeInitialOrder(graph);

    // Cross-rank neighbor tables, built from parentEdges only (spouse edges are
    // same-rank and contribute no crossings between ranks).
    const upperN = new Map<LayoutNodeId, LayoutNodeId[]>(); // node → its parents
    const lowerN = new Map<LayoutNodeId, LayoutNodeId[]>(); // node → its children
    for (const e of graph.parentEdges) {
        mapPush(upperN, e.child, e.parent);
        mapPush(lowerN, e.parent, e.child);
    }

    // Same-rank constraint groups (populated once; constraint functions filter to
    // nodes actually present in each rank during repair).
    const spouseGroups = new Map<string, LayoutNodeId[]>();
    const siblingBlocks = new Map<string, LayoutNodeId[]>();
    const clusterBlocks = new Map<string, LayoutNodeId[]>();
    for (const [nodeId, node] of nodes) {
        if (node.spouseGroup) mapPush(spouseGroups, node.spouseGroup, nodeId);
        if (node.siblingBlockId) mapPush(siblingBlocks, node.siblingBlockId, nodeId);
        if (node.clusterBlockId) mapPush(clusterBlocks, node.clusterBlockId, nodeId);
    }

    // Father-left tie-break: per spouseGroup, identify the partner who should
    // anchor on the left iff exactly one partner has gender = "m". Empty when
    // no tree provided, when both partners are same-sex, or when either
    // partner's gender is unknown. Cross-rank cases include the ghost (whose
    // personId resolves to the duplicated real person, so the gender lookup
    // is symmetric with the same-rank case).
    const preferredLeft = buildPreferredLeftMap(spouseGroups, nodes, tree);

    let best = countCrossings(rankOrder, graph.parentEdges);
    let stall = 0;

    for (let pass = 0; pass < MAX_PASSES && stall < STALL_LIMIT; pass++) {
        if (pass % 2 === 0) {
            // Downward sweep: fix rank r-1, optimise rank r.
            for (let r = 1; r < rankOrder.length; r++) {
                sortByMedian(rankOrder[r]!, upperN, rankOrder[r - 1]!);
                // Sibling-block repair runs first (soft "keep contiguous"
                // preference); cluster-block repair next (keeps a near
                // person and all of its ghosts contiguous so multi-ghost
                // groups don't drift apart); couple-adjacency runs last so
                // the hard "spouses must be adjacent" rule wins when any of
                // the three conflict — e.g. when a sibling-block anchor is
                // also a couple member and the spouse would otherwise be
                // displaced by sibling compaction.
                repairSiblingBlocks(rankOrder[r]!, siblingBlocks, nodes);
                repairClusterBlocks(rankOrder[r]!, clusterBlocks, nodes);
                repairCoupleAdjacency(rankOrder[r]!, spouseGroups, nodes, preferredLeft);
            }
        } else {
            // Upward sweep: fix rank r+1, optimise rank r.
            for (let r = rankOrder.length - 2; r >= 0; r--) {
                sortByMedian(rankOrder[r]!, lowerN, rankOrder[r + 1]!);
                repairSiblingBlocks(rankOrder[r]!, siblingBlocks, nodes);
                repairClusterBlocks(rankOrder[r]!, clusterBlocks, nodes);
                repairCoupleAdjacency(rankOrder[r]!, spouseGroups, nodes, preferredLeft);
            }
        }

        const crossings = countCrossings(rankOrder, graph.parentEdges);
        if (crossings < best) {
            best = crossings;
            stall = 0;
        } else {
            stall++;
        }
    }

    // Final constraint pass: handles single-rank graphs and any rank that was
    // never the "movable" rank in a sweep (e.g. rank 0 in a downward-only run).
    // Order matches the sweep loops: sibling-blocks first (soft), cluster
    // blocks next (medium — keeps multi-ghost groups contiguous around their
    // near), couple adjacency last (hard — wins on conflict).
    for (const rank of rankOrder) {
        repairSiblingBlocks(rank, siblingBlocks, nodes);
        repairClusterBlocks(rank, clusterBlocks, nodes);
        repairCoupleAdjacency(rank, spouseGroups, nodes, preferredLeft);
    }

    // Apply swap overrides after all passes so they are final.
    if (overrides?.swap) {
        for (const [a, b] of overrides.swap) {
            for (const rank of rankOrder) {
                const ai = rank.indexOf(a);
                const bi = rank.indexOf(b);
                if (ai !== -1 && bi !== -1) {
                    const tmp = rank[ai]!;
                    rank[ai] = rank[bi]!;
                    rank[bi] = tmp;
                }
            }
        }
    }

    // Materialise the order map from the final rankOrder.
    const orderMap = new Map<LayoutNodeId, number>();
    for (const rank of rankOrder) {
        rank.forEach((id, i) => orderMap.set(id, i));
    }

    return { ...graph, order: orderMap };
}

// ---------------------------------------------------------------------------
// Core sort step: median barycenter
// ---------------------------------------------------------------------------

/**
 * Re-order `rank` in place by the median position of each node's cross-rank
 * neighbours in `fixedRank`.  Nodes with no cross-rank neighbours (e.g. ghost
 * nodes, isolated nodes) are placed after those with defined medians,
 * preserving their current relative order.
 */
function sortByMedian(
    rank: LayoutNodeId[],
    neighborMap: ReadonlyMap<LayoutNodeId, readonly LayoutNodeId[]>,
    fixedRank: readonly LayoutNodeId[],
): void {
    // Build position index for the fixed rank.
    const pos = new Map<LayoutNodeId, number>();
    fixedRank.forEach((id, i) => pos.set(id, i));

    // Compute median neighbour position for each node in the movable rank.
    const bc = new Map<LayoutNodeId, number>();
    for (const id of rank) {
        const nbs = neighborMap.get(id);
        if (!nbs) continue;
        const positions: number[] = [];
        for (const n of nbs) {
            const p = pos.get(n);
            if (p !== undefined) positions.push(p);
        }
        if (positions.length > 0) bc.set(id, median(positions));
    }

    // Stable sort: defined-bc nodes sort numerically; undefined-bc nodes
    // retain their original relative order and sort after defined ones.
    const indexed = rank.map((id, i) => ({ id, i }));
    indexed.sort((a, b) => {
        const ba = bc.get(a.id);
        const bb = bc.get(b.id);
        if (ba !== undefined && bb !== undefined) return ba !== bb ? ba - bb : a.i - b.i;
        if (ba !== undefined) return -1;
        if (bb !== undefined) return 1;
        return a.i - b.i;
    });

    for (let i = 0; i < rank.length; i++) rank[i] = indexed[i]!.id;
}

// ---------------------------------------------------------------------------
// Constraint repair
// ---------------------------------------------------------------------------

/**
 * Ensure every spouseGroup pair in this rank is immediately adjacent.
 * For each pair, moves the right member to the position immediately after
 * the left member.
 *
 * Anchor selection (left position):
 *   - if `preferredLeft` names one of the two members, that member anchors
 *     (drives the genealogy-conventional father-left tie-break; matches
 *     the hyperbolic engine, see commit e3e7d8c). Fires only on mixed-
 *     gender both-known couples — see buildPreferredLeftMap.
 *   - otherwise, the member at the lower current position anchors
 *     (position-based; preserves the median heuristic's choice for
 *     same-sex couples and unknown-gender pairs).
 *
 * When the preferred anchor is currently the right partner, a swap is
 * forced regardless of adjacency: removing both members and reinserting
 * [anchor, mover] at the leftmost prior position guarantees the
 * orientation flip without disturbing surrounding nodes.
 */
function repairCoupleAdjacency(
    rank: LayoutNodeId[],
    spouseGroups: ReadonlyMap<string, readonly LayoutNodeId[]>,
    nodes: ReadonlyMap<LayoutNodeId, LayoutNode>,
    preferredLeft?: ReadonlyMap<string, LayoutNodeId>,
): void {
    // Collect all spouseGroup keys present in this rank before mutating it.
    const groupsHere = new Set<string>();
    for (const id of rank) {
        const sg = nodes.get(id)?.spouseGroup;
        if (sg) groupsHere.add(sg);
    }

    for (const sg of groupsHere) {
        const members = (spouseGroups.get(sg) ?? []).filter((id) => rank.includes(id));
        if (members.length !== 2) continue;

        const posA = rank.indexOf(members[0]!);
        const posB = rank.indexOf(members[1]!);

        const preferred = preferredLeft?.get(sg);
        const preferenceApplies = preferred !== undefined && members.includes(preferred);
        const adjacent = Math.abs(posA - posB) === 1;

        // Pick anchor: preferred wins when applicable; otherwise leftmost
        // by current position.
        const [anchorId, moverId] = preferenceApplies
            ? [preferred, preferred === members[0] ? members[1]! : members[0]!]
            : posA < posB
              ? [members[0]!, members[1]!]
              : [members[1]!, members[0]!];

        const anchorAlreadyLeft =
            rank.indexOf(anchorId) === Math.min(rank.indexOf(anchorId), rank.indexOf(moverId));
        if (adjacent && anchorAlreadyLeft) continue; // already in the desired shape

        rank.splice(rank.indexOf(moverId), 1);
        rank.splice(rank.indexOf(anchorId) + 1, 0, moverId);
    }
}

/**
 * Identify, per spouseGroup, the member that should anchor on the left of
 * the pair. Fires for the genealogy-conventional father-left tie-break on
 * mixed-gender both-known couples; returns an empty map when `tree` is
 * undefined, or for same-sex / unknown-gender pairs.
 *
 * `LayoutNode.personId` resolves to the duplicated real person for ghost
 * nodes, so cross-rank pairs work identically to same-rank pairs — both
 * lookups land in `tree.people`.
 */
function buildPreferredLeftMap(
    spouseGroups: ReadonlyMap<string, readonly LayoutNodeId[]>,
    nodes: ReadonlyMap<LayoutNodeId, LayoutNode>,
    tree: Tree | undefined,
): Map<string, LayoutNodeId> {
    const out = new Map<string, LayoutNodeId>();
    if (!tree) return out;

    for (const [sg, members] of spouseGroups) {
        if (members.length !== 2) continue;
        const [aId, bId] = members;
        if (!aId || !bId) continue;
        const aPerson = tree.people[nodes.get(aId)?.personId ?? ""];
        const bPerson = tree.people[nodes.get(bId)?.personId ?? ""];
        if (!aPerson || !bPerson) continue;
        const aCode = legacyGenderCode(aPerson);
        const bCode = legacyGenderCode(bPerson);
        const aMale = aCode === "m";
        const bMale = bCode === "m";
        // Only fire when exactly one is male. Same-sex couples (both "m" or
        // both "f") and unknown-gender pairs (any "u") fall through to
        // position-based ordering, preserving today's behavior.
        if (aMale === bMale) continue;
        if (aCode === "u" || bCode === "u") continue;
        out.set(sg, aMale ? aId : bId);
    }
    return out;
}

/**
 * Ensure every clusterBlock in this rank forms a contiguous run.
 *
 * A cluster block is a near person plus every ghost copy whose nearId is
 * that person — used so a person with multiple cross-rank partners has all
 * of their ghost copies kept beside them. Without this, only the first ghost
 * (whose coupleKey matched the near's spouseGroup) would be pulled adjacent
 * via repairCoupleAdjacency; subsequent ghosts would land wherever the
 * median sweep deposited them, often dozens of rank positions away.
 *
 * Implementation mirrors repairSiblingBlocks: anchor on the leftmost member,
 * pull the remaining members to immediately follow it in current rank order.
 */
function repairClusterBlocks(
    rank: LayoutNodeId[],
    clusterBlocks: ReadonlyMap<string, readonly LayoutNodeId[]>,
    nodes: ReadonlyMap<LayoutNodeId, LayoutNode>,
): void {
    const blocksHere = new Set<string>();
    for (const id of rank) {
        const cb = nodes.get(id)?.clusterBlockId;
        if (cb) blocksHere.add(cb);
    }

    for (const cb of blocksHere) {
        const members = (clusterBlocks.get(cb) ?? []).filter((id) => rank.includes(id));
        if (members.length < 2) continue;

        const sorted = [...members].sort((a, b) => rank.indexOf(a) - rank.indexOf(b));
        const first = rank.indexOf(sorted[0]!);
        const last = rank.indexOf(sorted[sorted.length - 1]!);
        if (last - first === sorted.length - 1) continue;

        const rest = sorted.slice(1);
        const restPositions = rest.map((id) => rank.indexOf(id)).sort((a, b) => b - a);
        for (const p of restPositions) rank.splice(p, 1);

        rank.splice(rank.indexOf(sorted[0]!) + 1, 0, ...rest);
    }
}

/**
 * Ensure every siblingBlock in this rank forms a contiguous run.
 * For each block, anchors on the leftmost member and pulls the remaining
 * members to immediately follow it, preserving their current relative order.
 */
function repairSiblingBlocks(
    rank: LayoutNodeId[],
    siblingBlocks: ReadonlyMap<string, readonly LayoutNodeId[]>,
    nodes: ReadonlyMap<LayoutNodeId, LayoutNode>,
): void {
    // Collect all siblingBlockId keys present in this rank before mutating it.
    const blocksHere = new Set<string>();
    for (const id of rank) {
        const sb = nodes.get(id)?.siblingBlockId;
        if (sb) blocksHere.add(sb);
    }

    for (const sb of blocksHere) {
        const members = (siblingBlocks.get(sb) ?? []).filter((id) => rank.includes(id));
        if (members.length < 2) continue;

        // Sort members by their current rank position.
        const sorted = [...members].sort((a, b) => rank.indexOf(a) - rank.indexOf(b));

        // Check if already contiguous.
        const first = rank.indexOf(sorted[0]!);
        const last = rank.indexOf(sorted[sorted.length - 1]!);
        if (last - first === sorted.length - 1) continue;

        // Remove the non-anchor members (high-index first to preserve lower indices).
        const rest = sorted.slice(1);
        const restPositions = rest.map((id) => rank.indexOf(id)).sort((a, b) => b - a);
        for (const p of restPositions) rank.splice(p, 1);

        // Re-insert immediately after the anchor.
        rank.splice(rank.indexOf(sorted[0]!) + 1, 0, ...rest);
    }
}

// ---------------------------------------------------------------------------
// Crossing count (O(E²) per rank pair; suitable for ≤200 edges/pair)
// ---------------------------------------------------------------------------

function countCrossings(
    rankOrder: readonly LayoutNodeId[][],
    parentEdges: readonly { parent: LayoutNodeId; child: LayoutNodeId }[],
): number {
    let total = 0;

    for (let r = 0; r + 1 < rankOrder.length; r++) {
        const above = new Map<LayoutNodeId, number>();
        rankOrder[r]!.forEach((id, i) => above.set(id, i));
        const below = new Map<LayoutNodeId, number>();
        rankOrder[r + 1]!.forEach((id, i) => below.set(id, i));

        const edges: [number, number][] = [];
        for (const e of parentEdges) {
            const u = above.get(e.parent);
            const v = below.get(e.child);
            if (u !== undefined && v !== undefined) edges.push([u, v]);
        }

        edges.sort(([u1, v1], [u2, v2]) => (u1 !== u2 ? u1 - u2 : v1 - v2));
        for (let i = 0; i < edges.length - 1; i++) {
            for (let j = i + 1; j < edges.length; j++) {
                if (edges[i]![0] !== edges[j]![0] && edges[i]![1] > edges[j]![1]) total++;
            }
        }
    }

    return total;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function mapPush<K, V>(map: Map<K, V[]>, key: K, value: V): void {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
}
