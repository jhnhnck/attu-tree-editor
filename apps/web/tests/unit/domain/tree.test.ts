/*
 * FamilyTreeEditor - tree operations: add, link, remove, traverse
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import {
    addPerson,
    ancestorsOf,
    createTree,
    descendantsOf,
    getParents,
    linkParent,
    linkSpouse,
    removePerson,
    siblingsOf,
    unlinkParent,
    unlinkSpouse,
    updatePerson,
} from "$lib/domain/tree";
import type { Person, Tree } from "$lib/domain/types";

function bareRoot(): Omit<Person, "id"> {
    return {
        given: "Root",
        surname: "Person",
        gender: "u",
        spouseIds: [],
        display: "z1",
    };
}

function bareChild(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return {
        given: name,
        surname: "",
        gender,
        spouseIds: [],
        display: "z1",
    };
}

function fixtureFamily(): { tree: Tree; ids: Record<string, string> } {
    // 5-person, 2-generation fixture: GP -> P -> { A, B } and P has spouse SP
    let t = createTree("fixture", { ...bareRoot(), given: "GP", gender: "f" });
    const gp = ROOT_ID;

    const addParent = addPerson(t, bareChild("P", "m"));
    t = addParent.tree;
    const p = addParent.id;
    const parented = linkParent(t, p, gp);
    if (!parented.ok) throw new Error(`fixture: ${parented.error}`);
    t = parented.value;

    const addSpouse = addPerson(t, bareChild("SP", "f"));
    t = addSpouse.tree;
    const sp = addSpouse.id;
    const married = linkSpouse(t, p, sp);
    if (!married.ok) throw new Error(`fixture: ${married.error}`);
    t = married.value;

    const addA = addPerson(t, bareChild("A", "f"));
    t = addA.tree;
    const a = addA.id;
    const linkAFather = linkParent(t, a, p);
    if (!linkAFather.ok) throw new Error(`fixture: ${linkAFather.error}`);
    t = linkAFather.value;
    const linkAMother = linkParent(t, a, sp);
    if (!linkAMother.ok) throw new Error(`fixture: ${linkAMother.error}`);
    t = linkAMother.value;

    const addB = addPerson(t, bareChild("B", "m"));
    t = addB.tree;
    const b = addB.id;
    const linkBFather = linkParent(t, b, p);
    if (!linkBFather.ok) throw new Error(`fixture: ${linkBFather.error}`);
    t = linkBFather.value;
    const linkBMother = linkParent(t, b, sp);
    if (!linkBMother.ok) throw new Error(`fixture: ${linkBMother.error}`);
    t = linkBMother.value;

    return { tree: t, ids: { gp, p, sp, a, b } };
}

describe("createTree", () => {
    it("creates a single-person tree rooted at ROOT_ID", () => {
        const t = createTree("test", bareRoot());
        expect(Object.keys(t.people)).toEqual([ROOT_ID]);
        expect(t.rootId).toBe(ROOT_ID);
        expect(t.couples).toEqual([]);
    });
});

describe("addPerson", () => {
    it("returns a new tree with one more person and a fresh id", () => {
        const t = createTree("x", bareRoot());
        const { tree, id } = addPerson(t, bareChild("Kid"));
        expect(Object.keys(tree.people)).toHaveLength(2);
        expect(id).toMatch(/^[A-Z0-9]{5}$/);
        expect(id).not.toBe(ROOT_ID);
        // input tree is untouched
        expect(Object.keys(t.people)).toEqual([ROOT_ID]);
    });
});

describe("updatePerson", () => {
    it("patches without mutating the original tree", () => {
        const t = createTree("x", bareRoot());
        const next = updatePerson(t, ROOT_ID, { given: "Renamed" });
        expect(next.people[ROOT_ID]?.given).toBe("Renamed");
        expect(t.people[ROOT_ID]?.given).toBe("Root");
    });

    it("ignores updates to a missing id", () => {
        const t = createTree("x", bareRoot());
        const next = updatePerson(t, "ZZZZZ", { given: "Ghost" });
        expect(next).toBe(t);
    });
});

describe("removePerson", () => {
    it("clears references on parents, spouses, and anchor links", () => {
        const { tree, ids } = fixtureFamily();
        const stripped = removePerson(tree, ids.p ?? "");
        expect(stripped.people[ids.p ?? ""]).toBeUndefined();
        expect(stripped.people[ids.a ?? ""]?.fatherId).toBeUndefined();
        expect(stripped.people[ids.b ?? ""]?.fatherId).toBeUndefined();
        expect(stripped.people[ids.sp ?? ""]?.spouseIds).toEqual([]);
    });

    it("prunes couple records that referenced the removed person", () => {
        const { tree, ids } = fixtureFamily();
        const stripped = removePerson(tree, ids.p ?? "");
        for (const c of stripped.couples) {
            expect(c.leftId).not.toBe(ids.p);
            expect(c.rightId).not.toBe(ids.p);
        }
    });
});

describe("linkParent", () => {
    it("accepts self-link (asexual self-reproduction in fictional worlds)", () => {
        const t = createTree("x", { ...bareRoot(), gender: "m" });
        const r = linkParent(t, ROOT_ID, ROOT_ID);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.people[ROOT_ID]?.fatherId).toBe(ROOT_ID);
    });

    it("accepts a deep cycle (validate flags it later)", () => {
        // build A child-of B child-of C, then attempt to make C a child of A
        let t = createTree("x", { ...bareRoot(), given: "C", gender: "m" });
        const c = ROOT_ID;
        const addB = addPerson(t, bareChild("B", "m"));
        t = addB.tree;
        const linkB = linkParent(t, addB.id, c);
        if (!linkB.ok) throw new Error(linkB.error);
        t = linkB.value;
        const addA = addPerson(t, bareChild("A", "m"));
        t = addA.tree;
        const linkA = linkParent(t, addA.id, addB.id);
        if (!linkA.ok) throw new Error(linkA.error);
        t = linkA.value;
        const cycle = linkParent(t, c, addA.id);
        expect(cycle.ok).toBe(true);
        if (!cycle.ok) return;
        expect(cycle.value.people[c]?.fatherId).toBe(addA.id);
    });

    it("uses motherId for female parents and fatherId for male/unknown", () => {
        let t = createTree("x", { ...bareRoot(), given: "Kid" });
        const kid = ROOT_ID;
        const addMom = addPerson(t, bareChild("Mom", "f"));
        t = addMom.tree;
        const linked = linkParent(t, kid, addMom.id);
        if (!linked.ok) throw new Error(linked.error);
        expect(linked.value.people[kid]?.motherId).toBe(addMom.id);
        expect(linked.value.people[kid]?.fatherId).toBeUndefined();
    });
});

describe("unlinkParent", () => {
    it("removes the requested role only", () => {
        const { tree, ids } = fixtureFamily();
        const stripped = unlinkParent(tree, ids.a ?? "", "father");
        expect(stripped.people[ids.a ?? ""]?.fatherId).toBeUndefined();
        expect(stripped.people[ids.a ?? ""]?.motherId).toBe(ids.sp);
    });
});

describe("linkSpouse", () => {
    it("accepts self-spouse and records a single-id couple", () => {
        const t = createTree("x", bareRoot());
        const r = linkSpouse(t, ROOT_ID, ROOT_ID);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.people[ROOT_ID]?.spouseIds).toEqual([ROOT_ID]);
        expect(r.value.couples).toEqual([
            { leftId: ROOT_ID, rightId: ROOT_ID, unionIndex: 1, childIds: [] },
        ]);
    });

    it("is idempotent: linking twice does not duplicate spouseIds", () => {
        let t = createTree("x", { ...bareRoot(), given: "A", gender: "m" });
        const a = ROOT_ID;
        const addB = addPerson(t, bareChild("B", "f"));
        t = addB.tree;
        const first = linkSpouse(t, a, addB.id);
        if (!first.ok) throw new Error(first.error);
        const second = linkSpouse(first.value, a, addB.id);
        if (!second.ok) throw new Error(second.error);
        expect(second.value.people[a]?.spouseIds).toEqual([addB.id]);
        expect(second.value.people[addB.id]?.spouseIds).toEqual([a]);
        expect(second.value.couples).toHaveLength(1);
    });
});

describe("unlinkSpouse", () => {
    it("removes the spouse link in both directions and prunes the couple", () => {
        const { tree, ids } = fixtureFamily();
        const stripped = unlinkSpouse(tree, ids.p ?? "", ids.sp ?? "");
        expect(stripped.people[ids.p ?? ""]?.spouseIds).not.toContain(ids.sp);
        expect(stripped.people[ids.sp ?? ""]?.spouseIds).not.toContain(ids.p);
        expect(stripped.couples).toEqual([]);
    });
});

describe("traversal iterators", () => {
    it("ancestorsOf walks toward the root", () => {
        const { tree, ids } = fixtureFamily();
        const ancestors = [...ancestorsOf(tree, ids.a ?? "")].map((p) => p.given).sort();
        expect(ancestors).toEqual(["GP", "P", "SP"]);
    });

    it("descendantsOf walks toward leaves", () => {
        const { tree, ids } = fixtureFamily();
        const descendants = [...descendantsOf(tree, ids.gp ?? "")].map((p) => p.given).sort();
        expect(descendants).toEqual(["A", "B", "P"]);
    });

    it("siblingsOf returns people who share at least one parent", () => {
        const { tree, ids } = fixtureFamily();
        const siblings = [...siblingsOf(tree, ids.a ?? "")].map((p) => p.given);
        expect(siblings).toEqual(["B"]);
    });
});

describe("getParents (Phase 2a relationship-vocabulary helper)", () => {
    it("returns parentIds when populated", () => {
        const { tree, ids } = fixtureFamily();
        // After linkParent, child A should have parentIds populated.
        const a = tree.people[ids.a ?? ""];
        if (!a) throw new Error("fixture missing A");
        const parents = getParents(a);
        expect(parents.length).toBeGreaterThan(0);
        // Every entry has a personId and either role=mother or role=father.
        for (const p of parents) {
            expect(typeof p.personId).toBe("string");
            expect(["mother", "father"]).toContain(p.role);
            expect(p.pedi).toBe("birth");
        }
    });

    it("derives from legacy motherId/fatherId when parentIds is missing", () => {
        // Simulate pre-Phase-2a data: a Person with only the legacy
        // fields set, no parentIds. getParents should still return both.
        const person: Person = {
            id: "test-id",
            given: "Test",
            surname: "Person",
            gender: "u",
            motherId: "mom-id",
            fatherId: "dad-id",
            spouseIds: [],
            display: "z1",
            // parentIds intentionally absent — legacy shape.
        };
        const parents = getParents(person);
        expect(parents).toHaveLength(2);
        expect(parents[0]).toEqual({ personId: "mom-id", role: "mother", pedi: "birth" });
        expect(parents[1]).toEqual({ personId: "dad-id", role: "father", pedi: "birth" });
    });

    it("returns empty array when neither parentIds nor legacy fields are set", () => {
        const person: Person = {
            id: "test-id",
            given: "Lonely",
            surname: "Founder",
            gender: "u",
            spouseIds: [],
            display: "z1",
        };
        expect(getParents(person)).toEqual([]);
    });
});

describe("linkParent / unlinkParent (Phase 2a parentIds sync)", () => {
    it("writes to BOTH legacy fields AND parentIds[]", () => {
        let t = createTree("x", { ...bareRoot(), given: "Kid" });
        const kid = ROOT_ID;
        const addMom = addPerson(t, bareChild("Mom", "f"));
        t = addMom.tree;
        const linked = linkParent(t, kid, addMom.id);
        if (!linked.ok) throw new Error(linked.error);
        const child = linked.value.people[kid];
        if (!child) throw new Error("missing child");
        // Legacy field still set (Phase 2a back-compat).
        expect(child.motherId).toBe(addMom.id);
        // New field populated.
        expect(child.parentIds).toBeDefined();
        expect(child.parentIds).toEqual([
            { personId: addMom.id, role: "mother", pedi: "birth" },
        ]);
    });

    it("unlinkParent drops from BOTH legacy field AND parentIds[]", () => {
        let t = createTree("x", { ...bareRoot(), given: "Kid" });
        const kid = ROOT_ID;
        const addMom = addPerson(t, bareChild("Mom", "f"));
        t = addMom.tree;
        const linked = linkParent(t, kid, addMom.id);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        const stripped = unlinkParent(t, kid, "mother");
        const child = stripped.people[kid];
        if (!child) throw new Error("missing child");
        expect(child.motherId).toBeUndefined();
        expect(child.parentIds).toEqual([]);
    });
});
