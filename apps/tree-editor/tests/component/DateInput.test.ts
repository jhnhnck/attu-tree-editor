/*
 * FamilyTreeEditor - DateInput popover picker
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { DateInput } from "@attu/ui";
import type { HaracalndeDateData } from "@attu/ui";

describe("DateInput", () => {
    it("renders the formatted date in the field", () => {
        render(DateInput, {
            value: { era: "TT", year: 1234, month: 3, day: 5 } satisfies HaracalndeDateData,
            onchange: vi.fn(),
        });
        const field = screen.getByRole<HTMLInputElement>("textbox", { name: /date/i });
        expect(field.value).toBe("5-3 1234 TT");
        expect(field).toHaveAttribute("readonly");
    });

    it("shows placeholder when no value is set", () => {
        render(DateInput, { value: undefined, onchange: vi.fn(), placeholder: "set date" });
        const field = screen.getByRole<HTMLInputElement>("textbox", { name: /date/i });
        expect(field.value).toBe("");
        expect(field.placeholder).toBe("set date");
    });

    it("opens the calendar picker on click", async () => {
        render(DateInput, { value: { era: "PC", year: 1700 }, onchange: vi.fn() });
        expect(screen.queryByRole("dialog")).toBeNull();
        const field = screen.getByRole("textbox", { name: /date/i });
        await fireEvent.click(field);
        expect(screen.getByRole("dialog", { name: /calendar/i })).toBeInTheDocument();
    });

    it("commits picker selection on Done", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: { era: "PC", year: 1700 }, onchange });
        await fireEvent.click(screen.getByRole("textbox", { name: /date/i }));
        await fireEvent.click(screen.getByRole("button", { name: /day 5/i }));
        await fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
        expect(onchange).toHaveBeenCalledWith({
            era: "PC",
            year: 1700,
            month: 1,
            day: 5,
        });
    });

    it("does not commit when Cancel is clicked", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: { era: "PC", year: 1700 }, onchange });
        await fireEvent.click(screen.getByRole("textbox", { name: /date/i }));
        await fireEvent.click(screen.getByRole("button", { name: /day 5/i }));
        await fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
        expect(onchange).not.toHaveBeenCalled();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("scrolls months with the arrow buttons", async () => {
        const onchange = vi.fn();
        render(DateInput, {
            value: { era: "PC", year: 1700, month: 5, day: 10 },
            onchange,
        });
        await fireEvent.click(screen.getByRole("textbox", { name: /date/i }));
        await fireEvent.click(screen.getByRole("button", { name: /next month/i }));
        await fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
        const last = onchange.mock.calls.at(-1)?.[0] as HaracalndeDateData;
        expect(last.month).toBe(6);
    });

    it("crosses the PC/TT boundary when scrolling years backward", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: { era: "PC", year: 1, month: 1, day: 1 }, onchange });
        await fireEvent.click(screen.getByRole("textbox", { name: /date/i }));
        await fireEvent.click(screen.getByRole("button", { name: /previous year/i }));
        await fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
        const last = onchange.mock.calls.at(-1)?.[0] as HaracalndeDateData;
        expect(last.era).toBe("TT");
        expect(last.year).toBe(1);
    });

    it("toggles era via the era pill", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: { era: "PC", year: 100, month: 1, day: 1 }, onchange });
        await fireEvent.click(screen.getByRole("textbox", { name: /date/i }));
        await fireEvent.click(screen.getByRole("button", { name: /toggle era/i }));
        await fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
        const last = onchange.mock.calls.at(-1)?.[0] as HaracalndeDateData;
        expect(last.era).toBe("TT");
    });

    it("includes approximate when the checkbox is ticked in the picker", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: { era: "PC", year: 1500, month: 1, day: 1 }, onchange });
        await fireEvent.click(screen.getByRole("textbox", { name: /date/i }));
        const approx = screen.getByRole("checkbox", { name: /approximate/i });
        await fireEvent.click(approx);
        await fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
        const last = onchange.mock.calls.at(-1)?.[0] as HaracalndeDateData;
        expect(last.approximate).toBe(true);
    });

    it("switches to manual text entry on second click and commits a parsed date", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: undefined, onchange });
        const field = screen.getByRole<HTMLInputElement>("textbox", { name: /date/i });
        await fireEvent.click(field);
        await fireEvent.click(field); // second click → manual mode
        expect(field).not.toHaveAttribute("readonly");
        await fireEvent.input(field, { target: { value: "15-3 1700 PC" } });
        await fireEvent.keyDown(field, { key: "Enter" });
        expect(onchange).toHaveBeenLastCalledWith({
            era: "PC",
            year: 1700,
            month: 3,
            day: 15,
        });
    });

    it("clears the value when manual text is emptied", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: { era: "PC", year: 1700 }, onchange });
        const field = screen.getByRole<HTMLInputElement>("textbox", { name: /date/i });
        await fireEvent.click(field);
        await fireEvent.click(field);
        await fireEvent.input(field, { target: { value: "" } });
        await fireEvent.keyDown(field, { key: "Enter" });
        expect(onchange).toHaveBeenLastCalledWith(undefined);
    });

    it("shows an error and does not emit when manual text is invalid", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: undefined, onchange });
        const field = screen.getByRole<HTMLInputElement>("textbox", { name: /date/i });
        await fireEvent.click(field);
        await fireEvent.click(field);
        await fireEvent.input(field, { target: { value: "not a date" } });
        await fireEvent.keyDown(field, { key: "Enter" });
        expect(onchange).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent(/invalid date/i);
    });

    it("keyboard focus drops the field into manual edit mode so typing works", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: { era: "PC", year: 1700 }, onchange });
        const field = screen.getByRole<HTMLInputElement>("textbox", { name: /date/i });
        // simulate a tab into the field (focus without a preceding pointerdown)
        await fireEvent.focus(field);
        expect(field).not.toHaveAttribute("readonly");
        await fireEvent.input(field, { target: { value: "15-3 1700 PC" } });
        await fireEvent.keyDown(field, { key: "Enter" });
        expect(onchange).toHaveBeenLastCalledWith({
            era: "PC",
            year: 1700,
            month: 3,
            day: 15,
        });
    });

    it("ArrowDown from a focused closed field opens the picker", async () => {
        render(DateInput, { value: { era: "PC", year: 1700 }, onchange: vi.fn() });
        const field = screen.getByRole<HTMLInputElement>("textbox", { name: /date/i });
        await fireEvent.focus(field);
        // focus dropped us into manual; ArrowDown should still open the picker
        await fireEvent.keyDown(field, { key: "ArrowDown" });
        expect(screen.getByRole("dialog", { name: /calendar/i })).toBeInTheDocument();
    });

    it("pointer focus does not auto-open manual mode (click still opens picker)", async () => {
        render(DateInput, { value: { era: "PC", year: 1700 }, onchange: vi.fn() });
        const field = screen.getByRole<HTMLInputElement>("textbox", { name: /date/i });
        // mouse path: pointerdown precedes focus precedes click
        await fireEvent.pointerDown(field);
        await fireEvent.focus(field);
        await fireEvent.click(field);
        expect(screen.getByRole("dialog", { name: /calendar/i })).toBeInTheDocument();
    });
});
