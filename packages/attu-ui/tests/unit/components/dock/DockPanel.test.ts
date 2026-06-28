// SPDX-License-Identifier: MIT
// unit tests for DockPanel component (phase 1)

import { describe, it, expect, beforeEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { vi } from "vitest";
import { dockStore } from "../../../../src/lib/components/dock/store.svelte.js";
import type { DockRenderSnippet } from "../../../../src/lib/components/dock/store.svelte.js";
import DockPanel from "../../../../src/lib/components/dock/DockPanel.svelte";

const noop = (() => undefined) as unknown as DockRenderSnippet;

// simple snippet for body — renders a static div
const bodySnippet = (() => {
    const div = document.createElement("div");
    div.textContent = "body";
    return div;
}) as unknown as import("svelte").Snippet;

beforeEach(() => {
    dockStore.resetForTest();
    dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
    dockStore.openPanel("w");
});

describe("DockPanel", () => {
    it("renders with title", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockPanel, {
            target,
            props: { id: "w", title: "My Window", body: bodySnippet },
        });
        try {
            flushSync();
            expect(target.querySelector("[data-window-id='w']")).not.toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("minimize button calls dockStore.toggleExpanded when docked", () => {
        dockStore.setExpanded("w", true);
        const target = document.createElement("div");
        document.body.appendChild(target);
        const spy = vi.spyOn(dockStore, "toggleExpanded");
        const comp = mount(DockPanel, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet },
        });
        try {
            flushSync();
            const minBtn = target.querySelector("[aria-label='minimize']") as HTMLElement;
            expect(minBtn).not.toBeNull();
            minBtn.click();
            expect(spy).toHaveBeenCalledWith("w");
        } finally {
            spy.mockRestore();
            void unmount(comp);
            target.remove();
        }
    });

    it("minimize button calls dockStore.dockPanel when floating", () => {
        dockStore.floatPanel("w", 100, 100);
        const target = document.createElement("div");
        document.body.appendChild(target);
        const spy = vi.spyOn(dockStore, "dockPanel");
        const comp = mount(DockPanel, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet },
        });
        try {
            flushSync();
            const minBtn = target.querySelector("[aria-label='minimize']") as HTMLElement;
            expect(minBtn).not.toBeNull();
            minBtn.click();
            expect(spy).toHaveBeenCalledWith("w");
        } finally {
            spy.mockRestore();
            void unmount(comp);
            target.remove();
        }
    });

    it("close button calls dockStore.closePanel", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const spy = vi.spyOn(dockStore, "closePanel");
        const comp = mount(DockPanel, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet, closeable: true },
        });
        try {
            flushSync();
            const closeBtn = target.querySelector("[aria-label='close']") as HTMLElement;
            expect(closeBtn).not.toBeNull();
            closeBtn.click();
            expect(spy).toHaveBeenCalledWith("w");
        } finally {
            spy.mockRestore();
            void unmount(comp);
            target.remove();
        }
    });

    it("pop-out button calls dockStore.floatPanel when not floating", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const spy = vi.spyOn(dockStore, "floatPanel");
        const comp = mount(DockPanel, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet },
        });
        try {
            flushSync();
            const popBtn = target.querySelector("[aria-label='pop out']") as HTMLElement;
            expect(popBtn).not.toBeNull();
            popBtn.click();
            expect(spy).toHaveBeenCalledWith("w", expect.any(Number), expect.any(Number));
        } finally {
            spy.mockRestore();
            void unmount(comp);
            target.remove();
        }
    });

    it("re-dock button calls dockStore.dockPanelExpanded when floating", () => {
        dockStore.floatPanel("w", 100, 100);
        const target = document.createElement("div");
        document.body.appendChild(target);
        const spy = vi.spyOn(dockStore, "dockPanelExpanded");
        const comp = mount(DockPanel, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet },
        });
        try {
            flushSync();
            const redockBtn = target.querySelector("[aria-label='re-dock']") as HTMLElement;
            expect(redockBtn).not.toBeNull();
            redockBtn.click();
            expect(spy).toHaveBeenCalledWith("w");
        } finally {
            spy.mockRestore();
            void unmount(comp);
            target.remove();
        }
    });

    it("pop-out button shows re-dock label when floating", () => {
        dockStore.floatPanel("w", 100, 100);
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockPanel, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet },
        });
        try {
            flushSync();
            expect(target.querySelector("[aria-label='pop out']")).toBeNull();
            expect(target.querySelector("[aria-label='re-dock']")).not.toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("closeable=false hides the close button", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockPanel, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet, closeable: false },
        });
        try {
            flushSync();
            const closeBtn = target.querySelector("[aria-label='close']");
            expect(closeBtn).toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });
});
