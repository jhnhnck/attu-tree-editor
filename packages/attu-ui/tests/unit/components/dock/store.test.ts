// SPDX-License-Identifier: MIT
// unit tests for the dock store state machine (phase 1)

import { describe, it, expect, beforeEach } from "vitest";
import { dockStore } from "../../../../src/lib/components/dock/store.svelte.js";
import type { DockRenderSnippet } from "../../../../src/lib/components/dock/store.svelte.js";

const noop = (() => undefined) as unknown as DockRenderSnippet;

beforeEach(() => {
    dockStore.resetForTest();
});

describe("dockStore — registry", () => {
    it("register + getItem returns the item", () => {
        dockStore.register({ id: "a", kind: "pill", corner: "bl", priority: 10, render: noop });
        expect(dockStore.getItem("a")?.id).toBe("a");
    });

    it("duplicate id throws", () => {
        dockStore.register({ id: "dup", kind: "pill", corner: "bl", priority: 10, render: noop });
        expect(() =>
            dockStore.register({ id: "dup", kind: "pill", corner: "bl", priority: 20, render: noop }),
        ).toThrow(/duplicate id/);
    });

    it("unregister removes the item", () => {
        dockStore.register({ id: "a", kind: "pill", corner: "bl", priority: 10, render: noop });
        dockStore.unregister("a");
        expect(dockStore.getItem("a")).toBeUndefined();
    });

    it("updateItem patches in place", () => {
        dockStore.register({ id: "a", kind: "pill", corner: "bl", priority: 10, render: noop });
        dockStore.updateItem("a", { priority: 99 });
        expect(dockStore.getItem("a")?.priority).toBe(99);
    });

    it("updateItem on unknown id is a no-op", () => {
        expect(() => dockStore.updateItem("never", { priority: 99 })).not.toThrow();
    });

    it("itemsForCorner returns only that corner's items sorted", () => {
        dockStore.register({ id: "b", kind: "pill", corner: "bl", priority: 20, render: noop });
        dockStore.register({ id: "a", kind: "pill", corner: "bl", priority: 10, render: noop });
        dockStore.register({ id: "x", kind: "pill", corner: "tr", priority: 5, render: noop });
        const ids = dockStore.itemsForCorner("bl").map(i => i.id);
        expect(ids).toEqual(["a", "b"]);
        expect(dockStore.itemsForCorner("tr").map(i => i.id)).toEqual(["x"]);
    });

    it("itemsForCorner excludes modal items", () => {
        dockStore.register({ id: "m", kind: "modal", corner: "bl", priority: 0, render: noop });
        expect(dockStore.itemsForCorner("bl")).toHaveLength(0);
    });
});

describe("dockStore — window state", () => {
    it("new window state is closed by default", () => {
        dockStore.register({ id: "w", kind: "window", corner: "bl", priority: 10, render: noop });
        expect(dockStore.windowState("w")).toBe("closed");
    });

    it("persistent=false auto-opens as minimized", () => {
        dockStore.register({
            id: "w",
            kind: "window",
            corner: "bl",
            priority: 10,
            persistent: false,
            render: noop,
        });
        expect(dockStore.windowState("w")).toBe("minimized");
    });

    it("openWindow transitions closed → minimized", () => {
        dockStore.register({ id: "w", kind: "window", corner: "bl", priority: 10, render: noop });
        dockStore.openWindow("w");
        expect(dockStore.windowState("w")).toBe("minimized");
    });

    it("openWindow is idempotent when already open", () => {
        dockStore.register({ id: "w", kind: "window", corner: "bl", priority: 10, render: noop });
        dockStore.openWindow("w");
        dockStore.openWindow("w");
        expect(dockStore.windowState("w")).toBe("minimized");
    });

    it("closeWindow transitions minimized → closed", () => {
        dockStore.register({ id: "w", kind: "window", corner: "bl", priority: 10, render: noop });
        dockStore.openWindow("w");
        dockStore.closeWindow("w");
        expect(dockStore.windowState("w")).toBe("closed");
    });

    it("closeable=false blocks closeWindow", () => {
        dockStore.register({
            id: "w",
            kind: "window",
            corner: "bl",
            priority: 10,
            closeable: false,
            persistent: false,
            render: noop,
        });
        dockStore.closeWindow("w");
        expect(dockStore.windowState("w")).toBe("minimized");
    });

    it("toggleExpanded: minimized → expanded → minimized", () => {
        dockStore.register({ id: "w", kind: "window", corner: "bl", priority: 10, render: noop });
        dockStore.openWindow("w");
        dockStore.toggleExpanded("w");
        expect(dockStore.windowState("w")).toBe("expanded");
        dockStore.toggleExpanded("w");
        expect(dockStore.windowState("w")).toBe("minimized");
    });

    it("setExpanded works", () => {
        dockStore.register({ id: "w", kind: "window", corner: "bl", priority: 10, render: noop });
        dockStore.openWindow("w");
        dockStore.setExpanded("w", true);
        expect(dockStore.isExpanded("w")).toBe(true);
        dockStore.setExpanded("w", false);
        expect(dockStore.isExpanded("w")).toBe(false);
    });

    it("isOpen returns true for closeable=false windows", () => {
        dockStore.register({
            id: "w",
            kind: "window",
            corner: "bl",
            priority: 10,
            closeable: false,
            render: noop,
        });
        expect(dockStore.isOpen("w")).toBe(true);
    });
});

