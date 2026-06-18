/*
 * FamilyTreeEditor - unit tests for SibshipDecorator CRUD + birthOrder
 * on the domain layer (Phase 6b).
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";

import type { Tree } from "$lib/domain/types";
import {
    addSibshipDecorator,
    addSibshipMember,
    removeSibshipDecorator,
    removeSibshipMember,
    updatePerson,
    updateSibshipDecorator,
} from "$lib/domain/tree";

function emptyTree(): Tree {
    return {
        id: "t",
        name: "test",
        rootId: "A",
        people: {
            A: { id: "A", given: "A", surname: "x", gender: "u", spouseIds: [], display: "z1" },
        },
        couples: [],
        unions: [],
        relationships: [],
        editRev: 0,
        updatedAt: 0,
    };
}

describe("addSibshipDecorator", () => {
    it("appends the decorator and synthesises a stable id", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addSibshipDecorator(t0, {
            kind: "twins-MZ",
            sibIds: ["B", "A"],
        });
        // sibIds sorted into the id so id is stable across input ordering
        expect(id).toBe("sibship-twins-MZ-A-B");
        expect(t1.sibshipDecorators).toHaveLength(1);
        expect(t1.sibshipDecorators?.[0]?.sibIds).toEqual(["B", "A"]);
    });

    it("honours explicit id when supplied", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addSibshipDecorator(t0, {
            id: "custom-s",
            kind: "litter",
            sibIds: ["A", "B", "C"],
        });
        expect(id).toBe("custom-s");
        expect(t1.sibshipDecorators?.[0]?.id).toBe("custom-s");
    });

    it("threads optional name through", () => {
        const t0 = emptyTree();
        const { tree: t1 } = addSibshipDecorator(t0, {
            kind: "triplets-MZ",
            sibIds: ["A", "B", "C"],
            name: "the triplets",
        });
        expect(t1.sibshipDecorators?.[0]?.name).toBe("the triplets");
    });

    it("initialises sibshipDecorators from absent → list", () => {
        const t0 = emptyTree();
        delete (t0 as { sibshipDecorators?: unknown }).sibshipDecorators;
        const { tree: t1 } = addSibshipDecorator(t0, { kind: "twins-DZ", sibIds: ["A", "B"] });
        expect(t1.sibshipDecorators).toBeDefined();
        expect(t1.sibshipDecorators).toHaveLength(1);
    });
});

describe("removeSibshipDecorator", () => {
    it("removes a decorator by id", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addSibshipDecorator(t0, {
            kind: "twins-MZ",
            sibIds: ["A", "B"],
        });
        const t2 = removeSibshipDecorator(t1, id);
        expect(t2.sibshipDecorators).toEqual([]);
    });

    it("is a no-op on unknown id", () => {
        const t0 = emptyTree();
        const { tree: t1 } = addSibshipDecorator(t0, { kind: "twins-MZ", sibIds: ["A", "B"] });
        const t2 = removeSibshipDecorator(t1, "unknown");
        expect(t2).toBe(t1);
    });
});

describe("updateSibshipDecorator", () => {
    it("patches kind without touching sibIds", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addSibshipDecorator(t0, {
            kind: "twins-?",
            sibIds: ["A", "B"],
        });
        const t2 = updateSibshipDecorator(t1, id, { kind: "twins-MZ" });
        const d = t2.sibshipDecorators?.[0];
        expect(d?.kind).toBe("twins-MZ");
        expect(d?.sibIds).toEqual(["A", "B"]);
    });

    it("clears name when patched with undefined", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addSibshipDecorator(t0, {
            kind: "twins-MZ",
            sibIds: ["A", "B"],
            name: "matched pair",
        });
        const t2 = updateSibshipDecorator(t1, id, { name: undefined });
        expect(t2.sibshipDecorators?.[0]?.name).toBeUndefined();
    });

    it("is a no-op on unknown id", () => {
        const t0 = emptyTree();
        const { tree: t1 } = addSibshipDecorator(t0, { kind: "twins-MZ", sibIds: ["A", "B"] });
        const t2 = updateSibshipDecorator(t1, "unknown", { kind: "clone-batch" });
        expect(t2).toBe(t1);
    });
});

describe("addSibshipMember / removeSibshipMember", () => {
    it("adds a new sibling without dupes", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addSibshipDecorator(t0, {
            kind: "litter",
            sibIds: ["A"],
        });
        const t2 = addSibshipMember(t1, id, "B");
        expect(t2.sibshipDecorators?.[0]?.sibIds).toEqual(["A", "B"]);
        const t3 = addSibshipMember(t2, id, "B");
        expect(t3).toBe(t2);
    });

    it("removes an existing sibling", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addSibshipDecorator(t0, {
            kind: "triplets-MZ",
            sibIds: ["A", "B", "C"],
        });
        const t2 = removeSibshipMember(t1, id, "B");
        expect(t2.sibshipDecorators?.[0]?.sibIds).toEqual(["A", "C"]);
    });

    it("is a no-op when removing a non-member", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addSibshipDecorator(t0, {
            kind: "twins-MZ",
            sibIds: ["A", "B"],
        });
        const t2 = removeSibshipMember(t1, id, "Z");
        expect(t2).toBe(t1);
    });
});

describe("Person.birthOrder via updatePerson", () => {
    it("sets and clears the birth order via the generic patch path", () => {
        const t0 = emptyTree();
        const t1 = updatePerson(t0, "A", { birthOrder: 2 });
        expect(t1.people["A"]?.birthOrder).toBe(2);
        const t2 = updatePerson(t1, "A", { birthOrder: undefined });
        expect(t2.people["A"]?.birthOrder).toBeUndefined();
    });
});
