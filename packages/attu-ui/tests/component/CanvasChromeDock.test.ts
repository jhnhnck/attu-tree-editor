// SPDX-License-Identifier: MIT

// component tests for CanvasChromeDock.
// verifies:
//   - tl corner renders with flex-col (pills above panels)
//   - overflow-y-clip class is present on the outer container
//   - phase 3: all 4 corners render with the correct flex direction +
//     pill/panel ordering once the tl-only guard is removed

import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, type Snippet } from "svelte";
import {
    clearRegistry,
    register,
    type DockCorner,
} from "$lib/components/canvas/dockRegistry.svelte";
import { windowManager } from "$lib/components/canvas/windowManager.svelte";
import CanvasChromeDock from "$lib/components/canvas/CanvasChromeDock.svelte";

const noop = (() => undefined) as unknown as Snippet;

function mountDock(corner: DockCorner) {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(CanvasChromeDock, { target, props: { corner } });
    return { target, component };
}

afterEach(() => {
    clearRegistry();
    windowManager.clear();
    document.body.innerHTML = "";
});

describe("CanvasChromeDock — phase 0 (tl only)", () => {
    it("tl corner renders data-testid=canvas-chrome-dock-tl when items are registered", () => {
        register({ id: "pill-a", corner: "tl", priority: 10, kind: "pill", render: noop });
        const { target } = mountDock("tl");
        flushSync();
        const dock = target.querySelector("[data-testid='canvas-chrome-dock-tl']");
        expect(dock).not.toBeNull();
    });

    it("tl corner outer container carries flex-col class (expands downward)", () => {
        register({ id: "pill-a", corner: "tl", priority: 10, kind: "pill", render: noop });
        const { target } = mountDock("tl");
        flushSync();
        const dock = target.querySelector("[data-testid='canvas-chrome-dock-tl']");
        expect(dock?.classList.contains("flex-col")).toBe(true);
        // tl must NOT use flex-col-reverse (that is for bottom corners)
        expect(dock?.classList.contains("flex-col-reverse")).toBe(false);
    });

    it("tl corner outer container carries overflow-y-clip", () => {
        register({ id: "pill-a", corner: "tl", priority: 10, kind: "pill", render: noop });
        const { target } = mountDock("tl");
        flushSync();
        const dock = target.querySelector("[data-testid='canvas-chrome-dock-tl']");
        expect(dock?.classList.contains("overflow-y-clip")).toBe(true);
    });

    it("tl corner renders pill row before the panel block (pillsFirst=true)", () => {
        register({ id: "pill-a", corner: "tl", priority: 10, kind: "pill", render: noop });
        register({ id: "panel-b", corner: "tl", priority: 20, kind: "panel", render: noop });
        const { target } = mountDock("tl");
        flushSync();
        const dock = target.querySelector("[data-testid='canvas-chrome-dock-tl']");
        const children = dock ? Array.from(dock.children) : [];
        const pillIdx = children.findIndex((el) => el.hasAttribute("data-dock-pills"));
        const panelIdx = children.findIndex((el) => el.hasAttribute("data-dock-panels"));
        expect(pillIdx).toBeGreaterThanOrEqual(0);
        expect(panelIdx).toBeGreaterThanOrEqual(0);
        // pills appear before panels in DOM for top corners
        expect(pillIdx).toBeLessThan(panelIdx);
    });

    it("renders nothing when no items are registered for the corner", () => {
        // register a bl item; tl should stay empty
        register({ id: "bl-pill", corner: "bl", priority: 10, kind: "pill", render: noop });
        const { target } = mountDock("tl");
        flushSync();
        expect(target.querySelector("[data-testid='canvas-chrome-dock-tl']")).toBeNull();
    });
});

describe("CanvasChromeDock — phase 3 (all 4 corners)", () => {
    // top corners expand downward (flex-col); bottom corners expand upward
    // (flex-col-reverse). taskbar model (phase 6): the pills block is ALWAYS
    // the first DOM child regardless of corner — the corner's flex direction
    // (col vs col-reverse) is what lands the pills at the anchored edge
    // visually. so DOM order is pills-first for every corner; the visual
    // placement difference is handled by flex, not by DOM reordering.
    const cases: ReadonlyArray<{
        corner: DockCorner;
        flexCol: boolean;
    }> = [
        { corner: "tl", flexCol: true },
        { corner: "tr", flexCol: true },
        { corner: "bl", flexCol: false },
        { corner: "br", flexCol: false },
    ];

    for (const { corner, flexCol } of cases) {
        it(`${corner} renders its container with the correct flex direction + pills-first DOM order`, () => {
            register({ id: "pill-a", corner, priority: 10, kind: "pill", render: noop });
            register({ id: "panel-b", corner, priority: 20, kind: "panel", render: noop });
            const { target } = mountDock(corner);
            flushSync();
            const dock = target.querySelector(`[data-testid='canvas-chrome-dock-${corner}']`);
            expect(dock).not.toBeNull();
            expect(dock?.classList.contains("flex-col")).toBe(flexCol);
            expect(dock?.classList.contains("flex-col-reverse")).toBe(!flexCol);
            expect(dock?.classList.contains("overflow-y-clip")).toBe(true);

            const children = dock ? Array.from(dock.children) : [];
            const pillIdx = children.findIndex((el) => el.hasAttribute("data-dock-pills"));
            const panelIdx = children.findIndex((el) => el.hasAttribute("data-dock-panels"));
            expect(pillIdx).toBeGreaterThanOrEqual(0);
            expect(panelIdx).toBeGreaterThanOrEqual(0);
            // taskbar model: pills are always the first DOM child; flex
            // direction (not DOM order) anchors them to the corner's edge.
            expect(pillIdx).toBeLessThan(panelIdx);
        });
    }
});

