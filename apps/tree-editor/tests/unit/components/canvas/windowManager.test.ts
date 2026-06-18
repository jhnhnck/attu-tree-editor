// SPDX-License-Identifier: MIT

// unit tests for the canvas-window-manager runtime (phase 0).
// covers the contract Window/WindowOverlay rely on: focus tracking
// advances focusedAt monotonically, popOut cascades from a per-host
// origin with step-24 increments, redock removes from the map,
// bringToFront raises z within the 30..49 band, moveTo clamps to
// host - 8px on every edge, and the focusedAt timestamp is
// monotonically increasing across every focus event regardless of
// wall-clock collisions.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { windowManager, NON_CLOSING_IDS, WINDOW_MANAGER_CONSTANTS } from "@attu/ui";

// minimal host element stub. jsdom doesn't compute layout; we patch
// getBoundingClientRect to return a fixed 1440x900 host so the
// cascade + clamp math runs against predictable numbers.
function makeHost(width = 1440, height = 900): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("data-canvas-host", "");
    el.getBoundingClientRect = (): DOMRect => ({
        x: 0,
        y: 0,
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        toJSON: () => ({}),
    });
    return el;
}

const { Z_MIN, Z_MAX, CLAMP_MARGIN_PX, CASCADE_RIGHT_OFFSET, CASCADE_TOP_OFFSET, CASCADE_STEP_PX } =
    WINDOW_MANAGER_CONSTANTS;

beforeEach(() => {
    windowManager.setHostElement(makeHost());
});

afterEach(() => {
    windowManager.clear();
    windowManager.setHostElement(null);
});

