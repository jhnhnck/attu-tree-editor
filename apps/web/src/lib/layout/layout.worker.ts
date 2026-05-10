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
 * Memoization: cache key is a content hash of the layout-relevant fields
 * (people, couples, rootId) plus the overrides hash. Hashing content rather
 * than relying on a counter makes the cache robust to producers that forget
 * to bump a revision; renames, date edits and portrait changes still hit
 * (PersonNode reads tree.people directly), and topology edits always miss.
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
    type LayoutWarning,
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
    contentHash: string;
    rootId: string;
    overridesHash: string;
    layered: LayeredGraphWire;
    ordered: OrderedGraphWire;
    placed: PlacedGraphWire;
    segments: readonly Segment[];
    warnings: readonly LayoutWarning[];
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

/**
 * Content hash over the topology fields the layout pipeline actually reads:
 * person ids + parent links, couple membership + isCurrent (drives the
 * married/divorced edge role), and root. Excludes per-person presentation
 * fields (names, dates, portraits) so renames don't bust the cache.
 */
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
    const { seq, tree, rootId, overrides: overridesWire } = e.data;
    const overridesHash = hashOverrides(overridesWire);
    const contentHash = hashTreeContent(tree);

    if (
        cache &&
        cache.treeId === tree.id &&
        cache.contentHash === contentHash &&
        cache.rootId === rootId &&
        cache.overridesHash === overridesHash
    ) {
        self.postMessage({
            seq,
            layered: cache.layered,
            ordered: cache.ordered,
            placed: cache.placed,
            segments: cache.segments,
            warnings: cache.warnings,
        });
        return;
    }

    const overrides = overridesWire ? hydrateOverrides(overridesWire) : undefined;
    const visible = new Set<string>(Object.keys(tree.people));
    const lg = layer(tree, visible, rootId, overrides);
    const og = order(lg, overrides);
    const pg = place(og, overrides);
    const { segments, warnings } = route(pg, tree);

    const layered = serializeLayered(lg);
    const ordered = serializeOrdered(og);
    const placed = serializePlaced(pg);

    cache = {
        treeId: tree.id,
        contentHash,
        rootId,
        overridesHash,
        layered,
        ordered,
        placed,
        segments,
        warnings,
    };

    self.postMessage({ seq, layered, ordered, placed, segments, warnings });
};
