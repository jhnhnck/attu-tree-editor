// SPDX-License-Identifier: MIT
// unit tests for DockCorner component (phase 1)

import { describe, it, expect, beforeEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { dockStore } from "../../../../src/lib/components/dock/store.svelte.js";
import type { DockRenderSnippet } from "../../../../src/lib/components/dock/store.svelte.js";
import DockCorner from "../../../../src/lib/components/dock/DockCorner.svelte";

const noop = (() => undefined) as unknown as DockRenderSnippet;

beforeEach(() => {
    dockStore.resetForTest();
});

describe("DockCorner", () => {
    it("renders nothing when no items registered", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockCorner, {
            target,
            props: { corner: "bl" },
        });
        try {
            flushSync();
            expect(target.querySelector("[data-canvas-chrome]")).toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("renders pill row when pills are registered", () => {
        dockStore.register({ id: "p1", kind: "pill", corner: "bl", priority: 10, render: noop });
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockCorner, {
            target,
            props: { corner: "bl" },
        });
        try {
            flushSync();
            expect(target.querySelector("[data-dock-pills]")).not.toBeNull();
            expect(target.querySelector("[data-dock-pill-id='p1']")).not.toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("panel appears when window is expanded", () => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.openPanel("w");
        dockStore.setExpanded("w", true);
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockCorner, {
            target,
            props: { corner: "bl" },
        });
        try {
            flushSync();
            expect(target.querySelector("[data-dock-panels]")).not.toBeNull();
            expect(target.querySelector("[data-dock-item-id='w']")).not.toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("panel absent when window is minimized", () => {
        dockStore.register({ id: "w", kind: "panel", corner: "bl", priority: 10, render: noop });
        dockStore.openPanel("w");
        // stays minimized by default
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockCorner, {
            target,
            props: { corner: "bl" },
        });
        try {
            flushSync();
            expect(target.querySelector("[data-dock-panels]")).toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("dialog chip appears when activeDialog is set", () => {
        dockStore.register({ id: "p1", kind: "pill", corner: "bl", priority: 10, render: noop });
        dockStore.register({
            id: "my-modal",
            kind: "dialog",
            corner: "bl",
            priority: 0,
            title: "My Modal",
            render: noop,
        });
        dockStore.openDialog("my-modal");
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockCorner, {
            target,
            props: { corner: "bl" },
        });
        try {
            flushSync();
            const chip = target.querySelector("[data-testid='modal-chip']");
            expect(chip).not.toBeNull();
            expect(chip?.textContent).toContain("My Modal");
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("clicking dialog chip calls dockStore.closeDialog", () => {
        dockStore.register({ id: "p1", kind: "pill", corner: "bl", priority: 10, render: noop });
        dockStore.openDialog("some-modal");
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockCorner, {
            target,
            props: { corner: "bl" },
        });
        try {
            flushSync();
            const chip = target.querySelector("[data-testid='modal-chip']") as HTMLButtonElement;
            expect(chip).not.toBeNull();
            chip.click();
            flushSync();
            expect(dockStore.activeDialog).toBeUndefined();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });
});
