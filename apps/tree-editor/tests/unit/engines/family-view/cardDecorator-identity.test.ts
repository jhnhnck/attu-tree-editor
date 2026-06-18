/*
 * FamilyTreeEditor - cardDecorator tests for the Phase 5 identity / species
 * / kind / origin extensions.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";

import type { Person } from "$lib/domain/types";
import { decorate } from "$lib/layout/engines/family-view/cardDecorator";

function blank(p: Partial<Person>): Person {
    return {
        id: "p1",
        given: "",
        surname: "",
        gender: "u",
        spouseIds: [],
        display: "z1",
        ...p,
    };
}

describe("cardDecorator — shape from identity", () => {
    it("legacy m / f / u codes drive square / circle / diamond", () => {
        expect(decorate(blank({ gender: "m" })).shape).toBe("square");
        expect(decorate(blank({ gender: "f" })).shape).toBe("circle");
        expect(decorate(blank({ gender: "u" })).shape).toBe("diamond");
    });

    it("canonical identity strings drive shape", () => {
        expect(decorate(blank({ gender: { identity: "male" } })).shape).toBe("square");
        expect(decorate(blank({ gender: { identity: "female" } })).shape).toBe("circle");
        expect(decorate(blank({ gender: { identity: "unknown" } })).shape).toBe("diamond");
    });

    it("falls back to AMAB → square when identity is non-canonical", () => {
        const p = blank({ gender: { identity: "agender", assignedAtBirth: "AMAB" } });
        expect(decorate(p).shape).toBe("square");
    });

    it("falls back to AFAB → circle when identity is non-canonical", () => {
        const p = blank({ gender: { identity: "agender", assignedAtBirth: "AFAB" } });
        expect(decorate(p).shape).toBe("circle");
    });

    it("AMAB alone with no identity infers the cis shape (square)", () => {
        // GenderStruct with identity "unknown" but explicit AMAB:
        // the decorator's shape function reads identity first; "unknown"
        // is canonical so it returns diamond. To exercise the AAB
        // fallback the identity must be a non-canonical string.
        const p = blank({ gender: { identity: "x-unset", assignedAtBirth: "AMAB" } });
        expect(decorate(p).shape).toBe("square");
    });
});

describe("cardDecorator — frame from species / kind", () => {
    it("biological kind keeps the default solid frame", () => {
        expect(decorate(blank({ kind: "biological" })).frame).toBe("solid");
    });

    it("mechanical kind switches to dashed", () => {
        expect(decorate(blank({ kind: "mechanical" })).frame).toBe("dashed");
    });

    it("spirit kind switches to double", () => {
        expect(decorate(blank({ kind: "spirit" })).frame).toBe("double");
    });

    it("collective / concept kinds switch to gradient", () => {
        expect(decorate(blank({ kind: "collective" })).frame).toBe("gradient");
        expect(decorate(blank({ kind: "concept" })).frame).toBe("gradient");
    });

    it("dragon species hint flips to double when kind is absent", () => {
        expect(decorate(blank({ species: "dragon" })).frame).toBe("double");
    });

    it("chimera species hint flips to gradient when kind is absent", () => {
        expect(decorate(blank({ species: "chimera" })).frame).toBe("gradient");
    });
});

describe("cardDecorator — corner glyphs from origin / fluid", () => {
    it("origin = summoned emits the summoned glyph", () => {
        expect(decorate(blank({ origin: { kind: "summoned" } })).cornerGlyphs).toContain(
            "summoned",
        );
    });

    it("origin = manufactured emits the manufactured glyph", () => {
        expect(decorate(blank({ origin: { kind: "manufactured" } })).cornerGlyphs).toContain(
            "manufactured",
        );
    });

    it("fluid identity emits the fluid glyph", () => {
        expect(
            decorate(blank({ gender: { identity: "male", fluid: true } })).cornerGlyphs,
        ).toContain("fluid");
    });

    it("origin + fluid stack in deterministic order (origin first)", () => {
        const glyphs = decorate(
            blank({
                origin: { kind: "summoned" },
                gender: { identity: "male", fluid: true },
            }),
        ).cornerGlyphs;
        expect(glyphs).toEqual(["summoned", "fluid"]);
    });

    it("born / no fluid emits no glyphs", () => {
        expect(decorate(blank({ origin: { kind: "born" } })).cornerGlyphs).toEqual([]);
    });
});

describe("cardDecorator — extension axes round-trip onto the decoration", () => {
    it("species, kind, origin, identityFluid, assignedAtBirth round-trip", () => {
        const p = blank({
            gender: { identity: "agender", assignedAtBirth: "UAAB", fluid: true },
            species: "dragon",
            kind: "spirit",
            origin: { kind: "summoned", cause: "ritual" },
        });
        const dec = decorate(p);
        expect(dec.species).toBe("dragon");
        expect(dec.kind).toBe("spirit");
        expect(dec.origin).toBe("summoned");
        expect(dec.identityFluid).toBe(true);
        expect(dec.assignedAtBirth).toBe("UAAB");
    });

    it("axes default to undefined when the corresponding Person field is absent", () => {
        const dec = decorate(blank({ gender: "m" }));
        expect(dec.species).toBeUndefined();
        expect(dec.kind).toBeUndefined();
        expect(dec.origin).toBeUndefined();
        expect(dec.identityFluid).toBeUndefined();
        expect(dec.assignedAtBirth).toBeUndefined();
    });
});

describe("cardDecorator — tone derivation", () => {
    it("legacy m / f / u map to sky / rose / amber", () => {
        expect(decorate(blank({ gender: "m" })).fillTone).toBe("sky");
        expect(decorate(blank({ gender: "f" })).fillTone).toBe("rose");
        expect(decorate(blank({ gender: "u" })).fillTone).toBe("amber");
    });

    it("spirit / concept kind overrides tone to amber", () => {
        expect(decorate(blank({ gender: "m", kind: "spirit" })).fillTone).toBe("amber");
        expect(decorate(blank({ gender: "f", kind: "concept" })).fillTone).toBe("amber");
    });
});
