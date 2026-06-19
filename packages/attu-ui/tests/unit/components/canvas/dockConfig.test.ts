// SPDX-License-Identifier: MIT

// unit tests for the dock placement config singleton (canvas-chrome-v2
// phase 3). covers the localStorage read path (default / valid / invalid)
// and that setCorner updates the reactive corner and persists.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DockConfig, dockConfig } from "$lib/components/canvas/dockConfig.svelte";

const LS_KEY = "fte.dock.corner";

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    localStorage.clear();
});

describe("dockConfig", () => {
    it("defaults to tl when storage is empty", () => {
        const cfg = new DockConfig();
        expect(cfg.corner).toBe("tl");
    });

    it("reads a valid persisted corner from storage", () => {
        localStorage.setItem(LS_KEY, "br");
        const cfg = new DockConfig();
        expect(cfg.corner).toBe("br");
    });

    it("falls back to tl on an invalid stored value", () => {
        localStorage.setItem(LS_KEY, "middle");
        const cfg = new DockConfig();
        expect(cfg.corner).toBe("tl");
    });

    it("setCorner updates the reactive corner and persists to storage", () => {
        const cfg = new DockConfig();
        cfg.setCorner("tr");
        expect(cfg.corner).toBe("tr");
        expect(localStorage.getItem(LS_KEY)).toBe("tr");
    });

    it("exports a shared singleton instance", () => {
        expect(dockConfig).toBeInstanceOf(DockConfig);
    });
});
