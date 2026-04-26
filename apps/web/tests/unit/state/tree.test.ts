/*
 * FamilyTreeEditor - tree store snapshot undo/redo behavior
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { createTreeStore } from "$lib/state/tree.svelte";
import type { Tree } from "$lib/domain/types";

function emptyTree(name: string): Tree {
    return {
        id: "x",
        name,
        rootId: "AAAAA",
        people: {
            AAAAA: {
                id: "AAAAA",
                given: "A",
                surname: "X",
                gender: "u",
                spouseIds: [],
                display: "z1",
            },
        },
        couples: [],
        rev: 0,
        updatedAt: 0,
    };
}

describe("createTreeStore", () => {
    it("starts with the initial tree, no undo, no redo", () => {
        const s = createTreeStore(emptyTree("v0"));
        expect(s.tree.name).toBe("v0");
        expect(s.canUndo).toBe(false);
        expect(s.canRedo).toBe(false);
    });

    it("set() pushes the previous tree onto the undo stack", () => {
        const s = createTreeStore(emptyTree("v0"));
        s.set(emptyTree("v1"));
        expect(s.tree.name).toBe("v1");
        expect(s.canUndo).toBe(true);
        expect(s.canRedo).toBe(false);
    });

    it("undo restores the prior tree and enables redo", () => {
        const s = createTreeStore(emptyTree("v0"));
        s.set(emptyTree("v1"));
        s.undo();
        expect(s.tree.name).toBe("v0");
        expect(s.canUndo).toBe(false);
        expect(s.canRedo).toBe(true);
    });

    it("redo replays the most recently undone state", () => {
        const s = createTreeStore(emptyTree("v0"));
        s.set(emptyTree("v1"));
        s.undo();
        s.redo();
        expect(s.tree.name).toBe("v1");
        expect(s.canUndo).toBe(true);
        expect(s.canRedo).toBe(false);
    });

    it("a fresh set() after an undo clears the redo stack", () => {
        const s = createTreeStore(emptyTree("v0"));
        s.set(emptyTree("v1"));
        s.undo();
        s.set(emptyTree("v2"));
        expect(s.tree.name).toBe("v2");
        expect(s.canRedo).toBe(false);
    });

    it("update(fn) is equivalent to set(fn(current))", () => {
        const s = createTreeStore(emptyTree("v0"));
        s.update((t) => ({ ...t, name: "v1" }));
        expect(s.tree.name).toBe("v1");
        expect(s.canUndo).toBe(true);
    });

    it("identity returns from update() are not recorded", () => {
        const s = createTreeStore(emptyTree("v0"));
        s.update((t) => t);
        expect(s.canUndo).toBe(false);
    });

    it("reset clears history without recording the previous state", () => {
        const s = createTreeStore(emptyTree("v0"));
        s.set(emptyTree("v1"));
        s.reset(emptyTree("loaded"));
        expect(s.tree.name).toBe("loaded");
        expect(s.canUndo).toBe(false);
        expect(s.canRedo).toBe(false);
    });

    it("undo/redo on an empty stack is a no-op", () => {
        const s = createTreeStore(emptyTree("v0"));
        s.undo();
        s.redo();
        expect(s.tree.name).toBe("v0");
    });

    it("history is capped: oldest snapshot is dropped past the limit", () => {
        const s = createTreeStore(emptyTree("v0"));
        for (let i = 1; i <= 250; i += 1) {
            s.set(emptyTree(`v${String(i)}`));
        }
        // walk back as far as possible
        while (s.canUndo) s.undo();
        // we should have lost at least the first 50 to the cap (250 set, 200 limit)
        expect(s.tree.name).not.toBe("v0");
    });
});
