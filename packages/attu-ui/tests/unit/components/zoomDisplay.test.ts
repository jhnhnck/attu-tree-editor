/*
 * FamilyTreeEditor - wave-2 phase 0b: unit tests for the semantic-100
 * % derivation in `lib/components/canvas/zoomDisplay.ts`.
 *
 * Pure-function tests — no DOM. The App.svelte wiring that samples
 * `getBoundingClientRect().width` is exercised by the visual goldens
 * and by manual smoke on the akarians fixture; this file pins down
 * the math.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { DESIGN_CARD_WIDTH_PX, computeDisplayPercent } from "$lib/components/canvas/zoomDisplay";

describe("computeDisplayPercent — phase 0b zoom 100% contract", () => {
    it("design-card-width constant matches `PERSON_W × UNIT` (4 × 80 = 320 css px)", () => {
        expect(DESIGN_CARD_WIDTH_PX).toBe(320);
    });

    it("semantic mode at 1× DPR matches scale × 100 (measured == scale × design)", () => {
        // canvas at scale=1.5; a card with no browser zoom renders at
        // 320 × 1.5 = 480 CSS px wide. semantic% = 480/320 × 100 = 150.
        expect(
            computeDisplayPercent({
                scale: 1.5,
                semantic100: true,
                measuredCardWidthPx: 480,
            }),
        ).toBe(150);
    });

    it("semantic mode honours browser zoom (measured diverges from scale × design)", () => {
        // canvas at scale=1.0, browser zoom 200% → CSS px doubled → a
        // 320-design card measures 640 CSS px. raw scale × 100 = 100
        // (wrong); semantic = 640/320 × 100 = 200 (honest).
        expect(
            computeDisplayPercent({
                scale: 1.0,
                semantic100: true,
                measuredCardWidthPx: 640,
            }),
        ).toBe(200);
    });

    it("rounds to nearest integer (banker's rounding not required)", () => {
        // scale=0.333... at design width yields 106.66... → rounds to 107
        expect(
            computeDisplayPercent({
                scale: 1.0,
                semantic100: true,
                measuredCardWidthPx: 341.33,
            }),
        ).toBe(107);
    });

    it("flag off → falls back to raw scale × 100 regardless of measured", () => {
        expect(
            computeDisplayPercent({
                scale: 1.0,
                semantic100: false,
                measuredCardWidthPx: 640,
            }),
        ).toBe(100);
        expect(
            computeDisplayPercent({
                scale: 1.5,
                semantic100: false,
            }),
        ).toBe(150);
    });

    it("flag on but no measurement → falls back to raw scale × 100", () => {
        // initial mount before any card is in the DOM; pre-mount canvas
        // headless tests.
        expect(
            computeDisplayPercent({
                scale: 1.25,
                semantic100: true,
                measuredCardWidthPx: undefined,
            }),
        ).toBe(125);
    });

    it("flag on but measurement is zero or negative → falls back", () => {
        // a card that's not yet been laid out reports 0×0; defensive
        // path guards against feeding 0 / 320 = 0 to the readout.
        expect(
            computeDisplayPercent({
                scale: 1.0,
                semantic100: true,
                measuredCardWidthPx: 0,
            }),
        ).toBe(100);
        expect(
            computeDisplayPercent({
                scale: 1.0,
                semantic100: true,
                measuredCardWidthPx: -1,
            }),
        ).toBe(100);
    });

    it("scale extremes round predictably", () => {
        expect(computeDisplayPercent({ scale: 0.1, semantic100: false })).toBe(10);
        expect(computeDisplayPercent({ scale: 5.0, semantic100: false })).toBe(500);
    });
});
