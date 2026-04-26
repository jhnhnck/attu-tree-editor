/*
 * FamilyTreeEditor - dual-import merge unit tests + the example real-world merge
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFamilyScript } from "$lib/io/familyscript/parse";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { mergeTrees } from "$lib/io/merge/merge";
import type { Person, Tree } from "$lib/domain/types";

const FS_FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.txt");
const GED_FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(`expected ok, got err: ${r.error}`);
    return r.value;
}

function bare(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function singleTree(id: string, p: Omit<Person, "id">): Tree {
    return {
        id: `t-${id}`,
        name: "single",
        rootId: id,
        people: { [id]: { ...p, id } },
        couples: [],
        rev: 0,
        updatedAt: 0,
    };
}

describe("mergeTrees - synthetic", () => {
    it("merges two empty-ish trees with disjoint people", () => {
        const a = singleTree("AAAAA", bare("Alpha", "m"));
        const b = singleTree("BBBBB", bare("Beta", "f"));
        const r = mergeTrees({ tree: a, source: "familyscript" }, { tree: b, source: "gedcom" });
        expect(Object.keys(r.tree.people)).toHaveLength(2);
        const unmatched = r.findings.filter((f) => f.kind === "unmatched-person");
        expect(unmatched).toHaveLength(1);
    });

    it("matches identical persons by name + birth/death year", () => {
        const personA: Person = {
            id: "AAAAA",
            given: "Kadar",
            surname: "Arkaran",
            gender: "m",
            birth: { era: "TT", year: 1822 },
            spouseIds: [],
            display: "z1",
        };
        const personB: Person = {
            id: "ZZZZZ",
            given: "Kadar",
            surname: "Arkaran",
            gender: "m",
            birth: { era: "TT", year: 1822, month: 11, day: 12, approximate: true },
            spouseIds: [],
            display: "z1",
        };
        const a = singleTree("AAAAA", personA);
        const b = singleTree("ZZZZZ", personB);
        const r = mergeTrees({ tree: a, source: "familyscript" }, { tree: b, source: "gedcom" });
        expect(Object.keys(r.tree.people)).toHaveLength(1);
        const merged = r.tree.people["AAAAA"];
        expect(merged?.birth?.month).toBe(11);
        expect(merged?.birth?.day).toBe(12);
        expect(merged?.birth?.approximate).toBe(true);
    });

    it("emits field-conflict and resolves per preferOnConflict", () => {
        const personA: Person = {
            id: "AAAAA",
            given: "Kadar",
            surname: "Arkaran",
            gender: "m",
            birth: { era: "TT", year: 1822 },
            spouseIds: [],
            display: "z1",
        };
        const personB: Person = {
            id: "BBBBB",
            given: "Kadar",
            surname: "Different",
            gender: "m",
            birth: { era: "TT", year: 1822 },
            spouseIds: [],
            display: "z1",
        };
        // need same match key, so match must be on given+surname+year - but surnames differ
        // → won't match. Use the same surname for the test, with a different field instead:
        personB.surname = "Arkaran";
        personB.title = "Different Title";
        personA.title = "Original Title";

        const a = singleTree("AAAAA", personA);
        const b = singleTree("BBBBB", personB);
        const r = mergeTrees(
            { tree: a, source: "familyscript" },
            { tree: b, source: "gedcom" },
            { preferOnConflict: "gedcom" },
        );
        expect(Object.keys(r.tree.people)).toHaveLength(1);
        expect(r.tree.people["AAAAA"]?.title).toBe("Different Title");
        const conflict = r.findings.find((f) => f.kind === "field-conflict");
        expect(conflict).toBeDefined();
    });

    it("unions spouseIds from both sides", () => {
        const personA: Person = {
            id: "AAAAA",
            given: "Kadar",
            surname: "X",
            gender: "m",
            spouseIds: ["XXXXX"],
            display: "z1",
        };
        const personB: Person = {
            id: "AAAAA",
            given: "Kadar",
            surname: "X",
            gender: "m",
            spouseIds: ["YYYYY"],
            display: "z1",
        };
        const a = singleTree("AAAAA", personA);
        const b = singleTree("AAAAA", personB);
        const r = mergeTrees({ tree: a, source: "familyscript" }, { tree: b, source: "gedcom" });
        expect(r.tree.people["AAAAA"]?.spouseIds.sort()).toEqual(["XXXXX", "YYYYY"]);
    });
});

describe("mergeTrees - example dual import", () => {
    it("merges Akarians.txt + Akarians.ged into one tree", () => {
        const fsText = readFileSync(FS_FIXTURE, "utf-8");
        const gedText = readFileSync(GED_FIXTURE, "utf-8");

        const fsR = unwrap(parseFamilyScript(fsText));
        const gedR = unwrap(parseGedcom(gedText));

        const merged = mergeTrees(
            { tree: fsR.tree, source: "familyscript" },
            { tree: gedR.tree, source: "gedcom" },
        );

        const totalA = Object.keys(fsR.tree.people).length; // 1776
        const totalB = Object.keys(gedR.tree.people).length; // 1802
        const totalMerged = Object.keys(merged.tree.people).length;

        // merge should be richer than either source but bounded above by the union
        expect(totalMerged).toBeGreaterThan(totalA);
        expect(totalMerged).toBeLessThanOrEqual(totalA + totalB);

        // some persons should have been matched (both files describe the same family)
        const matched = totalA + totalB - totalMerged;
        expect(matched).toBeGreaterThan(100);
    });
});
