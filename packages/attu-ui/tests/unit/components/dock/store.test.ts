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
        dockStore.register({ id: "m", kind: "dialog", corner: "bl", priority: 0, render: noop });
        expect(dockStore.itemsForCorner("bl")).toHaveLength(0);
    });
});

describe("dockStore — panel state", () => {
    it("new window state is closed by default", () => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        expect(dockStore.panelState("w")).toBe("closed");
    });

    it("persistent=false auto-opens as minimized", () => {
        dockStore.register({
            id: "w",
            kind: "panel",
            corner: "bl",
            priority: 10,
            persistent: false,
            render: noop,
        });
        expect(dockStore.panelState("w")).toBe("minimized");
    });

    it("openPanel transitions closed → minimized", () => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.openPanel("w");
        expect(dockStore.panelState("w")).toBe("minimized");
    });

    it("openPanel is idempotent when already open", () => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.openPanel("w");
        dockStore.openPanel("w");
        expect(dockStore.panelState("w")).toBe("minimized");
    });

    it("closePanel transitions minimized → closed", () => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.openPanel("w");
        dockStore.closePanel("w");
        expect(dockStore.panelState("w")).toBe("closed");
    });

    it("closeable=false auto-opens as minimized on register", () => {
        dockStore.register({
            id: "w",
            kind: "panel",
            corner: "bl",
            priority: 10,
            closeable: false,
            render: noop,
        });
        expect(dockStore.panelState("w")).toBe("minimized");
    });

    it("closeable=false blocks closePanel", () => {
        dockStore.register({
            id: "w",
            kind: "panel",
            corner: "bl",
            priority: 10,
            closeable: false,
            render: noop,
        });
        dockStore.closePanel("w");
        expect(dockStore.panelState("w")).toBe("minimized");
    });

    it("toggleExpanded: minimized → expanded → minimized", () => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.openPanel("w");
        dockStore.toggleExpanded("w");
        expect(dockStore.panelState("w")).toBe("expanded");
        dockStore.toggleExpanded("w");
        expect(dockStore.panelState("w")).toBe("minimized");
    });

    it("setExpanded works", () => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.openPanel("w");
        dockStore.setExpanded("w", true);
        expect(dockStore.isExpanded("w")).toBe(true);
        dockStore.setExpanded("w", false);
        expect(dockStore.isExpanded("w")).toBe(false);
    });

    it("isOpen returns true for closeable=false panels", () => {
        dockStore.register({
            id: "w",
            kind: "panel",
            corner: "bl",
            priority: 10,
            closeable: false,
            render: noop,
        });
        expect(dockStore.isOpen("w")).toBe(true);
    });
});

describe("dockStore — togglePanel", () => {
    beforeEach(() => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
    });

    it("closed → expanded", () => {
        expect(dockStore.panelState("w")).toBe("closed");
        dockStore.togglePanel("w");
        expect(dockStore.panelState("w")).toBe("expanded");
    });

    it("minimized → expanded", () => {
        dockStore.openPanel("w");
        dockStore.togglePanel("w");
        expect(dockStore.panelState("w")).toBe("expanded");
    });

    it("expanded → minimized", () => {
        dockStore.openPanel("w");
        dockStore.setExpanded("w", true);
        dockStore.togglePanel("w");
        expect(dockStore.panelState("w")).toBe("minimized");
    });

    it("floating → bringToFront (stays floating)", () => {
        dockStore.openPanel("w");
        dockStore.floatPanel("w", 50, 50);
        expect(dockStore.panelState("w")).toBe("floating");
        dockStore.togglePanel("w");
        expect(dockStore.panelState("w")).toBe("floating");
    });
});

describe("dockStore — dialog", () => {
    it("openDialog sets activeDialog", () => {
        dockStore.openDialog("my-modal");
        expect(dockStore.activeDialog).toBe("my-modal");
    });

    it("closeDialog clears activeDialog", () => {
        dockStore.openDialog("my-modal");
        dockStore.closeDialog();
        expect(dockStore.activeDialog).toBeUndefined();
    });

    it("openDialog closes previous dialog first", () => {
        dockStore.openDialog("modal-1");
        dockStore.openDialog("modal-2");
        expect(dockStore.activeDialog).toBe("modal-2");
    });

    it("dialogs returns items with kind=dialog", () => {
        dockStore.register({ id: "m1", kind: "dialog", corner: "bl", priority: 0, render: noop });
        dockStore.register({ id: "p1", kind: "pill", corner: "bl", priority: 10, render: noop });
        const modalIds = dockStore.dialogs.map(m => m.id);
        expect(modalIds).toContain("m1");
        expect(modalIds).not.toContain("p1");
    });
});

