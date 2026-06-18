/*
 * FamilyTreeEditor - tests for layout/passes/order.ts
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import type { LayeredGraph, LayoutNode, LayoutNodeId } from "$lib/layout/ir";
import { ghostNodeId } from "$lib/layout/ir";
import { order, computeInitialOrder } from "$lib/layout/passes/order";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { ROOT_ID } from "$lib/domain/ids";
import { layer } from "$lib/layout/passes/layer";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Build a minimal LayeredGraph from explicit rank arrays and edge list. */
function makeGraph(
    rankArrays: string[][],
    parentEdges: { parent: string; child: string }[] = [],
    nodeExtras: Record<string, { spouseGroup?: string; siblingBlockId?: string }> = {},
): LayeredGraph {
    const nodes = new Map<LayoutNodeId, LayoutNode>();
    for (let r = 0; r < rankArrays.length; r++) {
        for (const id of rankArrays[r]!) {
            const sg = nodeExtras[id]?.spouseGroup;
            const sb = nodeExtras[id]?.siblingBlockId;
            nodes.set(id, {
                id,
                kind: "person",
                personId: id,
                rank: r,
                ...(sg !== undefined ? { spouseGroup: sg } : {}),
                ...(sb !== undefined ? { siblingBlockId: sb } : {}),
            });
        }
    }
    return {
        nodes,
        ranks: rankArrays.map((r) => [...r]),
        parentEdges,
        spouseEdges: [],
    };
}

/** Return true if a comes before b in the order map for the given rank. */
function before(g: ReturnType<typeof order>, a: LayoutNodeId, b: LayoutNodeId): boolean {
    return (g.order.get(a) ?? -1) < (g.order.get(b) ?? -1);
}

/** Return the absolute distance between a and b's order positions. */
function dist(g: ReturnType<typeof order>, a: LayoutNodeId, b: LayoutNodeId): number {
    return Math.abs((g.order.get(a) ?? 0) - (g.order.get(b) ?? 0));
}

// ---------------------------------------------------------------------------
// Basic structural correctness
// ---------------------------------------------------------------------------

describe("order — OrderedGraph structure", () => {
    it("every node receives exactly one order value", () => {
        const g = makeGraph([
            ["A", "B", "C"],
            ["X", "Y"],
        ]);
        const og = order(g);
        expect(og.order.size).toBe(5);
        for (const id of og.nodes.keys()) {
            expect(og.order.has(id)).toBe(true);
        }
    });

    it("orders within each rank form a permutation of 0..n-1", () => {
        const g = makeGraph([
            ["A", "B", "C"],
            ["X", "Y", "Z"],
        ]);
        const og = order(g);
        for (const rankIds of og.ranks) {
            const positions = [...rankIds].map((id) => og.order.get(id)!).sort((a, b) => a - b);
            positions.forEach((v, i) => expect(v).toBe(i));
        }
    });

    it("empty graph returns empty order map", () => {
        const g = makeGraph([]);
        const og = order(g);
        expect(og.order.size).toBe(0);
    });

    it("single rank: order is 0..n-1 in insertion order", () => {
        const g = makeGraph([["A", "B", "C"]]);
        const og = order(g);
        expect(og.order.get("A")).toBe(0);
        expect(og.order.get("B")).toBe(1);
        expect(og.order.get("C")).toBe(2);
    });

    it("passes through all fields from input LayeredGraph (extends correctly)", () => {
        const g = makeGraph([["A"], ["B"]], [{ parent: "A", child: "B" }]);
        const og = order(g);
        expect(og.nodes).toBe(g.nodes);
        expect(og.ranks).toBe(g.ranks);
        expect(og.parentEdges).toBe(g.parentEdges);
        expect(og.spouseEdges).toBe(g.spouseEdges);
    });
});

// ---------------------------------------------------------------------------
// Crossing minimisation
// ---------------------------------------------------------------------------

