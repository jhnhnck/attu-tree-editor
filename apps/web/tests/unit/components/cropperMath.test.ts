/*
 * FamilyTreeEditor - unit tests for cropperMath pure functions
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import {
    coverScale,
    centerOnFrame,
    initialCoverTransform,
    extractSourceRect,
    panTransform,
    anchorZoom,
    clampTransform,
    MAX_ZOOM_MULTIPLE,
} from "$lib/components/editor/cropperMath";

describe("coverScale", () => {
    it("returns the larger of the two axis ratios", () => {
        // landscape source, square frame -> bound by height
        expect(coverScale({ w: 2000, h: 1000 }, { w: 600, h: 600 })).toBeCloseTo(0.6);
        // portrait source, square frame -> bound by width
        expect(coverScale({ w: 1000, h: 2000 }, { w: 600, h: 600 })).toBeCloseTo(0.6);
        // exact fit
        expect(coverScale({ w: 600, h: 600 }, { w: 600, h: 600 })).toBe(1);
    });

    it("returns 1 for degenerate (zero) dimensions instead of dividing by zero", () => {
        expect(coverScale({ w: 0, h: 100 }, { w: 600, h: 600 })).toBe(1);
        expect(coverScale({ w: 600, h: 600 }, { w: 0, h: 600 })).toBe(1);
    });
});

describe("centerOnFrame + initialCoverTransform", () => {
    it("centers a 2000x1000 source on a 600x600 frame at canvas center (300,300)", () => {
        const t = initialCoverTransform({ w: 2000, h: 1000 }, { w: 600, h: 600 }, 300, 300);
        // cover scale 0.6 -> bitmap drawn at 1200x600, centered on (300,300)
        expect(t.scale).toBeCloseTo(0.6);
        expect(t.tx).toBeCloseTo(-300); // 300 - 1200/2
        expect(t.ty).toBeCloseTo(0); // 300 - 600/2
    });

    it("centerOnFrame at scale 1 puts the bitmap origin at center - half-size", () => {
        const t = centerOnFrame({ w: 400, h: 200 }, 1, 100, 50);
        expect(t.tx).toBe(-100);
        expect(t.ty).toBe(-50);
    });
});

describe("extractSourceRect", () => {
    it("inverts the initial cover transform back to the centered source region", () => {
        const src = { w: 2000, h: 1000 };
        const frame = { w: 600, h: 600 };
        // canvas is the same size as the frame (degenerate phase-0a layout)
        const t = initialCoverTransform(src, frame, frame.w / 2, frame.h / 2);
        const r = extractSourceRect(src, t, 0, 0, frame);
        // frame covers the full frame -> source rect is centered, 1000x1000
        expect(r.sw).toBeCloseTo(1000);
        expect(r.sh).toBeCloseTo(1000);
        // centered horizontally: sx = (2000 - 1000) / 2
        expect(r.sx).toBeCloseTo(500);
        expect(r.sy).toBeCloseTo(0);
    });

    it("clamps to the source bitmap bounds when the frame would extend past it", () => {
        const r = extractSourceRect({ w: 100, h: 100 }, { scale: 1, tx: 0, ty: 0 }, -50, -50, {
            w: 300,
            h: 300,
        });
        // frame top-left in source coords is (-50, -50), size 300x300; clamped to (0,0,100,100)
        expect(r).toEqual({ sx: 0, sy: 0, sw: 100, sh: 100 });
    });
});

describe("panTransform", () => {
    it("translates without touching scale", () => {
        const r = panTransform({ scale: 2, tx: 10, ty: 20 }, 5, -3);
        expect(r).toEqual({ scale: 2, tx: 15, ty: 17 });
    });
});

describe("anchorZoom", () => {
    it("keeps the source-bitmap point under the anchor invariant", () => {
        // start: identity transform, scale 1
        const t0 = { scale: 1, tx: 0, ty: 0 };
        // anchor at canvas point (100, 50). source point under it: (100, 50).
        const t1 = anchorZoom(t0, 100, 50, 2);
        // after 2x zoom, the source point (100, 50) should still be at canvas (100, 50)
        const srcX = (100 - t1.tx) / t1.scale;
        const srcY = (50 - t1.ty) / t1.scale;
        expect(srcX).toBeCloseTo(100);
        expect(srcY).toBeCloseTo(50);
        expect(t1.scale).toBe(2);
    });

    it("composes inversely", () => {
        const t0 = { scale: 1.5, tx: 30, ty: -10 };
        const t1 = anchorZoom(t0, 200, 150, 1.7);
        const t2 = anchorZoom(t1, 200, 150, 1 / 1.7);
        expect(t2.scale).toBeCloseTo(t0.scale);
        expect(t2.tx).toBeCloseTo(t0.tx);
        expect(t2.ty).toBeCloseTo(t0.ty);
    });
});

describe("clampTransform", () => {
    const src = { w: 2000, h: 1000 };
    const frame = { w: 600, h: 600 };
    // cover scale: 0.6 (bound by height; 1000 * 0.6 = 600 = frame height)
    const minScale = 0.6;
    const maxScale = minScale * MAX_ZOOM_MULTIPLE;

    it("clamps scale to [cover, cover * MAX_ZOOM_MULTIPLE]", () => {
        const below = clampTransform(src, frame, { scale: 0.1, tx: 0, ty: 0 });
        expect(below.scale).toBeCloseTo(minScale);
        const above = clampTransform(src, frame, { scale: 100, tx: 0, ty: 0 });
        expect(above.scale).toBeCloseTo(maxScale);
    });

    it("clamps tx/ty so the bitmap covers the frame", () => {
        // bitmap at scale 0.6 -> 1200 x 600. frame is 600 x 600 at (0,0).
        // tx must be in [600 - 1200, 0] = [-600, 0]; ty must be in [600 - 600, 0] = [0, 0].
        const out = clampTransform(src, frame, { scale: 0.6, tx: 100, ty: 100 });
        expect(out.tx).toBeCloseTo(0); // clipped up
        expect(out.ty).toBeCloseTo(0); // clipped to the single valid value
        const out2 = clampTransform(src, frame, { scale: 0.6, tx: -2000, ty: -2000 });
        expect(out2.tx).toBeCloseTo(-600); // clipped down
        expect(out2.ty).toBeCloseTo(0);
    });

    it("at max zoom permits a wider pan range", () => {
        // scale = 2.4 -> bitmap 4800 x 2400. tx must be in [600 - 4800, 0] = [-4200, 0].
        const out = clampTransform(src, frame, { scale: maxScale, tx: -1500, ty: -500 });
        expect(out.scale).toBeCloseTo(maxScale);
        expect(out.tx).toBeCloseTo(-1500); // inside [-4200, 0]
        expect(out.ty).toBeCloseTo(-500); // inside [-1800, 0]
    });
});