describe("windowManager", () => {
    it("focus(id) sets focusedWindowId and advances focusedAt monotonically", () => {
        const t1 = windowManager.focus("a");
        const t2 = windowManager.focus("b");
        const t3 = windowManager.focus("a");
        expect(t2).toBeGreaterThan(t1);
        expect(t3).toBeGreaterThan(t2);
        expect(windowManager.focusedWindowId).toBe("a");
    });

    it("blur() clears focusedWindowId", () => {
        windowManager.focus("a");
        expect(windowManager.focusedWindowId).toBe("a");
        windowManager.blur();
        expect(windowManager.focusedWindowId).toBeNull();
    });

    it("popOut(id) cascades from (host.width - 320, 60) with step-24 increments", () => {
        windowManager.popOut("a");
        windowManager.popOut("b");
        windowManager.popOut("c");
        const a = windowManager.popOutStates.get("a");
        const b = windowManager.popOutStates.get("b");
        const c = windowManager.popOutStates.get("c");
        expect(a).toBeDefined();
        expect(b).toBeDefined();
        expect(c).toBeDefined();
        expect(a?.x).toBe(1440 - CASCADE_RIGHT_OFFSET);
        expect(a?.y).toBe(CASCADE_TOP_OFFSET);
        expect(b?.x).toBe(1440 - CASCADE_RIGHT_OFFSET + CASCADE_STEP_PX);
        expect(b?.y).toBe(CASCADE_TOP_OFFSET + CASCADE_STEP_PX);
        expect(c?.x).toBe(1440 - CASCADE_RIGHT_OFFSET + 2 * CASCADE_STEP_PX);
        expect(c?.y).toBe(CASCADE_TOP_OFFSET + 2 * CASCADE_STEP_PX);
    });

    it("cascade wraps to a second row past the soft cap (n=8 → wrap=1, y += 32)", () => {
        // pop out CASCADE_SOFT_CAP windows in slots 0..7; the 9th lands
        // in slot 8 → wrap=1, modular i=0, so x = origin and y = origin
        // + CASCADE_WRAP_Y_PX (32). proves the soft-cap-wrap DoD line.
        const { CASCADE_SOFT_CAP, CASCADE_WRAP_Y_PX } = WINDOW_MANAGER_CONSTANTS;
        for (let i = 0; i < CASCADE_SOFT_CAP + 1; i++) {
            windowManager.popOut(`w${String(i)}`);
        }
        const wrapped = windowManager.popOutStates.get(`w${String(CASCADE_SOFT_CAP)}`);
        expect(wrapped?.x).toBe(1440 - CASCADE_RIGHT_OFFSET);
        expect(wrapped?.y).toBe(CASCADE_TOP_OFFSET + CASCADE_WRAP_Y_PX);
    });

    it("popOut(id) is idempotent — re-popping does not drift the cascade slot", () => {
        windowManager.popOut("a");
        const before = { ...(windowManager.popOutStates.get("a") as object) } as Record<
            string,
            number
        >;
        const added = windowManager.popOut("a");
        expect(added).toBe(false);
        const after = { ...(windowManager.popOutStates.get("a") as object) } as Record<
            string,
            number
        >;
        expect(after["x"]).toBe(before["x"]);
        expect(after["y"]).toBe(before["y"]);
    });

    it("cascade slot = current popped-out COUNT, not a running index — close A then pop C lands C in A's slot", () => {
        windowManager.popOut("a"); // slot 0
        windowManager.popOut("b"); // slot 1
        windowManager.redock("a"); // count now 1
        windowManager.popOut("c"); // slot 1, NOT slot 2
        const c = windowManager.popOutStates.get("c");
        expect(c?.x).toBe(1440 - CASCADE_RIGHT_OFFSET + CASCADE_STEP_PX);
        expect(c?.y).toBe(CASCADE_TOP_OFFSET + CASCADE_STEP_PX);
    });

    it("redock(id) removes the id from popOutStates and returns true when found", () => {
        windowManager.popOut("a");
        expect(windowManager.redock("a")).toBe(true);
        expect(windowManager.popOutStates.has("a")).toBe(false);
        expect(windowManager.redock("a")).toBe(false);
    });

    it("bringToFront(id) raises z within the 30..49 band without changing focus", () => {
        windowManager.popOut("a"); // z=30
        windowManager.popOut("b"); // z=31
        windowManager.focusedWindowId = null;
        windowManager.bringToFront("a");
        const a = windowManager.popOutStates.get("a");
        expect(a?.z).toBeGreaterThanOrEqual(Z_MIN);
        expect(a?.z).toBeLessThanOrEqual(Z_MAX);
        // bringToFront does NOT mutate focusedWindowId
        expect(windowManager.focusedWindowId).toBeNull();
    });

    it("focus(id) of a popped-out window raises z + advances focusedAt + sets focusedWindowId", () => {
        windowManager.popOut("a");
        windowManager.popOut("b");
        const aBefore = windowManager.popOutStates.get("a");
        windowManager.focus("a");
        const aAfter = windowManager.popOutStates.get("a");
        expect((aAfter?.z ?? -1) > (aBefore?.z ?? 0)).toBe(true);
        expect(windowManager.focusedWindowId).toBe("a");
    });

    it("z caps at 49 even after many focus cycles", () => {
        windowManager.popOut("a");
        for (let i = 0; i < 100; i++) windowManager.focus("a");
        const a = windowManager.popOutStates.get("a");
        expect(a?.z).toBeLessThanOrEqual(Z_MAX);
    });

    it("moveTo(id, x, y) clamps to host - 8px on every edge", () => {
        windowManager.popOut("a");
        // try to move way off the right + bottom edges
        windowManager.moveTo("a", 5000, 5000, 320, 150);
        const a = windowManager.popOutStates.get("a");
        // host is 1440x900; max x = 1440 - 320 - 8 = 1112
        expect(a?.x).toBe(1112);
        // max y = 900 - 150 - 8 = 742
        expect(a?.y).toBe(742);

        // try to move way off the left + top edges
        windowManager.moveTo("a", -1000, -1000, 320, 150);
        const a2 = windowManager.popOutStates.get("a");
        expect(a2?.x).toBe(CLAMP_MARGIN_PX);
        expect(a2?.y).toBe(CLAMP_MARGIN_PX);
    });

    it("moveTo(id, ...) on an unknown id is a no-op", () => {
        const before = windowManager.popOutStates.size;
        windowManager.moveTo("never-popped", 10, 10);
        expect(windowManager.popOutStates.size).toBe(before);
    });

    it("clampAll() re-clamps every popped-out entry against the current host rect", () => {
        // pop out at the right edge, then shrink the host and clampAll
        windowManager.popOut("a");
        windowManager.moveTo("a", 1100, 700, 320, 150);
        const aBefore = windowManager.popOutStates.get("a");
        expect(aBefore?.x).toBe(1100);
        expect(aBefore?.y).toBe(700);

        // simulate sheet-inspector opening: host shrinks to 1000x600
        windowManager.setHostElement(makeHost(1000, 600));
        windowManager.clampAll(new Map([["a", { w: 320, h: 150 }]]));
        const aAfter = windowManager.popOutStates.get("a");
        // max x = 1000 - 320 - 8 = 672; max y = 600 - 150 - 8 = 442
        expect(aAfter?.x).toBe(672);
        expect(aAfter?.y).toBe(442);
    });

    it("isPoppedOut(id) and poppedOutCount() reflect the map", () => {
        expect(windowManager.isPoppedOut("a")).toBe(false);
        expect(windowManager.poppedOutCount()).toBe(0);
        windowManager.popOut("a");
        windowManager.popOut("b");
        expect(windowManager.isPoppedOut("a")).toBe(true);
        expect(windowManager.poppedOutCount()).toBe(2);
        windowManager.redock("a");
        expect(windowManager.poppedOutCount()).toBe(1);
    });

    it("clear() resets state — focusedWindowId, popOutStates, openedWindows, and focusedAt counter", () => {
        windowManager.popOut("a");
        windowManager.focus("a");
        windowManager.openWindow("stats-window");
        windowManager.clear();
        expect(windowManager.focusedWindowId).toBeNull();
        expect(windowManager.popOutStates.size).toBe(0);
        expect(windowManager.openedWindows.size).toBe(0);
        // counter resets — the next focus event starts from 1 again
        const t = windowManager.focus("b");
        expect(t).toBe(1);
    });
});

