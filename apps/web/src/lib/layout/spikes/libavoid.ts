/*
 * FamilyTreeEditor - Phase 1 spike: libavoid-js obstacle-avoiding routing
 * over an existing PlacedGraph.
 *
 * Read-only adapter — does not replace the production `route.ts` pass.
 * Phase 1's job is to retire the highest-severity perf and WASM-in-worker
 * risks before Phase 3 commits the LayoutEngine boundary and Phase 4
 * deletes the legacy router. Findings (timing, polyline shape, nudge
 * magnitude, WASM compliance) feed those phases.
 *
 * Lifecycle:
 *   1. `await loadLibavoid()` once per process (lazy, idempotent).
 *   2. `runLibavoidSpike(placed, tree)` builds a transient `Avoid.Router`,
 *      registers obstacles + connectors, calls `processTransaction`,
 *      reads back polylines, then `router.delete()` to free WASM memory.
 *   3. Caller inspects `SpikeResult` (timing, polylines, derived nudge
 *      magnitude on adjacent connectors).
 *
 * Phase 4 promotes this into a real `EdgeRouter` implementation under
 * `routers/libavoid/index.ts` (currently a straight-line stub) with port
 * directions, the virtual-zero-area-shape couple-bond pattern, sibling-fan
 * bundling, and incremental routing.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { AvoidLib } from "libavoid-js";
import { PERSON_W } from "$lib/layout/hvLayout";
import type { LayoutNodeId, PlacedGraph } from "$lib/layout/ir";
import type { Tree } from "$lib/domain/types";

/** Card height in unit space — matches `route.ts`'s `CARD_H`. */
const CARD_H = 1.2;

/**
 * Buffer libavoid keeps clear around each shape, in unit space. 0.2 u
 * matches the project's `LANE_H` granularity and keeps adjacent gutters
 * routable. Tuned during the spike; Phase 4 may revisit.
 */
const SHAPE_BUFFER_DISTANCE = 0.2;

/**
 * Ideal nudging distance — separation libavoid prefers between parallel
 * connector segments. Half a lane keeps multi-edge gutters readable.
 */
const IDEAL_NUDGING_DISTANCE = 0.4;

