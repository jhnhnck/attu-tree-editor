/*
 * FamilyTreeEditor - Phase 1 N-partner geometry spike
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * This is the spike that picks the primary N-partner primitive (bus
 * vs ring vs polygon) per the relationship-vocabulary plan's Phase 1
 * decision. The test exercises all three primitives against the six
 * synthetic fixtures from the plan and scores each (primitive,
 * fixture) pair against a written rubric. The lowest-scoring
 * primitive across all fixtures is the winner.
 *
 * Rubric (lower is better; see plan Phase 1 §"Spike — N-partner
 * geometry decision"):
 *
 *   edgeCount    — N edges = clean; N(N-1)/2 = busy at N≥4.
 *   totalLength  — sum of edge lengths in unit space; lower is more
 *                   compact (and less likely to fight family-view's
 *                   bounded fit-zoom).
 *   crossings    — pairs of edges that intersect (excluding shared
 *                   endpoints). 0 = clean; higher = visual mess.
 *   tailCount    — tails are off-rank partner legs; not bad per se
 *                   but penalises non-coplanar layouts under bus.
 *
 * Total score = edgeCount + crossings*5 + tailCount + totalLength/3.
 * Crossings are weighted heavily because they're the dominant
 * legibility cost.
 */

import { describe, expect, it } from "vitest";
import {
    computeManifold,
    PRIMARY_PRIMITIVE,
    type NPartnerPrimitive,
    type PartnerPos,
} from "$lib/layout/engines/family-view/nPartnerGeometry";

// ── Synthetic fixtures ────────────────────────────────────────────────

/** Fixture 1: 3-partner triad (closed). All coplanar. */
const triad: readonly PartnerPos[] = [
    { personId: "A", x: 0, y: 0 },
    { personId: "B", x: 2, y: 0 },
    { personId: "C", x: 1, y: 0 },
];

/** Fixture 2: 4-partner closed quad. All coplanar, evenly spaced. */
const quad: readonly PartnerPos[] = [
    { personId: "A", x: 0, y: 0 },
    { personId: "B", x: 2, y: 0 },
    { personId: "C", x: 4, y: 0 },
    { personId: "D", x: 6, y: 0 },
];

/**
 * Fixture 3: V-polycule. Three partners; A–B and B–C are bonded but
 * A–C is not. For the spike's purposes the three primitives are still
 * compared as if it were closed — the rendering caller would emit
 * just pair-bonds for an OPEN polycule. This fixture proves the
 * primitives don't crash on a centroid-aligned three-person set with
 * one collinear node.
 */
const vPolycule: readonly PartnerPos[] = [
    { personId: "A", x: 0, y: 0 },
    { personId: "B", x: 2, y: 0 },
    { personId: "C", x: 4, y: 0 },
];

/** Fixture 4: vee-and-pivot. B is the pivot; A, C, D all bonded to B. */
const veePivot: readonly PartnerPos[] = [
    { personId: "A", x: 0, y: 0 },
    { personId: "B", x: 2, y: 0 },
    { personId: "C", x: 4, y: 0 },
    { personId: "D", x: 6, y: 0 },
];

/** Fixture 5: 6-partner closed group. Stress test. */
const sixGroup: readonly PartnerPos[] = [
    { personId: "A", x: 0, y: 0 },
    { personId: "B", x: 2, y: 0 },
    { personId: "C", x: 4, y: 0 },
    { personId: "D", x: 6, y: 0 },
    { personId: "E", x: 8, y: 0 },
    { personId: "F", x: 10, y: 0 },
];

/** Fixture 6: single-partner degenerate. */
const single: readonly PartnerPos[] = [{ personId: "A", x: 0, y: 0 }];

const FIXTURES = [
    { name: "triad", partners: triad },
    { name: "quad", partners: quad },
    { name: "vPolycule", partners: vPolycule },
    { name: "veePivot", partners: veePivot },
    { name: "sixGroup", partners: sixGroup },
    { name: "single", partners: single },
] as const;

const PRIMITIVES: readonly NPartnerPrimitive[] = ["bus", "ring", "polygon"];

// ── Rubric helpers ────────────────────────────────────────────────────

function edgeLength(edge: {
    from: { x: number; y: number };
    to: { x: number; y: number };
}): number {
    const dx = edge.to.x - edge.from.x;
    const dy = edge.to.y - edge.from.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Count pairs of edges that visually cross. We use a simple
 * line-segment intersection check that excludes shared endpoints
 * (so two edges meeting at a partner aren't counted as crossing).
 */
function countCrossings(
    edges: readonly {
        from: { x: number; y: number };
        to: { x: number; y: number };
        endpoints: readonly [string, string] | null;
    }[],
): number {
    let count = 0;
    for (let i = 0; i < edges.length; i += 1) {
        for (let j = i + 1; j < edges.length; j += 1) {
            const a = edges[i]!;
            const b = edges[j]!;
            // Skip if the two edges share a partner endpoint (they touch, not cross).
            if (a.endpoints && b.endpoints) {
                if (
                    a.endpoints[0] === b.endpoints[0] ||
                    a.endpoints[0] === b.endpoints[1] ||
                    a.endpoints[1] === b.endpoints[0] ||
                    a.endpoints[1] === b.endpoints[1]
                ) {
                    continue;
                }
            }
            if (segmentsIntersect(a.from, a.to, b.from, b.to)) count += 1;
        }
    }
    return count;
}

function segmentsIntersect(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number },
): boolean {
    const d1 = direction(p3, p4, p1);
    const d2 = direction(p3, p4, p2);
    const d3 = direction(p1, p2, p3);
    const d4 = direction(p1, p2, p4);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
    }
    return false;
}

