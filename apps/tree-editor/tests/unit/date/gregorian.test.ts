/*
 * FamilyTreeEditor - gregorian approximation helpers
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { HaracalndeDate } from "$lib/date/HaracalndeDate";
import { approxGregorianLabel, approxGregorianYear } from "$lib/date/gregorian";

describe("approxGregorianYear", () => {
    it("PC 1 -> 1", () => {
        expect(approxGregorianYear(HaracalndeDate.of({ era: "PC", year: 1 }))).toBe(1);
    });
    it("PC 1822 -> 1822", () => {
        expect(approxGregorianYear(HaracalndeDate.of({ era: "PC", year: 1822 }))).toBe(1822);
    });
    it("TT 1 -> 0", () => {
        expect(approxGregorianYear(HaracalndeDate.of({ era: "TT", year: 1 }))).toBe(0);
    });
    it("TT 1822 -> -1821", () => {
        expect(approxGregorianYear(HaracalndeDate.of({ era: "TT", year: 1822 }))).toBe(-1821);
    });
});

describe("approxGregorianLabel", () => {
    it("formats positive years as AD", () => {
        expect(approxGregorianLabel(HaracalndeDate.of({ era: "PC", year: 1822 }))).toBe(
            "approx AD 1822",
        );
    });
    it("formats negative years as BC", () => {
        expect(approxGregorianLabel(HaracalndeDate.of({ era: "TT", year: 1822 }))).toBe(
            "approx 1821 BC",
        );
    });
    it("formats year zero specially", () => {
        expect(approxGregorianLabel(HaracalndeDate.of({ era: "TT", year: 1 }))).toBe("approx AD 0");
    });
});
