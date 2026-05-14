// SPDX-License-Identifier: MIT
//
// Phase 0c: Ghost-cluster contiguity post-pass — feasibility spike for
// the algorithm that closes [bugs.md:13](../../../../notes/bugs.md#L13).
//
// Hypothesis: a post-pass over the OrderedGraph that pulls each ghost
// cluster contiguous to its `near` can close most of the >5u stranded
// ghosts without significantly increasing crossings.
//
// Method:
//   1. Run the full layered pipeline (layer → order → place → route).
//   2. Identify ghost clusters whose distance from `near` > 5u.
//   3. For each candidate cluster: build a candidate OrderedGraph with
//      the cluster moved adjacent to its near (in within-rank order);
//      re-run place + route; measure crossings.
//   4. Accept the swap iff new-crossings ≤ old-crossings + k.
//   5. Apply accepted swaps cumulatively; final pass measures closure
//      rate and crossings delta.
//
// Records verdict per [notes/plans/layered-and-tooling.md](../../../../notes/plans/layered-and-tooling.md)
// Phase 0c gate:
//   green: closure ≥70% with k=0 AND crossings increase ≤+5%
//   yellow: closure <70% with k=0 BUT ≥70% with k=2
//   red:   closure <70% with k=2 → Phase 2 dropped
//
// Output: notes/profiles/ghost-contiguity-spike.md.

import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseGedcom } from "$lib/io/gedcom/parse";
import { layer } from "$lib/layout/passes/layer";
import { order } from "$lib/layout/passes/order";
import { place } from "$lib/layout/passes/place";
import { route } from "$lib/layout/passes/route";
import { parseGhostNodeId } from "$lib/layout/ir";
import type { LayoutNodeId, OrderedGraph, PlacedGraph } from "$lib/layout/ir";
import type { Segment } from "$lib/layout/edgeRouter";
import type { Tree } from "$lib/domain/types";
import { ghostStrandingDistilled } from "../fixtures/layered-bug-repros";

const AKARIANS_GED = resolve(process.cwd(), "tests/fixtures/Akarians.ged");
const OUT_MD = resolve(process.cwd(), "../../notes/profiles/ghost-contiguity-spike.md");

interface RunMetrics {
    readonly label: string;
    readonly k: number;
    readonly initialCrossings: number;
    readonly finalCrossings: number;
    readonly initialStranded: number; // > 5u from near
    readonly finalStranded: number;
    readonly swapsAttempted: number;
    readonly swapsAccepted: number;
}

function midX(placed: PlacedGraph, id: LayoutNodeId): number {
    const x = placed.x.get(id);
    return x === undefined ? NaN : x + 1;
}

function crossingsOf(segments: readonly Segment[]): number {
    const horizontals: { x1: number; x2: number; y: number }[] = [];
    const verticals: { x: number; y1: number; y2: number }[] = [];
    for (const s of segments) {
        if (Math.abs(s.y1 - s.y2) < 1e-9) {
            horizontals.push({ x1: Math.min(s.x1, s.x2), x2: Math.max(s.x1, s.x2), y: s.y1 });
        } else if (Math.abs(s.x1 - s.x2) < 1e-9) {
            verticals.push({ x: s.x1, y1: Math.min(s.y1, s.y2), y2: Math.max(s.y1, s.y2) });
        }
    }
    let n = 0;
    const eps = 1e-9;
    for (const h of horizontals) {
        for (const v of verticals) {
            if (v.x > h.x1 + eps && v.x < h.x2 - eps && h.y > v.y1 + eps && h.y < v.y2 - eps) {
                n++;
            }
        }
    }
    return n;
}

function strandedCount(placed: PlacedGraph): number {
    let n = 0;
    for (const [nodeId, node] of placed.nodes) {
        if (node.kind !== "ghost") continue;
        const parsed = parseGhostNodeId(nodeId);
        if (!parsed) continue;
        const near = placed.nodes.get(parsed.nearId);
        if (!near || near.rank !== node.rank) continue;
        const d = Math.abs(midX(placed, nodeId) - midX(placed, parsed.nearId));
        if (d > 5) n++;
    }
    return n;
}

interface Cluster {
    readonly rank: number;
    readonly nearId: LayoutNodeId;
    readonly ghostIds: LayoutNodeId[];
    readonly maxDist: number;
}

