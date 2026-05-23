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
                parentIds: [
                    { personId: "AAAAA", role: "father", pedi: "birth" },
                    { personId: "BBBBB", role: "mother", pedi: "birth" },
                ],
                spouseIds: [],
                display: "z1",
            },
        },
        couples: [{ leftId: "AAAAA", rightId: "BBBBB", unionIndex: 0, childIds: ["CCCCC"] }],
        editRev: 0,
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
            editRev: 0,
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
            editRev: 0,
            updatedAt: 0,
        };
        const out = serializeGedcom(tree);
        const wifeLines = out.split("\r\n").filter((l) => l.startsWith("1 WIFE "));
        expect(wifeLines).toHaveLength(2);
        expect(out).not.toContain("1 HUSB");
    });

    it("derives single-parent FAM from a child with only a father parent ref", () => {
        const base = tinyTree();
        const kid = base.people.CCCCC;
        if (!kid) throw new Error("fixture missing CCCCC");
        kid.parentIds = (kid.parentIds ?? []).filter((r) => r.role !== "mother");
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
        // parentIds on CCCCC
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

    it("emits _TREES_PARENT_REF and FAMC+PEDI fallback for an adopted parent", () => {
        const base = tinyTree();
        const kid = base.people.CCCCC;
        if (!kid) throw new Error("fixture missing CCCCC");
        kid.parentIds = [
            { personId: "AAAAA", role: "father", pedi: "adopted" },
            { personId: "BBBBB", role: "mother", pedi: "birth" },
        ];
        const out = serializeGedcom(base);
        const indiKid = out.split("0 @I3@ INDI")[1]?.split("0 @")[0] ?? "";
        // standard fallback: FAMC + strongest non-birth PEDI (adopted wins)
        expect(indiKid).toContain("1 FAMC @F1@");
        expect(indiKid).toContain("2 PEDI adopted");
        // full-fidelity extension: one entry per ref with role + pedi
        expect(indiKid).toContain("1 _TREES_PARENT_REF @I1@\r\n2 _ROLE father\r\n2 _PEDI adopted");
        expect(indiKid).toContain("1 _TREES_PARENT_REF @I2@\r\n2 _ROLE mother\r\n2 _PEDI birth");
    });

    it("emits _TREES_PARENT_REF for non-standard pedi without polluting standard PEDI", () => {
        const base = tinyTree();
        const kid = base.people.CCCCC;
        if (!kid) throw new Error("fixture missing CCCCC");
        kid.parentIds = [{ personId: "AAAAA", role: "donor", pedi: "magical" }];
        base.couples = [];
        const out = serializeGedcom(base);
        const indiKid = out.split("0 @I3@ INDI")[1]?.split("0 @")[0] ?? "";
        // no standard mapping for magical → PEDI tag is omitted
        expect(indiKid).not.toContain("2 PEDI");
        // extension carries the full data
        expect(indiKid).toContain("1 _TREES_PARENT_REF @I1@\r\n2 _ROLE donor\r\n2 _PEDI magical");
    });

    it("round-trips role + pedi through serialize → parse → serialize", () => {
        // build a tree with mixed pedi values; emit, parse, emit again,
        // check the second emit still contains the full extension data.
        const base = tinyTree();
        const kid = base.people.CCCCC;
        if (!kid) throw new Error("fixture missing CCCCC");
        kid.parentIds = [
            { personId: "AAAAA", role: "father", pedi: "adopted" },
            { personId: "BBBBB", role: "donor", pedi: "magical" },
        ];
        const out1 = serializeGedcom(base);
        const r2 = unwrap(parseGedcom(out1));
        const kid2 = Object.values(r2.tree.people).find((p) => p.given === "Kid");
        if (!kid2) throw new Error("re-parsed Kid missing");
        const parents = kid2.parentIds ?? [];
        expect(parents).toHaveLength(2);
        const fatherRef = parents.find((r) => r.role === "father");
        const donorRef = parents.find((r) => r.role === "donor");
        expect(fatherRef?.pedi).toBe("adopted");
        expect(donorRef?.pedi).toBe("magical");
    });

    it("emits a top-level _TREES_UNION record for N>2-partner unions", () => {
        const base = tinyTree();
        base.unions = [
            {
                id: "union-1-test",
                partnerIds: ["AAAAA", "BBBBB", "CCCCC"],
                childIds: [],
                kind: "civil",
                closed: true,
                name: "House Marvane",
            },
        ];
        const out = serializeGedcom(base);
        expect(out).toContain("0 @U1@ _TREES_UNION");
        expect(out).toContain("1 _PARTNER @I1@");
        expect(out).toContain("1 _PARTNER @I2@");
        expect(out).toContain("1 _PARTNER @I3@");
        expect(out).toContain("1 _KIND civil");
        expect(out).toContain("1 _CLOSED Y");
        expect(out).toContain("1 _NAME House Marvane");
    });

    it("emits and round-trips _TREES_REL overlay relationships (Phase 4)", () => {
        const base = tinyTree();
        base.relationships = [
            {
                id: "rel-1",
                kind: "sworn-bond",
                sourceIds: ["AAAAA"],
                targetIds: ["BBBBB"],
                cause: "battle of two flags",
            },
            {
                id: "rel-2",
                kind: "transformed-from",
                sourceIds: ["AAAAA"],
                targetIds: ["CCCCC"],
                notes: "phoenix arc",
            },
        ];
        const out = serializeGedcom(base);
        expect(out).toContain("0 @R1@ _TREES_REL");
        expect(out).toContain("1 _KIND sworn-bond");
        expect(out).toContain("1 _SOURCE @I1@");
        expect(out).toContain("1 _TARGET @I2@");
        expect(out).toContain("0 @R2@ _TREES_REL");
        expect(out).toContain("1 _KIND transformed-from");
        expect(out).toContain("1 _NOTES phoenix arc");

        const r = unwrap(parseGedcom(out));
        const rels = r.tree.relationships ?? [];
        expect(rels).toHaveLength(2);
        const sworn = rels.find((rel) => rel.kind === "sworn-bond");
        expect(sworn).toBeDefined();
        expect(sworn?.cause).toBe("battle of two flags");
        const transformed = rels.find((rel) => rel.kind === "transformed-from");
        expect(transformed?.notes).toBe("phoenix arc");
    });

    it("round-trips a 3-partner UnionRecord through serialize → parse", () => {
        const base = tinyTree();
        base.unions = [
            {
                id: "union-1-test",
                partnerIds: ["AAAAA", "BBBBB", "CCCCC"],
                childIds: [],
                kind: "ritual",
                closed: true,
                name: "Triad",
            },
        ];
        const out = serializeGedcom(base);
        const r = unwrap(parseGedcom(out));
        expect(r.tree.unions).toBeDefined();
        const triad = (r.tree.unions ?? []).find((u) => u.partnerIds.length === 3);
        expect(triad).toBeDefined();
        if (!triad) return;
        expect(triad.partnerIds).toHaveLength(3);
        expect(triad.kind).toBe("ritual");
        expect(triad.closed).toBe(true);
        expect(triad.name).toBe("Triad");
    });
});

