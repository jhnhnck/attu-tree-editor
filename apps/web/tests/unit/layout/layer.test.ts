/*
 * FamilyTreeEditor - tests for layout/passes/layer.ts
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { ghostNodeId } from "$lib/layout/ir";
import { layer } from "$lib/layout/passes/layer";
import type { Person, Tree } from "$lib/domain/types";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

/** root (f) → kid → grand: three-generation lineage */
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

/** root (m) married to spouse (f) — same generation */
function spouseTree(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("sp", blank("root", "m"));
    const sp = addPerson(t, blank("spouse", "f"));
    t = sp.tree;
    const r = linkSpouse(t, ROOT_ID, sp.id);
    if (!r.ok) throw new Error(r.error);
    return { tree: r.value, ids: { root: ROOT_ID, spouse: sp.id } };
}

/**
 * root (f) → a_kid → a_grand (f) + b (m, unrelated) → child
 * a_grand and b are on different ranks (cross-rank couple).
 */
function crossRankCouple(): { tree: Tree; ids: Record<string, string> } {
    // root → a_kid → a_grand (a_grand at rank 2)
    // b_parent → b (b at rank 1) — gives b a real parent so the
    // Phase-2b.1 couple-equalisation post-pass doesn't collapse the
    // a_grand × b cross-rank to same-rank. The post-pass only pulls
    // UNPARENTED partners; parented-partner gaps stay genuine and the
    // ghost mechanism still fires.
    // a_grand + b → child (child at rank max(2,1)+1 = 3)
    let t = createTree("cross", blank("root", "f"));
    const a_kid = addPerson(t, blank("a_kid", "u"));
    t = a_kid.tree;
    const a_grand = addPerson(t, blank("a_grand", "f"));
    t = a_grand.tree;
    const b_parent = addPerson(t, blank("b_parent", "m"));
    t = b_parent.tree;
    const b = addPerson(t, blank("b", "m"));
    t = b.tree;
    const child = addPerson(t, blank("child", "u"));
    t = child.tree;
    const r1 = linkParent(t, a_kid.id, ROOT_ID);
    if (!r1.ok) throw new Error(r1.error);
    const r2 = linkParent(r1.value, a_grand.id, a_kid.id);
    if (!r2.ok) throw new Error(r2.error);
    const rB = linkParent(r2.value, b.id, b_parent.id);
    if (!rB.ok) throw new Error(rB.error);
    const r3 = linkSpouse(rB.value, a_grand.id, b.id);
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
            b_parent: b_parent.id,
            b: b.id,
            child: child.id,
        },
    };
}

/**
 * root (m) + spouse (f) → child1, child2, child3
 * A single couple with three children (sibling block test).
 */
function siblingBlock(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("sib", blank("root", "m"));
    const sp = addPerson(t, blank("spouse", "f"));
    t = sp.tree;
    const c1 = addPerson(t, blank("c1", "u"));
    t = c1.tree;
    const c2 = addPerson(t, blank("c2", "u"));
    t = c2.tree;
    const c3 = addPerson(t, blank("c3", "u"));
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
    return {
        tree: r7.value,
        ids: { root: ROOT_ID, spouse: sp.id, c1: c1.id, c2: c2.id, c3: c3.id },
    };
}

/** Two completely isolated people (no edges). */
function isolated(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("iso", blank("root", "u"));
    const solo = addPerson(t, blank("solo", "u"));
    t = solo.tree;
    return { tree: t, ids: { root: ROOT_ID, solo: solo.id } };
}

function visAll(tree: Tree): ReadonlySet<string> {
    return new Set(Object.keys(tree.people));
}

// ---------------------------------------------------------------------------
// Rank assignment
// ---------------------------------------------------------------------------

