/*
 * FamilyTreeEditor - layout Web Worker.
 *
 * Runs the full four-pass layout pipeline (layer → order → place → route) off
 * the main thread. All passes are pure functions with no DOM access, so they
 * can execute safely here.
 *
 * Input  (MessageEvent.data): { seq, tree, rootId, overrides? }
 * Output (postMessage):       { seq, layered, ordered, placed, segments }
 *
 * Memoization: if tree.id, tree.rev, rootId, and overrides hash are all
 * unchanged from the previous run, the cached wire results are reposted
 * immediately without recomputing any pass.
 *
 * The main thread drops responses whose seq < layoutSeq (stale results from
 * previous tree states).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { layer } from "$lib/layout/passes/layer";
import { order } from "$lib/layout/passes/order";
import { place } from "$lib/layout/passes/place";
import { route } from "$lib/layout/passes/route";
import {
    serializeLayered,
    serializeOrdered,
    serializePlaced,
    hydrateOverrides,
    type LayeredGraphWire,
    type OrderedGraphWire,
    type PlacedGraphWire,
    type LayoutOverridesWire,
} from "$lib/layout/ir";
import type { Segment } from "$lib/layout/edgeRouter";
import type { Tree } from "$lib/domain/types";

interface WorkerInput {
    seq: number;
    tree: Tree;
    rootId: string;
    overrides?: LayoutOverridesWire;
}

interface CacheEntry {
    treeId: string;
    treeRev: number;
    rootId: string;
    overridesHash: string;
    layered: LayeredGraphWire;
    ordered: OrderedGraphWire;
    placed: PlacedGraphWire;
    segments: readonly Segment[];
}

let cache: CacheEntry | null = null;

function hashOverrides(w: LayoutOverridesWire | undefined): string {
    if (!w) return "";
    // Deterministic JSON hash: maps are serialised as sorted entry arrays.
    return JSON.stringify({
        pinned: w.pinned ?? null,
        swap: w.swap ?? null,
        laneHints: w.laneHints ?? null,
    });
}

self.onmessage = (e: MessageEvent<WorkerInput>): void => {
    const { seq, tree, rootId, overrides: overridesWire } = e.data;
    const overridesHash = hashOverrides(overridesWire);

    if (
        cache &&
        cache.treeId === tree.id &&
        cache.treeRev === tree.rev &&
        cache.rootId === rootId &&
        cache.overridesHash === overridesHash
    ) {
        self.postMessage({
            seq,
            layered: cache.layered,
            ordered: cache.ordered,
            placed: cache.placed,
            segments: cache.segments,
        });
        return;
    }

    const overrides = overridesWire ? hydrateOverrides(overridesWire) : undefined;
    const visible = new Set<string>(Object.keys(tree.people));
    const lg = layer(tree, visible, rootId, overrides);
    const og = order(lg, overrides);
    const pg = place(og, overrides);
    const { segments } = route(pg, tree);

    const layered = serializeLayered(lg);
    const ordered = serializeOrdered(og);
    const placed = serializePlaced(pg);

    cache = { treeId: tree.id, treeRev: tree.rev, rootId, overridesHash, layered, ordered, placed, segments };

    self.postMessage({ seq, layered, ordered, placed, segments });
};