/** Output polyline in unit-space coordinates. */
export interface SpikePolyline {
    readonly id: string;
    readonly relationship: "parent" | "spouse";
    readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export interface SpikeOptions {
    /**
     * Cap the number of logical connectors registered with the router.
     * Phase 1 uses this to characterize libavoid's scaling curve without
     * having to wait through the full DEMO fixture each iteration.
     */
    readonly connectorLimit?: number;
    /**
     * Disable libavoid's `nudgeOrthogonalSegmentsConnectedToShapes`
     * preprocessing pass. The default is on; turning it off is the
     * cheapest perf knob per the plan §Phase 4 rollback path.
     */
    readonly disableNudging?: boolean;
}

export interface SpikeResult {
    readonly obstacleCount: number;
    readonly connectorCount: number;
    /** Wall-clock for `processTransaction()` only; excludes setup/teardown. */
    readonly transactionMs: number;
    /** Wall-clock for the whole spike (load + setup + transaction + readout). */
    readonly totalMs: number;
    /** Wall-clock to register all obstacles + connectors before the transaction. */
    readonly setupMs: number;
    readonly polylines: readonly SpikePolyline[];
    /**
     * Median sub-unit nudge magnitude observed between *parallel adjacent*
     * polyline segments. Used to derive the bundling grid resolution in
     * Phase 4.3 (typically grid = nudge / 2). Undefined if there were
     * fewer than 2 parallel segment pairs to compare.
     */
    readonly medianNudge: number | undefined;
    /** Counts of visited polyline lengths; useful for sanity-checking. */
    readonly polylineSizeHistogram: Readonly<Record<number, number>>;
    readonly options: SpikeOptions;
}

/**
 * libavoid-js's TypeScript declarations type the runtime enum values as
 * plain TS `enum` (i.e. number), but at runtime each value is an
 * emscripten enum object exposing the integer via `.value`. This helper
 * centralises the cast so the rest of the spike doesn't need
 * `as unknown as { value: number }` everywhere.
 *
 * `RouterFlag` is missing from libavoid-js's d.ts entirely (present at
 * runtime). We work around by treating the Avoid namespace as a loose
 * record for the few enum lookups the spike needs; production routing
 * code in Phase 4 should declare its own typed wrapper.
 */
function enumInt(v: unknown): number {
    return (v as { value: number }).value;
}

interface AvoidRuntime {
    readonly RouterFlag: Record<string, unknown>;
    readonly RoutingParameter: Record<string, unknown>;
    readonly RoutingOption: Record<string, unknown>;
}

let loaded = false;
let loadPromise: Promise<void> | null = null;

/**
 * Lazy + idempotent libavoid-js loader. Safe to await repeatedly. In a
 * Vite browser/worker context the Vite WASM URL helper resolves the
 * `.wasm` to a separately-fetched asset (LGPL-compliant); in node the
 * default `index-node.mjs` entry locates the `.wasm` next to itself.
 */
export async function loadLibavoid(wasmUrl?: string): Promise<void> {
    if (loaded) return;
    if (loadPromise) {
        await loadPromise;
        return;
    }
    loadPromise = AvoidLib.load(wasmUrl).then(() => {
        loaded = true;
    });
    await loadPromise;
}

export function runLibavoidSpike(
    placed: PlacedGraph,
    _tree: Tree,
    opts: SpikeOptions = {},
): SpikeResult {
    if (!loaded) {
        throw new Error(
            "libavoid not loaded — call `await loadLibavoid()` before running the spike",
        );
    }
    const Avoid = AvoidLib.getInstance();
    const AvoidEnums = Avoid as unknown as AvoidRuntime;

    const t0 = performance.now();

    const router = new Avoid.Router(enumInt(AvoidEnums.RouterFlag.OrthogonalRouting));
    router.setRoutingParameter(
        enumInt(AvoidEnums.RoutingParameter.shapeBufferDistance),
        SHAPE_BUFFER_DISTANCE,
    );
    router.setRoutingParameter(
        enumInt(AvoidEnums.RoutingParameter.idealNudgingDistance),
        IDEAL_NUDGING_DISTANCE,
    );
    if (opts.disableNudging) {
        router.setRoutingOption(
            enumInt(AvoidEnums.RoutingOption.nudgeOrthogonalSegmentsConnectedToShapes),
            false,
        );
    }

    // 1. Register one obstacle per placed person/ghost.
    const shapes = new Map<LayoutNodeId, unknown>();
    for (const [id] of placed.nodes) {
        const x = placed.x.get(id) ?? 0;
        const y = placed.y.get(id) ?? 0;
        const tl = new Avoid.Point(x, y);
        const br = new Avoid.Point(x + PERSON_W, y + CARD_H);
        const rect = new Avoid.Rectangle(tl, br);
        shapes.set(id, new Avoid.ShapeRef(router, rect));
    }

    // 2. Register one connector per logical edge (parent + spouse).
    //    We pin endpoints to the card centre on the canonical port for the
    //    relationship: parent-child = top-mid → bottom-mid; spouse =
    //    inner-mid → inner-mid. This is enough to compare libavoid output
    //    to today's hand-routed segments without yet using `ConnEnd(shape)`
    //    direction flags (deferred to Phase 4.2).
    const connectors: Array<{
        id: string;
        relationship: SpikePolyline["relationship"];
        conn: { displayRoute(): { size(): number; at(i: number): { x: number; y: number } } };
    }> = [];

    const limit = opts.connectorLimit ?? Infinity;
    for (const e of placed.parentEdges) {
        if (connectors.length >= limit) break;
        const px = placed.x.get(e.parent);
        const py = placed.y.get(e.parent);
        const cx = placed.x.get(e.child);
        const cy = placed.y.get(e.child);
        if (px === undefined || py === undefined || cx === undefined || cy === undefined) continue;
        const src = new Avoid.ConnEnd(new Avoid.Point(px + PERSON_W / 2, py + CARD_H));
        const dst = new Avoid.ConnEnd(new Avoid.Point(cx + PERSON_W / 2, cy));
        const conn = new Avoid.ConnRef(router, src, dst);
        connectors.push({
            id: `parent:${e.parent}|${e.child}`,
            relationship: "parent",
            conn,
        });
    }
    for (const e of placed.spouseEdges) {
        if (connectors.length >= limit) break;
        const ax = placed.x.get(e.a);
        const ay = placed.y.get(e.a);
        const bx = placed.x.get(e.b);
        const by = placed.y.get(e.b);
        if (ax === undefined || ay === undefined || bx === undefined || by === undefined) continue;
        const aIsLeft = ax < bx;
        const aPt = new Avoid.Point(ax + (aIsLeft ? PERSON_W : 0), ay + CARD_H / 2);
        const bPt = new Avoid.Point(bx + (aIsLeft ? 0 : PERSON_W), by + CARD_H / 2);
        const src = new Avoid.ConnEnd(aPt);
        const dst = new Avoid.ConnEnd(bPt);
        const conn = new Avoid.ConnRef(router, src, dst);
        connectors.push({
            id: `spouse:${e.coupleKey}`,
            relationship: "spouse",
            conn,
        });
    }

    const setupMs = performance.now() - t0;

    // 3. Solve all connectors in one transaction.
    const txStart = performance.now();
    router.processTransaction();
    const transactionMs = performance.now() - txStart;

    // 4. Read back polylines.
    const polylines: SpikePolyline[] = [];
    const sizeHistogram = new Map<number, number>();
    for (const c of connectors) {
        const route = c.conn.displayRoute();
        const n = route.size();
        sizeHistogram.set(n, (sizeHistogram.get(n) ?? 0) + 1);
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < n; i++) {
            const p = route.at(i);
            points.push({ x: p.x, y: p.y });
        }
        polylines.push({ id: c.id, relationship: c.relationship, points });
    }

