/*
 * FamilyTreeEditor - unit tests for the family-view group-frame walker
 * (Phase 6a).
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";

import type { Group, PersonId, Tree } from "$lib/domain/types";
import { buildGroups } from "$lib/layout/engines/family-view/groups";
import type { FamilyViewNode } from "$lib/layout/engines/family-view/types";

function emptyTree(groups: Group[]): Tree {
    return {
        id: "t",
        name: "test",
        rootId: "A",
        people: {},
        couples: [],
        unions: [],
        relationships: [],
        groups,
        editRev: 0,
        updatedAt: 0,
    };
}

function node(id: PersonId, x: number, y: number, h = 1): FamilyViewNode {
    return { personId: id, rank: 0, x, y, h };
}

const BBOX = { width: 10, height: 6 };

describe("buildGroups - empty / no-op", () => {
    it("returns [] when tree.groups is absent", () => {
        const tree = emptyTree([]);
        delete (tree as { groups?: unknown }).groups;
        const frames = buildGroups(tree, new Map(), BBOX);
        expect(frames).toEqual([]);
    });

    it("returns [] when tree.groups is empty", () => {
        const frames = buildGroups(emptyTree([]), new Map(), BBOX);
        expect(frames).toEqual([]);
    });

    it("skips groups with zero visible members", () => {
        const tree = emptyTree([
            { id: "g1", name: "Ghost", kind: "dynasty", memberIds: ["P1", "P2"] },
        ]);
        const frames = buildGroups(tree, new Map(), BBOX);
        expect(frames).toEqual([]);
    });
});

describe("buildGroups - kind → frame defaults", () => {
    const nodes = new Map<PersonId, FamilyViewNode>([
        ["A", node("A", 0, 0)],
        ["B", node("B", 2, 0)],
        ["C", node("C", 4, 0)],
    ]);

    it("dynasty → hull by default", () => {
        const tree = emptyTree([
            { id: "g", name: "X", kind: "dynasty", memberIds: ["A", "B", "C"] },
        ]);
        const [f] = buildGroups(tree, nodes, BBOX);
        expect(f?.frame).toBe("hull");
        expect(f?.hull).toBeDefined();
    });

    it("house → hull by default", () => {
        const tree = emptyTree([{ id: "g", name: "X", kind: "house", memberIds: ["A", "B", "C"] }]);
        const [f] = buildGroups(tree, nodes, BBOX);
        expect(f?.frame).toBe("hull");
    });

    it("household → hull by default", () => {
        const tree = emptyTree([
            { id: "g", name: "X", kind: "household", memberIds: ["A", "B", "C"] },
        ]);
        const [f] = buildGroups(tree, nodes, BBOX);
        expect(f?.frame).toBe("hull");
    });

    it("clan → ribbon by default", () => {
        const tree = emptyTree([{ id: "g", name: "X", kind: "clan", memberIds: ["A", "B", "C"] }]);
        const [f] = buildGroups(tree, nodes, BBOX);
        expect(f?.frame).toBe("ribbon");
        expect(f?.rect).toBeDefined();
    });

    it("faction / order / covenant → band by default", () => {
        const tree = emptyTree([
            { id: "f", name: "X", kind: "faction", memberIds: ["A"] },
            { id: "o", name: "X", kind: "order", memberIds: ["B"] },
            { id: "c", name: "X", kind: "covenant", memberIds: ["C"] },
        ]);
        const frames = buildGroups(tree, nodes, BBOX);
        expect(frames.map((f) => f.frame)).toEqual(["band", "band", "band"]);
    });

    it("non-canonical kind → band by default", () => {
        const tree = emptyTree([{ id: "g", name: "X", kind: "guild", memberIds: ["A"] }]);
        const [f] = buildGroups(tree, nodes, BBOX);
        expect(f?.frame).toBe("band");
    });

    it("explicit frame.style override wins over kind default", () => {
        const tree = emptyTree([
            {
                id: "g",
                name: "X",
                kind: "dynasty",
                memberIds: ["A", "B", "C"],
                frame: { style: "band" },
            },
        ]);
        const [f] = buildGroups(tree, nodes, BBOX);
        expect(f?.frame).toBe("band");
    });
});

describe("buildGroups - hull geometry", () => {
    it("computes convex hull around member card centers", () => {
        // Three cards at (0,0), (4,0), (2,4) — triangle.
        const nodes = new Map<PersonId, FamilyViewNode>([
            ["A", node("A", 0, 0)],
            ["B", node("B", 4, 0)],
            ["C", node("C", 2, 4)],
        ]);
        const tree = emptyTree([
            { id: "g", name: "Tri", kind: "dynasty", memberIds: ["A", "B", "C"] },
        ]);
        const [f] = buildGroups(tree, nodes, BBOX);
        expect(f?.hull).toBeDefined();
        // Hull should be a triangle (3 vertices).
        expect(f?.hull?.length).toBe(3);
    });

    it("filters to visible members only", () => {
        const nodes = new Map<PersonId, FamilyViewNode>([
            ["A", node("A", 0, 0)],
            ["C", node("C", 2, 4)],
        ]);
        const tree = emptyTree([
            { id: "g", name: "X", kind: "dynasty", memberIds: ["A", "B", "C"] },
        ]);
        const [f] = buildGroups(tree, nodes, BBOX);
        // B is invisible — visible set is {A, C}, hull should reflect that.
        expect(f?.memberIds).toEqual(["A", "C"]);
    });
});

describe("buildGroups - band / ribbon geometry", () => {
    const nodes = new Map<PersonId, FamilyViewNode>([
        ["A", node("A", 1, 0, 1)],
        ["B", node("B", 5, 0, 1)],
    ]);

    it("band spans full canvas height inside member x-range", () => {
        const tree = emptyTree([{ id: "g", name: "X", kind: "faction", memberIds: ["A", "B"] }]);
        const [f] = buildGroups(tree, nodes, BBOX);
        expect(f?.rect).toBeDefined();
        expect(f?.rect?.y).toBe(0);
        expect(f?.rect?.h).toBe(BBOX.height);
    });

    it("ribbon is a thin header bar across the member x-range", () => {
        const tree = emptyTree([{ id: "g", name: "X", kind: "clan", memberIds: ["A", "B"] }]);
        const [f] = buildGroups(tree, nodes, BBOX);
        expect(f?.rect).toBeDefined();
        expect(f?.rect?.h).toBeLessThan(BBOX.height);
        // Ribbon sits above the top of the highest member.
        expect(f?.rect?.y).toBeLessThan(0);
    });
});

describe("buildGroups - color override + ordering", () => {
    const nodes = new Map<PersonId, FamilyViewNode>([
        ["A", node("A", 0, 0)],
        ["B", node("B", 2, 0)],
        ["C", node("C", 4, 0)],
    ]);

    it("frame.color flows onto the GroupFrame", () => {
        const tree = emptyTree([
            {
                id: "g",
                name: "Crimson",
                kind: "dynasty",
                memberIds: ["A", "B", "C"],
                frame: { color: "#c41e3a" },
            },
        ]);
        const [f] = buildGroups(tree, nodes, BBOX);
        expect(f?.color).toBe("#c41e3a");
    });

    it("emits frames in tree.groups[] order so the renderer stacks consistently", () => {
        const tree = emptyTree([
            { id: "g1", name: "First", kind: "dynasty", memberIds: ["A"] },
            { id: "g2", name: "Second", kind: "faction", memberIds: ["B"] },
            { id: "g3", name: "Third", kind: "clan", memberIds: ["C"] },
        ]);
        const frames = buildGroups(tree, nodes, BBOX);
        expect(frames.map((f) => f.id)).toEqual(["g1", "g2", "g3"]);
    });
});
