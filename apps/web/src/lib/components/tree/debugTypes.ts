/*
 * FamilyTreeEditor - debug overlay types
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { HvLayoutResult } from "$lib/layout/hvLayout";
import type { RenderedSegment } from "$lib/components/tree/edges";
import type { Path } from "$lib/layout/graph";
import type { PersonId } from "$lib/domain/types";

export interface DebugLayerOptions {
    showGrid: boolean;
    showNodeBounds: boolean;
    showSegmentIds: boolean;
    showGhostArrows: boolean;
    showComponentBounds: boolean;
    showHops: boolean;
    showOverlapPairs: boolean;
    exposeTreeDebug: boolean;
}

export interface DebugOverlayProps {
    layout: HvLayoutResult;
    segments: readonly RenderedSegment[];
    tracePath?: Path | undefined;
    selectedId?: PersonId | undefined;
    layers: DebugLayerOptions;
    unit: number;
}
