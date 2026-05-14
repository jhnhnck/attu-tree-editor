/*
 * FamilyTreeEditor - family-view card decorator (Phase 0 stub).
 *
 * Phase 5 fills in real banding, species, era, identity-over-time, etc.
 * The shape here is the long-term contract — PersonNode reads from this
 * module and must contain zero `gender ===` branches of its own, so that
 * the relationship-vocabulary work can extend the decorator chain
 * without touching the card component.
 *
 * Today's defaults: gender drives shape + fillTone; everything else is
 * inert. The frame, cornerGlyphs, and underlineColour axes exist so
 * Phase 5 (and later, relationship-vocabulary) can plug into them
 * without changing the call site.
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
}

const DEFAULT_FRAME: CardFrame = "solid";

/**
 * Phase 0 stub. Returns a hardcoded decoration derived from gender
 * alone; everything else defaulted. Phase 5 extends. The function is
 * pure so the renderer can memoise on `person`'s identity if needed.
 */
export function decorate(person: Person): CardDecoration {
    return {
        shape: shapeFor(person.gender),
        frame: DEFAULT_FRAME,
        fillTone: toneFor(person.gender),
        cornerGlyphs: [],
        underlineColour: null,
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