function strandedClusters(placed: PlacedGraph): Cluster[] {
    const byRankNear = new Map<
        string,
        { nearId: LayoutNodeId; rank: number; ghostIds: LayoutNodeId[]; maxDist: number }
    >();
    for (const [nodeId, node] of placed.nodes) {
        if (node.kind !== "ghost") continue;
        const parsed = parseGhostNodeId(nodeId);
        if (!parsed) continue;
        const near = placed.nodes.get(parsed.nearId);
        if (!near || near.rank !== node.rank) continue;
        const d = Math.abs(midX(placed, nodeId) - midX(placed, parsed.nearId));
        const key = `${String(node.rank)}|${parsed.nearId}`;
        const existing = byRankNear.get(key);
        if (existing) {
            existing.ghostIds.push(nodeId);
            if (d > existing.maxDist) existing.maxDist = d;
        } else {
            byRankNear.set(key, {
                nearId: parsed.nearId,
                rank: node.rank,
                ghostIds: [nodeId],
                maxDist: d,
            });
        }
    }
    return Array.from(byRankNear.values())
        .filter((c) => c.maxDist > 5)
        .sort((a, b) => b.maxDist - a.maxDist);
}

/**
 * Build a candidate OrderedGraph that has `cluster.ghostIds` moved to be
 * immediately adjacent to `cluster.nearId` within the rank's ordering.
 * Preserves the rest of the ordering unchanged.
 */
function moveClusterAdjacent(og: OrderedGraph, cluster: Cluster): OrderedGraph {
    const newRanks = og.ranks.map((r, i) => (i === cluster.rank ? [...r] : r));
    const target = newRanks[cluster.rank]!;
    const ghostSet = new Set(cluster.ghostIds);
    const stripped = target.filter((id) => !ghostSet.has(id));
    const nearPos = stripped.indexOf(cluster.nearId);
    if (nearPos < 0) return og; // safety: near not on rank, skip
    // Insert ghosts right after near, preserving their existing order.
    const ghostsInOrder = cluster.ghostIds
        .slice()
        .sort((a, b) => (og.order.get(a) ?? 0) - (og.order.get(b) ?? 0));
    stripped.splice(nearPos + 1, 0, ...ghostsInOrder);
    newRanks[cluster.rank] = stripped;
    const newOrder = new Map(og.order);
    for (const [pos, id] of stripped.entries()) newOrder.set(id, pos);
    return { ...og, ranks: newRanks, order: newOrder };
}

function runPostPass(tree: Tree, label: string, k: number): RunMetrics {
    const visible = new Set(Object.keys(tree.people));
    const lg = layer(tree, visible, tree.rootId, undefined);
    let og = order(lg, undefined);
    let pg = place(og, undefined);
    let segs = route(pg, tree).segments;
    const initialCrossings = crossingsOf(segs);
    const initialStranded = strandedCount(pg);
    let attempted = 0;
    let accepted = 0;

    // Recompute clusters from the current placement each round; a single
    // sweep is enough for the spike — the algorithm is monotonic since we
    // only accept non-worsening swaps.
    let baselineCrossings = initialCrossings;
    const clusters = strandedClusters(pg);
    for (const cluster of clusters) {
        attempted++;
        const candidateOg = moveClusterAdjacent(og, cluster);
        const candidatePg = place(candidateOg, undefined);
        const candidateSegs = route(candidatePg, tree).segments;
        const candidateCrossings = crossingsOf(candidateSegs);
        if (candidateCrossings <= baselineCrossings + k) {
            accepted++;
            og = candidateOg;
            pg = candidatePg;
            segs = candidateSegs;
            baselineCrossings = candidateCrossings;
        }
    }

    const finalCrossings = crossingsOf(segs);
    const finalStranded = strandedCount(pg);
    return {
        label,
        k,
        initialCrossings,
        finalCrossings,
        initialStranded,
        finalStranded,
        swapsAttempted: attempted,
        swapsAccepted: accepted,
    };
}

function akariansTree(): Tree {
    const r = parseGedcom(readFileSync(AKARIANS_GED, "utf-8"));
    if (!r.ok) throw new Error(`parseGedcom failed: ${r.error}`);
    return r.value.tree;
}

function pct(num: number, denom: number): string {
    return denom === 0 ? "n/a" : `${((num / denom) * 100).toFixed(1)}%`;
}

function classify(closure: number, crossingsDelta: number): "green" | "yellow" | "red" {
    if (closure >= 70 && crossingsDelta <= 5) return "green";
    if (closure >= 70) return "yellow";
    return "red";
}

