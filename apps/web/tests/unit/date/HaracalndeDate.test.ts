/*
 * FamilyTreeEditor - HaracalndeDate parse / serialize / compare / arithmetic
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { DateParseErrors, HaracalndeDate } from "$lib/date/HaracalndeDate";

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(`expected ok, got err: ${r.error}`);
    return r.value;
}

describe("HaracalndeDate.parseFamilyScript", () => {
    it("parses a TT date with B prefix", () => {
        const d = unwrap(HaracalndeDate.parseFamilyScript("B17570312"));
        expect(d).not.toBeNull();
        expect(d?.era).toBe("TT");
        expect(d?.year).toBe(1757);
        expect(d?.month).toBe(3);
        expect(d?.day).toBe(12);
        expect(d?.approximate).toBe(false);
    });

    it("parses an approximate TT date", () => {
        const d = unwrap(HaracalndeDate.parseFamilyScript("B18221112~"));
        expect(d?.era).toBe("TT");
        expect(d?.approximate).toBe(true);
    });

    it("parses a PC date with year-only", () => {
        const d = unwrap(HaracalndeDate.parseFamilyScript("00210000"));
        expect(d?.era).toBe("PC");
        expect(d?.year).toBe(21);
        expect(d?.month).toBeUndefined();
        expect(d?.day).toBeUndefined();
    });

    it("returns ok(null) for the fully-zero unknown date", () => {
        const r = HaracalndeDate.parseFamilyScript("00000000");
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toBeNull();
    });

    it("rejects year zero with a non-zero month or day", () => {
        const r = HaracalndeDate.parseFamilyScript("B00001212");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe(DateParseErrors.YearZero);
    });

    it("treats absent prefix as PC era", () => {
        const d = unwrap(HaracalndeDate.parseFamilyScript("17570312"));
        expect(d?.era).toBe("PC");
    });

    it("rejects month 13", () => {
        const r = HaracalndeDate.parseFamilyScript("B17571301");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe(DateParseErrors.MonthOutOfRange);
    });

    it("rejects day 31", () => {
        const r = HaracalndeDate.parseFamilyScript("B17570231");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe(DateParseErrors.DayOutOfRange);
    });

    it("rejects malformed input", () => {
        const r = HaracalndeDate.parseFamilyScript("nope");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe(DateParseErrors.BadShape);
    });
});

describe("HaracalndeDate.parseGedcom", () => {
    it("parses full TT date", () => {
        const d = unwrap(HaracalndeDate.parseGedcom("12 MAR 1757 BC"));
        expect(d.era).toBe("TT");
        expect(d.year).toBe(1757);
        expect(d.month).toBe(3);
        expect(d.day).toBe(12);
        expect(d.approximate).toBe(false);
    });

    it("parses ABT TT date", () => {
        const d = unwrap(HaracalndeDate.parseGedcom("ABT 12 NOV 1822 BC"));
        expect(d.era).toBe("TT");
        expect(d.month).toBe(11);
        expect(d.approximate).toBe(true);
    });

    it("parses year-only TT", () => {
        const d = unwrap(HaracalndeDate.parseGedcom("1822 BC"));
        expect(d.era).toBe("TT");
        expect(d.year).toBe(1822);
        expect(d.month).toBeUndefined();
        expect(d.day).toBeUndefined();
    });

    it("parses PC date without BC suffix", () => {
        const d = unwrap(HaracalndeDate.parseGedcom("12 MAR 1757"));
        expect(d.era).toBe("PC");
    });

    it("parses zero-padded short PC year", () => {
        const d = unwrap(HaracalndeDate.parseGedcom("0017"));
        expect(d.era).toBe("PC");
        expect(d.year).toBe(17);
    });

    it("treats BEF as approximate", () => {
        const d = unwrap(HaracalndeDate.parseGedcom("BEF 1500 BC"));
        expect(d.approximate).toBe(true);
        expect(d.era).toBe("TT");
    });

    it("rejects unknown month name", () => {
        const r = HaracalndeDate.parseGedcom("XYZ 1700");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe(DateParseErrors.UnknownMonthName);
    });
});

describe("HaracalndeDate.parseNarrative", () => {
    it("parses canonical day-month year ERA", () => {
        const d = unwrap(HaracalndeDate.parseNarrative("24-7 1787 TT"));
        expect(d.era).toBe("TT");
        expect(d.year).toBe(1787);
        expect(d.month).toBe(7);
        expect(d.day).toBe(24);
    });

    it("parses small PC date", () => {
        const d = unwrap(HaracalndeDate.parseNarrative("15-3 5 PC"));
        expect(d.era).toBe("PC");
        expect(d.year).toBe(5);
    });

    it("parses year-only", () => {
        const d = unwrap(HaracalndeDate.parseNarrative("21 PC"));
        expect(d.year).toBe(21);
        expect(d.month).toBeUndefined();
        expect(d.day).toBeUndefined();
    });

    it("parses ABT prefix", () => {
        const d = unwrap(HaracalndeDate.parseNarrative("ABT 12-11 1822 TT"));
        expect(d.approximate).toBe(true);
    });
});

describe("HaracalndeDate serializers (round-trip)", () => {
    const familyScriptSamples = ["B17570312", "B18221112~", "00210000", "17570312", "B17570000"];

    it.each(familyScriptSamples)("FamilyScript round-trips %s byte-stable", (raw) => {
        const d = unwrap(HaracalndeDate.parseFamilyScript(raw));
        expect(d).not.toBeNull();
        expect(d?.toFamilyScript()).toBe(raw);
    });

    const gedcomSamples = [
        "12 MAR 1757 BC",
        "ABT 12 NOV 1822 BC",
        "1822 BC",
        "12 MAR 1757",
        "0017",
        "MAR 1757 BC",
    ];

    it.each(gedcomSamples)("GEDCOM round-trips %s byte-stable", (raw) => {
        const d = unwrap(HaracalndeDate.parseGedcom(raw));
        expect(d.toGedcom()).toBe(raw);
    });

    const narrativeSamples = ["24-7 1787 TT", "15-3 5 PC", "21 PC", "ABT 12-11 1822 TT"];

    it.each(narrativeSamples)("narrative round-trips %s byte-stable", (raw) => {
        const d = unwrap(HaracalndeDate.parseNarrative(raw));
        expect(d.toNarrative()).toBe(raw);
    });
});

describe("HaracalndeDate.compare", () => {
    it("PC 1 1-1 is one day after TT 1 12-30 (boundary adjacency)", () => {
        const tt = HaracalndeDate.of({ era: "TT", year: 1, month: 12, day: 30 });
        const pc = HaracalndeDate.of({ era: "PC", year: 1, month: 1, day: 1 });
        expect(pc.compare(tt)).toBe(1);
        expect(tt.compare(pc)).toBe(-1);
        expect(pc.daysSince(tt)).toBe(1);
    });

    it("orders by year then month then day", () => {
        const a = HaracalndeDate.of({ era: "PC", year: 5, month: 6, day: 15 });
        const b = HaracalndeDate.of({ era: "PC", year: 5, month: 6, day: 16 });
        const c = HaracalndeDate.of({ era: "PC", year: 5, month: 7, day: 1 });
        const d = HaracalndeDate.of({ era: "PC", year: 6, month: 1, day: 1 });
        expect(a.isBefore(b)).toBe(true);
        expect(b.isBefore(c)).toBe(true);
        expect(c.isBefore(d)).toBe(true);
    });

    it("treats undefined month as 1 for ordering", () => {
        const a = HaracalndeDate.of({ era: "PC", year: 5 });
        const b = HaracalndeDate.of({ era: "PC", year: 5, month: 1, day: 1 });
        expect(a.compare(b)).toBe(0);
    });

    it("equals matches all fields including approximate flag", () => {
        const a = HaracalndeDate.of({ era: "PC", year: 5, month: 6, day: 15, approximate: true });
        const b = HaracalndeDate.of({ era: "PC", year: 5, month: 6, day: 15, approximate: true });
        const c = HaracalndeDate.of({ era: "PC", year: 5, month: 6, day: 15 });
        expect(a.equals(b)).toBe(true);
        expect(a.equals(c)).toBe(false);
    });
});

describe("HaracalndeDate arithmetic", () => {
    it("plusDays(0) is the identity for fully-specified dates", () => {
        const d = HaracalndeDate.of({ era: "PC", year: 5, month: 6, day: 15 });
        expect(d.plusDays(0).equals(d)).toBe(true);
    });

    it("minusDays crosses the TT/PC boundary cleanly", () => {
        const start = HaracalndeDate.of({ era: "PC", year: 1, month: 1, day: 1 });
        const before = start.minusDays(1);
        expect(before.era).toBe("TT");
        expect(before.year).toBe(1);
        expect(before.month).toBe(12);
        expect(before.day).toBe(30);
    });

    it("plusDays(360) increments year by one", () => {
        const d = HaracalndeDate.of({ era: "PC", year: 5, month: 6, day: 15 });
        const after = d.plusDays(360);
        expect(after.year).toBe(6);
        expect(after.month).toBe(6);
        expect(after.day).toBe(15);
    });

    it("plusDays(720) increments year by two", () => {
        const d = HaracalndeDate.of({ era: "PC", year: 5, month: 6, day: 15 });
        const after = d.plusDays(720);
        expect(after.year).toBe(7);
    });

    it("plusYears uses the 360-day year length", () => {
        const d = HaracalndeDate.of({ era: "PC", year: 5, month: 6, day: 15 });
        const after = d.plusYears(3);
        expect(after.year).toBe(8);
        expect(after.month).toBe(6);
        expect(after.day).toBe(15);
    });

    it("daysSince is signed and antisymmetric", () => {
        const a = HaracalndeDate.of({ era: "PC", year: 5, month: 6, day: 15 });
        const b = HaracalndeDate.of({ era: "PC", year: 6, month: 6, day: 15 });
        expect(b.daysSince(a)).toBe(360);
        expect(a.daysSince(b)).toBe(-360);
    });

    it("preserves approximate flag through arithmetic", () => {
        const d = HaracalndeDate.of({ era: "PC", year: 5, month: 6, day: 15, approximate: true });
        expect(d.plusDays(10).approximate).toBe(true);
    });
});

describe("HaracalndeDate.toJSON / toApproxGregorianYear", () => {
    it("toJSON omits absent optional fields and false approximate", () => {
        const d = HaracalndeDate.of({ era: "PC", year: 5 });
        expect(d.toJSON()).toEqual({ era: "PC", year: 5 });
    });

    it("toJSON includes approximate when true", () => {
        const d = HaracalndeDate.of({ era: "TT", year: 1822, approximate: true });
        expect(d.toJSON()).toEqual({ era: "TT", year: 1822, approximate: true });
    });

    it("toApproxGregorianYear maps PC and TT", () => {
        expect(HaracalndeDate.of({ era: "PC", year: 1 }).toApproxGregorianYear()).toBe(1);
        expect(HaracalndeDate.of({ era: "PC", year: 1822 }).toApproxGregorianYear()).toBe(1822);
        expect(HaracalndeDate.of({ era: "TT", year: 1 }).toApproxGregorianYear()).toBe(0);
        expect(HaracalndeDate.of({ era: "TT", year: 1822 }).toApproxGregorianYear()).toBe(-1821);
    });
});
