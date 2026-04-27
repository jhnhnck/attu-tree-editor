/*
 * FamilyTreeEditor - tests for layout/graph.ts (adjacency, relativesOf, shortestPath)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { buildAdjacency, connectedComponents, relativesOf, shortestPath } from "$lib/layout/graph";
import type { Person, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return {
        given: name,
        surname: "",
        gender,
        spouseIds: [],
        display: "z1",
    };
}

/**
 * Three-generation fixture used across most tests:
 *
 *      ROOT(m)  ─bond─  Mate(f)
 *          \      /
 *           Kid(u)  ─bond─  Spouse(f)
 *               \      /
 *               Grand(u)
 *
 * Plus an orphan (Stranger) in a separate component.
 */
function fixture(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("test", blank("root", "m"));
    const mate = addPerson(t, blank("mate", "f"));
    t = mate.tree;
    const kid = addPerson(t, blank("kid", "u"));
    t = kid.tree;
    const spouse = addPerson(t, blank("spouse", "f"));
    t = spouse.tree;
    const grand = addPerson(t, blank("grand", "u"));
    t = grand.tree;
    const stranger = addPerson(t, blank("stranger", "m"));
    t = stranger.tree;

    const r1 = linkSpouse(t, ROOT_ID, mate.id);
    if (!r1.ok) throw new Error(r1.error);
    t = r1.value;

    const r2 = linkParent(t, kid.id, ROOT_ID);
    if (!r2.ok) throw new Error(r2.error);
    t = r2.value;
    const r3 = linkParent(t, kid.id, mate.id);
    if (!r3.ok) throw new Error(r3.error);
    t = r3.value;

    const r4 = linkSpouse(t, kid.id, spouse.id);
    if (!r4.ok) throw new Error(r4.error);
    t = r4.value;

    const r5 = linkParent(t, grand.id, kid.id);
    if (!r5.ok) throw new Error(r5.error);
    t = r5.value;
    const r6 = linkParent(t, grand.id, spouse.id);
    if (!r6.ok) throw new Error(r6.error);
    t = r6.value;

    return {
        tree: t,
        ids: {
            root: ROOT_ID,
            mate: mate.id,
            kid: kid.id,
            spouse: spouse.id,
            grand: grand.id,
            stranger: stranger.id,
        },
    };
}

describe("buildAdjacency", () => {
    it("includes every known person, even ones with no edges", () => {
        const { tree, ids } = fixture();
        const a = buildAdjacency(tree);
        expect(a.parentsOf.has(ids.stranger!)).toBe(true);
        expect(a.parentsOf.get(ids.stranger!)).toEqual([]);
        expect(a.childrenOf.get(ids.stranger!)).toEqual([]);
        expect(a.spousesOf.get(ids.stranger!)).toEqual([]);
    });

    it("populates parents + children + spouses correctly", () => {
        const { tree, ids } = fixture();
        const a = buildAdjacency(tree);
        expect([...(a.parentsOf.get(ids.kid!) ?? [])].sort()).toEqual([ids.mate, ids.root].sort());
        expect(a.childrenOf.get(ids.root!) ?? []).toEqual([ids.kid]);
        expect(a.childrenOf.get(ids.mate!) ?? []).toEqual([ids.kid]);
        expect(a.spousesOf.get(ids.root!) ?? []).toEqual([ids.mate]);
        expect(a.spousesOf.get(ids.mate!) ?? []).toEqual([ids.root]);
    });

    it("drops references to nonexistent ids", () => {
        const t0 = createTree("orphan", blank("root", "m"));
        const t: Tree = {
            ...t0,
            people: {
                ...t0.people,
                AAAAA: { ...blank("orphan", "u"), id: "AAAAA", motherId: "ZZZZZ" },
            },
        };
        const a = buildAdjacency(t);
        expect(a.parentsOf.get("AAAAA")).toEqual([]);
    });

    it("filters self-spouse references", () => {
        const t0 = createTree("self", blank("root", "u"));
        const linked = linkSpouse(t0, ROOT_ID, ROOT_ID);
        if (!linked.ok) throw new Error(linked.error);
        const a = buildAdjacency(linked.value);
        expect(a.spousesOf.get(ROOT_ID)).toEqual([]);
    });
});

describe("connectedComponents", () => {
    it("isolates the stranger from the main family", () => {
        const { tree, ids } = fixture();
        const comps = connectedComponents(tree);
        expect(comps.length).toBe(2);
        const main = comps.find((c) => c.includes(ids.root!));
        const lonely = comps.find((c) => c.includes(ids.stranger!));
        expect(main?.length).toBe(5);
        expect(lonely?.length).toBe(1);
    });
});