describe("serializeGedcom - Phase 5 identity / species / kind / origin extensions", () => {
    it("emits SEX X for a non-canonical identity string", () => {
        const base = tinyTree();
        base.people["AAAAA"]!.gender = { identity: "agender" };
        const out = serializeGedcom(base);
        const indiA = out.split("0 @I1@ INDI")[1]?.split("0 @")[0] ?? "";
        expect(indiA).toContain("1 SEX X");
        expect(indiA).toContain("1 _TREES_GENDER_IDENTITY agender");
    });

    it("emits SEX M / F / U for canonical identities, NO extension line", () => {
        const base = tinyTree();
        base.people["AAAAA"]!.gender = { identity: "male" };
        base.people["BBBBB"]!.gender = { identity: "female" };
        const out = serializeGedcom(base);
        const indiA = out.split("0 @I1@ INDI")[1]?.split("0 @")[0] ?? "";
        const indiB = out.split("0 @I2@ INDI")[1]?.split("0 @")[0] ?? "";
        expect(indiA).toContain("1 SEX M");
        expect(indiB).toContain("1 SEX F");
        // canonical identities (male / female / unknown) skip
        // `_TREES_GENDER_IDENTITY` — SEX M/F/U already conveys them and
        // emitting the extension would just bloat byte-stable round-trips
        // on legacy trees with no real struct data.
        expect(indiA).not.toContain("_TREES_GENDER_IDENTITY");
        expect(indiB).not.toContain("_TREES_GENDER_IDENTITY");
    });

    it("emits pronouns / assignedAtBirth / fluid extensions when set", () => {
        const base = tinyTree();
        base.people["AAAAA"]!.gender = {
            identity: "male",
            pronouns: "he/they",
            assignedAtBirth: "AFAB",
            fluid: true,
        };
        const out = serializeGedcom(base);
        const indiA = out.split("0 @I1@ INDI")[1]?.split("0 @")[0] ?? "";
        expect(indiA).toContain("1 _PRONOUNS he/they");
        expect(indiA).toContain("1 _ASSIGNED_SEX AFAB");
        expect(indiA).toContain("1 _GENDER_FLUID Y");
    });

    it("emits species / kind / origin extensions when set", () => {
        const base = tinyTree();
        base.people["AAAAA"]!.species = "dragon";
        base.people["AAAAA"]!.kind = "spirit";
        base.people["AAAAA"]!.origin = { kind: "summoned", cause: "ritual of binding" };
        const out = serializeGedcom(base);
        const indiA = out.split("0 @I1@ INDI")[1]?.split("0 @")[0] ?? "";
        expect(indiA).toContain("1 _TREES_SPECIES dragon");
        expect(indiA).toContain("1 _TREES_PERSON_KIND spirit");
        expect(indiA).toContain("1 _TREES_ORIGIN summoned");
        expect(indiA).toContain("2 _CAUSE ritual of binding");
    });

    it("emits a structured NOTE fallback alongside the _TREES_* extensions", () => {
        const base = tinyTree();
        base.people["AAAAA"]!.gender = { identity: "agender", fluid: true };
        base.people["AAAAA"]!.species = "dragon";
        const out = serializeGedcom(base);
        const indiA = out.split("0 @I1@ INDI")[1]?.split("0 @")[0] ?? "";
        expect(indiA).toContain("1 NOTE # trees: identity=agender");
        expect(indiA).toContain("# trees: fluid=true");
        expect(indiA).toContain("# trees: species=dragon");
    });

    it("round-trips a full identity payload through serialize → parse", () => {
        const base = tinyTree();
        base.people["AAAAA"]!.gender = {
            identity: "agender",
            pronouns: "they/them",
            assignedAtBirth: "AMAB",
            fluid: true,
        };
        base.people["AAAAA"]!.species = "dragon";
        base.people["AAAAA"]!.kind = "spirit";
        base.people["AAAAA"]!.origin = { kind: "summoned" };
        const out = serializeGedcom(base);
        const r = unwrap(parseGedcom(out));
        const p = Object.values(r.tree.people).find((x) => x.given === "Dad");
        expect(p).toBeDefined();
        if (!p) return;
        expect(p.gender).toEqual({
            identity: "agender",
            pronouns: "they/them",
            assignedAtBirth: "AMAB",
            fluid: true,
        });
        expect(p.species).toBe("dragon");
        expect(p.kind).toBe("spirit");
        expect(p.origin?.kind).toBe("summoned");
    });

    it("legacy m/f/u gender survives a round-trip as the same legacy code", () => {
        const base = tinyTree();
        // tinyTree() ships AAAAA = "m"; with no _TREES_GENDER_IDENTITY in
        // the round-trip (canonical identities skip the extension), the
        // file carries only SEX M and re-parse produces legacy "m". Trees
        // edited through the inspector to a non-canonical identity DO get
        // the extension and round-trip to a struct (see the "full identity
        // payload" test above).
        const out = serializeGedcom(base);
        const r = unwrap(parseGedcom(out));
        const p = Object.values(r.tree.people).find((x) => x.given === "Dad");
        expect(p).toBeDefined();
        if (!p) return;
        expect(p.gender).toBe("m");
    });
});

