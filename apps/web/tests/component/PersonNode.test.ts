/*
 * FamilyTreeEditor - PersonNode renders content per detail level + gender tint
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import PersonNode from "$lib/components/tree/PersonNode.svelte";
import type { Person } from "$lib/domain/types";

function person(overrides: Partial<Person> = {}): Person {
    return {
        id: "AAAAA",
        given: "Alpha",
        surname: "Bravo",
        gender: "u",
        spouseIds: [],
        display: "z1",
        birth: { era: "PC", year: 1500 },
        death: { era: "PC", year: 1570 },
        ...overrides,
    };
}

describe("PersonNode", () => {
    it("at level 0, shows full name and date range without a portrait when none is set", () => {
        render(PersonNode, { person: person() });
        const btn = screen.getByRole("button");
        expect(btn).toHaveTextContent("Alpha Bravo");
        expect(btn).toHaveTextContent("1500 - 1570 PC");
        expect(document.querySelector("img")).toBeNull();
    });

    it("stamps the era on both sides when birth and death cross the PC/TT boundary", () => {
        render(PersonNode, {
            person: person({
                birth: { era: "TT", year: 50 },
                death: { era: "PC", year: 25 },
            }),
        });
        expect(screen.getByRole("button")).toHaveTextContent("50 TT - 25 PC");
    });

    it("includes the era on a single-sided date", () => {
        const p = person({ birth: { era: "PC", year: 1234 } });
        delete p.death;
        render(PersonNode, { person: p });
        expect(screen.getByRole("button")).toHaveTextContent("b. 1234 PC");
    });

    it("at level 0 with a portraitUrl, renders the image", () => {
        render(PersonNode, { person: person(), portraitUrl: "blob:abc" });
        const img = document.querySelector<HTMLImageElement>("img");
        expect(img?.getAttribute("src")).toBe("blob:abc");
    });

    it("at level 1 drops the portrait but keeps name + dates", () => {
        render(PersonNode, { person: person(), level: 1 });
        const btn = screen.getByRole("button");
        expect(btn).toHaveTextContent("Alpha Bravo");
        expect(btn).toHaveTextContent("1500 - 1570 PC");
    });

    it("at level 2 shows just the full name", () => {
        render(PersonNode, { person: person(), level: 2 });
        const btn = screen.getByRole("button");
        expect(btn).toHaveTextContent("Alpha Bravo");
        expect(btn).not.toHaveTextContent("1500");
    });

    it("at level 3 shows the surname only", () => {
        render(PersonNode, { person: person(), level: 3 });
        const btn = screen.getByRole("button");
        expect(btn).toHaveTextContent("Bravo");
        expect(btn).not.toHaveTextContent("Alpha");
    });

    it("at level 4 shows initials only", () => {
        render(PersonNode, { person: person(), level: 4 });
        const btn = screen.getByRole("button");
        expect(btn).toHaveTextContent("AB");
        expect(btn).not.toHaveTextContent("Alpha");
    });

    it("at level 5 the box is empty", () => {
        render(PersonNode, { person: person(), level: 5 });
        const btn = screen.getByRole("button");
        expect(btn.textContent?.trim() ?? "").toBe("");
    });

    it("paints male tint blue", () => {
        render(PersonNode, { person: person({ gender: "m" }) });
        expect(document.querySelector(".bg-sky-700\\/35")).not.toBeNull();
    });

    it("paints female tint red", () => {
        render(PersonNode, { person: person({ gender: "f" }) });
        expect(document.querySelector(".bg-rose-700\\/35")).not.toBeNull();
    });

    it("paints unknown tint amber", () => {
        render(PersonNode, { person: person({ gender: "u" }) });
        expect(document.querySelector(".bg-amber-600\\/30")).not.toBeNull();
    });

    it("applies the faded class for z0 display", () => {
        render(PersonNode, { person: person({ display: "z0" }) });
        expect(document.querySelector(".is-faded")).not.toBeNull();
    });

    it("dispatches onselect on single click", async () => {
        const onselect = vi.fn();
        render(PersonNode, { person: person(), onselect });
        await fireEvent.click(screen.getByRole("button"));
        expect(onselect).toHaveBeenCalledWith("AAAAA");
    });

    it("dispatches onedit on double click", async () => {
        const onedit = vi.fn();
        render(PersonNode, { person: person(), onedit });
        await fireEvent.dblClick(screen.getByRole("button"));
        expect(onedit).toHaveBeenCalledWith("AAAAA");
    });

    it("falls back to (unnamed) at level 0 when given+surname are blank", () => {
        render(PersonNode, { person: person({ given: "", surname: "" }) });
        expect(screen.getByRole("button")).toHaveTextContent("(unnamed)");
    });
});
