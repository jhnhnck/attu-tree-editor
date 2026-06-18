/*
 * FamilyTreeEditor - unit tests for the fit-to-window math in
 * `lib/components/canvas/fitMath.ts`. Pins the chrome-aware insets +
 * vertical-centering contract pulled out of TreeCanvas / FamilyViewCanvas.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { computeFit, type CanvasChromeInsets } from "$lib/components/canvas/fitMath";

const NO_INSETS: CanvasChromeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

describe("computeFit - chrome-aware fit-to-window", () => {
    it("centres a square content in a square host with zero insets and no padding", () => {
        const out = computeFit({
            contentWPx: 200,
            contentHPx: 200,
            contentOriginX: 0,
            contentOriginY: 0,
            hostW: 1000,
            hostH: 1000,
            padding: 0,
            insets: NO_INSETS,
            minScale: 0.05,
            maxScale: 5,
        });
        // scale = min(1000/200, 1000/200) = 5, but clamped to maxScale
        expect(out.scale).toBe(5);
        // content at scale=5 is 1000x1000; slack=0; pan = (0, 0)
        expect(out.panX).toBe(0);
        expect(out.panY).toBe(0);
    });

    it("subtracts chrome insets when picking the fit scale", () => {
        // host is 1000x1000 but the bottom 200px and right 100px are
        // covered by chrome. visible viewport = 900 wide x 800 tall.
        // content 900x900 must be scaled to min(900/900, 800/900) ≈ 0.889
        const out = computeFit({
            contentWPx: 900,
            contentHPx: 900,
            contentOriginX: 0,
            contentOriginY: 0,
            hostW: 1000,
            hostH: 1000,
            padding: 0,
            insets: { top: 0, right: 100, bottom: 200, left: 0 },
            minScale: 0.05,
            maxScale: 5,
        });
        expect(out.scale).toBeCloseTo(800 / 900, 5);
    });

    it("centres content vertically inside the chrome-aware viewport", () => {
        // hostH=1000, top inset=40, bottom inset=60 -> visible band
        // is y in [40, 940] (height 900). a 300-tall content scaled to
        // 1.0 should land with top at 40 + (900 - 300)/2 = 340.
        const out = computeFit({
            contentWPx: 800,
            contentHPx: 300,
            contentOriginX: 0,
            contentOriginY: 0,
            hostW: 1000,
            hostH: 1000,
            padding: 0,
            insets: { top: 40, right: 0, bottom: 60, left: 0 },
            minScale: 0.05,
            maxScale: 1,
        });
        // scale stays at 1 (cap), so panY = visibleTop + (visibleH - 300*1)/2 - 0
        expect(out.scale).toBe(1);
        expect(out.panY).toBe(40 + (900 - 300) / 2);
    });

    it("offsets the pan by contentOriginY so negative-origin content centres correctly", () => {
        // family-view shape: content spans y in [-200, 100] (so
        // contentHPx=300, contentOriginY=-200). a host of 1000 tall
        // with zero insets/padding centres the content's bbox at
        // y=350..650. panY satisfies: screenY = panY + worldY*scale.
        // for screenY=350 at worldY=-200 with scale=1: panY = 350 - (-200) = 550.
        const out = computeFit({
            contentWPx: 400,
            contentHPx: 300,
            contentOriginX: 0,
            contentOriginY: -200,
            hostW: 1000,
            hostH: 1000,
            padding: 0,
            insets: NO_INSETS,
            minScale: 0.05,
            maxScale: 1,
        });
        expect(out.scale).toBe(1);
        // visibleTop=0, slackY=(1000-300)/2=350, panY=0 + 350 - (-200)*1 = 550
        expect(out.panY).toBe(550);
        // sanity: world (0, -200) maps to screen (panX, 350)
        const screenTopY = out.panY + -200 * out.scale;
        expect(screenTopY).toBe(350);
    });

    it("applies symmetric padding inside the visible viewport", () => {
        // host=1000x1000, padding=50, no insets -> visible box is
        // (50,50)-(950,950), 900x900. content 900x900 fits exactly at
        // scale 1; pan should place content top-left at (50, 50).
        const out = computeFit({
            contentWPx: 900,
            contentHPx: 900,
            contentOriginX: 0,
            contentOriginY: 0,
            hostW: 1000,
            hostH: 1000,
            padding: 50,
            insets: NO_INSETS,
            minScale: 0.05,
            maxScale: 5,
        });
        expect(out.scale).toBe(1);
        expect(out.panX).toBe(50);
        expect(out.panY).toBe(50);
    });

    it("clamps to minScale when content exceeds the viewport", () => {
        const out = computeFit({
            contentWPx: 10000,
            contentHPx: 10000,
            contentOriginX: 0,
            contentOriginY: 0,
            hostW: 500,
            hostH: 500,
            padding: 0,
            insets: NO_INSETS,
            minScale: 0.1,
            maxScale: 1,
        });
        // raw scale would be 0.05 but minScale=0.1 floors it.
        expect(out.scale).toBe(0.1);
    });

    it("clamps to maxScale when content is tiny", () => {
        const out = computeFit({
            contentWPx: 10,
            contentHPx: 10,
            contentOriginX: 0,
            contentOriginY: 0,
            hostW: 1000,
            hostH: 1000,
            padding: 0,
            insets: NO_INSETS,
            minScale: 0.05,
            maxScale: 1.5,
        });
        // raw scale would be 100 but maxScale=1.5 caps it.
        expect(out.scale).toBe(1.5);
    });

    it("survives a degenerate viewport where insets + padding exceed the host", () => {
        // host=100x100, padding=80 → visible would be (80,80)-(20,20)
        // → negative; the math must still return a finite scale + pan
        // (no Infinity / NaN), letting the engine ride out a transient
        // resize without exploding.
        const out = computeFit({
            contentWPx: 200,
            contentHPx: 200,
            contentOriginX: 0,
            contentOriginY: 0,
            hostW: 100,
            hostH: 100,
            padding: 80,
            insets: NO_INSETS,
            minScale: 0.05,
            maxScale: 5,
        });
        expect(Number.isFinite(out.scale)).toBe(true);
        expect(Number.isFinite(out.panX)).toBe(true);
        expect(Number.isFinite(out.panY)).toBe(true);
        expect(out.scale).toBeGreaterThanOrEqual(0.05);
    });

    it("symmetric horizontal insets recover the legacy host-centre formula", () => {
        // when top=bottom and left=right insets are zero, the centred
        // pan equals the prior `(hostW - contentW*scale) / 2` formula -
        // ensures we haven't shifted existing behaviour for the
        // no-chrome case (regression guard for the layered engine).
        const out = computeFit({
            contentWPx: 400,
            contentHPx: 300,
            contentOriginX: 0,
            contentOriginY: 0,
            hostW: 1000,
            hostH: 800,
            padding: 0,
            insets: NO_INSETS,
            minScale: 0.05,
            maxScale: 1,
        });
        expect(out.panX).toBe((1000 - 400) / 2);
        expect(out.panY).toBe((800 - 300) / 2);
    });
});
