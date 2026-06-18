/*
 * FamilyTreeEditor - FamilyScript phase-3 tag coverage: tags that already
 * have a domain slot (birth order, parent-set pedi codes, 2nd/3rd parent set).
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { parseFamilyScript } from "$lib/io/familyscript/parse";
import type { FsParseResult } from "$lib/io/familyscript/parse";

function unwrap(
    r: { ok: true; value: FsParseResult } | { ok: false; error: string },
): FsParseResult {
    if (!r.ok) throw new Error(`expected ok, got err: ${r.error}`);
    return r.value;
}

describe("FamilyScript phase 3 coverage", () => {
    describe("O - birth order", () => {
        it("maps O<int> to person.birthOrder", () => {
            const text = "iSTART\tpRoot\tgm\tz1\tO3";
            const r = unwrap(parseFamilyScript(text));
            expect(r.tree.people["START"]?.birthOrder).toBe(3);
        });

        it("floors decimal O values to int", () => {
            const text = "iSTART\tpRoot\tgm\tz1\tO2.7";
            const r = unwrap(parseFamilyScript(text));
            expect(r.tree.people["START"]?.birthOrder).toBe(2);
        });

        it("emits unknown-tag for non-numeric O", () => {
            const text = "iSTART\tpRoot\tgm\tz1\tOfirst";
            const r = unwrap(parseFamilyScript(text));
            expect(r.findings.find((f) => f.kind === "unknown-tag" && f.tag === "O")).toBeDefined();
        });
    });

    describe("V / W / Q - parent-set pedi codes", () => {
        it("maps Vb to ParentPedi 'birth' on the primary set", () => {
            const text = "iA\tpA\tgf\tz1\niSTART\tpKid\tgm\tz1\tmA\tVb";
            const r = unwrap(parseFamilyScript(text));
            expect(r.tree.people["START"]?.parentIds).toEqual([
                { personId: "A", role: "mother", pedi: "birth" },
            ]);
        });

        it("maps Va to 'adopted', Vf to 'foster'", () => {
            const adopted = unwrap(parseFamilyScript("iA\tpA\tgf\tz1\niSTART\tpK\tgm\tz1\tmA\tVa"));
            expect(adopted.tree.people["START"]?.parentIds?.[0]?.pedi).toBe("adopted");
            const foster = unwrap(parseFamilyScript("iA\tpA\tgf\tz1\niSTART\tpK\tgm\tz1\tmA\tVf"));
            expect(foster.tree.people["START"]?.parentIds?.[0]?.pedi).toBe("foster");
        });

        it("emits unknown-tag for unmappable codes and falls back to 'birth'", () => {
            // 'g' (godparent) has no canonical ParentPedi equivalent today.
            const r = unwrap(parseFamilyScript("iA\tpA\tgf\tz1\niSTART\tpK\tgm\tz1\tmA\tVg"));
            expect(r.findings.find((f) => f.kind === "unknown-tag" && f.tag === "V")).toBeDefined();
            expect(r.tree.people["START"]?.parentIds?.[0]?.pedi).toBe("birth");
        });

        it("applies W to the 2nd parent set; tag order is irrelevant", () => {
            // pedi appears before parents
            const t1 = "iA\tpA\tgf\tz1\niB\tpB\tgm\tz1\niSTART\tpK\tgu\tz1\tWa\tXA\tYB";
            const r1 = unwrap(parseFamilyScript(t1));
            expect(r1.tree.people["START"]?.parentIds).toEqual([
                { personId: "A", role: "mother", pedi: "adopted" },
                { personId: "B", role: "father", pedi: "adopted" },
            ]);
            // pedi appears after parents - same result
            const t2 = "iA\tpA\tgf\tz1\niB\tpB\tgm\tz1\niSTART\tpK\tgu\tz1\tXA\tYB\tWa";
            const r2 = unwrap(parseFamilyScript(t2));
            expect(r2.tree.people["START"]?.parentIds).toEqual(r1.tree.people["START"]?.parentIds);
        });
    });

    describe("X / Y / K / L - additional parent sets", () => {
        it("merges primary + 2nd + 3rd parent sets onto parentIds with correct roles", () => {
            const text = [
                "iM1\tpM1\tgf\tz1",
                "iF1\tpF1\tgm\tz1",
                "iM2\tpM2\tgf\tz1",
                "iF2\tpF2\tgm\tz1",
                "iM3\tpM3\tgf\tz1",
                "iF3\tpF3\tgm\tz1",
                "iSTART\tpKid\tgu\tz1\tmM1\tfF1\tVb\tXM2\tYF2\tWa\tKM3\tLF3\tQf",
            ].join("\n");
            const r = unwrap(parseFamilyScript(text));
            expect(r.tree.people["START"]?.parentIds).toEqual([
                { personId: "M1", role: "mother", pedi: "birth" },
                { personId: "F1", role: "father", pedi: "birth" },
                { personId: "M2", role: "mother", pedi: "adopted" },
                { personId: "F2", role: "father", pedi: "adopted" },
                { personId: "M3", role: "mother", pedi: "foster" },
                { personId: "F3", role: "father", pedi: "foster" },
            ]);
        });

        it("dedupes a parent that appears in two sets - first set wins", () => {
            // M1 listed as both primary mother and 2nd-set mother
            const text = [
                "iM1\tpM1\tgf\tz1",
                "iF2\tpF2\tgm\tz1",
                "iSTART\tpKid\tgu\tz1\tmM1\tVb\tXM1\tYF2\tWa",
            ].join("\n");
            const r = unwrap(parseFamilyScript(text));
            const refs = r.tree.people["START"]?.parentIds ?? [];
            const m1Refs = refs.filter((p) => p.personId === "M1");
            expect(m1Refs).toHaveLength(1);
            expect(m1Refs[0]?.pedi).toBe("birth");
        });
    });
});