function direction(
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
): number {
    return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

function scoreGeometry(
    edges: readonly {
        from: { x: number; y: number };
        to: { x: number; y: number };
        endpoints: readonly [string, string] | null;
    }[],
): { edgeCount: number; totalLength: number; crossings: number; tailCount: number; score: number } {
    const edgeCount = edges.length;
    const totalLength = edges.reduce((s, e) => s + edgeLength(e), 0);
    const crossings = countCrossings(edges);
    const tailCount = edges.filter((e) => e.endpoints === null).length;
    const score = edgeCount + crossings * 5 + tailCount + totalLength / 3;
    return { edgeCount, totalLength, crossings, tailCount, score };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("N-partner geometry primitives", () => {
    it("every primitive handles every fixture without crashing", () => {
        for (const fixture of FIXTURES) {
            for (const primitive of PRIMITIVES) {
                const result = computeManifold(primitive, fixture.partners);
                expect(result.edges).toBeDefined();
                expect(result.childAnchor).toBeDefined();
                expect(typeof result.childAnchor.x).toBe("number");
                expect(typeof result.childAnchor.y).toBe("number");
            }
        }
    });

    it("single-partner degenerate emits zero edges for every primitive", () => {
        for (const primitive of PRIMITIVES) {
            const result = computeManifold(primitive, single);
            expect(result.edges).toEqual([]);
            expect(result.childAnchor).toEqual({ x: 0, y: 0 });
        }
    });

    it("N=2 collapses to a single edge for every primitive", () => {
        const pair: readonly PartnerPos[] = [
            { personId: "A", x: 0, y: 0 },
            { personId: "B", x: 2, y: 0 },
        ];
        for (const primitive of PRIMITIVES) {
            const result = computeManifold(primitive, pair);
            expect(result.edges).toHaveLength(1);
            expect(result.edges[0]!.endpoints).toEqual(["A", "B"]);
        }
    });

    it("bus emits 1 bar for coplanar partners; adds tails when partners straddle ranks", () => {
        // Coplanar (all y=0): bar only.
        const triadResult = computeManifold("bus", triad);
        expect(triadResult.edges).toHaveLength(1);

        // Non-coplanar: bar runs at centroid y; every off-centroid partner
        // gets a tail. With three partners at distinct y values, the
        // centroid is between all three, so all three get tails: 1 bar + 3
        // tails = 4 edges.
        const mixed: readonly PartnerPos[] = [
            { personId: "A", x: 0, y: 0 },
            { personId: "B", x: 2, y: 0 },
            { personId: "C", x: 1, y: 1 },
        ];
        const mixedResult = computeManifold("bus", mixed);
        expect(mixedResult.edges).toHaveLength(4);
        expect(mixedResult.edges.filter((e) => e.endpoints === null)).toHaveLength(4);
    });

    it("ring emits N edges (one per neighbour pair)", () => {
        for (const fixture of [triad, quad, sixGroup]) {
            const result = computeManifold("ring", fixture);
            expect(result.edges).toHaveLength(fixture.length);
        }
    });

    it("polygon emits N*(N-1)/2 edges", () => {
        expect(computeManifold("polygon", triad).edges).toHaveLength(3); // 3*2/2
        expect(computeManifold("polygon", quad).edges).toHaveLength(6); // 4*3/2
        expect(computeManifold("polygon", sixGroup).edges).toHaveLength(15); // 6*5/2
    });
});

describe("N-partner geometry spike — frozen decision", () => {
    it("ranks the primitives across all fixtures (lowest score wins)", () => {
        const totals: Record<NPartnerPrimitive, number> = { bus: 0, ring: 0, polygon: 0 };
        const breakdown: { primitive: NPartnerPrimitive; fixture: string; score: number }[] = [];

        for (const fixture of FIXTURES) {
            // Skip degenerate fixtures from the rubric — they collapse to
            // 0 or 1 edges for every primitive and don't discriminate.
            if (fixture.partners.length < 3) continue;

            for (const primitive of PRIMITIVES) {
                const result = computeManifold(primitive, fixture.partners);
                const s = scoreGeometry(result.edges);
                totals[primitive] += s.score;
                breakdown.push({ primitive, fixture: fixture.name, score: s.score });
            }
        }

        // Capture the rubric breakdown to stdout for the bug-log record.
        // (The plan's Phase 1 DoD asks for the score table.)
        // eslint-disable-next-line no-console
        console.log("[n-partner-spike] rubric totals:", totals);
        // eslint-disable-next-line no-console
        console.log("[n-partner-spike] per-fixture breakdown:", breakdown);

        // The frozen decision in nPartnerGeometry.ts is PRIMARY_PRIMITIVE.
        // This test asserts the decision matches the rubric: PRIMARY_PRIMITIVE
        // should be the lowest-scoring primitive across all fixtures.
        const winner = (Object.entries(totals) as [NPartnerPrimitive, number][]).reduce(
            (best, [p, s]) => (s < best[1] ? [p, s] : best),
            ["bus", Infinity] as [NPartnerPrimitive, number],
        )[0];

        expect(
            winner,
            `Rubric winner is ${winner} but frozen decision is ${PRIMARY_PRIMITIVE}; ` +
                `update PRIMARY_PRIMITIVE in nPartnerGeometry.ts or revisit the rubric weights.`,
        ).toBe(PRIMARY_PRIMITIVE);
    });
});
