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

    // phase 1 of family-view-debug plan: subset.rationale covers every
    // person in tree.people that isn't visible, with a closed-set reason.
    it("emits a rationale entry for every off-subset person, never overlapping visible", () => {
        const { tree, ids } = makeAncestorChain();
        const subset = selectBoundedSubset(tree, ids.focus!);

        // invariant: visible ∩ rationale = ∅, visible ∪ rationale = tree.people
        for (const id of subset.visible) {
            expect(subset.rationale.has(id)).toBe(false);
        }
        for (const id of subset.rationale.keys()) {
            expect(subset.visible.has(id)).toBe(false);
        }
        const total = Object.keys(tree.people).length;
        expect(subset.visible.size + subset.rationale.size).toBe(total);

        // gggp is exactly 4 generations up — `rank-cutoff` reason.
        expect(subset.rationale.get(ids.gggp!)).toBe("rank-cutoff");
    });

    it("rationale is empty when every person fits in the bounded window", () => {
        // single-person tree → focus visible, nothing rejected.
        const t = createTree("test", blank("Solo"));
        const subset = selectBoundedSubset(t, ROOT_ID);
        expect(subset.visible.has(ROOT_ID)).toBe(true);
        expect(subset.rationale.size).toBe(0);
    });

    it("flags an unknown focus by stamping every person as unreachable", () => {
        const t = createTree("test", blank("Solo"));
        const subset = selectBoundedSubset(t, "not-a-real-id");
        expect(subset.visible.size).toBe(0);
        expect(subset.rationale.get(ROOT_ID)).toBe("unreachable");
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

    it("bundles a single parent's multi-child sibship under one anchor with stem+bus+stubs", () => {
        // Akarian 2026-05 repro: Janadokar + Fadagoi have children incl.
        // Jalaman Dar (single, no partner) and Thradach Dar (married). When
        // Jalaman also has children of his own (single-parent sibship), the
        // family-view engine must emit ONE solo anchor covering all of
        // Jalaman's kids, with a shared stem + bus + per-child stubs - the
        // same geometry as a 2-couple union - so the sibship reads as a
        // distinct visual group instead of bleeding into Thradach's sibship
        // beside it. Pre-fix: one anchor per child + per-child L-drop, no
        // shared bus, so siblings looked like an extension of the next
        // couple's sibship.
        let t = createTree("test", blank("Focus"));
        const k1 = addPerson(t, blank("KidA"));
        t = k1.tree;
        const k2 = addPerson(t, blank("KidB"));
        t = k2.tree;
        const k3 = addPerson(t, blank("KidC"));
        t = k3.tree;
        for (const k of [k1, k2, k3]) {
            const link = linkParent(t, k.id, ROOT_ID);
            if (!link.ok) throw new Error(link.error);
            t = link.value;
        }

        const engine = new FamilyViewEngine();
        const out = engine.layout({ tree: t, focus: ROOT_ID });
        const soloAnchors = out.anchors.filter((a) => a.partnerIds.length === 1);
        // ONE anchor for all three children, not three (one per kid).
        expect(soloAnchors).toHaveLength(1);
        expect(soloAnchors[0]!.partnerIds).toEqual([ROOT_ID]);
        expect(new Set(soloAnchors[0]!.childIds)).toEqual(new Set([k1.id, k2.id, k3.id]));

        // edges: one stem, one bus, three stubs (mirroring 2-couple geometry).
        const soloEdges = out.edges.filter((e) => e.id.includes("union:solo:"));
        const stemCount = soloEdges.filter((e) => e.id.startsWith("stem:")).length;
        const busCount = soloEdges.filter((e) => e.id.startsWith("bus:")).length;
        const stubCount = soloEdges.filter((e) => e.id.startsWith("stub:")).length;
        expect(stemCount).toBe(1);
        expect(busCount).toBe(1);
        expect(stubCount).toBe(3);

        // the bus is centered on the parent column: the stem's x matches the
        // parent's mid-x, which guarantees the visible sibship sits under
        // the lone parent rather than centered on the kids' centroid.
        const parentNode = out.nodes.get(ROOT_ID)!;
        const stem = soloEdges.find((e) => e.id.startsWith("stem:"))!;
        const parentMidX = parentNode.x + 1; // PERSON_W / 2 = 1u
        expect(stem.points[0]!.x).toBeCloseTo(parentMidX, 5);
        expect(stem.points[1]!.x).toBeCloseTo(parentMidX, 5);
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

    it("renders a cross-rank (uncle/niece) couple as a slack L-bond + lower-partner sibship", () => {
        // Inbred-family repro: Graps + Banchar -> {Unclek, focus=New_I6};
        // focus + Newa -> Neicea; Unclek (gen 2) + Neicea (gen 3) -> New_I7.
        // The Unclek+Neicea couple's two partners land on different ranks
        // (rank 0 + rank 1). Pre-fix the couple was silently `continue`d
        // in `emitAnchorsAndEdges` so the shared child fell through to
        // the multi-parent pill fallback with no visible bond between
        // the partners and no union anchor — that read on canvas as
        // "Unclek collapsed onto Neicea's row" because the only visible
        // connection between them was the pill drop.
        //
        // Post-fix invariants:
        //   - ranks are unchanged (focus 0, parents -1, daughter 1, gson 2)
        //   - the cross-rank couple has a union anchor with both partners
        //   - a `crossrank` bond edge exists with role=married
        //   - the shared child is `childCovered`, so the multi-parent
        //     pill fallback emits no `union:multi:...` edges for them
        let t = createTree("test", blank("New_I6", "m"));
        const focusId = ROOT_ID;
        const graps = addPerson(t, blank("Graps", "m"));
        t = graps.tree;
        const banchar = addPerson(t, blank("Banchar", "f"));
        t = banchar.tree;
        const unclek = addPerson(t, blank("Unclek", "m"));
        t = unclek.tree;
        const newa = addPerson(t, blank("Newa", "f"));
        t = newa.tree;
        const neicea = addPerson(t, blank("Neicea", "f"));
        t = neicea.tree;
        const newi7 = addPerson(t, blank("New_I7", "m"));
        t = newi7.tree;
        const link = (child: string, parent: string): void => {
            const r = linkParent(t, child, parent);
            if (!r.ok) throw new Error(r.error);
            t = r.value;
        };
        link(focusId, graps.id);
        link(focusId, banchar.id);
        link(unclek.id, graps.id);
        link(unclek.id, banchar.id);
        link(neicea.id, focusId);
        link(neicea.id, newa.id);
        link(newi7.id, unclek.id);
        link(newi7.id, neicea.id);
        const spouse = (a: string, b: string): void => {
            const r = linkSpouse(t, a, b);
            if (!r.ok) throw new Error(r.error);
            t = r.value;
        };
        spouse(graps.id, banchar.id);
        spouse(focusId, newa.id);
        spouse(unclek.id, neicea.id);
        // wire children into couples
        t = {
            ...t,
            couples: t.couples.map((c) => {
                const pair = new Set([c.leftId, c.rightId]);
                if (pair.has(graps.id) && pair.has(banchar.id)) {
                    return { ...c, childIds: [unclek.id, focusId] };
                }
                if (pair.has(focusId) && pair.has(newa.id)) {
                    return { ...c, childIds: [neicea.id] };
                }
                if (pair.has(unclek.id) && pair.has(neicea.id)) {
                    return { ...c, childIds: [newi7.id] };
                }
                return c;
            }),
        };

        const engine = new FamilyViewEngine();
        const out = engine.layout({ tree: t, focus: focusId });

        // ranks: focus on its own row, parents above, daughter below
        expect(out.nodes.get(focusId)?.rank).toBe(0);
        expect(out.nodes.get(graps.id)?.rank).toBe(-1);
        expect(out.nodes.get(banchar.id)?.rank).toBe(-1);
        expect(out.nodes.get(neicea.id)?.rank).toBe(1);
        // unclek sits with focus on row 0 (focus's sibling); the cross-
        // rank couple does NOT pull him down to neicea's row
        expect(out.nodes.get(unclek.id)?.rank).toBe(0);
        // grandchild on the next row down
        expect(out.nodes.get(newi7.id)?.rank).toBe(2);

        // cross-rank couple has a union anchor with both partners
        const crossAnchor = out.anchors.find(
            (a) =>
                a.partnerIds.length === 2 &&
                new Set(a.partnerIds).has(unclek.id) &&
                new Set(a.partnerIds).has(neicea.id),
        );
        expect(crossAnchor).toBeDefined();
        expect(crossAnchor!.childIds).toEqual([newi7.id]);

        // slack bond edge present with role=married
        const crossBond = out.edges.find(
            (e) => e.id.includes("/crossrank") && e.role === "married",
        );
        expect(crossBond).toBeDefined();
        expect(new Set(crossBond!.persons)).toEqual(new Set([unclek.id, neicea.id]));
        // L-shaped: 4 points, the inner two share a y in the gutter
        expect(crossBond!.points).toHaveLength(4);
        expect(crossBond!.points[1]!.y).toBeCloseTo(crossBond!.points[2]!.y, 5);

        // no multi-parent pill fallback for the shared kid: the kid's
        // own union didn't get re-rendered as a `union:multi:` anchor
        const multiAnchor = out.anchors.find((a) => a.id.startsWith("union:multi:"));
        expect(multiAnchor).toBeUndefined();
    });

    it("leaves an adjacent couple bond as a straight two-point segment", () => {
        // The detour must not perturb the common case: a couple slot
        // whose two partners are already x-adjacent gets a clean 2-point
        // bond, no extra waypoints introduced. Sanity-check on the
        // simplest spouse pair from the first "couple-box" test above.
        let t = createTree("test", blank("Focus"));
        const mother = addPerson(t, blank("Mother", "f"));
        t = mother.tree;
        const father = addPerson(t, blank("Father", "m"));
        t = father.tree;
        const ml = linkParent(t, ROOT_ID, mother.id);
        if (!ml.ok) throw new Error(ml.error);
        t = ml.value;
        const fl = linkParent(t, ROOT_ID, father.id);
        if (!fl.ok) throw new Error(fl.error);
        t = fl.value;
        const sp = linkSpouse(t, mother.id, father.id);
        if (!sp.ok) throw new Error(sp.error);
        t = sp.value;
        const engine = new FamilyViewEngine();
        const out = engine.layout({ tree: t, focus: ROOT_ID });
        const bond = out.edges.find((e) => e.id.startsWith("bond:") && e.role === "married");
        expect(bond).toBeDefined();
        expect(bond!.points).toHaveLength(2);
    });
});
