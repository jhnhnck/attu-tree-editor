/*
 * FamilyTreeEditor - wiki url builder
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { wikiUrlFor } from "$lib/wiki/linkResolver";

describe("wikiUrlFor", () => {
    it("builds a default attu url for a simple title", () => {
        expect(wikiUrlFor("Korak Nokar")).toBe("https://attuproject.org/wiki/Korak_Nokar");
    });

    it("respects a custom base url and strips trailing slashes", () => {
        expect(wikiUrlFor("Marai", "https://example.org/")).toBe("https://example.org/wiki/Marai");
        expect(wikiUrlFor("Marai", "https://example.org//")).toBe("https://example.org/wiki/Marai");
    });

    it("percent-encodes characters that would break the url", () => {
        expect(wikiUrlFor("Banchar?")).toBe("https://attuproject.org/wiki/Banchar%3F");
        expect(wikiUrlFor("Saint #1")).toBe("https://attuproject.org/wiki/Saint_%231");
    });

    it("returns undefined for empty / undefined / whitespace input", () => {
        expect(wikiUrlFor(undefined)).toBeUndefined();
        expect(wikiUrlFor("")).toBeUndefined();
        expect(wikiUrlFor("   ")).toBeUndefined();
    });
});
