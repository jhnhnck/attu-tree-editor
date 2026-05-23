/*
 * FamilyTreeEditor - wave-2 phase 4: secondary-union expansion.
 *
 * Tests the state hook (useSecondaryUnionState) + the subset selector
 * (selectBoundedSubset's expandedSecondaryUnions pull-in) + the
 * end-to-end render via computeLayout.
 *
 * Scope: v1 rollback partner (one expanded secondary per person, two
 * unions total per focus = primary + 1 secondary). 3+ stays routed to
 * a follow-up.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { computeLayout } from "$lib/layout/engines/family-view/layout";
import { selectBoundedSubset } from "$lib/layout/engines/family-view/subset";
import {
    SECONDARY_UNION_PER_PERSON_CAP,
    clearAllSecondaryUnion,
    secondaryUnionStorageKey,
    useSecondaryUnionState,
} from "$lib/layout/engines/family-view/secondaryUnion";
import type { Person, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

/**
 * Build a focus with two 2-partner unions: primary with `primaryMate`
 * having kid `pKid`, secondary with `secondaryMate` having kid `sKid`.
 */
function twoUnionFocus(): {
    tree: Tree;
    focus: string;
    primaryMate: string;
    secondaryMate: string;
    pKid: string;
    sKid: string;
    primaryCoupleIdx: number;
    secondaryCoupleIdx: number;
} {
    let t = createTree("twoUnion", blank("Focus", "m"));
    const focus = ROOT_ID;
    const primaryMate = addPerson(t, blank("PrimaryMate", "f"));
    t = primaryMate.tree;
    const secondaryMate = addPerson(t, blank("SecondaryMate", "f"));
    t = secondaryMate.tree;
    const pKid = addPerson(t, blank("PKid", "u"));
    t = pKid.tree;
    const sKid = addPerson(t, blank("SKid", "u"));
    t = sKid.tree;

    // Primary union: focus + primaryMate (couple index 0)
    const p1 = linkSpouse(t, focus, primaryMate.id);
    if (!p1.ok) throw new Error(p1.error);
    t = p1.value;
    const lp1 = linkParent(t, pKid.id, focus);
    if (!lp1.ok) throw new Error(lp1.error);
    t = lp1.value;
    const lp2 = linkParent(t, pKid.id, primaryMate.id);
    if (!lp2.ok) throw new Error(lp2.error);
    t = lp2.value;

    // Secondary union: focus + secondaryMate (couple index 1)
    const p2 = linkSpouse(t, focus, secondaryMate.id);
    if (!p2.ok) throw new Error(p2.error);
    t = p2.value;
    const lp3 = linkParent(t, sKid.id, focus);
    if (!lp3.ok) throw new Error(lp3.error);
    t = lp3.value;
    const lp4 = linkParent(t, sKid.id, secondaryMate.id);
    if (!lp4.ok) throw new Error(lp4.error);
    t = lp4.value;

    // Find the couple indexes after construction (linkSpouse may not
    // append in literal order). linkParent doesn't populate
    // CoupleRecord.childIds — patch them on directly per the
    // pattern in multi-union.test.ts.
    let primaryCoupleIdx = -1;
    let secondaryCoupleIdx = -1;
    for (let i = 0; i < t.couples.length; i += 1) {
        const c = t.couples[i]!;
        const ids = new Set([c.leftId, c.rightId]);
        if (ids.has(focus) && ids.has(primaryMate.id)) primaryCoupleIdx = i;
        if (ids.has(focus) && ids.has(secondaryMate.id)) secondaryCoupleIdx = i;
    }
    if (primaryCoupleIdx < 0 || secondaryCoupleIdx < 0) {
        throw new Error("expected both unions in tree.couples");
    }
    const couples = t.couples.slice();
    couples[primaryCoupleIdx] = { ...couples[primaryCoupleIdx]!, childIds: [pKid.id] };
    couples[secondaryCoupleIdx] = { ...couples[secondaryCoupleIdx]!, childIds: [sKid.id] };
    t = { ...t, couples };

    return {
        tree: t,
        focus,
        primaryMate: primaryMate.id,
        secondaryMate: secondaryMate.id,
        pKid: pKid.id,
        sKid: sKid.id,
        primaryCoupleIdx,
        secondaryCoupleIdx,
    };
}

