/*
 * FamilyTreeEditor - unit tests for the Poincaré-disk primitives.
 *
 * Math invariants: Möbius transforms preserve the disk; hDistance is
 * symmetric and non-negative; placeChild lands at the requested
 * hyperbolic distance and at the requested disk-coord direction (modulo
 * the tanh nonlinearity at the origin only); geodesic is parameter-
 * agnostic w.r.t. swap.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import {
    ZERO,
    ONE,
    RHO_MAX,
    type Complex,
    abs,
    add,
    mul,
    conj,
    div,
    clampToDisk,
    apply,
    applyInverse,
    translate,
    translationFromTo,
    mobiusFromFn,
    hDistance,
    placeChild,
    geodesic,
} from "$lib/layout/hyperbolic/poincare";

const TOL = 1e-9;

function close(a: number, b: number, tol: number = TOL): void {
    expect(Math.abs(a - b)).toBeLessThan(tol);
}

function closeC(a: Complex, b: Complex, tol: number = TOL): void {
    close(a.re, b.re, tol);
    close(a.im, b.im, tol);
}

describe("complex arithmetic", () => {
    it("add / mul / div round-trip", () => {
        const a: Complex = { re: 1.2, im: -0.4 };
        const b: Complex = { re: 0.3, im: 0.7 };
        const product = mul(a, b);
        closeC(div(product, b), a);
        closeC(div(add(a, b), { re: 1, im: 0 }), { re: 1.5, im: 0.3 });
    });
    it("conj negates the imaginary part", () => {
        closeC(conj({ re: 0.5, im: -0.8 }), { re: 0.5, im: 0.8 });
    });
});

describe("clampToDisk", () => {
    it("leaves points inside the disk untouched", () => {
        const z: Complex = { re: 0.3, im: 0.4 };
        closeC(clampToDisk(z), z);
    });
    it("clamps boundary-or-beyond points to RHO_MAX, preserving direction", () => {
        const z: Complex = { re: 0.6, im: 0.8 }; // |z| = 1
        const out = clampToDisk(z);
        close(abs(out), RHO_MAX);
        // direction preserved: out / RHO_MAX should equal the original unit vector.
        close(out.re / abs(out), 0.6);
        close(out.im / abs(out), 0.8);
    });
});

describe("Möbius transforms", () => {
    it("translate(p) sends p to the origin", () => {
        const p: Complex = { re: 0.3, im: -0.2 };
        closeC(apply(translate(p), p), ZERO);
    });
    it("apply / applyInverse round-trip", () => {
        const m = { a: { re: 0.4, im: -0.1 }, theta: 0.7 };
        const z: Complex = { re: -0.2, im: 0.5 };
        closeC(applyInverse(m, apply(m, z)), z);
        closeC(apply(m, applyInverse(m, z)), z);
    });
    it("preserves the disk: |z|<1 → |T(z)|<1", () => {
        const m = { a: { re: 0.5, im: 0 }, theta: 0 };
        const samples = [
            { re: 0.9, im: 0 },
            { re: 0, im: 0.95 },
            { re: -0.7, im: 0.5 },
        ];
        for (const z of samples) {
            const w = apply(m, z);
            expect(abs(w)).toBeLessThan(1);
        }
    });
});

describe("translationFromTo", () => {
    it("maps `from` onto `to`", () => {
        const a: Complex = { re: 0.2, im: 0.3 };
        const b: Complex = { re: -0.4, im: 0.1 };
        const t = translationFromTo(a, b);
        closeC(t(a), b, 1e-12);
    });
    it("is a disk-preserving map", () => {
        const t = translationFromTo({ re: 0.3, im: 0 }, { re: -0.5, im: 0.2 });
        for (const z of [ZERO, { re: 0.6, im: 0.5 }, { re: -0.8, im: -0.1 }]) {
            expect(abs(t(z))).toBeLessThan(1);
        }
    });
});

describe("hDistance", () => {
    it("d(z, z) = 0", () => {
        close(hDistance(ZERO, ZERO), 0);
        close(hDistance({ re: 0.4, im: 0.1 }, { re: 0.4, im: 0.1 }), 0);
    });
    it("symmetric", () => {
        const a: Complex = { re: 0.3, im: 0.4 };
        const b: Complex = { re: -0.1, im: 0.2 };
        close(hDistance(a, b), hDistance(b, a));
    });
    it("agrees with the radial formula at origin: d(0, r) = 2·artanh(r)", () => {
        for (const r of [0.1, 0.3, 0.6, 0.9]) {
            close(hDistance(ZERO, { re: r, im: 0 }), 2 * Math.atanh(r));
        }
    });
});

describe("placeChild", () => {
    it("from the origin, walks exactly `distance` units in `angle` direction", () => {
        const d = 0.5;
        const theta = Math.PI / 4;
        const out = placeChild(ZERO, d, theta);
        close(hDistance(ZERO, out), d);
        // disk direction matches the requested angle at origin
        close(Math.atan2(out.im, out.re), theta);
    });
    it("from a non-origin parent, the hyperbolic distance still matches", () => {
        const parent: Complex = { re: 0.3, im: 0.2 };
        const d = 0.4;
        const out = placeChild(parent, d, 1.2);
        close(hDistance(parent, out), d, 1e-9);
    });
    it("never exceeds RHO_MAX", () => {
        // Deep walks should hit the clamp.
        const out = placeChild(ZERO, 30, 0);
        expect(abs(out)).toBeLessThanOrEqual(RHO_MAX + 1e-12);
    });
});

describe("geodesic", () => {
    it("returns a diameter when the two points share the origin's line", () => {
        const g = geodesic({ re: 0.2, im: 0 }, { re: 0.6, im: 0 });
        expect(g.kind).toBe("diameter");
    });
    it("circle is orthogonal to the unit circle: |centre|² = 1 + r²", () => {
        const g = geodesic({ re: 0.3, im: 0.4 }, { re: -0.5, im: 0.2 });
        if (g.kind !== "arc") throw new Error("expected arc");
        const c2 = g.center.re * g.center.re + g.center.im * g.center.im;
        close(c2, 1 + g.radius * g.radius, 1e-10);
    });
    it("endpoints lie on the circle: |z − centre| = r for both z1 and z2", () => {
        const z1: Complex = { re: 0.3, im: 0.4 };
        const z2: Complex = { re: -0.5, im: 0.2 };
        const g = geodesic(z1, z2);
        if (g.kind !== "arc") throw new Error("expected arc");
        close(Math.hypot(z1.re - g.center.re, z1.im - g.center.im), g.radius, 1e-10);
        close(Math.hypot(z2.re - g.center.re, z2.im - g.center.im), g.radius, 1e-10);
    });
    it("identifier checks: ONE constant", () => {
        // Sanity ping so the exported ONE actually points where we expect.
        expect(ONE.re).toBe(1);
        expect(ONE.im).toBe(0);
    });
});

describe("mobiusFromFn", () => {
    it("recovers the identity transform", () => {
        const m = mobiusFromFn((z) => z);
        closeC(m.a, ZERO, 1e-6);
        close(m.theta, 0, 1e-6);
    });

    it("recovers a pure translation", () => {
        const orig = translate({ re: 0.3, im: -0.2 });
        const m = mobiusFromFn((z) => apply(orig, z));
        closeC(m.a, orig.a, 1e-6);
        close(m.theta, 0, 1e-6);
    });

    it("recovers a translation+rotation composition", () => {
        // Compose two pure translations: result picks up a rotation (Berry-
        // like). The composed function must round-trip through mobiusFromFn
        // with sample points matching the original on more than just z=0.
        const t1 = translate({ re: 0.2, im: 0.1 });
        const t2 = translate({ re: -0.1, im: 0.3 });
        const composed = (z: Complex) => apply(t2, apply(t1, z));
        const m = mobiusFromFn(composed);
        const samples: Complex[] = [
            { re: 0.0, im: 0.0 },
            { re: 0.25, im: 0.0 },
            { re: -0.1, im: 0.4 },
            { re: 0.3, im: -0.2 },
        ];
        for (const z of samples) {
            closeC(apply(m, z), composed(z), 1e-5);
        }
    });
});
