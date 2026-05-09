/*
 * FamilyTreeEditor - tests for layout/ir.ts (IR types + adapters)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { hvLayout, ROW_H } from "$lib/layout/hvLayout";
import {
    ghostNodeId,
    parseGhostNodeId,
    hvLayoutToPlacedGraph,
    placedGraphToHvLayout,
} from "$lib/layout/ir";
import type { Person, Tree } from "$lib/domain/types";

// ---------------------------------------------------------------------------
// Fixture helpers (mirror hvLayout.test.ts to keep tests self-contained)
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

/** root → a_kid → a_grand (f). a_grand + b (no parents) → child. Cross-row couple. */
function crossRowCouple(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("cross", blank("root", "f"));
    const a_kid = addPerson(t, blank("a_kid", "u"));
    t = a_kid.tree;
    const a_grand = addPerson(t, blank("a_grand", "f"));
    t = a_grand.tree;
    const b = addPerson(t, blank("b", "m"));
    t = b.tree;
    const child = addPerson(t, blank("child", "u"));
    t = child.tree;
    const r1 = linkParent(t, a_kid.id, ROOT_ID);
    if (!r1.ok) throw new Error(r1.error);
    const r2 = linkParent(r1.value, a_grand.id, a_kid.id);
    if (!r2.ok) throw new Error(r2.error);
    const r3 = linkSpouse(r2.value, a_grand.id, b.id);
    if (!r3.ok) throw new Error(r3.error);
    const r4 = linkParent(r3.value, child.id, a_grand.id);
    if (!r4.ok) throw new Error(r4.error);
    const r5 = linkParent(r4.value, child.id, b.id);
    if (!r5.ok) throw new Error(r5.error);
    return {
        tree: r5.value,
        ids: {
            root: ROOT_ID,
            a_kid: a_kid.id,
            a_grand: a_grand.id,
            b: b.id,
            child: child.id,
        },
    };
}

// ---------------------------------------------------------------------------
// ghostNodeId / parseGhostNodeId
// ---------------------------------------------------------------------------

