/*
 * FamilyTreeEditor - unit tests for Group CRUD on the domain layer
 * (Phase 6a).
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";

import type { Tree } from "$lib/domain/types";
import {
    addGroup,
    addGroupMember,
    removeGroup,
    removeGroupMember,
    updateGroup,
} from "$lib/domain/tree";

function emptyTree(): Tree {
    return {
        id: "t",
        name: "test",
        rootId: "A",
        people: {},
        couples: [],
        unions: [],
        relationships: [],
        editRev: 0,
        updatedAt: 0,
    };
}

describe("addGroup", () => {
    it("appends the group and synthesizes a deterministic id", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addGroup(t0, {
            name: "House Marvane",
            kind: "house",
            memberIds: ["A", "B", "C"],
        });
        expect(id).toBe("group-house-house-marvane-3");
        expect(t1.groups).toBeDefined();
        expect(t1.groups).toHaveLength(1);
        expect(t1.groups?.[0]?.id).toBe("group-house-house-marvane-3");
        expect(t1.groups?.[0]?.memberIds).toEqual(["A", "B", "C"]);
    });

    it("honours explicit id when supplied", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addGroup(t0, {
            id: "custom-g",
            name: "X",
            kind: "dynasty",
            memberIds: [],
        });
        expect(id).toBe("custom-g");
        expect(t1.groups?.[0]?.id).toBe("custom-g");
    });

    it("threads optional fields through", () => {
        const t0 = emptyTree();
        const { tree: t1 } = addGroup(t0, {
            name: "X",
            kind: "covenant",
            memberIds: ["A"],
            founderId: "A",
            frame: { style: "band", color: "#abc" },
            armorial: { description: "azure, three estoiles" },
        });
        const g = t1.groups?.[0];
        expect(g?.founderId).toBe("A");
        expect(g?.frame?.style).toBe("band");
        expect(g?.frame?.color).toBe("#abc");
        expect(g?.armorial?.description).toBe("azure, three estoiles");
    });

    it("initialises groups[] from absent → list", () => {
        const t0 = emptyTree();
        // `delete` the property so the test exercises the "absent" branch
        // instead of "explicit undefined" (different shape under
        // exactOptionalPropertyTypes).
        delete (t0 as { groups?: unknown }).groups;
        const { tree: t1 } = addGroup(t0, { name: "X", kind: "dynasty", memberIds: [] });
        expect(t1.groups).toBeDefined();
        expect(t1.groups).toHaveLength(1);
    });
});

describe("removeGroup", () => {
    it("removes a group by id", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addGroup(t0, {
            name: "X",
            kind: "dynasty",
            memberIds: [],
        });
        const t2 = removeGroup(t1, id);
        expect(t2.groups).toEqual([]);
    });

    it("is a no-op on unknown id", () => {
        const t0 = emptyTree();
        const { tree: t1 } = addGroup(t0, { name: "X", kind: "dynasty", memberIds: [] });
        const t2 = removeGroup(t1, "unknown");
        expect(t2).toBe(t1);
    });
});

describe("updateGroup", () => {
    it("patches name + kind without touching memberIds", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addGroup(t0, {
            name: "Old",
            kind: "dynasty",
            memberIds: ["A", "B"],
        });
        const t2 = updateGroup(t1, id, { name: "New", kind: "house" });
        const g = t2.groups?.[0];
        expect(g?.name).toBe("New");
        expect(g?.kind).toBe("house");
        expect(g?.memberIds).toEqual(["A", "B"]);
    });

    it("clears optional fields when patched with undefined", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addGroup(t0, {
            name: "X",
            kind: "dynasty",
            memberIds: [],
            founderId: "A",
            armorial: { description: "old" },
        });
        const t2 = updateGroup(t1, id, { founderId: undefined, armorial: undefined });
        const g = t2.groups?.[0];
        expect(g?.founderId).toBeUndefined();
        expect(g?.armorial).toBeUndefined();
    });

    it("is a no-op on unknown id", () => {
        const t0 = emptyTree();
        const { tree: t1 } = addGroup(t0, { name: "X", kind: "dynasty", memberIds: [] });
        const t2 = updateGroup(t1, "unknown", { name: "z" });
        expect(t2).toBe(t1);
    });
});

describe("addGroupMember / removeGroupMember", () => {
    it("adds a new member without dupes", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addGroup(t0, {
            name: "X",
            kind: "dynasty",
            memberIds: ["A"],
        });
        const t2 = addGroupMember(t1, id, "B");
        expect(t2.groups?.[0]?.memberIds).toEqual(["A", "B"]);
        const t3 = addGroupMember(t2, id, "B");
        expect(t3).toBe(t2);
    });

    it("removes an existing member", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addGroup(t0, {
            name: "X",
            kind: "dynasty",
            memberIds: ["A", "B", "C"],
        });
        const t2 = removeGroupMember(t1, id, "B");
        expect(t2.groups?.[0]?.memberIds).toEqual(["A", "C"]);
    });

    it("is a no-op when removing a non-member", () => {
        const t0 = emptyTree();
        const { tree: t1, id } = addGroup(t0, {
            name: "X",
            kind: "dynasty",
            memberIds: ["A"],
        });
        const t2 = removeGroupMember(t1, id, "Z");
        expect(t2).toBe(t1);
    });
});
