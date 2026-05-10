---
name: hyperbolic-geometry
description: Math + algorithmic conventions for the Poincaré-disk hyperbolic tree mode (Lamping-Rao hourglass on pedigree DAGs). Trigger when editing or designing hyperbolic engine code, Möbius transforms, geodesic edges, drag-pan, wedge allocation, or anything under `lib/layout/hyperbolic/` or `engines/hyperbolic-lr/`. Also when answering questions about float64 precision near the disk boundary, what gen-depth a fixture has, or why a deep ancestor lands on top of its sibling.
---

# Hyperbolic geometry — the project's conventions

Phase 2 spike (10 May 2026) lifted the math from Lamping & Rao 1996 and
adapted it for pedigree DAGs. Phase 5 promotes that code into production.
This skill captures the conventions so the next session editing it
doesn't re-derive them.

Spike artefacts (read these first when picking up hyperbolic work):
- `apps/web/src/lib/layout/spikes/hyperbolic.ts` — primitives.
- `apps/web/src/lib/layout/spikes/lamping-rao.ts` — algorithm.
- `apps/web/tests/spikes/hyperbolic.spike.test.ts` — runs on DEMO.
- `apps/web/tests/spikes/hyperbolic-spike-report.md` — measurements + the
  pivotal "D=0.08 keeps gen-66 under |z|<0.999" finding.
- `apps/web/tests/fixtures/hyperbolic-demo.svg` — static fixture; Phase 5
  regression-checks the viewer against this.

## Coordinate conventions

- **Math angles**, not screen angles. 0° = +x, 90° = +y. Counterclockwise.
- **SVG y flips**: the spike's SVG writer projects `math y → SVG (cy − y)`
  so descendants (math y < 0) render at the bottom of the screen. Phase 5
  must keep this convention or the hourglass renders upside-down.
- **Poincaré disk**: open unit disk |z| < 1. The boundary is the "circle
  at infinity" — hyperbolically unreachable.