describe("serializeGedcom - Phase 6a group extensions", () => {
    it("emits a top-level _TREES_GROUP record per group", () => {
        const base = tinyTree();
        base.groups = [
            {
                id: "group-house-marvane-3",
                name: "House Marvane",
                kind: "house",
                memberIds: ["AAAAA", "BBBBB", "CCCCC"],
                founderId: "AAAAA",
                frame: { style: "hull", color: "#cc4444" },
                armorial: { description: "azure, three estoiles or" },
            },
        ];
        const out = serializeGedcom(base);
        expect(out).toContain("0 @G1@ _TREES_GROUP");
        expect(out).toContain("1 _NAME House Marvane");
        expect(out).toContain("1 _KIND house");
        expect(out).toContain("1 _MEMBER @I1@");
        expect(out).toContain("1 _MEMBER @I2@");
        expect(out).toContain("1 _MEMBER @I3@");
        expect(out).toContain("1 _FOUNDER @I1@");
        expect(out).toContain("1 _FRAME_STYLE hull");
        expect(out).toContain("1 _FRAME_COLOR #cc4444");
        expect(out).toContain("1 _ARMORIAL azure, three estoiles or");
    });

    it("round-trips a group through serialize → parse", () => {
        const base = tinyTree();
        base.groups = [
            {
                id: "g1",
                name: "Order of the Loom",
                kind: "order",
                memberIds: ["AAAAA", "BBBBB"],
                frame: { style: "band" },
            },
        ];
        const out = serializeGedcom(base);
        const r = unwrap(parseGedcom(out));
        const g = (r.tree.groups ?? []).find((x) => x.name === "Order of the Loom");
        expect(g).toBeDefined();
        if (!g) return;
        expect(g.kind).toBe("order");
        expect(g.memberIds).toHaveLength(2);
        expect(g.frame?.style).toBe("band");
    });

    it("drops a group whose name or kind is missing on re-parse (permissive)", () => {
        const base = tinyTree();
        // Manually inject a malformed record to verify the parser's tolerance.
        const out = serializeGedcom(base).replace(
            "0 TRLR",
            "0 @Gbad@ _TREES_GROUP\r\n1 _NAME only-name\r\n0 TRLR",
        );
        const r = unwrap(parseGedcom(out));
        expect(r.tree.groups ?? []).toEqual([]);
    });
});

