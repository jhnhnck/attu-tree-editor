/*
 * FamilyTreeEditor - identity / gender helpers for the schema 3.2.0 transition
 *
 * Person.gender is a union of the legacy single-character code and the new
 * GenderStruct; every consumer reads through these helpers so the union is
 * abstracted at one seam. Cisgender is the inferred default: when only
 * identity or only assignedAtBirth is set, the other axis is filled in by
 * cis-matching inference (male <-> AMAB, female <-> AFAB, unknown <-> UAAB)
 * without being stored on the record. Explicit non-cis values are stored
 * verbatim.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { AssignedAtBirth, Gender, GenderStruct, Person } from "$lib/domain/types";

/** True when `Person.gender` is the new `GenderStruct` shape. */
export function isGenderStruct(g: Person["gender"]): g is GenderStruct {
    return typeof g === "object" && g !== null && "identity" in g;
}

/**
 * Canonical identity string. Returns whatever is on the struct verbatim if
 * present, else maps the legacy code: m → "male", f → "female", u →
 * "unknown". Open string so fictional identities pass through.
 */
export function getIdentity(person: Person): string {
    const g = person.gender;
    if (isGenderStruct(g)) return g.identity;
    if (g === "m") return "male";
    if (g === "f") return "female";
    return "unknown";
}

/**
 * Legacy m/f/u code derived from identity (the inverse of `getIdentity`).
 * Used by every pre-3.2.0 consumer (kinship label derivation, GEDCOM SEX
 * emit, couples left/right ordering). Unknown identity strings collapse to
 * "u" so the legacy code never explodes the union.
 */
export function legacyGenderCode(person: Person): Gender {
    const g = person.gender;
    if (!isGenderStruct(g)) return g;
    if (g.identity === "male") return "m";
    if (g.identity === "female") return "f";
    return "u";
}

/**
 * Returns the explicit AssignedAtBirth if set on the struct, else
 * undefined. Use `getInferredAssignedAtBirth` if you want cis inference.
 */
export function getAssignedAtBirth(person: Person): AssignedAtBirth | undefined {
    const g = person.gender;
    if (!isGenderStruct(g)) return undefined;
    return g.assignedAtBirth;
}

/**
 * AssignedAtBirth with cis-default inference: if not stored, derive from
 * identity (male → AMAB, female → AFAB, unknown → UAAB). Used by the
 * decorator's side-label heuristic.
 */
export function getInferredAssignedAtBirth(person: Person): AssignedAtBirth {
    const stored = getAssignedAtBirth(person);
    if (stored) return stored;
    const identity = getIdentity(person);
    if (identity === "male") return "AMAB";
    if (identity === "female") return "AFAB";
    return "UAAB";
}

/**
 * Whether the AssignedAtBirth on a person is inferred (cis default) rather
 * than stored. Used by PersonalTab to tag the field with "(inferred)".
 */
export function isAssignedAtBirthInferred(person: Person): boolean {
    return getAssignedAtBirth(person) === undefined;
}

/** Pronouns if explicitly set; else undefined. */
export function getPronouns(person: Person): string | undefined {
    const g = person.gender;
    if (!isGenderStruct(g)) return undefined;
    return g.pronouns;
}

/** Fluid flag with the cis default (absent = false). */
export function getFluid(person: Person): boolean {
    const g = person.gender;
    if (!isGenderStruct(g)) return false;
    return g.fluid === true;
}

/**
 * Normalise a `Person.gender` value to its `GenderStruct` representation.
 * Legacy codes are mapped to canonical identity strings; existing structs
 * pass through unchanged. Used by the inspector when authoring a patch
 * that touches a struct-only field (pronouns, assignedAtBirth, fluid) on
 * a person whose record is still in legacy form.
 */
export function toGenderStruct(g: Person["gender"]): GenderStruct {
    if (isGenderStruct(g)) return g;
    if (g === "m") return { identity: "male" };
    if (g === "f") return { identity: "female" };
    return { identity: "unknown" };
}
