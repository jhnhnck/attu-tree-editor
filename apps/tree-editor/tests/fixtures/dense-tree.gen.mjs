/*
 * FamilyTreeEditor - dense-tree fixture generator (phase 1, wave 2).
 *
 * Emits `dense-tree.ged`, a deterministic 52-person pedigree designed to
 * exceed the family-view 50-card AUTO_COLLAPSE_THRESHOLD on the default
 * bounded subset around its root, so the collapse-badge code path is
 * exercised end-to-end. Re-running this script produces byte-identical
 * output; if you bump the structure, re-run and commit both files in
 * the same change.
 *
 *   node apps/web/tests/fixtures/dense-tree.gen.mjs
 *
 * Tree shape (52 individuals, 13 FAMs):
 *
 *   gen -3: 8 great-grandparents (I030..I037)
 *   gen -2: 4 grandparents + 8 of their siblings  = 12 visible
 *   gen -1: 2 parents + 8 of their siblings       = 10 visible
 *   gen  0: focus + 6 siblings                    =  7 visible
 *   gen +1: 5 children of focus                   =  5 visible
 *   gen +2: 10 grandchildren                      = 10 visible
 *                                                   ---
 *                                                   52 visible
 *
 * Single-parent FAMs (F08..F13) for descendant lines so partners don't
 * blow up the count further; spouses stay out of the bounded subset.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "dense-tree.ged");

const id = (n) => `@I${String(n).padStart(3, "0")}@`;
const fid = (n) => `@F${String(n).padStart(2, "0")}@`;

// individual specs: { n, given, surname, sex, birth, fams: [], famc: null|fid }
const people = [];
const push = (spec) => {
    people.push(spec);
};

// gen 0 — focus + 6 siblings (children of F07; focus is the proband)
push({ n: 1, given: "Root", surname: "Smith", sex: "M", birth: 1500, famc: 7, fams: [8] });
push({ n: 2, given: "Sib1", surname: "Smith", sex: "F", birth: 1498, famc: 7 });
push({ n: 3, given: "Sib2", surname: "Smith", sex: "M", birth: 1496, famc: 7 });
push({ n: 4, given: "Sib3", surname: "Smith", sex: "F", birth: 1502, famc: 7 });
push({ n: 5, given: "Sib4", surname: "Smith", sex: "M", birth: 1504, famc: 7 });
push({ n: 6, given: "Sib5", surname: "Smith", sex: "F", birth: 1506, famc: 7 });
push({ n: 7, given: "Sib6", surname: "Smith", sex: "M", birth: 1508, famc: 7 });

// gen -1 — parents (F07 husb+wife) + their siblings
push({ n: 8, given: "Father", surname: "Smith", sex: "M", birth: 1470, famc: 5, fams: [7] });
push({ n: 9, given: "Mother", surname: "Doe", sex: "F", birth: 1475, famc: 6, fams: [7] });
push({ n: 10, given: "Uncle1", surname: "Smith", sex: "M", birth: 1468, famc: 5 });
push({ n: 11, given: "Uncle2", surname: "Smith", sex: "F", birth: 1472, famc: 5 });
push({ n: 12, given: "Uncle3", surname: "Smith", sex: "M", birth: 1474, famc: 5 });
push({ n: 13, given: "Uncle4", surname: "Smith", sex: "F", birth: 1476, famc: 5 });
push({ n: 14, given: "Aunt1", surname: "Doe", sex: "F", birth: 1473, famc: 6 });
push({ n: 15, given: "Aunt2", surname: "Doe", sex: "M", birth: 1477, famc: 6 });
push({ n: 16, given: "Aunt3", surname: "Doe", sex: "F", birth: 1479, famc: 6 });
push({ n: 17, given: "Aunt4", surname: "Doe", sex: "M", birth: 1481, famc: 6 });

// gen -2 — 4 grandparents + 8 of their siblings
// paternal-paternal pair (F01) -> grandfather I018 + sibs I022, I023
// paternal-maternal pair (F02) -> grandmother I019 + sibs I024, I025
// maternal-paternal pair (F03) -> grandfather I020 + sibs I026, I027
// maternal-maternal pair (F04) -> grandmother I021 + sibs I028, I029
push({ n: 18, given: "GPpat", surname: "Smith", sex: "M", birth: 1440, famc: 1, fams: [5] });
push({ n: 19, given: "GMpat", surname: "Reed", sex: "F", birth: 1445, famc: 2, fams: [5] });
push({ n: 20, given: "GPmat", surname: "Doe", sex: "M", birth: 1442, famc: 3, fams: [6] });
push({ n: 21, given: "GMmat", surname: "Park", sex: "F", birth: 1448, famc: 4, fams: [6] });
push({ n: 22, given: "GSibA1", surname: "Smith", sex: "F", birth: 1443, famc: 1 });
push({ n: 23, given: "GSibA2", surname: "Smith", sex: "M", birth: 1446, famc: 1 });
push({ n: 24, given: "GSibB1", surname: "Reed", sex: "M", birth: 1447, famc: 2 });
push({ n: 25, given: "GSibB2", surname: "Reed", sex: "F", birth: 1449, famc: 2 });
push({ n: 26, given: "GSibC1", surname: "Doe", sex: "F", birth: 1444, famc: 3 });
push({ n: 27, given: "GSibC2", surname: "Doe", sex: "M", birth: 1446, famc: 3 });
push({ n: 28, given: "GSibD1", surname: "Park", sex: "M", birth: 1450, famc: 4 });
push({ n: 29, given: "GSibD2", surname: "Park", sex: "F", birth: 1452, famc: 4 });

// gen -3 — 8 great-grandparents
push({ n: 30, given: "GGP1", surname: "Smith", sex: "M", birth: 1410, fams: [1] });
push({ n: 31, given: "GGP2", surname: "Vale", sex: "F", birth: 1415, fams: [1] });
push({ n: 32, given: "GGP3", surname: "Reed", sex: "M", birth: 1412, fams: [2] });
push({ n: 33, given: "GGP4", surname: "Hill", sex: "F", birth: 1418, fams: [2] });
push({ n: 34, given: "GGP5", surname: "Doe", sex: "M", birth: 1414, fams: [3] });
push({ n: 35, given: "GGP6", surname: "Lane", sex: "F", birth: 1419, fams: [3] });
push({ n: 36, given: "GGP7", surname: "Park", sex: "M", birth: 1416, fams: [4] });
push({ n: 37, given: "GGP8", surname: "Sage", sex: "F", birth: 1421, fams: [4] });

// gen +1 — focus's 5 children (single-parent FAM F08; spouses omitted)
push({ n: 38, given: "Child1", surname: "Smith", sex: "F", birth: 1530, famc: 8, fams: [9] });
push({ n: 39, given: "Child2", surname: "Smith", sex: "M", birth: 1532, famc: 8, fams: [10] });
push({ n: 40, given: "Child3", surname: "Smith", sex: "F", birth: 1534, famc: 8, fams: [11] });
push({ n: 41, given: "Child4", surname: "Smith", sex: "M", birth: 1536, famc: 8, fams: [12] });
push({ n: 42, given: "Child5", surname: "Smith", sex: "F", birth: 1538, famc: 8, fams: [13] });

// gen +2 — 10 grandchildren (2 per child, single-parent FAMs F09..F13)
push({ n: 43, given: "GC01", surname: "Smith", sex: "M", birth: 1560, famc: 9 });
push({ n: 44, given: "GC02", surname: "Smith", sex: "F", birth: 1562, famc: 9 });
push({ n: 45, given: "GC03", surname: "Smith", sex: "M", birth: 1564, famc: 10 });
push({ n: 46, given: "GC04", surname: "Smith", sex: "F", birth: 1566, famc: 10 });
push({ n: 47, given: "GC05", surname: "Smith", sex: "M", birth: 1568, famc: 11 });
push({ n: 48, given: "GC06", surname: "Smith", sex: "F", birth: 1570, famc: 11 });
push({ n: 49, given: "GC07", surname: "Smith", sex: "M", birth: 1572, famc: 12 });
push({ n: 50, given: "GC08", surname: "Smith", sex: "F", birth: 1574, famc: 12 });
push({ n: 51, given: "GC09", surname: "Smith", sex: "M", birth: 1576, famc: 13 });
push({ n: 52, given: "GC10", surname: "Smith", sex: "F", birth: 1578, famc: 13 });

// FAM specs: { f, husb, wife|null, children: [] }
const fams = [
    { f: 1, husb: 30, wife: 31, children: [18, 22, 23] },
    { f: 2, husb: 32, wife: 33, children: [19, 24, 25] },
    { f: 3, husb: 34, wife: 35, children: [20, 26, 27] },
    { f: 4, husb: 36, wife: 37, children: [21, 28, 29] },
    { f: 5, husb: 18, wife: 19, children: [8, 10, 11, 12, 13] },
    { f: 6, husb: 20, wife: 21, children: [9, 14, 15, 16, 17] },
    { f: 7, husb: 8, wife: 9, children: [1, 2, 3, 4, 5, 6, 7] },
    { f: 8, husb: 1, wife: null, children: [38, 39, 40, 41, 42] },
    { f: 9, husb: 38, wife: null, children: [43, 44] },
    { f: 10, husb: 39, wife: null, children: [45, 46] },
    { f: 11, husb: 40, wife: null, children: [47, 48] },
    { f: 12, husb: 41, wife: null, children: [49, 50] },
    { f: 13, husb: 42, wife: null, children: [51, 52] },
];

const lines = [];
lines.push("0 HEAD");
lines.push("1 SOUR FamilyTreeEditor");
lines.push("1 GEDC");
lines.push("2 VERS 5.5.1");
lines.push("2 FORM LINEAGE-LINKED");
lines.push("1 CHAR UTF-8");

for (const p of people) {
    lines.push(`0 ${id(p.n)} INDI`);
    lines.push(`1 NAME ${p.given} /${p.surname}/`);
    lines.push(`1 SEX ${p.sex}`);
    lines.push("1 BIRT");
    lines.push(`2 DATE ${p.birth}`);
    if (p.famc !== undefined && p.famc !== null) lines.push(`1 FAMC ${fid(p.famc)}`);
    for (const f of p.fams ?? []) lines.push(`1 FAMS ${fid(f)}`);
}

for (const fm of fams) {
    lines.push(`0 ${fid(fm.f)} FAM`);
    if (fm.husb !== null) lines.push(`1 HUSB ${id(fm.husb)}`);
    if (fm.wife !== null) lines.push(`1 WIFE ${id(fm.wife)}`);
    for (const c of fm.children) lines.push(`1 CHIL ${id(c)}`);
}

lines.push("0 TRLR");

const text = lines.join("\n") + "\n";
writeFileSync(OUT, text, "utf8");
process.stdout.write(
    `wrote ${OUT} (${String(people.length)} indi, ${String(fams.length)} fam, ${String(text.length)} bytes)\n`,
);
