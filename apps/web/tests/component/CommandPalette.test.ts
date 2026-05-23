/*
 * FamilyTreeEditor - CommandPalette: empty state, fuzzy match, prefix toggles, keyboard nav
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import CommandPalette from "$lib/components/palette/CommandPalette.svelte";
import type { Command } from "$lib/components/palette/commands";
import type { Person, Tree } from "$lib/domain/types";

beforeAll(() => {
    // jsdom doesn't implement Element.scrollIntoView — the palette calls it
    // after every arrow-key nav. stub it as a no-op so the keydown handler
    // doesn't throw.
    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = vi.fn();
    }
});

function person(over: Partial<Person> = {}): Person {
    return {
        id: "AAAAA",
        given: "Alpha",
        surname: "Smith",
        gender: "m",
        spouseIds: [],
        display: "z1",
        ...over,
    };
}

function tinyTree(): Tree {
    const a = person({ id: "AAAAA", given: "Alpha", surname: "Smith" });
    const b = person({ id: "BBBBB", given: "Beta", surname: "Jones", gender: "f" });
    return {
        id: "t",
        name: "T",
        rootId: "AAAAA",
        people: { AAAAA: a, BBBBB: b },
        couples: [],
        editRev: 0,
        updatedAt: 0,
    };
}

function cmds(...labels: string[]): Command[] {
    return labels.map((label, i) => ({
        id: `cmd.${String(i)}.${label.toLowerCase().replace(/\W+/g, "")}`,
        label,
        group: "Other",
        run: vi.fn(),
    }));
}

describe("CommandPalette", () => {
    it("renders rows for the empty input (people + commands)", () => {
        const onpick = vi.fn();
        const onclose = vi.fn();
        render(CommandPalette, {
            tree: tinyTree(),
            commands: cmds("Save", "Open"),
            mode: "anything",
            onpick,
            onclose,
        });
        // both people and both commands appear
        expect(screen.getByText("Alpha Smith")).toBeInTheDocument();
        expect(screen.getByText("Beta Jones")).toBeInTheDocument();
        expect(screen.getByText("Save")).toBeInTheDocument();
        expect(screen.getByText("Open")).toBeInTheDocument();
    });

    it("typing a command name filters the list to matching commands", async () => {
        const onpick = vi.fn();
        render(CommandPalette, {
            tree: tinyTree(),
            commands: cmds("Save tree", "Open dialog"),
            mode: "commands",
            onpick,
            onclose: vi.fn(),
        });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: "save" } });
        expect(screen.getByText("Save tree")).toBeInTheDocument();
        expect(screen.queryByText("Open dialog")).toBeNull();
    });

    it("`@` prefix swaps the view to people-only", async () => {
        render(CommandPalette, {
            tree: tinyTree(),
            commands: cmds("Save"),
            mode: "anything",
            onpick: vi.fn(),
            onclose: vi.fn(),
        });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: "@" } });
        expect(screen.getByText("Alpha Smith")).toBeInTheDocument();
        expect(screen.queryByText("Save")).toBeNull();
    });

    it("`>` prefix swaps the view to commands-only", async () => {
        render(CommandPalette, {
            tree: tinyTree(),
            commands: cmds("Save"),
            mode: "anything",
            onpick: vi.fn(),
            onclose: vi.fn(),
        });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: ">" } });
        expect(screen.getByText("Save")).toBeInTheDocument();
        expect(screen.queryByText("Alpha Smith")).toBeNull();
    });

    it("Enter on the highlighted row fires onpick with the row's kind + id", async () => {
        const onpick = vi.fn();
        render(CommandPalette, {
            tree: tinyTree(),
            commands: cmds("Save"),
            mode: "commands",
            onpick,
            onclose: vi.fn(),
        });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.input(input, { target: { value: "save" } });
        await fireEvent.keyDown(input, { key: "Enter" });
        expect(onpick).toHaveBeenCalledTimes(1);
        const call = onpick.mock.calls[0] as [string, string] | undefined;
        expect(call?.[0]).toBe("command");
        expect(call?.[1]).toMatch(/^cmd\./);
    });

    it("Esc fires onclose", async () => {
        const onclose = vi.fn();
        render(CommandPalette, {
            tree: tinyTree(),
            commands: cmds("Save"),
            mode: "commands",
            onpick: vi.fn(),
            onclose,
        });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.keyDown(input, { key: "Escape" });
        expect(onclose).toHaveBeenCalled();
    });

    it("on open, no row carries the bg-canvas highlight class", () => {
        // matches Menu's behaviour: the first row is only highlighted after the
        // user explicitly presses ↑/↓ or hovers a row with the mouse
        render(CommandPalette, {
            tree: tinyTree(),
            commands: cmds("Save"),
            mode: "commands",
            onpick: vi.fn(),
            onclose: vi.fn(),
        });
        const row = screen.getByText("Save").closest("button");
        // class:bg-canvas adds it as a standalone token; check against classList
        expect(row?.classList.contains("bg-canvas")).toBe(false);
    });

    it("first ArrowDown highlights row 0; second ArrowDown moves to row 1", async () => {
        render(CommandPalette, {
            tree: tinyTree(),
            commands: cmds("Save", "Open"),
            mode: "commands",
            onpick: vi.fn(),
            onclose: vi.fn(),
        });
        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        await fireEvent.keyDown(input, { key: "ArrowDown" });
        const rows = screen.getAllByRole("button").filter((el) => el.dataset["row"] !== undefined);
        expect(rows[0]?.classList.contains("bg-canvas")).toBe(true);
        await fireEvent.keyDown(input, { key: "ArrowDown" });
        expect(rows[1]?.classList.contains("bg-canvas")).toBe(true);
        expect(rows[0]?.classList.contains("bg-canvas")).toBe(false);
    });
});
