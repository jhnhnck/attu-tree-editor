// SPDX-License-Identifier: MIT
// unit tests for DockSurface component (phase 1)

import { describe, it, expect, beforeEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { dockStore } from "../../../../src/lib/components/dock/store.svelte.js";
import type { DockRenderSnippet } from "../../../../src/lib/components/dock/store.svelte.js";
import DockSurface from "../../../../src/lib/components/dock/DockSurface.svelte";

const noop = (() => undefined) as unknown as DockRenderSnippet;

beforeEach(() => {
    dockStore.resetForTest();
});

describe("DockSurface", () => {
    it("renders surface container", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockSurface, { target, props: {} });
        try {
            flushSync();
            expect(target.querySelector("[data-dock-surface]")).not.toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("floating window renders at correct position", () => {
        const renderSnippet = (() => {
            const d = document.createElement("div");
            d.setAttribute("data-testid", "floating-window-content");
            return d;
        }) as unknown as DockRenderSnippet;

        dockStore.register({
            id: "fw",
            kind: "window",
            corner: "bl",
            priority: 10,
            render: renderSnippet,
        });
        dockStore.openWindow("fw");
        dockStore.popOut("fw", 150, 250);

        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockSurface, { target, props: {} });
        try {
            flushSync();
            const floatingDiv = target.querySelector("[data-floating-id='fw']") as HTMLElement;
            expect(floatingDiv).not.toBeNull();
            expect(floatingDiv.style.left).toBe("150px");
            expect(floatingDiv.style.top).toBe("250px");
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("floating window z-index is in 30-49 range", () => {
        const renderSnippet = noop;
        dockStore.register({ id: "fw", kind: "window", corner: "bl", priority: 10, render: renderSnippet });
        dockStore.openWindow("fw");
        dockStore.popOut("fw", 50, 50);

        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockSurface, { target, props: {} });
        try {
            flushSync();
            const floatingDiv = target.querySelector("[data-floating-id='fw']") as HTMLElement;
            expect(floatingDiv).not.toBeNull();
            const z = parseInt(floatingDiv.style.zIndex, 10);
            expect(z).toBeGreaterThanOrEqual(30);
            expect(z).toBeLessThan(50);
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("modal renders when activeModal matches a registered modal item", () => {
        const modalRender = (() => {
            const d = document.createElement("div");
            d.setAttribute("data-testid", "modal-content");
            return d;
        }) as unknown as DockRenderSnippet;

        dockStore.register({
            id: "my-modal",
            kind: "modal",
            corner: "bl",
            priority: 0,
            render: modalRender,
        });
        dockStore.openModal("my-modal");

        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockSurface, { target, props: {} });
        try {
            flushSync();
            // the modal layer div should be present
            const modalLayer = target.querySelector("[style*='z-index:50']") as HTMLElement;
            expect(modalLayer).not.toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("modal layer absent when activeModal is undefined", () => {
        dockStore.register({
            id: "my-modal",
            kind: "modal",
            corner: "bl",
            priority: 0,
            render: noop,
        });

        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockSurface, { target, props: {} });
        try {
            flushSync();
            const modalLayer = target.querySelector("[style*='z-index:50']");
            expect(modalLayer).toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });
});
