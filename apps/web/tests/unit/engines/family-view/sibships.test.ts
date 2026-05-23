/*
 * FamilyTreeEditor - unit tests for the family-view sibship walker
 * (Phase 6b).
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";

import type { PersonId, SibshipDecorator, Tree } from "$lib/domain/types";
import { buildSibships } from "$lib/layout/engines/family-view/sibships";
import type { FamilyViewNode } from "$lib/layout/engines/family-view/types";

function emptyTree(sibshipDecorators: SibshipDecorator[]): Tree {
    return {
        id: "t",
        name: "test",
        rootId: "A",
        people: {},
        couples: [],
        unions: [],
        relationships: [],
        sibshipDecorators,
        editRev: 0,
        updatedAt: 0,
    };
}

function node(id: PersonId, x: number, y: number, h = 1): FamilyViewNode {
    return { personId: id, rank: 0, x, y, h };
}

describe("buildSibships — empty / no-op", () => {
    it("returns [] when tree.sibshipDecorators is absent", () => {
        const tree = emptyTree([]);
        delete (tree as { sibshipDecorators?: unknown }).sibshipDecorators;
        expect(buildSibships(tree, new Map())).toEqual([]);
    });

    it("returns [] when tree.sibshipDecorators is empty", () => {
        expect(buildSibships(emptyTree([]), new Map())).toEqual([]);
    });

    it("skips decorators with < 2 members", () => {
        const tree = emptyTree([{ id: "d", kind: "twins-MZ", sibIds: ["A"] }]);
        const nodes = new Map([["A", node("A", 0, 0)]]);
        expect(buildSibships(tree, nodes)).toEqual([]);
    });

    it("skips decorators where any member isn't visible", () => {
        const tree = emptyTree([{ id: "d", kind: "twins-MZ", sibIds: ["A", "B"] }]);
        const nodes = new Map([["A", node("A", 0, 0)]]);
        expect(buildSibships(tree, nodes)).toEqual([]);
    });
});

describe("buildSibships — kind → tieBar mapping", () => {
    const nodes = new Map<PersonId, FamilyViewNode>([
        ["A", node("A", 0, 0)],
        ["B", node("B", 2, 0)],
        ["C", node("C", 4, 0)],
    ]);

    it("MZ suffix → solid tie bar", () => {
        const tree = emptyTree([{ id: "d", kind: "triplets-MZ", sibIds: ["A", "B", "C"] }]);
        const [f] = buildSibships(tree, nodes);
        expect(f?.tieBar).toBe("solid");
    });

    it("DZ suffix → no tie bar", () => {
        const tree = emptyTree([{ id: "d", kind: "twins-DZ", sibIds: ["A", "B"] }]);
        const [f] = buildSibships(tree, nodes);
        expect(f?.tieBar).toBe("none");
    });

    it("? suffix → dashed tie bar", () => {
        const tree = emptyTree([{ id: "d", kind: "twins-?", sibIds: ["A", "B"] }]);
        const [f] = buildSibships(tree, nodes);
        expect(f?.tieBar).toBe("dashed");
    });

    it("clone-batch → double tie bar", () => {
        const tree = emptyTree([{ id: "d", kind: "clone-batch", sibIds: ["A", "B", "C"] }]);
        const [f] = buildSibships(tree, nodes);
        expect(f?.tieBar).toBe("double");
    });

    it("non-canonical kind → no tie bar", () => {
        const tree = emptyTree([{ id: "d", kind: "litter", sibIds: ["A", "B", "C"] }]);
        const [f] = buildSibships(tree, nodes);
        expect(f?.tieBar).toBe("none");
    });
});

describe("buildSibships — geometry", () => {
    it("bracketY sits above the topmost member's card top", () => {
        const nodes = new Map<PersonId, FamilyViewNode>([
            ["A", node("A", 0, 1.5)],
            ["B", node("B", 2, 1.5)],
        ]);
        const tree = emptyTree([{ id: "d", kind: "twins-MZ", sibIds: ["A", "B"] }]);
        const [f] = buildSibships(tree, nodes);
        expect(f?.bracketY).toBeLessThan(1.5);
        // bracket sits within a sensible gap above the row
        expect(1.5 - (f?.bracketY ?? 0)).toBeLessThan(0.4);
    });

    it("members reflect each sibling's midX", () => {
        // PERSON_W = 2, so midX = x + 1 for each card.
        const nodes = new Map<PersonId, FamilyViewNode>([
            ["A", node("A", 0, 0)],
            ["B", node("B", 4, 0)],
        ]);
        const tree = emptyTree([{ id: "d", kind: "twins-DZ", sibIds: ["A", "B"] }]);
        const [f] = buildSibships(tree, nodes);
        expect(f?.members).toHaveLength(2);
        expect(f?.members.map((m) => m.x)).toEqual([1, 5]);
    });
});

describe("buildSibships — emit order + optional fields", () => {
    const nodes = new Map<PersonId, FamilyViewNode>([
        ["A", node("A", 0, 0)],
        ["B", node("B", 2, 0)],
        ["C", node("C", 4, 0)],
        ["D", node("D", 6, 0)],
    ]);

    it("preserves the order of tree.sibshipDecorators[]", () => {
        const tree = emptyTree([
            { id: "d2", kind: "twins-MZ", sibIds: ["C", "D"] },
            { id: "d1", kind: "twins-DZ", sibIds: ["A", "B"] },
        ]);
        const frames = buildSibships(tree, nodes);
        expect(frames.map((f) => f.id)).toEqual(["d2", "d1"]);
    });

    it("threads optional name through", () => {
        const tree = emptyTree([
            { id: "d", kind: "triplets-MZ", sibIds: ["A", "B", "C"], name: "the triplets" },
        ]);
        const [f] = buildSibships(tree, nodes);
        expect(f?.name).toBe("the triplets");
    });
});