describe("layer — rank assignment", () => {
    it("assigns rank 0 to nodes with no visible parents", () => {
        const { tree, ids } = lineage();
        const g = layer(tree, visAll(tree), ids.root!);
        expect(g.nodes.get(ids.root!)!.rank).toBe(0);
    });

    it("assigns rank 1 to child of rank-0 node", () => {
        const { tree, ids } = lineage();
        const g = layer(tree, visAll(tree), ids.root!);
        expect(g.nodes.get(ids.kid!)!.rank).toBe(1);
    });

    it("assigns rank 2 to grandchild", () => {
        const { tree, ids } = lineage();
        const g = layer(tree, visAll(tree), ids.root!);
        expect(g.nodes.get(ids.grand!)!.rank).toBe(2);
    });

    it("same-rank spouses both land at rank 0 when they have no parents", () => {
        const { tree, ids } = spouseTree();
        const g = layer(tree, visAll(tree), ids.root!);
        expect(g.nodes.get(ids.root!)!.rank).toBe(0);
        expect(g.nodes.get(ids.spouse!)!.rank).toBe(0);
    });

    it("child of two parents takes max(parent ranks) + 1", () => {
        // In crossRankCouple post-Phase-2b.1: a_grand is rank 2, b is
        // rank 1 (b has b_parent at rank 0), child is max(2,1)+1 = 3.
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        expect(g.nodes.get(ids.a_grand!)!.rank).toBe(2);
        expect(g.nodes.get(ids.b!)!.rank).toBe(1);
        expect(g.nodes.get(ids.child!)!.rank).toBe(3);
    });

    it("isolated nodes land at rank 0", () => {
        const { tree, ids } = isolated();
        const g = layer(tree, visAll(tree), ids.root!);
        expect(g.nodes.get(ids.root!)!.rank).toBe(0);
        expect(g.nodes.get(ids.solo!)!.rank).toBe(0);
    });

    it("hides people absent from visible set", () => {
        const { tree, ids } = lineage();
        const vis = new Set([ids.root!, ids.kid!]);
        const g = layer(tree, vis, ids.root!);
        expect(g.nodes.has(ids.grand!)).toBe(false);
        expect(g.nodes.size).toBe(2);
    });

    it("visible filter re-ranks: kid becomes root at 0 when root hidden", () => {
        const { tree, ids } = lineage();
        // Hide the actual root → kid loses its parent → kid at rank 0
        const vis = new Set([ids.kid!, ids.grand!]);
        const g = layer(tree, vis, ids.kid!);
        expect(g.nodes.get(ids.kid!)!.rank).toBe(0);
        expect(g.nodes.get(ids.grand!)!.rank).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Ghost insertion
// ---------------------------------------------------------------------------

describe("layer — ghost insertion", () => {
    it("inserts no ghost for same-rank couple", () => {
        const { tree } = spouseTree();
        const g = layer(tree, visAll(tree), ROOT_ID);
        const ghostCount = [...g.nodes.values()].filter((n) => n.kind === "ghost").length;
        expect(ghostCount).toBe(0);
    });

    it("inserts a ghost for a cross-rank couple", () => {
        const { tree } = crossRankCouple();
        const g = layer(tree, visAll(tree), ROOT_ID);
        const ghosts = [...g.nodes.values()].filter((n) => n.kind === "ghost");
        expect(ghosts.length).toBe(1);
    });

    it("ghost is a first-class LayoutNode with kind='ghost'", () => {
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        const ghost = [...g.nodes.values()].find((n) => n.kind === "ghost");
        expect(ghost).toBeDefined();
        expect(ghost!.kind).toBe("ghost");
    });

    it("ghost node id matches ghostNodeId(ghostPersonId, nearId)", () => {
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        // a_grand (rank 2) is primary (one above child at rank 3); b (rank 0) becomes ghost near a_grand
        const expectedId = ghostNodeId(ids.b!, ids.a_grand!);
        expect(g.nodes.has(expectedId)).toBe(true);
    });

    it("ghost has personId of the duplicated person, not the near person", () => {
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        const expectedId = ghostNodeId(ids.b!, ids.a_grand!);
        const ghost = g.nodes.get(expectedId)!;
        expect(ghost.personId).toBe(ids.b!);
    });

    it("ghost has the same rank as its near person (primary partner)", () => {
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        const expectedId = ghostNodeId(ids.b!, ids.a_grand!);
        const ghost = g.nodes.get(expectedId)!;
        const nearRank = g.nodes.get(ids.a_grand!)!.rank;
        expect(ghost.rank).toBe(nearRank);
    });

    it("ghost appears in the ranks array at its rank", () => {
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        const expectedId = ghostNodeId(ids.b!, ids.a_grand!);
        const ghost = g.nodes.get(expectedId)!;
        const rankIds = g.ranks[ghost.rank];
        expect(rankIds).toBeDefined();
        expect(rankIds!.includes(expectedId)).toBe(true);
    });

    it("real person still exists alongside their ghost", () => {
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        // b (rank 0) still has a real node
        expect(g.nodes.has(ids.b!)).toBe(true);
        expect(g.nodes.get(ids.b!)!.kind).toBe("person");
    });

    it("no ghost inserted when cross-rank partner is hidden", () => {
        const { tree, ids } = crossRankCouple();
        // Hide b — no visible partner to form a cross-rank couple with a_grand
        const vis = new Set([ids.root!, ids.a_kid!, ids.a_grand!, ids.child!]);
        const g = layer(tree, vis, ids.root!);
        const ghosts = [...g.nodes.values()].filter((n) => n.kind === "ghost");
        expect(ghosts.length).toBe(0);
    });

    it("childless cross-rank couple: ghost placed at lower-rank (older) partner's rank", () => {
        // Both partners must be parented so the Phase-2b.1 couple-
        // equalisation post-pass leaves the rank gap intact.
        //   aParent (rank 0) → a = ROOT_ID (rank 1)
        //   bGrand (rank 0) → bP (rank 1) → bChild (rank 2)
        //   a + bChild: no children, cross-rank (1 vs 2)
        let t2 = createTree("childless", blank("a", "m"));
        const aParent = addPerson(t2, blank("aParent", "u"));
        t2 = aParent.tree;
        const bGrand = addPerson(t2, blank("bGrand", "u"));
        t2 = bGrand.tree;
        const bP = addPerson(t2, blank("bParent2", "f"));
        t2 = bP.tree;
        const bChild = addPerson(t2, blank("bChild", "f"));
        t2 = bChild.tree;
        const rcA = linkParent(t2, ROOT_ID, aParent.id);
        if (!rcA.ok) throw new Error(rcA.error);
        const rcBP = linkParent(rcA.value, bP.id, bGrand.id);
        if (!rcBP.ok) throw new Error(rcBP.error);
        const rc1 = linkParent(rcBP.value, bChild.id, bP.id);
        if (!rc1.ok) throw new Error(rc1.error);
        const rc2 = linkSpouse(rc1.value, ROOT_ID, bChild.id);
        if (!rc2.ok) throw new Error(rc2.error);

        const g = layer(rc2.value, new Set(Object.keys(rc2.value.people)), ROOT_ID);
        // ROOT_ID rank 1, bChild rank 2 — cross-rank, no children.
        // Falls back to: lower rank (ROOT_ID at 1) is primary;
        // ghost of bChild (rank 2) near ROOT_ID at rank 1.
        const ghostId = ghostNodeId(bChild.id, ROOT_ID);
        expect(g.nodes.has(ghostId)).toBe(true);
        expect(g.nodes.get(ghostId)!.rank).toBe(1); // at ROOT_ID's rank
    });
});

// ---------------------------------------------------------------------------
// Constraint keys: spouseGroup and siblingBlockId
// ---------------------------------------------------------------------------

describe("layer — spouseGroup", () => {
    it("same-rank couple: both partners share the same spouseGroup", () => {
        const { tree, ids } = spouseTree();
        const g = layer(tree, visAll(tree), ids.root!);
        const sgRoot = g.nodes.get(ids.root!)!.spouseGroup;
        const sgSpouse = g.nodes.get(ids.spouse!)!.spouseGroup;
        expect(sgRoot).toBeDefined();
        expect(sgRoot).toBe(sgSpouse);
    });

    it("cross-rank couple: near person and ghost share the same spouseGroup", () => {
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        const ghostId = ghostNodeId(ids.b!, ids.a_grand!);
        const sgNear = g.nodes.get(ids.a_grand!)!.spouseGroup;
        const sgGhost = g.nodes.get(ghostId)!.spouseGroup;
        expect(sgNear).toBeDefined();
        expect(sgNear).toBe(sgGhost);
    });

    it("person with no spouse has no spouseGroup", () => {
        const { tree, ids } = lineage();
        const g = layer(tree, visAll(tree), ids.root!);
        // lineage has no couple records
        for (const id of [ids.root!, ids.kid!, ids.grand!]) {
            expect(g.nodes.get(id)!.spouseGroup).toBeUndefined();
        }
    });
});

describe("layer — siblingBlockId", () => {
    it("children of the same couple share the same siblingBlockId", () => {
        const { tree, ids } = siblingBlock();
        const g = layer(tree, visAll(tree), ids.root!);
        const sb1 = g.nodes.get(ids.c1!)!.siblingBlockId;
        const sb2 = g.nodes.get(ids.c2!)!.siblingBlockId;
        const sb3 = g.nodes.get(ids.c3!)!.siblingBlockId;
        expect(sb1).toBeDefined();
        expect(sb1).toBe(sb2);
        expect(sb1).toBe(sb3);
    });

    it("parents themselves have no siblingBlockId (they have no shared visible parent couple)", () => {
        const { tree, ids } = siblingBlock();
        const g = layer(tree, visAll(tree), ids.root!);
        expect(g.nodes.get(ids.root!)!.siblingBlockId).toBeUndefined();
        expect(g.nodes.get(ids.spouse!)!.siblingBlockId).toBeUndefined();
    });

    it("person with single known parent has no siblingBlockId", () => {
        const { tree, ids } = lineage();
        // kid has motherId=root but no father; no couple record with joint children
        const g = layer(tree, visAll(tree), ids.root!);
        expect(g.nodes.get(ids.kid!)!.siblingBlockId).toBeUndefined();
    });

    it("ghost nodes have no siblingBlockId", () => {
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        const ghost = [...g.nodes.values()].find((n) => n.kind === "ghost");
        expect(ghost).toBeDefined();
        expect(ghost!.siblingBlockId).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Rank arrays
// ---------------------------------------------------------------------------

describe("layer — ranks arrays", () => {
    it("every node appears in exactly one rank", () => {
        const { tree } = crossRankCouple();
        const g = layer(tree, visAll(tree), ROOT_ID);
        const seen = new Set<string>();
        for (const rankIds of g.ranks) {
            for (const id of rankIds) {
                expect(seen.has(id)).toBe(false);
                seen.add(id);
            }
        }
        expect(seen.size).toBe(g.nodes.size);
    });

    it("node's rank matches its position in ranks array", () => {
        const { tree } = lineage();
        const g = layer(tree, visAll(tree), ROOT_ID);
        for (const [nodeId, node] of g.nodes) {
            const rankIds = g.ranks[node.rank];
            expect(rankIds).toBeDefined();
            expect(rankIds!.includes(nodeId)).toBe(true);
        }
    });

    it("ranks array has no holes (consecutive indices)", () => {
        const { tree } = lineage();
        const g = layer(tree, visAll(tree), ROOT_ID);
        for (let r = 0; r < g.ranks.length; r++) {
            expect(Array.isArray(g.ranks[r])).toBe(true);
        }
    });

    it("empty visible set produces empty graph", () => {
        const { tree } = lineage();
        const g = layer(tree, new Set(), ROOT_ID);
        expect(g.nodes.size).toBe(0);
        expect(g.ranks.length).toBe(0);
        expect(g.parentEdges.length).toBe(0);
        expect(g.spouseEdges.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

describe("layer — parentEdges", () => {
    it("records a parentEdge for each visible parent-child link", () => {
        const { tree, ids } = lineage();
        const g = layer(tree, visAll(tree), ids.root!);
        const hasEdge = (p: string, c: string) =>
            g.parentEdges.some((e) => e.parent === p && e.child === c);
        expect(hasEdge(ids.root!, ids.kid!)).toBe(true);
        expect(hasEdge(ids.kid!, ids.grand!)).toBe(true);
    });

    it("records two parentEdges for a child with both visible parents", () => {
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        const childEdges = g.parentEdges.filter((e) => e.child === ids.child!);
        expect(childEdges.length).toBe(2);
        const parents = childEdges.map((e) => e.parent).sort();
        expect(parents).toContain(ids.a_grand!);
        expect(parents).toContain(ids.b!);
    });

    it("omits parentEdge when parent is hidden", () => {
        const { tree, ids } = lineage();
        const vis = new Set([ids.kid!, ids.grand!]);
        const g = layer(tree, vis, ids.kid!);
        // root is hidden, so kid→root edge should not appear
        expect(g.parentEdges.some((e) => e.parent === ids.root!)).toBe(false);
    });
});

describe("layer — spouseEdges", () => {
    it("records a spouseEdge for a visible couple", () => {
        const { tree, ids } = spouseTree();
        const g = layer(tree, visAll(tree), ids.root!);
        const hasSpouse = (a: string, b: string) =>
            g.spouseEdges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
        expect(hasSpouse(ids.root!, ids.spouse!)).toBe(true);
    });

    it("omits spouseEdge when one partner is hidden", () => {
        const { tree, ids } = spouseTree();
        const vis = new Set([ids.root!]);
        const g = layer(tree, vis, ids.root!);
        expect(g.spouseEdges.length).toBe(0);
    });

    it("each couple appears exactly once in spouseEdges", () => {
        const { tree } = siblingBlock();
        const g = layer(tree, visAll(tree), ROOT_ID);
        expect(g.spouseEdges.length).toBe(1);
    });

    it("cross-rank couple still appears in spouseEdges (with real ids, not ghost ids)", () => {
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        const edge = g.spouseEdges.find(
            (e) =>
                (e.a === ids.a_grand! && e.b === ids.b!) ||
                (e.a === ids.b! && e.b === ids.a_grand!),
        );
        expect(edge).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Cycle detection — Kahn's BFS leaves nodes in a cycle unranked. They used
// to be silently bucketed at rank 0 with no diagnostic. The pass now warns
// AND surfaces cycle members on the LayeredGraph for window.__treeDebug.
// ---------------------------------------------------------------------------

describe("layer — cycle detection", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });
    afterEach(() => {
        warnSpy.mockRestore();
    });

    /**
     * Build a self-ancestor cycle: a person who is their own grandparent.
     * a → b → c → a (illegal in a real genealogy but FamilyTreeEditor allows
     * it for science-fiction / mythological trees, with validate.ts flagging
     * the loop). Kahn's BFS cannot rank any of these.
     */
    function selfAncestorCycle(): Tree {
        let t = createTree("cycle", blank("a", "u")); // ROOT_ID is "a"
        const b = addPerson(t, blank("b", "u"));
        t = b.tree;
        const c = addPerson(t, blank("c", "u"));
        t = c.tree;
        // a → b (a is b's parent)
        const r1 = linkParent(t, b.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        // b → c (b is c's parent)
        const r2 = linkParent(r1.value, c.id, b.id);
        if (!r2.ok) throw new Error(r2.error);
        // c → a (c is a's parent — closes the cycle)
        const r3 = linkParent(r2.value, ROOT_ID, c.id);
        if (!r3.ok) throw new Error(r3.error);
        return r3.value;
    }

    it("emits a console.warn when the parent DAG has a cycle", () => {
        const tree = selfAncestorCycle();
        layer(tree, visAll(tree), ROOT_ID);
        expect(warnSpy).toHaveBeenCalled();
        const firstArg = warnSpy.mock.calls[0]?.[0];
        expect(typeof firstArg).toBe("string");
        expect(firstArg as string).toContain("cycle");
    });

    it("surfaces cycle member ids on LayeredGraph.cycleNodes", () => {
        const tree = selfAncestorCycle();
        const g = layer(tree, visAll(tree), ROOT_ID);
        const cycleNodes = g.cycleNodes;
        expect(cycleNodes).toBeDefined();
        // All three nodes are unrankable in a 3-cycle.
        expect(cycleNodes?.length).toBe(3);
        const ids = new Set(cycleNodes ?? []);
        expect(ids.has(ROOT_ID)).toBe(true);
    });

    it("acyclic tree leaves cycleNodes absent or empty", () => {
        const { tree } = lineage();
        const g = layer(tree, visAll(tree), ROOT_ID);
        const cycleNodes = g.cycleNodes ?? [];
        expect(cycleNodes.length).toBe(0);
        expect(warnSpy).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe("layer — LayeredGraph invariants", () => {
    it("every id in ranks exists in nodes map", () => {
        const { tree } = crossRankCouple();
        const g = layer(tree, visAll(tree), ROOT_ID);
        for (const rankIds of g.ranks) {
            for (const id of rankIds) {
                expect(g.nodes.has(id)).toBe(true);
            }
        }
    });

    it("every node in nodes map appears in exactly one rank", () => {
        const { tree } = crossRankCouple();
        const g = layer(tree, visAll(tree), ROOT_ID);
        const rankOccurrences = new Map<string, number>();
        for (const rankIds of g.ranks) {
            for (const id of rankIds) {
                rankOccurrences.set(id, (rankOccurrences.get(id) ?? 0) + 1);
            }
        }
        for (const nodeId of g.nodes.keys()) {
            expect(rankOccurrences.get(nodeId)).toBe(1);
        }
    });

    it("all parentEdge ids reference nodes that exist", () => {
        const { tree } = crossRankCouple();
        const g = layer(tree, visAll(tree), ROOT_ID);
        for (const e of g.parentEdges) {
            expect(g.nodes.has(e.parent)).toBe(true);
            expect(g.nodes.has(e.child)).toBe(true);
        }
    });

    it("all spouseEdge ids reference nodes that exist", () => {
        const { tree } = spouseTree();
        const g = layer(tree, visAll(tree), ROOT_ID);
        for (const e of g.spouseEdges) {
            expect(g.nodes.has(e.a)).toBe(true);
            expect(g.nodes.has(e.b)).toBe(true);
        }
    });

    it("parent rank is always less than child rank (parent is older)", () => {
        const { tree } = crossRankCouple();
        const g = layer(tree, visAll(tree), ROOT_ID);
        for (const e of g.parentEdges) {
            const parentRank = g.nodes.get(e.parent)!.rank;
            const childRank = g.nodes.get(e.child)!.rank;
            expect(parentRank).toBeLessThan(childRank);
        }
    });

    it("ghost node personId is the id of the duplicated real person", () => {
        const { tree, ids } = crossRankCouple();
        const g = layer(tree, visAll(tree), ids.root!);
        for (const [nodeId, node] of g.nodes) {
            if (node.kind !== "ghost") continue;
            // The ghost personId should match a real person in the tree
            expect(tree.people[node.personId]).toBeDefined();
            // The real person should also have a node
            expect(g.nodes.has(node.personId)).toBe(true);
            expect(g.nodes.get(node.personId)!.kind).toBe("person");
            // The ghost id should not equal the real person's id
            expect(nodeId).not.toBe(node.personId);
        }
    });
});

// ---------------------------------------------------------------------------
// Couple-equalisation regression (Phase 2b.1 of relationship-vocabulary plan)
// ---------------------------------------------------------------------------

/**
 * Repro from `notes/bugs.md`:
 *
 *   "spurious ghost on the top rank after 'add parent' when the added-to
 *    person's spouse has no parents — `passes/layer.ts` `computeRanks` is
 *    a longest-path BFS over the parent-child DAG only; spouse edges are
 *    ignored."
 *
 * Construct the 6-person tree (Korak + Wife + 3 children), then "add
 * parent" to Korak. Korak gains a parent and moves to rank 1; Wife has no
 * parents and (before this fix) stayed at rank 0. The cross-rank ghost
 * logic then inserted a phantom ghost of Wife on the top row.
 *
 * The couple-equalisation post-pass pulls Wife to rank 1 so they match
 * again. No cross-rank ghost should be inserted, and no parent-drop
 * should have negative height (parent above child).
 */
function korakWifeChildrenThenAddParent(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("korak repro", blank("Korak", "m"));
    const korakId = ROOT_ID;

    const wife = addPerson(t, blank("Wife", "f"));
    t = wife.tree;
    const childa = addPerson(t, blank("Childa", "u"));
    t = childa.tree;
    const childb = addPerson(t, blank("Childb", "u"));
    t = childb.tree;
    const childc = addPerson(t, blank("Childc", "u"));
    t = childc.tree;

    // Korak + Wife are a couple
    const sp = linkSpouse(t, korakId, wife.id);
    if (!sp.ok) throw new Error(sp.error);
    t = sp.value;

    // Korak + Wife are parents of three children
    for (const childId of [childa.id, childb.id, childc.id]) {
        const r1 = linkParent(t, childId, korakId);
        if (!r1.ok) throw new Error(r1.error);
        t = r1.value;
        const r2 = linkParent(t, childId, wife.id);
        if (!r2.ok) throw new Error(r2.error);
        t = r2.value;
    }

    // Now "add parent" to Korak — a New Person who is Korak's father.
    const newParent = addPerson(t, blank("New Person", "m"));
    t = newParent.tree;
    const linked = linkParent(t, korakId, newParent.id);
    if (!linked.ok) throw new Error(linked.error);
    t = linked.value;

    return {
        tree: t,
        ids: {
            korak: korakId,
            wife: wife.id,
            childa: childa.id,
            childb: childb.id,
            childc: childc.id,
            newParent: newParent.id,
        },
    };
}

describe("couple-equalisation post-pass (Phase 2b.1)", () => {
    it("pulls a no-parent spouse down to match the parented partner's rank", () => {
        const { tree, ids } = korakWifeChildrenThenAddParent();
        const g = layer(tree, visAll(tree), ids.korak!);
        const korakRank = g.nodes.get(ids.korak!)?.rank;
        const wifeRank = g.nodes.get(ids.wife!)?.rank;
        expect(korakRank).toBeDefined();
        expect(wifeRank).toBeDefined();
        // After the post-pass, Korak and Wife share a rank again.
        expect(wifeRank).toBe(korakRank);
        // Specifically: Korak got pushed to rank 1 by his parent, so Wife
        // should be at rank 1 too.
        expect(korakRank).toBe(1);
    });

    it("inserts no ghost of Wife on the top rank after add-parent", () => {
        const { tree, ids } = korakWifeChildrenThenAddParent();
        const g = layer(tree, visAll(tree), ids.korak!);
        // Find every ghost node and confirm none reference Wife.
        const wifeGhosts: string[] = [];
        for (const [nodeId, node] of g.nodes) {
            if (node.kind === "ghost" && node.personId === ids.wife) wifeGhosts.push(nodeId);
        }
        expect(wifeGhosts).toEqual([]);
    });

    it("never raises a parented partner (rank gap is the more-parented partner's)", () => {
        const { tree, ids } = korakWifeChildrenThenAddParent();
        const g = layer(tree, visAll(tree), ids.korak!);
        const newParentRank = g.nodes.get(ids.newParent!)?.rank;
        const korakRank = g.nodes.get(ids.korak!)?.rank;
        // newParent is at rank 0; Korak at rank 1. The post-pass should
        // NEVER pull Korak back to rank 0 — that would break the parent-
        // drop from New Person → Korak.
        expect(newParentRank).toBe(0);
        expect(korakRank).toBe(1);
    });

    it("emits no negative-height parent drops (parent above child)", () => {
        const { tree, ids } = korakWifeChildrenThenAddParent();
        const g = layer(tree, visAll(tree), ids.korak!);
        for (const e of g.parentEdges) {
            const parentRank = g.nodes.get(e.parent)?.rank;
            const childRank = g.nodes.get(e.child)?.rank;
            expect(parentRank).toBeDefined();
            expect(childRank).toBeDefined();
            // Drop height = childRank - parentRank should be > 0.
            expect((childRank ?? 0) - (parentRank ?? 0)).toBeGreaterThan(0);
        }
    });
});
