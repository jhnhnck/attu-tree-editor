/*
 * FamilyTreeEditor - tests for layout/passes/place.ts
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { PERSON_W, ROW_H, SIBLING_GAP } from "$lib/layout/constants";
import type { LayeredGraph, LayoutNode, LayoutNodeId, OrderedGraph } from "$lib/layout/ir";
import { layer } from "$lib/layout/passes/layer";
import { order } from "$lib/layout/passes/order";
import { place } from "$lib/layout/passes/place";
import type { Person, Tree } from "$lib/domain/types";

const DELTA = PERSON_W + SIBLING_GAP; // minimum x separation

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function lineage(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("test", blank("root", "f"));
    const kid = addPerson(t, blank("kid", "u"));
    t = kid.tree;
    const grand = addPerson(t, blank("grand", "u"));
    t = grand.tree;
    const r1 = linkParent(t, kid.id, ROOT_ID);
    if (!r1.ok) throw new Error(r1.error);
    const r2 = linkParent(r1.value, grand.id, kid.id);
    if (!r2.ok) throw new Error(r2.error);
    return { tree: r2.value, ids: { root: ROOT_ID, kid: kid.id, grand: grand.id } };
}

function spouseTree(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("sp", blank("root", "m"));
    const sp = addPerson(t, blank("spouse", "f"));
    t = sp.tree;
    const r = linkSpouse(t, ROOT_ID, sp.id);
    if (!r.ok) throw new Error(r.error);
    return { tree: r.value, ids: { root: ROOT_ID, spouse: sp.id } };
}

/** root + spouse → child1, child2, child3 */
function threeChildren(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("3c", blank("root", "m"));
    const sp = addPerson(t, blank("spouse", "f"));
    t = sp.tree;
    const r1 = linkSpouse(t, ROOT_ID, sp.id);
    if (!r1.ok) throw new Error(r1.error);
    t = r1.value;
    const c1 = addPerson(t, blank("c1", "u"));
    t = c1.tree;
    const c2 = addPerson(t, blank("c2", "u"));
    t = c2.tree;
    const c3 = addPerson(t, blank("c3", "u"));
    t = c3.tree;
    for (const cid of [c1.id, c2.id, c3.id]) {
        const ra = linkParent(t, cid, ROOT_ID);
        if (!ra.ok) throw new Error(ra.error);
        const rb = linkParent(ra.value, cid, sp.id);
        if (!rb.ok) throw new Error(rb.error);
        t = rb.value;
    }
    return { tree: t, ids: { root: ROOT_ID, sp: sp.id, c1: c1.id, c2: c2.id, c3: c3.id } };
}

/**
 * One man (M) at rank 1 with three wives (W1, W2, W3) at rank 0, each with
 * a joint child at rank 2. M is the rank-above-children "primary"; the three
 * wives become ghosts at M's rank — the canonical multi-ghost-per-near case.
 */
function multipleGhostsCrossRank(): {
    tree: Tree;
    ids: Record<string, string>;
} {
    let t = createTree("multi", blank("dad", "m"));
    const m = addPerson(t, blank("M", "m"));
    t = m.tree;
    const r0 = linkParent(t, m.id, ROOT_ID);
    if (!r0.ok) throw new Error(r0.error);
    t = r0.value;

    const w1 = addPerson(t, blank("W1", "f"));
    t = w1.tree;
    const w2 = addPerson(t, blank("W2", "f"));
    t = w2.tree;
    const w3 = addPerson(t, blank("W3", "f"));
    t = w3.tree;

    for (const wid of [w1.id, w2.id, w3.id]) {
        const sp = linkSpouse(t, m.id, wid);
        if (!sp.ok) throw new Error(sp.error);
        t = sp.value;
        const child = addPerson(t, blank(`c_${wid}`, "u"));
        t = child.tree;
        const lp1 = linkParent(t, child.id, m.id);
        if (!lp1.ok) throw new Error(lp1.error);
        const lp2 = linkParent(lp1.value, child.id, wid);
        if (!lp2.ok) throw new Error(lp2.error);
        t = lp2.value;
    }

    return { tree: t, ids: { dad: ROOT_ID, m: m.id, w1: w1.id, w2: w2.id, w3: w3.id } };
}