describe("relativesOf", () => {
    it("default rule = ancestors + descendants + spouses + siblings", () => {
        const { tree, ids } = fixture();
        // grand's relatives: parents (kid, spouse), grandparents (root, mate),
        // self. siblings: none. nibblings off by default.
        const set = relativesOf(tree, ids.grand!);
        expect(set.has(ids.grand!)).toBe(true);
        expect(set.has(ids.kid!)).toBe(true);
        expect(set.has(ids.spouse!)).toBe(true);
        expect(set.has(ids.root!)).toBe(true);
        expect(set.has(ids.mate!)).toBe(true);
        expect(set.has(ids.stranger!)).toBe(false);
    });

    it("ancestor walk respects maxAncestorGen", () => {
        const { tree, ids } = fixture();
        const set = relativesOf(tree, ids.grand!, {
            maxAncestorGen: 1,
            includeSpouses: false,
            includeSiblings: false,
            includeDescendants: false,
        });
        expect(set.has(ids.grand!)).toBe(true);
        expect(set.has(ids.kid!)).toBe(true);
        expect(set.has(ids.spouse!)).toBe(true);
        expect(set.has(ids.root!)).toBe(false); // 2 generations up
        expect(set.has(ids.mate!)).toBe(false);
    });

    it("siblings option pulls in shared-parent peers", () => {
        let t = createTree("sib", blank("mom", "f"));
        const a = addPerson(t, blank("alpha", "u"));
        t = a.tree;
        const b = addPerson(t, blank("beta", "u"));
        t = b.tree;
        const r1 = linkParent(t, a.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, b.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);

        const set = relativesOf(r2.value, a.id, {
            includeAncestors: false,
            includeDescendants: false,
            includeSpouses: false,
        });
        expect(set.has(b.id)).toBe(true);
    });

    it("returns empty set for unknown focus id", () => {
        const { tree } = fixture();
        const set = relativesOf(tree, "ZZZZZ");
        expect(set.size).toBe(0);
    });
});

describe("shortestPath", () => {
    it("returns a zero-length path for the same person", () => {
        const { tree, ids } = fixture();
        const p = shortestPath(tree, ids.root!, ids.root!);
        expect(p?.steps.length).toBe(0);
        expect(p?.ids).toEqual([ids.root]);
    });

    it("walks parent → child for grandparent → grandchild", () => {
        const { tree, ids } = fixture();
        const p = shortestPath(tree, ids.root!, ids.grand!);
        expect(p?.steps.map((s) => s.via)).toEqual(["child", "child"]);
        expect(p?.ids[0]).toBe(ids.root);
        expect(p?.ids[p.ids.length - 1]).toBe(ids.grand);
    });

    it("walks child → parent for grandchild → grandparent", () => {
        const { tree, ids } = fixture();
        const p = shortestPath(tree, ids.grand!, ids.root!);
        expect(p?.steps.map((s) => s.via)).toEqual(["parent", "parent"]);
    });

    it("uses the spouse edge when shorter", () => {
        const { tree, ids } = fixture();
        // root → mate via 1 spouse step (vs going down via kid + back up = 4 hops)
        const p = shortestPath(tree, ids.root!, ids.mate!);
        expect(p?.steps.length).toBe(1);
        expect(p?.steps[0]?.via).toBe("spouse");
    });

    it("returns undefined when the two are in different components", () => {
        const { tree, ids } = fixture();
        const p = shortestPath(tree, ids.root!, ids.stranger!);
        expect(p).toBeUndefined();
    });

    it("returns undefined for unknown ids", () => {
        const { tree, ids } = fixture();
        expect(shortestPath(tree, "ZZZZZ", ids.root!)).toBeUndefined();
        expect(shortestPath(tree, ids.root!, "ZZZZZ")).toBeUndefined();
    });

    it("finds a sibling via parent → child (length 2)", () => {
        let t = createTree("sib", blank("mom", "f"));
        const a = addPerson(t, blank("alpha", "u"));
        t = a.tree;
        const b = addPerson(t, blank("beta", "u"));
        t = b.tree;
        const r1 = linkParent(t, a.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, b.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);

        const p = shortestPath(r2.value, a.id, b.id);
        expect(p?.steps.map((s) => s.via)).toEqual(["parent", "child"]);
    });
});
