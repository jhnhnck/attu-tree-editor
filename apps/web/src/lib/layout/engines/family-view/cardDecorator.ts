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
 * Phase 0 stub. Returns a hardcoded decoration derived from gender
 * alone; the five relationship-vocabulary extension fields default to
 * `undefined`. Phase 5 of relationship-vocabulary extends this function
 * (not the record shape — the record is the long-term contract). The
 * function is pure so the renderer can memoise on `person`'s identity
 * if needed.
 */
export function decorate(person: Person): CardDecoration {
    return {
        shape: shapeFor(person.gender),
        frame: DEFAULT_FRAME,
        fillTone: toneFor(person.gender),
        cornerGlyphs: [],
        underlineColour: null,
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