    // 5. Free WASM memory.
    router.delete();

    const totalMs = performance.now() - t0;

    return {
        obstacleCount: shapes.size,
        connectorCount: connectors.length,
        transactionMs,
        totalMs,
        setupMs,
        polylines,
        medianNudge: medianParallelNudge(polylines),
        polylineSizeHistogram: Object.fromEntries(sizeHistogram),
        options: opts,
    };
}

/**
 * Among parallel adjacent horizontal/vertical segment pairs across all
 * polylines, return the median absolute orthogonal offset. Phase 4.3 uses
 * this to derive the bundling grid resolution.
 *
 * Two segments are "parallel adjacent" if they share an axis (both
 * horizontal at the same y range or vertical at the same x range) and lie
 * within a small window of each other. This catches the typical
 * libavoid-nudged trunk-drops where two siblings' drops to the same bus
 * end up at slightly offset x.
 */
function medianParallelNudge(polylines: readonly SpikePolyline[]): number | undefined {
    interface Seg {
        axis: "h" | "v";
        /** invariant coordinate (y for h, x for v) */
        constCoord: number;
        /** axis-range start */
        lo: number;
        /** axis-range end */
        hi: number;
    }
    const segs: Seg[] = [];
    for (const pl of polylines) {
        for (let i = 1; i < pl.points.length; i++) {
            const a = pl.points[i - 1]!;
            const b = pl.points[i]!;
            if (a.x === b.x && a.y !== b.y) {
                segs.push({
                    axis: "v",
                    constCoord: a.x,
                    lo: Math.min(a.y, b.y),
                    hi: Math.max(a.y, b.y),
                });
            } else if (a.y === b.y && a.x !== b.x) {
                segs.push({
                    axis: "h",
                    constCoord: a.y,
                    lo: Math.min(a.x, b.x),
                    hi: Math.max(a.x, b.x),
                });
            }
        }
    }
    const offsets: number[] = [];
    for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
            const s1 = segs[i]!;
            const s2 = segs[j]!;
            if (s1.axis !== s2.axis) continue;
            const dist = Math.abs(s1.constCoord - s2.constCoord);
            if (dist === 0 || dist > 1) continue; // require sub-unit, not coincident
            const overlap = Math.min(s1.hi, s2.hi) - Math.max(s1.lo, s2.lo);
            if (overlap <= 0) continue;
            offsets.push(dist);
        }
    }
    if (offsets.length === 0) return undefined;
    offsets.sort((a, b) => a - b);
    return offsets[Math.floor(offsets.length / 2)];
}
