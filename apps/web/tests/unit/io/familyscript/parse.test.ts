/*
 * FamilyTreeEditor - FamilyScript parser unit tests
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFamilyScript } from "$lib/io/familyscript/parse";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.txt");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(`expected ok, got err: ${r.error}`);
    return r.value;
}

describe("parseFamilyScript - synthetic", () => {
    it("parses a single-person record with the canonical fields", () => {
        const text = "# Test\niSTART\tpKadar\tgm\tz1\tbB17570312\tlArkaran";
        const r = unwrap(parseFamilyScript(text));
        const p = r.tree.people["START"];
        expect(p).toBeDefined();
        expect(p?.given).toBe("Kadar");
        expect(p?.gender).toBe("m");
        expect(p?.display).toBe("z1");
        expect(p?.birth?.era).toBe("TT");
        expect(p?.birth?.year).toBe(1757);
        expect(p?.surname).toBe("Arkaran");
    });

    it("preserves header lines verbatim", () => {
        const text = "# Akarians\n#\n# downloaded by ...\niSTART\tpRoot\tgu\tz1";
        const r = unwrap(parseFamilyScript(text));
        expect(r.header.lines).toEqual(["# Akarians", "#", "# downloaded by ..."]);
    });

    it("parses each couple-record shape", () => {
        const text = [
            "iSTART\tpA\tgm\tz1",
            "iAAAAA\tpB\tgf\tz1",
            "iBBBBB\tpC\tgf\tz1",
            "iCCCCC\tpD\tgf\tz1",
            "iDDDDD\tpE\tgf\tz1",
            "pAAAAA START\te2",
            "pBBBBB START\te",
            "pCCCCC START\te1\tgm",
            "pDDDDD START\te2\tgm\tmEEEEE",
        ].join("\n");
        const r = unwrap(parseFamilyScript(text));
        expect(r.tree.couples).toHaveLength(4);
        expect(r.tree.couples[0]?.unionIndex).toBe(2);
        expect(r.tree.couples[1]?.unionIndex).toBe(0);
        expect(r.tree.couples[2]?.unionIndex).toBe(1);
        expect(r.tree.couples[3]?.childIds).toEqual(["EEEEE"]);
    });

    it("emits an unknown-tag finding for a stray leading char", () => {
        const text = "iSTART\tpRoot\tgm\tz1\tXunknown";
        const r = unwrap(parseFamilyScript(text));
        const f = r.findings.find((x) => x.kind === "unknown-tag");
        expect(f).toBeDefined();
    });

    it("emits a bad-date finding for a malformed date", () => {
        const text = "iSTART\tpRoot\tgm\tz1\tbB17572301";
        const r = unwrap(parseFamilyScript(text));
        const f = r.findings.find((x) => x.kind === "bad-date");
        expect(f).toBeDefined();
        if (f && f.kind === "bad-date") {
            expect(f.field).toBe("birth");
            expect(f.from).toBe("START");
        }
    });

    it("treats fully-zero date as date-absent", () => {
        const text = "iSTART\tpRoot\tgm\tz1\tb00000000";
        const r = unwrap(parseFamilyScript(text));
        expect(r.tree.people["START"]?.birth).toBeUndefined();
        expect(r.findings.find((x) => x.kind === "bad-date")).toBeUndefined();
    });

    it("preserves V tag as a person extra", () => {
        const text = "iSTART\tpRoot\tgm\tz1\tVb";
        const r = unwrap(parseFamilyScript(text));
        expect(r.personExtras["START"]).toEqual([{ tag: "V", value: "b" }]);
    });

    it("captures spouse ids on the s tag", () => {
        const text = "iSTART\tpRoot\tgm\tz1\tsAAAAA\tsBBBBB";
        const r = unwrap(parseFamilyScript(text));
        expect(r.tree.people["START"]?.spouseIds).toEqual(["AAAAA", "BBBBB"]);
    });
});

describe("parseFamilyScript - example file", () => {
    const text = readFileSync(FIXTURE, "utf-8");
    const r = unwrap(parseFamilyScript(text));

    it("parses 1776 person records", () => {
        expect(Object.keys(r.tree.people)).toHaveLength(1776);
    });

    it("parses 22 couple records", () => {
        expect(r.tree.couples).toHaveLength(22);
    });

    it("preserves the 8-line header", () => {
        expect(r.header.lines).toHaveLength(8);
        expect(r.header.lines[0]).toBe("# Akarians");
    });

    it("emits no blocking errors", () => {
        // some warnings are expected (orphan refs from intentionally-unlinked persons)
        // but no unknown-line or bad-date findings
        const blocking = r.findings.filter(
            (f) => f.kind === "unknown-line" || f.kind === "bad-date",
        );
        expect(blocking).toEqual([]);
    });

    it("records START as the root", () => {
        expect(r.tree.rootId).toBe("START");
    });
});
