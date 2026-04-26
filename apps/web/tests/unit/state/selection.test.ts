/*
 * FamilyTreeEditor - selection store basics
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { createSelectionStore } from "$lib/state/selection.svelte";

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
