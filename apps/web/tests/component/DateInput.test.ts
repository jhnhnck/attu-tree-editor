/*
 * FamilyTreeEditor - DateInput structured picker
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import DateInput from "$lib/components/form/DateInput.svelte";
import type { HaracalndeDateData } from "$lib/date/HaracalndeDate";

describe("DateInput", () => {
    it("populates year and era from the initial value", () => {
        render(DateInput, {
            value: { era: "TT", year: 1234 } satisfies HaracalndeDateData,
            onchange: vi.fn(),
        });
        const year = screen.getByRole<HTMLInputElement>("textbox", { name: /year/i });
        expect(year.value).toBe("1234");
        const era = screen.getByRole<HTMLSelectElement>("combobox", { name: /era/i });
        expect(era.value).toBe("TT");
    });

    it("emits onchange when a valid year is typed", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: undefined, onchange });
        const year = screen.getByRole("textbox", { name: /year/i });
        await fireEvent.input(year, { target: { value: "1500" } });
        expect(onchange).toHaveBeenCalledWith({ era: "PC", year: 1500 });
    });

    it("emits undefined when the year field is cleared", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: { era: "PC", year: 1234 }, onchange });
        const year = screen.getByRole("textbox", { name: /year/i });
        await fireEvent.input(year, { target: { value: "" } });
        expect(onchange).toHaveBeenCalledWith(undefined);
    });

    it("shows a year error and does not emit when year is invalid", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: undefined, onchange });
        const year = screen.getByRole("textbox", { name: /year/i });
        await fireEvent.input(year, { target: { value: "0" } });
        expect(onchange).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent(/year must be/i);
        expect(year).toHaveAttribute("aria-invalid", "true");
    });

    it("includes month and day in the emitted value when selected", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: { era: "PC", year: 1700 }, onchange });
        const month = screen.getByRole("combobox", { name: /month/i });
        await fireEvent.change(month, { target: { value: "3" } });
        const day = screen.getByRole("combobox", { name: /day/i });
        await fireEvent.change(day, { target: { value: "5" } });
        const last = onchange.mock.calls.at(-1)?.[0] as HaracalndeDateData;
        expect(last).toMatchObject({ era: "PC", year: 1700, month: 3, day: 5 });
    });

    it("sets approximate when the ~ checkbox is ticked", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: { era: "PC", year: 1500 }, onchange });
        const approx = screen.getByRole("checkbox", { name: /approximate/i });
        await fireEvent.change(approx, { target: { checked: true } });
        const last = onchange.mock.calls.at(-1)?.[0] as HaracalndeDateData;
        expect(last.approximate).toBe(true);
    });

    it("clears day when month is reset to blank", async () => {
        const onchange = vi.fn();
        render(DateInput, {
            value: { era: "PC", year: 1700, month: 3, day: 15 },
            onchange,
        });
        const month = screen.getByRole("combobox", { name: /month/i });
        await fireEvent.change(month, { target: { value: "" } });
        const last = onchange.mock.calls.at(-1)?.[0] as HaracalndeDateData;
        expect(last.month).toBeUndefined();
        expect(last.day).toBeUndefined();
    });
});
