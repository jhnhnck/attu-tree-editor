/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - family-view debug overlay phase 2 multi-union geometry
 * structural invariants.
 *
 * Migrated from `tests/e2e/family-view-debug-multi-union.spec.ts` as part
 * of phase 1c. The original drove the production debug-menu keyboard
 * shortcut to flip overlay toggles; here we pass `debugOptions` directly
 * to `FamilyViewCanvas` and assert against the rendered overlay testids.
 *
 * What this exercises (against `multi-union-3.ged`, a hand-built fixture
 * with one closed 3-partner _TREES_UNION on Aron + a 2-partner couple
 * with Mira):
 *
 *   1. `showMultiUnionManifold` mounts a bus polyline + child-anchor +
 *      label + per-partner markers for the 3-partner anchor.
 *   2. `showCardCollisions` mounts but stays empty on the clean fixture
 *      (zero card overlaps).
 *   3. `showCoupleCentroidDelta` mounts the delta line + label for the
 *      Aron+Mira 2-partner couple.
 *   4. `showRankGutterLabels` mounts `g0` and `g+1` rank labels.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";

import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
import type { FamilyViewDebugLayerOptions } from "$lib/components/tree/debugTypes";
import { loadGedcomFixture } from "./_harness/loadGedcomFixture";
import { mountWithHostRect } from "./_harness/mountWithHostRect";

function defaultLayers(): FamilyViewDebugLayerOptions {
    return {
        exposeFamilyDebug: false,
        showVisibleSubset: false,
        showOrphanBadge: false,
        showEdgeRoles: false,
        showOffSubsetPeople: false,
        showSecondaryUnionState: false,
        showMultiUnionManifold: false,
        showCardCollisions: false,
        showCoupleCentroidDelta: false,
        showRankGutterLabels: false,
        logFocusEvents: false,
        showViewportFitTarget: false,
        showOffSubsetWarning: false,
        showPendingRecenter: false,
        showCoiBreakdown: false,
        showDuplicateAncestors: false,
        showGrid: false,
        showNodeBounds: false,
        showLastEditHalo: false,
        showLayoutMetrics: false,
    };
}

describe("family-view debug overlay - phase 2 multi-union geometry", () => {
    beforeEach(() => {
        if (!Element.prototype.scrollIntoView) {
            Element.prototype.scrollIntoView = vi.fn();
        }
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("showMultiUnionManifold mounts bus + anchor + label + 3 partner markers; toggle-off clears them", async () => {
        const tree = loadGedcomFixture("apps/tree-editor/tests/fixtures/multi-union-3.ged");

        // pre-toggle: no manifold markers
        const off = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, debugOptions: { layers: defaultLayers() } },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();
        expect(
            off.container.querySelectorAll("[data-testid='family-view-debug-mu-bus']").length,
        ).toBe(0);
        expect(
            off.container.querySelectorAll("[data-testid='family-view-debug-mu-anchor']").length,
        ).toBe(0);
        expect(
            off.container.querySelectorAll("[data-testid='family-view-debug-mu-label']").length,
        ).toBe(0);
        off.unmount();

        // toggle on: bus + anchor + label all land for the one 3-partner
        // union; three partner-connection markers, one per partner
        const layers = defaultLayers();
        layers.showMultiUnionManifold = true;
        const on = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, debugOptions: { layers } },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();
        expect(
            on.container.querySelectorAll("[data-testid='family-view-debug-mu-bus']").length,
        ).toBe(1);
        expect(
            on.container.querySelectorAll("[data-testid='family-view-debug-mu-anchor']").length,
        ).toBe(1);
        expect(
            on.container.querySelectorAll("[data-testid='family-view-debug-mu-label']").length,
        ).toBe(1);
        expect(
            on.container.querySelectorAll("[data-testid='family-view-debug-mu-partner']").length,
        ).toBe(3);
        on.unmount();
    });

    it("showCardCollisions: mounts cleanly with zero collision rects on a healthy fixture", async () => {
        const tree = loadGedcomFixture("apps/tree-editor/tests/fixtures/multi-union-3.ged");
        const layers = defaultLayers();
        layers.showCardCollisions = true;
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, debugOptions: { layers } },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();
        // mounting the overlay must not crash the canvas, and the
        // collision-free fixture must produce zero rects
        expect(handle.container.querySelector("[data-person-id]")).not.toBeNull();
        expect(
            handle.container.querySelectorAll("[data-testid='family-view-debug-collision']").length,
        ).toBe(0);
        handle.unmount();
    });

    it("showCoupleCentroidDelta: mounts exactly one delta line + label for the Aron+Mira couple", async () => {
        const tree = loadGedcomFixture("apps/tree-editor/tests/fixtures/multi-union-3.ged");
        const layers = defaultLayers();
        layers.showCoupleCentroidDelta = true;
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, debugOptions: { layers } },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();
        expect(
            handle.container.querySelectorAll("[data-testid='family-view-debug-cc-delta-line']")
                .length,
        ).toBe(1);
        expect(
            handle.container.querySelectorAll("[data-testid='family-view-debug-cc-delta-label']")
                .length,
        ).toBe(1);
        handle.unmount();
    });

    it("showRankGutterLabels: mounts both g0 and g+1 labels for the visible ranks", async () => {
        const tree = loadGedcomFixture("apps/tree-editor/tests/fixtures/multi-union-3.ged");
        const layers = defaultLayers();
        layers.showRankGutterLabels = true;
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, debugOptions: { layers } },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();
        const labels = handle.container.querySelectorAll(
            "[data-testid='family-view-debug-rank-label']",
        );
        expect(labels.length).toBe(2);
        const texts = Array.from(labels).map((el) => (el.textContent ?? "").trim());
        expect(texts).toContain("g0");
        expect(texts).toContain("g+1");
        handle.unmount();
    });
});
