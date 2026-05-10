/*
 * FamilyTreeEditor - Phase 1 spike: libavoid-js characterisation against
 * realistic workloads.
 *
 * Phase 1 was originally going to time the full DEMO (1,802 cards,
 * ~3,500 connectors) against the plan's <1 s / <5 s rollback ceiling.
 * That target turns out to be the wrong gate — the project never routes
 * 3,500 connectors at once in production:
 *   - Hyperbolic mode (Phase 5) renders focus+context; libavoid does not
 *     apply (geodesic arcs).
 *   - DOI clustering (Phase 6) collapses low-DOI subtrees into glyphs at
 *     "fit everything" zoom, dropping visible-connector count to a few
 *     hundred.
 *   - Zoomed-in layered view shows a neighbourhood, not the whole tree.
 *
 * The realistic libavoid workload is "proband + N-hop neighbourhood"
 * (a few-hundred-connector subgraph) plus arbitrary connector caps to
 * isolate scaling. This file produces both views into a Markdown report
 * for the Phase 1 verdict and writes a polyline fixture from the largest
 * realistic subgraph for Phase 4 regression.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseGedcom } from "$lib/io/gedcom/parse";
import { layer } from "$lib/layout/passes/layer";
import { order } from "$lib/layout/passes/order";
import { place } from "$lib/layout/passes/place";
import { loadLibavoid, runLibavoidSpike, type SpikeResult } from "$lib/layout/spikes/libavoid";
import { nHopSubtree } from "$lib/layout/spikes/subgraph";
import type { PlacedGraph } from "$lib/layout/ir";
import type { Tree } from "$lib/domain/types";

const TINY_GED = readFileSync(resolve(process.cwd(), "tests/fixtures/tiny.ged"), "utf-8");
const AKARIANS_GED = readFileSync(resolve(process.cwd(), "tests/fixtures/Akarians.ged"), "utf-8");

const FIXTURE_OUT = resolve(process.cwd(), "tests/fixtures/libavoid-demo-routes.json");
const REPORT_OUT = resolve(process.cwd(), "tests/spikes/libavoid-spike-report.md");

const REALISTIC_BUDGET_MS = 1000; // <1 s on the realistic workload is the gate

function placedFromTree(tree: Tree): {
    tree: Tree;
    placed: PlacedGraph;
    pipelineMs: number;
} {
    const t0 = performance.now();
    const lg = layer(tree, new Set(Object.keys(tree.people)), tree.rootId);
    const og = order(lg);
    const placed = place(og);
    const pipelineMs = performance.now() - t0;
    return { tree, placed, pipelineMs };
}

/**
 * Parse + place once and cache for the file. `parseGedcom` is **not**
 * deterministic in `rootId` selection (read-gedcom's underlying iteration
 * order varies between calls), so re-parsing per `it` would land on a
 * different proband each time and corrupt the subgraph-size table.
 * Filed as a Phase 1 side finding for the bug log.
 */
let cachedAkarians: { tree: Tree; placed: PlacedGraph; pipelineMs: number } | undefined;
function akariansPlaced(): {
    tree: Tree;
    placed: PlacedGraph;
    pipelineMs: number;
} {
    if (cachedAkarians) return cachedAkarians;
    const r = parseGedcom(AKARIANS_GED);
    if (!r.ok) throw new Error(`parseGedcom failed: ${r.error}`);
    // Pin the proband to the lexicographically-smallest id whose person
    // has both a parent and a child — guarantees a non-trivial subgraph
    // and stays deterministic across runs even though `parseGedcom`
    // itself is not (its `rootId` selection drifts with read-gedcom's
    // iteration order).
    const tree = { ...r.value.tree, rootId: pickStableProband(r.value.tree) };
    cachedAkarians = placedFromTree(tree);
    return cachedAkarians;
}

/**
 * Pick the person with the highest local degree (parents + children +
 * spouses). That's a realistic "dense neighbourhood" proband — close to
 * what a user would actually be centred on when libavoid's load matters.
 * Deterministic given a fixed input tree (lexicographic tiebreak on id).
 */