describe("windowManager — open/close state machine (canvas-chrome-v2 phase 0)", () => {
    it("openWindow adds id to openedWindows; closeWindow removes it", () => {
        expect(windowManager.isOpen("stats-window")).toBe(false);
        windowManager.openWindow("stats-window");
        expect(windowManager.isOpen("stats-window")).toBe(true);
        windowManager.closeWindow("stats-window");
        expect(windowManager.isOpen("stats-window")).toBe(false);
    });

    it("openWindow / closeWindow are idempotent — double-open / double-close stay consistent", () => {
        windowManager.openWindow("stats-window");
        windowManager.openWindow("stats-window");
        expect(windowManager.openedWindows.size).toBe(1);
        windowManager.closeWindow("stats-window");
        windowManager.closeWindow("stats-window");
        expect(windowManager.isOpen("stats-window")).toBe(false);
    });

    it("NON_CLOSING_IDS windows are always open regardless of openedWindows", () => {
        // save-status-window is in NON_CLOSING_IDS
        expect(NON_CLOSING_IDS.has("save-status-window")).toBe(true);
        expect(windowManager.isOpen("save-status-window")).toBe(true);
        // openWindow and closeWindow are no-ops for non-closing ids
        windowManager.openWindow("save-status-window");
        expect(windowManager.openedWindows.has("save-status-window")).toBe(false);
        windowManager.closeWindow("save-status-window");
        expect(windowManager.isOpen("save-status-window")).toBe(true);
    });

    it("closeWindow also redocks a popped-out window so no orphan lingers", () => {
        windowManager.openWindow("stats-window");
        windowManager.popOut("stats-window");
        expect(windowManager.isPoppedOut("stats-window")).toBe(true);
        windowManager.closeWindow("stats-window");
        expect(windowManager.isPoppedOut("stats-window")).toBe(false);
        expect(windowManager.isOpen("stats-window")).toBe(false);
    });

    it("pillClick: closed → open", () => {
        expect(windowManager.isOpen("stats-window")).toBe(false);
        windowManager.pillClick("stats-window");
        expect(windowManager.isOpen("stats-window")).toBe(true);
    });

    it("pillClick: open → focus (sets focusedWindowId)", () => {
        windowManager.openWindow("stats-window");
        windowManager.focusedWindowId = null;
        windowManager.pillClick("stats-window");
        expect(windowManager.focusedWindowId).toBe("stats-window");
    });
});