- **`Complex` type**: `{ re: number, im: number }`. Stored as a plain
  object, not a tagged union. `add/sub/mul/div/conj/abs/abs2/scale` are
  free functions, no methods. Wire format for postMessage: `[re, im]`
  tuples (matches the original plan's interface contract).

## Möbius primitives

The Möbius transforms we use all preserve the unit disk:

```
T(z) = e^{iθ} (z − a) / (1 − ā z),  with |a| < 1
```

- `a` is the point that maps to 0.
- `θ` is an additional rotation applied after the translation.
- **Translation only** (the common case): θ = 0. `translate(a)` builds
  one; `apply(t, z)` evaluates; `applyInverse(t, w)` does the inverse.

**Inverse derivation** — for reference when debugging:
```
w = T(z) ⇒ z = (e^{-iθ} w + a) / (1 + ā e^{-iθ} w)
```

The spike implements this directly in `applyInverse` rather than
re-parametrising as a new (a, θ) — the re-parametrisation is messy
algebraically and we don't need to compose inverses with anything in
the Lamping-Rao pass.

**SU(1,1) matrix form** — not used yet. The plan called for it for
"numerical stability across many compositions"; the spike doesn't
compose, so it didn't matter. Phase 5 needs it if drag-pan accumulates
hundreds of frames of Möbius translations and float64 starts drifting.
The pattern is: each disk-preserving Möbius corresponds to a 2×2
matrix `[α, β; β̄, ᾱ]` with `|α|² − |β|² = 1`. Composition is matrix
multiplication; inverse is the adjugate.

## Hyperbolic distance

```
d(z₁, z₂) = 2 · artanh(|(z₁ − z₂) / (1 − z̄₂ · z₁)|)
```

In code: `hDistance(z1, z2)`. Returns `Infinity` for points at the
boundary (numerator ≥ denominator). Use this — NEVER `Math.hypot` —
when measuring "how far apart" two disk points are for layout
decisions.

## Geodesics

A Poincaré geodesic between z₁ and z₂ is either:
- A **circular arc** orthogonal to the unit circle (if z₁, z₂ are not
  collinear with the origin).
- A **diameter** (straight line through origin) otherwise.

The spike's `geodesic(z1, z2)` returns a discriminated union; SVG
rendering uses the `A` (arc) command for the circular case and `L`
(line) for the diameter case.

**SVG arc sweep flag**: for a math angle that goes counter-clockwise
from z₁ to z₂ on the arc, the SVG sweep flag is 1 (because SVG's y is
inverted vs math). The spike picks the flag by computing the
cross-product of (z₂ − z₁) and (centre − z₁) and choosing the sign
that gives the SHORTER arc (large-arc-flag always 0).

## Numerical caveats

The single most important constraint: **|z| approaches 1 exponentially
fast under repeated `placeChild` calls.** Walking N generations of
hyperbolic step D from origin radially yields |z| = tanh(N · D / 2).

| D | gen-10 \|z\| | gen-50 \|z\| | gen-66 \|z\| |
|---|---|---|---|
| 0.7 | 0.9999984 | 1.0 (clamp) | 1.0 (clamp) |
| 0.2 | 0.7616 | 0.9999984 | 0.999991 |
| 0.08 | 0.3799 | 0.9051 | 0.9855 |

- **Clamp**: `RHO_MAX = 1 - 1e-9`. `clampToDisk(z)` enforces it.
  `placeChild` calls it on its return value.
- **Pixel collisions** near the boundary are inevitable for deep
  ancestries with constant D. The spike found 370 pairs within 1 px on
  Akarians at D=0.08 (66-gen proband, 170 nodes). The remedy in Phase 5
  is *not* a tighter D — it's:
  - **DOI clustering** (Phase 6): collapse low-DOI deep nodes into
    glyphs.
  - **Möbius pan/zoom** at the viewer: drag the proband off-centre to
    magnify whichever boundary region is interesting.
- **`Math.atanh` near 1**: returns `Infinity` for arguments ≥ 1. Always
  check `hDistance` against `Infinity` before using its result in
  arithmetic.
- **Map iteration order**: not deterministic in node when keys are
  inserted then deleted. Sort keys before iterating if reproducibility
  matters (e.g. layout output should be stable across runs).

## Lamping-Rao recursive layout

The textbook algorithm (unidirectional trees):

```
LayoutTree(node, position, outwardDir, wedge, gen):
    children = subtree[node]
    weights = [log(1 + subtreeSize(c)) for c in children]
    total = sum(weights)
    leftEdge = outwardDir - wedge / 2
    for i, c in enumerate(children):
        childWedge = wedge * weights[i] / total
        childCentre = leftEdge + childWedge / 2
        childPos = placeChild(position, D, childCentre)
        LayoutTree(c, childPos, childCentre, childWedge, gen + 1)
        leftEdge += childWedge
```

- **`outwardDir` is a global disk-coord angle**, NOT a local tangent
  angle. We don't track local frames because `placeChild` operates in
  global disk coords and the Möbius `M_p` we use (translation, θ=0) is
  conformal-at-its-source (the Jacobian at z_p is positive real, no
  rotation). So a tangent direction θ at z_p in disk coords corresponds
  to direction θ at origin in M_p's frame — they're the same number.
- **`childOutward = childCentre`**, NOT `outwardDir + (childCentre −
  outwardDir)`. Walking from a node in a global direction sets the
  child's "outward" to that same global direction.
- **`D` (step distance)**: spike measured 0.08 as the sweet spot for
  Akarians' 66-gen depth. Phase 5 should expose this as a tunable;
  for trees of unknown depth, calibrate as
  `D = 2 · artanh(0.99) / maxAncestorDepth(tree)`.

## Hourglass — pedigree-DAG mode

Lamping-Rao was unidirectional. Pedigrees have 2 parents AND N children
per node. Hourglass splits the disk:

1. Build two subtrees from the proband:
   - **Ancestor subtree**: BFS up parent-chain. `subtree[id] = [motherId,
     fatherId]` (filtered to those present + not yet visited).
   - **Descendant subtree**: BFS down `childrenOf` map. `subtree[id] =
     [child ids]` (filtered).
2. Place proband at z=0 with no outward direction (it's shared).
3. Run Lamping-Rao on each subtree independently:
   - Ancestor side: outward = +π/2 (upper half-disk, math y > 0).
   - Descendant side: outward = −π/2 (lower half-disk, math y < 0).
   - Each gets a 180° wedge.
4. Halves cannot bleed unless `placeChild` lands in the wrong half —
   which only happens at the boundary clamp. The spike validated this:
   `halfBleed = 0` across all D values.

**Spouses / siblings / aunts / uncles / cousins are NOT placed by the
spike.** Phase 5 must choose:
- (a) Weave each spouse into their partner's slot (small offset).
- (b) Render them in a thin neutral zone at the equator.
- (c) Hide them at default zoom; reveal on click.

The spike defers this; the report at
`apps/web/tests/spikes/hyperbolic-spike-report.md` flags it.

## Viewer interactions

Reserved for Phase 5.3, but worth recording the math here:

- **Drag-pan = Möbius translation**, NOT screen-space translation. The
  common-and-wrong shortcut is to subtract a `dx, dy` from every card's
  position; that's a Euclidean translation and warps the hyperbolic
  structure. The correct approach:
  - Build `T = translate(currentFocus)` so currentFocus → 0.
  - On drag, build `T_drag = translate(-dragDelta)` (or compose a
    rotation if you want to handle non-horizontal drags).
  - New focus = `apply(T^{-1}, apply(T_drag, ZERO))`.
- **Centre-on-selection** is just `T = translate(selectionZ)` applied
  to every node's position.
- **Zoom**: there's no global "zoom" in the hyperbolic disk — zoom is
  intrinsic to the projection. To "zoom in" on a focus, drag the focus
  to centre (Möbius), and the projection's `1 − |z|²` Jacobian does
  the rest. Avoid adding a multiplicative scale transform on top.
- **Card scale ∝ 1 − |z|²** — the projection Jacobian. Cards near the
  boundary render smaller automatically. Free fisheye.

## Patent + licence

- **Lamping-Rao US patent 5590250: EXPIRED.** No licence constraint.
- **d3-hypertree** has a single-strategy implementation with unclear
  licence; reference the math, don't import the code.
- **Lamping & Rao 1996 extended paper**: the math reference. The spike
  cites it in `hyperbolic.ts` and `lamping-rao.ts` headers.

## What to read first when picking up hyperbolic work

1. The spike report at `apps/web/tests/spikes/hyperbolic-spike-report.md`
   — has the data, the chosen D, the hourglass algorithm, and the
   Phase 5 implications.
2. The two modules in `apps/web/src/lib/layout/spikes/` — they're small
   (~150 LOC each) and self-contained. Phase 5 promotes both.
3. This skill, for the conventions.

Don't re-read Lamping & Rao 1996 unless you need the original wedge-
allocation derivation. The spike's `layoutSubtree` already encodes it.
