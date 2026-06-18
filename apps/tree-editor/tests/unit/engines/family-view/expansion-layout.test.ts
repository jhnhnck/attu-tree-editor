/*
 * FamilyTreeEditor - Phase 1 expansion + auto-collapse layout tests.
 *
 * Asserts:
 *  - subset extension: expanded id pulls in next-generation relatives
 *  - subset extension: top-rank ancestor expand pulls in their parents
 *  - hasMoreChildren / hasMoreParents / canCollapse contracts
 *  - auto-collapse triggers when visible > threshold; lowest-DOI first
 *  - badges carry the source's children as members
 *  - explicit-expansion is protected from auto-collapse
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { computeLayout } from "$lib/layout/engines/family-view/layout";
import type { Person, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

/**
 * Build: focus has 5 ancestors deep and a tier of grandchildren past
 * the bounded default's depth. Returns the id map for assertions.
 */
function makeDeepFixture(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("deep", blank("Focus"));
    const ids: Record<string, string> = { focus: ROOT_ID };

    // 5-deep ancestor spine.
    let prev = ROOT_ID;
    for (const k of ["parent", "gp", "ggp", "gggp", "g4p"]) {
        const a = addPerson(t, blank(k));
        t = a.tree;
        const linked = linkParent(t, prev, a.id);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        ids[k] = a.id;
        prev = a.id;
    }
    // 4-deep descendant spine.
    prev = ROOT_ID;
    for (const k of ["child", "gc", "ggc", "gggc"]) {
        const d = addPerson(t, blank(k));
        t = d.tree;
        const linked = linkParent(t, d.id, prev);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        ids[k] = d.id;
        prev = d.id;
    }
    return { tree: t, ids };
}

describe("Phase 1 expansion — subset extension", () => {
    it("pulls in a descendant's children when their id is in `expanded`", () => {
        const { tree, ids } = makeDeepFixture();
        // Phase 0 default: focus, parent..ggp, child, gc — 6 cards.
        const baseLayout = computeLayout(tree, ids.focus!, {});
        expect(baseLayout.nodes.has(ids.gc!)).toBe(true);
        expect(baseLayout.nodes.has(ids.ggc!)).toBe(false);

        // Expand gc → ggc should appear at rank +3.
        const expanded = new Set([ids.gc!]);
        const layout = computeLayout(tree, ids.focus!, { expanded });
        expect(layout.nodes.has(ids.ggc!)).toBe(true);
        expect(layout.nodes.get(ids.ggc!)?.rank).toBe(3);
    });

    it("pulls in additional ancestors when the topmost-rank id is in `expanded`", () => {
        const { tree, ids } = makeDeepFixture();
        const baseLayout = computeLayout(tree, ids.focus!, {});
        expect(baseLayout.nodes.has(ids.ggp!)).toBe(true);
        expect(baseLayout.nodes.has(ids.gggp!)).toBe(false);

        const expanded = new Set([ids.ggp!]);
        const layout = computeLayout(tree, ids.focus!, { expanded });
        expect(layout.nodes.has(ids.gggp!)).toBe(true);
        expect(layout.nodes.get(ids.gggp!)?.rank).toBe(-4);
    });

    it("reports hasMoreChildren for descendants with un-shown children", () => {
        const { tree, ids } = makeDeepFixture();
        const layout = computeLayout(tree, ids.focus!, {});
        // gc has children (ggc) that aren't yet shown.
        expect(layout.hasMoreChildren.has(ids.gc!)).toBe(true);
        // ggc isn't shown at all so it shouldn't appear in hasMoreChildren.
        expect(layout.hasMoreChildren.has(ids.ggc!)).toBe(false);
    });

    it("reports hasMoreParents for the topmost-rank ancestor with un-shown parents", () => {
        const { tree, ids } = makeDeepFixture();
        const layout = computeLayout(tree, ids.focus!, {});
        expect(layout.hasMoreParents.has(ids.ggp!)).toBe(true);
    });

    it("reports canCollapse for ids the user explicitly expanded", () => {
        const { tree, ids } = makeDeepFixture();
        const expanded = new Set([ids.gc!]);
        const layout = computeLayout(tree, ids.focus!, { expanded });
        expect(layout.canCollapse.has(ids.gc!)).toBe(true);
    });
});