describe("dockStore — pillClick", () => {
    beforeEach(() => {
        dockStore.register({ id: "w", kind: "window", corner: "bl", priority: 10, render: noop });
    });

    it("closed → minimized", () => {
        expect(dockStore.windowState("w")).toBe("closed");
        dockStore.pillClick("w");
        expect(dockStore.windowState("w")).toBe("minimized");
    });

    it("minimized → expanded", () => {
        dockStore.openWindow("w");
        dockStore.pillClick("w");
        expect(dockStore.windowState("w")).toBe("expanded");
    });

    it("expanded → minimized", () => {
        dockStore.openWindow("w");
        dockStore.setExpanded("w", true);
        dockStore.pillClick("w");
        expect(dockStore.windowState("w")).toBe("minimized");
    });

    it("floating → bringToFront (stays floating)", () => {
        dockStore.openWindow("w");
        dockStore.popOut("w", 50, 50);
        expect(dockStore.windowState("w")).toBe("floating");
        dockStore.pillClick("w");
        expect(dockStore.windowState("w")).toBe("floating");
    });
});

describe("dockStore — modal", () => {
    it("openModal sets activeModal", () => {
        dockStore.openModal("my-modal");
        expect(dockStore.activeModal).toBe("my-modal");
    });

    it("closeModal clears activeModal", () => {
        dockStore.openModal("my-modal");
        dockStore.closeModal();
        expect(dockStore.activeModal).toBeUndefined();
    });

    it("openModal closes previous modal first", () => {
        dockStore.openModal("modal-1");
        dockStore.openModal("modal-2");
        expect(dockStore.activeModal).toBe("modal-2");
    });

    it("modalItems returns items with kind=modal", () => {
        dockStore.register({ id: "m1", kind: "modal", corner: "bl", priority: 0, render: noop });
        dockStore.register({ id: "p1", kind: "pill", corner: "bl", priority: 10, render: noop });
        const modalIds = dockStore.modalItems.map(m => m.id);
        expect(modalIds).toContain("m1");
        expect(modalIds).not.toContain("p1");
    });
});

