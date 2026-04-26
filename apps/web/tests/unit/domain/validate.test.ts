/*
 * FamilyTreeEditor - structural tree validator findings
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import type { Person, Tree } from "$lib/domain/types";
import { validate } from "$lib/domain/validate";

function makeRoot(): Omit<Person, "id"> {
    return { given: "Root", surname: "", gender: "u", spouseIds: [], display: "z1" };
}

function makeChild(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

describe("validate (clean trees)", () => {
    it("returns no findings on a single-person tree", () => {
        const t = createTree("x", makeRoot());
        expect(validate(t)).toEqual([]);
    });

    it("returns no findings on a healthy multi-person tree", () => {
        let t = createTree("x", { ...makeRoot(), gender: "f" });
        const child = addPerson(t, makeChild("Kid"));
        t = child.tree;
        const linked = linkParent(t, child.id, ROOT_ID);
        if (!linked.ok) throw new Error(linked.error);
        expect(validate(linked.value)).toEqual([]);
    });
});

describe("validate (structural problems)", () => {
    function withMutated(mutate: (t: Tree) => void): Tree {
        const t = createTree("x", makeRoot());
        mutate(t);
        return t;
    }

    it("flags an orphan parent reference", () => {
        const t = withMutated((tree) => {
            const root = tree.people[ROOT_ID];
            if (!root) throw new Error("missing root");
            root.motherId = "GHOST";
        });
        const findings = validate(t);
        expect(findings).toContainEqual({
            kind: "orphan-reference",
            from: ROOT_ID,
            field: "mother",
            missing: "GHOST",
        });
    });

    it("flags an orphan spouse reference", () => {
        const t = withMutated((tree) => {
            const root = tree.people[ROOT_ID];
            if (!root) throw new Error("missing root");
            root.spouseIds.push("GHOST");
        });
        const findings = validate(t);
        expect(findings).toContainEqual({
            kind: "orphan-reference",
            from: ROOT_ID,
            field: "spouse",
            missing: "GHOST",
        });
    });

    it("flags a direct cycle", () => {
        // build A father B, then mutate A to have B as father (back-edge)
        let t = createTree("x", { ...makeRoot(), given: "A", gender: "m" });
        const a = ROOT_ID;
        const addB = addPerson(t, makeChild("B", "m"));
        t = addB.tree;
        const linked = linkParent(t, addB.id, a);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        // sneak the cycle in by direct mutation (linkParent would refuse it)
        const aPerson = t.people[a];
        if (!aPerson) throw new Error("missing A");
        aPerson.fatherId = addB.id;

        const findings = validate(t);
        const cycle = findings.find((f) => f.kind === "cycle");
        expect(cycle).toBeDefined();
        if (cycle && cycle.kind === "cycle") {
            expect(new Set(cycle.path)).toEqual(new Set([a, addB.id]));
        }
    });

    it("flags duplicate spouse entries", () => {
        let t = createTree("x", { ...makeRoot(), given: "A", gender: "m" });
        const a = ROOT_ID;
        const addB = addPerson(t, makeChild("B", "f"));
        t = addB.tree;
        const married = linkSpouse(t, a, addB.id);
        if (!married.ok) throw new Error(married.error);
        t = married.value;
        const aPerson = t.people[a];
        if (!aPerson) throw new Error("missing A");
        aPerson.spouseIds.push(addB.id); // forced duplicate

        const findings = validate(t);
        expect(findings).toContainEqual({
            kind: "duplicate-spouse",
            person: a,
            spouse: addB.id,
        });
    });

    it("flags a missing root", () => {
        const t = createTree("x", makeRoot());
        t.rootId = "GHOST";
        const findings = validate(t);
        expect(findings).toContainEqual({ kind: "missing-root", rootId: "GHOST" });
    });

    it("flags an invalid id", () => {
        const t = createTree("x", makeRoot());
        const bad: Person = {
            id: "lower",
            given: "Bad",
            surname: "",
            gender: "u",
            spouseIds: [],
            display: "z1",
        };
        t.people["lower"] = bad;
        const findings = validate(t);
        expect(findings).toContainEqual({ kind: "invalid-id", id: "lower" });
    });

    it("flags a self-couple", () => {
        const t = createTree("x", { ...makeRoot(), gender: "u" });
        const root = t.people[ROOT_ID];
        if (!root) throw new Error("missing root");
        root.spouseIds.push(ROOT_ID);
        const findings = validate(t);
        expect(findings).toContainEqual({ kind: "self-couple", person: ROOT_ID });
    });

    it("does not flag the START sentinel as an invalid id", () => {
        const t = createTree("x", makeRoot());
        const findings = validate(t);
        expect(findings.some((f) => f.kind === "invalid-id")).toBe(false);
    });
});
