/*
 * FamilyTreeEditor - layering pass: rank assignment and ghost insertion.
 *
 * `layer()` is the first of four pure passes in the new layout pipeline:
 *
 *   Tree + visible + focusId + overrides
 *     → layer()  → LayeredGraph   (this file)
 *     → order()  → OrderedGraph
 *     → place()  → PlacedGraph
 *     → route()  → RoutedGraph
 *
 * Responsibilities:
 *   - Assign a rank (generation row, 0 = oldest) to every visible person via
 *     a global longest-path BFS over the parent DAG. "Global" means all
 *     visible components are processed in one pass — no per-component restart.
 *   - Insert ghost nodes as first-class LayoutNodes for any couple whose two
 *     partners land on different ranks, so ghosts participate in ordering and
 *     coordinate assignment from the start (eliminating the post-hoc greedy
 *     collision loop in the previous hvLayout pipeline).
 *   - Populate spouseGroup / siblingBlockId adjacency constraints for order().
 *   - Derive parentEdges / spouseEdges from the domain tree.
 *
 * What this pass does NOT do:
 *   - Assign x/y coordinates (that is place()'s job).
 *   - Order nodes within a rank (that is order()'s job).
 *   - Handle same-rank long-span couples (detected after coordinate assignment
 *     in place(); any such ghosts are inserted as a post-place delta).
 *   - Apply birth-year cross-component generation alignment (ranks are always
 *     relative to each component's visible root; true calendar-year alignment
 *     is a future enhancement marked TODO below).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";
import type { Adjacency } from "$lib/layout/graph";
import { buildAdjacency } from "$lib/layout/graph";
import { ghostNodeId } from "$lib/layout/ir";
import type { LayeredGraph, LayoutNode, LayoutNodeId, LayoutOverrides } from "$lib/layout/ir";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assign ranks and insert ghost nodes for the visible subset of a Tree.
 *
 * @param tree     - The domain tree.
 * @param visible  - Set of PersonIds to include; ids absent from tree.people
 *                   are silently ignored.
 * @param focusId  - The focus person (currently accepted but not used; rank
 *                   alignment to a fixed mid-rank is a future enhancement).
 * @param _overrides - Persistent overrides (accepted for signature parity;
 *                   pinned-x and swap hints are applied in later passes).
 */
