# Hyperbolic Lamping-Rao Phase 2 spike

Captured: 2026-05-14T04:06:10.418Z
Proband: EZ5OI (Solurak Garvak)

## DoD checklist

**linear-0.7**:
- ❌ no pixel collisions (12721 pairs within 1 px)
- ❌ deepest gen at |z| = 1.000000 (gen 66)
- ✅ ancestor/descendant halves disjoint (0 bleed)
- ⚠️ hit |z|=1 clamp during layout
**linear-0.2**:
- ❌ no pixel collisions (9213 pairs within 1 px)
- ❌ deepest gen at |z| = 0.999991 (gen 66)
- ✅ ancestor/descendant halves disjoint (0 bleed)
- ✅ never hit |z|=1 clamp
**linear-0.08**:
- ❌ no pixel collisions (370 pairs within 1 px)
- ✅ deepest gen at |z| = 0.985493 (gen 66)
- ✅ ancestor/descendant halves disjoint (0 bleed)
- ✅ never hit |z|=1 clamp

## Scheme comparison

| scheme | nodes | max \|z\| | deepest gen | deepest \|z\| | min pair dist | px collisions | half bleed | hit clamp |
|---|---|---|---|---|---|---|---|---|
| linear-0.7 | 170 | 1.000000 | 66 | 1.000000 | 3.10e-25 | 12721 | 0 | yes |
| linear-0.2 | 170 | 0.999995 | 66 | 0.999991 | 6.58e-8 | 9213 | 0 | no |
| linear-0.08 | 170 | 0.988188 | 66 | 0.985493 | 3.52e-5 | 370 | 0 | no |

## Hourglass wedge negotiation — algorithm used

Phase 5's full implementation will lift this directly.

1. **Build two subtrees from the proband.** Ancestors via BFS up
   parent-chain (motherId, fatherId at each step); descendants via BFS
   down the inverted children-of map. Each subtree is treated as
   unidirectional for the recursive Lamping-Rao step.
2. **Place the proband at z = 0** with no outward direction (it's
   shared by both halves).
3. **Allocate each half-disk a 180° wedge.** Ancestors get outward =
   +π/2 (upper half, math y > 0); descendants get outward = −π/2
   (lower half, math y < 0). Each half runs Lamping-Rao independently.
4. **Recursive wedge allocation.** At each node N with position z_N,
   outward direction θ_N, and allocated wedge W_N, partition W_N
   across children proportional to `log(1 + subtreeSize(child))`.
   Each child gets a sub-wedge `[θ_i − α_i, θ_i + α_i]` where θ_i
   is the sub-wedge centre.
5. **Walk to each child.** Step `D` hyperbolic units from z_N in
   disk direction θ_i. Implementation: Möbius `M(z) = (z − z_N) /
   (1 − z̄_N · z)` maps z_N to origin; at origin walking distance D
   in direction θ lands at `tanh(D/2) · e^{iθ}`; apply M⁻¹ to bring
   the result back to disk coords. Child's outward direction is θ_i.
6. **Recurse.** The child's outward becomes the new θ; its allocated
   wedge becomes the new W.

Two parameters tune the result:
- **stepDistance D** — hyperbolic distance per generation. Linear:
  constant D. Log: `D · log₂(1 + gen)` so deeper generations spread
  faster and stay distinguishable.
- **wedge weight = log(1 + size)** — keeps dense subtrees from
  monopolizing space while still giving them more than sparse ones.

Cross-side negotiation is _trivial_ because the proband sits exactly
on the line between the two half-wedges. No special-case needed for
the equator. The two halves can't bleed unless `placeChild` ends up
in the wrong half — which only happens at the disk boundary, where
the clamp catches it.

## Float64 precision floor

- **linear-0.7**: gen 66 reaches |z| = 1.000000 — at or past the 0.999 boundary clip; **Phase 5 needs log-distance scaling or a generation cap**.
- **linear-0.2**: gen 66 reaches |z| = 0.999991 — at or past the 0.999 boundary clip; **Phase 5 needs log-distance scaling or a generation cap**.
- **linear-0.08**: gen 66 sits at |z| = 0.985493 — below the 0.999 boundary clip with margin to spare.

## Phase 5 implications

- Promote `lib/layout/spikes/hyperbolic.ts` to
  `lib/layout/hyperbolic/poincare.ts` (rename + keep exports).
- Promote `lib/layout/spikes/lamping-rao.ts` to
  `lib/layout/engines/hyperbolic-lr/layout.ts`. Pick the linear
  scheme if it passed DoD; otherwise commit to log-distance.
- The geodesic primitive (`geodesic(z1, z2)`) is used for the SVG
  fixture; Phase 5.4 uses the same function to emit `EdgeRoute`
  primitives of kind `geodesic-arc`.
- Spouses, siblings, aunts/uncles, cousins are NOT placed by this
  spike. Phase 5 needs an explicit decision: weave them into the
  ancestor / descendant subtree (e.g. attach a spouse to their
  partner's slot), render them in a thin neutral zone at the
  equator, or hide them altogether at default zoom.
