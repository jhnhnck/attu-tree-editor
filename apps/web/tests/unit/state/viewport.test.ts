/*
 * FamilyTreeEditor - viewport store: pan + clamped zoom
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { createViewportStore } from "$lib/state/viewport.svelte";

describe("createViewportStore", () => {
    it("starts at origin with zoom 1", () => {
        const v = createViewportStore();
        expect(v.x).toBe(0);
        expect(v.y).toBe(0);
        expect(v.zoom).toBe(1);
    });

    it("setPan updates x and y", () => {
        const v = createViewportStore();
        v.setPan(120, -50);
        expect(v.x).toBe(120);
        expect(v.y).toBe(-50);
    });

    it("setZoom clamps to the [0.1, 4] range", () => {
        const v = createViewportStore();
        v.setZoom(0.05);
        expect(v.zoom).toBe(0.1);
        v.setZoom(10);
        expect(v.zoom).toBe(4);
        v.setZoom(2);
        expect(v.zoom).toBe(2);
    });

    it("reset returns to origin and zoom 1", () => {
        const v = createViewportStore();
        v.setPan(100, 200);
        v.setZoom(2);
        v.reset();
        expect(v.x).toBe(0);
        expect(v.y).toBe(0);
        expect(v.zoom).toBe(1);
    });
});