beforeEach(() => {
    clearAllSecondaryUnion();
});

describe("useSecondaryUnionState — state hook", () => {
    it("default: no expansions for any person", () => {
        const st = useSecondaryUnionState("t1", "focus");
        expect(st.expandedFor("focus")).toEqual([]);
        expect(st.byPerson.size).toBe(0);
    });

    it("expand() adds the coupleIndex and persists", () => {
        const st = useSecondaryUnionState("t2", "focus");
        st.expand("focus", 1);
        expect(st.expandedFor("focus")).toEqual([1]);
        expect(st.byPerson.get("focus")?.has(1)).toBe(true);
    });

    it("expand() respects the per-person cap (v1 = 1) — extra adds are silent no-ops", () => {
        expect(SECONDARY_UNION_PER_PERSON_CAP).toBe(1);
        const st = useSecondaryUnionState("t3", "focus");
        st.expand("focus", 1);
        st.expand("focus", 2);
        expect(st.expandedFor("focus")).toEqual([1]); // 2 was rejected
    });

    it("expand() is idempotent (re-adding the same index is a no-op)", () => {
        const st = useSecondaryUnionState("t4", "focus");
        st.expand("focus", 1);
        st.expand("focus", 1);
        expect(st.expandedFor("focus")).toEqual([1]);
    });

    it("collapse() removes the entry", () => {
        const st = useSecondaryUnionState("t5", "focus");
        st.expand("focus", 1);
        st.collapse("focus", 1);
        expect(st.expandedFor("focus")).toEqual([]);
        expect(st.byPerson.has("focus")).toBe(false);
    });

    it("reset() clears every person's expansions", () => {
        const st = useSecondaryUnionState("t6", "focus");
        st.expand("focus", 1);
        st.expand("partner", 0);
        expect(st.byPerson.size).toBe(2);
        st.reset();
        expect(st.byPerson.size).toBe(0);
    });

    it("persistence survives a fresh hook instantiation against the same key", () => {
        const st1 = useSecondaryUnionState("t7", "focus");
        st1.expand("focus", 1);
        const st2 = useSecondaryUnionState("t7", "focus");
        expect(st2.expandedFor("focus")).toEqual([1]);
    });

    it("storage key shape: `<prefix>:<treeId>:<focusId>`", () => {
        expect(secondaryUnionStorageKey("tA", "pA")).toMatch(
            /^fte\.family-view\.secondary-union\.v1:tA:pA$/,
        );
    });

    it("expandedFor() ignores corrupt-localStorage rows past the cap", () => {
        // Write a value with 3 indices directly to localStorage, then
        // bring up a fresh hook against it.
        const key = secondaryUnionStorageKey("corrupt", "focus");
        localStorage.setItem(key, JSON.stringify({ byPerson: { focus: [1, 2, 3] } }));
        const st = useSecondaryUnionState("corrupt", "focus");
        // honour the cap on read — only the first sorted entry surfaces.
        expect(st.expandedFor("focus")).toEqual([1]);
    });
});

