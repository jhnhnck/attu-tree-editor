/*
 * FamilyTreeEditor - SaveStatusPill: per-mode label + icon, click handlers
 * licensed under the MIT license; see LICENSE.md for full text
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
        onretry: vi.fn(),
        onconflict: vi.fn(),
        onforceSave: vi.fn(),
    };
}

describe("SaveStatusPill", () => {
    it("renders 'Saved · …' with a green tone when there's a lastSavedAt and no errors", () => {
        const ts = Date.now() - 12_000;
        render(SaveStatusPill, { ...base(), lastSavedAt: ts });
        expect(screen.getByLabelText(/save status/i)).toHaveTextContent(/Saved/);
    });

    it("renders 'Saving…' while syncMode is syncing", () => {
        render(SaveStatusPill, { ...base(), syncMode: "syncing" });
        expect(screen.getByLabelText(/save status/i)).toHaveTextContent(/Saving/);
    });

    it("renders 'Synced' during the sync flash window", () => {
        render(SaveStatusPill, {
            ...base(),
            syncMode: "local",
            syncedFlashUntil: Date.now() + 5_000,
        });
        expect(screen.getByLabelText(/save status/i)).toHaveTextContent(/Synced/);
    });

    it("renders 'Save failed' and clicking it fires onretry", async () => {
        const props = base();
        render(SaveStatusPill, { ...props, lastError: "disk full" });
        const btn = screen.getByLabelText(/save status/i);
        expect(btn).toHaveTextContent(/Save failed/);
        await fireEvent.click(btn);
        expect(props.onretry).toHaveBeenCalled();
    });

    it("renders 'Conflict' and clicking it fires onconflict", async () => {
        const props = base();
        render(SaveStatusPill, { ...props, syncMode: "conflict" });
        const btn = screen.getByLabelText(/save status/i);
        expect(btn).toHaveTextContent(/Conflict/);
        await fireEvent.click(btn);
        expect(props.onconflict).toHaveBeenCalled();
    });

    it("clicking the saved pill opens a popover with a force-save button", async () => {
        const props = base();
        render(SaveStatusPill, { ...props, lastSavedAt: Date.now() });
        await fireEvent.click(screen.getByLabelText(/save status/i));
        const force = screen.getByRole("button", { name: /force save/i });
        expect(force).toBeInTheDocument();
        await fireEvent.click(force);
        expect(props.onforceSave).toHaveBeenCalled();
    });
});
