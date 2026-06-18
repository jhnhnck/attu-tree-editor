/*
 * FamilyTreeEditor - debug overlay types
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { HvLayoutResult } from "$lib/components/tree/canvasLayout";
import type { RenderedSegment } from "$lib/components/tree/edges";
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

/**
 * Family-view debug overlay toggle set. Distinct from `DebugLayerOptions`
 * because family-view has no segment grammar / placedGraph — its overlays
 * key off `FamilyViewLayout.nodes` instead.
 *
 * Phase 0 (walking skeleton) flags:
 *
 *   - `exposeFamilyDebug` — populate `window.__treeDebug` with the
 *     family-view shape (engine discriminator + layout + subset +
 *     expansion + primary/secondary-union state). Parallels
 *     `DebugLayerOptions.exposeTreeDebug` for the layered engine.
 *   - `showVisibleSubset` — paint one dashed rect around the laid-out
 *     cards' combined bbox.
 *
 * Phase 1 (connectivity overlays — chase floating people):
 *
 *   - `showOrphanBadge` — circle + label on every visible person whose
 *     `in + out` edge count is zero. Parity-in-spirit with the layered
 *     `showOrphanBadge`.
 *   - `showEdgeRoles` — color every edge by its `role` (couple-bond,
 *     parent-drop, child-drop, sibling-bus, n-partner-bus). Emits
 *     `data-edge-role` and `data-edge-id` on every path so devtools and
 *     e2e can target individual edges.
 *   - `showOffSubsetPeople` — side panel listing `tree.people` ids that
 *     are NOT in `subset.visible`, grouped by `RejectionReason`. Surfaces
 *     the root cause of floating-people: persons reachable only via a
 *     secondary union land here with a `secondary-union-not-expanded`
 *     reason.
 *   - `showSecondaryUnionState` — small pill on each visible card showing
 *     that card's unions: primary index, expanded-secondary indices,
 *     total union count.
 *
 * Phase 2 (multi-union geometry — chase polygamy issues):
 *
 *   - `showMultiUnionManifold` — for every visible union with
 *     `partnerIds.length > 2`, highlight the bus polyline (the
 *     n-partner-bus edges already emitted by `layout.ts` via
 *     `computeManifold`), mark the union's `childAnchor`, and mark each
 *     partner's bus-connection point. labels the union index so multiple
 *     polycules on the canvas stay distinguishable.
 *   - `showCardCollisions` — same-rank cards whose bounding rects
 *     overlap get a red dashed rect on their intersection (parity in
 *     spirit with the layered engine's `showOverlapPairs`). diagnostic
 *     surface for the "bus routes through occupied card space" bug
 *     class.
 *   - `showCoupleCentroidDelta` — for each 2-partner couple anchor,
 *     draws a short line between the bond midpoint (= manifold child
 *     anchor) and the children's centroid; labels the |delta| in
 *     unit-space x. parity with layered `showBondCentroidDelta`. zero
 *     delta is healthy; non-zero highlights a card-positioning skew.
 *   - `showRankGutterLabels` — `g-2`, `g-1`, `g0`, `g+1` labels on the
 *     left margin of the canvas at each rank's bus y-coordinate, so the
 *     rank addressing is visible while pairs of overlays from different
 *     ranks intersect on screen.
 *
 * Phase 3 (navigation diagnostics — chase jump-to-person):
 *
 *   - `logFocusEvents` — append-only side panel listing the last N
 *     selection / focus-change events. Each entry records timestamp,
 *     source (palette / card click / keyboard / command / inspector /
 *     other), the person id, and whether `canvasController.centerOnPerson`
 *     (or its `focusSelection` alias) was invoked in response. Surfaces
 *     the silent-no-op case where selection changes without a follow-up
 *     recenter.
 *   - `showViewportFitTarget` — on every centerOn call, paint the
 *     target person's expected bounding rect plus the current viewport
 *     rect in unit space, so off-screen targets are visually obvious and
 *     the auto-fit's settling pass is observable frame-by-frame.
 *   - `showOffSubsetWarning` — if `selectedId` is set but is NOT in the
 *     visible subset, show a corner badge naming the missing person and
 *     the rejection reason (reused from phase 1's `rationale`). The
 *     `centerOnPerson` path silently shifts `focusOverride` in this
 *     case, which can look like a no-op when the new bbox matches the
 *     old; the badge makes the recovery path observable.
 *   - `showPendingRecenter` — flash the canvas border green for ~250ms
 *     when `centerOnPerson` / `focusSelection` is invoked. If a
 *     selection change is not followed by a recenter within ~200ms, a
 *     red corner badge appears with the missing person's name. This is
 *     the watchdog: it draws attention to the exact failure mode the
 *     palette-jump bug exhibits.
 *
 * Phase 5 (polish, parity, metrics):
 *
 *   - `showGrid` — unit grid + 10x emphasis lines, parity with the
 *     layered `showGrid`. Lets the reviewer eyeball coordinates and
 *     row heights in unit space.
 *   - `showNodeBounds` — green rect + id label around each laid-out
 *     card, parity with the layered `showNodeBounds`. Surfaces the
 *     same node geometry that drives the layout pass.
 *   - `showLastEditHalo` — 1s yellow ring around the most recently
 *     mutated card, parity with the layered `showLastEditHalo`. Keys
 *     off the same `lastEditedId` App.svelte already maintains for
 *     the layered overlay.
 *   - `showLayoutMetrics` — fixed-position readout panel: visible
 *     card count, badge count, expansion-state size, rank
 *     distribution, layout duration ms. Mirrors the "did the engine
 *     do too much work this tick" question the layered timings panel
 *     answers for the worker path.
 */
export interface FamilyViewDebugLayerOptions {
    exposeFamilyDebug: boolean;
    showVisibleSubset: boolean;
    // phase 1 connectivity overlays
    showOrphanBadge: boolean;
    showEdgeRoles: boolean;
    showOffSubsetPeople: boolean;
    showSecondaryUnionState: boolean;
    // phase 2 multi-union geometry
    showMultiUnionManifold: boolean;
    showCardCollisions: boolean;
    showCoupleCentroidDelta: boolean;
    showRankGutterLabels: boolean;
    // phase 3 navigation diagnostics
    logFocusEvents: boolean;
    showViewportFitTarget: boolean;
    showOffSubsetWarning: boolean;
    showPendingRecenter: boolean;
    // phase 4 coi inspector
    showCoiBreakdown: boolean;
    showDuplicateAncestors: boolean;
    // phase 5 polish + parity + metrics
    showGrid: boolean;
    showNodeBounds: boolean;
    showLastEditHalo: boolean;
    showLayoutMetrics: boolean;
}

export interface DebugOverlayProps {
    layout: HvLayoutResult;
    segments: readonly RenderedSegment[];
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
