/*
 * FamilyTreeEditor - PersonEditor opens for a Person, dispatches a save patch
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import PersonEditor from "$lib/components/editor/PersonEditor.svelte";
import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";
import type { Person } from "$lib/domain/types";

function person(): Person {
    return {
        id: "AAAAA",
        given: "Alpha",
        surname: "X",
        gender: "m",
        spouseIds: [],
        display: "z1",
    };
}

const portraitUrls: PortraitUrlCache = {
    get: () => undefined,
    request: () => undefined,
    invalidate: () => undefined,
    clear: () => undefined,
};

const editorBaseProps = { treeId: "test-tree", portraitUrls };

// jsdom does not implement <dialog> showModal/close; stub them so the editor
// can drive the open/close lifecycle the same way it does in a real browser
beforeAll(() => {
    if (typeof HTMLDialogElement === "undefined") return;
    const proto = HTMLDialogElement.prototype;
    if (typeof proto.showModal !== "function") {
        proto.showModal = function () {
            this.setAttribute("open", "");
            (this as unknown as { open: boolean }).open = true;
        };
    }
    if (typeof proto.close !== "function") {
        proto.close = function () {
            this.removeAttribute("open");
            (this as unknown as { open: boolean }).open = false;
            this.dispatchEvent(new Event("close"));
        };
    }
});

describe("PersonEditor", () => {
    it("renders fields seeded from the supplied Person", () => {
        render(PersonEditor, {
            ...editorBaseProps,
            person: person(),
            onsave: vi.fn(),
            onclose: vi.fn(),
        });
        expect(screen.getByLabelText("given")).toHaveValue("Alpha");
        expect(screen.getByLabelText("surname")).toHaveValue("X");
    });

    it("dispatches onsave with the edited fields and closes", async () => {
        const onsave = vi.fn();
        const onclose = vi.fn();
        render(PersonEditor, { ...editorBaseProps, person: person(), onsave, onclose });

        const given = screen.getByLabelText<HTMLInputElement>("given");
        await fireEvent.input(given, { target: { value: "Renamed" } });
        await fireEvent.click(screen.getByRole("button", { name: /save/i }));

        expect(onsave).toHaveBeenCalledTimes(1);
        const [id, patch] = onsave.mock.calls[0] as [string, Partial<Person>];
        expect(id).toBe("AAAAA");
        expect(patch.given).toBe("Renamed");
        expect(patch.surname).toBe("X");
        expect(onclose).toHaveBeenCalled();
    });

    it("cancel triggers onclose without onsave", async () => {
        const onsave = vi.fn();
        const onclose = vi.fn();
        render(PersonEditor, { ...editorBaseProps, person: person(), onsave, onclose });
        await fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
        expect(onsave).not.toHaveBeenCalled();
        expect(onclose).toHaveBeenCalled();
    });
});
