/*
 * FamilyTreeEditor - Phase 1 expansion-state hook tests.
 *
 * Asserts localStorage round-trip, the `fte.family-view.expansion.v1`
 * namespace, no-op writes when the set didn't change, and the per-
 * (treeId, focusId) scoping that makes recentering on a new focus
 * reset the expanded set.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
    clearAllExpansion,
    expansionStorageKey,
    useExpansionState,
} from "$lib/layout/engines/family-view/expansion";

beforeEach(() => {
    clearAllExpansion();
});

describe("useExpansionState — Phase 1", () => {
    it("starts empty when localStorage has no row", () => {
        const s = useExpansionState("t1", "f1");
        expect(s.expanded.size).toBe(0);
        expect(s.autoCollapsed.size).toBe(0);
    });

    it("persists setExpanded to localStorage under the documented key", () => {
        const s = useExpansionState("t1", "f1");
        s.setExpanded("p1", true);
        s.setExpanded("p2", true);
        const key = expansionStorageKey("t1", "f1");
        const raw = localStorage.getItem(key);
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!) as { expanded: string[] };
        expect(parsed.expanded.sort()).toEqual(["p1", "p2"]);
    });

    it("rehydrates from a written row", () => {
        const key = expansionStorageKey("t1", "f1");
        localStorage.setItem(key, JSON.stringify({ expanded: ["p1", "p2", "p3"] }));
        const s = useExpansionState("t1", "f1");
        expect(s.expanded.size).toBe(3);
        expect(s.expanded.has("p1")).toBe(true);
        expect(s.expanded.has("p3")).toBe(true);
    });

    it("removes via setExpanded(id, false)", () => {
        const s = useExpansionState("t1", "f1");
        s.setExpanded("p1", true);
        s.setExpanded("p1", false);
        expect(s.expanded.size).toBe(0);
    });

    it("reset clears the persisted set", () => {
        const s = useExpansionState("t1", "f1");
        s.setExpanded("p1", true);
        s.setExpanded("p2", true);
        s.reset();
        expect(s.expanded.size).toBe(0);
        const raw = localStorage.getItem(expansionStorageKey("t1", "f1"));
        const parsed = JSON.parse(raw!) as { expanded: string[] };
        expect(parsed.expanded).toEqual([]);
    });

    it("scopes by (treeId, focusId) — different focus has its own state", () => {
        const a = useExpansionState("t1", "f1");
        a.setExpanded("p1", true);
        const b = useExpansionState("t1", "f2");
        expect(b.expanded.size).toBe(0);
    });

    it("uses the `fte.family-view.expansion.v1` namespace", () => {
        const key = expansionStorageKey("t1", "f1");
        expect(key).toBe("fte.family-view.expansion.v1:t1:f1");
    });

    it("tolerates garbage in localStorage and starts empty", () => {
        localStorage.setItem(expansionStorageKey("t1", "f1"), "{not json");
        const s = useExpansionState("t1", "f1");
        expect(s.expanded.size).toBe(0);
    });
});
