/*
 * FamilyTreeEditor - Inspector right-sidebar: focus a person, edit fields, switch tabs
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import Inspector from "$lib/components/inspector/Inspector.svelte";
import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";
import type { Person, Tree } from "$lib/domain/types";

function person(over: Partial<Person> = {}): Person {
    return {
        id: "AAAAA",
        given: "Alpha",
        surname: "X",
        gender: "m",
        spouseIds: [],
        display: "z1",
        ...over,
    };
}

function tree(overrides: Partial<Tree> = {}): Tree {
    const a = person({ id: "AAAAA", given: "Alpha" });
    const b = person({ id: "BBBBB", given: "Beta", gender: "f" });
    return {
        id: "test-tree",
        name: "Test",
        rootId: "AAAAA",
        people: { AAAAA: a, BBBBB: b },
        couples: [],
        rev: 0,
        updatedAt: Date.now(),
        ...overrides,
    };
}

const portraitUrls: PortraitUrlCache = {
    get: () => undefined,
    request: () => undefined,
    prime: () => undefined,
    invalidate: () => undefined,
    clear: () => undefined,
};

function baseProps() {
    return {
        treeId: "test-tree",
        portraitUrls,
        onpatch: vi.fn(),
        onsetParent: vi.fn(),
        onunsetParent: vi.fn(),
        onaddPartner: vi.fn(),
        onremovePartner: vi.fn(),
        onaddChild: vi.fn(),
        onremoveChild: vi.fn(),
        oncreateAndLink: vi.fn(),
        onselect: vi.fn(),
        onpatchCouple: vi.fn(),
        onduplicate: vi.fn(),
        onsetRoot: vi.fn(),
        ondelete: vi.fn(),
        onclose: vi.fn(),
    };
}

describe("Inspector", () => {
    it("renders the empty-state tree summary when nothing is selected", () => {
        const t = tree();
        render(Inspector, { ...baseProps(), tree: t, selectedId: undefined });
        expect(screen.getByText("Test")).toBeInTheDocument();
        expect(screen.getByText("tree summary")).toBeInTheDocument();
        expect(screen.getByText("people")).toBeInTheDocument();
    });

    it("renders the Personal tab with the person's name + id when one is selected", () => {
        const t = tree();
        render(Inspector, { ...baseProps(), tree: t, selectedId: "AAAAA" });
        expect(screen.getByText("Alpha X")).toBeInTheDocument();
        expect(screen.getByText("id AAAAA")).toBeInTheDocument();
        expect(screen.getByLabelText("given")).toHaveValue("Alpha");
        expect(screen.getByLabelText("surname")).toHaveValue("X");
    });

    it("commits a name change via blur (auto-commit, no Save button)", async () => {
        const props = baseProps();
        const t = tree();
        render(Inspector, { ...props, tree: t, selectedId: "AAAAA" });

        const given = screen.getByLabelText<HTMLInputElement>("given");
        await fireEvent.input(given, { target: { value: "Renamed" } });
        await fireEvent.blur(given);

        expect(props.onpatch).toHaveBeenCalledWith("AAAAA", { given: "Renamed" });
    });

    it("commits gender change immediately on select", async () => {
        const props = baseProps();
        const t = tree();
        render(Inspector, { ...props, tree: t, selectedId: "AAAAA" });

        const gender = screen.getByLabelText<HTMLSelectElement>("gender");
        await fireEvent.change(gender, { target: { value: "f" } });

        expect(props.onpatch).toHaveBeenCalledWith("AAAAA", { gender: "f" });
    });

    it("opens the Connections tab and shows mother / father slots empty", async () => {
        const t = tree();
        render(Inspector, { ...baseProps(), tree: t, selectedId: "AAAAA" });

        await fireEvent.click(screen.getByRole("tab", { name: /Connections/i }));

        expect(screen.getByText("parents")).toBeInTheDocument();
        expect(screen.getByText(/mother/i)).toBeInTheDocument();
        expect(screen.getByText(/father/i)).toBeInTheDocument();
    });

    it("close button fires onclose", async () => {
        const props = baseProps();
        const t = tree();
        render(Inspector, { ...props, tree: t, selectedId: "AAAAA" });

        await fireEvent.click(screen.getByRole("button", { name: /close inspector/i }));
        expect(props.onclose).toHaveBeenCalled();
    });
});
