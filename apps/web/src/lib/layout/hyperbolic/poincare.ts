/*
 * FamilyTreeEditor - Poincaré-disk primitives for the hyperbolic engine.
 *
 * Promoted from `lib/layout/spikes/hyperbolic.ts` in Phase 5.1. The spike
 * version remains in place as the Phase-2 validation artefact (frozen
 * fixture for `tests/spikes/hyperbolic.spike.test.ts`); production code
 * imports from here.
 *
 * Coordinate conventions:
 *   - Math angles. 0 rad = +x axis; π/2 rad = +y axis.
 *   - Poincaré disk: open unit disk |z| < 1.
 *   - Möbius transforms used here all preserve the unit disk:
 *       T(z) = e^{iθ} (z − a) / (1 − ā z),  with |a| < 1.
 *
 * Numerical caveats:
 *   - `placeChild` clamps the result to |z| ≤ RHO_MAX so downstream
 *     consumers never see exactly 1.
 *   - For depths past ~20 generations at constant step the float64 floor
 *     starts compressing sibling separation; the renderer's natural
 *     `1 - |z|²` fisheye masks most of the symptom. Phase 2 spike measured
 *     the cutoff (66 generations at D=0.08) — see
 *     `tests/spikes/hyperbolic-spike-report.md`.
 *
 * Module-level conventions for Phase 5 callers:
 *   - All inputs/outputs are immutable `Complex` records. Mutate-in-place
 *     hot loops should keep a private scratch object; never reuse instances
 *     across return boundaries.
 *   - Functions are pure: safe to import from the worker.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

export interface Complex {
    readonly re: number;
    readonly im: number;
}

export const ZERO: Complex = { re: 0, im: 0 };
export const ONE: Complex = { re: 1, im: 0 };

/** Layout never lets |z| reach 1; this is the clamp value. */
export const RHO_MAX = 1 - 1e-9;

// ---------------------------------------------------------------------------
// Basic complex arithmetic
// ---------------------------------------------------------------------------

export function add(a: Complex, b: Complex): Complex {
    return { re: a.re + b.re, im: a.im + b.im };
}

export function sub(a: Complex, b: Complex): Complex {
    return { re: a.re - b.re, im: a.im - b.im };
}

export function mul(a: Complex, b: Complex): Complex {
    return {
        re: a.re * b.re - a.im * b.im,
        im: a.re * b.im + a.im * b.re,
    };
}

export function conj(a: Complex): Complex {
    return { re: a.re, im: -a.im };
}

export function abs(a: Complex): number {
    return Math.hypot(a.re, a.im);
}

export function abs2(a: Complex): number {
    return a.re * a.re + a.im * a.im;
}

export function div(a: Complex, b: Complex): Complex {
    const den = abs2(b);
    return {
        re: (a.re * b.re + a.im * b.im) / den,
        im: (a.im * b.re - a.re * b.im) / den,
    };
}

/** Multiply a complex by a real scalar. */
export function scale(a: Complex, s: number): Complex {
    return { re: a.re * s, im: a.im * s };
}

/** Clamp |z| to RHO_MAX, preserving direction. */
export function clampToDisk(z: Complex): Complex {
    const r = abs(z);
    if (r < RHO_MAX) return z;
    return scale(z, RHO_MAX / r);
}

// ---------------------------------------------------------------------------
// Möbius primitives
// ---------------------------------------------------------------------------

/**
 * A disk-preserving Möbius transform parametrised as
 *   T(z) = e^{iθ} (z - a) / (1 - ā z)
 * where `a` is the point that maps to 0 and θ is an additional rotation.
 */
export interface Mobius {
    readonly a: Complex;
    readonly theta: number;
}

/** The identity transform. */
export const ID: Mobius = { a: ZERO, theta: 0 };

/** Build a translation that sends `p` to the origin (no rotation). */
export function translate(p: Complex): Mobius {
    return { a: p, theta: 0 };
}

/** Apply a Möbius transform to a point. */
export function apply(m: Mobius, z: Complex): Complex {
    const eit: Complex = { re: Math.cos(m.theta), im: Math.sin(m.theta) };
    const num = mul(eit, sub(z, m.a));
    const den = sub(ONE, mul(conj(m.a), z));
    return div(num, den);
}

/**
 * Inverse of `apply(m, ·)`: given T(z) = e^{iθ} (z − a) / (1 − ā z), returns
 * the z that produced `w`:
 *
 *   w = T(z)  ⇒  z = (e^{-iθ} w + a) / (1 + ā · e^{-iθ} w)
 *
 * Computed directly rather than via a re-parametrised Möbius — cheaper and
 * avoids constructing an intermediate Mobius record.
 */
export function applyInverse(m: Mobius, w: Complex): Complex {
    const eitN: Complex = { re: Math.cos(m.theta), im: -Math.sin(m.theta) };
    const num = add(mul(eitN, w), m.a);
    const den = add(ONE, mul(conj(m.a), mul(eitN, w)));
    return div(num, den);
}

