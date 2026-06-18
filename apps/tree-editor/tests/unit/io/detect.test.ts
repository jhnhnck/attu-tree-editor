/*
 * FamilyTreeEditor - format detection
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { detectFormat } from "$lib/io/detect";

describe("detectFormat", () => {
    it("classifies a .ged filename", () => {
        expect(detectFormat({ filename: "Akarians.ged" })).toBe("gedcom");
    });

    it("classifies a .gedcom filename", () => {
        expect(detectFormat({ filename: "tree.gedcom" })).toBe("gedcom");
    });

    it("classifies a .txt filename with FamilyScript content", () => {
        expect(detectFormat({ filename: "tree.txt", firstChars: "# Akarians\n#" })).toBe(
            "familyscript",
        );
    });

    it("classifies a .gdz filename", () => {
        expect(detectFormat({ filename: "tree.gdz" })).toBe("gedzip");
    });

    it("classifies a .zip filename", () => {
        expect(detectFormat({ filename: "tree.zip" })).toBe("gedzip");
    });

    it("classifies by zip magic bytes", () => {
        const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff]);
        expect(detectFormat({ filename: "anything.dat", firstBytes: bytes })).toBe("gedzip");
    });

    it("classifies by GEDCOM content sniff (beats wrong extension)", () => {
        expect(detectFormat({ filename: "tree.txt", firstChars: "0 HEAD\n1 SOUR ..." })).toBe(
            "gedcom",
        );
    });

    it("classifies by FamilyScript header sniff (beats wrong extension)", () => {
        expect(detectFormat({ filename: "tree.dat", firstChars: "# Akarians" })).toBe(
            "familyscript",
        );
    });

    it("classifies a .html filename as Family Echo HTML", () => {
        expect(detectFormat({ filename: "tree.html" })).toBe("familyecho-html");
    });

    it("classifies an HTML content sniff regardless of extension", () => {
        expect(detectFormat({ filename: "tree.dat", firstChars: '<HTML lang="en">\n' })).toBe(
            "familyecho-html",
        );
    });

    it("returns unknown for empty input", () => {
        expect(detectFormat({})).toBe("unknown");
    });

    it("returns unknown for an unrelated file", () => {
        expect(detectFormat({ filename: "photo.png" })).toBe("unknown");
    });
});