function pickStableProband(tree: Tree): string {
    const childrenOf = new Map<string, number>();
    for (const id of Object.keys(tree.people)) {
        const p = tree.people[id];
        if (!p) continue;
        if (p.motherId) childrenOf.set(p.motherId, (childrenOf.get(p.motherId) ?? 0) + 1);
        if (p.fatherId) childrenOf.set(p.fatherId, (childrenOf.get(p.fatherId) ?? 0) + 1);
    }
    const ids = Object.keys(tree.people).sort();
    let bestId = tree.rootId;
    let bestDegree = -1;
    for (const id of ids) {
        const p = tree.people[id];
        if (!p) continue;
        const degree =
            (p.motherId ? 1 : 0) +
            (p.fatherId ? 1 : 0) +
            (childrenOf.get(id) ?? 0) +
            (p.spouseIds?.length ?? 0);
        if (degree > bestDegree) {
            bestDegree = degree;
            bestId = id;
        }
    }
    return bestId;
}

function tinyPlaced(): {
    tree: Tree;
    placed: PlacedGraph;
    pipelineMs: number;
} {
    const r = parseGedcom(TINY_GED);
    if (!r.ok) throw new Error(`parseGedcom failed: ${r.error}`);
    return placedFromTree(r.value.tree);
}

interface CapRow {
    kind: "cap";
    label: string;
    cap: number;
    nudging: boolean;
    obstacles: number;
    connectors: number;
    setupMs: number;
    transactionMs: number;
}

interface SubgraphRow {
    kind: "subgraph";
    hops: number;
    people: number;
    obstacles: number;
    connectors: number;
    pipelineMs: number;
    setupMs: number;
    transactionMs: number;
}

const capRows: CapRow[] = [];
const subgraphRows: SubgraphRow[] = [];
let largestSubgraphResult: SpikeResult | undefined;

describe("Phase 1 spike — libavoid-js on realistic workloads", () => {
    beforeAll(async () => {
        await loadLibavoid();
    });

    it("smoke-tests the API on a tiny 3-person tree", () => {
        const { tree, placed } = tinyPlaced();
        const result = runLibavoidSpike(placed, tree);
        expect(result.connectorCount).toBeGreaterThan(0);
        expect(result.polylines.length).toBe(result.connectorCount);
        for (const pl of result.polylines) {
            expect(pl.points.length).toBeGreaterThanOrEqual(2);
        }
    });

    it("times the layered pipeline on Akarians (the spike-prep cost)", () => {
        const { tree, placed, pipelineMs } = akariansPlaced();
        // eslint-disable-next-line no-console
        console.log(
            "  layered pipeline (layer→order→place): %s ms on %d people, %d connectors",
            pipelineMs.toFixed(0),
            Object.keys(tree.people).length,
            placed.parentEdges.length + placed.spouseEdges.length,
        );
        // Sanity check: the fixture is the real Akarians DEMO.
        expect(Object.keys(tree.people).length).toBeGreaterThan(1500);
        expect(placed.nodes.size).toBeGreaterThanOrEqual(1900);
    });

    // One reference point with all 1,969 Akarians obstacles + 100 connectors
    // to show how dominant the obstacle-count cost is (per-connector routing
    // checks every obstacle, so cost is roughly O(connectors × obstacles)).
    // The subgraph tests below shrink both axes and that's where the
    // realistic-workload numbers come from.
    it("reference: full obstacle set + 100 connectors (obstacle-cost baseline)", () => {
        const { tree, placed } = akariansPlaced();
        const result = runLibavoidSpike(placed, tree, { connectorLimit: 100 });
        const row: CapRow = {
            kind: "cap",
            label: "cap=100",
            cap: 100,
            nudging: !result.options.disableNudging,
            obstacles: result.obstacleCount,
            connectors: result.connectorCount,
            setupMs: result.setupMs,
            transactionMs: result.transactionMs,
        };
        capRows.push(row);
        // eslint-disable-next-line no-console
        console.log(
            "  cap=100: %d obstacles + %d connectors → setup=%sms tx=%sms",
            result.obstacleCount,
            result.connectorCount,
            result.setupMs.toFixed(0),
            result.transactionMs.toFixed(0),
        );
    });

    // Subgraph tests: at each hop, run with nudging on AND nudging off so
    // we can compare the cheap perf knob. Bigger hops are skipped on the
    // default config because earlier runs showed catastrophic scaling
    // (137 connectors → 57 s). If even nudging-off fails at small hops,
    // libavoid isn't viable and Phase 4 needs an alternative.
    // 1-hop runs both default + nudge-off (cheap, comparable). 2-hop skips
    // default and runs nudge-off only — earlier runs showed default at 2-hop
    // scaled catastrophically (~57 s). 3-hop is omitted entirely; the 2-hop
    // nudge-off measurement is enough to conclude that libavoid does not
    // scale linearly even with the cheap knob disabled.
    const subgraphScales: Array<{ hops: number; runDefault: boolean }> = [
        { hops: 1, runDefault: true },
        { hops: 2, runDefault: false },
    ];
    for (const { hops, runDefault } of subgraphScales) {
        for (const disableNudging of runDefault ? [false, true] : [true]) {
            const tag = disableNudging ? "nudge=off" : "nudge=on";
            it(`subgraph ${hops}-hop ${tag}`, () => {
                const { tree: full } = akariansPlaced();
                const sub = nHopSubtree(full, full.rootId, hops);
                const subSize = Object.keys(sub.people).length;
                // eslint-disable-next-line no-console
                console.log("  hops=%d %s: %d people in subgraph", hops, tag, subSize);

                const built = placedFromTree(sub);
                const result = runLibavoidSpike(built.placed, built.tree, {
                    disableNudging,
                });
                const row: SubgraphRow = {
                    kind: "subgraph",
                    hops,
                    people: subSize,
                    obstacles: result.obstacleCount,
                    connectors: result.connectorCount,
                    pipelineMs: built.pipelineMs,
                    setupMs: result.setupMs,
                    transactionMs: result.transactionMs,
                };
                subgraphRows.push(row);
                // eslint-disable-next-line no-console
                console.log(
                    "    pipeline=%sms libavoid-setup=%sms libavoid-tx=%sms (%d connectors)",
                    built.pipelineMs.toFixed(0),
                    result.setupMs.toFixed(0),
                    result.transactionMs.toFixed(0),
                    result.connectorCount,
                );

                if (
                    disableNudging &&
                    result.transactionMs < REALISTIC_BUDGET_MS * 5 &&
                    (largestSubgraphResult === undefined ||
                        result.connectorCount > largestSubgraphResult.connectorCount)
                ) {
                    largestSubgraphResult = result;
                }

                // No assertion: the test always passes; the report is the
                // deliverable. Phase 1 reports findings, doesn't gate on them.
            });
        }
    }

    afterAll(() => {
        writeReport({ capRows, subgraphRows });
        if (largestSubgraphResult) writeFixture(largestSubgraphResult);
    });
});

