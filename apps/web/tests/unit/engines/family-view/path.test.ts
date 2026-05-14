/*
 * FamilyTreeEditor - Phase 3 family-view path-highlight tests.
 *
 * Covers the Phase 3 DoD:
 *   - bfsPath finds the shortest path over consanguinity + spouse
 *     edges and returns it source→target,
 *   - usePath wires selection → path-set; degenerate cases yield
 *     empty without crashing,
 *   - 7-hop synthetic chain renders 7 highlighted persons,
 *   - selection through a multi-union threads through the spouse
 *     edge (path crosses a marriage),
 *   - single-parent path coverage: BFS still walks via a single
 *     parentIds entry without needing the partner card,
 *   - badgeOnPath: a path member hidden inside a collapsed badge
 *     surfaces as on-path on the badge itself.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { bfsPath } from "$lib/layout/doi";
import { badgeOnPath, usePath } from "$lib/layout/engines/family-view";
import type { Person } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function chain(length: number): { tree: ReturnType<typeof createTree>; ids: string[] } {
    // Build a 1-parent chain: focus → parent → grandparent → ...
    let t = createTree("chain", blank("Focus"));
    const ids: string[] = [ROOT_ID];
    let prev = ROOT_ID;
    for (let i = 1; i < length; i += 1) {
        const a = addPerson(t, blank(`A${String(i)}`));
        t = a.tree;
        const linked = linkParent(t, prev, a.id);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        ids.push(a.id);
        prev = a.id;
    }
    return { tree: t, ids };
}

describe("bfsPath", () => {
    it("returns the single-element path for source === target", () => {
        const { tree } = chain(2);
        const p = bfsPath(tree, ROOT_ID, ROOT_ID);
        expect(p).toEqual([ROOT_ID]);
    });

    it("walks parent edges to find a 7-hop path on a synthetic ancestor chain", () => {
        const { tree, ids } = chain(8); // focus + 7 ancestors
        const p = bfsPath(tree, ROOT_ID, ids[7]!);
        // Source → target inclusive: 8 entries; 7 edges between them.
        expect(p.length).toBe(8);
        expect(p[0]).toBe(ROOT_ID);
        expect(p[7]).toBe(ids[7]!);
    });

    it("returns empty when source / target are disconnected", () => {
        let t = createTree("split", blank("Focus"));
        const isolated = addPerson(t, blank("Far"));
        t = isolated.tree;
        // Don't link isolated to anyone.
        const p = bfsPath(t, ROOT_ID, isolated.id);
        expect(p).toEqual([]);
    });

    it("returns empty when either id is unknown", () => {
        const { tree } = chain(2);
        expect(bfsPath(tree, "ghost", ROOT_ID)).toEqual([]);
        expect(bfsPath(tree, ROOT_ID, "ghost")).toEqual([]);
    });

    it("walks spouse edges (multi-union path)", () => {
        // Focus + parent + parent's second spouse (no children with them).
        // Path from focus to the step-parent: focus → parent → step.
        let t = createTree("multi", blank("Focus"));
        const parent = addPerson(t, blank("Parent", "m"));
        t = parent.tree;
        const step = addPerson(t, blank("Step", "f"));
        t = step.tree;
        let l = linkParent(t, ROOT_ID, parent.id);
        if (!l.ok) throw new Error(l.error);
        t = l.value;
        const sp = linkSpouse(t, parent.id, step.id);
        if (!sp.ok) throw new Error(sp.error);
        t = sp.value;
        const p = bfsPath(t, ROOT_ID, step.id);
        expect(p).toEqual([ROOT_ID, parent.id, step.id]);
    });

    it("walks single-parent paths cleanly", () => {
        // Focus has one parent only; that parent has a parent.
        let t = createTree("sp", blank("Focus"));
        const mom = addPerson(t, blank("Mom", "f"));
        t = mom.tree;
        const granny = addPerson(t, blank("Granny", "f"));
        t = granny.tree;
        let l = linkParent(t, ROOT_ID, mom.id);
        if (!l.ok) throw new Error(l.error);
        t = l.value;
        l = linkParent(t, mom.id, granny.id);
        if (!l.ok) throw new Error(l.error);
        t = l.value;
        const p = bfsPath(t, ROOT_ID, granny.id);
        expect(p).toEqual([ROOT_ID, mom.id, granny.id]);
    });
});

describe("usePath", () => {
    it("returns empty when tree is undefined", () => {
        const h = usePath(undefined, "focus", "selected");
        expect(h.pathSet.size).toBe(0);
        expect(h.onPath("anyone")).toBe(false);
    });

    it("returns empty when selection is undefined", () => {
        const { tree } = chain(3);
        const h = usePath(tree, ROOT_ID, undefined);
        expect(h.pathSet.size).toBe(0);
    });

    it("returns the full path set when selection is on the tree", () => {
        const { tree, ids } = chain(4);
        const h = usePath(tree, ROOT_ID, ids[3]!);
        // pathSet contains every id in the path.
        for (const id of ids) expect(h.onPath(id)).toBe(true);
        expect(h.pathSet.size).toBe(4);
    });

    it("returns empty when the selected person is disconnected from focus", () => {
        let t = createTree("split", blank("Focus"));
        const isolated = addPerson(t, blank("Far"));
        t = isolated.tree;
        const h = usePath(t, ROOT_ID, isolated.id);
        expect(h.pathSet.size).toBe(0);
        expect(h.onPath(isolated.id)).toBe(false);
    });

    it("collapses to a one-element set when selection === focus (so the focus card lights up)", () => {
        const { tree } = chain(3);
        const h = usePath(tree, ROOT_ID, ROOT_ID);
        expect(h.pathSet.size).toBe(1);
        expect(h.onPath(ROOT_ID)).toBe(true);
    });
});

describe("badgeOnPath", () => {
    it("reports true when the badge's source is on the path", () => {
        const set = new Set(["focus", "src"]);
        const badge = { sourceId: "src", members: ["hidden-a", "hidden-b"] };
        expect(badgeOnPath(badge, set)).toBe(true);
    });

    it("reports true when any badged member is on the path", () => {
        const set = new Set(["focus", "hidden-b"]);
        const badge = { sourceId: "src", members: ["hidden-a", "hidden-b"] };
        expect(badgeOnPath(badge, set)).toBe(true);
    });

    it("reports false when nothing in the badge is on the path", () => {
        const set = new Set(["focus", "elsewhere"]);
        const badge = { sourceId: "src", members: ["hidden-a", "hidden-b"] };
        expect(badgeOnPath(badge, set)).toBe(false);
    });

    it("reports false on an empty path-set without inspecting members", () => {
        const badge = { sourceId: "src", members: ["a", "b"] };
        expect(badgeOnPath(badge, new Set())).toBe(false);
    });
});