/**
 * Translation that moves `from` onto `to` while preserving disk-orientation.
 * Used by the viewer for drag-pan and click-recenter — the transform is
 * derived from the start + end of the gesture rather than parametrised as
 * (a, θ) directly.
 *
 * Construction: T1 maps `from` → 0; T2 maps 0 → `to`. Compose: T2 ∘ T1.
 * The Mobius `(a, θ)` form is too narrow for this composition, so we
 * return a one-shot transform function instead of a Mobius record.
 */
export function translationFromTo(from: Complex, to: Complex): (z: Complex) => Complex {
    const t1: Mobius = { a: from, theta: 0 };
    return (z) => {
        const w = apply(t1, z);
        // 0 → to is the inverse of "to → 0".
        return applyInverse({ a: to, theta: 0 }, w);
    };
}

// ---------------------------------------------------------------------------
// Hyperbolic measurement
// ---------------------------------------------------------------------------

/**
 * Hyperbolic distance between two points on the Poincaré disk:
 *   d(z1, z2) = 2 · artanh(|(z1 - z2) / (1 - z̄2 · z1)|)
 */
export function hDistance(z1: Complex, z2: Complex): number {
    const num = abs(sub(z1, z2));
    const den = abs(sub(ONE, mul(conj(z2), z1)));
    const r = num / den;
    if (r >= 1) return Infinity;
    return 2 * Math.atanh(r);
}

// ---------------------------------------------------------------------------
// Child placement
// ---------------------------------------------------------------------------

/**
 * Place a child at hyperbolic distance `distance` from `parent`, walking
 * in disk-coord direction `angle` (radians).
 *
 * Algorithm: the Möbius `M_p(z) = (z − parent) / (1 − parent̄ · z)` maps
 * `parent` to 0. At origin, walking distance d in direction θ lands at
 * `tanh(d/2) · e^{iθ}` (since the disk metric is conformal at 0, disk-
 * coord directions match hyperbolic-tangent directions there). Apply
 * `M_p^{-1}` to return to disk coords:
 *   M_p^{-1}(w) = (w + parent) / (1 + parent̄ · w)
 *
 * The result is clamped to |z| ≤ RHO_MAX.
 */
export function placeChild(parent: Complex, distance: number, angle: number): Complex {
    const r = Math.tanh(distance / 2);
    const local: Complex = {
        re: r * Math.cos(angle),
        im: r * Math.sin(angle),
    };
    const num = add(local, parent);
    const den = add(ONE, mul(conj(parent), local));
    return clampToDisk(div(num, den));
}

// ---------------------------------------------------------------------------
// Geodesics (for rendering)
// ---------------------------------------------------------------------------

/**
 * Description of the geodesic arc between two disk points. The arc is
 * a Euclidean circle orthogonal to the unit circle, parametrised by
 * (centre, radius). For points along the same diameter, returns a
 * straight-line representation (`kind: "diameter"`).
 */
export type Geodesic =
    | {
          readonly kind: "arc";
          readonly center: Complex;
          readonly radius: number;
          /** Start + end points (matching input order). */
          readonly from: Complex;
          readonly to: Complex;
      }
    | {
          readonly kind: "diameter";
          readonly from: Complex;
          readonly to: Complex;
      };

/**
 * Compute the geodesic between two disk points. Returns a `diameter`
 * representation when the two points lie on a line through the origin
 * (no circular arc exists in that case).
 *
 * Derivation: a Poincaré geodesic is a Euclidean circle orthogonal to
 * the unit circle. The circle through z1, z2, and the inverse-by-unit-circle
 * of z1 (= 1/z̄1) is orthogonal to the unit circle and passes through
 * both endpoints — three points uniquely determine a circle.
 */
export function geodesic(z1: Complex, z2: Complex): Geodesic {
    // Collinear-with-origin check: cross product of position vectors.
    const cross = z1.re * z2.im - z1.im * z2.re;
    if (Math.abs(cross) < 1e-12) {
        return { kind: "diameter", from: z1, to: z2 };
    }
    const inv1 = div(ONE, conj(z1));
    const p1 = z1;
    const p2 = z2;
    const p3 = inv1;
    const a1 = abs2(p1);
    const a2 = abs2(p2);
    const a3 = abs2(p3);
    // Three points (xi,yi) → centre via determinant:
    //   D  = 2 [x1(y2-y3) + x2(y3-y1) + x3(y1-y2)]
    //   cx = [a1(y2-y3) + a2(y3-y1) + a3(y1-y2)] / D
    //   cy = [a1(x3-x2) + a2(x1-x3) + a3(x2-x1)] / D
    const d = 2 * (p1.re * (p2.im - p3.im) + p2.re * (p3.im - p1.im) + p3.re * (p1.im - p2.im));
    const cx = (a1 * (p2.im - p3.im) + a2 * (p3.im - p1.im) + a3 * (p1.im - p2.im)) / d;
    const cy = (a1 * (p3.re - p2.re) + a2 * (p1.re - p3.re) + a3 * (p2.re - p1.re)) / d;
    const center: Complex = { re: cx, im: cy };
    const radius = Math.hypot(z1.re - cx, z1.im - cy);
    return { kind: "arc", center, radius, from: z1, to: z2 };
}