describe("dockStore — floatPanel", () => {
    beforeEach(() => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.openPanel("w");
    });

    it("popOut sets state to floating with position", () => {
        dockStore.floatPanel("w", 100, 200);
        expect(dockStore.panelState("w")).toBe("floating");
        const fi = dockStore.floatingPanels.find(f => f.item.id === "w");
        expect(fi?.pos.x).toBe(100);
        expect(fi?.pos.y).toBe(200);
    });

    it("floatingItems returns floating windows", () => {
        dockStore.floatPanel("w", 50, 60);
        expect(dockStore.floatingPanels).toHaveLength(1);
        expect(dockStore.floatingPanels[0]?.item.id).toBe("w");
    });

    it("bringToFront increases z", () => {
        dockStore.floatPanel("w", 100, 100);
        const z1 = dockStore.floatingPanels[0]!.pos.z;
        dockStore.bringToFront("w");
        const z2 = dockStore.floatingPanels[0]!.pos.z;
        expect(z2).toBeGreaterThan(z1);
    });

    it("moveWindow updates position", () => {
        dockStore.floatPanel("w", 100, 100);
        dockStore.movePanel("w", 200, 300);
        const fi = dockStore.floatingPanels.find(f => f.item.id === "w");
        expect(fi?.pos.x).toBe(200);
        expect(fi?.pos.y).toBe(300);
    });
});

describe("dockStore — dockPanel", () => {
    beforeEach(() => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.openPanel("w");
    });

    it("redock transitions floating → minimized", () => {
        dockStore.floatPanel("w", 100, 200);
        expect(dockStore.panelState("w")).toBe("floating");
        dockStore.dockPanel("w");
        expect(dockStore.panelState("w")).toBe("minimized");
    });

    it("redock removes the floating position", () => {
        dockStore.floatPanel("w", 100, 200);
        dockStore.dockPanel("w");
        expect(dockStore.floatingPanels).toHaveLength(0);
    });

    it("redock on a non-floating window is a no-op (does not throw)", () => {
        expect(dockStore.panelState("w")).toBe("minimized");
        expect(() => dockStore.dockPanel("w")).not.toThrow();
        expect(dockStore.panelState("w")).toBe("minimized");
    });
});

describe("dockStore — dockPanelExpanded", () => {
    beforeEach(() => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.openPanel("w");
    });

    it("redockExpanded transitions floating → expanded", () => {
        dockStore.floatPanel("w", 100, 200);
        expect(dockStore.panelState("w")).toBe("floating");
        dockStore.dockPanelExpanded("w");
        expect(dockStore.panelState("w")).toBe("expanded");
    });

    it("redockExpanded removes the floating position", () => {
        dockStore.floatPanel("w", 100, 200);
        dockStore.dockPanelExpanded("w");
        expect(dockStore.floatingPanels).toHaveLength(0);
    });
});

describe("dockStore — focusPanel", () => {
    it("focusWindow updates focusedAt", () => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.openPanel("w");
        dockStore.focusPanel("w");
        const item = dockStore.getItem("w");
        expect(item?.focusedAt).toBeDefined();
        expect(item!.focusedAt).toBeGreaterThan(0);
    });

    it("focusWindow calls bringToFront if floating", () => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.register({ id: "w2", kind: "panel", corner: "bl", priority: 20, render: noop });
        dockStore.openPanel("w");
        dockStore.openPanel("w2");
        dockStore.floatPanel("w", 50, 50);
        dockStore.floatPanel("w2", 100, 100);
        const z2before = dockStore.floatingPanels.find(f => f.item.id === "w2")!.pos.z;
        dockStore.focusPanel("w");
        const z1after = dockStore.floatingPanels.find(f => f.item.id === "w")!.pos.z;
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
            panelId: "win-a",
        });
        dockStore.register({
            id: "pill-b",
            kind: "pill",
            corner: "bl",
            priority: 20,
            render: noop,
            panelId: "win-b",
        });
        dockStore.register({ id: "win-a", kind: "panel", corner: "bl", priority: 15, render: noop });
        dockStore.register({ id: "win-b", kind: "panel", corner: "bl", priority: 25, render: noop });

        dockStore.reorderPills("bl", ["pill-b", "pill-a"]);
        const winIds = dockStore.itemsForCorner("bl")
            .filter(i => i.kind === "panel")
            .map(i => i.id);
        expect(winIds).toEqual(["win-b", "win-a"]);
    });
});

describe("dockStore — resetForTest", () => {
    it("clears all state", () => {
        dockStore.register({ id: "a", kind: "pill", corner: "bl", priority: 10, render: noop });
        dockStore.openDialog("m");
        dockStore.resetForTest();
        expect(dockStore.getItem("a")).toBeUndefined();
        expect(dockStore.activeDialog).toBeUndefined();
        expect(dockStore.floatingPanels).toHaveLength(0);
    });

    it("clears localStorage", () => {
        localStorage.setItem("fte.dock.openedPanels", '["test"]');
        dockStore.resetForTest();
        expect(localStorage.getItem("fte.dock.openedPanels")).toBeNull();
    });
});
