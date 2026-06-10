/*
 * FamilyTreeEditor - unit tests for Wright's-formula consanguinity
 * walker (Phase 6b). Schema-3.4.0 derived feature; no schema bump
 * by itself but COI computation drives the consanguinity overlay.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";

import {
    computeAncestorOverlap,
    formatCoiPercent,
    formatCoi,
    COI_DISPLAY_THRESHOLD,
} from "$lib/domain/consanguinity";
import type { ParentRef, Person, Tree } from "$lib/domain/types";

function p(id: string, parents?: ParentRef[]): Person {
    const out: Person = {
        id,
        given: id,
        surname: "x",
        gender: "u",
        spouseIds: [],
        display: "z1",
    };
    if (parents !== undefined) out.parentIds = parents;
    return out;
}

function tree(people: Person[], rootId = people[0]!.id, editRev = 0): Tree {
    const map: Record<string, Person> = {};
    for (const person of people) map[person.id] = person;
    return {
        id: "t",
        name: "test",
        rootId,
        people: map,
        couples: [],
        unions: [],
        editRev,
        updatedAt: 0,
    };
}

describe("computeAncestorOverlap — no consanguinity", () => {
    it("returns EMPTY when person has no parents", () => {
        const t = tree([p("A")]);
        const out = computeAncestorOverlap(t, "A");
        expect(out.coi).toBeUndefined();
        expect(out.duplicates).toEqual([]);
    });

    it("returns EMPTY when person has only one parent", () => {
        const t = tree([p("M"), p("A", [{ personId: "M" }])]);
        const out = computeAncestorOverlap(t, "A");
        expect(out.coi).toBeUndefined();
        expect(out.duplicates).toEqual([]);
    });

    it("returns EMPTY when parents share no ancestors", () => {
        const t = tree([p("M"), p("F"), p("A", [{ personId: "M" }, { personId: "F" }])]);
        const out = computeAncestorOverlap(t, "A");
        expect(out.coi).toBeUndefined();
        expect(out.duplicates).toEqual([]);
    });
});

describe("computeAncestorOverlap — canonical COI values", () => {
    it("full sibling pair offspring → 1/4 (parents share both grandparents)", () => {
        //         GM   GF
        //          \   /
        //          M   F     (M and F are full siblings)
        //           \ /
        //            A
        // Parents M, F share both GM and GF at distance 1.
        // Wright contribution from each common ancestor: (1/2)^(1+1+1) = 1/8.
        // Two common ancestors → COI = 1/4.
        const t = tree([
            p("GM"),
            p("GF"),
            p("M", [{ personId: "GM" }, { personId: "GF" }]),
            p("F", [{ personId: "GM" }, { personId: "GF" }]),
            p("A", [{ personId: "M" }, { personId: "F" }]),
        ]);
        const out = computeAncestorOverlap(t, "A");
        expect(out.coi).toBeCloseTo(0.25, 8);
        expect([...out.duplicates].sort()).toEqual(["GF", "GM"]);
    });

    it("first cousins offspring → 1/16 (one shared great-grandparent pair)", () => {
        // Standard pedigree: A1, A2 are siblings (share parents GM/GF);
        // each has a child M, F; M and F are first cousins; their kid X has COI = 1/16.
        // Common ancestors at distance d=2 from each of M, F: GM and GF.
        // Each → (1/2)^(2+2+1) = 1/32. Two → 1/16.
        const t = tree([
            p("GM"),
            p("GF"),
            p("A1", [{ personId: "GM" }, { personId: "GF" }]),
            p("A2", [{ personId: "GM" }, { personId: "GF" }]),
            p("A1S"), // spouse of A1
            p("A2S"), // spouse of A2
            p("M", [{ personId: "A1" }, { personId: "A1S" }]),
            p("F", [{ personId: "A2" }, { personId: "A2S" }]),
            p("X", [{ personId: "M" }, { personId: "F" }]),
        ]);
        const out = computeAncestorOverlap(t, "X");
        expect(out.coi).toBeCloseTo(1 / 16, 8);
        expect([...out.duplicates].sort()).toEqual(["GF", "GM"]);
    });

    it("half-sibling parents → COI = 1/8 (one shared grandparent)", () => {
        // GM is shared parent of M and F; M's other parent is X1, F's other parent is X2.
        // COI = (1/2)^(1+1+1) = 1/8.
        const t = tree([
            p("GM"),
            p("X1"),
            p("X2"),
            p("M", [{ personId: "GM" }, { personId: "X1" }]),
            p("F", [{ personId: "GM" }, { personId: "X2" }]),
            p("A", [{ personId: "M" }, { personId: "F" }]),
        ]);
        const out = computeAncestorOverlap(t, "A");
        expect(out.coi).toBeCloseTo(1 / 8, 8);
        expect(out.duplicates).toEqual(["GM"]);
    });
});

describe("computeAncestorOverlap — extra hand-computed pedigrees", () => {
    it("parent/offspring incest → COI = 1/4 (parent at distance 0 to self, 1 to grandchild via other parent)", () => {
        // P is parent of M; P also partners with M to produce A.
        // Parents of A are M and P. Common ancestor: P, reached
        // by M at distance 1 and by P at distance 0. Wright term:
        // (1/2)^(0+1+1) = 1/4. Textbook parent/offspring COI.
        const t = tree([
            p("P"),
            p("M", [{ personId: "P" }]),
            p("A", [{ personId: "M" }, { personId: "P" }]),
        ]);
        const out = computeAncestorOverlap(t, "A");
        expect(out.coi).toBeCloseTo(0.25, 10);
        expect(out.duplicates).toEqual(["P"]);
    });

    it("double first cousins → COI = 1/8 (both grandparent pairs shared)", () => {
        // Two unrelated couples GM1/GF1 and GM2/GF2 each have two
        // children: A1, A2 from couple 1; B1, B2 from couple 2.
        // A1 marries B1 to make M; A2 marries B2 to make F.
        // M and F share all four grandparents at distance 2 each.
        // Each common ancestor: (1/2)^(2+2+1) = 1/32. Four ancestors → 4/32 = 1/8.
        const t = tree([
            p("GM1"),
            p("GF1"),
            p("GM2"),
            p("GF2"),
            p("A1", [{ personId: "GM1" }, { personId: "GF1" }]),
            p("A2", [{ personId: "GM1" }, { personId: "GF1" }]),
            p("B1", [{ personId: "GM2" }, { personId: "GF2" }]),
            p("B2", [{ personId: "GM2" }, { personId: "GF2" }]),
            p("M", [{ personId: "A1" }, { personId: "B1" }]),
            p("F", [{ personId: "A2" }, { personId: "B2" }]),
            p("X", [{ personId: "M" }, { personId: "F" }]),
        ]);
        const out = computeAncestorOverlap(t, "X");
        expect(out.coi).toBeCloseTo(1 / 8, 10);
        expect([...out.duplicates].sort()).toEqual(["GF1", "GF2", "GM1", "GM2"]);
    });

    it("deep precision boundary: 10-generation common ancestor sums exactly", () => {
        // Build a long-spine pedigree: GA -> p1 -> p2 -> ... -> p10 on one
        // side, GA -> q1 -> q2 -> ... -> q10 on the other, then a child of
        // p10 and q10. ancestorDistances treats each parent (p10, q10) as
        // distance 0; GA is then at distance 10 along each spine, so the
        // Wright contribution is (1/2)^(10+10+1) = 2^-21. The value is
        // exactly representable in float64; any accumulation-order or
        // 2^-n precision bug would surface as a deviation past ~1e-15.
        const people: Person[] = [p("GA")];
        for (let i = 1; i <= 10; i += 1) {
            const parentId = i === 1 ? "GA" : `p${(i - 1).toString()}`;
            people.push(p(`p${i.toString()}`, [{ personId: parentId }]));
        }
        for (let i = 1; i <= 10; i += 1) {
            const parentId = i === 1 ? "GA" : `q${(i - 1).toString()}`;
            people.push(p(`q${i.toString()}`, [{ personId: parentId }]));
        }
        people.push(p("X", [{ personId: "p10" }, { personId: "q10" }]));
        const t = tree(people);
        const out = computeAncestorOverlap(t, "X");
        // expected = (1/2)^(10+10+1) = 2^-21
        expect(out.coi).toBe(Math.pow(2, -21));
        expect(out.duplicates).toEqual(["GA"]);
    });
});

describe("formatCoiPercent — display rounding for canonical Wright values", () => {
    it("returns empty string for undefined / zero / negative COI", () => {
        expect(formatCoiPercent(undefined)).toBe("");
        expect(formatCoiPercent(0)).toBe("");
        expect(formatCoiPercent(-0.01)).toBe("");
    });

    it("renders 1/4 (parent-offspring or full-sib incest) as '25%'", () => {
        // strip trailing .0 so 25.0% renders as 25%
        expect(formatCoiPercent(0.25)).toBe("25%");
    });

    it("renders 1/8 (half-sib parents) as '12.5%', not '13%'", () => {
        // regression for the user-reported rounding error: the old formatter
        // used Math.round in the >= 10% branch, mangling 12.5% to 13%
        expect(formatCoiPercent(0.125)).toBe("12.5%");
    });

    it("renders 1/16 (first cousins) as '6.25%' with two-decimal precision", () => {
        expect(formatCoiPercent(0.0625)).toBe("6.25%");
    });

    it("renders 1/32 (second cousins) as '3.13%' (two decimals, banker-safe)", () => {
        // 1/32 = 3.125; toFixed(2) yields "3.13" (round-half-to-even on this engine)
        expect(formatCoiPercent(1 / 32)).toBe("3.13%");
    });

    it("renders 1/64 (third cousins) as '1.56%'", () => {
        expect(formatCoiPercent(1 / 64)).toBe("1.56%");
    });

    it("renders sub-1% canonical 1/128 (fourth cousins) as '0.78%'", () => {
        expect(formatCoiPercent(1 / 128)).toBe("0.78%");
    });

    it("preserves tiny but nonzero COIs instead of collapsing to '0.00%'", () => {
        // 0.00004 -> pct = 0.004 -> below 0.005% threshold.
        // formatter renders these as "<0.01%" rather than the original toFixed(2) "0.00%"
        // or the interim toPrecision(1) "5e-10%"-style scientific notation
        expect(formatCoiPercent(0.00004)).toBe("<0.01%");
        expect(formatCoiPercent(5e-12)).toBe("<0.01%");
    });
});

describe("formatCoi — 4-decimal raw format, leading zero stripped", () => {
    it("returns empty string for undefined / zero / negative COI", () => {
        expect(formatCoi(undefined)).toBe("");
        expect(formatCoi(0)).toBe("");
        expect(formatCoi(-0.01)).toBe("");
    });

    it("renders canonical Wright values with leading zero stripped", () => {
        expect(formatCoi(0.25)).toBe(".2500");
        expect(formatCoi(0.125)).toBe(".1250");
        expect(formatCoi(0.0625)).toBe(".0625");
        expect(formatCoi(1 / 32)).toBe(".0313");
        expect(formatCoi(1 / 64)).toBe(".0156");
    });

    it("preserves whole-number-part 1.0 unchanged (max-coi proband)", () => {
        // when coi == 1 the leading char isn't "0", so leave it alone
        expect(formatCoi(1)).toBe("1.0000");
    });

    it("clamps sub-rounding values to '<.0001' instead of '.0000'", () => {
        expect(formatCoi(0.00001)).toBe("<.0001");
        expect(formatCoi(5e-12)).toBe("<.0001");
    });
});

describe("COI_DISPLAY_THRESHOLD — production badge gating", () => {
    it("sits at 0.01 (first/second/third cousins all light up; ancient noise stays hidden)", () => {
        expect(COI_DISPLAY_THRESHOLD).toBe(0.01);
        expect(0.0625 > COI_DISPLAY_THRESHOLD).toBe(true); // first cousins
        expect(1 / 64 > COI_DISPLAY_THRESHOLD).toBe(true); // third cousins
        expect(1 / 128 > COI_DISPLAY_THRESHOLD).toBe(false); // fourth cousins
    });
});

describe("computeAncestorOverlap — memoisation", () => {
    it("returns the same object on a second call when editRev unchanged", () => {
        const t = tree([
            p("GM"),
            p("GF"),
            p("M", [{ personId: "GM" }, { personId: "GF" }]),
            p("F", [{ personId: "GM" }, { personId: "GF" }]),
            p("A", [{ personId: "M" }, { personId: "F" }]),
        ]);
        const a = computeAncestorOverlap(t, "A");
        const b = computeAncestorOverlap(t, "A");
        expect(b).toBe(a);
    });
});

describe("computeAncestorOverlap — phase 4 breakdown", () => {
    // The breakdown is the new optional return field. Existing tests
    // already cover the scalar; these confirm rows sum to the scalar and
    // are correctly shaped + ordered.

    it("EMPTY result omits the breakdown entirely", () => {
        const t = tree([p("M"), p("F"), p("A", [{ personId: "M" }, { personId: "F" }])]);
        const out = computeAncestorOverlap(t, "A");
        expect(out.breakdown).toBeUndefined();
    });

    it("full-sibling-offspring breakdown sums to the scalar coi", () => {
        const t = tree([
            p("GM"),
            p("GF"),
            p("M", [{ personId: "GM" }, { personId: "GF" }]),
            p("F", [{ personId: "GM" }, { personId: "GF" }]),
            p("A", [{ personId: "M" }, { personId: "F" }]),
        ]);
        const out = computeAncestorOverlap(t, "A");
        const rows = out.breakdown ?? [];
        // two ancestors (GF, GM); each contributes one (di=1, dj=1, c=1/8) row
        expect(rows.length).toBe(2);
        const sum = rows.reduce((acc, row) => acc + row.contribution, 0);
        expect(sum).toBeCloseTo(out.coi ?? 0, 12);
        for (const row of rows) {
            expect(row.di).toBe(1);
            expect(row.dj).toBe(1);
            expect(row.contribution).toBeCloseTo(1 / 8, 12);
        }
        // stable order: GF before GM (ancestor id asc)
        expect(rows.map((r) => r.ancestorId)).toEqual(["GF", "GM"]);
    });

    it("first-cousin offspring breakdown sums to 1/16", () => {
        const t = tree([
            p("GM"),
            p("GF"),
            p("A1", [{ personId: "GM" }, { personId: "GF" }]),
            p("A2", [{ personId: "GM" }, { personId: "GF" }]),
            p("A1S"),
            p("A2S"),
            p("M", [{ personId: "A1" }, { personId: "A1S" }]),
            p("F", [{ personId: "A2" }, { personId: "A2S" }]),
            p("X", [{ personId: "M" }, { personId: "F" }]),
        ]);
        const out = computeAncestorOverlap(t, "X");
        const rows = out.breakdown ?? [];
        expect(rows.length).toBe(2);
        for (const row of rows) {
            expect(row.di).toBe(2);
            expect(row.dj).toBe(2);
            expect(row.contribution).toBeCloseTo(1 / 32, 12);
        }
        const sum = rows.reduce((acc, row) => acc + row.contribution, 0);
        expect(sum).toBeCloseTo(out.coi ?? 0, 12);
        expect(sum).toBeCloseTo(1 / 16, 12);
    });
});
