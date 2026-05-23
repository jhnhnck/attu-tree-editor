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
