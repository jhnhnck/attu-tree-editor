// SPDX-License-Identifier: MIT
// unit tests for DockItem registration bridge (phase 1)

import { describe, it, expect, beforeEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { vi } from "vitest";
import { dockStore } from "../../../../src/lib/components/dock/store.svelte.js";
import type { DockRenderSnippet } from "../../../../src/lib/components/dock/store.svelte.js";
import DockItem from "../../../../src/lib/components/dock/DockItem.svelte";

const noop = (() => undefined) as unknown as DockRenderSnippet;

beforeEach(() => {
    dockStore.resetForTest();
});

describe("DockItem", () => {
    it("registers the item on mount and unregisters on unmount", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockItem, {
            target,
            props: {
                id: "test-item",
                kind: "pill" as const,
                corner: "bl" as const,
                priority: 10,
                render: noop,
            },
        });
        try {
            flushSync();
            expect(dockStore.getItem("test-item")).not.toBeUndefined();
            void unmount(comp);
            flushSync();
            expect(dockStore.getItem("test-item")).toBeUndefined();
        } finally {
            target.remove();
        }
    });

    it("updateItem not called excessively on stable props", () => {
        const spy = vi.spyOn(dockStore, "updateItem");
        const target = document.createElement("div");
        document.body.appendChild(target);
        const comp = mount(DockItem, {
            target,
            props: {
                id: "test-item",
                kind: "pill" as const,
                corner: "bl" as const,
                priority: 10,
                render: noop,
            },
        });
        try {
            flushSync();
            const callCount = spy.mock.calls.length;
            // props haven't changed, so no additional updateItem calls
            flushSync();
            expect(spy.mock.calls.length).toBe(callCount);
        } finally {
            spy.mockRestore();
            void unmount(comp);
            target.remove();
        }
    });
});
