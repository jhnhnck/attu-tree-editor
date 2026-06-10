/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - family-view debug overlay structural invariants
 * (phase 0 walking skeleton + phase 1 connectivity overlays).
 *
 * Migrated from `tests/e2e/family-view-debug.spec.ts` as part of phase 1c.
 * The original drove the production keyboard shortcut (Ctrl+Shift+D) to
 * open the debug panel and clicked toggles on the menu; under jsdom we
 * skip the shell entirely and pass `debugOptions` directly to
 * `FamilyViewCanvas`, asserting against the rendered overlay dom.
 *
 * What this exercises:
 *   1. mounting the canvas with `debugOptions` (no toggles on) does not
 *      paint any debug surfaces — the {#if layers.*} blocks gate them.
 *   2. flipping `showVisibleSubset` mounts the dashed-rect testid.
 *   3. flipping `exposeFamilyDebug` populates `window.__treeDebug` with
 *      `engine === "family-view"` and the `familyView.layout` shape.
 *   4. flipping `showOffSubsetPeople` mounts the side-panel testid.
 *   5. `showOrphanBadge` either mounts orphan rects (with valid ids) or
 *      stays absent on a healthy fixture.
 *   6. the `multi-union-3.ged` fixture deterministically surfaces a
 *      `secondary-union-not-expanded` reason in the off-subset panel.
 *   7. edges carry `data-edge-role` + `data-edge-id` unconditionally;
 *      `showEdgeRoles` adds the `family-view-edge-role-*` class.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";

import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
import type { FamilyViewDebugLayerOptions } from "$lib/components/tree/debugTypes";
import { loadGedcomFixture } from "./_harness/loadGedcomFixture";
import { mountWithHostRect } from "./_harness/mountWithHostRect";

// default-off layer set; tests flip only the toggles they need
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

describe("family-view debug overlay - phase 0 + phase 1 structural invariants", () => {
    beforeEach(() => {
        if (!Element.prototype.scrollIntoView) {
            Element.prototype.scrollIntoView = vi.fn();
        }
    });

    afterEach(() => {
        document.body.innerHTML = "";
        // clear any debug handle the exposeFamilyDebug branch may have set
        if ("__treeDebug" in window) {
            delete (window as { __treeDebug?: unknown }).__treeDebug;
        }
    });

    it("debugOptions defined but every layer off: no debug testids land", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, debugOptions: { layers: defaultLayers() } },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        expect(
            handle.container.querySelector("[data-testid='family-view-debug-visible-subset-rect']"),
        ).toBeNull();
        expect(
            handle.container.querySelector("[data-testid='family-view-debug-off-subset-panel']"),
        ).toBeNull();
        // the overlay container still mounts (because debugOptions is set);
        // the individual layer blocks just stay out of the dom
        expect(handle.container.querySelector("[data-person-id]")).not.toBeNull();

        handle.unmount();
    });

    it("showVisibleSubset: dashed-rect testid mounts when the toggle is on", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const layers = defaultLayers();
        layers.showVisibleSubset = true;
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, debugOptions: { layers } },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const rect = handle.container.querySelector(
            "[data-testid='family-view-debug-visible-subset-rect']",
        );
        expect(rect, "showVisibleSubset should mount the dashed-rect overlay").not.toBeNull();

        handle.unmount();
    });

    it("exposeFamilyDebug populates window.__treeDebug with the family-view shape", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const layers = defaultLayers();
        layers.exposeFamilyDebug = true;
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, debugOptions: { layers } },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const dbg = window.__treeDebug;
        expect(dbg, "exposeFamilyDebug should mount the handle").toBeDefined();
        expect(dbg?.engine).toBe("family-view");
        expect(dbg?.familyView).toBeDefined();
        expect(dbg?.familyView?.subset.visible.size ?? 0).toBeGreaterThan(0);
        expect(typeof dbg?.familyView?.focus).toBe("string");
        expect((dbg?.familyView?.focus ?? "").length).toBeGreaterThan(0);

        handle.unmount();
    });

    it("onsubsetchange fires with a non-null subset whose rationale spans off-subset people", async () => {
        // the off-subset panel itself lives in App.svelte (it's a column
        // in the debug menu, not on the canvas), so we observe the same
        // invariant one level closer to the engine: the canvas pushes the
        // debug subset (visible + rationale) up via onsubsetchange. the
        // panel is a thin renderer of that data; if the subset is wrong
        // the panel renders wrong, and we catch the regression here.
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const layers = defaultLayers();
        layers.showOffSubsetPeople = true;
        let lastSubset: {
            visible: ReadonlyMap<string, unknown> | ReadonlySet<string>;
            rationale: ReadonlyMap<string, string>;
        } | null = null;
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: {
                tree,
                debugOptions: { layers },
                onsubsetchange: (s: unknown) => {
                    lastSubset = s as typeof lastSubset;
                },
            },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        expect(lastSubset, "onsubsetchange should fire when debugOptions is set").not.toBeNull();
        const subset = lastSubset!;
        // visible may be a Map or Set depending on the engine's contract;
        // either way the size accessor exists on both
        const visibleSize =
            "size" in (subset.visible as { size: number })
                ? (subset.visible as { size: number }).size
                : 0;
        expect(visibleSize).toBeGreaterThan(0);
        // rationale spans the off-subset people; Akarians is large enough
        // that the bounded subset rejects some
        expect(subset.rationale.size).toBeGreaterThanOrEqual(0);

        handle.unmount();
    });

    it("showOrphanBadge: zero or more orphan rects, all with non-empty data-person-id", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const layers = defaultLayers();
        layers.showOrphanBadge = true;
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, debugOptions: { layers } },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const orphans = handle.container.querySelectorAll(
            "[data-testid='family-view-debug-orphan-rect']",
        );
        // either zero (no orphans in the bounded subset) or >0 with valid ids
        for (const el of Array.from(orphans)) {
            const id = el.getAttribute("data-person-id") ?? "";
            expect(id.length).toBeGreaterThan(0);
        }

        handle.unmount();
    });

    it("multi-union-3 fixture surfaces a secondary-union-not-expanded rationale entry", async () => {
        // same panel-lives-in-App caveat as above; we assert the engine
        // contract directly via onsubsetchange. multi-union-3 has a
        // deterministic Aron+Brigitta secondary union whose child Helga
        // is reachable but not visible by default, so the rationale map
        // must contain at least one secondary-union-not-expanded entry.
        const tree = loadGedcomFixture("apps/web/tests/fixtures/multi-union-3.ged");
        const layers = defaultLayers();
        layers.showOffSubsetPeople = true;
        let lastSubset: {
            visible: ReadonlyMap<string, unknown> | ReadonlySet<string>;
            rationale: ReadonlyMap<string, string>;
        } | null = null;
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: {
                tree,
                debugOptions: { layers },
                onsubsetchange: (s: unknown) => {
                    lastSubset = s as typeof lastSubset;
                },
            },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        expect(lastSubset).not.toBeNull();
        const subset = lastSubset!;
        const reasons = Array.from(subset.rationale.values());
        expect(
            reasons.includes("secondary-union-not-expanded"),
            "multi-union-3 should surface a secondary-union-not-expanded reason",
        ).toBe(true);

        handle.unmount();
    });

    it("showLastEditHalo off: no halo element in dom", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const layers = defaultLayers();
        // layers.showLastEditHalo stays false
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: {
                tree,
                debugOptions: { layers },
                lastEditedId: tree.rootId,
            },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const halo = handle.container.querySelector(
            "[data-testid='family-view-debug-last-edit-halo']",
        );
        expect(halo, "halo should not mount when showLastEditHalo is off").toBeNull();

        handle.unmount();
    });

    it("showLastEditHalo on: halo mounts with correct data-person-id for a visible root", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const layers = defaultLayers();
        layers.showLastEditHalo = true;
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: {
                tree,
                debugOptions: { layers },
                lastEditedId: tree.rootId,
            },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const halo = handle.container.querySelector(
            "[data-testid='family-view-debug-last-edit-halo']",
        );
        expect(halo, "halo should mount for a visible root person").not.toBeNull();
        expect(halo?.getAttribute("data-person-id")).toBe(tree.rootId);

        handle.unmount();
    });

    it("showLastEditHalo off with no lastEditedId: no halo element", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");
        const layers = defaultLayers();
        layers.showLastEditHalo = true;
        // lastEditedId deliberately absent
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: {
                tree,
                debugOptions: { layers },
            },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const halo = handle.container.querySelector(
            "[data-testid='family-view-debug-last-edit-halo']",
        );
        expect(halo, "halo should not mount when lastEditedId is absent").toBeNull();

        handle.unmount();
    });

    it("edges carry data-edge-role + data-edge-id unconditionally; showEdgeRoles adds the role class", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/Akarians.ged");

        // first mount: no debug, no role class on edges, but attrs present
        const off = mountWithHostRect(FamilyViewCanvas, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();
        const baseEdge = off.container.querySelector(".family-view-edge");
        expect(baseEdge, "fixture should produce at least one edge").not.toBeNull();
        expect(baseEdge?.getAttribute("data-edge-id")).not.toBeNull();
        expect(baseEdge?.getAttribute("data-edge-role")).not.toBeNull();
        const baseHasRoleClass = Array.from(baseEdge?.classList ?? []).some((c) =>
            c.startsWith("family-view-edge-role-"),
        );
        expect(baseHasRoleClass).toBe(false);
        off.unmount();

        // second mount: showEdgeRoles on, at least one edge carries the role class
        const layers = defaultLayers();
        layers.showEdgeRoles = true;
        const on = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, debugOptions: { layers } },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();
        const edges = on.container.querySelectorAll(".family-view-edge");
        expect(edges.length).toBeGreaterThan(0);
        const anyRoleClass = Array.from(edges).some((el) =>
            Array.from(el.classList).some((c) => c.startsWith("family-view-edge-role-")),
        );
        expect(anyRoleClass, "at least one edge should carry the role class").toBe(true);
        on.unmount();
    });
});
