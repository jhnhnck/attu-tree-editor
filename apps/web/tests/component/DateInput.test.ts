/*
 * FamilyTreeEditor - DateInput parses narrative input on blur and surfaces errors
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import DateInput from "$lib/components/form/DateInput.svelte";
import type { HaracalndeDateData } from "$lib/date/HaracalndeDate";

describe("DateInput", () => {
    it("renders the existing value as narrative text", () => {
        render(DateInput, {
            value: { era: "PC", year: 1234 } satisfies HaracalndeDateData,
            onchange: vi.fn(),
        });
        const input = screen.getByRole<HTMLInputElement>("textbox");
        expect(input.value).toBe("1234 PC");
    });

    it("dispatches onchange with parsed data on blur", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: undefined, onchange });
        const input = screen.getByRole<HTMLInputElement>("textbox");
        await fireEvent.input(input, { target: { value: "ABT 1500 PC" } });
        await fireEvent.blur(input);
        expect(onchange).toHaveBeenCalledWith({
            era: "PC",
            year: 1500,
            approximate: true,
        });
    });

    it("emits undefined when the field is cleared", async () => {
        const onchange = vi.fn();
        render(DateInput, {
            value: { era: "PC", year: 1234 },
            onchange,
        });
        const input = screen.getByRole<HTMLInputElement>("textbox");
        await fireEvent.input(input, { target: { value: "   " } });
        await fireEvent.blur(input);
        expect(onchange).toHaveBeenCalledWith(undefined);
    });

    it("shows an error and does not emit on a malformed value", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: undefined, onchange });
        const input = screen.getByRole<HTMLInputElement>("textbox");
        await fireEvent.input(input, { target: { value: "not a date" } });
        await fireEvent.blur(input);
        expect(onchange).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent(/expected/i);
        expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it("commits on Enter without waiting for blur", async () => {
        const onchange = vi.fn();
        render(DateInput, { value: undefined, onchange });
        const input = screen.getByRole<HTMLInputElement>("textbox");
        await fireEvent.input(input, { target: { value: "5-3 1700 TT" } });
        await fireEvent.keyDown(input, { key: "Enter" });
        expect(onchange).toHaveBeenCalledWith({
            era: "TT",
            year: 1700,
            month: 3,
            day: 5,
        });
    });
});