describe("serializeGedcom - Phase 6b sibship + birthOrder extensions", () => {
    it("emits a top-level _TREES_SIBSHIP record per decorator", () => {
        const base = tinyTree();
        base.sibshipDecorators = [
            {
                id: "sibship-twins-MZ-AAAAA-BBBBB",
                kind: "twins-MZ",
                sibIds: ["AAAAA", "BBBBB"],
                name: "the twins",
            },
        ];
        const out = serializeGedcom(base);
        expect(out).toContain("0 @S1@ _TREES_SIBSHIP");
        expect(out).toContain("1 _KIND twins-MZ");
        expect(out).toContain("1 _MEMBER @I1@");
        expect(out).toContain("1 _MEMBER @I2@");
        expect(out).toContain("1 _NAME the twins");
    });

    it("emits _TREES_BIRTH_ORDER under the INDI it applies to", () => {
        const base = tinyTree();
        base.people["CCCCC"]!.birthOrder = 2;
        const out = serializeGedcom(base);
        expect(out).toContain("1 _TREES_BIRTH_ORDER 2");
    });

    it("round-trips a sibship + birthOrder through serialize → parse", () => {
        const base = tinyTree();
        base.sibshipDecorators = [
            { id: "s1", kind: "triplets-MZ", sibIds: ["AAAAA", "BBBBB", "CCCCC"] },
        ];
        base.people["AAAAA"]!.birthOrder = 1;
        base.people["BBBBB"]!.birthOrder = 2;
        base.people["CCCCC"]!.birthOrder = 3;
        const out = serializeGedcom(base);
        const r = unwrap(parseGedcom(out));
        const d = (r.tree.sibshipDecorators ?? []).find((x) => x.kind === "triplets-MZ");
        expect(d).toBeDefined();
        expect(d?.sibIds).toHaveLength(3);
        const orders = Object.values(r.tree.people)
            .map((p) => p.birthOrder)
            .filter((b): b is number => b !== undefined)
            .sort();
        expect(orders).toEqual([1, 2, 3]);
    });

    it("drops a sibship whose kind is missing on re-parse (permissive)", () => {
        const base = tinyTree();
        const out = serializeGedcom(base).replace(
            "0 TRLR",
            "0 @Sbad@ _TREES_SIBSHIP\r\n1 _MEMBER @I1@\r\n0 TRLR",
        );
        const r = unwrap(parseGedcom(out));
        expect(r.tree.sibshipDecorators ?? []).toEqual([]);
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
