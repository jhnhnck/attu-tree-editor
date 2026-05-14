/*
 * FamilyTreeEditor - Phase 2 family-view multi-union + orientation tests.
 *
 * Covers the Phase 2 DoD:
 *   - genealogy-conventional orientation (father-left / mother-right,
 *     same-gender tie-break by personId asc),
 *   - primary-union model: visible subset includes the primary partner;
 *     non-primary partners stay hidden until expanded,
 *   - `˅` switch (primary-union override) flips which partner / children
 *     block renders for a multi-union person,
 *   - N>2 IR-shape fallback: resolveRenderablePair emits a
 *     `multi-partner-unsupported` finding and returns the first-two pair,
 *   - single-parent degenerate anchor stays sane,
 *   - non-primary-union person can still be selected after `+` expand.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import {
    FamilyViewEngine,
    clearAllPrimaryUnion,
    orientByIds,
    orientCouple,
    resolveRenderablePair,
    usePrimaryUnionState,
} from "$lib/layout/engines/family-view";
import { onFinding, type RuntimeFinding } from "$lib/domain/findings";
import type { CoupleRecord, Person, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function withPrimary(
    t: Tree,
    coupleIndex: number,
    flags: { isPrimary?: boolean; isCurrent?: boolean },
): Tree {
    const couple = t.couples[coupleIndex]!;
    const next: CoupleRecord = { ...couple, ...flags };
    const couples = t.couples.slice();
    couples[coupleIndex] = next;
    return { ...t, couples };
}

beforeEach(() => {
    clearAllPrimaryUnion();
});

// ---------------------------------------------------------------------------
// orientation
// ---------------------------------------------------------------------------

describe("Phase 2 — genealogy-conventional orientation", () => {
    it("puts father (m) on the left and mother (f) on the right", () => {
        let t = createTree("o", blank("Focus"));
        const mom = addPerson(t, blank("Mom", "f"));
        t = mom.tree;
        const dad = addPerson(t, blank("Dad", "m"));
        t = dad.tree;
        const linked = linkSpouse(t, mom.id, dad.id);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        // CoupleRecord stored mom first; orientation should still put dad left.
        const oriented = orientCouple(t, t.couples[0]!, 0);
        expect(oriented.leftId).toBe(dad.id);
        expect(oriented.rightId).toBe(mom.id);
    });

    it("falls back to personId-ascending for same-gender pairs", () => {
        let t = createTree("o", blank("Focus"));
        const a = addPerson(t, blank("Aria", "f"));
        t = a.tree;
        const b = addPerson(t, blank("Brigid", "f"));
        t = b.tree;
        const linked = linkSpouse(t, a.id, b.id);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        const oriented = orientCouple(t, t.couples[0]!, 0);
        const lower = a.id <= b.id ? a.id : b.id;
        const higher = a.id <= b.id ? b.id : a.id;
        expect(oriented.leftId).toBe(lower);
        expect(oriented.rightId).toBe(higher);
    });

    it("treats unknown gender like 'u': tie-break by personId", () => {
        let t = createTree("o", blank("Focus"));
        const a = addPerson(t, blank("U1", "u"));
        t = a.tree;
        const b = addPerson(t, blank("U2", "u"));
        t = b.tree;
        const oriented = orientByIds(t, b.id, a.id);
        expect(oriented.leftId <= oriented.rightId).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// primary union + visible subset
// ---------------------------------------------------------------------------

describe("Phase 2 — primary-union default & switching", () => {
    /**
     * Build: Focus has 2 wives (W1 primary, W2 non-primary). W1 has 1 kid
     * with focus; W2 has 2 kids with focus.
     */
    function fixture(): {
        tree: Tree;
        w1: string;
        w2: string;
        kidW1: string;
        kidW2a: string;
        kidW2b: string;
    } {
        let t = createTree("two-wife", blank("Focus", "m"));
        const w1 = addPerson(t, blank("Wife1", "f"));
        t = w1.tree;
        const w2 = addPerson(t, blank("Wife2", "f"));
        t = w2.tree;
        const kidW1 = addPerson(t, blank("KidA"));
        t = kidW1.tree;
        const kidW2a = addPerson(t, blank("KidB"));
        t = kidW2a.tree;
        const kidW2b = addPerson(t, blank("KidC"));
        t = kidW2b.tree;
        // Spouses.
        for (const sp of [w1.id, w2.id]) {
            const linked = linkSpouse(t, ROOT_ID, sp);
            if (!linked.ok) throw new Error(linked.error);
            t = linked.value;
        }
        // Children of W1 union.
        const c1 = t.couples[0]!;
        const c1b = t.couples[1]!;
        const couples: CoupleRecord[] = [
            { ...c1, childIds: [kidW1.id], isPrimary: true },
            { ...c1b, childIds: [kidW2a.id, kidW2b.id], isPrimary: false },
        ];
        t = { ...t, couples };
        // Hook children to focus + each wife as a parent.
        for (const [kid, mom] of [
            [kidW1.id, w1.id],
            [kidW2a.id, w2.id],
            [kidW2b.id, w2.id],
        ] as const) {
            let l = linkParent(t, kid, ROOT_ID);
            if (!l.ok) throw new Error(l.error);
            t = l.value;
            l = linkParent(t, kid, mom);
            if (!l.ok) throw new Error(l.error);
            t = l.value;
        }
        return { tree: t, w1: w1.id, w2: w2.id, kidW1: kidW1.id, kidW2a: kidW2a.id, kidW2b: kidW2b.id };
    }

    it("default subset includes primary partner + primary union's children only", () => {
        const f = fixture();
        const engine = new FamilyViewEngine();
        const out = engine.layout({ tree: f.tree, focus: ROOT_ID });
        expect(out.nodes.has(f.w1)).toBe(true);
        expect(out.nodes.has(f.kidW1)).toBe(true);
        // Non-primary partner & her kids stay hidden.
        expect(out.nodes.has(f.w2)).toBe(false);
        expect(out.nodes.has(f.kidW2a)).toBe(false);
        expect(out.nodes.has(f.kidW2b)).toBe(false);
    });

    it("primary-union override swaps which partner + children block render", () => {
        const f = fixture();
        const engine = new FamilyViewEngine();
        const overrides = new Map<string, number>([[ROOT_ID, 1]]); // pick W2 union
        const out = engine.layout({
            tree: f.tree,
            focus: ROOT_ID,
            options: { primaryUnionOverrides: overrides },
        });
        expect(out.nodes.has(f.w2)).toBe(true);
        expect(out.nodes.has(f.kidW2a)).toBe(true);
        expect(out.nodes.has(f.kidW2b)).toBe(true);
        // W1 & her kid hide.
        expect(out.nodes.has(f.w1)).toBe(false);
        expect(out.nodes.has(f.kidW1)).toBe(false);
    });

    it("multi-union mate info surfaces a picker entry on the partner card", () => {
        const f = fixture();
        const engine = new FamilyViewEngine();
        const out = engine.layout({ tree: f.tree, focus: ROOT_ID });
        // W1 (the visible partner) gets a picker because her mate (focus) has 2 unions.
        const w1Mate = out.multiUnionMates.get(f.w1);
        expect(w1Mate).toBeDefined();
        expect(w1Mate!.mateId).toBe(ROOT_ID);
        // Alternates list the non-primary union with W2 as partner.
        const altPartners = w1Mate!.alternates.map((a) => a.partnerId);
        expect(altPartners).toEqual([f.w2]);
    });

    it("`+` expansion on focus pulls in non-primary partner + her kids", () => {
        const f = fixture();
        const engine = new FamilyViewEngine();
        const out = engine.layout({
            tree: f.tree,
            focus: ROOT_ID,
            options: { expanded: new Set([ROOT_ID]) },
        });
        // Non-primary partner now visible because revealChildren pulls
        // in the other-parent of each newly placed child.
        expect(out.nodes.has(f.w2)).toBe(true);
        expect(out.nodes.has(f.kidW2a)).toBe(true);
        expect(out.nodes.has(f.kidW2b)).toBe(true);
    });

    it("isPrimary=false is honoured when isPrimary=true is set elsewhere", () => {
        // Reorder: build the same fixture but with isPrimary on the SECOND couple.
        const f = fixture();
        let tree = f.tree;
        tree = withPrimary(tree, 0, { isPrimary: false });
        tree = withPrimary(tree, 1, { isPrimary: true });
        const engine = new FamilyViewEngine();
        const out = engine.layout({ tree, focus: ROOT_ID });
        expect(out.nodes.has(f.w2)).toBe(true);
        expect(out.nodes.has(f.w1)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// N>2 fallback finding
// ---------------------------------------------------------------------------

describe("Phase 2 — N>2 IR-shape fallback", () => {
    it("renders first-two and emits a multi-partner-unsupported finding", () => {
        let t = createTree("n3", blank("A"));
        const b = addPerson(t, blank("B"));
        t = b.tree;
        const c = addPerson(t, blank("C"));
        t = c.tree;
        const seen: RuntimeFinding[] = [];
        const unsub = onFinding((f) => seen.push(f));
        try {
            const pair = resolveRenderablePair(t, {
                id: "synthetic:n3",
                partnerIds: [ROOT_ID, b.id, c.id],
            });
            expect(pair).not.toBeNull();
            // First two only, plus orientation (all `u` here → personId asc).
            const ids = [pair!.leftId, pair!.rightId];
            expect(ids).toContain(ROOT_ID);
            expect(ids).toContain(b.id);
            expect(ids).not.toContain(c.id);
        } finally {
            unsub();
        }
        const finding = seen.find((f) => f.kind === "multi-partner-unsupported");
        expect(finding).toBeDefined();
        expect(finding!.data?.partnerCount).toBe(3);
    });

    it("returns single-partner degenerate for N=1 without a finding", () => {
        const t = createTree("n1", blank("Solo"));
        const seen: RuntimeFinding[] = [];
        const unsub = onFinding((f) => seen.push(f));
        try {
            const pair = resolveRenderablePair(t, {
                id: "synthetic:n1",
                partnerIds: [ROOT_ID],
            });
            expect(pair).toEqual({ leftId: ROOT_ID, rightId: undefined });
        } finally {
            unsub();
        }
        expect(seen.find((f) => f.kind === "multi-partner-unsupported")).toBeUndefined();
    });

    it("returns null for N=0", () => {
        const t = createTree("n0", blank("X"));
        const pair = resolveRenderablePair(t, { id: "syn", partnerIds: [] });
        expect(pair).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// single-parent + expansion interaction
// ---------------------------------------------------------------------------

describe("Phase 2 — single-parent degenerate anchor with expansion", () => {
    it("a single-parent child renders under the lone parent without breaking + expand", () => {
        // Focus has one parent only; one child with one parent (Focus).
        let t = createTree("sp", blank("Focus"));
        const mom = addPerson(t, blank("Mom", "f"));
        t = mom.tree;
        const child = addPerson(t, blank("Kid"));
        t = child.tree;
        let l = linkParent(t, ROOT_ID, mom.id);
        if (!l.ok) throw new Error(l.error);
        t = l.value;
        l = linkParent(t, child.id, ROOT_ID);
        if (!l.ok) throw new Error(l.error);
        t = l.value;

        const engine = new FamilyViewEngine();
        const out = engine.layout({
            tree: t,
            focus: ROOT_ID,
            options: { expanded: new Set([ROOT_ID]) },
        });
        // Mom + child render; child has a degenerate anchor (1 partner).
        expect(out.nodes.has(mom.id)).toBe(true);
        expect(out.nodes.has(child.id)).toBe(true);
        const soloAnchors = out.anchors.filter((a) => a.partnerIds.length === 1);
        expect(soloAnchors.length).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// primary-union storage hook round-trip
// ---------------------------------------------------------------------------

describe("Phase 2 — primary-union localStorage round-trip", () => {
    it("setPrimary survives a fresh hook instantiation under the same (treeId, focusId)", () => {
        const a = usePrimaryUnionState("tree-1", "person-A");
        a.setPrimary("person-X", 3);
        // Fresh instance reads back the override.
        const b = usePrimaryUnionState("tree-1", "person-A");
        expect(b.primaryFor("person-X")).toBe(3);
    });

    it("reset clears all overrides for the (treeId, focusId) pair", () => {
        const a = usePrimaryUnionState("tree-2", "person-B");
        a.setPrimary("person-Y", 1);
        a.reset();
        const b = usePrimaryUnionState("tree-2", "person-B");
        expect(b.overrides.size).toBe(0);
    });
});
