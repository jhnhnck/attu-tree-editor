/*
 * FamilyTreeEditor - layout Web Worker.
 *
 * Dispatches to a `LayoutEngine` by `engineId`. Today the layered path is
 * the only one that produces real output via `passes/route.ts`; the
 * hyperbolic path is short-circuited at the canvas component (Phase 0
 * stub) and Phase 5 will wire it through. The worker accepts an
 * `engineId` field on every input so the dispatch site exists now.
 *
 * The worker still posts the legacy `{ layered, ordered, placed,
 * segments }` wire shape so the existing `TreeCanvas` consumer doesn't
 * break; the `LayeredEngine` adapter (`engines/layered-hv/index.ts`)
 * exposes those on its `result.legacy`. Phase 4+ will start consuming
 * the new `LayoutResult` directly and the legacy fields will go away.
 *
 * Input  (MessageEvent.data): { seq, tree, rootId, engineId?, overrides? }
 * Output (postMessage):       { seq, engineId, layered, ordered, placed, segments, warnings }
 *
 * Memoization: cache key is a content hash of the layout-relevant fields
 * (people, couples, rootId) plus the engine id and overrides hash.
 *
 * The main thread drops responses whose seq < layoutSeq (stale results
 * from previous tree states).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { LayeredEngine, type LayeredEngineTimings } from "$lib/layout/engines/layered-hv";
import {
    serializeLayered,
    serializeOrdered,
    serializePlaced,
    hydrateOverrides,
    type LayeredGraphWire,
    type LayoutWarning,
    type OrderedGraphWire,
    type PlacedGraphWire,
    type LayoutOverridesWire,
} from "$lib/layout/ir";
import type { Segment } from "$lib/layout/edgeRouter";
import type { Tree } from "$lib/domain/types";

/** Engines we know how to dispatch to. Mirrors `EngineKind` in `state/engine.ts`. */
type EngineId = "layered" | "hyperbolic";

interface WorkerInput {
    seq: number;
    tree: Tree;
    rootId: string;
    engineId?: EngineId;
    overrides?: LayoutOverridesWire;
}

interface CacheEntry {
    treeId: string;
    engineId: EngineId;
    contentHash: string;
    rootId: string;
    overridesHash: string;
    layered: LayeredGraphWire;
    ordered: OrderedGraphWire;
    placed: PlacedGraphWire;
    segments: readonly Segment[];
    warnings: readonly LayoutWarning[];
    timings: LayeredEngineTimings;
}

let cache: CacheEntry | null = null;

const layeredEngine = new LayeredEngine();

function hashOverrides(w: LayoutOverridesWire | undefined): string {
    if (!w) return "";
    return JSON.stringify({
        pinned: w.pinned ?? null,
        swap: w.swap ?? null,
        laneHints: w.laneHints ?? null,
    });
}

function hashTreeContent(tree: Tree): string {
    const peopleSig: [string, string | undefined, string | undefined][] = [];
    for (const id of Object.keys(tree.people).sort()) {
        const p = tree.people[id];
        if (!p) continue;
        peopleSig.push([id, p.motherId, p.fatherId]);
    }
    const couplesSig = tree.couples
        .map(
            (c) =>
                // isCurrent flips the bond role between married/divorced in
                // route.ts; missing it from the key would let a divorce edit
                // hit the cache and keep painting the bond as married.
                `${c.leftId}|${c.rightId}|${String(c.unionIndex)}|${c.isCurrent === false ? "0" : "1"}`,
        )
        .sort();
    return JSON.stringify({ rootId: tree.rootId, people: peopleSig, couples: couplesSig });
}

self.onmessage = (e: MessageEvent<WorkerInput>): void => {
    const { seq, tree, rootId, engineId = "layered", overrides: overridesWire } = e.data;
    const overridesHash = hashOverrides(overridesWire);
    const contentHash = hashTreeContent(tree);

    if (
        cache &&
        cache.treeId === tree.id &&
        cache.engineId === engineId &&
        cache.contentHash === contentHash &&
        cache.rootId === rootId &&
        cache.overridesHash === overridesHash
    ) {
        self.postMessage({
            seq,
            engineId,
            layered: cache.layered,
            ordered: cache.ordered,
            placed: cache.placed,
            segments: cache.segments,
            warnings: cache.warnings,
            // cache-hit timings reflect the original run, not zero — useful
            // signal that re-renders are landing on the cache fast path.
            timings: cache.timings,
        });
        return;
    }

    // Phase 3: the worker only knows how to run the layered engine. The
    // hyperbolic path short-circuits at the canvas component (HyperbolicCanvas
    // renders without subscribing to worker output); Phase 5 wires the
    // hyperbolic engine through here. For now, any engineId !== "layered"
    // falls back to layered output so the worker never starves the consumer.
    const overrides = overridesWire ? hydrateOverrides(overridesWire) : undefined;
    const visible = new Set<string>(Object.keys(tree.people));
    const result = layeredEngine.layout({
        tree,
        visible,
        focus: rootId,
        ...(overrides !== undefined ? { overrides } : {}),
    });

    const { layered: lg, ordered: og, placed: pg, segments, warnings } = result.legacy;
    const layered = serializeLayered(lg);
    const ordered = serializeOrdered(og);
    const placed = serializePlaced(pg);

    cache = {
        treeId: tree.id,
        engineId,
        contentHash,
        rootId,
        overridesHash,
        layered,
        ordered,
        placed,
        segments,
        warnings,
        timings: result.timings,
    };

    self.postMessage({
        seq,
        engineId,
        layered,
        ordered,
        placed,
        segments,
        warnings,
        timings: result.timings,
    });
};
