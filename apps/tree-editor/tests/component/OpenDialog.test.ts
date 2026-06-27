/*
 * FamilyTreeEditor - OpenDialog: list, search, preview, open/delete
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import OpenDialog from "$lib/components/shell/OpenDialog.svelte";
import type { TreeListing } from "$lib/persistence/trees";
import { dockStore } from "@attu/ui";

// loadTree is called on selection to fetch the preview; stub it per-test
vi.mock("$lib/persistence/trees", async () => {
    const actual =
        await vi.importActual<typeof import("$lib/persistence/trees")>("$lib/persistence/trees");
    return {
        ...actual,
        loadTree: vi.fn(),
    };
});

import { loadTree } from "$lib/persistence/trees";
import { ok } from "@attu/ui";
import type { Tree } from "$lib/domain/types";

const mockedLoad = vi.mocked(loadTree);

function listing(id: string, name: string, count: number, ageMs: number): TreeListing {
    return {
        id,
        name,
        editRev: 1,
        updatedAt: Date.now() - ageMs,
        personCount: count,
    };
}

function tree(id: string, names: string[]): Tree {
    const people = Object.fromEntries(
        names.map((n, i) => [
            `P${String(i)}`,
            {
                id: `P${String(i)}`,
                given: n,
                surname: "X",
                gender: "u" as const,
                spouseIds: [],
                display: "z1" as const,
            },
        ]),
    );
    return {
        id,
        name: names[0] ?? "untitled",
        rootId: "P0",
        people,
        couples: [],
        editRev: 1,
        updatedAt: Date.now(),
    };
}

function baseProps() {
    return {
        listings: [] as TreeListing[],
        activeId: undefined as string | undefined,
        onpick: vi.fn(),
        ondelete: vi.fn(),
    };
}

describe("OpenDialog", () => {
    beforeEach(() => {
        mockedLoad.mockReset();
        mockedLoad.mockResolvedValue(
            ok({ tree: tree("t1", ["Alpha", "Beta", "Gamma"]), savedAt: Date.now() }),
        );
        dockStore.resetForTest();
    });

    it("renders 'no saved trees yet' when the list is empty", () => {
        render(OpenDialog, baseProps());
        expect(screen.getByText(/no saved trees yet/i)).toBeInTheDocument();
    });

    it("renders one row per listing", () => {
        const listings = [
            listing("a", "Alpha tree", 3, 60_000),
            listing("b", "Beta tree", 5, 120_000),
        ];
        render(OpenDialog, { ...baseProps(), listings });
        // Alpha may also appear in the right-pane preview header; use getAllByText
        expect(screen.getAllByText("Alpha tree").length).toBeGreaterThan(0);
        expect(screen.getByText("Beta tree")).toBeInTheDocument();
    });

    it("filters listings by search query", async () => {
        const listings = [
            listing("a", "Alpha tree", 3, 60_000),
            listing("b", "Beta tree", 5, 120_000),
        ];
        render(OpenDialog, { ...baseProps(), listings });
        const search = screen.getByLabelText<HTMLInputElement>("search trees");
        await fireEvent.input(search, { target: { value: "beta" } });
        expect(screen.getByText("Beta tree")).toBeInTheDocument();
        // Alpha tree row should be filtered out; the preview header may still
        // show "Alpha tree" (initial selection persists), so look for a row
        const rows = screen
            .queryAllByTestId("open-row")
            .map((el) => el.getAttribute("data-tree-id"));
        expect(rows).toEqual(["b"]);
    });

    it("clicking a row triggers preview load and shows root + sample names", async () => {
        const listings = [
            listing("a", "Alpha tree", 3, 60_000),
            listing("b", "Beta tree", 5, 120_000),
        ];
        mockedLoad.mockResolvedValue(
            ok({ tree: tree("b", ["Bart", "Lisa", "Maggie"]), savedAt: Date.now() }),
        );
        render(OpenDialog, { ...baseProps(), listings });
        const rowB = screen.getByText("Beta tree");
        await fireEvent.click(rowB);
        expect(mockedLoad).toHaveBeenCalledWith("b");
        // Bart X appears both as root and as the first sample name
        const matches = await screen.findAllByText("Bart X");
        expect(matches.length).toBeGreaterThan(0);
        expect(screen.getByText("Lisa X")).toBeInTheDocument();
    });

    it("Open button calls onpick with the selected id and closes the modal", async () => {
        const props = baseProps();
        const listings = [listing("a", "Alpha", 3, 60_000)];
        const closeModal = vi.spyOn(dockStore, "closeModal");
        render(OpenDialog, { ...props, listings, activeId: "a" });
        const openBtn = screen.getByRole("button", { name: /^open$/i });
        await fireEvent.click(openBtn);
        expect(props.onpick).toHaveBeenCalledWith("a");
        expect(closeModal).toHaveBeenCalled();
        closeModal.mockRestore();
    });

    it("Delete confirms then calls ondelete", async () => {
        const props = baseProps();
        const listings = [listing("a", "Alpha", 3, 60_000)];
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        render(OpenDialog, { ...props, listings, activeId: "a" });
        const delBtn = screen.getByRole("button", { name: /delete/i });
        await fireEvent.click(delBtn);
        expect(confirmSpy).toHaveBeenCalled();
        expect(props.ondelete).toHaveBeenCalledWith("a");
        confirmSpy.mockRestore();
    });

    it("Delete with confirm=false does NOT call ondelete", async () => {
        const props = baseProps();
        const listings = [listing("a", "Alpha", 3, 60_000)];
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
        render(OpenDialog, { ...props, listings, activeId: "a" });
        const delBtn = screen.getByRole("button", { name: /delete/i });
        await fireEvent.click(delBtn);
        expect(props.ondelete).not.toHaveBeenCalled();
        confirmSpy.mockRestore();
    });

    it("Cancel calls dockStore.closeModal", async () => {
        const props = baseProps();
        const closeModal = vi.spyOn(dockStore, "closeModal");
        render(OpenDialog, { ...props, listings: [listing("a", "A", 1, 1000)] });
        await fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
        expect(closeModal).toHaveBeenCalled();
        closeModal.mockRestore();
    });

    it("'Open from URL' fires onnotice (stub)", async () => {
        const props = baseProps();
        const onnotice = vi.fn();
        render(OpenDialog, { ...props, onnotice, listings: [listing("a", "A", 1, 1000)] });
        await fireEvent.click(screen.getByTestId("open-from-url"));
        expect(onnotice).toHaveBeenCalledWith(expect.stringMatching(/coming soon/i));
    });
});
