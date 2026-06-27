/*
 * FamilyTreeEditor - unit tests for saveStatusGlyph pure function
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { saveStatusGlyph } from "../../../../src/lib/components/shell/saveStatusGlyph.js";

describe("saveStatusGlyph", () => {
    it("saved → checkmark success", () => {
        const r = saveStatusGlyph("saved");
        expect(r.glyph).toBe("check");
        expect(r.tone).toBe("success");
        expect(r.label).toBeDefined();
    });

    it("saving → cloud-upload muted", () => {
        const r = saveStatusGlyph("saving");
        expect(r.glyph).toBe("cloud-upload");
        expect(r.tone).toBe("muted");
        expect(r.label).toBeDefined();
    });

    it("dirty → dot warning", () => {
        const r = saveStatusGlyph("dirty");
        expect(r.glyph).toBe("dot");
        expect(r.tone).toBe("warning");
        expect(r.label).toBeDefined();
    });

    it("error → x error", () => {
        const r = saveStatusGlyph("error");
        expect(r.glyph).toBe("x");
        expect(r.tone).toBe("error");
        expect(r.label).toBeDefined();
    });

    it("offline → cloud-off muted", () => {
        const r = saveStatusGlyph("offline");
        expect(r.glyph).toBe("cloud-off");
        expect(r.tone).toBe("muted");
        expect(r.label).toBeDefined();
    });
});
