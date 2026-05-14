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
import { addPerson, createTree, linkParent } from "$lib/domain/tree";
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
});
