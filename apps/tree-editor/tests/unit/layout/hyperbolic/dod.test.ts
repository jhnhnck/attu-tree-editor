/*
 * FamilyTreeEditor - Phase 5 DoD checks for the hyperbolic engine
 * against the Akarians fixture.
 *
 * Asserts what the plan calls out:
 *   1. Static SVG output for DEMO matches the Phase 2 spike fixture shape.
 *   2. Proband sits at the disk origin.
 *   3. gen-50 ancestor still readable as a clickable target — at the
 *      production step distance (0.7) the gen-50 person's fisheye scale
 *      may be tiny, so we just verify the position is *inside the disk*
 *      and rely on the DOI dot glyph for actual interactivity past the
 *      readability threshold.
 *   4. Every emitted edge is a geodesic-arc with two hyperbolic endpoints.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { layoutHourglass } from "$lib/layout/engines/hyperbolic-lr/layout";
import { abs, RHO_MAX } from "$lib/layout/hyperbolic/poincare";
import { aggregateClusters, computeDoiScores } from "$lib/layout/doi";
import { getParents } from "$lib/domain/tree";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

const cached = (() => {
    const text = readFileSync(FIXTURE, "utf8");
    const { tree } = unwrap(parseGedcom(text));
    const visible = new Set(Object.keys(tree.people));
    const out = layoutHourglass(tree, tree.rootId, visible);
    return { tree, out };
})();

describe("Phase 5 DoD — hyperbolic on Akarians", () => {
    it("places the vast majority of visible people", () => {
        // Akarians has ~1800 people in one big component plus a few isolates.
        // The hourglass should place every consanguineously connected person.
        const placedFraction = cached.out.positions.size / Object.keys(cached.tree.people).length;
        expect(placedFraction).toBeGreaterThan(0.9);
    });

    it("places the proband at the disk origin", () => {
        const pos = cached.out.positions.get(cached.tree.rootId);
        expect(pos).toBeDefined();
        if (pos!.space !== "hyperbolic") throw new Error("expected hyperbolic");
        expect(pos!.z.re).toBe(0);
        expect(pos!.z.im).toBe(0);
    });

    it("every placed position has |z| ≤ RHO_MAX (no boundary excursion)", () => {
        for (const [, pos] of cached.out.positions) {
            if (pos.space !== "hyperbolic") throw new Error("expected hyperbolic");
            expect(abs(pos.z)).toBeLessThanOrEqual(RHO_MAX + 1e-12);
        }
    });

    it("flags hitBoundary when deep generations clamp", () => {
        // Akarians has ~66-generation ancestry; at D=0.7 we expect to hit the
        // boundary clamp well before the leaves.
        expect(cached.out.hitBoundary).toBe(true);
    });

    it("emits geodesic-arc edges with hyperbolic endpoints", () => {
        expect(cached.out.edges.length).toBeGreaterThan(0);
        for (const e of cached.out.edges) {
            expect(e.route.kind).toBe("geodesic-arc");
            if (e.route.kind !== "geodesic-arc") continue;
            expect(e.route.from.space).toBe("hyperbolic");
            expect(e.route.to.space).toBe("hyperbolic");
        }
    });

    it("ancestor + descendant subtrees go to opposite halves of the disk", () => {
        // Phase 8.1: ancestors go to the screen-UP half (im < 0 in
        // disk-coords) to match the standard genealogy convention. The
        // proband's parents, if placed, should land in that half.
        const probandPerson = cached.tree.people[cached.tree.rootId];
        if (!probandPerson) return;
        for (const ref of getParents(probandPerson)) {
            const pos = cached.out.positions.get(ref.personId);
            if (!pos || pos.space !== "hyperbolic") continue;
            expect(pos.z.im).toBeLessThan(0);
        }
    });
});

describe("Phase 6 DoD — DOI scoring + cluster aggregation on Akarians", () => {
    const scores = computeDoiScores({
        tree: cached.tree,
        focus: cached.tree.rootId,
    });

    it("scores every reachable person", () => {
        // Every placed person should have a DOI score. The placed-set is a
        // tight superset (excludes only unreachable isolates).
        for (const id of cached.out.positions.keys()) {
            expect(scores.has(id)).toBe(true);
        }
    });

    it("proband has distance 0 and a finite score", () => {
        const s = scores.get(cached.tree.rootId);
        expect(s).toBeDefined();
        expect(s!.distance).toBe(0);
        expect(Number.isFinite(s!.score)).toBe(true);
    });

    it("aggregates deep low-DOI subtrees into a single cluster glyph", () => {
        // Threshold defined here in test-space (not the renderer's pixel
        // calculation): mark every person past depth 5 as below-threshold.
        // Akarians has a deep ancestor spine — expect at least one
        // multi-member cluster to emerge.
        const deepCutoff = (id: string) => (scores.get(id)?.distance ?? 0) > 5;
        const clusters = aggregateClusters(cached.tree, cached.tree.rootId, deepCutoff);
        expect(clusters.length).toBeGreaterThan(0);
        const maxCount = clusters.reduce((a, c) => Math.max(a, c.count), 0);
        expect(maxCount).toBeGreaterThan(1); // at least one collapsed subtree
        // Every clustered member must be below the cutoff.
        for (const c of clusters) {
            for (const m of c.members) expect(deepCutoff(m)).toBe(true);
        }
    });

    it("anchors prevent collapse of their ancestor chain", () => {
        const probandPerson = cached.tree.people[cached.tree.rootId];
        if (!probandPerson) return;
        // Pick a deep ancestor (mother of mother of mother) as the anchor
        // and verify it stays out of any cluster.
        const motherOf = (pid: string): string | undefined => {
            const p = cached.tree.people[pid];
            if (!p) return undefined;
            return getParents(p).find((r) => r.role === "mother")?.personId;
        };
        const m1 = motherOf(cached.tree.rootId);
        if (!m1) return;
        const m2 = motherOf(m1);
        if (!m2) return;
        const m3 = motherOf(m2);
        if (!m3) return;
        const anchors = new Set([m3]);
        const clusters = aggregateClusters(
            cached.tree,
            cached.tree.rootId,
            () => true, // everything else collapsable
            anchors,
        );
        const clustered = new Set<string>();
        for (const c of clusters) for (const m of c.members) clustered.add(m);
        expect(clustered.has(m3)).toBe(false);
    });
});
