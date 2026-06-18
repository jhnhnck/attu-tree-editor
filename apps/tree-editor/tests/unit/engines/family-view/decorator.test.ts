/*
 * FamilyTreeEditor - Phase 5 cardDecorator behaviour tests.
 *
 * Phase 5 (family-view) replaces the Phase 0 stub's identity mapping
 * with real outputs:
 *   - underlineColour: derived from `person.birth?.year`'s century,
 *     hue-rotated so adjacent centuries get adjacent hues and a few
 *     centuries' span produces visible drift,
 *   - shape + fillTone still derived from `person.gender`,
 *   - relationship-vocabulary extension fields still `undefined`
 *     (phase 5 of relationship-vocabulary populates them).
 *
 * Plus an architectural invariant: PersonNode must read only from the
 * decorator's abstract fields; zero `gender ===` branches in the
 * .svelte file. Verified via a regex grep so the test fails if a
 * gender branch reappears anywhere in PersonNode.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decorate } from "$lib/layout/engines/family-view/cardDecorator";
import type { Person } from "$lib/domain/types";

function person(overrides: Partial<Person> & { id: string }): Person {
    return {
        given: "Person",
        surname: "",
        gender: "u",
        spouseIds: [],
        display: "z1",
        ...overrides,
    };
}

describe("cardDecorator — Phase 5 underlineColour", () => {
    it("returns null when birth-year is unknown", () => {
        const d = decorate(person({ id: "p1" }));
        expect(d.underlineColour).toBeNull();
    });

    it("returns null when birth has only era (no year)", () => {
        // HaracalndeDateData allows partial dates; year-absent should not
        // accidentally hash to a hue (would produce a stray underline on
        // era-only cards).
        const d = decorate(
            person({
                id: "p1",
                // @ts-expect-error - intentionally malformed for the test
                birth: { era: "PC" },
            }),
        );
        expect(d.underlineColour).toBeNull();
    });

    it("returns an HSL string for a known birth year", () => {
        const d = decorate(person({ id: "p1", birth: { year: 1500, era: "PC" } }));
        expect(d.underlineColour).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    });

    it("adjacent centuries get adjacent hues (different but close)", () => {
        const c14 = decorate(person({ id: "a", birth: { year: 1450, era: "PC" } }));
        const c15 = decorate(person({ id: "b", birth: { year: 1550, era: "PC" } }));
        expect(c14.underlineColour).not.toEqual(c15.underlineColour);
    });

    it("same century → identical underline", () => {
        const early = decorate(person({ id: "a", birth: { year: 1501, era: "PC" } }));
        const late = decorate(person({ id: "b", birth: { year: 1599, era: "PC" } }));
        expect(early.underlineColour).toEqual(late.underlineColour);
    });

    it("very-far-future years still produce a hue (modulo wrap)", () => {
        // 30° per century, mod 360 — year 200000 → century 2000 → hue 0.
        // Test the contract: any year produces a valid HSL string.
        const d = decorate(person({ id: "p1", birth: { year: 200000, era: "PC" } }));
        expect(d.underlineColour).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    });
});

describe("cardDecorator — Phase 5 shape + tone (unchanged from Phase 0)", () => {
    it("shape: m=square, f=circle, u=diamond", () => {
        expect(decorate(person({ id: "p1", gender: "m" })).shape).toBe("square");
        expect(decorate(person({ id: "p1", gender: "f" })).shape).toBe("circle");
        expect(decorate(person({ id: "p1", gender: "u" })).shape).toBe("diamond");
    });

    it("fillTone: m=sky, f=rose, u=amber", () => {
        expect(decorate(person({ id: "p1", gender: "m" })).fillTone).toBe("sky");
        expect(decorate(person({ id: "p1", gender: "f" })).fillTone).toBe("rose");
        expect(decorate(person({ id: "p1", gender: "u" })).fillTone).toBe("amber");
    });
});

describe("cardDecorator — relationship-vocabulary extension fields (still undefined)", () => {
    it("species / kind / origin / identityFluid / assignedAtBirth default to undefined", () => {
        const d = decorate(person({ id: "p1", gender: "m" }));
        expect(d.species).toBeUndefined();
        expect(d.kind).toBeUndefined();
        expect(d.origin).toBeUndefined();
        expect(d.identityFluid).toBeUndefined();
        expect(d.assignedAtBirth).toBeUndefined();
    });
});

describe("PersonNode — Phase 5 architectural invariant", () => {
    // The DoD says: "cardDecorator is the single source of visual hints;
    // PersonNode has zero `gender ===` branches. (Verified by grep on the
    // touched file.)" — this test is that grep. If a gender branch
    // reappears (e.g. in a Phase-6 hotfix), this fails immediately and
    // points the author at the decorator-extension path instead.
    it("PersonNode.svelte contains zero `gender ===` branches", () => {
        const path = resolve(process.cwd(), "src/lib/components/tree/PersonNode.svelte");
        const src = readFileSync(path, "utf8");
        // Strip comments so the (intentional) doc reference in the
        // refactor commentary doesn't false-positive.
        const stripped = src
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/[^\n]*\n/g, "\n");
        expect(stripped).not.toMatch(/gender\s*===/);
        // Also disallow the inverse comparison.
        expect(stripped).not.toMatch(/gender\s*!==/);
    });
});
