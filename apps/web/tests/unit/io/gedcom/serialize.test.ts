/*
 * FamilyTreeEditor - GEDCOM serializer + golden round-trip
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { serializeGedcom } from "$lib/io/gedcom/serialize";
import type { Tree } from "$lib/domain/types";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");
const GOLDEN = resolve(process.cwd(), "tests/fixtures/golden/Akarians.canonical.ged");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(`expected ok, got err: ${r.error}`);
    return r.value;
}

function tinyTree(): Tree {
    return {
        id: "test",
        name: "Tiny",
        rootId: "AAAAA",
        people: {
            AAAAA: {
                id: "AAAAA",
                given: "Dad",
                surname: "X",
                gender: "m",
                spouseIds: ["BBBBB"],
                display: "z1",
                birth: { era: "PC", year: 5, month: 6, day: 15 },
            },
            BBBBB: {
                id: "BBBBB",
                given: "Mom",
                surname: "Y",
                gender: "f",
                spouseIds: ["AAAAA"],
                display: "z1",
            },
            CCCCC: {
                id: "CCCCC",
                given: "Kid",
                surname: "X",
                gender: "f",
                fatherId: "AAAAA",
                motherId: "BBBBB",
                spouseIds: [],
                display: "z1",
            },
        },
        couples: [{ leftId: "AAAAA", rightId: "BBBBB", unionIndex: 0, childIds: ["CCCCC"] }],
        rev: 0,
        updatedAt: 0,
    };
}

describe("serializeGedcom - synthetic", () => {
    it("emits a tree with HEAD, INDI*N, FAM, TRLR", () => {
        const out = serializeGedcom(tinyTree());
        expect(out.startsWith("0 HEAD\r\n")).toBe(true);
        expect(out.endsWith("0 TRLR\r\n")).toBe(true);
        expect(out).toContain("0 @I1@ INDI");
        expect(out).toContain("0 @F1@ FAM");
        expect(out).toContain("1 HUSB @I1@");
        expect(out).toContain("1 WIFE @I2@");
        expect(out).toContain("1 CHIL @I3@");
    });

    it("emits BIRT/DEAT with DATE child", () => {
        const out = serializeGedcom(tinyTree());
        expect(out).toContain("1 BIRT\r\n2 DATE 15 JUN 0005");
    });

    it("emits duplicate HUSB tags for a same-sex (m+m) couple", () => {
        const tree: Tree = {
            id: "x",
            name: "ssm",
            rootId: "AAAAA",
            people: {
                AAAAA: {
                    id: "AAAAA",
                    given: "A",
                    surname: "X",
                    gender: "m",
                    spouseIds: ["BBBBB"],
                    display: "z1",
                },
                BBBBB: {
                    id: "BBBBB",
                    given: "B",
                    surname: "X",
                    gender: "m",
                    spouseIds: ["AAAAA"],
                    display: "z1",
                },
            },
            couples: [{ leftId: "AAAAA", rightId: "BBBBB", unionIndex: 0, childIds: [] }],
            rev: 0,
            updatedAt: 0,
        };
        const out = serializeGedcom(tree);
        const husbLines = out.split("\r\n").filter((l) => l.startsWith("1 HUSB "));
        expect(husbLines).toHaveLength(2);
        expect(out).not.toContain("1 WIFE");
    });

    it("emits duplicate WIFE tags for a same-sex (f+f) couple", () => {
        const tree: Tree = {
            id: "x",
            name: "ssm",
            rootId: "AAAAA",
            people: {
                AAAAA: {
                    id: "AAAAA",
                    given: "A",
                    surname: "X",
                    gender: "f",
                    spouseIds: ["BBBBB"],
                    display: "z1",
                },
                BBBBB: {
                    id: "BBBBB",
                    given: "B",
                    surname: "X",
                    gender: "f",
                    spouseIds: ["AAAAA"],
                    display: "z1",
                },
            },
            couples: [{ leftId: "AAAAA", rightId: "BBBBB", unionIndex: 0, childIds: [] }],
            rev: 0,
            updatedAt: 0,
        };
        const out = serializeGedcom(tree);
        const wifeLines = out.split("\r\n").filter((l) => l.startsWith("1 WIFE "));
        expect(wifeLines).toHaveLength(2);
        expect(out).not.toContain("1 HUSB");
    });

    it("derives single-parent FAM from a child with only a fatherId", () => {
        const base = tinyTree();
        const kid = base.people.CCCCC;
        if (!kid) throw new Error("fixture missing CCCCC");
        delete kid.motherId;
        base.couples = [];
        const out = serializeGedcom(base);
        expect(out).toContain("0 @F1@ FAM");
        expect(out).toContain("1 HUSB @I1@");
        expect(out).not.toContain("1 WIFE @I2@");
    });

    it("emits MARR with DATE when CoupleRecord carries a marriage date", () => {
        const base = tinyTree();
        const couple = base.couples[0];
        if (!couple) throw new Error("fixture missing couple");
        couple.marriageDate = { era: "PC", year: 10, month: 4, day: 1 };
        const out = serializeGedcom(base);
        expect(out).toContain("1 MARR\r\n2 DATE 1 APR 0010");
    });

    it("emits _CURRENT and _PRIMARY when CoupleRecord carries them", () => {
        const base = tinyTree();
        const couple = base.couples[0];
        if (!couple) throw new Error("fixture missing couple");
        couple.isCurrent = true;
        couple.isPrimary = false;
        const out = serializeGedcom(base);
        expect(out).toContain("1 _CURRENT Y");
        expect(out).toContain("1 _PRIMARY N");
    });

    it("does not emit MARR / _CURRENT / _PRIMARY for FAMs synthesized purely from child links", () => {
        const base = tinyTree();
        // wipe the explicit couple; the FAM is then derived purely from the
        // (motherId, fatherId) on CCCCC
        base.couples = [];
        const out = serializeGedcom(base);
        expect(out).not.toContain("1 MARR");
        expect(out).not.toContain("1 _CURRENT");
        expect(out).not.toContain("1 _PRIMARY");
    });

    it("emits OBJE / FILE for persons whose portrait media path is supplied", () => {
        const out = serializeGedcom(tinyTree(), {
            portraitMediaPathById: { AAAAA: "media/AAAAA.webp" },
        });
        expect(out).toContain("1 OBJE\r\n2 FILE media/AAAAA.webp");
        // BBBBB has no portrait → no OBJE under their INDI
        const indiB = out.split("0 @I2@ INDI")[1]?.split("0 @")[0] ?? "";
        expect(indiB).not.toContain("OBJE");
    });
});

describe("serializeGedcom - golden snapshot", () => {
    it("parse-then-serialize is byte-stable through a second round-trip", async () => {
        const input = readFileSync(FIXTURE, "utf-8");
        const r1 = unwrap(parseGedcom(input));
        const out1 = serializeGedcom(r1.tree, {
            head: r1.head,
            xrefByPersonId: r1.xrefByPersonId,
        });
        await expect(out1).toMatchFileSnapshot(GOLDEN);

        const r2 = unwrap(parseGedcom(out1));
        const out2 = serializeGedcom(r2.tree, {
            head: r2.head,
            xrefByPersonId: r2.xrefByPersonId,
        });
        expect(out2).toBe(out1);
    });
});