function renderReport(results: readonly RunMetrics[]): string {
    const lines: string[] = [];
    lines.push("# Ghost-contiguity algorithm spike (Phase 0c, 14 May 2026)");
    lines.push("");
    lines.push(
        "Feasibility spike for the post-pass that closes " +
            "[bugs.md:13](../bugs.md#L13). See " +
            "[notes/plans/layered-and-tooling.md](../plans/layered-and-tooling.md) " +
            "Phase 0c for the go/no-go gate.",
    );
    lines.push("");
    lines.push("## Per-fixture results");
    lines.push("");
    lines.push(
        "| fixture | k | initial crossings | final crossings | Δ crossings | initial stranded (>5u) | final stranded | closure | swaps tried | swaps accepted | acceptance |",
    );
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const r of results) {
        const dCross = r.finalCrossings - r.initialCrossings;
        const dCrossPct =
            r.initialCrossings === 0
                ? "n/a"
                : `${((dCross / r.initialCrossings) * 100).toFixed(1)}%`;
        const closure = pct(r.initialStranded - r.finalStranded, r.initialStranded);
        const acceptance = pct(r.swapsAccepted, r.swapsAttempted);
        lines.push(
            `| ${r.label} | ${String(r.k)} | ${String(r.initialCrossings)} ` +
                `| ${String(r.finalCrossings)} | ${dCrossPct} | ${String(r.initialStranded)} ` +
                `| ${String(r.finalStranded)} | ${closure} ` +
                `| ${String(r.swapsAttempted)} | ${String(r.swapsAccepted)} | ${acceptance} |`,
        );
    }
    lines.push("");

    // Per-fixture verdict using Akarians numbers (the load-bearing fixture
    // — the distilled fixture is a smoke-test).
    const akK0 = results.find((r) => r.label === "Akarians" && r.k === 0);
    const akK2 = results.find((r) => r.label === "Akarians" && r.k === 2);

    if (akK0 && akK2) {
        const closureK0 =
            akK0.initialStranded === 0
                ? 100
                : ((akK0.initialStranded - akK0.finalStranded) / akK0.initialStranded) * 100;
        const closureK2 =
            akK2.initialStranded === 0
                ? 100
                : ((akK2.initialStranded - akK2.finalStranded) / akK2.initialStranded) * 100;
        const deltaK0 =
            akK0.initialCrossings === 0
                ? 0
                : ((akK0.finalCrossings - akK0.initialCrossings) / akK0.initialCrossings) * 100;
        const deltaK2 =
            akK2.initialCrossings === 0
                ? 0
                : ((akK2.finalCrossings - akK2.initialCrossings) / akK2.initialCrossings) * 100;
        const verdictK0 = classify(closureK0, deltaK0);
        const verdictK2 = classify(closureK2, deltaK2);
        const overall = verdictK0 === "green" ? "green" : verdictK2 !== "red" ? "yellow" : "red";

        lines.push("## Verdict — Akarians DEMO (load-bearing)");
        lines.push("");
        lines.push(
            `- **k=0 strict**: closure ${closureK0.toFixed(1)}%, crossings Δ ${deltaK0.toFixed(1)}% → **${verdictK0}**`,
        );
        lines.push(
            `- **k=2 relaxed**: closure ${closureK2.toFixed(1)}%, crossings Δ ${deltaK2.toFixed(1)}% → **${verdictK2}**`,
        );
        lines.push("");
        lines.push(`**Overall Phase 2 gate: ${overall}**`);
        lines.push("");
        if (overall === "green") {
            lines.push("Phase 2 proceeds with k=0 strict acceptance criterion.");
        } else if (overall === "yellow") {
            lines.push(
                "Phase 2 proceeds with k=2 relaxed criterion. Document the " +
                    "trade-off explicitly in the Phase 2 commit and DoD.",
            );
        } else {
            lines.push(
                "Phase 2 is **dropped**. File [bugs.md:13](../bugs.md#L13) as a " +
                    "follow-up requiring a more sophisticated algorithm (e.g. " +
                    "moving the near toward the cluster median, or two-sided " +
                    "rank ordering). This plan ends at Phase 1 + 3 + 4.",
            );
        }
    } else {
        lines.push("## Verdict");
        lines.push("");
        lines.push("Akarians run missing from results — cannot decide gate.");
    }

    return lines.join("\n") + "\n";
}

describe("ghost-contiguity.spike — Phase 0c algorithm feasibility", () => {
    const results: RunMetrics[] = [];

    it("runs k=0 strict on distilled fixture", () => {
        const tree = ghostStrandingDistilled();
        const r = runPostPass(tree, "ghostStrandingDistilled", 0);
        expect(r.initialStranded).toBeGreaterThanOrEqual(0);
        results.push(r);
    });

    it("runs k=2 relaxed on distilled fixture", () => {
        const tree = ghostStrandingDistilled();
        const r = runPostPass(tree, "ghostStrandingDistilled", 2);
        results.push(r);
    });

    it("runs k=0 strict on Akarians DEMO", () => {
        const tree = akariansTree();
        const r = runPostPass(tree, "Akarians", 0);
        expect(r.initialStranded).toBeGreaterThan(0);
        results.push(r);
    });

    it("runs k=2 relaxed on Akarians DEMO", () => {
        const tree = akariansTree();
        const r = runPostPass(tree, "Akarians", 2);
        results.push(r);
    });

    it("writes spike report", () => {
        writeFileSync(OUT_MD, renderReport(results), "utf-8");
    });
});