describe("windowManager — expanded state + 4-branch pillClick (canvas-chrome-v2 phase 2)", () => {
    it("openWindow opens expanded; toggleExpanded / setExpanded flip the body gate", () => {
        windowManager.openWindow("stats-window");
        expect(windowManager.isExpanded("stats-window")).toBe(true);
        expect(windowManager.windowState("stats-window")).toBe("docked-expanded");
        windowManager.toggleExpanded("stats-window");
        expect(windowManager.isExpanded("stats-window")).toBe(false);
        expect(windowManager.windowState("stats-window")).toBe("docked-minimized");
        windowManager.setExpanded("stats-window", true);
        expect(windowManager.isExpanded("stats-window")).toBe(true);
    });

    it("popped-out windows always read as expanded regardless of the docked flag", () => {
        windowManager.openWindow("stats-window");
        windowManager.setExpanded("stats-window", false);
        windowManager.popOut("stats-window");
        expect(windowManager.isExpanded("stats-window")).toBe(true);
        expect(windowManager.windowState("stats-window")).toBe("floating");
    });

    it("windowState: closed when not open", () => {
        expect(windowManager.windowState("stats-window")).toBe("closed");
    });

    it("pillClick docked-minimized → restores (expands) and focuses", () => {
        windowManager.openWindow("stats-window");
        windowManager.setExpanded("stats-window", false);
        windowManager.focusedWindowId = null;
        windowManager.pillClick("stats-window");
        expect(windowManager.isExpanded("stats-window")).toBe(true);
        expect(windowManager.focusedWindowId).toBe("stats-window");
    });

    it("pillClick floating → focuses when not focused, minimizes (re-docks + collapses) when already focused", () => {
        windowManager.openWindow("stats-window");
        windowManager.popOut("stats-window");
        windowManager.focusedWindowId = null;
        // not focused → focus, stays floating
        windowManager.pillClick("stats-window");
        expect(windowManager.focusedWindowId).toBe("stats-window");
        expect(windowManager.isPoppedOut("stats-window")).toBe(true);
        // already focused → minimize: re-dock + collapse
        windowManager.pillClick("stats-window");
        expect(windowManager.isPoppedOut("stats-window")).toBe(false);
        expect(windowManager.windowState("stats-window")).toBe("docked-minimized");
    });

    it("pillClick closed → restores to floating when the window was last floating", () => {
        windowManager.openWindow("stats-window");
        windowManager.popOut("stats-window");
        expect(windowManager.lastState.get("stats-window")).toBe("floating");
        windowManager.closeWindow("stats-window");
        expect(windowManager.windowState("stats-window")).toBe("closed");
        // reopen via pill → restored to floating
        windowManager.pillClick("stats-window");
        expect(windowManager.windowState("stats-window")).toBe("floating");
    });

    it("focus bumps focusGen on every call, even when the focused id is unchanged", () => {
        const g0 = windowManager.focusGen;
        windowManager.focus("stats-window");
        const g1 = windowManager.focusGen;
        windowManager.focus("stats-window");
        const g2 = windowManager.focusGen;
        expect(g1).toBeGreaterThan(g0);
        expect(g2).toBeGreaterThan(g1);
    });
});

describe("windowManager — non-persisted ids (canvas-chrome-v2 phase 2)", () => {
    it("debug-menu + family-view-debug-* open-state is tracked but never written to localStorage", () => {
        globalThis.localStorage.clear();
        windowManager.openWindow("debug-menu");
        windowManager.openWindow("family-view-debug-layout-metrics");
        windowManager.openWindow("stats-window");
        // in-memory: all three are open
        expect(windowManager.isOpen("debug-menu")).toBe(true);
        expect(windowManager.isOpen("family-view-debug-layout-metrics")).toBe(true);
        // persisted: only the persistable id
        const persisted = JSON.parse(
            globalThis.localStorage.getItem("fte.dock.openedWindows") ?? "[]",
        ) as string[];
        expect(persisted).toContain("stats-window");
        expect(persisted).not.toContain("debug-menu");
        expect(persisted).not.toContain("family-view-debug-layout-metrics");
    });
});