describe("ghostNodeId / parseGhostNodeId", () => {
    it("produces and parses round-trip correctly", () => {
        const id = ghostNodeId("PERSON_A", "PERSON_B");
        const parsed = parseGhostNodeId(id);
        expect(parsed).not.toBeNull();
        expect(parsed!.ghostOf).toBe("PERSON_A");
        expect(parsed!.nearId).toBe("PERSON_B");
    });

    it("returns null for non-ghost ids", () => {
        expect(parseGhostNodeId("PERSON_A")).toBeNull();
        expect(parseGhostNodeId("")).toBeNull();
        expect(parseGhostNodeId(ROOT_ID)).toBeNull();
    });

    it("ghost prefix is recognisable", () => {
        const id = ghostNodeId("X", "Y");
        expect(id.startsWith("ghost:")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// hvLayoutToPlacedGraph — structural correctness
// ---------------------------------------------------------------------------

describe("hvLayoutToPlacedGraph — nodes", () => {
    it("contains one person node per visible person", () => {
        const { tree, ids } = lineage();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        expect(pg.nodes.has(ids.root!)).toBe(true);
        expect(pg.nodes.has(ids.kid!)).toBe(true);
        expect(pg.nodes.has(ids.grand!)).toBe(true);
        for (const id of [ids.root!, ids.kid!, ids.grand!]) {
            expect(pg.nodes.get(id)!.kind).toBe("person");
            expect(pg.nodes.get(id)!.personId).toBe(id);
        }
    });

    it("assigns correct rank (y / ROW_H) to each person", () => {
        const { tree, ids } = lineage();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        // hvLayout places them at y = 0, ROW_H, 2*ROW_H
        const rootRank = pg.nodes.get(ids.root!)!.rank;
        const kidRank = pg.nodes.get(ids.kid!)!.rank;
        const grandRank = pg.nodes.get(ids.grand!)!.rank;
        expect(kidRank - rootRank).toBe(1);
        expect(grandRank - kidRank).toBe(1);
    });

    it("promotes ghost nodes as first-class nodes", () => {
        const { tree } = crossRowCouple();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        for (const ghost of result.ghosts) {
            const nodeId = ghostNodeId(ghost.ghostOf, ghost.nearId);
            expect(pg.nodes.has(nodeId)).toBe(true);
            expect(pg.nodes.get(nodeId)!.kind).toBe("ghost");
            expect(pg.nodes.get(nodeId)!.personId).toBe(ghost.ghostOf);
        }
    });

    it("ghost node rank matches its y position in hvLayout", () => {
        const { tree } = crossRowCouple();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        for (const ghost of result.ghosts) {
            const nodeId = ghostNodeId(ghost.ghostOf, ghost.nearId);
            const node = pg.nodes.get(nodeId)!;
            expect(node.rank).toBe(Math.round(ghost.y / ROW_H));
        }
    });
});

describe("hvLayoutToPlacedGraph — x/y coordinates", () => {
    it("x/y maps contain all node ids", () => {
        const { tree } = lineage();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        for (const nodeId of pg.nodes.keys()) {
            expect(pg.x.has(nodeId)).toBe(true);
            expect(pg.y.has(nodeId)).toBe(true);
        }
    });

    it("real person x/y matches hvLayout positions", () => {
        const { tree } = lineage();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        for (const [id, pos] of result.positions) {
            expect(pg.x.get(id)).toBeCloseTo(pos.x);
            expect(pg.y.get(id)).toBeCloseTo(pos.y);
        }
    });

    it("ghost x/y matches hvLayout ghost positions", () => {
        const { tree } = crossRowCouple();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        for (const ghost of result.ghosts) {
            const nodeId = ghostNodeId(ghost.ghostOf, ghost.nearId);
            expect(pg.x.get(nodeId)).toBeCloseTo(ghost.x);
            expect(pg.y.get(nodeId)).toBeCloseTo(ghost.y);
        }
    });
});

describe("hvLayoutToPlacedGraph — ranks and ordering", () => {
    it("every node appears in exactly one rank", () => {
        const { tree } = lineage();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        const seen = new Set<string>();
        for (const rankIds of pg.ranks) {
            for (const id of rankIds) {
                expect(seen.has(id)).toBe(false);
                seen.add(id);
            }
        }
        expect(seen.size).toBe(pg.nodes.size);
    });

    it("nodes in a rank are ordered left-to-right by x", () => {
        const { tree } = lineage();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        for (const rankIds of pg.ranks) {
            const orders = rankIds.map((id) => pg.order.get(id) ?? -1);
            const xs = rankIds.map((id) => pg.x.get(id) ?? 0);
            for (let i = 1; i < rankIds.length; i++) {
                if (orders[i - 1]! < orders[i]!) {
                    expect(xs[i - 1]!).toBeLessThanOrEqual(xs[i]!);
                }
            }
        }
    });

    it("order values within a rank are 0-based and contiguous", () => {
        const { tree } = lineage();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        for (const rankIds of pg.ranks) {
            const orders = rankIds.map((id) => pg.order.get(id) ?? -1).sort((a, b) => a - b);
            orders.forEach((o, i) => expect(o).toBe(i));
        }
    });
});

describe("hvLayoutToPlacedGraph — edges", () => {
    it("records parent edges for visible parent-child links", () => {
        const { tree, ids } = lineage();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        const hasEdge = (parent: string, child: string) =>
            pg.parentEdges.some((e) => e.parent === parent && e.child === child);

        expect(hasEdge(ids.root!, ids.kid!)).toBe(true);
        expect(hasEdge(ids.kid!, ids.grand!)).toBe(true);
    });

    it("records spouse edges for couples", () => {
        const { tree, ids } = spouseTree();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        const hasSpouse = (a: string, b: string) =>
            pg.spouseEdges.some(
                (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
            );

        expect(hasSpouse(ids.root!, ids.spouse!)).toBe(true);
    });

    it("does not record edges for hidden people", () => {
        const { tree, ids } = lineage();
        const result = hvLayout(tree, { visible: new Set([ids.root!, ids.kid!]) });
        const pg = hvLayoutToPlacedGraph(result, tree);

        // grand is hidden, so no edge from kid to grand
        expect(pg.parentEdges.some((e) => e.child === ids.grand!)).toBe(false);
    });
});

describe("hvLayoutToPlacedGraph — bbox", () => {
    it("bbox matches hvLayout canvas", () => {
        const { tree } = lineage();
        const result = hvLayout(tree);
        const pg = hvLayoutToPlacedGraph(result, tree);

        expect(pg.bbox.width).toBeCloseTo(result.canvas.width);
        expect(pg.bbox.height).toBeCloseTo(result.canvas.height);
    });
});

// ---------------------------------------------------------------------------
// placedGraphToHvLayout — round-trip correctness
// ---------------------------------------------------------------------------

describe("placedGraphToHvLayout — round-trip", () => {
    function roundTrip(tree: Tree, opts?: Parameters<typeof hvLayout>[1]) {
        const original = hvLayout(tree, opts);
        const pg = hvLayoutToPlacedGraph(original, tree);
        return { original, restored: placedGraphToHvLayout(pg) };
    }

    it("positions round-trip exactly for a lineage", () => {
        const { tree } = lineage();
        const { original, restored } = roundTrip(tree);

        for (const [id, pos] of original.positions) {
            const rpos = restored.positions.get(id);
            expect(rpos).toBeDefined();
            expect(rpos!.x).toBeCloseTo(pos.x);
            expect(rpos!.y).toBeCloseTo(pos.y);
        }
        expect(restored.positions.size).toBe(original.positions.size);
    });

    it("positions round-trip for a tree with spouses", () => {
        const { tree } = spouseTree();
        const { original, restored } = roundTrip(tree);
        expect(restored.positions.size).toBe(original.positions.size);
        for (const [id, pos] of original.positions) {
            const rpos = restored.positions.get(id);
            expect(rpos?.x).toBeCloseTo(pos.x);
            expect(rpos?.y).toBeCloseTo(pos.y);
        }
    });

    it("ghosts round-trip for a cross-row couple", () => {
        const { tree } = crossRowCouple();
        const { original, restored } = roundTrip(tree);

        // Sort both arrays by (ghostOf, nearId) for stable comparison
        const sortKey = (g: { ghostOf: string; nearId: string }) => `${g.ghostOf}|${g.nearId}`;
        const origSorted = [...original.ghosts].sort((a, b) =>
            sortKey(a).localeCompare(sortKey(b)),
        );
        const resSorted = [...restored.ghosts].sort((a, b) =>
            sortKey(a).localeCompare(sortKey(b)),
        );

        expect(resSorted.length).toBe(origSorted.length);
        for (let i = 0; i < origSorted.length; i++) {
            expect(resSorted[i]!.ghostOf).toBe(origSorted[i]!.ghostOf);
            expect(resSorted[i]!.nearId).toBe(origSorted[i]!.nearId);
            expect(resSorted[i]!.x).toBeCloseTo(origSorted[i]!.x);
            expect(resSorted[i]!.y).toBeCloseTo(origSorted[i]!.y);
        }
    });

    it("canvas/bbox round-trips", () => {
        const { tree } = lineage();
        const { original, restored } = roundTrip(tree);
        expect(restored.canvas.width).toBeCloseTo(original.canvas.width);
        expect(restored.canvas.height).toBeCloseTo(original.canvas.height);
    });

    it("totalPeople and laidOutPeople round-trip", () => {
        const { tree } = lineage();
        const { original, restored } = roundTrip(tree);
        expect(restored.totalPeople).toBe(original.totalPeople);
        expect(restored.laidOutPeople).toBe(original.laidOutPeople);
    });

    it("isolated nodes are correctly identified after round-trip", () => {
        // Isolated = single-person components. The round-trip derives this
        // from edge absence, matching hvLayout's direct computation.
        let t = createTree("iso", blank("root", "u"));
        const h1 = addPerson(t, blank("h1", "u"));
        t = h1.tree;
        const h2 = addPerson(t, blank("h2", "u"));
        t = h2.tree;

        const { original, restored } = roundTrip(t);
        expect([...restored.isolated].sort()).toEqual([...original.isolated].sort());
    });

    it("visible filter survives round-trip", () => {
        const { tree, ids } = lineage();
        const visible = new Set([ids.root!, ids.kid!]);
        const { restored } = roundTrip(tree, { visible });

        expect(restored.positions.size).toBe(2);
        expect(restored.positions.has(ids.root!)).toBe(true);
        expect(restored.positions.has(ids.kid!)).toBe(true);
        expect(restored.positions.has(ids.grand!)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// IR invariants
// ---------------------------------------------------------------------------

describe("PlacedGraph invariants", () => {
    it("every node id in ranks exists in nodes map", () => {
        const { tree } = lineage();
        const pg = hvLayoutToPlacedGraph(hvLayout(tree), tree);
        for (const rankIds of pg.ranks) {
            for (const id of rankIds) {
                expect(pg.nodes.has(id)).toBe(true);
            }
        }
    });

    it("every node id has x and y entries", () => {
        const { tree } = crossRowCouple();
        const pg = hvLayoutToPlacedGraph(hvLayout(tree), tree);
        for (const nodeId of pg.nodes.keys()) {
            expect(pg.x.has(nodeId)).toBe(true);
            expect(pg.y.has(nodeId)).toBe(true);
        }
    });

    it("every node id has an order entry", () => {
        const { tree } = lineage();
        const pg = hvLayoutToPlacedGraph(hvLayout(tree), tree);
        for (const nodeId of pg.nodes.keys()) {
            expect(pg.order.has(nodeId)).toBe(true);
        }
    });

    it("parent edges reference nodes that exist", () => {
        const { tree } = lineage();
        const pg = hvLayoutToPlacedGraph(hvLayout(tree), tree);
        for (const e of pg.parentEdges) {
            expect(pg.nodes.has(e.parent)).toBe(true);
            expect(pg.nodes.has(e.child)).toBe(true);
        }
    });

    it("spouse edges reference nodes that exist", () => {
        const { tree } = spouseTree();
        const pg = hvLayoutToPlacedGraph(hvLayout(tree), tree);
        for (const e of pg.spouseEdges) {
            expect(pg.nodes.has(e.a)).toBe(true);
            expect(pg.nodes.has(e.b)).toBe(true);
        }
    });
});
