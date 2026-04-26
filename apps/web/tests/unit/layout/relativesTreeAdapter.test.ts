/*
 * FamilyTreeEditor - relatives-tree adapter shape + layout sanity
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { adaptToLayout } from "$lib/layout/relativesTreeAdapter";
import { createTree, addPerson, linkParent, linkSpouse } from "$lib/domain/tree";
import { ROOT_ID } from "$lib/domain/ids";
import type { Person, Tree } from "$lib/domain/types";

function blank(name: string): Person {
    return {
        id: "",
        given: name,
        surname: "",
        gender: "u",
        spouseIds: [],
        display: "z1",
    };
}

function tinyFamily(): { tree: Tree; ids: Record<string, string> } {
    const t0 = createTree("test", { ...blank("root"), gender: "m" });
    const after1 = addPerson(t0, { ...blank("mate"), gender: "f" });
    const t1 = after1.tree;
    const after2 = addPerson(t1, { ...blank("kid"), gender: "u" });
    const t2 = after2.tree;

    const linkedSpouse = linkSpouse(t2, ROOT_ID, after1.id);
    if (!linkedSpouse.ok) throw new Error(linkedSpouse.error);
    const linkedMother = linkParent(linkedSpouse.value, after2.id, after1.id);
    if (!linkedMother.ok) throw new Error(linkedMother.error);
    const linkedFather = linkParent(linkedMother.value, after2.id, ROOT_ID);
    if (!linkedFather.ok) throw new Error(linkedFather.error);

    return {
        tree: linkedFather.value,
        ids: { root: ROOT_ID, mate: after1.id, kid: after2.id },
    };
}

describe("adaptToLayout", () => {
    it("emits one Node per Person with parents/children/spouses populated", () => {
        const { tree, ids } = tinyFamily();
        const { nodes } = adaptToLayout(tree);
        expect(nodes).toHaveLength(3);

        const root = nodes.find((n) => n.id === ids.root);
        const mate = nodes.find((n) => n.id === ids.mate);
        const kid = nodes.find((n) => n.id === ids.kid);
        if (!root || !mate || !kid) throw new Error("missing node");

        expect(root.spouses.map((s) => s.id)).toEqual([ids.mate]);
        expect(mate.spouses.map((s) => s.id)).toEqual([ids.root]);
        expect(root.children.map((c) => c.id)).toEqual([ids.kid]);
        expect(mate.children.map((c) => c.id)).toEqual([ids.kid]);
        expect(kid.parents.map((p) => p.id).sort()).toEqual([ids.mate, ids.root].sort());
    });

    it("computes a non-empty canvas with positioned nodes", () => {
        const { tree } = tinyFamily();
        const { layout } = adaptToLayout(tree);
        expect(layout.canvas.width).toBeGreaterThan(0);
        expect(layout.canvas.height).toBeGreaterThan(0);
        expect(layout.nodes.length).toBeGreaterThan(0);
        for (const n of layout.nodes) {
            expect(typeof n.left).toBe("number");
            expect(typeof n.top).toBe("number");
        }
    });

    it("drops orphan parent references rather than crashing layout", () => {
        const t0 = createTree("o", { ...blank("root"), gender: "m" });
        // hand-craft a tree where a child references a non-existent mother
        const tree: Tree = {
            ...t0,
            people: {
                ...t0.people,
                CCCCC: {
                    id: "CCCCC",
                    given: "Orphan",
                    surname: "",
                    gender: "u",
                    motherId: "ZZZZZ", // missing
                    spouseIds: [],
                    display: "z1",
                },
            },
        };
        const { nodes } = adaptToLayout(tree);
        const orphan = nodes.find((n) => n.id === "CCCCC");
        if (!orphan) throw new Error("missing orphan node");
        expect(orphan.parents).toEqual([]);
    });

    it("filters self-spouse references out of spouses[]", () => {
        const t0 = createTree("s", { ...blank("root"), gender: "u" });
        const linked = linkSpouse(t0, ROOT_ID, ROOT_ID);
        if (!linked.ok) throw new Error(linked.error);
        const { nodes } = adaptToLayout(linked.value);
        const root = nodes.find((n) => n.id === ROOT_ID);
        if (!root) throw new Error("missing root");
        expect(root.spouses).toEqual([]);
    });

    it("populates siblings for children sharing a parent", () => {
        const t0 = createTree("sib", { ...blank("mom"), gender: "f" });
        const a = addPerson(t0, { ...blank("alpha"), gender: "u" });
        const b = addPerson(a.tree, { ...blank("beta"), gender: "u" });

        const linkedA = linkParent(b.tree, a.id, ROOT_ID);
        if (!linkedA.ok) throw new Error(linkedA.error);
        const linkedB = linkParent(linkedA.value, b.id, ROOT_ID);
        if (!linkedB.ok) throw new Error(linkedB.error);

        const { nodes } = adaptToLayout(linkedB.value);
        const alpha = nodes.find((n) => n.id === a.id);
        if (!alpha) throw new Error("missing alpha");
        expect(alpha.siblings.map((s) => s.id)).toEqual([b.id]);
    });

    it("lays out disconnected family clusters side by side instead of dropping them", () => {
        // component A: root --parent-of--> childA
        // component B: elderB --parent-of--> youngB
        const t0 = createTree("multi", { ...blank("rootKorak"), gender: "m" });
        const a = addPerson(t0, { ...blank("kidKorak"), gender: "u" });
        const linkA = linkParent(a.tree, a.id, ROOT_ID);
        if (!linkA.ok) throw new Error(linkA.error);

        const b1 = addPerson(linkA.value, { ...blank("elderMarai"), gender: "f" });
        const b2 = addPerson(b1.tree, { ...blank("youngBanchar"), gender: "u" });
        const linkB = linkParent(b2.tree, b2.id, b1.id);
        if (!linkB.ok) throw new Error(linkB.error);

        const result = adaptToLayout(linkB.value);
        expect(result.totalPeople).toBe(4);
        expect(result.laidOutPeople).toBe(4);
        expect(result.components.length).toBe(2);
        // root's component should sort first
        expect(result.components[0]?.rootId).toBe(ROOT_ID);
        // disjoint components shouldn't share x ranges
        const positionsA = result.layout.nodes
            .filter((n) => n.id === ROOT_ID || n.id === a.id)
            .map((n) => n.left);
        const positionsB = result.layout.nodes
            .filter((n) => n.id === b1.id || n.id === b2.id)
            .map((n) => n.left);
        const maxA = Math.max(...positionsA);
        const minB = Math.min(...positionsB);
        expect(minB).toBeGreaterThan(maxA);
    });

    it("renders fully-isolated people in a grid so they aren't lost", () => {
        // seed root has no relations, so it's isolated too; plus three hermits
        const t0 = createTree("iso", { ...blank("rootKorak"), gender: "m" });
        const lonely1 = addPerson(t0, { ...blank("Hermit1"), gender: "u" });
        const lonely2 = addPerson(lonely1.tree, { ...blank("Hermit2"), gender: "u" });
        const lonely3 = addPerson(lonely2.tree, { ...blank("Hermit3"), gender: "u" });

        const result = adaptToLayout(lonely3.tree);
        expect(result.isolated.length).toBe(4);
        // every person still landed somewhere on the canvas
        expect(result.laidOutPeople).toBe(4);
        const ids = new Set(result.layout.nodes.map((n) => n.id));
        expect(ids.has(ROOT_ID)).toBe(true);
        expect(ids.has(lonely1.id)).toBe(true);
        expect(ids.has(lonely2.id)).toBe(true);
        expect(ids.has(lonely3.id)).toBe(true);
    });
});
