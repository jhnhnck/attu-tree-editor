/*
 * FamilyTreeEditor - unit tests for the personIdentity helpers (Phase 5)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";

import type { Person } from "$lib/domain/types";
import {
    getAssignedAtBirth,
    getFluid,
    getIdentity,
    getInferredAssignedAtBirth,
    getPronouns,
    isAssignedAtBirthInferred,
    isGenderStruct,
    legacyGenderCode,
    toGenderStruct,
} from "$lib/domain/personIdentity";

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

describe("personIdentity — legacy code form", () => {
    it("maps m/f/u to canonical identity strings", () => {
        expect(getIdentity(blank({ gender: "m" }))).toBe("male");
        expect(getIdentity(blank({ gender: "f" }))).toBe("female");
        expect(getIdentity(blank({ gender: "u" }))).toBe("unknown");
    });

    it("legacyGenderCode round-trips legacy codes", () => {
        expect(legacyGenderCode(blank({ gender: "m" }))).toBe("m");
        expect(legacyGenderCode(blank({ gender: "f" }))).toBe("f");
        expect(legacyGenderCode(blank({ gender: "u" }))).toBe("u");
    });

    it("isGenderStruct returns false for legacy codes", () => {
        expect(isGenderStruct("m")).toBe(false);
        expect(isGenderStruct({ identity: "male" })).toBe(true);
    });

    it("explicit AAB and pronouns are undefined on legacy form", () => {
        const p = blank({ gender: "m" });
        expect(getAssignedAtBirth(p)).toBeUndefined();
        expect(getPronouns(p)).toBeUndefined();
        expect(getFluid(p)).toBe(false);
    });
});

describe("personIdentity — struct form", () => {
    it("legacyGenderCode maps canonical identities back to single-character codes", () => {
        expect(legacyGenderCode(blank({ gender: { identity: "male" } }))).toBe("m");
        expect(legacyGenderCode(blank({ gender: { identity: "female" } }))).toBe("f");
        expect(legacyGenderCode(blank({ gender: { identity: "unknown" } }))).toBe("u");
    });

    it("legacyGenderCode collapses non-canonical identity to 'u'", () => {
        expect(legacyGenderCode(blank({ gender: { identity: "agender" } }))).toBe("u");
        expect(legacyGenderCode(blank({ gender: { identity: "non-binary" } }))).toBe("u");
    });

    it("getIdentity returns the verbatim identity string", () => {
        expect(getIdentity(blank({ gender: { identity: "agender" } }))).toBe("agender");
    });

    it("explicit assignedAtBirth round-trips", () => {
        const p = blank({ gender: { identity: "male", assignedAtBirth: "AFAB" } });
        expect(getAssignedAtBirth(p)).toBe("AFAB");
        expect(isAssignedAtBirthInferred(p)).toBe(false);
    });

    it("cis-inferred assignedAtBirth uses identity when not stored", () => {
        expect(getInferredAssignedAtBirth(blank({ gender: { identity: "male" } }))).toBe("AMAB");
        expect(getInferredAssignedAtBirth(blank({ gender: { identity: "female" } }))).toBe("AFAB");
        expect(getInferredAssignedAtBirth(blank({ gender: { identity: "unknown" } }))).toBe("UAAB");
    });

    it("cis-inferred AAB falls through to UAAB for fictional identities", () => {
        expect(getInferredAssignedAtBirth(blank({ gender: { identity: "agender" } }))).toBe("UAAB");
    });

    it("isAssignedAtBirthInferred returns true when not stored", () => {
        expect(isAssignedAtBirthInferred(blank({ gender: { identity: "male" } }))).toBe(true);
    });

    it("fluid defaults to false when absent", () => {
        expect(getFluid(blank({ gender: { identity: "male" } }))).toBe(false);
        expect(getFluid(blank({ gender: { identity: "male", fluid: true } }))).toBe(true);
        expect(getFluid(blank({ gender: { identity: "male", fluid: false } }))).toBe(false);
    });

    it("pronouns round-trip from the struct", () => {
        expect(getPronouns(blank({ gender: { identity: "male", pronouns: "he/him" } }))).toBe(
            "he/him",
        );
    });
});

describe("personIdentity — toGenderStruct normaliser", () => {
    it("maps legacy codes to canonical struct form", () => {
        expect(toGenderStruct("m")).toEqual({ identity: "male" });
        expect(toGenderStruct("f")).toEqual({ identity: "female" });
        expect(toGenderStruct("u")).toEqual({ identity: "unknown" });
    });

    it("passes through an existing struct unchanged", () => {
        const struct = { identity: "agender", pronouns: "they/them" };
        expect(toGenderStruct(struct)).toBe(struct);
    });
});
