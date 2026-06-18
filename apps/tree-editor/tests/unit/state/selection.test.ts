/*
 * FamilyTreeEditor - selection store basics
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
    clearPersistedSelection,
    createSelectionStore,
    readPersistedSelection,
    selectionStorageKey,
    writePersistedSelection,
} from "$lib/state/selection.svelte";

describe("createSelectionStore", () => {
    it("starts empty", () => {
        const s = createSelectionStore();
        expect(s.selectedPersonId).toBeUndefined();
        expect(s.hoveredPersonId).toBeUndefined();
        expect(s.editorOpenFor).toBeUndefined();
    });

    it("select / hover are independent", () => {
        const s = createSelectionStore();
        s.select("AAAAA");
        s.hover("BBBBB");
        expect(s.selectedPersonId).toBe("AAAAA");
        expect(s.hoveredPersonId).toBe("BBBBB");
    });

    it("openEditor selects the same person it opens for", () => {
        const s = createSelectionStore();
        s.openEditor("CCCCC");
        expect(s.selectedPersonId).toBe("CCCCC");
        expect(s.editorOpenFor).toBe("CCCCC");
    });

    it("closeEditor clears editor without touching selection", () => {
        const s = createSelectionStore();
        s.openEditor("DDDDD");
        s.closeEditor();
        expect(s.editorOpenFor).toBeUndefined();
        expect(s.selectedPersonId).toBe("DDDDD");
    });
});

describe("selection persistence", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("scopes the storage key per tree id", () => {
        expect(selectionStorageKey("t-1")).toBe("fte.selection.lastPersonId:t-1");
        expect(selectionStorageKey("t-2")).toBe("fte.selection.lastPersonId:t-2");
    });

    it("write then read round-trips the person id", () => {
        writePersistedSelection("t-1", "P-AAAA");
        expect(readPersistedSelection("t-1")).toBe("P-AAAA");
    });

    it("write with undefined removes the key", () => {
        writePersistedSelection("t-1", "P-AAAA");
        writePersistedSelection("t-1", undefined);
        expect(readPersistedSelection("t-1")).toBeUndefined();
        expect(localStorage.getItem(selectionStorageKey("t-1"))).toBeNull();
    });

    it("clearPersistedSelection removes the key", () => {
        writePersistedSelection("t-1", "P-AAAA");
        clearPersistedSelection("t-1");
        expect(readPersistedSelection("t-1")).toBeUndefined();
    });

    it("reads return undefined when no value stored", () => {
        expect(readPersistedSelection("never-written")).toBeUndefined();
    });

    it("reads return undefined when stored value is empty string", () => {
        localStorage.setItem(selectionStorageKey("t-1"), "");
        expect(readPersistedSelection("t-1")).toBeUndefined();
    });

    it("keeps per-tree values isolated", () => {
        writePersistedSelection("t-1", "P-AAAA");
        writePersistedSelection("t-2", "P-BBBB");
        expect(readPersistedSelection("t-1")).toBe("P-AAAA");
        expect(readPersistedSelection("t-2")).toBe("P-BBBB");
        writePersistedSelection("t-1", undefined);
        expect(readPersistedSelection("t-1")).toBeUndefined();
        expect(readPersistedSelection("t-2")).toBe("P-BBBB");
    });
});
