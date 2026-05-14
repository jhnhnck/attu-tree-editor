/*
 * FamilyTreeEditor - family-view card decorator (Phase 0 stub).
 *
 * Phase 5 of family-view fills in real banding, era underlines, and
 * portrait-driven styling. Phase 5 of the relationship-vocabulary plan
 * (notes/plans/relationship-vocabulary.md) fills in the additional axes
 * declared here as `undefined`-defaulted fields: species, kind, origin,
 * identityFluid, assignedAtBirth. PersonNode reads from this module and
 * must contain zero `gender ===` branches of its own, so that any later
 * extension is a renderer-only change.
 *
 * Today's defaults: gender drives shape + fillTone; the other six axes
 * are inert. The frame and cornerGlyphs axes exist so the
 * relationship-vocabulary work can plug into them without changing the
 * call site.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Gender, Person } from "$lib/domain/types";

export type CardShape = "square" | "circle" | "diamond";
export type CardFrame = "solid" | "dashed" | "dotted";
export type CardCornerGlyph = "crown" | "star" | "skull" | "leaf";

export interface CardDecoration {
    readonly shape: CardShape;
    readonly frame: CardFrame;
    /** Tailwind tone keyword consumed by PersonNode. */
    readonly fillTone: "sky" | "rose" | "amber";
    readonly cornerGlyphs: readonly CardCornerGlyph[];
    readonly underlineColour: string | null;

    // ─── relationship-vocabulary Phase 0 extension (all undefined today) ──
    // Phase 5 of relationship-vocabulary fills these in from the new
    // `Person.gender` struct, `species`, `kind`, `origin` fields. The
    // PersonNode renderer treats `undefined` as "no decoration on this
    // axis," so this scaffold is a no-op until Phase 5 ships.

    /** Open string from `Person.species` (e.g. "human", "dragon", "chimera"). */
    readonly species?: string;
    /** `Person.kind`: "biological" | "mechanical" | "spirit" | "collective" | ... */
    readonly kind?: string;
    /** Origin glyph spec derived from `Person.origin.kind` ("summoned", "manufactured", ...). */
    readonly origin?: string;
    /** Whether the person's identity is fluid (drives a small corner badge). */
    readonly identityFluid?: boolean;
    /** AMAB / AFAB / UAAB side-label, when set explicitly on `Person.gender`. */
    readonly assignedAtBirth?: "AMAB" | "AFAB" | "UAAB";
}

const DEFAULT_FRAME: CardFrame = "solid";

/**
 * Phase 5 (family-view): real decorator. Gender drives shape + tone,
 * birth-year drives a subtle century-banded underline so era reads at
 * a glance. The relationship-vocabulary extension fields (species, kind,
 * origin, identityFluid, assignedAtBirth) remain `undefined` until the
 * relationship-vocabulary workstream populates them from the new
 * Person fields. The function is pure so the renderer can memoise on
 * `person`'s identity if needed.
 */
export function decorate(person: Person): CardDecoration {
    return {
        shape: shapeFor(person.gender),
        frame: DEFAULT_FRAME,
        fillTone: toneFor(person.gender),
        cornerGlyphs: [],
        underlineColour: underlineForBirthYear(person.birth?.year),
        // species, kind, origin, identityFluid, assignedAtBirth all default
        // to `undefined` by omission. Phase 5 of relationship-vocabulary
        // populates them from the new Person fields.
    };
}

function shapeFor(g: Gender): CardShape {
    if (g === "m") return "square";
    if (g === "f") return "circle";
    return "diamond";
}

function toneFor(g: Gender): "sky" | "rose" | "amber" {
    if (g === "m") return "sky";
    if (g === "f") return "rose";
    return "amber";
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
    // 360° / 12 centuries ≈ 30° per step; modulo wraps so very-far-future
    // and very-far-past years still get a hue rather than collapsing to
    // the same colour for everyone.
    const hue = (century * 30) % 360;
    return `hsl(${String(hue)} 55% 55%)`;
}
