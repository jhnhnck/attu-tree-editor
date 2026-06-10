/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - family-view debug overlay phase 3 navigation
 * diagnostics structural invariants.
 *
 * Migrated from `tests/e2e/family-view-debug-navigation.spec.ts` as part
 * of phase 1c. The original drove the production palette + keyboard
 * shortcut to land selections; under jsdom we pass `selectedId`,
 * `focusEventsForOverlay`, and `pendingRecenterSeq` directly so the
 * overlay-gated effects can be exercised without the shell.
 *
 * What this exercises (against `Akarians.ged`):
 *
 *   1. `showViewportFitTarget`: toggling on mounts the yellow viewport
 *      rect; once `selectedId` lands on a visible card, the green target
 *      rect mounts too. data-testids live in the canvas's local subtree.
 *   2. `showPendingRecenter`: bumping `pendingRecenterSeq` triggers the
 *      green flash element to mount briefly (sync flip into the dom).
 *   3. `logFocusEvents`: with focusEventsForOverlay carrying a palette-
 *      source entry, the focus-log dom mounts via DockRegistration. the
 *      dock-mounted version of this surface lives in the shell, but the
 *      registry itself is observable from this side.
 *
 * skipped: the dock-rendered focus-log assertion requires a sibling
 * `CanvasChromeDock` mount in the same tree, which the family-view
 * canvas doesn't carry on its own. asserted via the dock registry
 * directly instead, which is the same contract one layer down.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";

import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
import type { FamilyViewDebugLayerOptions } from "$lib/components/tree/debugTypes";
import { clearRegistry, itemsForCorner } from "$lib/components/canvas/dockRegistry.svelte";
import { loadGedcomFixture } from "./_harness/loadGedcomFixture";
import { mountWithHostRect } from "./_harness/mountWithHostRect";

// synthetic ResizeObserver that fires `hostRect` immediately on observe()
// so the canvas's fit/viewport effects see non-zero host dims. matches
// the inline shim in `auto-fit-suppression.test.ts`; the global no-op
// shim in `tests/setup.ts` clears the ReferenceError but never dispatches
// an entry, which the viewport-rect derivation depends on.
function installSyntheticResizeObserver(rect: { width: number; height: number }): () => void {
    const prior = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    class SyntheticRO {
        private cb: (entries: Array<{ contentRect: { width: number; height: number } }>) => void;
        constructor(
            cb: (entries: Array<{ contentRect: { width: number; height: number } }>) => void,
        ) {
            this.cb = cb;
        }
        observe(): void {
            this.cb([{ contentRect: { width: rect.width, height: rect.height } }]);
        }
        unobserve(): void {
            // no-op
        }
        disconnect(): void {
            // no-op
        }
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = SyntheticRO;
    return () => {
        if (prior === undefined) {
            delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
        } else {
            (globalThis as { ResizeObserver?: unknown }).ResizeObserver = prior;
        }
    };
}

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

describe("family-view debug overlay - phase 3 navigation diagnostics", () => {
    let cleanups: Array<() => void> = [];

    beforeEach(() => {
        if (!Element.prototype.scrollIntoView) {
            Element.prototype.scrollIntoView = vi.fn();
        }
        // clear dock items between cases so registrations from prior
        // tests don't leak into the next one
        clearRegistry();
        cleanups = [];
    });

    afterEach(() => {
        for (const fn of cleanups.reverse()) fn();
        document.body.innerHTML = "";
        clearRegistry();
    });

    it("showViewportFitTarget mounts the viewport rect; selecting a visible person mounts the target rect", async () => {
        // the viewport-rect derivation gates on `hostW > 0 && hostH > 0`,
        // which only flips true once a ResizeObserver entry fires. the
        // global no-op shim in setup.ts never dispatches, so install the
        // synthetic RO for this case
        cleanups.push(installSyntheticResizeObserver({ width: 1024, height: 768 }));

        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const layers = defaultLayers();
        layers.showViewportFitTarget = true;

        // pick a visible person id: rootId is in the bounded subset by
        // construction, so the target rect will resolve
        const visibleId = tree.rootId;

        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: {
                tree,
                debugOptions: { layers },
                selectedId: visibleId,
            },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const viewport = handle.container.querySelector(
            "[data-testid='family-view-debug-viewport-rect']",
        );
        expect(
            viewport,
            "viewport rect should mount when showViewportFitTarget is on",
        ).not.toBeNull();

        const target = handle.container.querySelector(
            "[data-testid='family-view-debug-target-rect']",
        );
        expect(target, "target rect should mount when a visible person is selected").not.toBeNull();

        handle.unmount();
    });

    it("showPendingRecenter: bumping pendingRecenterSeq mounts the green flash element", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const layers = defaultLayers();
        layers.showPendingRecenter = true;

        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: {
                tree,
                debugOptions: { layers },
                pendingRecenterSeq: 1,
            },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        // the flash effect mounts the element synchronously on a seq
        // bump, then unmounts it via setTimeout(250ms). reading
        // immediately after the initial tick should still find it
        const flash = handle.container.querySelector(
            "[data-testid='family-view-debug-recenter-flash']",
        );
        expect(flash, "showPendingRecenter should mount the flash element").not.toBeNull();

        handle.unmount();
    });

    it("logFocusEvents: DockRegistration adds a 'family-view-debug-focus-log' entry to the tl dock", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const layers = defaultLayers();
        layers.logFocusEvents = true;

        // synthetic palette-source focus event matches the shape App owns
        const focusEvents = [
            {
                seq: 1,
                ts: Date.now(),
                source: "palette",
                personId: tree.rootId,
                requestedRecenter: true,
                didTriggerCenterOn: true,
            },
        ] as const;

        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: {
                tree,
                debugOptions: { layers },
                focusEventsForOverlay: focusEvents,
            },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        // the focus-log mounts via DockRegistration into the tl corner
        // bucket. the rendered pill lives in App's CanvasChromeDock,
        // which isn't in this tree, but the registration is the contract
        // that drives it - asserting against the registry is one layer
        // closer to the engine but still catches every regression in
        // the gate (logFocusEvents on + focusEvents non-empty)
        const tlItems = itemsForCorner("tl");
        const focusLog = tlItems.find((i) => i.id === "family-view-debug-focus-log");
        expect(focusLog, "logFocusEvents should register a tl dock item").toBeDefined();
        // canvas-window-manager phase 2 migrated focus-log from CanvasChromePill
        // (kind="panel") to the Window primitive (kind="window"). accept either
        // body-bearing kind so the contract pins registration shape rather
        // than the now-superseded panel-only form.
        expect(focusLog?.kind === "window" || focusLog?.kind === "panel").toBe(true);

        handle.unmount();
    });

    it("logFocusEvents off: no focus-log dock item is registered", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const layers = defaultLayers();
        // logFocusEvents stays off

        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: {
                tree,
                debugOptions: { layers },
                focusEventsForOverlay: [
                    {
                        seq: 1,
                        ts: Date.now(),
                        source: "palette",
                        personId: tree.rootId,
                        requestedRecenter: true,
                        didTriggerCenterOn: true,
                    },
                ],
            },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const tlItems = itemsForCorner("tl");
        const focusLog = tlItems.find((i) => i.id === "family-view-debug-focus-log");
        expect(focusLog).toBeUndefined();

        handle.unmount();
    });
});
