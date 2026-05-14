/*
 * FamilyTreeEditor - debug overlay types
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { HvLayoutResult } from "$lib/components/tree/canvasLayout";
import type { RenderedSegment } from "$lib/components/tree/edges";
import type { Path } from "$lib/layout/graph";
import type { PersonId, Tree } from "$lib/domain/types";
import type { LayeredGraph, PlacedGraph } from "$lib/layout/ir";

export interface DebugLayerOptions {
    // Original — preserved verbatim.
    showGrid: boolean;
    showNodeBounds: boolean;
    showSegmentIds: boolean;
    showGhostArrows: boolean;
    showComponentBounds: boolean;
    showHops: boolean;
    showOverlapPairs: boolean;
    exposeTreeDebug: boolean;
    // Phase 3 additions (diagnostics section).
    showCycleNodes: boolean;
    showBondCentroidDelta: boolean;
    showOrphanBadge: boolean;
    showRankGutterLabels: boolean;
    showLastEditHalo: boolean;
}

export interface DebugOverlayProps {
    layout: HvLayoutResult;
    segments: readonly RenderedSegment[];
    tracePath?: Path | undefined;
    selectedId?: PersonId | undefined;
    layers: DebugLayerOptions;
    unit: number;
    /** Phase 3: layered/placed graphs needed for the new overlays. Optional —
     *  overlays gracefully no-op when these aren't supplied. */
    layeredGraph?: LayeredGraph | undefined;
    placedGraph?: PlacedGraph | undefined;
    tree?: Tree | undefined;
    /** Phase 3: id of the most recently mutated person; drives the
     *  last-edit halo overlay. */
    lastEditedId?: PersonId | undefined;
}