describe("Phase 1 auto-collapse", () => {
    /**
     * Build a focus + N children fixture so we can drive visible-count
     * past the auto-collapse threshold deterministically.
     */
    function makeWideFixture(childrenCount: number): { tree: Tree; ids: Record<string, string> } {
        let t = createTree("wide", blank("Focus"));
        const ids: Record<string, string> = { focus: ROOT_ID };
        for (let i = 0; i < childrenCount; i += 1) {
            const c = addPerson(t, blank(`child${String(i)}`));
            t = c.tree;
            const linked = linkParent(t, c.id, ROOT_ID);
            if (!linked.ok) throw new Error(linked.error);
            t = linked.value;
            ids[`child${String(i)}`] = c.id;
        }
        return { tree: t, ids };
    }

    it("auto-collapses past the threshold; produces a badge with N members", () => {
        const { tree, ids } = makeWideFixture(60);
        // 1 focus + 60 children = 61 cards if uncollapsed. Threshold = 3
        // for the test so the auto-collapse path is exercised. The badge
        // should contain the 60 children since the only collapsible
        // sibling block is "focus's children".
        const layout = computeLayout(tree, ids.focus!, { autoCollapseThreshold: 3 });
        expect(layout.autoCollapsed.size).toBeGreaterThan(0);
        expect(layout.badges.length).toBeGreaterThan(0);
        const badge = layout.badges[0]!;
        expect(badge.members.length).toBeGreaterThanOrEqual(60);
        expect(badge.sourceId).toBe(ids.focus!);
        // The children themselves should not be visible person nodes.
        for (let i = 0; i < 60; i += 1) {
            expect(layout.nodes.has(ids[`child${String(i)}`]!)).toBe(false);
        }
    });

    it("does not auto-collapse when total visible is at or below the threshold", () => {
        const { tree, ids } = makeWideFixture(3);
        const layout = computeLayout(tree, ids.focus!, { autoCollapseThreshold: 50 });
        expect(layout.autoCollapsed.size).toBe(0);
        expect(layout.badges.length).toBe(0);
    });

    it("protects explicitly-expanded ids from auto-collapse", () => {
        const { tree, ids } = makeWideFixture(60);
        // child0 is in `expanded`. The wide-fixture children block has 60
        // members; if `expanded.has(child0)` protects the parent (focus)
        // from being collapsed, then focus's children should stay visible
        // and the layout has to find some other way to fit — but with
        // only focus + 60 children, there's no other collapsible block.
        // So we should see no badge (since collapsing focus's children
        // would orphan child0).
        const layout = computeLayout(tree, ids.focus!, {
            expanded: new Set([ids.child0!]),
            autoCollapseThreshold: 3,
        });
        expect(layout.autoCollapsed.size).toBe(0);
    });

    /**
     * Regression: ancestor-side badge click stays sticky even when the
     * source's co-parent is also visible. Earlier the per-source skip
     * landed in `pickCollapseVictim`, but the co-parent's children-set is
     * the same sibship, so on the next pass the co-parent got picked and
     * the badge visually reappeared. Fix: protect the children of every
     * `expanded` id, not just the source itself.
     */
    function makeAncestorSibshipFixture(siblingCount: number): {
        tree: Tree;
        ids: Record<string, string>;
    } {
        // focus -- parent -- {G, S}; G+S also have `siblingCount` other
        // children (aunts/uncles of focus), all parented by both G and S.
        let t = createTree("ancestor-sibship", blank("Focus"));
        const ids: Record<string, string> = { focus: ROOT_ID };

        const parent = addPerson(t, blank("parent", "m"));
        t = parent.tree;
        ids.parent = parent.id;
        const pLink = linkParent(t, ROOT_ID, parent.id);
        if (!pLink.ok) throw new Error(pLink.error);
        t = pLink.value;

        const g = addPerson(t, blank("G", "f"));
        t = g.tree;
        ids.G = g.id;
        const s = addPerson(t, blank("S", "m"));
        t = s.tree;
        ids.S = s.id;

        // Wire G + S as a couple so primaryChildrenOf finds the sibship.
        const sp = linkSpouse(t, g.id, s.id);
        if (!sp.ok) throw new Error(sp.error);
        t = sp.value;

        // Both G and S parent the focus's father.
        const gLink = linkParent(t, parent.id, g.id);
        if (!gLink.ok) throw new Error(gLink.error);
        t = gLink.value;
        const sLink = linkParent(t, parent.id, s.id);
        if (!sLink.ok) throw new Error(sLink.error);
        t = sLink.value;

        // Aunts / uncles -- children of both G and S.
        const sibIds: string[] = [];
        for (let i = 0; i < siblingCount; i += 1) {
            const a = addPerson(t, blank(`aunt${String(i)}`));
            t = a.tree;
            ids[`aunt${String(i)}`] = a.id;
            sibIds.push(a.id);
            const al1 = linkParent(t, a.id, g.id);
            if (!al1.ok) throw new Error(al1.error);
            t = al1.value;
            const al2 = linkParent(t, a.id, s.id);
            if (!al2.ok) throw new Error(al2.error);
            t = al2.value;
        }

        // linkSpouse + linkParent leave the couple's childIds empty; splice
        // them in so primaryChildrenOf returns the sibship.
        t = {
            ...t,
            couples: t.couples.map((c) =>
                (c.leftId === g.id && c.rightId === s.id) ||
                (c.leftId === s.id && c.rightId === g.id)
                    ? { ...c, childIds: [parent.id, ...sibIds] }
                    : c,
            ),
        };
        return { tree: t, ids };
    }

    it("ancestor badge click sticks even when the source's co-parent is visible", () => {
        const { tree, ids } = makeAncestorSibshipFixture(20);
        // Bounded default places G + S at rank -2 and parent + 20 aunts at
        // rank -1. With threshold 5 we exceed; auto-collapse picks G or S
        // and badges the aunts.
        const base = computeLayout(tree, ids.focus!, { autoCollapseThreshold: 5 });
        expect(base.badges.length).toBeGreaterThan(0);
        const badgedSource = base.badges[0]!.sourceId;
        expect(badgedSource === ids.G! || badgedSource === ids.S!).toBe(true);

        // User clicks the badge: add the source to `expanded`.
        const expanded = new Set([badgedSource]);
        const after = computeLayout(tree, ids.focus!, {
            expanded,
            autoCollapseThreshold: 5,
        });
        // The same sibship must not be re-badged via the co-parent.
        const otherParent = badgedSource === ids.G! ? ids.S! : ids.G!;
        for (const b of after.badges) {
            expect(b.sourceId).not.toBe(badgedSource);
            expect(b.sourceId).not.toBe(otherParent);
        }
    });
});
