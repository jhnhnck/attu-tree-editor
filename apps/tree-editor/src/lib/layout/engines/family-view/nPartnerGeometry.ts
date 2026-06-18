/*
 * FamilyTreeEditor - N-partner union geometry primitives (Phase 1 spike)
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * Phase 1 of the relationship-vocabulary plan
 * (notes/plans/relationship-vocabulary.md). The plan's central design
 * decision is **which geometric primitive renders an N-partner union**.
 * Three candidates:
 *
 *   - `bus`: a horizontal bar through all partners on the same rank
 *     with short tails for off-rank partners. Child drops hang from
 *     the bar centroid. Scales to N=6 cleanly; works for closed and
 *     open polycules.
 *
 *   - `ring`: a closed ring connecting every partner to its two ring
 *     neighbours. Looks symmetric for N=3 (triangle), N=4 (quad).
 *     Edge count is N. Children drop from the ring centroid.
 *
 *   - `polygon`: like ring but with chord edges (every partner to
 *     every other partner). Edge count is N*(N-1)/2. Visually dense
 *     even at N=4; only really sensible at N=3.
 *
 * This module computes the **edge set** for each primitive against an
 * abstract partner-position list. The renderer in family-view's
 * `layout.ts` consumes the chosen primitive once the spike picks one.
 *
 * Today: the spike's frozen decision (recorded in this plan's bug
 * log) is `bus`. See `PRIMARY_PRIMITIVE` below. The other primitives
 * remain implemented so the test suite can prove the decision and
 * so a future Phase 1 revisit can switch primitives without a code
 * search.
 */

import type { PersonId } from "$lib/domain/types";

/** Available geometry primitives. */
export type NPartnerPrimitive = "bus" | "ring" | "polygon";

/**
 * Phase 1's frozen primary primitive. Used by `layout.ts` when
 * emitting union-manifold geometry for unions with `partnerIds.length
 * >= 2`. Picked via the spike's rubric (see
 * `notes/plans/relationship-vocabulary.md` Phase 1 bug-log decisions).
 */
export const PRIMARY_PRIMITIVE: NPartnerPrimitive = "bus";

/** A partner's 2D position in unit space at union-time. */
export interface PartnerPos {
    readonly personId: PersonId;
    readonly x: number;
    readonly y: number;
}

/** One edge segment emitted by a primitive. */
export interface ManifoldEdge {
    /** Stable identifier; primitives append the partner pair to disambiguate. */
    readonly id: string;
    /** Both endpoints in unit space. */
    readonly from: { readonly x: number; readonly y: number };
    readonly to: { readonly x: number; readonly y: number };
    /** Partner ids involved (a:b for pair-edges; null for tail/spoke edges). */
    readonly endpoints: readonly [PersonId, PersonId] | null;
}

/** Geometry pass output: edges + the centroid that children hang from. */
export interface ManifoldGeometry {
    readonly edges: readonly ManifoldEdge[];
    readonly childAnchor: { readonly x: number; readonly y: number };
}

/**
 * Compute the geometry for an N-partner union under the chosen
 * primitive. Single-partner degenerate (N=1) collapses to "no
 * edges; child anchor is the lone partner's position" for every
 * primitive (the renderer still draws a plain drop from the
 * partner). N=2 collapses to a single edge connecting the two
 * partners for every primitive (the renderer draws the standard
 * couple-box).
 */