/** root (f) → a_kid → a_grand (f) + b (m) → child  [cross-rank couple] */
function crossRankCouple(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("cross", blank("root", "f"));
    const ak = addPerson(t, blank("a_kid", "u"));
    t = ak.tree;
    const ag = addPerson(t, blank("a_grand", "f"));
    t = ag.tree;
    const b = addPerson(t, blank("b", "m"));
    t = b.tree;
    const child = addPerson(t, blank("child", "u"));
    t = child.tree;
    const r1 = linkParent(t, ak.id, ROOT_ID);
    if (!r1.ok) throw new Error(r1.error);
    const r2 = linkParent(r1.value, ag.id, ak.id);
    if (!r2.ok) throw new Error(r2.error);
    const r3 = linkSpouse(r2.value, ag.id, b.id);
    if (!r3.ok) throw new Error(r3.error);
    const r4 = linkParent(r3.value, child.id, ag.id);
    if (!r4.ok) throw new Error(r4.error);
    const r5 = linkParent(r4.value, child.id, b.id);
    if (!r5.ok) throw new Error(r5.error);
    return {
        tree: r5.value,
        ids: { root: ROOT_ID, a_kid: ak.id, a_grand: ag.id, b: b.id, child: child.id },
    };
}

/** Build a minimal OrderedGraph from raw arrays (for unit testing helpers). */
function makeOrdered(
    rankArrays: string[][],
    parentEdges: { parent: string; child: string }[] = [],
    nodeExtras: Record<string, { spouseGroup?: string; siblingBlockId?: string }> = {},
): OrderedGraph {
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
    const order = new Map<LayoutNodeId, number>();
    for (const rank of rankArrays) {
        rank.forEach((id, i) => order.set(id, i));
    }
    const layeredGraph: LayeredGraph = {
        nodes,
        ranks: rankArrays.map((r) => [...r]),
        parentEdges,
        spouseEdges: [],
    };
    return { ...layeredGraph, order };
}

// ---------------------------------------------------------------------------
// Structural correctness
// ---------------------------------------------------------------------------

describe("place() — output structure", () => {
    it("empty graph returns PlacedGraph with empty maps and min bbox", () => {
        const empty = makeOrdered([]);
        const pg = place(empty);
        expect(pg.x.size).toBe(0);
        expect(pg.y.size).toBe(0);
        expect(pg.bbox.width).toBe(1);
        expect(pg.bbox.height).toBe(1);
    });

    it("every node has an x entry", () => {
        const { tree } = lineage();
        const pg = place(order(layer(tree, new Set(Object.keys(tree.people)), tree.rootId)));
        for (const id of pg.nodes.keys()) {
            expect(pg.x.has(id)).toBe(true);
        }
    });

    it("every node has a y entry", () => {
        const { tree } = lineage();
        const pg = place(order(layer(tree, new Set(Object.keys(tree.people)), tree.rootId)));
        for (const id of pg.nodes.keys()) {
            expect(pg.y.has(id)).toBe(true);
        }
    });

    it("output graph retains all LayeredGraph fields", () => {
        const { tree } = lineage();
        const og = order(layer(tree, new Set(Object.keys(tree.people)), tree.rootId));
        const pg = place(og);
        expect(pg.nodes).toBe(og.nodes);
        expect(pg.ranks).toBe(og.ranks);
        expect(pg.parentEdges).toBe(og.parentEdges);
        expect(pg.spouseEdges).toBe(og.spouseEdges);
        expect(pg.order).toBe(og.order);
    });
});

// ---------------------------------------------------------------------------
// y coordinates
// ---------------------------------------------------------------------------

describe("place() — y coordinates", () => {
    it("y = rank * ROW_H for all nodes", () => {
        const { tree } = lineage();
        const pg = place(order(layer(tree, new Set(Object.keys(tree.people)), tree.rootId)));
        for (const [id, node] of pg.nodes) {
            expect(pg.y.get(id)).toBeCloseTo(node.rank * ROW_H);
        }
    });

    it("root is at y=0, kid at y=ROW_H, grand at y=2*ROW_H", () => {
        const { tree, ids } = lineage();
        const pg = place(order(layer(tree, new Set(Object.keys(tree.people)), tree.rootId)));
        const rootNode = pg.nodes.get(ids.root!)!;
        const kidNode = pg.nodes.get(ids.kid!)!;
        const grandNode = pg.nodes.get(ids.grand!)!;
        expect(pg.y.get(ids.root!)).toBeCloseTo(rootNode.rank * ROW_H);
        expect(pg.y.get(ids.kid!)).toBeCloseTo(kidNode.rank * ROW_H);
        expect(pg.y.get(ids.grand!)).toBeCloseTo(grandNode.rank * ROW_H);
        // relative: kid is one row below root, grand one below kid
        expect(pg.y.get(ids.kid!)! - pg.y.get(ids.root!)!).toBeCloseTo(ROW_H);
        expect(pg.y.get(ids.grand!)! - pg.y.get(ids.kid!)!).toBeCloseTo(ROW_H);
    });
});

