/*
 * FamilyTreeEditor - unit tests for Wright's-formula consanguinity
 * walker (Phase 6b). Schema-3.4.0 derived feature; no schema bump
 * by itself but COI computation drives the consanguinity overlay.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";

import { computeAncestorOverlap } from "$lib/domain/consanguinity";
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
