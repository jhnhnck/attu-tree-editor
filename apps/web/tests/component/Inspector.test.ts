/*
 * FamilyTreeEditor - Inspector right-sidebar: focus a person, edit fields, switch tabs
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
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
        editRev: 0,
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

    it("renders the Personal tab with the person's name when one is selected", () => {
        const t = tree();
        render(Inspector, { ...baseProps(), tree: t, selectedId: "AAAAA" });
        expect(screen.getByText("Alpha X")).toBeInTheDocument();
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

    it("commits gender identity change immediately on blur", async () => {
        // Phase 5 (relationship-vocabulary): PersonalTab replaced the legacy
        // gender select with a struct-driven identity input. The patch
        // carries a GenderStruct now, not a single-character code.
        const props = baseProps();
        const t = tree();
        render(Inspector, { ...props, tree: t, selectedId: "AAAAA" });

        const identity = screen.getByLabelText<HTMLInputElement>("gender identity");
        await fireEvent.input(identity, { target: { value: "female" } });
        await fireEvent.blur(identity);

        expect(props.onpatch).toHaveBeenCalledWith("AAAAA", {
            gender: { identity: "female" },
        });
    });

    it("opens the Connections tab and shows the parents section with add-parent affordance", async () => {
        const t = tree();
        render(Inspector, { ...baseProps(), tree: t, selectedId: "AAAAA" });

        await fireEvent.click(screen.getByRole("tab", { name: /Connections/i }));

        expect(screen.getByText("parents")).toBeInTheDocument();
        // no parents set yet — unified loop emits no rows, add-parent button is always present
        expect(screen.getByRole("button", { name: /add parent/i })).toBeInTheDocument();
    });

    it("close button fires onclose", async () => {
        const props = baseProps();
        const t = tree();
        render(Inspector, { ...props, tree: t, selectedId: "AAAAA" });

        await fireEvent.click(screen.getByRole("button", { name: /close inspector/i }));
        expect(props.onclose).toHaveBeenCalled();
    });

    describe("scroll containment", () => {
        // regression: the inspector must scroll its own tab body, not push
        // the page height past the viewport. the aside owns the height
        // bound (min-h-0 + overflow-hidden); the tab body inside is the
        // actual scroll surface (min-h-0 + overflow-y-auto). without the
        // min-h-0 the flex parent ignores the overflow rule and the
        // content forces the aside to grow.
        it("aside is height-constrained and clips its overflow", () => {
            render(Inspector, { ...baseProps(), tree: tree(), selectedId: "AAAAA" });
            const aside = screen.getByLabelText("person inspector");
            expect(aside.classList.contains("min-h-0")).toBe(true);
            expect(aside.classList.contains("overflow-hidden")).toBe(true);
            expect(aside.classList.contains("flex-col")).toBe(true);
        });

        it("the tab body inside the aside is the scroll surface", () => {
            render(Inspector, { ...baseProps(), tree: tree(), selectedId: "AAAAA" });
            const panel = document.getElementById("inspector-panel");
            expect(panel).not.toBeNull();
            expect(panel?.classList.contains("min-h-0")).toBe(true);
            expect(panel?.classList.contains("flex-1")).toBe(true);
            expect(panel?.classList.contains("overflow-y-auto")).toBe(true);
        });

        it("empty-state summary panel also bounds and scrolls itself", () => {
            render(Inspector, { ...baseProps(), tree: tree(), selectedId: undefined });
            const aside = screen.getByLabelText("person inspector");
            expect(aside.classList.contains("min-h-0")).toBe(true);
            expect(aside.classList.contains("overflow-hidden")).toBe(true);
            // empty-state scroll surface is the sibling div with the summary dl
            const summary = screen.getByText("people").closest("div");
            expect(summary?.classList.contains("min-h-0")).toBe(true);
            expect(summary?.classList.contains("overflow-y-auto")).toBe(true);
        });
    });

    describe("header more-actions menu", () => {
        // user-event simulates the full pointerdown -> pointerup -> click
        // sequence. the inspector registers a capture-phase pointerdown
        // listener on window that closes the menu when it fires outside
        // menuEl, so each item handler must survive a real pointer
        // interaction.
        async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
            await user.click(screen.getByRole("button", { name: /more actions/i }));
        }

        it("fires onduplicate when Duplicate person is clicked", async () => {
            const user = userEvent.setup();
            const props = baseProps();
            render(Inspector, { ...props, tree: tree(), selectedId: "AAAAA" });
            await openMenu(user);
            await user.click(screen.getByRole("button", { name: /duplicate person/i }));
            expect(props.onduplicate).toHaveBeenCalledWith("AAAAA");
        });

        it("fires onsetRoot when Set as tree root is clicked", async () => {
            const user = userEvent.setup();
            const props = baseProps();
            render(Inspector, { ...props, tree: tree(), selectedId: "AAAAA" });
            await openMenu(user);
            await user.click(screen.getByRole("button", { name: /set as tree root/i }));
            expect(props.onsetRoot).toHaveBeenCalledWith("AAAAA");
        });

        it("writes the selected person's id to the clipboard when Copy ID is clicked", async () => {
            const user = userEvent.setup();
            const props = baseProps();
            const writeText = vi.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: { writeText },
            });
            render(Inspector, { ...props, tree: tree(), selectedId: "AAAAA" });
            await openMenu(user);
            await user.click(screen.getByRole("button", { name: /copy id/i }));
            expect(writeText).toHaveBeenCalledWith("AAAAA");
        });

        it("fires ondelete when Delete person is clicked", async () => {
            const user = userEvent.setup();
            const props = baseProps();
            render(Inspector, { ...props, tree: tree(), selectedId: "AAAAA" });
            await openMenu(user);
            await user.click(screen.getByRole("button", { name: /delete person/i }));
            expect(props.ondelete).toHaveBeenCalledWith("AAAAA");
        });
    });
});