// ---------------------------------------------------------------------------
// Non-overlap guarantee
// ---------------------------------------------------------------------------

describe("place() — non-overlap", () => {
    it("two siblings are at least DELTA apart", () => {
        const og = makeOrdered(
            [
                ["A", "B"],
                ["C", "D"],
            ],
            [
                { parent: "A", child: "C" },
                { parent: "B", child: "D" },
            ],
        );
        const pg = place(og);
        const xC = pg.x.get("C")!;
        const xD = pg.x.get("D")!;
        expect(Math.abs(xC - xD)).toBeGreaterThanOrEqual(DELTA - 1e-9);
    });

    it("three siblings each DELTA apart minimum", () => {
        const og = makeOrdered([["A"], ["B", "C", "D"]]);
        const pg = place(og);
        const sorted = ["B", "C", "D"]
            .map((id) => ({ id, x: pg.x.get(id)! }))
            .sort((a, b) => a.x - b.x);
        for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i]!.x - sorted[i - 1]!.x).toBeGreaterThanOrEqual(DELTA - 1e-9);
        }
    });

    it("no overlap in the full pipeline for threeChildren fixture", () => {
        const { tree } = threeChildren();
        const pg = place(order(layer(tree, new Set(Object.keys(tree.people)), tree.rootId)));

        // Check each rank independently
        const byRank = new Map<number, { id: LayoutNodeId; x: number }[]>();
        for (const [id, node] of pg.nodes) {
            const r = node.rank;
            if (!byRank.has(r)) byRank.set(r, []);
            byRank.get(r)!.push({ id, x: pg.x.get(id)! });
        }
        for (const nodesInRank of byRank.values()) {
            nodesInRank.sort((a, b) => a.x - b.x);
            for (let i = 1; i < nodesInRank.length; i++) {
                expect(nodesInRank[i]!.x - nodesInRank[i - 1]!.x).toBeGreaterThanOrEqual(
                    DELTA - 1e-9,
                );
            }
        }
    });
});

// ---------------------------------------------------------------------------
// Parent alignment
// ---------------------------------------------------------------------------

describe("place() — parent alignment", () => {
    it("single parent is centered above its single child", () => {
        const og = makeOrdered([["A"], ["B"]], [{ parent: "A", child: "B" }]);
        const pg = place(og);
        // Parent center = child center (both at x=0 for a single node)
        expect(pg.x.get("A")).toBeCloseTo(pg.x.get("B")!);
    });

    it("parent is roughly centered above two children", () => {
        const og = makeOrdered(
            [["P"], ["L", "R"]],
            [
                { parent: "P", child: "L" },
                { parent: "P", child: "R" },
            ],
        );
        const pg = place(og);
        const xL = pg.x.get("L")!;
        const xR = pg.x.get("R")!;
        const midChildren = (xL + xR) / 2;
        const xP = pg.x.get("P")!;
        // Allow some tolerance — compaction can shift nodes slightly
        expect(Math.abs(xP - midChildren)).toBeLessThan(DELTA);
    });

    it("parent with three children is centred over the middle child", () => {
        const og = makeOrdered(
            [["P"], ["L", "M", "R"]],
            [
                { parent: "P", child: "L" },
                { parent: "P", child: "M" },
                { parent: "P", child: "R" },
            ],
        );
        const pg = place(og);
        const xL = pg.x.get("L")!;
        const xR = pg.x.get("R")!;
        const midChildren = (xL + xR) / 2;
        const xP = pg.x.get("P")!;
        expect(Math.abs(xP - midChildren)).toBeLessThan(DELTA);
    });
});

// ---------------------------------------------------------------------------
// Bounding box
// ---------------------------------------------------------------------------

