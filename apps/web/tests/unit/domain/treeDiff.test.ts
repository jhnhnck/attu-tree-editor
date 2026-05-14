/*
 * FamilyTreeEditor - treeDiff: diffTrees, applyDiff, invertDiff, isEmptyDiff
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import {
    addPerson,
    createTree,
    linkParent,
    linkSpouse,
    linkUnion,
    removePerson,
    updatePerson,
    updateUnion,
} from "$lib/domain/tree";
import { applyDiff, diffTrees, invertDiff, isEmptyDiff } from "$lib/domain/treeDiff";
import type { Person, Tree, UnionRecord } from "$lib/domain/types";

function bare(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function base(): Tree {
    return createTree("test", bare("Root", "m"));
}

describe("isEmptyDiff", () => {
    it("returns true for identical trees (same reference)", () => {
        const t = base();
        expect(isEmptyDiff(diffTrees(t, t))).toBe(true);
    });

    it("returns true for structurally identical trees (different reference)", () => {
        const t = base();
        const t2 = { ...t };
        expect(isEmptyDiff(diffTrees(t, t2))).toBe(true);
    });

    it("returns false when a person changes", () => {
        const t = base();
        const t2 = updatePerson(t, ROOT_ID, { given: "Changed" });
        expect(isEmptyDiff(diffTrees(t, t2))).toBe(false);
    });
});

describe("diffTrees", () => {
    it("detects a single person field change", () => {
        const before = base();
        const after = updatePerson(before, ROOT_ID, { given: "NewName" });
        const diff = diffTrees(before, after);

        expect(Object.keys(diff.people)).toHaveLength(1);
        expect(diff.people[ROOT_ID]!.before!.given).toBe("Root");
        expect(diff.people[ROOT_ID]!.after!.given).toBe("NewName");
        expect(Object.keys(diff.couples)).toHaveLength(0);
    });

    it("detects added person (before: null)", () => {
        const before = base();
        const { tree: after, id } = addPerson(before, bare("Alice"));
        const diff = diffTrees(before, after);

        expect(diff.people[id]!.before).toBeNull();
        expect(diff.people[id]!.after!.given).toBe("Alice");
    });

    it("detects removed person (after: null)", () => {
        const { tree: before, id } = addPerson(base(), bare("Bob"));
        const after = removePerson(before, id);
        const diff = diffTrees(before, after);

        expect(diff.people[id]!.before!.given).toBe("Bob");
        expect(diff.people[id]!.after).toBeNull();
    });

    it("detects couple addition", () => {
        const { tree: t, id: spouseId } = addPerson(base(), bare("Spouse", "f"));
        const before = t;
        const r = linkSpouse(t, ROOT_ID, spouseId);
        if (!r.ok) throw new Error(r.error);
        const after = r.value;

        const diff = diffTrees(before, after);
        const coupleKey = `${ROOT_ID}+${spouseId}`;
        expect(diff.couples[coupleKey]!.before).toBeNull();
        expect(diff.couples[coupleKey]!.after).not.toBeNull();
    });

    it("detects root-level field changes", () => {
        const before = base();
        const after = { ...before, name: "New Name", rootId: ROOT_ID };
        const diff = diffTrees(before, { ...after, name: "Other Name" });
        expect(diff.name!.before).toBe("test");
        expect(diff.name!.after).toBe("Other Name");
    });
});

describe("applyDiff — forward round-trip", () => {
    it("applyDiff(before, diff) produces a tree equal to after", () => {
        const before = base();
        const after = updatePerson(before, ROOT_ID, { given: "Changed", surname: "Smith" });
        const diff = diffTrees(before, after);
        const result = applyDiff(before, diff);
        expect(result).toEqual(after);
    });

    it("forward round-trip: add person", () => {
        const before = base();
        const { tree: after } = addPerson(before, bare("Alice"));
        const result = applyDiff(before, diffTrees(before, after));
        expect(result).toEqual(after);
    });

    it("forward round-trip: remove person", () => {
        const { tree: before, id } = addPerson(base(), bare("Bob"));
        const after = removePerson(before, id);
        const result = applyDiff(before, diffTrees(before, after));
        expect(result).toEqual(after);
    });

    it("forward round-trip: add couple", () => {
        const { tree: t, id: spouseId } = addPerson(base(), bare("Spouse", "f"));
        const r = linkSpouse(t, ROOT_ID, spouseId);
        if (!r.ok) throw new Error(r.error);
        const after = r.value;
        const result = applyDiff(t, diffTrees(t, after));
        expect(result).toEqual(after);
    });

    it("forward round-trip: link parent", () => {
        const { tree: t, id: childId } = addPerson(base(), bare("Child"));
        const r = linkParent(t, childId, ROOT_ID);
        if (!r.ok) throw new Error(r.error);
        const after = r.value;
        const result = applyDiff(t, diffTrees(t, after));
        expect(result).toEqual(after);
    });
});

describe("applyDiff + invertDiff — undo round-trip", () => {
    it("applyDiff(after, invertDiff(diff)) restores before", () => {
        const before = base();
        const after = updatePerson(before, ROOT_ID, { given: "Changed" });
        const diff = diffTrees(before, after);
        const restored = applyDiff(after, invertDiff(diff));
        expect(restored).toEqual(before);
    });

    it("undo round-trip: add person", () => {
        const before = base();
        const { tree: after } = addPerson(before, bare("Alice"));
        const diff = diffTrees(before, after);
        const restored = applyDiff(after, invertDiff(diff));
        expect(restored).toEqual(before);
    });

    it("undo round-trip: remove person", () => {
        const { tree: before, id } = addPerson(base(), bare("Bob"));
        const after = removePerson(before, id);
        const diff = diffTrees(before, after);
        const restored = applyDiff(after, invertDiff(diff));
        expect(restored).toEqual(before);
    });

    it("undo round-trip: add couple", () => {
        const { tree: before, id: spouseId } = addPerson(base(), bare("Spouse", "f"));
        const r = linkSpouse(before, ROOT_ID, spouseId);
        if (!r.ok) throw new Error(r.error);
        const after = r.value;
        const diff = diffTrees(before, after);
        const restored = applyDiff(after, invertDiff(diff));
        expect(restored).toEqual(before);
    });

    it("undo then redo sequence", () => {
        const t0 = base();
        const { tree: t1 } = addPerson(t0, bare("Alice"));
        const { tree: t2 } = addPerson(t1, bare("Bob"));

        const diff1 = diffTrees(t0, t1);
        const diff2 = diffTrees(t1, t2);

        // undo twice
        const undone1 = applyDiff(t2, invertDiff(diff2));
        expect(undone1).toEqual(t1);

        const undone2 = applyDiff(undone1, invertDiff(diff1));
        expect(undone2).toEqual(t0);

        // redo twice
        const redone1 = applyDiff(undone2, diff1);
        expect(redone1).toEqual(t1);

        const redone2 = applyDiff(redone1, diff2);
        expect(redone2).toEqual(t2);
    });
});

describe("unions[] diffing (Phase 3b.1)", () => {
    /** seed a tree with `unions: []` so writers sync the field */
    function baseWithUnions(): { tree: Tree; ids: { a: string; b: string; c: string } } {
        let t = createTree("test", bare("Root", "m"));
        const addA = addPerson(t, bare("A", "f"));
        t = addA.tree;
        const addB = addPerson(t, bare("B", "m"));
        t = addB.tree;
        const addC = addPerson(t, bare("C", "u"));
        t = addC.tree;
        t = { ...t, unions: [] };
        return { tree: t, ids: { a: addA.id, b: addB.id, c: addC.id } };
    }

    it("detects union insertion and round-trips it forward", () => {
        const { tree: before, ids } = baseWithUnions();
        const r = linkUnion(before, [ids.a, ids.b, ids.c]);
        if (!r.ok) throw new Error(r.error);
        const after = r.value;
        const diff = diffTrees(before, after);
        expect(Object.keys(diff.unions)).toHaveLength(1);
        const result = applyDiff(before, diff);
        expect(result).toEqual(after);
    });

    it("detects union deletion and inverts cleanly", () => {
        const { tree: t0, ids } = baseWithUnions();
        const r = linkUnion(t0, [ids.a, ids.b, ids.c]);
        if (!r.ok) throw new Error(r.error);
        const before = r.value;
        // remove person A — sweeps union too (3 → 2 partners)
        const after = removePerson(before, ids.a);
        const diff = diffTrees(before, after);
        expect(Object.keys(diff.unions)).toHaveLength(1);
        const restored = applyDiff(after, invertDiff(diff));
        expect(restored).toEqual(before);
    });

    it("detects union field-level update (kind / closed / name)", () => {
        const { tree: t0, ids } = baseWithUnions();
        const r = linkUnion(t0, [ids.a, ids.b]);
        if (!r.ok) throw new Error(r.error);
        const before = r.value;
        const unionId = (before.unions ?? [])[0]?.id ?? "";
        const after = updateUnion(before, unionId, {
            kind: "civil",
            closed: true,
            name: "House X",
        });
        const diff = diffTrees(before, after);
        expect(Object.keys(diff.unions)).toEqual([unionId]);
        const forward = applyDiff(before, diff);
        expect(forward).toEqual(after);
        const restored = applyDiff(after, invertDiff(diff));
        expect(restored).toEqual(before);
    });

    it("preserves union order on apply (existing first, new appended)", () => {
        const { tree: t0, ids } = baseWithUnions();
        const r1 = linkUnion(t0, [ids.a, ids.b]);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkUnion(r1.value, [ids.a, ids.c]);
        if (!r2.ok) throw new Error(r2.error);
        const before = r2.value;
        const fst = (before.unions ?? [])[0];
        const snd = (before.unions ?? [])[1];
        // delete the first union via a hand-rolled new tree
        const after: Tree = { ...before, unions: snd ? [snd] : [] };
        const diff = diffTrees(before, after);
        const result = applyDiff(before, diff);
        expect(result.unions).toEqual(snd ? [snd] : []);
        // invert: restore both. A union deleted in the forward diff lands at
        // the END of the unions[] on invert (the "append new" branch), so
        // order is [snd, fst] not [fst, snd]. Membership is what matters for
        // undo correctness; positional fidelity for re-added entries is not
        // currently a contract.
        const restored = applyDiff(after, invertDiff(diff));
        expect(new Set((restored.unions ?? []).map((u: UnionRecord) => u.id))).toEqual(
            new Set([fst?.id, snd?.id]),
        );
    });

    it("treats trees without `unions` field as having no union changes", () => {
        // both inputs lack `unions` → diff.unions is empty, applyDiff leaves the
        // output without `unions`, isEmptyDiff still true.
        const before = base();
        const after = updatePerson(before, ROOT_ID, { given: "Changed" });
        const diff = diffTrees(before, after);
        expect(Object.keys(diff.unions)).toHaveLength(0);
        const result = applyDiff(before, diff);
        expect("unions" in result).toBe(false);
    });

    it("isEmptyDiff returns false when only unions change", () => {
        const { tree: before, ids } = baseWithUnions();
        const r = linkUnion(before, [ids.a, ids.b]);
        if (!r.ok) throw new Error(r.error);
        const diff = diffTrees(before, r.value);
        // people and couples both change (spouseIds + new couple), so isEmptyDiff
        // would already be false. Synthesize a pure-unions diff to test the
        // unions-aware branch.
        const unionsOnly = { ...diff, people: {}, couples: {} };
        expect(isEmptyDiff(unionsOnly)).toBe(false);
    });
});