export function computeManifold(
    primitive: NPartnerPrimitive,
    partners: readonly PartnerPos[],
): ManifoldGeometry {
    if (partners.length === 0) {
        return { edges: [], childAnchor: { x: 0, y: 0 } };
    }
    if (partners.length === 1) {
        const lone = partners[0]!;
        return { edges: [], childAnchor: { x: lone.x, y: lone.y } };
    }
    if (partners.length === 2) {
        const [a, b] = partners as readonly [PartnerPos, PartnerPos];
        return {
            edges: [
                {
                    id: `n-partner:${a.personId}|${b.personId}`,
                    from: { x: a.x, y: a.y },
                    to: { x: b.x, y: b.y },
                    endpoints: [a.personId, b.personId],
                },
            ],
            childAnchor: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
    }

    switch (primitive) {
        case "bus":
            return computeBus(partners);
        case "ring":
            return computeRing(partners);
        case "polygon":
            return computePolygon(partners);
    }
}

/**
 * Bus primitive. One horizontal bar through all partners at the
 * centroid y; short tails for off-rank partners. Child anchor is the
 * bar's midpoint.
 *
 * Scales to large N because edge count is N (one tail per off-rank
 * partner + one bar). Cleanest pick when the partner set is mostly
 * coplanar.
 */
function computeBus(partners: readonly PartnerPos[]): ManifoldGeometry {
    const cx = partners.reduce((s, p) => s + p.x, 0) / partners.length;
    const cy = partners.reduce((s, p) => s + p.y, 0) / partners.length;

    const minX = Math.min(...partners.map((p) => p.x));
    const maxX = Math.max(...partners.map((p) => p.x));

    const edges: ManifoldEdge[] = [
        {
            id: `n-partner:bus:bar`,
            from: { x: minX, y: cy },
            to: { x: maxX, y: cy },
            endpoints: null,
        },
    ];
    for (const p of partners) {
        // Tail from partner to the bar. Off-rank partners get a
        // visible vertical leg; on-rank partners get a zero-length
        // tail that the renderer can skip.
        if (Math.abs(p.y - cy) > 0.001) {
            edges.push({
                id: `n-partner:bus:tail:${p.personId}`,
                from: { x: p.x, y: p.y },
                to: { x: p.x, y: cy },
                endpoints: null,
            });
        }
    }

    return { edges, childAnchor: { x: cx, y: cy } };
}

/**
 * Ring primitive. Each partner connects to its two neighbours in
 * angular order around the centroid; edge count is N. Looks symmetric
 * for triads and quads. Children drop from the centroid.
 */
function computeRing(partners: readonly PartnerPos[]): ManifoldGeometry {
    const cx = partners.reduce((s, p) => s + p.x, 0) / partners.length;
    const cy = partners.reduce((s, p) => s + p.y, 0) / partners.length;

    // Order partners by angle around the centroid for a non-crossing ring.
    const ordered = [...partners]
        .map((p) => ({ p, angle: Math.atan2(p.y - cy, p.x - cx) }))
        .sort((a, b) => a.angle - b.angle)
        .map((entry) => entry.p);

    const edges: ManifoldEdge[] = [];
    for (let i = 0; i < ordered.length; i += 1) {
        const a = ordered[i]!;
        const b = ordered[(i + 1) % ordered.length]!;
        edges.push({
            id: `n-partner:ring:${a.personId}|${b.personId}`,
            from: { x: a.x, y: a.y },
            to: { x: b.x, y: b.y },
            endpoints: [a.personId, b.personId],
        });
    }

    return { edges, childAnchor: { x: cx, y: cy } };
}

/**
 * Polygon (complete-graph) primitive. Every partner connects to every
 * other partner; edge count is N*(N-1)/2. Visually dense for N≥4 —
 * really only useful at N=3 (where it equals the ring). Kept for the
 * spike's rubric comparison.
 */
function computePolygon(partners: readonly PartnerPos[]): ManifoldGeometry {
    const cx = partners.reduce((s, p) => s + p.x, 0) / partners.length;
    const cy = partners.reduce((s, p) => s + p.y, 0) / partners.length;

    const edges: ManifoldEdge[] = [];
    for (let i = 0; i < partners.length; i += 1) {
        for (let j = i + 1; j < partners.length; j += 1) {
            const a = partners[i]!;
            const b = partners[j]!;
            edges.push({
                id: `n-partner:polygon:${a.personId}|${b.personId}`,
                from: { x: a.x, y: a.y },
                to: { x: b.x, y: b.y },
                endpoints: [a.personId, b.personId],
            });
        }
    }

    return { edges, childAnchor: { x: cx, y: cy } };
}