describe("place() — bbox", () => {
    it("bbox width >= PERSON_W for a single node", () => {
        const og = makeOrdered([["A"]]);
        const pg = place(og);
        expect(pg.bbox.width).toBeGreaterThanOrEqual(PERSON_W);
    });

    it("bbox height = (maxRank + 1) * ROW_H", () => {
        const { tree } = lineage(); // 3 generations (ranks 0, 1, 2)
        const pg = place(order(layer(tree, new Set(Object.keys(tree.people)), tree.rootId)));
        const maxRank = Math.max(...[...pg.nodes.values()].map((n) => n.rank));
        expect(pg.bbox.height).toBeCloseTo((maxRank + 1) * ROW_H);
    });

    it("bbox width covers all nodes (max x + PERSON_W)", () => {
        const { tree } = threeChildren();
        const pg = place(order(layer(tree, new Set(Object.keys(tree.people)), tree.rootId)));
        let maxX = 0;
        for (const [id] of pg.nodes) {
            const xv = pg.x.get(id)!;
            if (xv + PERSON_W > maxX) maxX = xv + PERSON_W;
        }
        expect(pg.bbox.width).toBeCloseTo(maxX);
    });

    it("min x is 0 (layout is left-aligned to origin)", () => {
        const { tree } = lineage();
        const pg = place(order(layer(tree, new Set(Object.keys(tree.people)), tree.rootId)));
        let minX = Infinity;
        for (const [id] of pg.nodes) {
            const v = pg.x.get(id)!;
            if (v < minX) minX = v;
        }
        expect(minX).toBeCloseTo(0);
    });
});

// ---------------------------------------------------------------------------
// Pinned overrides
// ---------------------------------------------------------------------------

describe("place() — pinned overrides", () => {
    it("pinned node lands at the specified x (when there is room)", () => {
        const og = makeOrdered([["A", "B", "C"]]);
        // Pin B at x = 10; A and C must fit around it
        const pinned = new Map([["B", { x: 10 }]]);
        const pg = place(og, { pinned });
        expect(pg.x.get("B")).toBeCloseTo(10);
    });

    it("pinned x forces neighbouring nodes apart", () => {
        const og = makeOrdered([["A", "B", "C"]]);
        const pinned = new Map([["B", { x: 50 }]]);
        const pg = place(og, { pinned });
        expect(pg.x.get("B")).toBeCloseTo(50);
        // C must be at least DELTA to the right of B
        expect(pg.x.get("C")!).toBeGreaterThanOrEqual(50 + DELTA - 1e-9);
    });

    it("no pinned override leaves x well-formed", () => {
        const og = makeOrdered([["A", "B"]]);
        const pg = place(og, {});
        expect(pg.x.get("B")! - pg.x.get("A")!).toBeGreaterThanOrEqual(DELTA - 1e-9);
    });
});

// ---------------------------------------------------------------------------
// Ghost nodes
// ---------------------------------------------------------------------------

describe("place() — ghost nodes", () => {
    it("ghost node has an x coordinate", () => {
        const { tree } = crossRankCouple();
        const visible = new Set(Object.keys(tree.people));
        const pg = place(order(layer(tree, visible, tree.rootId)));
        for (const [id, node] of pg.nodes) {
            if (node.kind === "ghost") {
                expect(pg.x.has(id)).toBe(true);
            }
        }
    });

    it("ghost node is on the same rank as its near partner", () => {
        const { tree } = crossRankCouple();
        const visible = new Set(Object.keys(tree.people));
        const pg = place(order(layer(tree, visible, tree.rootId)));
        for (const [id, node] of pg.nodes) {
            if (node.kind === "ghost") {
                // The ghost should be adjacent (within 2*DELTA) to at least one real
                // node on its rank — confirming it wasn't placed in isolation.
                const sameRankX = [...pg.nodes.entries()]
                    .filter(([, n]) => n.rank === node.rank && n.kind !== "ghost")
                    .map(([nid]) => pg.x.get(nid)!);
                if (sameRankX.length > 0) {
                    const minDist = Math.min(
                        ...sameRankX.map((nx) => Math.abs(nx - pg.x.get(id)!)),
                    );
                    expect(minDist).toBeLessThanOrEqual(DELTA * 2 + 1e-9);
                }
            }
        }
    });

    it("multiple cross-rank ghosts of one near are clustered DELTA-spaced around it", () => {
        // The polygamous-cross-rank bug: one man with N≥3 wives at a
        // different rank produced ghosts that scattered to the far end of
        // the rank (dx 144–159 u in the Akaria fixture). After the fix, the
        // near and all of its ghosts must form a contiguous DELTA-spaced
        // run.
        const { tree, ids } = multipleGhostsCrossRank();
        const visible = new Set(Object.keys(tree.people));
        const pg = place(order(layer(tree, visible, tree.rootId)));

        const wives = new Set([ids.w1!, ids.w2!, ids.w3!]);
        const ghostEntries = [...pg.nodes.entries()].filter(
            ([, n]) => n.kind === "ghost" && wives.has(n.personId),
        );
        expect(ghostEntries.length).toBe(3);

        // Every ghost lives on M's rank.
        const mRank = pg.nodes.get(ids.m!)!.rank;
        for (const [, node] of ghostEntries) {
            expect(node.rank).toBe(mRank);
        }

        // M plus its three ghosts form a contiguous run; sorted by x, every
        // consecutive pair is exactly DELTA apart (no BRANCH_GAP and no
        // unrelated node between them).
        const xM = pg.x.get(ids.m!)!;
        const ghostXs = ghostEntries.map(([id]) => pg.x.get(id)!);
        const allXs = [xM, ...ghostXs].sort((a, b) => a - b);
        for (let i = 1; i < allXs.length; i++) {
            expect(allXs[i]! - allXs[i - 1]!).toBeCloseTo(DELTA, 5);
        }

        // The cluster span is bounded by (cluster size − 1) × DELTA. With M
        // anchoring one end and three ghosts trailing, the farthest ghost
        // sits at exactly 3·DELTA from M.
        const farthestDx = Math.max(...ghostXs.map((gx) => Math.abs(gx - xM)));
        expect(farthestDx).toBeLessThanOrEqual(3 * DELTA + 1e-6);
    });

    it("ghost and real nodes on the same rank are at least DELTA apart", () => {
        const { tree } = crossRankCouple();
        const visible = new Set(Object.keys(tree.people));
        const pg = place(order(layer(tree, visible, tree.rootId)));

        const byRank = new Map<number, { id: LayoutNodeId; x: number }[]>();
        for (const [id, node] of pg.nodes) {
            if (!byRank.has(node.rank)) byRank.set(node.rank, []);
            byRank.get(node.rank)!.push({ id, x: pg.x.get(id)! });
        }
        for (const nodesInRank of byRank.values()) {
            nodesInRank.sort((a, b) => a.x - b.x);
            for (let i = 1; i < nodesInRank.length; i++) {
                expect(nodesInRank[i]!.x - nodesInRank[i - 1]!.x).toBeGreaterThanOrEqual(
                    DELTA - 1e-9,
                );
            }
        }
    });
});

