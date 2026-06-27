// SPDX-License-Identifier: MIT
// unit tests for DockWindow component (phase 1)

import { describe, it, expect, beforeEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { vi } from "vitest";
import { dockStore } from "../../../../src/lib/components/dock/store.svelte.js";
import type { DockRenderSnippet } from "../../../../src/lib/components/dock/store.svelte.js";
import DockWindow from "../../../../src/lib/components/dock/DockWindow.svelte";

const noop = (() => undefined) as unknown as DockRenderSnippet;

// simple snippet for body — renders a static div
const bodySnippet = (() => {
    const div = document.createElement("div");
    div.textContent = "body";
    return div;
}) as unknown as import("svelte").Snippet;

beforeEach(() => {
    dockStore.resetForTest();
    dockStore.register({ id: "w", kind: "window", corner: "bl", priority: 10, render: noop });
    dockStore.openWindow("w");
});

describe("DockWindow", () => {
    it("renders with title", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockWindow, {
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

    it("minimize button calls dockStore.toggleExpanded", () => {
        dockStore.setExpanded("w", true);
        const target = document.createElement("div");
        document.body.appendChild(target);
        const spy = vi.spyOn(dockStore, "toggleExpanded");
        const comp = mount(DockWindow, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet },
        });
        try {
            flushSync();
            const minBtn = target.querySelector("button[aria-label='minimize']") as HTMLButtonElement;
            expect(minBtn).not.toBeNull();
            minBtn.click();
            expect(spy).toHaveBeenCalledWith("w");
        } finally {
            spy.mockRestore();
            void unmount(comp);
            target.remove();
        }
    });

    it("close button calls dockStore.closeWindow", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const spy = vi.spyOn(dockStore, "closeWindow");
        const comp = mount(DockWindow, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet, closeable: true },
        });
        try {
            flushSync();
            const closeBtn = target.querySelector("button[aria-label='close']") as HTMLButtonElement;
            expect(closeBtn).not.toBeNull();
            closeBtn.click();
            expect(spy).toHaveBeenCalledWith("w");
        } finally {
            spy.mockRestore();
            void unmount(comp);
            target.remove();
        }
    });

    it("pop-out button calls dockStore.popOut when not floating", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const spy = vi.spyOn(dockStore, "popOut");
        const comp = mount(DockWindow, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet },
        });
        try {
            flushSync();
            const popBtn = target.querySelector("button[aria-label='pop out']") as HTMLButtonElement;
            expect(popBtn).not.toBeNull();
            popBtn.click();
            expect(spy).toHaveBeenCalledWith("w", expect.any(Number), expect.any(Number));
        } finally {
            spy.mockRestore();
            void unmount(comp);
            target.remove();
        }
    });

    it("no pop-out button when floating", () => {
        dockStore.popOut("w", 100, 100);
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockWindow, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet },
        });
        try {
            flushSync();
            const popBtn = target.querySelector("button[aria-label='pop out']");
            expect(popBtn).toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("closeable=false hides the close button", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockWindow, {
            target,
            props: { id: "w", title: "Win", body: bodySnippet, closeable: false },
        });
        try {
            flushSync();
            const closeBtn = target.querySelector("button[aria-label='close']");
            expect(closeBtn).toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });
});