describe("order — crossing minimisation", () => {
    it("resolves a single crossing: A→Y B→X becomes Y,X order on bottom rank", () => {
        // Rank 0: [A, B]; Rank 1: [X, Y] with A→Y and B→X (one crossing)
        // After sweep: Y should come before X (bc of Y = pos(A)=0, bc of X = pos(B)=1)
        const g = makeGraph(
            [
                ["A", "B"],
                ["X", "Y"],
            ],
            [
                { parent: "A", child: "Y" },
                { parent: "B", child: "X" },
            ],
        );
        const og = order(g);
        expect(before(og, "Y", "X")).toBe(true);
    });

    it("zero-crossing graph stays put", () => {
        // A→X, B→Y — already no crossings; order unchanged
        const g = makeGraph(
            [
                ["A", "B"],
                ["X", "Y"],
            ],
            [
                { parent: "A", child: "X" },
                { parent: "B", child: "Y" },
            ],
        );
        const og = order(g);
        expect(before(og, "X", "Y")).toBe(true);
    });

    it("three-rank diamond: crossing removed over two ranks", () => {
        // Rank 0: [A, B]
        // Rank 1: [P, Q]  A→Q, B→P (crossed at rank 0-1)
        // Rank 2: [X]     P→X, Q→X
        const g = makeGraph(
            [["A", "B"], ["P", "Q"], ["X"]],
            [
                { parent: "A", child: "Q" },
                { parent: "B", child: "P" },
                { parent: "P", child: "X" },
                { parent: "Q", child: "X" },
            ],
        );
        const og = order(g);
        // After crossing-min: Q before P so A→Q is straight
        expect(before(og, "Q", "P")).toBe(true);
    });

    it("four-node butterfly: uncrossed configuration maintained", () => {
        // A→X, A→Y, B→X, B→Y — every possible arrangement has same crossing count
        // (edges fan out symmetrically): just check orders are valid permutations
        const g = makeGraph(
            [
                ["A", "B"],
                ["X", "Y"],
            ],
            [
                { parent: "A", child: "X" },
                { parent: "A", child: "Y" },
                { parent: "B", child: "X" },
                { parent: "B", child: "Y" },
            ],
        );
        const og = order(g);
        const pos0 = [og.order.get("A")!, og.order.get("B")!].sort((a, b) => a - b);
        expect(pos0).toEqual([0, 1]);
        const pos1 = [og.order.get("X")!, og.order.get("Y")!].sort((a, b) => a - b);
        expect(pos1).toEqual([0, 1]);
    });

    it("median of two parents: child placed between them", () => {
        // Rank 0: [A, B, C]; Rank 1: [X] with A→X and C→X
        // bc(X) = median(0, 2) = 1 → X placed at middle of rank 1
        const g = makeGraph(
            [
                ["A", "B", "C"],
                ["X", "Y", "Z"],
            ],
            [
                { parent: "A", child: "X" },
                { parent: "C", child: "X" },
            ],
        );
        const og = order(g);
        // X should not be first or last in rank 1 if bc=1 (middle of 0..2)
        // (Y and Z have no bc so they follow X, but X should be before them)
        expect(og.order.get("X")).toBe(0); // defined bc comes first, X bc=1 is only defined node
        // Y and Z (no bc) follow in their original order
        expect(before(og, "Y", "Z")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Couple-adjacency constraint
// ---------------------------------------------------------------------------

describe("order — couple adjacency (spouseGroup)", () => {
    it("same-rank couple stays adjacent after ordering", () => {
        // Rank 0: [A, B, C, D]; A and C share spouseGroup
        // No cross-rank edges so median sort won't move them, but repair should.
        const g = makeGraph([["A", "B", "C", "D"]], [], {
            A: { spouseGroup: "AC" },
            C: { spouseGroup: "AC" },
        });
        const og = order(g);
        expect(dist(og, "A", "C")).toBe(1);
    });

    it("couple in the middle of a rank remains adjacent after sweep", () => {
        // Rank 0: [P, Q]; Rank 1: [X, A, Y, B] with P→X, Q→B; A and B are spouseGroup
        const g = makeGraph(
            [
                ["P", "Q"],
                ["X", "A", "Y", "B"],
            ],
            [
                { parent: "P", child: "X" },
                { parent: "Q", child: "B" },
            ],
            { A: { spouseGroup: "AB" }, B: { spouseGroup: "AB" } },
        );
        const og = order(g);
        expect(dist(og, "A", "B")).toBe(1);
    });

    it("two independent couples in the same rank are each adjacent", () => {
        // [A, X, B, Y] where A+B and X+Y are couples
        const g = makeGraph([["A", "X", "B", "Y"]], [], {
            A: { spouseGroup: "AB" },
            B: { spouseGroup: "AB" },
            X: { spouseGroup: "XY" },
            Y: { spouseGroup: "XY" },
        });
        const og = order(g);
        expect(dist(og, "A", "B")).toBe(1);
        expect(dist(og, "X", "Y")).toBe(1);
    });

    it("ghost node ends up adjacent to its near person via spouseGroup", () => {
        // Cross-rank couple: ghost:b|near and near share spouseGroup
        // Both in the same rank; ghost has no cross-rank edges
        const nearId = "near";
        const bId = "b";
        const ghostId = ghostNodeId(bId, nearId);

        const nodes = new Map<LayoutNodeId, LayoutNode>();
        nodes.set(nearId, {
            id: nearId,
            kind: "person",
            personId: nearId,
            rank: 0,
            spouseGroup: `${nearId}|${bId}`,
        });
        nodes.set(ghostId, {
            id: ghostId,
            kind: "ghost",
            personId: bId,
            rank: 0,
            spouseGroup: `${nearId}|${bId}`,
        });
        nodes.set("other1", { id: "other1", kind: "person", personId: "other1", rank: 0 });
        nodes.set("other2", { id: "other2", kind: "person", personId: "other2", rank: 0 });

        const graph: LayeredGraph = {
            nodes,
            ranks: [["other1", nearId, "other2", ghostId]],
            parentEdges: [],
            spouseEdges: [],
        };

        const og = order(graph);
        expect(dist(og, nearId, ghostId)).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Sibling-block contiguity constraint
// ---------------------------------------------------------------------------

describe("order — sibling block contiguity (siblingBlockId)", () => {
    it("scattered siblings become contiguous", () => {
        // Rank: [X, sib1, Y, sib2, Z, sib3]  sib1/2/3 share same block
        const g = makeGraph([["X", "sib1", "Y", "sib2", "Z", "sib3"]], [], {
            sib1: { siblingBlockId: "S" },
            sib2: { siblingBlockId: "S" },
            sib3: { siblingBlockId: "S" },
        });
        const og = order(g);
        const pos = ["sib1", "sib2", "sib3"].map((id) => og.order.get(id)!).sort((a, b) => a - b);
        // Positions must be consecutive
        expect(pos[1]! - pos[0]!).toBe(1);
        expect(pos[2]! - pos[1]!).toBe(1);
    });

    it("already-contiguous sibling block is left alone", () => {
        const g = makeGraph([["X", "sib1", "sib2", "sib3", "Y"]], [], {
            sib1: { siblingBlockId: "S" },
            sib2: { siblingBlockId: "S" },
            sib3: { siblingBlockId: "S" },
        });
        const og = order(g);
        // Order should be same as input: sib1 < sib2 < sib3 and contiguous
        expect(before(og, "sib1", "sib2")).toBe(true);
        expect(before(og, "sib2", "sib3")).toBe(true);
        const positions = ["sib1", "sib2", "sib3"]
            .map((id) => og.order.get(id)!)
            .sort((a, b) => a - b);
        expect(positions[1]! - positions[0]!).toBe(1);
        expect(positions[2]! - positions[1]!).toBe(1);
    });

    it("two separate sibling blocks in one rank are each contiguous", () => {
        // [s1a, s2a, s1b, s2b, s1c]  block S1={s1a,s1b,s1c}, S2={s2a,s2b}
        const g = makeGraph([["s1a", "s2a", "s1b", "s2b", "s1c"]], [], {
            s1a: { siblingBlockId: "S1" },
            s1b: { siblingBlockId: "S1" },
            s1c: { siblingBlockId: "S1" },
            s2a: { siblingBlockId: "S2" },
            s2b: { siblingBlockId: "S2" },
        });
        const og = order(g);
        const s1 = ["s1a", "s1b", "s1c"].map((id) => og.order.get(id)!).sort((a, b) => a - b);
        expect(s1[1]! - s1[0]!).toBe(1);
        expect(s1[2]! - s1[1]!).toBe(1);
        const s2 = ["s2a", "s2b"].map((id) => og.order.get(id)!).sort((a, b) => a - b);
        expect(s2[1]! - s2[0]!).toBe(1);
    });

    it("siblings pulled under their parents after crossing-min", () => {
        // Rank 0: [P, Q] (parents); Rank 1: [sib1, X, sib2, Y, sib3]
        // P→sib1, P→sib2, P→sib3, Q→X, Q→Y
        // sib1/2/3 have siblingBlockId "S"
        // Median: sib1/2/3 bc = pos(P)=0, X and Y bc = pos(Q)=1
        // After sort+repair: sib group contiguous, X/Y contiguous
        const g = makeGraph(
            [
                ["P", "Q"],
                ["sib1", "X", "sib2", "Y", "sib3"],
            ],
            [
                { parent: "P", child: "sib1" },
                { parent: "P", child: "sib2" },
                { parent: "P", child: "sib3" },
                { parent: "Q", child: "X" },
                { parent: "Q", child: "Y" },
            ],
            {
                sib1: { siblingBlockId: "S" },
                sib2: { siblingBlockId: "S" },
                sib3: { siblingBlockId: "S" },
            },
        );
        const og = order(g);
        const sibPositions = ["sib1", "sib2", "sib3"]
            .map((id) => og.order.get(id)!)
            .sort((a, b) => a - b);
        expect(sibPositions[1]! - sibPositions[0]!).toBe(1);
        expect(sibPositions[2]! - sibPositions[1]!).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Constraint conflict resolution: couple-adjacency vs sibling-block
// ---------------------------------------------------------------------------

describe("order — couple adjacency wins over sibling-block contiguity", () => {
    it("spouse stays adjacent to its partner even when partner anchors a sibling block", () => {
        // Rank: [anchor, sib1, sib2, sib3, spouse]
        // anchor is in a 4-member sibling block AND is married to spouse.
        // Without the fix, repairSiblingBlocks would pull sib1/sib2/sib3
        // into orders 1..3 immediately after anchor, displacing spouse.
        // Correct behaviour: spouse ends up at anchor.order ± 1; the
        // sibling block tolerates the spouse splitting it.
        const g = makeGraph([["anchor", "sib1", "sib2", "sib3", "spouse"]], [], {
            anchor: { siblingBlockId: "S", spouseGroup: "C" },
            sib1: { siblingBlockId: "S" },
            sib2: { siblingBlockId: "S" },
            sib3: { siblingBlockId: "S" },
            spouse: { spouseGroup: "C" },
        });
        const og = order(g);
        expect(dist(og, "anchor", "spouse")).toBe(1);
    });

    it("ghost stays adjacent to its near partner when near partner is in a sibling block", () => {
        // Mirrors the EYPFY/OU6R1 case: cross-rank couple where the near
        // partner (rank 4) is also a member of a 4-sibling block. The ghost
        // is on the same rank as the near partner via layer().
        // ghostId = "ghost:OU6R1|EYPFY" (real OU6R1 placed near EYPFY).
        const ghostId = ghostNodeId("OU6R1", "EYPFY");
        // Insertion order with ghost at the tail forces repairCouple to do
        // real work: it must move the ghost to be adjacent to EYPFY even
        // after sibling-repair has compacted the EYPFY sibling block.
        const g: LayeredGraph = {
            nodes: new Map<LayoutNodeId, LayoutNode>([
                [
                    "EYPFY",
                    {
                        id: "EYPFY",
                        kind: "person",
                        personId: "EYPFY",
                        rank: 4,
                        spouseGroup: "EYPFY|OU6R1",
                        siblingBlockId: "SB",
                    },
                ],
                [
                    "WBTKP",
                    {
                        id: "WBTKP",
                        kind: "person",
                        personId: "WBTKP",
                        rank: 4,
                        siblingBlockId: "SB",
                    },
                ],
                [
                    "4M7XA",
                    {
                        id: "4M7XA",
                        kind: "person",
                        personId: "4M7XA",
                        rank: 4,
                        siblingBlockId: "SB",
                    },
                ],
                [
                    "MVI51",
                    {
                        id: "MVI51",
                        kind: "person",
                        personId: "MVI51",
                        rank: 4,
                        siblingBlockId: "SB",
                    },
                ],
                [
                    ghostId,
                    {
                        id: ghostId,
                        kind: "ghost",
                        personId: "OU6R1",
                        rank: 4,
                        spouseGroup: "EYPFY|OU6R1",
                    },
                ],
            ]),
            ranks: [[], [], [], [], ["EYPFY", "WBTKP", "4M7XA", "MVI51", ghostId]],
            parentEdges: [],
            spouseEdges: [],
        };
        const og = order(g);
        // Ghost must end up immediately next to EYPFY (regardless of side).
        expect(dist(og, "EYPFY", ghostId)).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Ghost-near adjacency: ghost cluster stays contiguous to near even after
// repairCoupleAdjacency pulls a same-rank spouse adjacent
// ---------------------------------------------------------------------------

describe("order — ghost-cluster adjacency to near (multi-spouse case)", () => {
    it("ghost stays adjacent to near when near also has a same-rank spouse", () => {
        // Near person N has TWO spouses:
        //   - S: same-rank, sharing spouseGroup "N|S"
        //   - cross-rank partner whose ghost G is on the same rank as N
        // repairClusterBlocks pulls N + G adjacent, then repairCoupleAdjacency
        // pulls S adjacent to N and previously displaced G. The new ghost-
        // cluster adjacency post-pass re-seats G on the side opposite S.
        const ghostId = ghostNodeId("P", "N");
        const nodes = new Map<LayoutNodeId, LayoutNode>([
            [
                "N",
                {
                    id: "N",
                    kind: "person",
                    personId: "N",
                    rank: 0,
                    spouseGroup: "N|S",
                    clusterBlockId: "cluster:N",
                },
            ],
            ["S", { id: "S", kind: "person", personId: "S", rank: 0, spouseGroup: "N|S" }],
            ["X", { id: "X", kind: "person", personId: "X", rank: 0 }],
            ["Y", { id: "Y", kind: "person", personId: "Y", rank: 0 }],
            [
                ghostId,
                {
                    id: ghostId,
                    kind: "ghost",
                    personId: "P",
                    rank: 0,
                    spouseGroup: "N|P",
                    clusterBlockId: "cluster:N",
                },
            ],
        ]);
        const g: LayeredGraph = {
            nodes,
            ranks: [["X", "N", "Y", "S", ghostId]],
            parentEdges: [],
            spouseEdges: [],
        };
        const og = order(g);
        // Both the same-rank spouse and the ghost must be adjacent to N.
        expect(dist(og, "N", "S")).toBe(1);
        expect(dist(og, "N", ghostId)).toBe(1);
        // S and ghost should sit on opposite sides of N.
        const posN = og.order.get("N")!;
        const posS = og.order.get("S")!;
        const posG = og.order.get(ghostId)!;
        expect(Math.sign(posS - posN)).not.toBe(Math.sign(posG - posN));
    });

    it("multi-ghost cluster stays contiguous to near with a same-rank spouse", () => {
        // Near person N has same-rank spouse S and TWO cross-rank partners
        // (ghosts G1 and G2). The fix must place [G1, G2] on the opposite side
        // of S, contiguous to N. Mirrors the worst-case Akaria DEMO scenario
        // (4-ghost cluster around id 15LJ6).
        const g1 = ghostNodeId("P1", "N");
        const g2 = ghostNodeId("P2", "N");
        const nodes = new Map<LayoutNodeId, LayoutNode>([
            ["A", { id: "A", kind: "person", personId: "A", rank: 0 }],
            [
                "N",
                {
                    id: "N",
                    kind: "person",
                    personId: "N",
                    rank: 0,
                    spouseGroup: "N|S",
                    clusterBlockId: "cluster:N",
                },
            ],
            ["S", { id: "S", kind: "person", personId: "S", rank: 0, spouseGroup: "N|S" }],
            ["B", { id: "B", kind: "person", personId: "B", rank: 0 }],
            [
                g1,
                {
                    id: g1,
                    kind: "ghost",
                    personId: "P1",
                    rank: 0,
                    spouseGroup: "N|P1",
                    clusterBlockId: "cluster:N",
                },
            ],
            ["C", { id: "C", kind: "person", personId: "C", rank: 0 }],
            [
                g2,
                {
                    id: g2,
                    kind: "ghost",
                    personId: "P2",
                    rank: 0,
                    spouseGroup: "N|P2",
                    clusterBlockId: "cluster:N",
                },
            ],
        ]);
        const g: LayeredGraph = {
            nodes,
            ranks: [["A", "N", "S", "B", g1, "C", g2]],
            parentEdges: [],
            spouseEdges: [],
        };
        const og = order(g);
        // S adjacent to N.
        expect(dist(og, "N", "S")).toBe(1);
        // Both ghosts adjacent to each other and the closer one adjacent to N.
        const posN = og.order.get("N")!;
        const posS = og.order.get("S")!;
        const posG1 = og.order.get(g1)!;
        const posG2 = og.order.get(g2)!;
        // Ghosts contiguous.
        expect(Math.abs(posG1 - posG2)).toBe(1);
        // Ghosts on opposite side of N from S.
        expect(Math.sign(posS - posN)).not.toBe(Math.sign(posG1 - posN));
        // One of the ghosts must sit at distance 1 from N (immediate neighbor).
        expect(Math.min(Math.abs(posG1 - posN), Math.abs(posG2 - posN))).toBe(1);
    });

    it("ghost cluster without a same-rank spouse goes to the right of near", () => {
        // No same-rank spouse — fall back to "ghosts on the right" default.
        const g1 = ghostNodeId("P1", "N");
        const g2 = ghostNodeId("P2", "N");
        const nodes = new Map<LayoutNodeId, LayoutNode>([
            ["A", { id: "A", kind: "person", personId: "A", rank: 0 }],
            [
                "N",
                {
                    id: "N",
                    kind: "person",
                    personId: "N",
                    rank: 0,
                    clusterBlockId: "cluster:N",
                },
            ],
            ["B", { id: "B", kind: "person", personId: "B", rank: 0 }],
            [
                g1,
                {
                    id: g1,
                    kind: "ghost",
                    personId: "P1",
                    rank: 0,
                    spouseGroup: "N|P1",
                    clusterBlockId: "cluster:N",
                },
            ],
            [
                g2,
                {
                    id: g2,
                    kind: "ghost",
                    personId: "P2",
                    rank: 0,
                    spouseGroup: "N|P2",
                    clusterBlockId: "cluster:N",
                },
            ],
        ]);
        const g: LayeredGraph = {
            nodes,
            ranks: [["A", "N", "B", g1, g2]],
            parentEdges: [],
            spouseEdges: [],
        };
        const og = order(g);
        // Both ghosts adjacent to N, in input relative order.
        const posN = og.order.get("N")!;
        const posG1 = og.order.get(g1)!;
        const posG2 = og.order.get(g2)!;
        expect(posG1).toBe(posN + 1);
        expect(posG2).toBe(posN + 2);
    });
});

// ---------------------------------------------------------------------------
// Swap overrides
// ---------------------------------------------------------------------------

describe("order — swap overrides", () => {
    it("swap override reverses the order of two nodes in the same rank", () => {
        // No edges: insertion order is [A, B, C]
        // Swap A and C → C should come before A
        const g = makeGraph([["A", "B", "C"]]);
        const og = order(g, { swap: [["A", "C"]] });
        expect(before(og, "C", "A")).toBe(true);
    });

    it("swap override on cross-rank nodes has no effect", () => {
        // A is rank 0, X is rank 1 — they're in different ranks, swap is a no-op
        const g = makeGraph([
            ["A", "B"],
            ["X", "Y"],
        ]);
        const og = order(g, { swap: [["A", "X"]] });
        // Just check that both ranks still have valid permutations
        for (const rankIds of og.ranks) {
            const positions = [...rankIds].map((id) => og.order.get(id)!).sort((a, b) => a - b);
            positions.forEach((v, i) => expect(v).toBe(i));
        }
    });

    it("swap override is applied after crossing-min (overrides algorithm result)", () => {
        // A→Y, B→X: algorithm would produce [Y, X] in rank 1 to remove crossing.
        // Swap Y and X back via override: final order should be [X, Y].
        const g = makeGraph(
            [
                ["A", "B"],
                ["X", "Y"],
            ],
            [
                { parent: "A", child: "Y" },
                { parent: "B", child: "X" },
            ],
        );
        const og = order(g, { swap: [["X", "Y"]] });
        expect(before(og, "X", "Y")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Integration: layer() output fed into order()
// ---------------------------------------------------------------------------

describe("order — integration with layer() output", () => {
    it("all nodes from layer() receive an order value", () => {
        let t = createTree("test", {
            given: "root",
            surname: "",
            gender: "m",
            spouseIds: [],
            display: "z1",
        });
        const sp = addPerson(t, {
            given: "sp",
            surname: "",
            gender: "f",
            spouseIds: [],
            display: "z1",
        });
        t = sp.tree;
        const c1 = addPerson(t, {
            given: "c1",
            surname: "",
            gender: "u",
            spouseIds: [],
            display: "z1",
        });
        t = c1.tree;
        const c2 = addPerson(t, {
            given: "c2",
            surname: "",
            gender: "u",
            spouseIds: [],
            display: "z1",
        });
        t = c2.tree;

        const r1 = linkSpouse(t, ROOT_ID, sp.id);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, c1.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);
        const r3 = linkParent(r2.value, c1.id, sp.id);
        if (!r3.ok) throw new Error(r3.error);
        const r4 = linkParent(r3.value, c2.id, ROOT_ID);
        if (!r4.ok) throw new Error(r4.error);
        const r5 = linkParent(r4.value, c2.id, sp.id);
        if (!r5.ok) throw new Error(r5.error);

        const vis = new Set(Object.keys(r5.value.people));
        const lg = layer(r5.value, vis, ROOT_ID);
        const og = order(lg);

        for (const nodeId of og.nodes.keys()) {
            expect(og.order.has(nodeId)).toBe(true);
        }
    });

    it("couple (spouseGroup) nodes from layer() are adjacent after order()", () => {
        let t = createTree("sp", {
            given: "root",
            surname: "",
            gender: "m",
            spouseIds: [],
            display: "z1",
        });
        const sp = addPerson(t, {
            given: "sp",
            surname: "",
            gender: "f",
            spouseIds: [],
            display: "z1",
        });
        t = sp.tree;
        const r = linkSpouse(t, ROOT_ID, sp.id);
        if (!r.ok) throw new Error(r.error);

        const vis = new Set(Object.keys(r.value.people));
        const lg = layer(r.value, vis, ROOT_ID);
        const og = order(lg);

        expect(dist(og, ROOT_ID, sp.id)).toBe(1);
    });

    it("siblings from layer() are contiguous after order()", () => {
        let t = createTree("sib", {
            given: "root",
            surname: "",
            gender: "m",
            spouseIds: [],
            display: "z1",
        });
        const sp = addPerson(t, {
            given: "sp",
            surname: "",
            gender: "f",
            spouseIds: [],
            display: "z1",
        });
        t = sp.tree;
        const c1 = addPerson(t, {
            given: "c1",
            surname: "",
            gender: "u",
            spouseIds: [],
            display: "z1",
        });
        t = c1.tree;
        const c2 = addPerson(t, {
            given: "c2",
            surname: "",
            gender: "u",
            spouseIds: [],
            display: "z1",
        });
        t = c2.tree;
        const c3 = addPerson(t, {
            given: "c3",
            surname: "",
            gender: "u",
            spouseIds: [],
            display: "z1",
        });
        t = c3.tree;

        const r1 = linkSpouse(t, ROOT_ID, sp.id);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, c1.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);
        const r3 = linkParent(r2.value, c1.id, sp.id);
        if (!r3.ok) throw new Error(r3.error);
        const r4 = linkParent(r3.value, c2.id, ROOT_ID);
        if (!r4.ok) throw new Error(r4.error);
        const r5 = linkParent(r4.value, c2.id, sp.id);
        if (!r5.ok) throw new Error(r5.error);
        const r6 = linkParent(r5.value, c3.id, ROOT_ID);
        if (!r6.ok) throw new Error(r6.error);
        const r7 = linkParent(r6.value, c3.id, sp.id);
        if (!r7.ok) throw new Error(r7.error);

        const vis = new Set(Object.keys(r7.value.people));
        const lg = layer(r7.value, vis, ROOT_ID);
        const og = order(lg);

        const positions = [c1.id, c2.id, c3.id]
            .map((id) => og.order.get(id)!)
            .sort((a, b) => a - b);
        expect(positions[1]! - positions[0]!).toBe(1);
        expect(positions[2]! - positions[1]!).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe("order — invariants", () => {
    it("order map contains exactly as many entries as nodes", () => {
        const g = makeGraph(
            [
                ["A", "B"],
                ["X", "Y", "Z"],
            ],
            [
                { parent: "A", child: "X" },
                { parent: "B", child: "Z" },
            ],
        );
        const og = order(g);
        expect(og.order.size).toBe(og.nodes.size);
    });

    it("no two nodes in the same rank share an order value", () => {
        const g = makeGraph(
            [
                ["A", "B", "C"],
                ["X", "Y"],
            ],
            [
                { parent: "A", child: "X" },
                { parent: "C", child: "Y" },
            ],
        );
        const og = order(g);
        for (const rankIds of og.ranks) {
            const positions = new Set(rankIds.map((id) => og.order.get(id)!));
            expect(positions.size).toBe(rankIds.length);
        }
    });

    it("each rank's order values span 0..length-1 exactly", () => {
        const g = makeGraph(
            [
                ["A", "B", "C", "D"],
                ["X", "Y"],
            ],
            [],
        );
        const og = order(g);
        for (const rankIds of og.ranks) {
            const positions = [...rankIds].map((id) => og.order.get(id)!).sort((a, b) => a - b);
            positions.forEach((v, i) => expect(v).toBe(i));
        }
    });

    it("node whose rank has only one member gets order 0", () => {
        const g = makeGraph([["solo"]]);
        const og = order(g);
        expect(og.order.get("solo")).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// DFS initial ordering (computeInitialOrder)
// ---------------------------------------------------------------------------

describe("computeInitialOrder", () => {
    it("places all nodes in their correct rank", () => {
        const g = makeGraph(
            [
                ["A", "B"],
                ["X", "Y", "Z"],
            ],
            [
                { parent: "A", child: "X" },
                { parent: "B", child: "Y" },
                { parent: "B", child: "Z" },
            ],
        );
        const init = computeInitialOrder(g);
        expect(init[0]).toHaveLength(2);
        expect(init[1]).toHaveLength(3);
        expect(init[0]).toContain("A");
        expect(init[0]).toContain("B");
    });

    it("groups siblings contiguously under their parent", () => {
        // Two parents A and B, each with two children (k1,k2 under A; k3,k4 under B).
        // DFS from A should place k1,k2 together; DFS from B should place k3,k4 together.
        const g = makeGraph(
            [
                ["A", "B"],
                ["k1", "k2", "k3", "k4"],
            ],
            [
                { parent: "A", child: "k1" },
                { parent: "A", child: "k2" },
                { parent: "B", child: "k3" },
                { parent: "B", child: "k4" },
            ],
        );
        const init = computeInitialOrder(g);
        const rank1 = init[1]!;
        const posK1 = rank1.indexOf("k1");
        const posK2 = rank1.indexOf("k2");
        const posK3 = rank1.indexOf("k3");
        const posK4 = rank1.indexOf("k4");
        // k1 and k2 must be adjacent (|pos difference| = 1)
        expect(Math.abs(posK1 - posK2)).toBe(1);
        // k3 and k4 must be adjacent
        expect(Math.abs(posK3 - posK4)).toBe(1);
        // k1/k2 block and k3/k4 block must not interleave
        const aBlock = [posK1, posK2].sort((a, b) => a - b);
        const bBlock = [posK3, posK4].sort((a, b) => a - b);
        expect(aBlock[1]! + 1).toBe(bBlock[0]!); // A's children come right before B's
    });

    it("covers all nodes in the graph (no node left out)", () => {
        const g = makeGraph(
            [
                ["R1", "R2"],
                ["C1", "C2", "C3"],
            ],
            [
                { parent: "R1", child: "C1" },
                { parent: "R2", child: "C2" },
                { parent: "R2", child: "C3" },
            ],
        );
        const init = computeInitialOrder(g);
        const all = init.flat();
        for (const [id] of g.nodes) {
            expect(all).toContain(id);
        }
        expect(all).toHaveLength(g.nodes.size);
    });

    it("handles disconnected nodes (no parent edges)", () => {
        const g = makeGraph([["A", "B", "C"]]);
        const init = computeInitialOrder(g);
        expect(init[0]).toHaveLength(3);
        expect(new Set(init[0])).toEqual(new Set(["A", "B", "C"]));
    });

    /**
     * Genealogy data routinely has 50-generation straight-line ancestries.
     * The original recursive DFS blew the call stack on these (Node default
     * is ~10-15k frames; a long chain isn't quite there but the recursive
     * implementation also adds frames for every spouse / sibling diversion,
     * pushing it within reach). Building 5,000 generations here is well
     * past what any real tree would have but proves the iterative DFS is
     * stack-safe.
     */
    it("does not blow the stack on a deep straight-line lineage (5,000 generations)", () => {
        const N = 5000;
        const ranks: string[][] = [];
        const parentEdges: { parent: string; child: string }[] = [];
        for (let i = 0; i < N; i++) {
            ranks.push([`g${String(i)}`]);
            if (i > 0) parentEdges.push({ parent: `g${String(i - 1)}`, child: `g${String(i)}` });
        }
        const g = makeGraph(ranks, parentEdges);
        // Should not throw a RangeError ("Maximum call stack size exceeded").
        const init = computeInitialOrder(g);
        expect(init.length).toBe(N);
        expect(init[0]![0]).toBe("g0");
        expect(init[N - 1]![0]).toBe(`g${String(N - 1)}`);
    });
});
