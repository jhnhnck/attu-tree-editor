/*
 * FamilyTreeEditor - ShareDialog: copy view-link, list/revoke grants
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";

vi.mock("$lib/api/client", () => ({
    trees: {
        listGrants: vi.fn(),
        addGrant: vi.fn(),
        revokeGrant: vi.fn(),
    },
}));

import ShareDialog from "$lib/components/shell/ShareDialog.svelte";
import { trees as treesApi } from "$lib/api/client";

const mockedList = vi.mocked(treesApi.listGrants);
const mockedRevoke = vi.mocked(treesApi.revokeGrant);

describe("ShareDialog", () => {
    beforeEach(() => {
        mockedList.mockReset();
        mockedList.mockResolvedValue({ grants: [] });
        mockedRevoke.mockReset();
        mockedRevoke.mockResolvedValue(undefined);
    });

    it("copies the view link to the clipboard when 'copy' is clicked", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });

        render(ShareDialog, { treeId: "tree-123", onClose: vi.fn() });
        const btn = screen.getByTestId("copy-view-link");
        await fireEvent.click(btn);
        // microtasks for the async clipboard write
        await Promise.resolve();
        await Promise.resolve();

        expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/view\/tree-123$/));
        expect(await screen.findByText(/copied!/i)).toBeInTheDocument();
    });

    it("renders existing grants and revoke calls the api", async () => {
        mockedList.mockResolvedValue({
            grants: [
                {
                    user_id: "u1",
                    discord_id: "111",
                    display_name: "Alice",
                    role: "editor",
                },
            ],
        });
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

        render(ShareDialog, { treeId: "t", onClose: vi.fn() });
        // wait for onMount + listGrants
        await Promise.resolve();
        await Promise.resolve();
        expect(await screen.findByText("Alice")).toBeInTheDocument();

        const revokeBtn = screen.getByRole("button", { name: /revoke alice/i });
        await fireEvent.click(revokeBtn);
        expect(mockedRevoke).toHaveBeenCalledWith("t", "u1");
        confirmSpy.mockRestore();
    });
});
