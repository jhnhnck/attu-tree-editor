/*
 * FamilyTreeEditor - tree operations: add, link, remove, traverse
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import {
    addPerson,
    addUnionPartner,
    ancestorsOf,
    createTree,
    descendantsOf,
    getParents,
    getUnions,
    linkParent,
    linkParentRef,
    linkSpouse,
    linkUnion,
    removePerson,
    removeUnionPartner,
    siblingsOf,
    unlinkParent,
    unlinkParentByPersonId,
    unlinkSpouse,
    updateParentRef,
    updatePerson,
    updateUnion,
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
        const a = stripped.people[ids.a ?? ""];
        const b = stripped.people[ids.b ?? ""];
        expect(getParents(a!).some((r) => r.role === "father")).toBe(false);
        expect(getParents(b!).some((r) => r.role === "father")).toBe(false);
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
        const root = r.value.people[ROOT_ID];
        expect(getParents(root!).some((p) => p.personId === ROOT_ID)).toBe(true);
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
        const cChild = cycle.value.people[c];
        expect(getParents(cChild!).some((p) => p.personId === addA.id && p.role === "father")).toBe(
            true,
        );
    });

    it("assigns role mother for female parents and father for male/unknown", () => {
        let t = createTree("x", { ...bareRoot(), given: "Kid" });
        const kid = ROOT_ID;
        const addMom = addPerson(t, bareChild("Mom", "f"));
        t = addMom.tree;
        const linked = linkParent(t, kid, addMom.id);
        if (!linked.ok) throw new Error(linked.error);
        const child = linked.value.people[kid];
        expect(getParents(child!)).toEqual([
            { personId: addMom.id, role: "mother", pedi: "birth" },
        ]);
    });
});

describe("unlinkParent", () => {
    it("removes the requested role only", () => {
        const { tree, ids } = fixtureFamily();
        const stripped = unlinkParent(tree, ids.a ?? "", "father");
        const a = stripped.people[ids.a ?? ""];
        const parents = getParents(a!);
        expect(parents.some((p) => p.role === "father")).toBe(false);
        const motherEntry = parents.find((p) => p.role === "mother");
        expect(motherEntry?.personId).toBe(ids.sp);
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

describe("getParents (relationship-vocabulary helper)", () => {
    it("returns parentIds when populated", () => {
        const { tree, ids } = fixtureFamily();
        const a = tree.people[ids.a ?? ""];
        if (!a) throw new Error("fixture missing A");
        const parents = getParents(a);
        expect(parents.length).toBeGreaterThan(0);
        for (const p of parents) {
            expect(typeof p.personId).toBe("string");
            expect(["mother", "father"]).toContain(p.role);
            expect(p.pedi).toBe("birth");
        }
    });

    it("returns empty array when parentIds is missing", () => {
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

describe("linkParent / unlinkParent (parentIds writes)", () => {
    it("populates parentIds with role + pedi=birth", () => {
        let t = createTree("x", { ...bareRoot(), given: "Kid" });
        const kid = ROOT_ID;
        const addMom = addPerson(t, bareChild("Mom", "f"));
        t = addMom.tree;
        const linked = linkParent(t, kid, addMom.id);
        if (!linked.ok) throw new Error(linked.error);
        const child = linked.value.people[kid];
        if (!child) throw new Error("missing child");
        expect(child.parentIds).toEqual([{ personId: addMom.id, role: "mother", pedi: "birth" }]);
    });

    it("unlinkParent drops the matching entry from parentIds", () => {
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
        // parentIds either absent or empty after stripping the sole entry
        expect(child.parentIds ?? []).toEqual([]);
    });
});

describe("linkParentRef / unlinkParentByPersonId / updateParentRef (Phase 2b.3 N-parent ops)", () => {
    it("linkParentRef appends an explicit ParentRef with arbitrary role + pedi", () => {
        let t = createTree("x", { ...bareRoot(), given: "Kid" });
        const kid = ROOT_ID;
        const addExtra = addPerson(t, bareChild("Magic", "u"));
        t = addExtra.tree;
        const r = linkParentRef(t, kid, {
            personId: addExtra.id,
            role: "donor",
            pedi: "magical",
        });
        if (!r.ok) throw new Error(r.error);
        const child = r.value.people[kid];
        if (!child) throw new Error("missing kid");
        expect(child.parentIds).toEqual([
            { personId: addExtra.id, role: "donor", pedi: "magical" },
        ]);
    });

    it("linkParentRef errs when the same personId is already linked", () => {
        let t = createTree("x", { ...bareRoot(), given: "Kid" });
        const kid = ROOT_ID;
        const addP = addPerson(t, bareChild("P", "u"));
        t = addP.tree;
        const first = linkParentRef(t, kid, {
            personId: addP.id,
            role: "parent",
            pedi: "birth",
        });
        if (!first.ok) throw new Error(first.error);
        t = first.value;
        const second = linkParentRef(t, kid, {
            personId: addP.id,
            role: "donor",
            pedi: "adopted",
        });
        expect(second.ok).toBe(false);
    });

    it("unlinkParentByPersonId removes the ref regardless of role", () => {
        let t = createTree("x", { ...bareRoot(), given: "Kid" });
        const kid = ROOT_ID;
        const addExtra = addPerson(t, bareChild("Donor", "u"));
        t = addExtra.tree;
        const linked = linkParentRef(t, kid, {
            personId: addExtra.id,
            role: "donor",
            pedi: "magical",
        });
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        const stripped = unlinkParentByPersonId(t, kid, addExtra.id);
        const child = stripped.people[kid];
        if (!child) throw new Error("missing kid");
        expect(child.parentIds ?? []).toEqual([]);
    });

    it("updateParentRef mutates role/pedi without touching personId", () => {
        let t = createTree("x", { ...bareRoot(), given: "Kid" });
        const kid = ROOT_ID;
        const addExtra = addPerson(t, bareChild("Adoptive", "u"));
        t = addExtra.tree;
        const linked = linkParentRef(t, kid, {
            personId: addExtra.id,
            role: "parent",
            pedi: "birth",
        });
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        const updated = updateParentRef(t, kid, addExtra.id, {
            role: "social",
            pedi: "adopted",
        });
        const child = updated.people[kid];
        if (!child) throw new Error("missing kid");
        expect(child.parentIds).toEqual([
            { personId: addExtra.id, role: "social", pedi: "adopted" },
        ]);
    });
});

describe("getUnions (Phase 3a forward-compat reader)", () => {
    it("returns tree.unions if populated", () => {
        const t = createTree("x", bareRoot());
        const tWithUnions: Tree = {
            ...t,
            unions: [
                {
                    id: "u1",
                    partnerIds: ["a", "b", "c"],
                    childIds: [],
                    kind: "civil",
                    closed: true,
                },
            ],
        };
        const got = getUnions(tWithUnions);
        expect(got).toHaveLength(1);
        expect(got[0]?.partnerIds).toEqual(["a", "b", "c"]);
        expect(got[0]?.kind).toBe("civil");
    });

    it("derives from legacy couples[] when unions is absent", () => {
        // build a tree the legacy way; assert getUnions reads identically to
        // what the migration produces.
        let t = createTree("x", { ...bareRoot(), gender: "m" });
        const a = ROOT_ID;
        const addB = addPerson(t, bareChild("B", "f"));
        t = addB.tree;
        const r = linkSpouse(t, a, addB.id);
        if (!r.ok) throw new Error(r.error);
        t = r.value;
        const got = getUnions(t);
        expect(got).toHaveLength(1);
        expect(got[0]?.partnerIds.sort()).toEqual([a, addB.id].sort());
        expect(got[0]?.childIds).toEqual([]);
        expect(got[0]?.id).toMatch(/^union-1-/);
    });

    it("returns empty array when no couples and no unions", () => {
        const t = createTree("x", bareRoot());
        expect(getUnions(t)).toEqual([]);
    });
});

describe("linkUnion / addUnionPartner / removeUnionPartner (Phase 3a N-partner ops)", () => {
    function buildEmptyUnionsTree(): { tree: Tree; ids: Record<string, string> } {
        // populate tree.unions = [] so writers know to sync (mirrors what the
        // 2.0.0 → 3.0.0 migration does on save).
        let t = createTree("x", bareRoot());
        const addA = addPerson(t, bareChild("A", "f"));
        t = addA.tree;
        const addB = addPerson(t, bareChild("B", "m"));
        t = addB.tree;
        const addC = addPerson(t, bareChild("C", "u"));
        t = addC.tree;
        t = { ...t, unions: [] };
        return { tree: t, ids: { a: addA.id, b: addB.id, c: addC.id } };
    }

    it("linkUnion(2 partners) creates a union and back-fills couples[]", () => {
        const { tree, ids } = buildEmptyUnionsTree();
        const r = linkUnion(tree, [ids.a ?? "", ids.b ?? ""]);
        if (!r.ok) throw new Error(r.error);
        expect(r.value.unions).toHaveLength(1);
        expect(r.value.unions?.[0]?.partnerIds.sort()).toEqual([ids.a, ids.b].sort());
        // 2-partner unions back-fill the legacy couples[] for unmigrated readers
        expect(r.value.couples).toHaveLength(1);
        // spouseIds mirrored on both sides
        expect(r.value.people[ids.a ?? ""]?.spouseIds).toContain(ids.b);
        expect(r.value.people[ids.b ?? ""]?.spouseIds).toContain(ids.a);
    });

    it("linkUnion(3 partners) creates one union but does NOT back-fill couples[]", () => {
        const { tree, ids } = buildEmptyUnionsTree();
        const r = linkUnion(tree, [ids.a ?? "", ids.b ?? "", ids.c ?? ""]);
        if (!r.ok) throw new Error(r.error);
        expect(r.value.unions).toHaveLength(1);
        expect(r.value.unions?.[0]?.partnerIds).toHaveLength(3);
        // >2-partner unions don't fit into the legacy CoupleRecord shape; the
        // Phase 3b reader migration sweep is what makes such unions visible.
        expect(r.value.couples).toEqual([]);
        // every pair has the spouse bond mirrored
        expect(r.value.people[ids.a ?? ""]?.spouseIds.sort()).toEqual([ids.b, ids.c].sort());
        expect(r.value.people[ids.b ?? ""]?.spouseIds.sort()).toEqual([ids.a, ids.c].sort());
        expect(r.value.people[ids.c ?? ""]?.spouseIds.sort()).toEqual([ids.a, ids.b].sort());
    });

    it("linkUnion(unknown partner) errs", () => {
        const { tree, ids } = buildEmptyUnionsTree();
        const r = linkUnion(tree, [ids.a ?? "", "ZZZZZ"]);
        expect(r.ok).toBe(false);
    });

    it("addUnionPartner appends to partnerIds and mirrors spouseIds", () => {
        const { tree, ids } = buildEmptyUnionsTree();
        const r1 = linkUnion(tree, [ids.a ?? "", ids.b ?? ""]);
        if (!r1.ok) throw new Error(r1.error);
        const unionId = r1.value.unions?.[0]?.id ?? "";
        const r2 = addUnionPartner(r1.value, unionId, ids.c ?? "");
        if (!r2.ok) throw new Error(r2.error);
        expect(r2.value.unions?.[0]?.partnerIds).toHaveLength(3);
        expect(r2.value.people[ids.c ?? ""]?.spouseIds.sort()).toEqual([ids.a, ids.b].sort());
        expect(r2.value.people[ids.a ?? ""]?.spouseIds).toContain(ids.c);
        expect(r2.value.people[ids.b ?? ""]?.spouseIds).toContain(ids.c);
    });

    it("addUnionPartner errs when person already in union", () => {
        const { tree, ids } = buildEmptyUnionsTree();
        const r1 = linkUnion(tree, [ids.a ?? "", ids.b ?? ""]);
        if (!r1.ok) throw new Error(r1.error);
        const unionId = r1.value.unions?.[0]?.id ?? "";
        const r2 = addUnionPartner(r1.value, unionId, ids.a ?? "");
        expect(r2.ok).toBe(false);
    });

    it("removeUnionPartner filters partnerIds; deletes union when empty", () => {
        const { tree, ids } = buildEmptyUnionsTree();
        const r1 = linkUnion(tree, [ids.a ?? "", ids.b ?? "", ids.c ?? ""]);
        if (!r1.ok) throw new Error(r1.error);
        const unionId = r1.value.unions?.[0]?.id ?? "";
        const after = removeUnionPartner(r1.value, unionId, ids.c ?? "");
        expect(after.unions?.[0]?.partnerIds.sort()).toEqual([ids.a, ids.b].sort());
        const empty = removeUnionPartner(
            removeUnionPartner(after, unionId, ids.a ?? ""),
            unionId,
            ids.b ?? "",
        );
        expect(empty.unions).toEqual([]);
    });

    it("updateUnion patches kind / closed / name without disturbing partners", () => {
        const { tree, ids } = buildEmptyUnionsTree();
        const r1 = linkUnion(tree, [ids.a ?? "", ids.b ?? "", ids.c ?? ""]);
        if (!r1.ok) throw new Error(r1.error);
        const unionId = r1.value.unions?.[0]?.id ?? "";
        const after = updateUnion(r1.value, unionId, {
            kind: "civil",
            closed: true,
            name: "House Marvane",
        });
        const u = after.unions?.[0];
        expect(u?.kind).toBe("civil");
        expect(u?.closed).toBe(true);
        expect(u?.name).toBe("House Marvane");
        expect(u?.partnerIds).toHaveLength(3);
    });

    it("linkSpouse on a tree with tree.unions populated keeps both in sync", () => {
        const { tree, ids } = buildEmptyUnionsTree();
        const r = linkSpouse(tree, ids.a ?? "", ids.b ?? "");
        if (!r.ok) throw new Error(r.error);
        expect(r.value.couples).toHaveLength(1);
        expect(r.value.unions).toHaveLength(1);
        expect(r.value.unions?.[0]?.partnerIds.sort()).toEqual([ids.a, ids.b].sort());
    });

    it("unlinkSpouse on a synced tree removes from both couples[] and unions[]", () => {
        const { tree, ids } = buildEmptyUnionsTree();
        const linked = linkSpouse(tree, ids.a ?? "", ids.b ?? "");
        if (!linked.ok) throw new Error(linked.error);
        const after = unlinkSpouse(linked.value, ids.a ?? "", ids.b ?? "");
        expect(after.couples).toEqual([]);
        expect(after.unions).toEqual([]);
    });

    it("removePerson sweeps both couples[] and unions[]", () => {
        const { tree, ids } = buildEmptyUnionsTree();
        const linked = linkUnion(tree, [ids.a ?? "", ids.b ?? "", ids.c ?? ""]);
        if (!linked.ok) throw new Error(linked.error);
        const after = removePerson(linked.value, ids.c ?? "");
        expect(after.unions?.[0]?.partnerIds.sort()).toEqual([ids.a, ids.b].sort());
        expect(after.unions?.[0]?.partnerIds).not.toContain(ids.c);
    });
});
