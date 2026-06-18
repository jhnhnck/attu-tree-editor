/*
 * FamilyTreeEditor - fte.defaultEngine localStorage round-trip + parsing.
 *
 * Verifies the Phase 0 plumbing: the fallback constant, the localStorage
 * override path, and rejection of garbage values. Asserts the `fte.*`
 * namespace convention.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
    BUILTIN_DEFAULT_ENGINE,
    DEFAULT_ENGINE_LS_KEY,
    isEngineKind,
    readDefaultEngine,
    writeDefaultEngine,
} from "$lib/state/engine";

beforeEach(() => {
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith("fte.")) localStorage.removeItem(key);
    }
});

describe("fte.defaultEngine", () => {
    it("falls back to family-view when localStorage is empty", () => {
        expect(readDefaultEngine()).toBe(BUILTIN_DEFAULT_ENGINE);
        expect(BUILTIN_DEFAULT_ENGINE).toBe("family-view");
    });

    it("honors a written override", () => {
        writeDefaultEngine("layered");
        expect(readDefaultEngine()).toBe("layered");
        writeDefaultEngine("hyperbolic");
        expect(readDefaultEngine()).toBe("hyperbolic");
    });

    it("rejects garbage values and falls back to the builtin", () => {
        localStorage.setItem(DEFAULT_ENGINE_LS_KEY, "not-an-engine");
        expect(readDefaultEngine()).toBe(BUILTIN_DEFAULT_ENGINE);
    });

    it("uses the documented fte.* namespace", () => {
        expect(DEFAULT_ENGINE_LS_KEY.startsWith("fte.")).toBe(true);
    });
});

describe("isEngineKind", () => {
    it("accepts the three known engines", () => {
        expect(isEngineKind("family-view")).toBe(true);
        expect(isEngineKind("layered")).toBe(true);
        expect(isEngineKind("hyperbolic")).toBe(true);
    });

    it("rejects everything else", () => {
        expect(isEngineKind("")).toBe(false);
        expect(isEngineKind(null)).toBe(false);
        expect(isEngineKind(undefined)).toBe(false);
        expect(isEngineKind(42)).toBe(false);
    });
});
