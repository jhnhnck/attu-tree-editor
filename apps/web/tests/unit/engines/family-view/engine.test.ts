/*
 * FamilyTreeEditor - Phase 0 family-view engine sanity tests.
 *
 * Synthetic fixtures only — Akarians fit-zoom probe is a separate test
 * (tests/perf/family-view-fit.test.ts) and runs against the real ged.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { FamilyViewEngine } from "$lib/layout/engines/family-view";
import { selectBoundedSubset } from "$lib/layout/engines/family-view/subset";
import type { Person, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function makeAncestorChain(): { tree: Tree; ids: Record<string, string> } {
    // Build: focus ← parent ← grandparent ← great-grandparent ← great-great-gp
    let t = createTree("test", blank("Focus"));
    const ids: Record<string, string> = { focus: ROOT_ID };
    let prev = ROOT_ID;
    for (const k of ["parent", "gp", "ggp", "gggp"]) {
        const a = addPerson(t, blank(k));
        t = a.tree;
        const linked = linkParent(t, prev, a.id);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        ids[k] = a.id;
        prev = a.id;
    }
    return { tree: t, ids };
}

describe("FamilyViewEngine — bounded subset", () => {
    it("includes focus + 3 ancestors but stops at the 4th", () => {
        const { tree, ids } = makeAncestorChain();
        const subset = selectBoundedSubset(tree, ids.focus!);
        expect(subset.visible.has(ids.focus!)).toBe(true);
        expect(subset.visible.has(ids.parent!)).toBe(true);
        expect(subset.visible.has(ids.gp!)).toBe(true);
        expect(subset.visible.has(ids.ggp!)).toBe(true);
        // 4th-generation ancestor falls outside the bounded window.
        expect(subset.visible.has(ids.gggp!)).toBe(false);
    });

    it("ranks ancestors at negative depths", () => {
        const { tree, ids } = makeAncestorChain();
        const subset = selectBoundedSubset(tree, ids.focus!);
        expect(subset.rank.get(ids.focus!)).toBe(0);
        expect(subset.rank.get(ids.parent!)).toBe(-1);
        expect(subset.rank.get(ids.gp!)).toBe(-2);
        expect(subset.rank.get(ids.ggp!)).toBe(-3);
    });
});

describe("FamilyViewEngine — couple-box layout", () => {
    it("emits one union anchor per visible couple, with partners on the same rank", () => {
        let t = createTree("test", blank("Focus"));
        const mother = addPerson(t, blank("Mother", "f"));
        t = mother.tree;
        const father = addPerson(t, blank("Father", "m"));
        t = father.tree;
        const motherLink = linkParent(t, ROOT_ID, mother.id);
        if (!motherLink.ok) throw new Error(motherLink.error);
        t = motherLink.value;
        const fatherLink = linkParent(t, ROOT_ID, father.id);
        if (!fatherLink.ok) throw new Error(fatherLink.error);
        t = fatherLink.value;
        const spouse = linkSpouse(t, mother.id, father.id);
        if (!spouse.ok) throw new Error(spouse.error);
        t = spouse.value;
        // ensure focus child is on the couple's childIds
        const couple = t.couples[0]!;
        const next: Tree = {
            ...t,
            couples: [{ ...couple, childIds: [ROOT_ID] }],
        };

        const engine = new FamilyViewEngine();
        const result = engine.layout({ tree: next, focus: ROOT_ID });
        expect(result.anchors).toHaveLength(1);
        const anchor = result.anchors[0]!;
        expect(anchor.partnerIds).toEqual([mother.id, father.id]);
        expect(anchor.childIds).toEqual([ROOT_ID]);
        const motherNode = result.nodes.get(mother.id);
        const fatherNode = result.nodes.get(father.id);
        expect(motherNode?.rank).toBe(-1);
        expect(fatherNode?.rank).toBe(-1);
        expect(motherNode?.rank).toBe(fatherNode?.rank);
    });

    it("emits a degenerate single-partner anchor for single-parent children", () => {
        // Focus has only a mother (no father).
        let t = createTree("test", blank("Focus"));
        const mother = addPerson(t, blank("Mother", "f"));
        t = mother.tree;
        const linked = linkParent(t, ROOT_ID, mother.id);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;

        const engine = new FamilyViewEngine();
        const result = engine.layout({ tree: t, focus: ROOT_ID });
        const soloAnchors = result.anchors.filter((a) => a.partnerIds.length === 1);
        expect(soloAnchors).toHaveLength(1);
        expect(soloAnchors[0]!.partnerIds).toEqual([mother.id]);
        expect(soloAnchors[0]!.childIds).toEqual([ROOT_ID]);
    });

    it("survives a self-parent cycle without infinite looping", () => {
        // Self-parent is a permitted shape (rule #6); selectBoundedSubset
        // must not loop on it.
        let t = createTree("test", blank("Focus"));
        const linked = linkParent(t, ROOT_ID, ROOT_ID);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        const engine = new FamilyViewEngine();
        const result = engine.layout({ tree: t, focus: ROOT_ID });
        // Only the focus is visible; the self-loop terminates the BFS.
        expect(result.nodes.size).toBe(1);
    });
});