describe("dockStore — pop-out", () => {
    beforeEach(() => {
        dockStore.register({ id: "w", kind: "window", corner: "bl", priority: 10, render: noop });
        dockStore.openWindow("w");
    });

    it("popOut sets state to floating with position", () => {
        dockStore.popOut("w", 100, 200);
        expect(dockStore.windowState("w")).toBe("floating");
        const fi = dockStore.floatingItems.find(f => f.item.id === "w");
        expect(fi?.pos.x).toBe(100);
        expect(fi?.pos.y).toBe(200);
    });

    it("floatingItems returns floating windows", () => {
        dockStore.popOut("w", 50, 60);
        expect(dockStore.floatingItems).toHaveLength(1);
        expect(dockStore.floatingItems[0]?.item.id).toBe("w");
    });

    it("bringToFront increases z", () => {
        dockStore.popOut("w", 100, 100);
        const z1 = dockStore.floatingItems[0]!.pos.z;
        dockStore.bringToFront("w");
        const z2 = dockStore.floatingItems[0]!.pos.z;
        expect(z2).toBeGreaterThan(z1);
    });

    it("moveWindow updates position", () => {
        dockStore.popOut("w", 100, 100);
        dockStore.moveWindow("w", 200, 300);
        const fi = dockStore.floatingItems.find(f => f.item.id === "w");
        expect(fi?.pos.x).toBe(200);
        expect(fi?.pos.y).toBe(300);
    });
});

describe("dockStore — focusWindow", () => {
    it("focusWindow updates focusedAt", () => {
        dockStore.register({ id: "w", kind: "window", corner: "bl", priority: 10, render: noop });
        dockStore.openWindow("w");
        dockStore.focusWindow("w");
        const item = dockStore.getItem("w");
        expect(item?.focusedAt).toBeDefined();
        expect(item!.focusedAt).toBeGreaterThan(0);
    });

    it("focusWindow calls bringToFront if floating", () => {
        dockStore.register({ id: "w", kind: "window", corner: "bl", priority: 10, render: noop });
        dockStore.register({ id: "w2", kind: "window", corner: "bl", priority: 20, render: noop });
        dockStore.openWindow("w");
        dockStore.openWindow("w2");
        dockStore.popOut("w", 50, 50);
        dockStore.popOut("w2", 100, 100);
        const z2before = dockStore.floatingItems.find(f => f.item.id === "w2")!.pos.z;
        dockStore.focusWindow("w");
        const z1after = dockStore.floatingItems.find(f => f.item.id === "w")!.pos.z;
        expect(z1after).toBeGreaterThan(z2before);
    });
});

describe("dockStore — reorderPills", () => {
    it("reorderPills updates pill order", () => {
        dockStore.register({ id: "p-a", kind: "pill", corner: "bl", priority: 10, render: noop });
        dockStore.register({ id: "p-b", kind: "pill", corner: "bl", priority: 20, render: noop });
        dockStore.register({ id: "p-c", kind: "pill", corner: "bl", priority: 30, render: noop });
        dockStore.reorderPills("bl", ["p-c", "p-a", "p-b"]);
        const ids = dockStore.itemsForCorner("bl").map(i => i.id);
        expect(ids).toEqual(["p-c", "p-a", "p-b"]);
    });

    it("mirrors order onto paired window", () => {
        dockStore.register({
            id: "pill-a",
            kind: "pill",
            corner: "bl",
            priority: 10,
            render: noop,
            windowId: "win-a",
        });
        dockStore.register({
            id: "pill-b",
            kind: "pill",
            corner: "bl",
            priority: 20,
            render: noop,
            windowId: "win-b",
        });
        dockStore.register({ id: "win-a", kind: "window", corner: "bl", priority: 15, render: noop });
        dockStore.register({ id: "win-b", kind: "window", corner: "bl", priority: 25, render: noop });

        dockStore.reorderPills("bl", ["pill-b", "pill-a"]);
        const winIds = dockStore.itemsForCorner("bl")
            .filter(i => i.kind === "window")
            .map(i => i.id);
        expect(winIds).toEqual(["win-b", "win-a"]);
    });
});

describe("dockStore — resetForTest", () => {
    it("clears all state", () => {
        dockStore.register({ id: "a", kind: "pill", corner: "bl", priority: 10, render: noop });
        dockStore.openModal("m");
        dockStore.resetForTest();
        expect(dockStore.getItem("a")).toBeUndefined();
        expect(dockStore.activeModal).toBeUndefined();
        expect(dockStore.floatingItems).toHaveLength(0);
    });

    it("clears localStorage", () => {
        localStorage.setItem("fte.dock.openedWindows", '["test"]');
        dockStore.resetForTest();
        expect(localStorage.getItem("fte.dock.openedWindows")).toBeNull();
    });
});
