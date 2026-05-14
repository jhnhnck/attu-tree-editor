// SPDX-License-Identifier: MIT
//
// Phase 0a: Akarians baseline metrics + reusable spike.
//
// Collects four metrics on the layered engine for any GEDCOM fixture:
//   1. ghost adjacency — count of ghosts > 5u, > 10u, > 17.5u from near
//   2. same-rank short-bond stub-pair count (the bug-17 symptom)
//   3. couple orientation male-left vs female-left, grouped by gender-pair
//      status (both-known / one-known / both-unknown)
//   4. global crossings count (orthogonal segment intersections)
//
// Outputs:
//   notes/profiles/layered-metrics.json   — machine-diffable, committed
//   notes/profiles/layered-baseline.md    — human-readable, committed
//   notes/profiles/layered-metrics.*.local.json — ephemeral re-runs,
//                                           gitignored
//
// Phase 1 and Phase 2 verification re-runs this spike and writes to the
// `.local` variant; the diff between committed baseline and `.local`
// run is the verification surface.
//
// See notes/plans/layered-and-tooling.md Phase 0a.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseGedcom } from "$lib/io/gedcom/parse";
import { layer } from "$lib/layout/passes/layer";
import { order } from "$lib/layout/passes/order";
import { place } from "$lib/layout/passes/place";
import { route } from "$lib/layout/passes/route";
import { parseGhostNodeId } from "$lib/layout/ir";
import type { LayoutNodeId, PlacedGraph } from "$lib/layout/ir";
import type { Segment } from "$lib/layout/edgeRouter";
import type { Person, PersonId, Tree } from "$lib/domain/types";
import { eightPersonFamily, ghostStrandingDistilled } from "../fixtures/layered-bug-repros";

const AKARIANS_GED = resolve(process.cwd(), "tests/fixtures/Akarians.ged");
const OUT_JSON = resolve(process.cwd(), "../../notes/profiles/layered-metrics.json");
const OUT_MD = resolve(process.cwd(), "../../notes/profiles/layered-baseline.md");

interface GhostAdjacency {
    readonly totalGhosts: number;
    readonly stranded5: number;
    readonly stranded10: number;
    readonly stranded175: number;
    readonly maxStrand: number;
}

interface BondStubs {
    readonly sameRankStubPairs: number;
    readonly crossRankStubPairs: number;
    readonly sameRankSingleBonds: number;
}

interface OrientationBreakdown {
    readonly bothKnownMaleLeft: number;
    readonly bothKnownFemaleLeft: number;
    readonly oneKnown: number;
    readonly bothUnknown: number;
}

interface FixtureMetrics {
    readonly label: string;
    readonly people: number;
    readonly couples: number;
    readonly ghosts: number;
    readonly bboxWidth: number;
    readonly bboxHeight: number;
    readonly ghostAdjacency: GhostAdjacency;
    readonly bondStubs: BondStubs;
    readonly orientation: OrientationBreakdown;
    readonly crossings: number;
}

function loadAkarians(): Tree {
    const r = parseGedcom(readFileSync(AKARIANS_GED, "utf-8"));
    if (!r.ok) throw new Error(`parseGedcom failed: ${r.error}`);
    return r.value.tree;
}

function midX(placed: PlacedGraph, id: LayoutNodeId): number {
    const x = placed.x.get(id);
    if (x === undefined) return NaN;
    return x + 1; // PERSON_W=2, midpoint at +1
}