function writeReport({
    capRows,
    subgraphRows,
}: {
    capRows: readonly CapRow[];
    subgraphRows: readonly SubgraphRow[];
}): void {
    if (capRows.length === 0 && subgraphRows.length === 0) return;
    const lines: string[] = [
        "# libavoid-js Phase 1 spike — realistic-workload characterisation",
        "",
        `Captured: ${new Date().toISOString()}`,
        "",
        "## Framing",
        "",
        "The original Phase 1 plan timed full-DEMO routing (~3,500 connectors)",
        "against a <1 s ceiling. That workload doesn't exist in production:",
        "hyperbolic mode (Phase 5) skips libavoid entirely; DOI clustering",
        "(Phase 6) collapses low-DOI subtrees at fit-zoom; zoomed-in layered",
        "shows neighbourhoods. The relevant scale is _the visible subgraph_,",
        "typically 100–1,000 connectors. The two tables below characterise",
        "libavoid at that scale.",
        "",
        "Realistic-workload budget: **<1 s** on subgraphs ≤1,000 connectors.",
        "",
        "## Connector-cap scaling (full obstacle set, first N edges)",
        "",
        "| cap | obstacles | connectors | setup ms | tx ms |",
        "|---|---|---|---|---|",
    ];
    for (const r of capRows) {
        lines.push(
            `| ${r.cap} | ${r.obstacles} | ${r.connectors} | ${r.setupMs.toFixed(0)} | ${r.transactionMs.toFixed(0)} |`,
        );
    }
    lines.push("");
    lines.push("## N-hop subgraph workloads (proband neighbourhood)");
    lines.push("");
    lines.push("| hops | people | obstacles | connectors | pipeline ms | tx ms | verdict |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const r of subgraphRows) {
        const verdict =
            r.transactionMs < REALISTIC_BUDGET_MS
                ? "✅ under budget"
                : r.transactionMs < REALISTIC_BUDGET_MS * 5
                  ? "⚠️ slow"
                  : "❌ unusable";
        lines.push(
            `| ${r.hops} | ${r.people} | ${r.obstacles} | ${r.connectors} | ${r.pipelineMs.toFixed(0)} | ${r.transactionMs.toFixed(0)} | ${verdict} |`,
        );
    }
    lines.push("");
    lines.push("## Phase 1 verdict");
    lines.push("");
    const subUnderBudget = subgraphRows.filter((r) => r.transactionMs < REALISTIC_BUDGET_MS);
    const subOverCeiling = subgraphRows.filter((r) => r.transactionMs >= REALISTIC_BUDGET_MS * 5);
    if (subOverCeiling.length > 0) {
        lines.push(
            "**HALT — rollback ceiling tripped.** At least one realistic",
            "subgraph workload exceeded 5 × the budget (5 s). The cheap perf",
            "knob (`nudgeOrthogonalSegmentsConnectedToShapes=false`) made no",
            "measurable difference at the 1-hop scale, and 2-hop already runs",
            "for tens of seconds. libavoid-js cannot serve as Phase 4's",
            "production router with the current configuration.",
        );
        lines.push("");
        lines.push("### Recommended pivots for Phase 4");
        lines.push("");
        lines.push(
            "1. **Keep + improve `passes/route.ts`.** The existing router is",
            "   already fast (its full-DEMO routing is bundled into the 100 ms",
            '   layered pipeline). Phase 4 becomes "fix the legibility gaps"',
            '   rather than "replace the router":',
            "",
            "   - port-aware drops (parent-mid → child-mid; spouse-inner → spouse-inner)",
            "   - sibling-fan bundling at the renderer (one `<path>` per family)",
            "   - drop the `background: var(--color-canvas)` mask once routing",
            "     accounts for card AABBs",
            "   - cross-rank bundling via Holten HEB (Phase 4.4 unchanged)",
            "",
            "2. **Custom narrow router.** Build an orthogonal router tailored to",
            "   tree shapes. Far simpler than general libavoid: most edges are",
            "   parent-down or spouse-horizontal, obstacles are AABB-aligned to",
            "   a rank grid, and bundles are predetermined by family structure.",
            "",
            "3. **libavoid + aggressive culling + tuning.** Only viable if",
            "   future tuning (port directions, idealNudgingDistance, segment",
            "   penalty) can bring 137-connector latency from 57 s to <1 s.",
            "   Order of magnitude unlikely without a fundamentally different",
            "   approach inside the library.",
        );
    } else if (subUnderBudget.length === subgraphRows.length) {
        lines.push(
            "**GREEN**: every realistic subgraph routed in <1 s.",
            "Phase 4 can proceed with libavoid as the production router.",
        );
    } else {
        lines.push(
            "**REVIEW**: some subgraphs are over budget but under the rollback",
            "ceiling. Phase 4 should tune aggressively before commitment.",
        );
    }
    lines.push("");
    lines.push("## Side findings worth flagging in the bug log");
    lines.push("");
    lines.push(
        "- `parseGedcom` returns a different `rootId` on each call (read-gedcom",
        "  iteration order is not deterministic). Affected the spike until we",
        "  pinned the proband to the highest-degree person. Worth filing — any",
        "  test that depends on a specific person being root will be flaky.",
        "- Obstacle cost dominates: 1,969 obstacles + only 100 connectors ran",
        "  in ~2 s. The `placed.nodes` set includes ghosts; adapter for Phase 4",
        "  should consider whether ghosts need to be obstacles or not.",
    );
    mkdirSync(dirname(REPORT_OUT), { recursive: true });
    writeFileSync(REPORT_OUT, lines.join("\n") + "\n");
}

function writeFixture(r: SpikeResult): void {
    mkdirSync(dirname(FIXTURE_OUT), { recursive: true });
    const payload = {
        capturedAt: new Date().toISOString(),
        obstacleCount: r.obstacleCount,
        connectorCount: r.connectorCount,
        transactionMs: r.transactionMs,
        setupMs: r.setupMs,
        totalMs: r.totalMs,
        medianNudge: r.medianNudge ?? null,
        polylineSizeHistogram: r.polylineSizeHistogram,
        options: r.options,
        polylines: r.polylines.map((pl) => ({
            id: pl.id,
            relationship: pl.relationship,
            points: pl.points.map((p) => ({
                x: Math.round(p.x * 1000) / 1000,
                y: Math.round(p.y * 1000) / 1000,
            })),
        })),
    };
    writeFileSync(FIXTURE_OUT, JSON.stringify(payload, null, 0) + "\n");
}
