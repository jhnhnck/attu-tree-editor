/*
 * FamilyTreeEditor - SaveStatusPill: dual local + remote glyph rendering
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * canvas-window-manager phase 4: the pill renders TWO lucide glyphs
 * (local + remote) and exposes their state through the
 * `save-status-local-glyph` / `save-status-remote-glyph` testids +
 * data-state attributes. text labels moved into the Window body.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import SaveStatusPill from "$lib/components/shell/SaveStatusPill.svelte";

function base() {
    return {
        lastSavedAt: undefined,
        syncMode: "local" as const,
        syncedFlashUntil: undefined,
        lastError: undefined,
        popoverOpen: false,
        onPopoverToggle: vi.fn(),
        onretry: vi.fn(),
        onconflict: vi.fn(),
    };
}

describe("SaveStatusPill", () => {
    it("local glyph reads 'persisted' when not dirty", () => {
        render(SaveStatusPill, { ...base(), dirty: false });
        const local = screen.getByTestId("save-status-local-glyph");
        expect(local.getAttribute("data-state")).toBe("persisted");
    });

    it("local glyph reads 'dirty' when treeStore.dirty is true", () => {
        render(SaveStatusPill, { ...base(), dirty: true });
        const local = screen.getByTestId("save-status-local-glyph");
        expect(local.getAttribute("data-state")).toBe("dirty");
    });

    it("remote glyph reads 'saved' (cloud-off when no remote configured) by default", () => {
        render(SaveStatusPill, { ...base(), remoteConfigured: false });
        const remote = screen.getByTestId("save-status-remote-glyph");
        // tone is "saved" but no remote configured → renders cloud-off
        expect(remote.getAttribute("data-state")).toBe("saved");
    });

    it("remote glyph reads 'saving' while syncMode is syncing", () => {
        render(SaveStatusPill, { ...base(), syncMode: "syncing" });
        const remote = screen.getByTestId("save-status-remote-glyph");
        expect(remote.getAttribute("data-state")).toBe("saving");
    });

    it("remote glyph reads 'synced' during the sync flash window", () => {
        render(SaveStatusPill, {
            ...base(),
            syncMode: "local",
            syncedFlashUntil: Date.now() + 5_000,
        });
        const remote = screen.getByTestId("save-status-remote-glyph");
        expect(remote.getAttribute("data-state")).toBe("synced");
    });

    it("remote glyph reads 'failed' + click fires onretry when lastError set", async () => {
        const props = base();
        render(SaveStatusPill, { ...props, lastError: "disk full" });
        const remote = screen.getByTestId("save-status-remote-glyph");
        expect(remote.getAttribute("data-state")).toBe("failed");
        await fireEvent.click(screen.getByLabelText(/save status/i));
        expect(props.onretry).toHaveBeenCalled();
    });

    it("remote glyph reads 'conflict' + click fires onconflict on syncMode=conflict", async () => {
        const props = base();
        render(SaveStatusPill, { ...props, syncMode: "conflict" });
        const remote = screen.getByTestId("save-status-remote-glyph");
        expect(remote.getAttribute("data-state")).toBe("conflict");
        await fireEvent.click(screen.getByLabelText(/save status/i));
        expect(props.onconflict).toHaveBeenCalled();
    });

    it("local + remote glyphs update independently (dirty + synced flash)", () => {
        render(SaveStatusPill, {
            ...base(),
            dirty: true,
            syncedFlashUntil: Date.now() + 5_000,
        });
        expect(screen.getByTestId("save-status-local-glyph").getAttribute("data-state")).toBe(
            "dirty",
        );
        expect(screen.getByTestId("save-status-remote-glyph").getAttribute("data-state")).toBe(
            "synced",
        );
    });

    it("clicking the pill calls onPopoverToggle when tone is 'saved'", async () => {
        const props = base();
        render(SaveStatusPill, { ...props, lastSavedAt: Date.now() });
        await fireEvent.click(screen.getByLabelText(/save status/i));
        expect(props.onPopoverToggle).toHaveBeenCalledTimes(1);
    });

    it("aria-expanded mirrors popoverOpen", () => {
        const props = base();
        render(SaveStatusPill, { ...props, popoverOpen: true });
        const btn = screen.getByLabelText(/save status/i);
        expect(btn.getAttribute("aria-expanded")).toBe("true");
    });

    it("aria-label describes both local and remote state", () => {
        render(SaveStatusPill, { ...base(), dirty: true, remoteConfigured: true });
        const btn = screen.getByLabelText(/save status/i);
        const label = btn.getAttribute("aria-label") ?? "";
        expect(label).toMatch(/unsaved/i);
        expect(label).toMatch(/idle|remote/i);
    });
});