// taskbar model (phase 6): the reorder gesture lives on the TASKBAR PILLS,
// not the docked-window titlebars. each pill wrapper carries
// data-dock-pill-id so the dock's reorder pointermove can map a rendered
// pill back to its registry id and read its rect; panel/window wrappers
// keep data-dock-item-id (they no longer initiate the gesture but the
// attribute stays for DOM queries). a docked window renders in the panel
// stack ONLY when docked-expanded — a minimized window is its pill only.
// the full horizontal drag gesture (pointer capture + rect math + the
// vertical drop-indicator) is exercised in e2e — jsdom's
// getBoundingClientRect returns zeroed rects, which makes the slot math
// meaningless here, so the gesture itself is NOT simulated at the
// component level by design.
describe("CanvasChromeDock — phase 6 (taskbar reorder wiring)", () => {
    it("pill wrappers carry data-dock-pill-id; docked-expanded windows render in panels with data-dock-item-id", () => {
        register({ id: "pill-a", corner: "tl", priority: 10, kind: "pill", render: noop });
        register({ id: "win-b", corner: "tl", priority: 20, kind: "window", render: noop });
        register({ id: "panel-c", corner: "tl", priority: 30, kind: "panel", render: noop });
        // a window only enters the panel stack when docked-expanded; open +
        // expand win-b so it renders (a closed window is filtered out).
        windowManager.openWindow("win-b");
        windowManager.setExpanded("win-b", true);
        const { target } = mountDock("tl");
        flushSync();

        const panelsRegion = target.querySelector("[data-dock-panels]");
        expect(panelsRegion).not.toBeNull();
        const ids = Array.from(panelsRegion?.querySelectorAll("[data-dock-item-id]") ?? []).map(
            (el) => el.getAttribute("data-dock-item-id"),
        );
        // the docked-expanded window + the always-rendered panel, in sort order
        expect(ids).toEqual(["win-b", "panel-c"]);

        // the pill wrapper carries data-dock-pill-id (the drag handle), not
        // data-dock-item-id; the panels region carries no pill ids.
        const pillsRegion = target.querySelector("[data-dock-pills]");
        expect(pillsRegion?.querySelector("[data-dock-item-id]")).toBeNull();
        const pillIds = Array.from(pillsRegion?.querySelectorAll("[data-dock-pill-id]") ?? []).map(
            (el) => el.getAttribute("data-dock-pill-id"),
        );
        expect(pillIds).toEqual(["pill-a"]);
    });

    it("a docked-minimized window renders no panel surface — only its pill represents it", () => {
        register({ id: "win-pill", corner: "tl", priority: 10, kind: "pill", render: noop });
        register({ id: "win-b", corner: "tl", priority: 20, kind: "window", render: noop });
        // open win-b but leave it minimized (not expanded)
        windowManager.openWindow("win-b");
        windowManager.setExpanded("win-b", false);
        const { target } = mountDock("tl");
        flushSync();

        // the panels region has no window surface (minimized → pill only)
        const panelsRegion = target.querySelector("[data-dock-panels]");
        const ids = Array.from(panelsRegion?.querySelectorAll("[data-dock-item-id]") ?? []).map(
            (el) => el.getAttribute("data-dock-item-id"),
        );
        expect(ids).toEqual([]);

        // the pill is still present in the taskbar
        const pillsRegion = target.querySelector("[data-dock-pills]");
        const pillIds = Array.from(pillsRegion?.querySelectorAll("[data-dock-pill-id]") ?? []).map(
            (el) => el.getAttribute("data-dock-pill-id"),
        );
        expect(pillIds).toEqual(["win-pill"]);
    });

    it("no drop-indicator renders when idle (not reordering)", () => {
        register({ id: "pill-a", corner: "tl", priority: 10, kind: "pill", render: noop });
        register({ id: "pill-b", corner: "tl", priority: 20, kind: "pill", render: noop });
        const { target } = mountDock("tl");
        flushSync();
        expect(target.querySelector("[data-testid='dock-drop-indicator']")).toBeNull();
    });
});
