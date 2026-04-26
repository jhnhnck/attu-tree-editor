/*
 * FamilyTreeEditor - GEDCOM parser unit tests
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(`expected ok, got err: ${r.error}`);
    return r.value;
}

const minimal = [
    "0 HEAD",
    "1 SOUR FamilyTreeEditor",
    "1 GEDC",
    "2 VERS 5.5.1",
    "1 CHAR UTF-8",
    "0 @I1@ INDI",
    "1 NAME Kadar /Arkaran/",
    "2 GIVN Kadar",
    "2 SURN Arkaran",
    "1 SEX M",
    "1 BIRT",
    "2 DATE ABT 12 NOV 1822 BC",
    "1 DEAT Y",
    "2 DATE 12 MAR 1757 BC",
    "0 TRLR",
].join("\r\n");

describe("parseGedcom - synthetic", () => {
    it("parses a minimal INDI record", () => {
        const r = unwrap(parseGedcom(minimal));
        expect(Object.keys(r.tree.people)).toHaveLength(1);
        const p = Object.values(r.tree.people)[0];
        expect(p?.given).toBe("Kadar");
        expect(p?.surname).toBe("Arkaran");
        expect(p?.gender).toBe("m");
        expect(p?.birth?.era).toBe("TT");
        expect(p?.birth?.year).toBe(1822);
        expect(p?.birth?.approximate).toBe(true);
        expect(p?.death?.era).toBe("TT");
        expect(p?.death?.year).toBe(1757);
    });

    it("NPFX populates title", () => {
        const text = [
            "0 HEAD",
            "1 GEDC",
            "2 VERS 5.5.1",
            "0 @I1@ INDI",
            "1 NAME Kadar /Arkaran/",
            "2 NPFX Living King",
            "1 SEX M",
            "0 TRLR",
        ].join("\r\n");
        const r = unwrap(parseGedcom(text));
        const p = Object.values(r.tree.people)[0];
        expect(p?.title).toBe("Living King");
    });

    it("_MARNM overrides surname", () => {
        const text = [
            "0 HEAD",
            "1 GEDC",
            "2 VERS 5.5.1",
            "0 @I1@ INDI",
            "1 NAME Harmain /Perat/",
            "2 SURN Perat",
            "2 _MARNM Arkaran",
            "1 SEX F",
            "0 TRLR",
        ].join("\r\n");
        const r = unwrap(parseGedcom(text));
        const p = Object.values(r.tree.people)[0];
        expect(p?.surname).toBe("Arkaran");
    });

    it("FAM links HUSB/WIFE/CHIL into spouse and parent fields", () => {
        const text = [
            "0 HEAD",
            "1 GEDC",
            "2 VERS 5.5.1",
            "0 @I1@ INDI",
            "1 NAME Dad /X/",
            "1 SEX M",
            "0 @I2@ INDI",
            "1 NAME Mom /X/",
            "1 SEX F",
            "0 @I3@ INDI",
            "1 NAME Kid /X/",
            "1 SEX F",
            "0 @F1@ FAM",
            "1 HUSB @I1@",
            "1 WIFE @I2@",
            "1 CHIL @I3@",
            "0 TRLR",
        ].join("\r\n");
        const r = unwrap(parseGedcom(text));
        expect(r.tree.couples).toHaveLength(1);

        const persons = Object.values(r.tree.people);
        const dad = persons.find((p) => p.given === "Dad");
        const mom = persons.find((p) => p.given === "Mom");
        const kid = persons.find((p) => p.given === "Kid");
        expect(dad).toBeDefined();
        expect(mom).toBeDefined();
        expect(kid).toBeDefined();
        if (!dad || !mom || !kid) return;
        expect(dad.spouseIds).toContain(mom.id);
        expect(mom.spouseIds).toContain(dad.id);
        expect(kid.fatherId).toBe(dad.id);
        expect(kid.motherId).toBe(mom.id);
    });

    it("accepts duplicate HUSB tags (same-sex marriage)", () => {
        const text = [
            "0 HEAD",
            "1 GEDC",
            "2 VERS 5.5.1",
            "0 @I1@ INDI",
            "1 NAME A /X/",
            "1 SEX M",
            "0 @I2@ INDI",
            "1 NAME B /X/",
            "1 SEX M",
            "0 @F1@ FAM",
            "1 HUSB @I1@",
            "1 HUSB @I2@",
            "0 TRLR",
        ].join("\r\n");
        const r = unwrap(parseGedcom(text));
        expect(r.tree.couples).toHaveLength(1);
        const persons = Object.values(r.tree.people);
        const a = persons.find((p) => p.given === "A");
        const b = persons.find((p) => p.given === "B");
        if (!a || !b) throw new Error("missing persons");
        expect(a.spouseIds).toContain(b.id);
        expect(b.spouseIds).toContain(a.id);
    });

    it("accepts duplicate WIFE tags (same-sex marriage with shared child)", () => {
        const text = [
            "0 HEAD",
            "1 GEDC",
            "2 VERS 5.5.1",
            "0 @I1@ INDI",
            "1 NAME MomA /X/",
            "1 SEX F",
            "0 @I2@ INDI",
            "1 NAME MomB /X/",
            "1 SEX F",
            "0 @I3@ INDI",
            "1 NAME Kid /X/",
            "1 SEX F",
            "0 @F1@ FAM",
            "1 WIFE @I1@",
            "1 WIFE @I2@",
            "1 CHIL @I3@",
            "0 TRLR",
        ].join("\r\n");
        const r = unwrap(parseGedcom(text));
        expect(r.tree.couples).toHaveLength(1);
        const persons = Object.values(r.tree.people);
        const kid = persons.find((p) => p.given === "Kid");
        // bi-parent schema means only the first WIFE becomes the kid's mother
        expect(kid?.motherId).toBeDefined();
        expect(kid?.fatherId).toBeUndefined();
    });

    it("BIRT Y without DATE is tolerated (no birth recorded, no error)", () => {
        const text = [
            "0 HEAD",
            "1 GEDC",
            "2 VERS 5.5.1",
            "0 @I1@ INDI",
            "1 NAME Anon /X/",
            "1 SEX M",
            "1 BIRT Y",
            "0 TRLR",
        ].join("\r\n");
        const r = unwrap(parseGedcom(text));
        const p = Object.values(r.tree.people)[0];
        expect(p?.birth).toBeUndefined();
        expect(r.findings.find((f) => f.kind === "bad-date")).toBeUndefined();
    });
});

describe("parseGedcom - example file", () => {
    const text = readFileSync(FIXTURE, "utf-8");
    const r = unwrap(parseGedcom(text));

    it("parses 1802 INDI records", () => {
        expect(Object.keys(r.tree.people)).toHaveLength(1802);
    });

    it("emits CoupleRecord only when both HUSB and WIFE are present", () => {
        // example file has 1185 FAM but only ~204 with both spouses; the rest
        // are single-parent stubs that still stitch parent links onto children
        expect(r.tree.couples.length).toBe(204);
    });

    it("stitches single-parent FAMs onto children's father/mother", () => {
        // at least one person should have a father or mother set even if the
        // GEDCOM did not list a spouse for that parent
        const linked = Object.values(r.tree.people).filter(
            (p) => p.fatherId !== undefined || p.motherId !== undefined,
        );
        expect(linked.length).toBeGreaterThan(1000);
    });

    it("preserves the HEAD record", () => {
        expect(r.head.children.length).toBeGreaterThan(0);
        const sour = r.head.children.find((c) => c.tag === "SOUR");
        expect(sour?.value).toBe("Family Echo");
    });

    it("emits no parse-blocking errors", () => {
        const blocking = r.findings.filter((f) => f.kind === "bad-date");
        expect(blocking).toEqual([]);
    });
});
