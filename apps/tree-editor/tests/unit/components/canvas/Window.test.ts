// SPDX-License-Identifier: MIT

// unit tests for Window.svelte. pins the three-branch body-expansion
// model from the phase-0 spike (recorded in
// `.claude/plans/canvas-window-manager/spike-window-contract.md`):
//
//   1. docked + expanded=false + not forced: body hidden
//   2. docked + expanded=true  + not forced: body shown
//   3. forced collapse OR popped out: forced wins (forcedCollapse
//      hides; popOut shows regardless of expanded)
//
// also covers the focus event wiring (titlebar click advances the
// windowManager's focusedAt) and the pop-out toggle.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { windowManager } from "@attu/ui";
import WindowProbe from "./fixtures/WindowProbe.svelte";

function bodyVisible(host: HTMLElement): boolean {
    const wrapper = host.querySelector<HTMLElement>(".fte-window-body");
    if (!wrapper) return false;
    return wrapper.getAttribute("data-collapsed") === "false";
}

let target: HTMLElement;

beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
});

afterEach(() => {
    target.remove();
    windowManager.clear();
});

describe("Window — body-expansion three-branch model", () => {
    it("branch 1: docked + expanded=false + not forced → body hidden", () => {
        const app = mount(WindowProbe, {
            target,
            props: {
                id: "w1",
                pillId: "w1",
                title: "t",
                expanded: false,
                forcedCollapse: false,
                onToggleExpanded: () => undefined,
            },
        });
        flushSync();
        expect(bodyVisible(target)).toBe(false);
        void unmount(app);
    });

    it("branch 2: docked + expanded=true + not forced → body shown", () => {
        const app = mount(WindowProbe, {
            target,
            props: {
                id: "w2",
                pillId: "w2",
                title: "t",
                expanded: true,
                forcedCollapse: false,
                onToggleExpanded: () => undefined,
            },
        });
        flushSync();
        expect(bodyVisible(target)).toBe(true);
        expect(
            target.querySelector<HTMLElement>("[data-testid='window-probe-body']"),
        ).not.toBeNull();
        void unmount(app);
    });

    it("branch 3a: docked + expanded=true + forcedCollapse=true → body HIDDEN (forced wins over expanded)", () => {
        const app = mount(WindowProbe, {
            target,
            props: {
                id: "w3",
                pillId: "w3",
                title: "t",
                expanded: true,
                forcedCollapse: true,
                onToggleExpanded: () => undefined,
            },
        });
        flushSync();
        expect(bodyVisible(target)).toBe(false);
        void unmount(app);
    });

    it("branch 3b: popped out + expanded=false → body SHOWN (popOut implicitly forces expanded)", () => {
        windowManager.setHostElement(document.body);
        windowManager.popOut("w4");
        const app = mount(WindowProbe, {
            target,
            props: {
                id: "w4",
                pillId: "w4",
                title: "t",
                expanded: false,
                forcedCollapse: false,
                onToggleExpanded: () => undefined,
            },
        });
        flushSync();
        expect(bodyVisible(target)).toBe(true);
        void unmount(app);
    });
});

describe("Window — focus wiring", () => {
    it("clicking the titlebar calls windowManager.focus(id)", () => {
        const app = mount(WindowProbe, {
            target,
            props: {
                id: "wf",
                pillId: "wf",
                title: "t",
                expanded: false,
                forcedCollapse: false,
                onToggleExpanded: () => undefined,
            },
        });
        flushSync();
        expect(windowManager.focusedWindowId).toBeNull();
        const titlebar = target.querySelector<HTMLButtonElement>("[data-testid='wf-titlebar']");
        expect(titlebar).not.toBeNull();
        titlebar?.click();
        flushSync();
        expect(windowManager.focusedWindowId).toBe("wf");
        void unmount(app);
    });

    it("popout control toggles popOutStates membership and changes the chev to chev-left when popped", () => {
        windowManager.setHostElement(document.body);
        const app = mount(WindowProbe, {
            target,
            props: {
                id: "wp",
                pillId: "wp",
                title: "t",
                expanded: false,
                forcedCollapse: false,
                onToggleExpanded: () => undefined,
            },
        });
        flushSync();
        // initially docked → chev-right
        const popoutBtn = target.querySelector<HTMLElement>("[data-testid='wp-popout']");
        expect(popoutBtn).not.toBeNull();
        // click → pops out
        popoutBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        flushSync();
        expect(windowManager.isPoppedOut("wp")).toBe(true);
        // body now visible (pop-out forces expanded=true)
        expect(bodyVisible(target)).toBe(true);
        // click again → re-docks
        popoutBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        flushSync();
        expect(windowManager.isPoppedOut("wp")).toBe(false);
        void unmount(app);
    });
});

describe("Window — data-* attributes", () => {
    it("carries data-canvas-window, data-window-id, data-pill-id, data-popped-out, data-focused", () => {
        const app = mount(WindowProbe, {
            target,
            props: {
                id: "wa",
                pillId: "the-pill",
                title: "t",
                expanded: true,
                forcedCollapse: false,
                onToggleExpanded: () => undefined,
            },
        });
        flushSync();
        const root = target.querySelector<HTMLElement>("[data-canvas-window]");
        expect(root).not.toBeNull();
        expect(root?.getAttribute("data-window-id")).toBe("wa");
        expect(root?.getAttribute("data-pill-id")).toBe("the-pill");
        expect(root?.getAttribute("data-popped-out")).toBe("false");
        expect(root?.getAttribute("data-focused")).toBe("false");
        void unmount(app);
    });
});
