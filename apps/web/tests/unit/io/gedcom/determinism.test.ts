/*
 * FamilyTreeEditor - tests that parseGedcom is fully deterministic.
 *
 * Before the Phase-4 fix, person ids were drawn from `generateId` (crypto
 * source), so the same input bytes produced a different `rootId` and a
 * different `xrefByPersonId` mapping on every call. Tests and spikes that
 * pinned identity across parses broke. The fix derives ids from the GEDCOM
 * xref via FNV-1a, so identical bytes always parse to identical trees.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";

const SAMPLE = `0 HEAD
1 SOUR FamilyTreeEditor
0 @I1@ INDI
1 NAME Alice /Doe/
1 FAMS @F1@
0 @I2@ INDI
1 NAME Bob /Doe/
1 FAMS @F1@
0 @I3@ INDI
1 NAME Carol /Doe/
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 CHIL @I3@
0 TRLR
`;

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

describe("parseGedcom determinism", () => {
    it("produces the same tree on repeated parses of identical bytes", () => {
        const a = unwrap(parseGedcom(SAMPLE));
        const b = unwrap(parseGedcom(SAMPLE));
        expect(b.tree.rootId).toBe(a.tree.rootId);
        expect(Object.keys(b.tree.people).sort()).toEqual(Object.keys(a.tree.people).sort());
        expect(b.xrefByPersonId).toEqual(a.xrefByPersonId);
    });

    it("maps the GEDCOM xref to a stable id across parses", () => {
        const a = unwrap(parseGedcom(SAMPLE));
        const b = unwrap(parseGedcom(SAMPLE));
        const invA: Record<string, string> = {};
        for (const [pid, xref] of Object.entries(a.xrefByPersonId)) invA[xref] = pid;
        const invB: Record<string, string> = {};
        for (const [pid, xref] of Object.entries(b.xrefByPersonId)) invB[xref] = pid;
        expect(invB).toEqual(invA);
    });
});