describe("subset.selectBoundedSubset — expandedSecondaryUnions pull-in", () => {
    it("with no expansion: secondary partner + secondary kid stay hidden", () => {
        const { tree, focus, primaryMate, secondaryMate, pKid, sKid } = twoUnionFocus();
        const subset = selectBoundedSubset(tree, focus);
        expect(subset.visible.has(focus)).toBe(true);
        expect(subset.visible.has(primaryMate)).toBe(true);
        expect(subset.visible.has(pKid)).toBe(true);
        // Wave-1 behaviour: secondary mate + kid hidden until expanded.
        expect(subset.visible.has(secondaryMate)).toBe(false);
        expect(subset.visible.has(sKid)).toBe(false);
    });

    it("expanding the secondary union pulls in both the partner and its kids", () => {
        const { tree, focus, secondaryMate, sKid, secondaryCoupleIdx } = twoUnionFocus();
        const expandedSecondaryUnions = new Map<string, ReadonlySet<number>>([
            [focus, new Set([secondaryCoupleIdx])],
        ]);
        const subset = selectBoundedSubset(tree, focus, { expandedSecondaryUnions });
        expect(subset.visible.has(secondaryMate)).toBe(true);
        expect(subset.rank.get(secondaryMate)).toBe(0);
        expect(subset.visible.has(sKid)).toBe(true);
        expect(subset.rank.get(sKid)).toBe(1);
    });

    it("idempotent: same person + same coupleIndex pulled in once", () => {
        const { tree, focus, secondaryMate, secondaryCoupleIdx } = twoUnionFocus();
        const set = new Set([secondaryCoupleIdx, secondaryCoupleIdx]); // Set dedupes
        const expandedSecondaryUnions = new Map<string, ReadonlySet<number>>([[focus, set]]);
        const subset = selectBoundedSubset(tree, focus, { expandedSecondaryUnions });
        expect(subset.visible.has(secondaryMate)).toBe(true);
    });

    it("stale coupleIndex (out-of-bounds): no-op, no crash", () => {
        const { tree, focus } = twoUnionFocus();
        const expandedSecondaryUnions = new Map<string, ReadonlySet<number>>([
            [focus, new Set([999])],
        ]);
        const subset = selectBoundedSubset(tree, focus, { expandedSecondaryUnions });
        // Focus + primary mate + primary kid still visible; nothing else.
        expect(subset.visible.size).toBe(3);
    });
});

describe("computeLayout — secondary-union end-to-end render", () => {
    it("emits two UnionAnchors when a secondary union is expanded for the focus", () => {
        const { tree, focus, secondaryCoupleIdx } = twoUnionFocus();
        const expandedSecondaryUnions = new Map<string, ReadonlySet<number>>([
            [focus, new Set([secondaryCoupleIdx])],
        ]);
        const layout = computeLayout(tree, focus, { expandedSecondaryUnions });
        const focusAnchors = layout.anchors.filter((a) => a.partnerIds.includes(focus));
        // Both unions land as UnionAnchors because `emitAnchorsAndEdges`
        // walks tree.couples directly — once both partners are visible
        // at the same rank, the anchor falls out automatically.
        expect(focusAnchors.length).toBe(2);
    });

    it("flag off-equivalent (no expansion map): only one UnionAnchor (primary)", () => {
        const { tree, focus } = twoUnionFocus();
        const layout = computeLayout(tree, focus);
        const focusAnchors = layout.anchors.filter((a) => a.partnerIds.includes(focus));
        expect(focusAnchors.length).toBe(1);
    });

    it("secondary kid lands at rank+1 below the secondary couple's bus", () => {
        const { tree, focus, sKid, secondaryCoupleIdx } = twoUnionFocus();
        const expandedSecondaryUnions = new Map<string, ReadonlySet<number>>([
            [focus, new Set([secondaryCoupleIdx])],
        ]);
        const layout = computeLayout(tree, focus, { expandedSecondaryUnions });
        const sKidNode = layout.nodes.get(sKid);
        expect(sKidNode).toBeDefined();
        if (!sKidNode) return;
        expect(sKidNode.rank).toBe(1);
        // Bus / stub edges exist for the secondary union too.
        const secondaryStubEdges = layout.edges.filter(
            (e) => e.id.startsWith("stub:") && e.persons.includes(sKid),
        );
        expect(secondaryStubEdges.length).toBeGreaterThanOrEqual(1);
    });
});
