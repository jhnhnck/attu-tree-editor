/*
 * FamilyTreeEditor - 30-overlay readability probe (Phase 1)
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * Phase 1 of the relationship-vocabulary plan
 * (notes/plans/relationship-vocabulary.md). Generates 30 synthetic
 * relationship overlays (10 sworn bonds, 10 transformations, 10
 * severances) over random Akarians pairs, runs them through a
 * straight-line bridge-hop routing scheme, and counts how many
 * cross the skeleton.
 *
 * **Outcome drives Phase 4 scope**:
 *   - clean (≤5 skeleton crossings)        → A* stays in non-goals
 *   - readable-but-marginal (≤15)          → A* stays a follow-up
 *   - unreadable (>15 skeleton crossings)  → A* promotes into Phase 4
 *                                             scope (+1.5 days)
 *
 * The probe is informational — no hard assertion that fails CI. The
 * crossing count is logged for the plan's bug log; Phase 4's kickoff
 * reads this number when deciding scope.
 */

// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { FamilyViewEngine } from "$lib/layout/engines/family-view";
import type { PersonId } from "$lib/domain/types";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

interface Point {
    readonly x: number;
    readonly y: number;
}

interface Edge {
    readonly from: Point;
    readonly to: Point;
}

function pickRandomPairs(
    rng: () => number,
    ids: readonly PersonId[],
    count: number,
): readonly { a: PersonId; b: PersonId }[] {
    const pairs: { a: PersonId; b: PersonId }[] = [];
    let safety = 0;
    while (pairs.length < count && safety < count * 10) {
        const i = Math.floor(rng() * ids.length);
        const j = Math.floor(rng() * ids.length);
        if (i === j) {
            safety += 1;
            continue;
        }
        pairs.push({ a: ids[i]!, b: ids[j]! });
        safety += 1;
    }
    return pairs;
}

function seededRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

function segmentsIntersect(a: Edge, b: Edge): boolean {
    const d1 = direction(b.from, b.to, a.from);
    const d2 = direction(b.from, b.to, a.to);
    const d3 = direction(a.from, a.to, b.from);
    const d4 = direction(a.from, a.to, b.to);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function direction(a: Point, b: Point, c: Point): number {
    return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

describe("overlay readability probe — 30 synthetic overlays on Akarians", () => {
    it("counts crossings against the skeleton and decides Phase 4 A* scope", () => {
        const text = readFileSync(FIXTURE, "utf8");
        const { tree } = unwrap(parseGedcom(text));
        const engine = new FamilyViewEngine();
        const layout = engine.layout({ tree, focus: tree.rootId });

        // Build skeleton edges from family-view's emitted layout.
        const skeletonEdges: Edge[] = layout.edges.map((e) => {
            const points = e.points;
            const from = points[0] ?? { x: 0, y: 0 };
            const to = points[points.length - 1] ?? { x: 0, y: 0 };
            return { from, to };
        });

        // Build the position lookup so overlays can target real cards.
        const positions = new Map<PersonId, Point>();
        for (const [id, node] of layout.nodes) {
            positions.set(id, { x: node.x, y: node.y });
        }

        const visibleIds = Array.from(positions.keys());
        if (visibleIds.length < 4) {
            // Family-view's bounded subset is too small to host 30 overlays.
            // Skip the probe with a noted finding.
            // eslint-disable-next-line no-console
            console.log(
                "[overlay-probe] bounded subset has <4 visible cards (%d); probe is informational only",
                visibleIds.length,
            );
            return;
        }

        // Generate 30 synthetic overlay edges as straight lines between
        // random visible-card pairs. This is the worst-case routing (no
        // bridge-arcs, no A*); the count is an upper bound on what the
        // real renderer would produce after the bridge-arc pass.
        const rng = seededRng(42);
        const pairs = pickRandomPairs(rng, visibleIds, 30);
        const overlayEdges: Edge[] = pairs
            .map((pair) => {
                const from = positions.get(pair.a);
                const to = positions.get(pair.b);
                if (!from || !to) return null;
                return { from, to };
            })
            .filter((e): e is Edge => e !== null);

        // Count how many overlay edges cross at least one skeleton edge.
        let crossingOverlays = 0;
        let totalCrossings = 0;
        for (const overlay of overlayEdges) {
            let crossesSomething = false;
            for (const skeleton of skeletonEdges) {
                if (segmentsIntersect(overlay, skeleton)) {
                    totalCrossings += 1;
                    crossesSomething = true;
                }
            }
            if (crossesSomething) crossingOverlays += 1;
        }

        // eslint-disable-next-line no-console
        console.log(
            "[overlay-probe] visible cards=%d, skeleton edges=%d, synthetic overlays=%d",
            visibleIds.length,
            skeletonEdges.length,
            overlayEdges.length,
        );
        // eslint-disable-next-line no-console
        console.log(
            "[overlay-probe] %d/%d overlays cross the skeleton (total crossings=%d)",
            crossingOverlays,
            overlayEdges.length,
            totalCrossings,
        );

        // Verdict.
        let verdict: "clean" | "marginal" | "unreadable";
        if (totalCrossings <= 5) verdict = "clean";
        else if (totalCrossings <= 15) verdict = "marginal";
        else verdict = "unreadable";

        // eslint-disable-next-line no-console
        console.log(
            "[overlay-probe] verdict=%s → Phase 4 A* %s",
            verdict,
            verdict === "unreadable"
                ? "PROMOTED INTO SCOPE (+1.5 days)"
                : verdict === "marginal"
                  ? "stays a follow-up"
                  : "stays in non-goals",
        );

        // Hard assertion: probe ran without crashes. Numeric outcome is
        // informational, captured in the bug log on retro.
        expect(overlayEdges.length).toBeGreaterThan(0);
    });
});
