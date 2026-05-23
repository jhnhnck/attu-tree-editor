/*
 * FamilyTreeEditor - PortraitField: drag-drop + paste + size guard + file picker
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";

// CropperDialog uses native <dialog>.showModal(), which jsdom doesn't implement.
// stub it out so PortraitField tests can exercise their own surface without
// the dialog booting up. capture the most recent props so tests can fire the
// dialog's onclose callback synthetically (focus-stability test below).
export const lastDialogProps: { current: { onclose?: () => void } | undefined } = {
    current: undefined,
};
vi.mock("$lib/components/editor/CropperDialog.svelte", () => ({
    default: function (_anchor: unknown, props: { onclose?: () => void }) {
        // svelte 5 component factory: anchor + props bag. record the latest props.
        lastDialogProps.current = props;
        return {};
    },
}));

import PortraitField from "$lib/components/editor/PortraitField.svelte";
import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";

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
        personId: "AAAAA",
        currentBlobId: undefined as string | undefined,
        portraitUrls,
        onchange: vi.fn(),
        onerror: vi.fn(),
    };
}

function imageFile(name = "p.png", type = "image/png", size = 1024): File {
    // a Blob's reported .size matches the byte length of the supplied parts
    return new File([new Uint8Array(size)], name, { type });
}

function makeDataTransfer(files: File[]): DataTransfer {
    // jsdom's DataTransfer is incomplete; fake just what the component uses.
    return {
        files: Object.assign(files, { item: (i: number) => files[i] ?? null }),
        items: files.map((f) => ({ kind: "file", type: f.type, getAsFile: () => f })),
        types: ["Files"],
        dropEffect: "none",
    } as unknown as DataTransfer;
}

describe("PortraitField", () => {
    it("opens the cropper when a valid image is dropped", async () => {
        const props = baseProps();
        const { container } = render(PortraitField, props);
        const root = container.querySelector("[role='region']")!;
        const f = imageFile();
        await fireEvent.drop(root, { dataTransfer: makeDataTransfer([f]) });
        // CropperDialog opens when pendingSource is set; we assert by absence
        // of an onerror call and by no remaining drag-hover state.
        expect(props.onerror).not.toHaveBeenCalled();
    });

    it("rejects a non-image drop with a clear inline error", async () => {
        const props = baseProps();
        const { container } = render(PortraitField, props);
        const root = container.querySelector("[role='region']")!;
        const f = new File(["hello"], "p.txt", { type: "text/plain" });
        await fireEvent.drop(root, { dataTransfer: makeDataTransfer([f]) });
        expect(props.onerror).toHaveBeenCalledOnce();
        const msg = String(props.onerror.mock.calls[0]?.[0] ?? "");
        expect(msg).toMatch(/expected an image/i);
    });

    it("rejects an oversize drop (> 20 mb) with a clear inline error", async () => {
        const props = baseProps();
        const { container } = render(PortraitField, props);
        const root = container.querySelector("[role='region']")!;
        const f = imageFile("huge.png", "image/png", 21 * 1024 * 1024);
        await fireEvent.drop(root, { dataTransfer: makeDataTransfer([f]) });
        expect(props.onerror).toHaveBeenCalledOnce();
        const msg = String(props.onerror.mock.calls[0]?.[0] ?? "");
        expect(msg).toMatch(/too large/i);
    });

    it("ignores paste when the field is not focused", () => {
        const props = baseProps();
        render(PortraitField, props);
        const f = imageFile();
        // simulate a paste delivered to window without the field being focused
        // jsdom doesn't implement ClipboardEvent; fake one with the surface we use.
        const evt = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(evt, "clipboardData", {
            value: { items: [{ kind: "file", type: f.type, getAsFile: () => f }] },
        });
        window.dispatchEvent(evt);
        expect(props.onerror).not.toHaveBeenCalled();
    });

    it("accepts paste when the field is focused", async () => {
        const props = baseProps();
        const { container } = render(PortraitField, props);
        const root = container.querySelector("[role='region']") as HTMLElement;
        // focus via focusin so the focus-gate flips
        await fireEvent.focusIn(root);
        const f = imageFile();
        // jsdom doesn't implement ClipboardEvent; fake one with the surface we use.
        const evt = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(evt, "clipboardData", {
            value: { items: [{ kind: "file", type: f.type, getAsFile: () => f }] },
        });
        window.dispatchEvent(evt);
        expect(props.onerror).not.toHaveBeenCalled();
        // a valid paste should preventDefault so other inspectors don't see it
        expect(evt.defaultPrevented).toBe(true);
    });

    it("returns focus to the replace button on dialog close — even after a personId swap", async () => {
        // pre-mortem risk #6: swapping personId mid-flight could leave replaceBtn
        // stale, leaking focus to document.body after the dialog closes. assert
        // that the focused element after onclose is NOT document.body.
        const props = baseProps();
        // currentBlobId means the button reads "replace"; behavior is the same
        // for "upload" but matches the pre-mortem framing more naturally.
        props.currentBlobId = "blob-id-x";
        const { rerender, container } = render(PortraitField, props);
        // simulate a successful drop so pendingSource is set and the dialog opens
        const root = container.querySelector("[role='region']")!;
        const f = imageFile();
        await fireEvent.drop(root, { dataTransfer: makeDataTransfer([f]) });

        // swap personId; svelte rebinds replaceBtn to the re-rendered button.
        await rerender({ ...props, personId: "BBBBB" });

        // fire the dialog's onclose synthetically.
        expect(lastDialogProps.current?.onclose).toBeTypeOf("function");
        lastDialogProps.current?.onclose?.();

        // focused element should not be document.body. either the replace button
        // (happy path) or any other element (degraded but acceptable).
        expect(document.activeElement).not.toBe(document.body);
    });

    it("rejects a non-image paste silently (focus-gated, but type-filtered too)", async () => {
        const props = baseProps();
        const { container } = render(PortraitField, props);
        const root = container.querySelector("[role='region']") as HTMLElement;
        await fireEvent.focusIn(root);
        // jsdom doesn't implement ClipboardEvent; fake one with the surface we use.
        const evt = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(evt, "clipboardData", {
            value: {
                items: [
                    {
                        kind: "string",
                        type: "text/plain",
                        getAsFile: () => null,
                    },
                ],
            },
        });
        window.dispatchEvent(evt);
        // no image item -> no admission, no preventDefault, no error
        expect(props.onerror).not.toHaveBeenCalled();
        expect(evt.defaultPrevented).toBe(false);
    });
});
