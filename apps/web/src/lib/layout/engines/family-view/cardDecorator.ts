/*
 * FamilyTreeEditor - family-view card decorator.
 *
 * Phase 5 of family-view fills in real banding, era underlines, and
 * portrait-driven styling. Phase 5 of the relationship-vocabulary plan
 * (notes/plans/relationship-vocabulary.md) fills in the additional axes
 * declared here: species, kind, origin, identityFluid, assignedAtBirth.
 * PersonNode reads from this module and must contain zero `gender ===`
 * branches of its own, so that any later extension is a renderer-only
 * change.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { AssignedAtBirth, Person, PersonKind } from "$lib/domain/types";
import {
    getAssignedAtBirth,
    getFluid,
    getIdentity,
    getInferredAssignedAtBirth,
    legacyGenderCode,
} from "$lib/domain/personIdentity";

export type CardShape = "square" | "circle" | "diamond";
export type CardFrame = "solid" | "dashed" | "dotted" | "double" | "gradient";
export type CardCornerGlyph =
    | "crown"
    | "star"
    | "skull"
    | "leaf"
    | "summoned"
    | "manufactured"
    | "hatched"
    | "awoken"
    | "cloned"
    | "fluid";

export interface CardDecoration {
    readonly shape: CardShape;
    readonly frame: CardFrame;
    /** Tailwind tone keyword consumed by PersonNode. */
    readonly fillTone: "sky" | "rose" | "amber";
    readonly cornerGlyphs: readonly CardCornerGlyph[];
    readonly underlineColour: string | null;

    // ─── relationship-vocabulary Phase 5 extensions ───────────────────────
    // populated from the new `Person.gender` struct, `species`, `kind`,
    // `origin` fields. PersonNode treats `undefined` as "no decoration on
    // this axis".

    /** Open string from `Person.species` (e.g. "human", "dragon", "chimera"). */
    readonly species?: string;
    /** `Person.kind`: "biological" | "mechanical" | "spirit" | "collective" | ... */
    readonly kind?: PersonKind;
    /** Origin glyph spec derived from `Person.origin.kind` ("summoned", "manufactured", ...). */
    readonly origin?: string;
    /** Whether the person's identity is fluid (drives a small corner badge). */
    readonly identityFluid?: boolean;
    /** AMAB / AFAB / UAAB side-label, when set explicitly on `Person.gender`. */
    readonly assignedAtBirth?: AssignedAtBirth;
}

/**
 * Phase 5: identity → shape, species/kind → frame, kind → tone tint,
 * origin → corner glyph, fluid → corner glyph, assignedAtBirth → side
 * label (explicit only — inferred AAB is computed by callers via
 * `personIdentity.ts`). Pure function so the renderer can memoise on
 * `person`'s identity.
 */
export function decorate(person: Person): CardDecoration {
    const dec: {
        shape: CardShape;
        frame: CardFrame;
        fillTone: "sky" | "rose" | "amber";
        cornerGlyphs: CardCornerGlyph[];
        underlineColour: string | null;
        species?: string;
        kind?: PersonKind;
        origin?: string;
        identityFluid?: boolean;
        assignedAtBirth?: AssignedAtBirth;
    } = {
        shape: shapeForPerson(person),
        frame: frameForPerson(person),
        fillTone: toneForPerson(person),
        cornerGlyphs: cornerGlyphsForPerson(person),
        underlineColour: underlineForBirthYear(person.birth?.year),
    };
    if (person.species !== undefined) dec.species = person.species;
    if (person.kind !== undefined) dec.kind = person.kind;
    if (person.origin?.kind !== undefined) dec.origin = person.origin.kind;
    if (getFluid(person)) dec.identityFluid = true;
    const aab = getAssignedAtBirth(person);
    if (aab !== undefined) dec.assignedAtBirth = aab;
    return dec;
}

/**
 * Shape from identity (canonical: male = square, female = circle, anything
 * else = diamond). Unknown identity strings fall through to the inferred
 * AssignedAtBirth's cis-equivalent shape: AMAB → square, AFAB → circle,
 * UAAB → diamond. This is the documented cis-default behaviour.
 */
function shapeForPerson(person: Person): CardShape {
    const identity = getIdentity(person);
    if (identity === "male") return "square";
    if (identity === "female") return "circle";
    const aab = getInferredAssignedAtBirth(person);
    if (aab === "AMAB") return "square";
    if (aab === "AFAB") return "circle";
    return "diamond";
}

/**
 * Frame from species + kind: biological-human stays solid; mechanical kind
 * (chair, golem, android) gets a dashed frame; spirit / magical kinds get
 * a double frame; collective / concept gets a gradient. Default = solid.
 */
function frameForPerson(person: Person): CardFrame {
    const kind = person.kind;
    if (kind === "mechanical") return "dashed";
    if (kind === "spirit") return "double";
    if (kind === "collective" || kind === "concept") return "gradient";
    // species hints when kind is absent
    const species = (person.species ?? "").toLowerCase();
    if (species === "dragon" || species === "phoenix") return "double";
    if (species === "chimera" || species === "hybrid") return "gradient";
    return "solid";
}

/**
 * Tone: legacy gender → sky/rose/amber stays the baseline (matches every
 * pre-3.2.0 tree). `kind` can override: mechanical → sky tint, spirit →
 * amber, concept → amber. The renderer maps `fillTone` to Tailwind classes.
 */
function toneForPerson(person: Person): "sky" | "rose" | "amber" {
    const kind = person.kind;
    if (kind === "spirit" || kind === "concept") return "amber";
    const code = legacyGenderCode(person);
    if (code === "m") return "sky";
    if (code === "f") return "rose";
    return "amber";
}

/**
 * Corner glyphs come from `Person.origin.kind` + identity-fluid. Each maps
 * to a single glyph; the renderer draws them stacked in the top-right
 * corner of the card. Order matters: origin first, then fluid.
 */
function cornerGlyphsForPerson(person: Person): CardCornerGlyph[] {
    const glyphs: CardCornerGlyph[] = [];
    const originKind = person.origin?.kind;
    if (originKind === "summoned") glyphs.push("summoned");
    else if (originKind === "manufactured") glyphs.push("manufactured");
    else if (originKind === "hatched") glyphs.push("hatched");
    else if (originKind === "awoken") glyphs.push("awoken");
    else if (originKind === "cloned") glyphs.push("cloned");
    if (getFluid(person)) glyphs.push("fluid");
    return glyphs;
}

/**
 * Pick a century-banded hue for the bottom-of-card era underline. The
 * intent is "era reads at a glance" — adjacent centuries get adjacent
 * hues so generations within the same era look related, but a few
 * centuries' span produces visible drift. Uses an HSL hue rotation
 * indexed by `floor(year / 100)`; the saturation/lightness stay flat
 * so the underline never competes with selection (yellow ring) or
 * path-highlight (accent) for attention.
 *
 * Returns `null` for unknown birth years so PersonNode can drop the
 * underline element entirely (avoid a stray 1-px line on
 * dateless cards).
 */
function underlineForBirthYear(year: number | undefined): string | null {
    if (year === undefined) return null;
    const century = Math.floor(year / 100);
    const hue = (century * 30) % 360;
    return `hsl(${String(hue)} 55% 55%)`;
}