function ghostAdjacencyMetrics(placed: PlacedGraph): GhostAdjacency {
    let totalGhosts = 0;
    let s5 = 0;
    let s10 = 0;
    let s175 = 0;
    let maxStrand = 0;
    for (const [nodeId, node] of placed.nodes) {
        if (node.kind !== "ghost") continue;
        totalGhosts++;
        const parsed = parseGhostNodeId(nodeId);
        if (!parsed) continue;
        // ghost's near is a person on the same rank
        // find the LayoutNode whose id === parsed.nearId AND rank === node.rank
        const nearNode = placed.nodes.get(parsed.nearId);
        if (!nearNode || nearNode.rank !== node.rank) continue;
        const gx = midX(placed, nodeId);
        const nx = midX(placed, parsed.nearId);
        const d = Math.abs(gx - nx);
        if (d > maxStrand) maxStrand = d;
        if (d > 5) s5++;
        if (d > 10) s10++;
        if (d > 17.5) s175++;
    }
    return { totalGhosts, stranded5: s5, stranded10: s10, stranded175: s175, maxStrand };
}

function bondStubMetrics(segments: readonly Segment[], placed: PlacedGraph): BondStubs {
    let sameRankStubPairs = 0;
    let crossRankStubPairs = 0;
    let sameRankSingleBonds = 0;
    // group segment ids by bond base — `bond:<key>:<idx>` is the base
    const stubsByBase = new Map<string, Segment[]>();
    const singleBondBases = new Set<string>();
    for (const s of segments) {
        const slash = s.id.indexOf("/");
        const base = slash === -1 ? s.id : s.id.slice(0, slash);
        if (!base.startsWith("bond:")) continue;
        const suffix = slash === -1 ? "" : s.id.slice(slash + 1);
        if (suffix === "stub-l" || suffix === "stub-r") {
            const list = stubsByBase.get(base);
            if (list) list.push(s);
            else stubsByBase.set(base, [s]);
        } else if (suffix === "" && s.kind === "bond") {
            singleBondBases.add(base);
        }
    }
    // classify each stub-base as same-rank or cross-rank by looking at
    // the persons' ranks in the placed graph
    for (const stubs of stubsByBase.values()) {
        if (stubs.length === 0) continue;
        const [a, b] = stubs[0]!.persons;
        if (!a || !b) continue;
        const ra = placed.nodes.get(a)?.rank;
        const rb = placed.nodes.get(b)?.rank;
        if (ra === undefined || rb === undefined) continue;
        if (ra === rb) sameRankStubPairs++;
        else crossRankStubPairs++;
    }
    sameRankSingleBonds = singleBondBases.size;
    return { sameRankStubPairs, crossRankStubPairs, sameRankSingleBonds };
}

function orientationMetrics(tree: Tree, placed: PlacedGraph): OrientationBreakdown {
    let bothKnownMaleLeft = 0;
    let bothKnownFemaleLeft = 0;
    let oneKnown = 0;
    let bothUnknown = 0;
    for (const couple of tree.couples) {
        if (couple.leftId === couple.rightId) continue;
        const lp = tree.people[couple.leftId];
        const rp = tree.people[couple.rightId];
        if (!lp || !rp) continue;
        const lx = midX(placed, couple.leftId);
        const rx = midX(placed, couple.rightId);
        if (Number.isNaN(lx) || Number.isNaN(rx)) continue;
        const [leftP, rightP]: [Person, Person] = lx <= rx ? [lp, rp] : [rp, lp];
        const lg = leftP.gender;
        const rg = rightP.gender;
        if (lg === "u" && rg === "u") {
            bothUnknown++;
        } else if (lg === "u" || rg === "u") {
            oneKnown++;
        } else {
            // both known — count male-left iff left.gender === "m"
            if (lg === "m") bothKnownMaleLeft++;
            else bothKnownFemaleLeft++;
        }
    }
    return { bothKnownMaleLeft, bothKnownFemaleLeft, oneKnown, bothUnknown };
}

/**
 * Count orthogonal segment intersections in the routed output. All
 * layered-engine segments are axis-aligned, so an intersection is:
 *   horizontal-segment H crosses vertical-segment V iff
 *     V.x ∈ (min(H.x1,H.x2), max(H.x1,H.x2)) AND
 *     H.y ∈ (min(V.y1,V.y2), max(V.y1,V.y2))
 *
 * Shared endpoints don't count (open intervals). Two same-direction
 * overlaps don't count (rare in the layered output and not a "crossing"
 * in the Sugiyama sense).
 */
