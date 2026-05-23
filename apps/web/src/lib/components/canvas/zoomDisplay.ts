/*
 * FamilyTreeEditor - wave-2 phase 0b: zoom display-percent derivation.
 *
 * Extracted so the contract is unit-testable without a DOM mock. The
 * ZoomWidget reads `displayPercent` from `App.svelte`; App computes it
 * via `computeDisplayPercent` against the current canvas `scale`, the
 * `fte.zoom.semantic100` localStorage flag, and an optional measured
 * card-width sampled from `document.querySelector("[data-person-id]")`.
 *
 * Semantic-100 mode: displayed % = round((measured / DESIGN) × 100).
 * Falls back to `scale × 100` when the measurement isn't available
 * (no card on canvas yet, off-DOM rendering, etc.) or when the flag
 * is off. On 1× DPR + 100% browser zoom the two outputs are identical
 * — the semantic mode only diverges (honestly) when browser zoom is
 * active, reporting "what the user actually sees" instead of the raw
 * canvas-transform scale.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

/**
 * One standard non-portrait card in CSS pixels. Equals `PERSON_W (4)
 * × UNIT (80)` from `lib/layout/constants.ts` and
 * `engines/family-view/layout.ts`. Also exposed in `app.css` as
 * `--fte-design-card-width` so any future CSS-driven consumer reads
 * the same value.
 */
export const DESIGN_CARD_WIDTH_PX = 320;

export interface DisplayPercentInput {
    /** Canvas transform scale (the underlying `transform: scale(s)` value). */
    readonly scale: number;
    /** `fte.zoom.semantic100` localStorage flag (default true upstream). */
    readonly semantic100: boolean;
    /**
     * `getBoundingClientRect().width` of a sample non-portrait card,
     * in CSS pixels. Undefined when the canvas has no measurable
     * card on screen yet (initial render, off-DOM, headless tests).
     */
    readonly measuredCardWidthPx?: number | undefined;
}

/**
 * Resolve the % readout. Always returns an integer.
 *
 *   semantic100 + measured present + measured > 0  → measured / DESIGN × 100
 *   otherwise                                       → scale × 100
 *
 * No clamping: callers pass `scale` after their own MIN/MAX clamp.
 */
export function computeDisplayPercent(input: DisplayPercentInput): number {
    if (
        input.semantic100 &&
        input.measuredCardWidthPx !== undefined &&
        input.measuredCardWidthPx > 0
    ) {
        return Math.round((input.measuredCardWidthPx / DESIGN_CARD_WIDTH_PX) * 100);
    }
    return Math.round(input.scale * 100);
}
