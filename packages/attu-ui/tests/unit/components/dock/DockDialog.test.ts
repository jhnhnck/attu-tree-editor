// SPDX-License-Identifier: MIT
// unit tests for DockDialog component (phase 1)

import { describe, it, expect, beforeEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { dockStore } from "../../../../src/lib/components/dock/store.svelte.js";
import DockDialog from "../../../../src/lib/components/dock/DockDialog.svelte";

beforeEach(() => {
    dockStore.resetForTest();
    // open dialog so DockDialog renders
    dockStore.openDialog("test-modal");
});

describe("DockDialog", () => {
    it("renders the modal panel", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockDialog, {
            target,
            props: { id: "test-modal", title: "Test Modal" },
        });
        try {
            flushSync();
            const panel = target.querySelector("[data-dialog-id='test-modal']");
            expect(panel).not.toBeNull();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("close button calls dockStore.closeModal", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockDialog, {
            target,
            props: { id: "test-modal", title: "Test" },
        });
        try {
            flushSync();
            const closeBtn = target.querySelector("button[aria-label='close']") as HTMLButtonElement;
            expect(closeBtn).not.toBeNull();
            closeBtn.click();
            flushSync();
            expect(dockStore.activeDialog).toBeUndefined();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("backdrop click closes the modal", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockDialog, {
            target,
            props: { id: "test-modal" },
        });
        try {
            flushSync();
            const backdrop = target.querySelector("[role='presentation']") as HTMLElement;
            expect(backdrop).not.toBeNull();
            backdrop.click();
            flushSync();
            expect(dockStore.activeDialog).toBeUndefined();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("Escape key closes the modal", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockDialog, {
            target,
            props: { id: "test-modal" },
        });
        try {
            flushSync();
            const panel = target.querySelector("[data-dialog-id='test-modal']") as HTMLElement;
            expect(panel).not.toBeNull();
            panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            flushSync();
            expect(dockStore.activeDialog).toBeUndefined();
        } finally {
            void unmount(comp);
            target.remove();
        }
    });

    it("onopen callback is called after mount", () => {
        let called = false;
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockDialog, {
            target,
            props: { id: "test-modal", onopen: () => { called = true; } },
        });
        try {
            flushSync();
            expect(called).toBe(true);
        } finally {
            void unmount(comp);
            target.remove();
        }
    });
});