function crossingsCount(segments: readonly Segment[]): number {
    const horizontals: { x1: number; x2: number; y: number; id: string }[] = [];
    const verticals: { x: number; y1: number; y2: number; id: string }[] = [];
    for (const s of segments) {
        if (Math.abs(s.y1 - s.y2) < 1e-9) {
            const x1 = Math.min(s.x1, s.x2);
            const x2 = Math.max(s.x1, s.x2);
            horizontals.push({ x1, x2, y: s.y1, id: s.id });
        } else if (Math.abs(s.x1 - s.x2) < 1e-9) {
            const y1 = Math.min(s.y1, s.y2);
            const y2 = Math.max(s.y1, s.y2);
            verticals.push({ x: s.x1, y1, y2, id: s.id });
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

function measure(label: string, tree: Tree): FixtureMetrics {
    const visible = new Set<PersonId>(Object.keys(tree.people));
    const lg = layer(tree, visible, tree.rootId, undefined);
    const og = order(lg, undefined);
    const pg = place(og, undefined);
    const { segments } = route(pg, tree);

    let ghosts = 0;
    for (const node of pg.nodes.values()) if (node.kind === "ghost") ghosts++;

    return {
        label,
        people: Object.keys(tree.people).length,
        couples: tree.couples.length,
        ghosts,
        bboxWidth: pg.bbox.width,
        bboxHeight: pg.bbox.height,
        ghostAdjacency: ghostAdjacencyMetrics(pg),
        bondStubs: bondStubMetrics(segments, pg),
        orientation: orientationMetrics(tree, pg),
        crossings: crossingsCount(segments),
    };
}

function renderBaselineMd(results: readonly FixtureMetrics[]): string {
    const lines: string[] = [];
    lines.push("# Layered engine baseline metrics (Phase 0a, 14 May 2026)");
    lines.push("");
    lines.push(
        "Auto-generated by `apps/web/tests/spikes/layered-metrics.spike.test.ts`. " +
            "Phase 1 and Phase 2 re-run the spike and write to the `.local` variants " +
            "(gitignored) so the diff against this committed baseline becomes the " +
            "verification surface.",
    );
    lines.push("");

    lines.push("## Topology");
    lines.push("");
    lines.push("| fixture | people | couples | ghosts | bbox width × height |");
    lines.push("|---|---:|---:|---:|---|");
    for (const r of results) {
        lines.push(
            `| ${r.label} | ${String(r.people)} | ${String(r.couples)} | ${String(r.ghosts)} ` +
                `| ${r.bboxWidth.toFixed(1)} × ${r.bboxHeight.toFixed(1)} u |`,
        );
    }
    lines.push("");

    lines.push("## Ghost adjacency");
    lines.push("");
    lines.push(
        "Distance (units) from each ghost to its `near` partner. The DELTA=2.5u " +
            "policy in `passes/place.ts` brings ghosts to ~3u when ordering is locally " +
            "adjacent; entries here are the residual cases where `passes/order.ts` " +
            "interleaved a foreign node between the ghost and its near. See [bugs.md:13](../bugs.md#L13).",
    );
    lines.push("");
    lines.push("| fixture | total ghosts | > 5u | > 10u | > 17.5u | worst |");
    lines.push("|---|---:|---:|---:|---:|---:|");
    for (const r of results) {
        const g = r.ghostAdjacency;
        lines.push(
            `| ${r.label} | ${String(g.totalGhosts)} | ${String(g.stranded5)} ` +
                `| ${String(g.stranded10)} | ${String(g.stranded175)} ` +
                `| ${g.maxStrand.toFixed(1)} u |`,
        );
    }
    lines.push("");

    lines.push("## Bond stubbing");
    lines.push("");
    lines.push(
        "Same-rank stub pairs are the [bugs.md:17](../bugs.md#L17) symptom — the " +
            "couple's bond should be one continuous segment but `route.ts` emitted " +
            "`/stub-l` + `/stub-r` instead, because `bondSpan > maxBondSpan` fired " +
            "even on visually short bonds. Cross-rank stub pairs are the legitimate " +
            "L-bond case. See [notes/profiles/route-stub-paths.md](./route-stub-paths.md) " +
            "for the audit.",
    );
    lines.push("");
    lines.push(
        "| fixture | same-rank stub pairs | cross-rank stub pairs | same-rank single bonds |",
    );
    lines.push("|---|---:|---:|---:|");
    for (const r of results) {
        const b = r.bondStubs;
        lines.push(
            `| ${r.label} | ${String(b.sameRankStubPairs)} | ${String(b.crossRankStubPairs)} ` +
                `| ${String(b.sameRankSingleBonds)} |`,
        );
    }
    lines.push("");

    lines.push("## Couple orientation");
    lines.push("");
    lines.push(
        "Male-left vs female-left counts grouped by gender-pair status. The Phase 1 " +
            "father-left tie-break only applies to `both-known` couples; `one-known` " +
            "and `both-unknown` pairs keep whatever order `passes/order.ts` produced. " +
            "See [bugs.md:18](../bugs.md#L18).",
    );
    lines.push("");
    lines.push(
        "| fixture | both-known male-left | both-known female-left | one-known | both-unknown | male-left % (of both-known) |",
    );
    lines.push("|---|---:|---:|---:|---:|---:|");
    for (const r of results) {
        const o = r.orientation;
        const bk = o.bothKnownMaleLeft + o.bothKnownFemaleLeft;
        const pct = bk === 0 ? "n/a" : `${((o.bothKnownMaleLeft / bk) * 100).toFixed(1)}%`;
        lines.push(
            `| ${r.label} | ${String(o.bothKnownMaleLeft)} | ${String(o.bothKnownFemaleLeft)} ` +
                `| ${String(o.oneKnown)} | ${String(o.bothUnknown)} | ${pct} |`,
        );
    }
    lines.push("");

    lines.push("## Crossings");
    lines.push("");
    lines.push(
        "Count of orthogonal horizontal-vertical segment intersections in the " +
            "routed output. Shared endpoints excluded. Phase 2's ghost-cluster " +
            "post-pass must keep this within +5% of these baselines.",
    );
    lines.push("");
    lines.push("| fixture | crossings |");
    lines.push("|---|---:|");
    for (const r of results) {
        lines.push(`| ${r.label} | ${String(r.crossings)} |`);
    }
    lines.push("");

    return lines.join("\n");
}

describe("layered-metrics.spike — Phase 0a baseline", () => {
    const results: FixtureMetrics[] = [];

    it("collects metrics on the 8-person regression fixture", () => {
        const r = measure("eightPersonFamily", eightPersonFamily());
        expect(r.people).toBe(8);
        results.push(r);
    });

    it("collects metrics on the ghost-stranding distilled fixture", () => {
        const r = measure("ghostStrandingDistilled", ghostStrandingDistilled());
        expect(r.people).toBeGreaterThan(10);
        results.push(r);
    });

    it("collects metrics on the Akarians DEMO fixture", () => {
        const r = measure("Akarians", loadAkarians());
        expect(r.people).toBeGreaterThan(1500);
        results.push(r);
    });

    it("writes baseline JSON + markdown", () => {
        // Sort by people count ascending so the small fixtures show first.
        results.sort((a, b) => a.people - b.people);
        const payload = {
            generatedAt: "2026-05-14",
            fixtures: results,
        };
        writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2) + "\n", "utf-8");
        writeFileSync(OUT_MD, renderBaselineMd(results), "utf-8");
    });
});
