/*
 * FamilyTreeEditor - tests for edgePath helpers (path data + hops + ticks + zoom)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import {
    pathFor,
    divorceTickPath,
    pathDataForGroup,
    divorceTicksForGroup,
    pathForGeodesic,
    zoomAwareStroke,
    HOP_RADIUS,
} from "$lib/components/tree/edgePath";
import type { RenderedSegment } from "$lib/components/tree/edges";

function seg(over: Partial<RenderedSegment>): RenderedSegment {
    return {
        id: "s",
        bundleId: "s",
        kind: "parent-drop",
        role: "blood",
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 100,
        ...over,
    };
}

describe("pathFor", () => {
    it("returns a straight M…L for a vertical with no hops", () => {
        const d = pathFor(seg({ x1: 50, y1: 0, x2: 50, y2: 100 }));
        expect(d).toBe("M 50 0 L 50 100");
    });

    it("returns a straight M…L for a horizontal", () => {
        const d = pathFor(seg({ x1: 0, y1: 50, x2: 100, y2: 50, kind: "sibling-bus" }));
        expect(d).toBe("M 0 50 L 100 50");
    });

    it("emits a quadratic hop arc on a downward vertical with one hop", () => {
        const d = pathFor(seg({ x1: 50, y1: 0, x2: 50, y2: 100, hops: [50] }));
        // expect a Q segment that bows right
        expect(d).toContain("Q");
        expect(d.startsWith("M 50 0")).toBe(true);
        expect(d.endsWith("L 50 100")).toBe(true);
        // the control point of the quadratic should be at x = 50 + r*1.5
        expect(d).toContain(`Q ${50 + HOP_RADIUS * 1.5} 50 50`);
    });

    it("emits hops in path-direction order on an upward vertical", () => {
        const d = pathFor(seg({ x1: 50, y1: 100, x2: 50, y2: 0, hops: [40, 70] }));
        // upward path should hit hop=70 first, then hop=40
        const idx70 = d.indexOf(" 70 ");
        const idx40 = d.indexOf(" 40 ");
        expect(idx70).toBeGreaterThan(0);
        expect(idx40).toBeGreaterThan(idx70);
    });

    it("skips hops that fall within hopRadius of the segment endpoints", () => {
        // hop at y=2, radius=4 → too close to y=0 endpoint, must be skipped
        const d = pathFor(seg({ x1: 50, y1: 0, x2: 50, y2: 100, hops: [2] }));
        expect(d).toBe("M 50 0 L 50 100");
    });
});

describe("divorceTickPath", () => {
    it("returns an empty string for non-horizontal segments", () => {
        expect(divorceTickPath(seg({ x1: 0, y1: 0, x2: 0, y2: 100 }))).toBe("");
    });

    it("emits two parallel diagonal slashes through a horizontal bond's midpoint", () => {
        const d = divorceTickPath(seg({ x1: 0, y1: 50, x2: 100, y2: 50, kind: "bond" }));
        // two M…L pairs (one per slash)
        expect(d.split(/M /g).length - 1).toBe(2);
    });
});

describe("pathDataForGroup / divorceTicksForGroup", () => {
    it("concatenates segment paths with spaces", () => {
        const a = seg({ id: "a", x1: 0, y1: 0, x2: 0, y2: 50 });
        const b = seg({ id: "b", x1: 10, y1: 0, x2: 10, y2: 50 });
        const d = pathDataForGroup([a, b]);
        expect(d).toContain("M 0 0");
        expect(d).toContain("M 10 0");
    });

    it("only emits ticks for horizontal divorced bonds", () => {
        const horiz = seg({
            id: "h",
            role: "divorced",
            kind: "bond",
            x1: 0,
            y1: 50,
            x2: 100,
            y2: 50,
        });
        const vert = seg({ id: "v", role: "divorced", kind: "bond", x1: 0, y1: 0, x2: 0, y2: 50 });
        const d = divorceTicksForGroup([horiz, vert]);
        expect(d).not.toBe("");
        // tick from the horizontal only — two M…L
        expect(d.split(/M /g).length - 1).toBe(2);
    });
});

describe("zoomAwareStroke", () => {
    it("returns basePx when scale = 1 and no boost", () => {
        expect(zoomAwareStroke(2, 1, 0)).toBeCloseTo(2);
    });

    it("inverse-scales for compensation when zoomed in", () => {
        // at scale=2, screen-stroke target stays = base + 0 boost = base; svg-stroke = base/scale
        expect(zoomAwareStroke(2, 2, 0)).toBeCloseTo(1);
    });

    it("grows thicker on zoom-out (the to-do behaviour)", () => {
        const at1 = zoomAwareStroke(1, 1);
        const at05 = zoomAwareStroke(1, 0.5);
        const at01 = zoomAwareStroke(1, 0.1);
        expect(at05).toBeGreaterThan(at1);
        expect(at01).toBeGreaterThan(at05);
    });

    it("clamps scale at a tiny floor so we don't divide by zero", () => {
        const v = zoomAwareStroke(1, 0);
        expect(Number.isFinite(v)).toBe(true);
    });
});

describe("pathForGeodesic", () => {
    it("emits a straight L for collinear-with-origin points", () => {
        const d = pathForGeodesic({ re: 0.3, im: 0 }, { re: -0.3, im: 0 }, 100, 100, 100);
        // Expect "M ... L ..." form, no A command.
        expect(d).toContain("L");
        expect(d).not.toContain("A");
    });

    it("emits an A arc for non-collinear points", () => {
        const d = pathForGeodesic({ re: 0.5, im: 0 }, { re: 0, im: 0.5 }, 100, 100, 100);
        // Expect "M ... A rx ry 0 0 sweep tx ty" — large-arc-flag is always 0.
        expect(d).toMatch(/^M .* A [\d.]+ [\d.]+ 0 0 [01] .* .*$/);
    });

    it("arc endpoints land on the projected disk-coord pixels", () => {
        const cx = 200;
        const cy = 150;
        const r = 100;
        const z1 = { re: 0.5, im: 0 };
        const z2 = { re: 0, im: 0.5 };
        const d = pathForGeodesic(z1, z2, cx, cy, r);
        // Start point should be (cx + 0.5*r, cy + 0*r) = (250, 150)
        // End point should be (cx + 0*r, cy + 0.5*r) = (200, 200)
        expect(d).toMatch(/^M 250 150 /);
        expect(d).toMatch(/ 200 200$/);
    });
});