// ---------------------------------------------------------------------------
// Integration with layer() + order()
// ---------------------------------------------------------------------------

describe("place() — integration with layer() + order()", () => {
    it("round-trips through the full pipeline for lineage", () => {
        const { tree, ids } = lineage();
        const visible = new Set(Object.keys(tree.people));
        const pg = place(order(layer(tree, visible, tree.rootId)));

        expect(pg.nodes.has(ids.root!)).toBe(true);
        expect(pg.nodes.has(ids.kid!)).toBe(true);
        expect(pg.nodes.has(ids.grand!)).toBe(true);
        expect(pg.x.size).toBe(3);
    });

    it("round-trips for spouseTree", () => {
        const { tree, ids } = spouseTree();
        const visible = new Set(Object.keys(tree.people));
        const pg = place(order(layer(tree, visible, tree.rootId)));

        expect(pg.x.size).toBe(2);
        // Both spouses are at rank 0, y=0
        expect(pg.y.get(ids.root!)).toBeCloseTo(0);
        expect(pg.y.get(ids.spouse!)).toBeCloseTo(0);
    });

    it("round-trips for crossRankCouple (includes ghost)", () => {
        const { tree } = crossRankCouple();
        const visible = new Set(Object.keys(tree.people));
        const pg = place(order(layer(tree, visible, tree.rootId)));

        const ghosts = [...pg.nodes.values()].filter((n) => n.kind === "ghost");
        expect(ghosts.length).toBeGreaterThan(0);
        for (const g of ghosts) {
            expect(pg.x.has(g.id)).toBe(true);
            expect(pg.y.has(g.id)).toBe(true);
        }
    });

    it("order is preserved: nodes ordered left-to-right match order map", () => {
        const { tree } = threeChildren();
        const visible = new Set(Object.keys(tree.people));
        const og = order(layer(tree, visible, tree.rootId));
        const pg = place(og);

        // Within each rank, nodes with lower order values should have lower x
        for (const rankIds of pg.ranks) {
            const sorted = [...rankIds].sort(
                (a, b) => (og.order.get(a) ?? 0) - (og.order.get(b) ?? 0),
            );
            for (let i = 1; i < sorted.length; i++) {
                const xPrev = pg.x.get(sorted[i - 1]!)!;
                const xCurr = pg.x.get(sorted[i]!)!;
                expect(xCurr).toBeGreaterThanOrEqual(xPrev + DELTA - 1e-9);
            }
        }
    });
});