export function layer(
    tree: Tree,
    visible: ReadonlySet<PersonId>,
    _focusId: PersonId,
    _overrides?: LayoutOverrides,
): LayeredGraph {
    // Filter to people that actually exist in the tree
    const vis = new Set<PersonId>();
    for (const id of visible) {
        if (tree.people[id]) vis.add(id);
    }

    if (vis.size === 0) {
        return { nodes: new Map(), ranks: [], parentEdges: [], spouseEdges: [] };
    }

    const adj = buildAdjacency(tree);

    // -----------------------------------------------------------------------
    // 1. Compute ranks: longest-path BFS over the visible parent DAG.
    //    All people with no visible parents land at rank 0.
    //    Each child lands at max(parent ranks) + 1.
    //
    // TODO (future): add birth-year-driven cross-component offset alignment so
    // a person born ~1800 in component A and ~1800 in component B land at the
    // same rank even when they share no parent-DAG path.
    // -----------------------------------------------------------------------
    const { ranks: rankOf, cycleNodes } = computeRanks(vis, adj);

    // -----------------------------------------------------------------------
    // 2. Precompute joint visible children for each couple.
    //    Uses person.motherId / person.fatherId rather than couple.childIds
    //    because linkParent() populates the person record but does not back-
    //    fill the CoupleRecord.childIds array.
    // -----------------------------------------------------------------------
    const visChildrenOf = buildVisChildrenMap(tree, vis);

    // -----------------------------------------------------------------------
    // 3. Determine ghost insertions for cross-rank couples.
    //    For each couple where the two partners are on different ranks, insert
    //    a ghost copy of the "non-primary" partner at the primary partner's
    //    rank so bond/drop/bus edges can be routed locally to the children row.
    //
    //    Primary = the partner whose rank is exactly one row above the joint
    //    children. Falls back to the partner at the lower rank (older generation).
    // -----------------------------------------------------------------------
    interface GhostInfo {
        ghostId: LayoutNodeId;
        personId: PersonId;
        nearId: PersonId;
        nearRank: number;
        coupleKey: string;
    }

    const ghosts: GhostInfo[] = [];
    const seenGhostKeys = new Set<string>();

    for (const couple of tree.couples) {
        if (couple.leftId === couple.rightId) continue;
        if (!vis.has(couple.leftId) || !vis.has(couple.rightId)) continue;

        const rankL = rankOf.get(couple.leftId)!;
        const rankR = rankOf.get(couple.rightId)!;
        if (rankL === rankR) continue; // same rank: no ghost needed

        const coupleKey = `${couple.leftId}|${couple.rightId}`;
        const jointChildren = visChildrenOf.get(coupleKey) ?? [];

        const primary = choosePrimary(rankL, rankR, jointChildren, rankOf);
        const ghostPersonId = primary === "left" ? couple.rightId : couple.leftId;
        const nearId = primary === "left" ? couple.leftId : couple.rightId;
        const nearRank = primary === "left" ? rankL : rankR;
        const ghostId = ghostNodeId(ghostPersonId, nearId);

        if (seenGhostKeys.has(ghostId)) continue;
        seenGhostKeys.add(ghostId);
        ghosts.push({ ghostId, personId: ghostPersonId, nearId, nearRank, coupleKey });
    }

    // -----------------------------------------------------------------------
    // 4. Compute adjacency-constraint keys for the ordering pass.
    //
    //    spouseGroup: shared by both partners in a same-rank couple, or by the
    //    near person and ghost node in a cross-rank couple. Only the first
    //    couple sets the key for each node (a person married to two same-rank
    //    spouses can only be adjacent to one at a time in a linear order).
    //
    //    siblingBlockId: shared by all visible children of a couple where both
    //    parents are visible, so siblings stay contiguous during ordering.
    // -----------------------------------------------------------------------
    const spouseGroupOf = new Map<LayoutNodeId, string>();

    for (const couple of tree.couples) {
        if (couple.leftId === couple.rightId) continue;
        if (!vis.has(couple.leftId) || !vis.has(couple.rightId)) continue;

        const rankL = rankOf.get(couple.leftId)!;
        const rankR = rankOf.get(couple.rightId)!;
        const coupleKey = `${couple.leftId}|${couple.rightId}`;

        if (rankL === rankR) {
            if (!spouseGroupOf.has(couple.leftId)) spouseGroupOf.set(couple.leftId, coupleKey);
            if (!spouseGroupOf.has(couple.rightId)) spouseGroupOf.set(couple.rightId, coupleKey);
        }
    }
    for (const g of ghosts) {
        // Cross-rank couple: the real nearId and the ghost share a spouseGroup.
        if (!spouseGroupOf.has(g.nearId)) spouseGroupOf.set(g.nearId, g.coupleKey);
        if (!spouseGroupOf.has(g.ghostId)) spouseGroupOf.set(g.ghostId, g.coupleKey);
    }

    const siblingBlockOf = new Map<PersonId, string>();
    for (const couple of tree.couples) {
        if (couple.leftId === couple.rightId) continue;
        if (!vis.has(couple.leftId) || !vis.has(couple.rightId)) continue;
        const blockId = `${couple.leftId}|${couple.rightId}`;
        for (const childId of visChildrenOf.get(blockId) ?? []) {
            if (!siblingBlockOf.has(childId)) siblingBlockOf.set(childId, blockId);
        }
    }

    // -----------------------------------------------------------------------
    //   Ghost clusters: a near person and every ghost whose nearId is that
    //   person share one clusterBlockId. The ordering pass uses this to keep
    //   them contiguous in the rank, which matters when a near has multiple
    //   cross-rank partners (each contributes a ghost) — without a shared
    //   block, only one ghost would be pulled adjacent via spouseGroup and
    //   the others would drift to wherever the median sweep deposits them.
    // -----------------------------------------------------------------------
    const ghostsByNear = new Map<PersonId, GhostInfo[]>();
    for (const g of ghosts) {
        const list = ghostsByNear.get(g.nearId);
        if (list) list.push(g);
        else ghostsByNear.set(g.nearId, [g]);
    }
    const clusterBlockOf = new Map<LayoutNodeId, string>();
    for (const [nearId, gs] of ghostsByNear) {
        const key = `cluster:${nearId}`;
        clusterBlockOf.set(nearId, key);
        for (const g of gs) clusterBlockOf.set(g.ghostId, key);
    }

    // -----------------------------------------------------------------------
    // 5. Assemble LayoutNodes
    // -----------------------------------------------------------------------
    const nodes = new Map<LayoutNodeId, LayoutNode>();

    for (const id of vis) {
        const sg = spouseGroupOf.get(id);
        const sb = siblingBlockOf.get(id);
        const cb = clusterBlockOf.get(id);
        nodes.set(id, {
            id,
            kind: "person",
            personId: id,
            rank: rankOf.get(id)!,
            ...(sg !== undefined ? { spouseGroup: sg } : {}),
            ...(sb !== undefined ? { siblingBlockId: sb } : {}),
            ...(cb !== undefined ? { clusterBlockId: cb } : {}),
        });
    }

    for (const g of ghosts) {
        const sg = spouseGroupOf.get(g.ghostId);
        const cb = clusterBlockOf.get(g.ghostId);
        nodes.set(g.ghostId, {
            id: g.ghostId,
            kind: "ghost",
            personId: g.personId,
            rank: g.nearRank,
            ...(sg !== undefined ? { spouseGroup: sg } : {}),
            ...(cb !== undefined ? { clusterBlockId: cb } : {}),
        });
    }

    // -----------------------------------------------------------------------
    // 6. Build rank arrays (unordered within rank — ordering is order()'s job)
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // 7. Build edges
    // -----------------------------------------------------------------------
    const parentEdges: { parent: LayoutNodeId; child: LayoutNodeId; coupleKey?: string }[] = [];
    for (const id of vis) {
        const person = tree.people[id];
        if (!person) continue;
        if (person.motherId && vis.has(person.motherId)) {
            parentEdges.push({ parent: person.motherId, child: id });
        }
        if (person.fatherId && vis.has(person.fatherId)) {
            parentEdges.push({ parent: person.fatherId, child: id });
        }
    }

    const spouseEdges: { a: LayoutNodeId; b: LayoutNodeId; coupleKey: string }[] = [];
    const seenCouples = new Set<string>();
    for (const couple of tree.couples) {
        if (couple.leftId === couple.rightId) continue;
        if (!vis.has(couple.leftId) || !vis.has(couple.rightId)) continue;
        const coupleKey = `${couple.leftId}|${couple.rightId}`;
        if (seenCouples.has(coupleKey)) continue;
        seenCouples.add(coupleKey);
        spouseEdges.push({ a: couple.leftId, b: couple.rightId, coupleKey });
    }

    return {
        nodes,
        ranks: rankArrays,
        parentEdges,
        spouseEdges,
        ...(cycleNodes.length > 0 ? { cycleNodes } : {}),
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Longest-path BFS over the visible parent DAG (Kahn's algorithm variant).
 * Processes each node exactly once, after all its visible parents have been
 * processed, updating each child's rank to max(parent_rank + 1).
 *
 * Returns the rank assignment plus the set of person ids implicated in a
 * cycle (visible in-degree never reaches zero) so the caller can surface
 * them for diagnosis instead of silently dumping cycle members at rank 0.
 */
function computeRanks(
    vis: ReadonlySet<PersonId>,
    adj: Adjacency,
): { ranks: Map<PersonId, number>; cycleNodes: PersonId[] } {
    const ranks = new Map<PersonId, number>();

    // Count visible in-degree for each person (number of visible parents)
    const inDegree = new Map<PersonId, number>();
    for (const id of vis) {
        let cnt = 0;
        for (const p of adj.parentsOf.get(id) ?? []) {
            if (vis.has(p)) cnt++;
        }
        inDegree.set(id, cnt);
    }

    // Seed the queue with roots (in-degree 0) at rank 0
    const queue: PersonId[] = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0) {
            queue.push(id);
            ranks.set(id, 0);
        }
    }

    while (queue.length > 0) {
        const id = queue.shift()!;
        const r = ranks.get(id) ?? 0;
        for (const child of adj.childrenOf.get(id) ?? []) {
            if (!vis.has(child)) continue;
            // Propagate longest-path rank
            const cur = ranks.get(child);
            if (cur === undefined || r + 1 > cur) ranks.set(child, r + 1);
            // Decrement in-degree; enqueue once all visible parents processed
            const newDeg = (inDegree.get(child) ?? 0) - 1;
            inDegree.set(child, newDeg);
            if (newDeg === 0) queue.push(child);
        }
    }

    // Anything still unranked is part of a cycle (or descended from one).
    // Surface to the caller and warn — silently dropping these at rank 0
    // produces visually scrambled trees that are very hard to diagnose.
    const cycleNodes: PersonId[] = [];
    for (const id of vis) {
        if (!ranks.has(id)) {
            cycleNodes.push(id);
            ranks.set(id, 0);
        }
    }
    if (cycleNodes.length > 0) {
        const sample = cycleNodes.slice(0, 12).join(", ");
        const more = cycleNodes.length > 12 ? `, ... (${String(cycleNodes.length - 12)} more)` : "";

        console.warn(
            `[layer] parent-DAG cycle detected — ${String(cycleNodes.length)} node(s) collapsed to rank 0: ${sample}${more}`,
        );
    }

    return { ranks, cycleNodes };
}

/**
 * Build a map from couple key ("leftId|rightId") to visible joint children,
 * using person.motherId / person.fatherId rather than couple.childIds because
 * linkParent() populates person records but not CoupleRecord.childIds.
 */
function buildVisChildrenMap(tree: Tree, vis: ReadonlySet<PersonId>): Map<string, PersonId[]> {
    // Index couples by both orderings of their partner ids for O(1) lookup
    const coupleKeyByParents = new Map<string, string>();
    for (const couple of tree.couples) {
        if (!vis.has(couple.leftId) || !vis.has(couple.rightId)) continue;
        const key = `${couple.leftId}|${couple.rightId}`;
        coupleKeyByParents.set(`${couple.leftId}|${couple.rightId}`, key);
        coupleKeyByParents.set(`${couple.rightId}|${couple.leftId}`, key);
    }

    const result = new Map<string, PersonId[]>();
    for (const id of vis) {
        const person = tree.people[id];
        if (!person?.motherId || !person?.fatherId) continue;
        if (!vis.has(person.motherId) || !vis.has(person.fatherId)) continue;
        const coupleKey =
            coupleKeyByParents.get(`${person.motherId}|${person.fatherId}`) ??
            coupleKeyByParents.get(`${person.fatherId}|${person.motherId}`);
        if (!coupleKey) continue;
        const list = result.get(coupleKey);
        if (list) list.push(id);
        else result.set(coupleKey, [id]);
    }
    return result;
}

/**
 * Choose which partner of a cross-rank couple is "primary" — i.e. the one
 * whose rank is directly above the joint children. The non-primary partner
 * becomes a ghost at the primary's rank.
 *
 * Heuristic: the partner at rank `minChildRank - 1` is primary.
 * Falls back to the lower-ranked (older generation) partner.
 */
function choosePrimary(
    rankL: number,
    rankR: number,
    jointChildren: readonly PersonId[],
    rankOf: ReadonlyMap<PersonId, number>,
): "left" | "right" {
    if (jointChildren.length > 0) {
        const minChildRank = Math.min(...jointChildren.map((id) => rankOf.get(id) ?? 0));
        if (rankL === minChildRank - 1) return "left";
        if (rankR === minChildRank - 1) return "right";
    }
    return rankL <= rankR ? "left" : "right";
}
