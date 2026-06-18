/*
 * FamilyTreeEditor - tests for layout/pathHighlight.ts
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { bundlesForPath } from "$lib/layout/pathHighlight";
import type { Path } from "$lib/layout/graph";
import type { RenderedSegment, EdgeKind, EdgeRole } from "$lib/components/tree/edges";
import type { PersonId } from "$lib/domain/types";

// Test helper — defaults `bundleId` to `id` so the resulting Set of
// bundle ids can be asserted against the segment ids used here.
function seg(input: {
    id: string;
    bundleId?: string;
    kind: EdgeKind;
    role: EdgeRole;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    persons?: readonly PersonId[];
}): RenderedSegment {
    const { bundleId, ...rest } = input;
    return { ...rest, bundleId: bundleId ?? input.id };
}

describe("bundlesForPath", () => {
    it("returns empty set for an empty segment list", () => {
        const path: Path = { ids: ["A", "B", "C"], steps: [] };
        const segments: RenderedSegment[] = [];
        const result = bundlesForPath(path, segments);
        expect(result.size).toBe(0);
    });

    it("returns empty set for a single-person path (no pairs)", () => {
        const path: Path = { ids: ["A"], steps: [] };
        const segments: RenderedSegment[] = [
            seg({
                id: "bond:A|B:0",
                kind: "bond",
                role: "blood",
                x1: 0,
                y1: 0,
                x2: 10,
                y2: 0,
                persons: ["A", "B"],
            }),
        ];
        const result = bundlesForPath(path, segments);
        expect(result.size).toBe(0);
    });

    it("finds a single segment matching a two-person path", () => {
        const path: Path = { ids: ["A", "B"], steps: [] };
        const segments: RenderedSegment[] = [
            seg({
                id: "bond:A|B:0",
                kind: "bond",
                role: "blood",
                x1: 0,
                y1: 0,
                x2: 10,
                y2: 0,
                persons: ["A", "B"],
            }),
        ];
        const result = bundlesForPath(path, segments);
        expect(result.has("bond:A|B:0")).toBe(true);
        expect(result.size).toBe(1);
    });

    it("finds segments regardless of persons order (B|A vs A|B)", () => {
        const path: Path = { ids: ["B", "A"], steps: [] };
        const segments: RenderedSegment[] = [
            seg({
                id: "bond:A|B:0",
                kind: "bond",
                role: "blood",
                x1: 0,
                y1: 0,
                x2: 10,
                y2: 0,
                persons: ["A", "B"],
            }),
        ];
        const result = bundlesForPath(path, segments);
        expect(result.has("bond:A|B:0")).toBe(true);
        expect(result.size).toBe(1);
    });

    it("finds multiple consecutive segments in a long path", () => {
        const path: Path = { ids: ["A", "B", "C", "D"], steps: [] };
        const segments: RenderedSegment[] = [
            seg({
                id: "seg-ab",
                kind: "bond",
                role: "blood",
                x1: 0,
                y1: 0,
                x2: 10,
                y2: 0,
                persons: ["A", "B"],
            }),
            seg({
                id: "seg-bc",
                kind: "child-drop",
                role: "blood",
                x1: 10,
                y1: 0,
                x2: 10,
                y2: 10,
                persons: ["B", "C"],
            }),
            seg({
                id: "seg-cd",
                kind: "child-drop",
                role: "blood",
                x1: 10,
                y1: 10,
                x2: 20,
                y2: 10,
                persons: ["C", "D"],
            }),
        ];
        const result = bundlesForPath(path, segments);
        expect(result.has("seg-ab")).toBe(true);
        expect(result.has("seg-bc")).toBe(true);
        expect(result.has("seg-cd")).toBe(true);
        expect(result.size).toBe(3);
    });

    it("skips segments that don't match the path", () => {
        const path: Path = { ids: ["A", "B"], steps: [] };
        const segments: RenderedSegment[] = [
            seg({
                id: "seg-ab",
                kind: "bond",
                role: "blood",
                x1: 0,
                y1: 0,
                x2: 10,
                y2: 0,
                persons: ["A", "B"],
            }),
            seg({
                id: "seg-cd",
                kind: "bond",
                role: "blood",
                x1: 20,
                y1: 0,
                x2: 30,
                y2: 0,
                persons: ["C", "D"],
            }),
        ];
        const result = bundlesForPath(path, segments);
        expect(result.has("seg-ab")).toBe(true);
        expect(result.has("seg-cd")).toBe(false);
        expect(result.size).toBe(1);
    });

    it("handles segments with multiple persons (3-element persons array)", () => {
        const path: Path = { ids: ["A", "B", "C"], steps: [] };
        const segments: RenderedSegment[] = [
            seg({
                id: "seg-abc",
                kind: "child-drop",
                role: "blood",
                x1: 0,
                y1: 0,
                x2: 10,
                y2: 10,
                persons: ["A", "B", "C"],
            }),
        ];
        const result = bundlesForPath(path, segments);
        // Should match because [A, B, C] contains both consecutive pairs [A, B] and [B, C]
        expect(result.has("seg-abc")).toBe(true);
        expect(result.size).toBe(1);
    });

    it("finds only the first matching pair in a multi-person segment", () => {
        const path: Path = { ids: ["A", "B"], steps: [] };
        const segments: RenderedSegment[] = [
            seg({
                id: "seg-abc",
                kind: "child-drop",
                role: "blood",
                x1: 0,
                y1: 0,
                x2: 10,
                y2: 10,
                persons: ["A", "B", "C"],
            }),
        ];
        const result = bundlesForPath(path, segments);
        expect(result.has("seg-abc")).toBe(true);
    });

    it("does not match segments with no persons field", () => {
        const path: Path = { ids: ["A", "B"], steps: [] };
        const segments: RenderedSegment[] = [
            seg({
                id: "seg-no-persons",
                kind: "bond",
                role: "blood",
                x1: 0,
                y1: 0,
                x2: 10,
                y2: 0,
            }),
        ];
        const result = bundlesForPath(path, segments);
        expect(result.size).toBe(0);
    });

    it("handles segments with only one person in persons array", () => {
        const path: Path = { ids: ["A", "B"], steps: [] };
        const segments: RenderedSegment[] = [
            seg({
                id: "seg-single",
                kind: "parent-drop",
                role: "blood",
                x1: 0,
                y1: 0,
                x2: 0,
                y2: 10,
                persons: ["A"],
            }),
        ];
        const result = bundlesForPath(path, segments);
        // Can't find a pair in a 1-element array
        expect(result.size).toBe(0);
    });

    it("returns one bundle id even if multiple segments in the same bundle match", () => {
        const path: Path = { ids: ["A", "B"], steps: [] };
        const segments: RenderedSegment[] = [
            seg({
                id: "couple:A|X/drop",
                bundleId: "couple:A|X",
                kind: "parent-drop",
                role: "blood",
                x1: 0,
                y1: 0,
                x2: 0,
                y2: 10,
                persons: ["A", "B"],
            }),
            seg({
                id: "couple:A|X/child:B",
                bundleId: "couple:A|X",
                kind: "child-drop",
                role: "blood",
                x1: 0,
                y1: 10,
                x2: 0,
                y2: 20,
                persons: ["A", "B"],
            }),
        ];
        const result = bundlesForPath(path, segments);
        expect(result.size).toBe(1);
        expect(result.has("couple:A|X")).toBe(true);
    });
});
