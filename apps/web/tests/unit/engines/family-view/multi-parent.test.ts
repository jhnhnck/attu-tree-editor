/*
 * FamilyTreeEditor - Phase 2b.2 family-view multi-parent + half-sibling tests.
 *
 * Covers:
 *   - 3-parent child emits one anchor with all 3 partnerIds plus per-parent
 *     drops into a parent-gather pill (3 parent→pill edges + 1 pill→child).
 *   - Adopted parent edge picks up role: "adopted" (Phase 1 stroke palette
 *     getting real data from parentIds[i].pedi).
 *   - Half-sibling drop carries role: "half" when the child's parentIds
 *     don't include both partners of the CoupleRecord.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { FamilyViewEngine } from "$lib/layout/engines/family-view";
import type { Person, ParentRef, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function attachParents(t: Tree, childId: string, refs: ParentRef[]): Tree {
    const child = t.people[childId];
    if (!child) throw new Error(`missing ${childId}`);
    return {
        ...t,
        people: { ...t.people, [childId]: { ...child, parentIds: refs } },
    };
}

describe("Phase 2b.2 family-view multi-parent + half-sibling", () => {
    it("emits a multi-anchor + parent-gather edges for a 3-parent child", () => {
        let t = createTree("multi", blank("Kid"));
        const kid = ROOT_ID;
        const a = addPerson(t, blank("A", "f"));
        t = a.tree;
        const b = addPerson(t, blank("B", "m"));
        t = b.tree;
        const c = addPerson(t, blank("C", "u"));
        t = c.tree;
        t = attachParents(t, kid, [
            { personId: a.id, role: "mother", pedi: "birth" },
            { personId: b.id, role: "father", pedi: "birth" },
            { personId: c.id, role: "parent", pedi: "adopted" },
        ]);

        const engine = new FamilyViewEngine();
        const out = engine.layout({ tree: t, focus: kid });

        // The multi-parent anchor should list all 3 partners.
        const multi = out.anchors.find((u) => u.id.startsWith("union:multi:"));
        expect(multi).toBeDefined();
        expect([...multi!.partnerIds].sort()).toEqual([a.id, b.id, c.id].sort());
        expect(multi!.childIds).toEqual([kid]);

        // 3 parent→pill drops + 1 pill→child = 4 edges from this anchor.
        const dropEdges = out.edges.filter((e) => e.id.startsWith(`drop:${multi!.id}|`));
        expect(dropEdges).toHaveLength(4);

        // Adopted parent C's drop should carry role: "adopted".
        const cDrop = dropEdges.find((e) => e.id.endsWith(`${c.id}-pill`));
        expect(cDrop?.role).toBe("adopted");

        // Birth parents (A, B) keep role: "blood".
        const aDrop = dropEdges.find((e) => e.id.endsWith(`${a.id}-pill`));
        const bDrop = dropEdges.find((e) => e.id.endsWith(`${b.id}-pill`));
        expect(aDrop?.role).toBe("blood");
        expect(bDrop?.role).toBe("blood");
    });

    it("emits role: 'half' for a half-sibling drop", () => {
        // Father F + Mother M have child K1. F + OtherMom O have child K2.
        // K2 appears in F+M's couple.childIds (we'll splice it in for the
        // test) but K2's actual parentIds only mention F and O — so the
        // drop from F+M anchor to K2 should render as "half".
        let t = createTree("half", blank("F", "m"));
        const f = ROOT_ID;
        const addM = addPerson(t, blank("M", "f"));
        t = addM.tree;
        const m = addM.id;
        const linkedFM = linkSpouse(t, f, m);
        if (!linkedFM.ok) throw new Error(linkedFM.error);
        t = linkedFM.value;
        const addK1 = addPerson(t, blank("K1"));
        t = addK1.tree;
        const k1 = addK1.id;
        const l1 = linkParent(t, k1, f);
        if (!l1.ok) throw new Error(l1.error);
        t = l1.value;
        const l2 = linkParent(t, k1, m);
        if (!l2.ok) throw new Error(l2.error);
        t = l2.value;
        const addO = addPerson(t, blank("O", "f"));
        t = addO.tree;
        const o = addO.id;
        const addK2 = addPerson(t, blank("K2"));
        t = addK2.tree;
        const k2 = addK2.id;
        t = attachParents(t, k2, [
            { personId: f, role: "father", pedi: "birth" },
            { personId: o, role: "mother", pedi: "birth" },
        ]);
        // Splice K1 and K2 into the F+M CoupleRecord.childIds. linkParent
        // populates Person.parentIds but does not back-fill the couple
        // record; the family-view per-couple emit loop reads from
        // CoupleRecord.childIds, so the test fixture has to write to both.
        const couples = t.couples.map((c) => ({ ...c, childIds: [...c.childIds, k1, k2] }));
        t = { ...t, couples };

        const engine = new FamilyViewEngine();
        const out = engine.layout({ tree: t, focus: f });

        // Find the F+M anchor.
        const fmAnchor = out.anchors.find(
            (u) =>
                u.partnerIds.length === 2 && u.partnerIds.includes(f) && u.partnerIds.includes(m),
        );
        expect(fmAnchor).toBeDefined();
        // visual-fixup phase 2 #5 collapsed per-child L-drops into one
        // sibling-bus + per-kid stubs. The stub edge carries the
        // per-child role (blood vs half), same as the old drop did.
        // K1 stub is "blood" (shares both parents).
        const k1Stub = out.edges.find((e) => e.id === `stub:${fmAnchor!.id}|${k1}`);
        expect(k1Stub?.role).toBe("blood");
        // K2 stub is "half" (K2's parentIds only include F, not M).
        const k2Stub = out.edges.find((e) => e.id === `stub:${fmAnchor!.id}|${k2}`);
        expect(k2Stub?.role).toBe("half");

        // Bus role: K1 is blood + K2 is half → mixed → bus stays "blood".
        const bus = out.edges.find((e) => e.id === `bus:${fmAnchor!.id}`);
        expect(bus?.role).toBe("blood");
    });

    it("sibling bus carries role 'half' when every child is a half-sibling", () => {
        // F + M are married. F also has kids K1 and K2 from other mothers;
        // both are spliced into the F+M couple record but neither lists M
        // as a parent. All stubs are "half" → bus should be "half" too.
        let t = createTree("half-bus", blank("F", "m"));
        const f = ROOT_ID;
        const addM = addPerson(t, blank("M", "f"));
        t = addM.tree;
        const m = addM.id;
        const linked = linkSpouse(t, f, m);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        // K1 — child of F + another mother O1
        const addO1 = addPerson(t, blank("O1", "f"));
        t = addO1.tree;
        const o1 = addO1.id;
        const addK1 = addPerson(t, blank("K1"));
        t = addK1.tree;
        const k1 = addK1.id;
        t = attachParents(t, k1, [
            { personId: f, role: "father", pedi: "birth" },
            { personId: o1, role: "mother", pedi: "birth" },
        ]);
        // K2 — child of F + another mother O2
        const addO2 = addPerson(t, blank("O2", "f"));
        t = addO2.tree;
        const o2 = addO2.id;
        const addK2 = addPerson(t, blank("K2"));
        t = addK2.tree;
        const k2 = addK2.id;
        t = attachParents(t, k2, [
            { personId: f, role: "father", pedi: "birth" },
            { personId: o2, role: "mother", pedi: "birth" },
        ]);
        // splice both half-kids into the F+M CoupleRecord.childIds
        const couples = t.couples.map((c) =>
            c.leftId === f || c.rightId === f ? { ...c, childIds: [k1, k2] } : c,
        );
        t = { ...t, couples };

        const engine = new FamilyViewEngine();
        const out = engine.layout({ tree: t, focus: f });

        const fmAnchor = out.anchors.find(
            (u) =>
                u.partnerIds.length === 2 && u.partnerIds.includes(f) && u.partnerIds.includes(m),
        );
        expect(fmAnchor).toBeDefined();

        // both stubs are "half"
        const k1Stub = out.edges.find((e) => e.id === `stub:${fmAnchor!.id}|${k1}`);
        const k2Stub = out.edges.find((e) => e.id === `stub:${fmAnchor!.id}|${k2}`);
        expect(k1Stub?.role).toBe("half");
        expect(k2Stub?.role).toBe("half");

        // bus should also be "half" — every child is a half-sibling
        const bus = out.edges.find((e) => e.id === `bus:${fmAnchor!.id}`);
        expect(bus?.role).toBe("half");
    });
});
