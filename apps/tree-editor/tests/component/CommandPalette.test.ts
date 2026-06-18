/*
 * FamilyTreeEditor - CommandPalette: empty state, fuzzy match, prefix toggles, keyboard nav
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import CommandPalette from "$lib/components/palette/CommandPalette.svelte";
import type { PaletteItem } from "@attu/ui";

beforeAll(() => {
    // jsdom doesn't implement Element.scrollIntoView — the palette calls it
    // after every arrow-key nav. stub it as a no-op so the keydown handler
    // doesn't throw.
    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = vi.fn();
    }
});

function personItem(id: string, given: string, surname: string): PaletteItem {
    return {
        id,
        label: [given, surname].filter(Boolean).join(" ").trim() || "(unnamed)",
        detail: id,
        kind: "person",
        action: vi.fn(),
    };
}

function cmdItem(label: string, i = 0, action?: () => void): PaletteItem {
    return {
        id: `cmd.${String(i)}.${label.toLowerCase().replace(/\W+/g, "")}`,
        label,
        detail: "Other",
        kind: "command",
        action: action ?? vi.fn(),
    };
}

function tinyItems(): PaletteItem[] {
    return [personItem("AAAAA", "Alpha", "Smith"), personItem("BBBBB", "Beta", "Jones")];
}

describe("CommandPalette", () => {
    it("renders rows for the empty input (people + commands)", () => {
        const items: PaletteItem[] = [...tinyItems(), cmdItem("Save", 0), cmdItem("Open", 1)];
        render(CommandPalette, { items, mode: "anything", onclose: vi.fn() });
        expect(screen.getByText("Alpha Smith")).toBeInTheDocument();
        expect(screen.getByText("Beta Jones")).toBeInTheDocument();
        expect(screen.getByText("Save")).toBeInTheDocument();
        expect(screen.getByText("Open")).toBeInTheDocument();
    });

    it("typing a command name filters the list to matching commands", async () => {
        const items: PaletteItem[] = [
            ...tinyItems(),
            cmdItem("Save tree", 0),
            cmdItem("Open dialog", 1),
        ];
        render(CommandPalette, { items, mode: "commands", onclose: vi.fn() });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: "save" } });
        expect(screen.getByText("Save tree")).toBeInTheDocument();
        expect(screen.queryByText("Open dialog")).toBeNull();
    });

    it("`@` prefix swaps the view to people-only", async () => {
        const items: PaletteItem[] = [...tinyItems(), cmdItem("Save", 0)];
        render(CommandPalette, { items, mode: "anything", onclose: vi.fn() });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: "@" } });
        expect(screen.getByText("Alpha Smith")).toBeInTheDocument();
        expect(screen.queryByText("Save")).toBeNull();
    });

    it("`>` prefix swaps the view to commands-only", async () => {
        const items: PaletteItem[] = [...tinyItems(), cmdItem("Save", 0)];
        render(CommandPalette, { items, mode: "anything", onclose: vi.fn() });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: ">" } });
        expect(screen.getByText("Save")).toBeInTheDocument();
        expect(screen.queryByText("Alpha Smith")).toBeNull();
    });

    it("Enter on the highlighted row fires the item's action and closes", async () => {
        const saveAction = vi.fn();
        const onclose = vi.fn();
        const items: PaletteItem[] = [
            ...tinyItems(),
            cmdItem("Save", 0, saveAction),
            cmdItem("Open", 1),
        ];
        render(CommandPalette, { items, mode: "commands", onclose });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: "save" } });
        await fireEvent.keyDown(input, { key: "Enter" });
        expect(saveAction).toHaveBeenCalledTimes(1);
        expect(onclose).toHaveBeenCalled();
    });

    it("Esc fires onclose", async () => {
        const onclose = vi.fn();
        const items: PaletteItem[] = [...tinyItems(), cmdItem("Save", 0)];
        render(CommandPalette, { items, mode: "commands", onclose });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.keyDown(input, { key: "Escape" });
        expect(onclose).toHaveBeenCalled();
    });

    it("on open, no row carries the bg-canvas highlight class", () => {
        // matches Menu's behaviour: the first row is only highlighted after the
        // user explicitly presses ↑/↓ or hovers a row with the mouse
        const items: PaletteItem[] = [cmdItem("Save", 0)];
        render(CommandPalette, { items, mode: "commands", onclose: vi.fn() });
        const row = screen.getByText("Save").closest("button");
        // class:bg-canvas adds it as a standalone token; check against classList
        expect(row?.classList.contains("bg-canvas")).toBe(false);
    });

    it("first ArrowDown highlights row 0; second ArrowDown moves to row 1", async () => {
        const items: PaletteItem[] = [cmdItem("Save", 0), cmdItem("Open", 1)];
        render(CommandPalette, { items, mode: "commands", onclose: vi.fn() });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.keyDown(input, { key: "ArrowDown" });
        const rows = screen.getAllByRole("button").filter((el) => el.dataset["row"] !== undefined);
        expect(rows[0]?.classList.contains("bg-canvas")).toBe(true);
        await fireEvent.keyDown(input, { key: "ArrowDown" });
        expect(rows[1]?.classList.contains("bg-canvas")).toBe(true);
        expect(rows[0]?.classList.contains("bg-canvas")).toBe(false);
    });

    it("`#` prefix surfaces the person by exact id and hides commands", async () => {
        const items: PaletteItem[] = [...tinyItems(), cmdItem("Save", 0)];
        render(CommandPalette, { items, mode: "anything", onclose: vi.fn() });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: "#BBBBB" } });
        expect(screen.getByText("Beta Jones")).toBeInTheDocument();
        expect(screen.queryByText("Alpha Smith")).toBeNull();
        expect(screen.queryByText("Save")).toBeNull();
    });

    it("`#` lookup is case-insensitive", async () => {
        const items: PaletteItem[] = [...tinyItems(), cmdItem("Save", 0)];
        render(CommandPalette, { items, mode: "anything", onclose: vi.fn() });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: "#bbbbb" } });
        expect(screen.getByText("Beta Jones")).toBeInTheDocument();
    });

    it("`#` with unknown id shows an id-specific empty state", async () => {
        const items: PaletteItem[] = [...tinyItems(), cmdItem("Save", 0)];
        render(CommandPalette, { items, mode: "anything", onclose: vi.fn() });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: "#ZZZZZ" } });
        expect(screen.getByText(/no person with id ZZZZZ/i)).toBeInTheDocument();
    });

    it("a bare id query that matches a person surfaces them at top and fires their action", async () => {
        const betaAction = vi.fn();
        const items: PaletteItem[] = [
            personItem("AAAAA", "Alpha", "Smith"),
            { ...personItem("BBBBB", "Beta", "Jones"), action: betaAction },
            cmdItem("Save", 0),
        ];
        render(CommandPalette, { items, mode: "anything", onclose: vi.fn() });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: "BBBBB" } });
        await fireEvent.keyDown(input, { key: "Enter" });
        expect(betaAction).toHaveBeenCalledTimes(1);
    });

    it("Enter on a `#` id match fires the person item's action", async () => {
        const alphaAction = vi.fn();
        const items: PaletteItem[] = [
            { ...personItem("AAAAA", "Alpha", "Smith"), action: alphaAction },
            personItem("BBBBB", "Beta", "Jones"),
            cmdItem("Save", 0),
        ];
        render(CommandPalette, { items, mode: "anything", onclose: vi.fn() });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: "#AAAAA" } });
        await fireEvent.keyDown(input, { key: "Enter" });
        expect(alphaAction).toHaveBeenCalledTimes(1);
    });
});
