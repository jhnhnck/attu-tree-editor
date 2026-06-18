// SPDX-License-Identifier: MIT
//
// Phase 1 regression tests for the layered-and-tooling plan: bug 17
// (same-rank short bond should be one segment) and bug 18 (spouse
// orientation should be father-left for both-known couples). Both run
// the eightPersonFamily fixture through the full layered pipeline.
//
// See notes/plans/layered-and-tooling.md Phase 1.

import { describe, expect, it } from "vitest";

import { layer } from "$lib/layout/passes/layer";
import { order } from "$lib/layout/passes/order";
import { place } from "$lib/layout/passes/place";
import { route } from "$lib/layout/passes/route";
import type { LayoutNodeId, PlacedGraph } from "$lib/layout/ir";
import type { Segment } from "$lib/layout/edgeRouter";
import type { PersonId, Tree } from "$lib/domain/types";
import { eightPersonFamily } from "../../fixtures/layered-bug-repros";

interface RouteResult {
    placed: PlacedGraph;
    segments: readonly Segment[];
}

function runLayered(tree: Tree): RouteResult {
    const visible = new Set<PersonId>(Object.keys(tree.people));
    const lg = layer(tree, visible, tree.rootId, undefined);
    const og = order(lg, undefined, tree);
    const pg = place(og, undefined);
    const { segments } = route(pg, tree);
    return { placed: pg, segments };
}

function midX(pg: PlacedGraph, id: LayoutNodeId): number {
    const x = pg.x.get(id);
    if (x === undefined) throw new Error(`no x for ${id}`);
    return x + 1;
}

function personIdByGiven(tree: Tree, given: string): PersonId {
    for (const p of Object.values(tree.people)) {
        if (p.given === given) return p.id;
    }
    throw new Error(`no person with given=${given}`);
}

describe("phase 1 / bug 17 — same-rank short bond is one segment", () => {
    it("emits one bond segment per couple in the 8-person fixture (no /stub-l, /stub-r pairs)", () => {
        const tree = eightPersonFamily();
        const { segments } = runLayered(tree);

        // Gather stub pairs grouped by bond base. Before the fix, the
        // Korak+Wife bond split into /stub-l + /stub-r because the
        // children pulled bondSpan past maxBondSpan=bbox.width/4 (≈3.5u
        // on the 8-person tree). After the BUNDLE_THRESHOLD floor, the
        // 8u threshold dominates and the short Korak+Wife bond becomes
        // a single segment.
        const stubBases = new Set<string>();
        const singleBondBases = new Set<string>();
        for (const s of segments) {
            const slash = s.id.indexOf("/");
            const base = slash === -1 ? s.id : s.id.slice(0, slash);
            if (!base.startsWith("bond:")) continue;
            const suffix = slash === -1 ? "" : s.id.slice(slash + 1);
            if (suffix === "stub-l" || suffix === "stub-r") {
                stubBases.add(base);
            } else if (s.kind === "bond" && suffix === "") {
                singleBondBases.add(base);
            }
        }

        expect(stubBases.size).toBe(0);
        // Both couples (Moma+Dada and Korak+Wife) emit one continuous bond.
        expect(singleBondBases.size).toBe(2);
    });
});

describe("phase 1 / bug 18 — father-left tie-break for both-known couples", () => {
    it("places Dada (m) to the left of Moma (f)", () => {
        const tree = eightPersonFamily();
        const { placed } = runLayered(tree);
        const dadaId = personIdByGiven(tree, "Dada");
        const momaId = personIdByGiven(tree, "Moma");
        expect(midX(placed, dadaId)).toBeLessThan(midX(placed, momaId));
    });

    it("places Korak (m) to the left of Wife (f)", () => {
        const tree = eightPersonFamily();
        const { placed } = runLayered(tree);
        const korakId = personIdByGiven(tree, "Korak");
        const wifeId = personIdByGiven(tree, "Wife");
        expect(midX(placed, korakId)).toBeLessThan(midX(placed, wifeId));
    });

    it("falls through to position-based ordering when tree is not threaded (default)", () => {
        // Smoke test of the back-compat path: when callers don't pass
        // `tree` to order(), the orientation stays driven by the median
        // heuristic — so the test only asserts that the call succeeds
        // and produces SOME placement.
        const tree = eightPersonFamily();
        const visible = new Set<PersonId>(Object.keys(tree.people));
        const lg = layer(tree, visible, tree.rootId, undefined);
        const og = order(lg, undefined); // no tree threaded
        const pg = place(og, undefined);
        expect(pg.x.size).toBeGreaterThan(0);
    });
});
