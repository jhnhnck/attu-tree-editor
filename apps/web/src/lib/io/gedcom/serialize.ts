/*
 * FamilyTreeEditor - GEDCOM 5.5.1 serializer; deterministic xrefs, CRLF, HEAD round-trip
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { TreeNode } from "read-gedcom";
import { HaracalndeDate } from "$lib/date/HaracalndeDate";
import type { CoupleRecord, Person, PersonId, Tree } from "$lib/domain/types";
import { getParents } from "$lib/domain/tree";
import type { GedHead } from "$lib/io/gedcom/parse";

export interface GedSerializeOptions {
    head?: GedHead;
    /** Map from person id to original xref (e.g. "@I12@"); fresh xrefs allocated for the rest. */
    xrefByPersonId?: Record<PersonId, string>;
    /**
     * Map from person id to a media path inside the bundle (e.g. "media/abc.webp").
     * When supplied, the serializer emits `1 OBJE / 2 FILE <path>` under the
     * matching INDI so the GEDCOM stream references the bundled portrait
     * the same way GEDZIP readers expect.
     */
    portraitMediaPathById?: Record<PersonId, string>;
}

const LINE_END = "\r\n";

export function serializeGedcom(tree: Tree, opts: GedSerializeOptions = {}): string {
    const lines: string[] = [];

    // HEAD: verbatim if provided, else default
    if (opts.head) {
        lines.push("0 HEAD");
        appendChildren(lines, opts.head.children, 1);
    } else {
        lines.push(...defaultHead(tree.name));
    }

    // assign xrefs
    const personIds = Object.keys(tree.people).sort();
    const xrefByPerson = assignPersonXrefs(personIds, opts.xrefByPersonId);

    // emit INDI records in xref order so reparse-then-emit is byte-stable
    // (domain ids are random; xrefs are preserved through round-trip)
    const xrefSorted = [...xrefByPerson.entries()].sort(
        (a, b) => xrefSortKey(a[1]) - xrefSortKey(b[1]),
    );

    // FAM records: derive first so we can emit FAMC links from each INDI
    // back to its matching FAM (needed for the PEDI standard-tag fallback).
    const families = deriveFamilies(tree, xrefByPerson);
    const famXrefByGroupKey = new Map<string, string>();
    for (let i = 0; i < families.length; i += 1) {
        const fam = families[i]!;
        famXrefByGroupKey.set(famGroupKey(fam.husbIds, fam.wifeIds), `@F${String(i + 1)}@`);
    }
    const famXrefByChildId = buildFamByChildId(tree, famXrefByGroupKey);

    const portraitMediaPath = opts.portraitMediaPathById ?? {};
    for (const [pid] of xrefSorted) {
        const person = tree.people[pid];
        const xref = xrefByPerson.get(pid);
        if (!person || !xref) continue;
        appendIndi(
            lines,
            person,
            xref,
            xrefByPerson,
            portraitMediaPath[pid],
            famXrefByChildId.get(pid),
        );
    }

    let famCounter = 1;
    for (const fam of families) {
        appendFam(lines, fam, xrefByPerson, famCounter);
        famCounter += 1;
    }

    lines.push("0 TRLR");
    return lines.join(LINE_END) + LINE_END;
}

/** Numeric sort key for `@I123@`-style xrefs so 2 < 10 (not "10" < "2"). */
function xrefSortKey(xref: string): number {
    const m = /^@I(\d+)@$/.exec(xref);
    if (!m) return Number.MAX_SAFE_INTEGER;
    return Number(m[1]);
}

function assignPersonXrefs(
    personIds: PersonId[],
    preferred?: Record<PersonId, string>,
): Map<PersonId, string> {
    const out = new Map<PersonId, string>();
    const used = new Set<string>();

    if (preferred) {
        for (const pid of personIds) {
            const x = preferred[pid];
            if (x && !used.has(x)) {
                out.set(pid, x);
                used.add(x);
            }
        }
    }

    let counter = 1;
    for (const pid of personIds) {
        if (out.has(pid)) continue;
        let xref = `@I${String(counter)}@`;
        while (used.has(xref)) {
            counter += 1;
            xref = `@I${String(counter)}@`;
        }
        out.set(pid, xref);
        used.add(xref);
        counter += 1;
    }

    return out;
}

interface DerivedFamily {
    /** Allows 0, 1, or 2+ for same-sex / polyamorous unions. */
    husbIds: PersonId[];
    wifeIds: PersonId[];
    childIds: PersonId[];
    /**
     * The CoupleRecord whose marriage metadata (date, _PRIMARY, _CURRENT)
     * should be emitted under this FAM. unset when this FAM was synthesised
     * purely from observed (mother, father) pairings on children with no
     * explicit CoupleRecord backing it.
     */
    couple?: CoupleRecord;
}

/** Canonical group key shared by deriveFamilies + the FAMC lookup pass. */
function famGroupKey(husbIds: readonly PersonId[], wifeIds: readonly PersonId[]): string {
    return `${[...husbIds].sort().join(",")}|${[...wifeIds].sort().join(",")}`;
}

/**
 * Map each child personId to the FAM xref it belongs in (for INDI-side
 * FAMC + PEDI emit). Mirrors deriveFamilies' role/gender lookup so the
 * same child lands in the same FAM in both passes.
 */
function buildFamByChildId(
    tree: Tree,
    famXrefByKey: ReadonlyMap<string, string>,
): Map<PersonId, string> {
    const out = new Map<PersonId, string>();
    for (const person of Object.values(tree.people)) {
        const refs = getParents(person);
        if (refs.length === 0) continue;
        const husbIds: PersonId[] = [];
        const wifeIds: PersonId[] = [];
        for (const ref of refs) {
            const parent = tree.people[ref.personId];
            if (ref.role === "mother") wifeIds.push(ref.personId);
            else if (ref.role === "father") husbIds.push(ref.personId);
            else if (parent?.gender === "f") wifeIds.push(ref.personId);
            else husbIds.push(ref.personId);
        }
        const x = famXrefByKey.get(famGroupKey(husbIds, wifeIds));
        if (x) out.set(person.id, x);
    }
    return out;
}

function deriveFamilies(tree: Tree, xrefByPerson: Map<PersonId, string>): DerivedFamily[] {
    const groups = new Map<string, DerivedFamily>();

    const groupKey = famGroupKey;

    // group children by parent set - each ParentRef maps to a HUSB or WIFE
    // slot using role hint, falling back to the parent's gender. Multi-parent
    // children (>2 refs) still produce one FAM here; Phase 2b.3 adds the
    // _TREES_PARENT_REF extension and per-parent FAMC fallbacks for the
    // non-traditional cases.
    for (const person of Object.values(tree.people)) {
        const refs = getParents(person);
        if (refs.length === 0) continue;
        const husbIds: PersonId[] = [];
        const wifeIds: PersonId[] = [];
        for (const ref of refs) {
            const parent = tree.people[ref.personId];
            if (ref.role === "mother") wifeIds.push(ref.personId);
            else if (ref.role === "father") husbIds.push(ref.personId);
            else if (parent?.gender === "f") wifeIds.push(ref.personId);
            else husbIds.push(ref.personId);
        }
        const key = groupKey(husbIds, wifeIds);
        let group = groups.get(key);
        if (!group) {
            group = { husbIds, wifeIds, childIds: [] };
            groups.set(key, group);
        }
        group.childIds.push(person.id);
    }

    // add explicit couples; same-sex pairs produce duplicate HUSB or WIFE.
    // attach the CoupleRecord so MARR/_PRIMARY/_CURRENT round-trip out
    for (const couple of tree.couples) {
        const left = tree.people[couple.leftId];
        const right = tree.people[couple.rightId];
        if (!left || !right) continue;

        const { husbIds, wifeIds } = assignSpouseRoles(
            couple.leftId,
            left.gender,
            couple.rightId,
            right.gender,
        );
        const key = groupKey(husbIds, wifeIds);
        let group = groups.get(key);
        if (!group) {
            group = { husbIds, wifeIds, childIds: [] };
            groups.set(key, group);
        }
        // first matching CoupleRecord wins; rare polyamorous overlaps where
        // two CoupleRecords share the same FAM grouping all share the same
        // marital metadata in practice, so this collision is benign
        if (group.couple === undefined) group.couple = couple;
    }

    // sort families and children by xref so the order is stable across reparse
    const xrefOrZ = (pid: PersonId): string => xrefByPerson.get(pid) ?? "~";
    const famSortKey = (fam: DerivedFamily): string => {
        // `~` placeholder when a role is empty so single-HUSB / single-WIFE
        // FAMs sort the same way the original mixed-pair grouping did
        const h = fam.husbIds.length > 0 ? fam.husbIds.map(xrefOrZ).sort().join(",") : "~";
        const w = fam.wifeIds.length > 0 ? fam.wifeIds.map(xrefOrZ).sort().join(",") : "~";
        return `${h}|${w}`;
    };

    const out = [...groups.values()];
    for (const fam of out) {
        fam.husbIds.sort((a, b) => xrefSortStr(xrefOrZ(a), xrefOrZ(b)));
        fam.wifeIds.sort((a, b) => xrefSortStr(xrefOrZ(a), xrefOrZ(b)));
        fam.childIds.sort((a, b) => xrefSortStr(xrefOrZ(a), xrefOrZ(b)));
    }
    out.sort((a, b) => xrefSortStr(famSortKey(a), famSortKey(b)));
    return out;
}

function xrefSortStr(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Maps a domain spouse pair onto GEDCOM HUSB/WIFE roles. Same-gender pairs
 * place both ids in the same role array (duplicate HUSB or WIFE - tolerated
 * by every modern parser including ours, normalized further in GEDCOM 7).
 */
function assignSpouseRoles(
    leftId: PersonId,
    leftGender: string,
    rightId: PersonId,
    rightGender: string,
): { husbIds: PersonId[]; wifeIds: PersonId[] } {
    if (leftGender === "f" && rightGender === "f") {
        return { husbIds: [], wifeIds: [leftId, rightId] };
    }
    if (leftGender === "m" && rightGender === "m") {
        return { husbIds: [leftId, rightId], wifeIds: [] };
    }
    // mixed (any combination of m / f / u): female -> WIFE, everyone else -> HUSB
    const husbIds: PersonId[] = [];
    const wifeIds: PersonId[] = [];
    if (leftGender === "f") wifeIds.push(leftId);
    else husbIds.push(leftId);
    if (rightGender === "f") wifeIds.push(rightId);
    else husbIds.push(rightId);
    return { husbIds, wifeIds };
}

function appendIndi(
    lines: string[],
    person: Person,
    xref: string,
    xrefByPerson: Map<PersonId, string>,
    portraitMediaPath: string | undefined,
    famXref: string | undefined,
): void {
    lines.push(`0 ${xref} INDI`);

    // NAME with subtags
    const nameValue = `${person.given} /${person.surname}/`.trim();
    lines.push(`1 NAME ${nameValue}`);
    if (person.given.length > 0) lines.push(`2 GIVN ${person.given}`);
    if (person.surname.length > 0) lines.push(`2 SURN ${person.surname}`);
    if (person.title !== undefined) lines.push(`2 NPFX ${person.title}`);

    // SEX (GEDCOM 7 vocabulary: M/F/X/U; today's 3-enum maps to M/F/U.
    // Proper SEX X for non-binary identity lands with the gender struct in
    // relationship-vocabulary Phase 5.)
    if (person.gender === "m") lines.push("1 SEX M");
    else if (person.gender === "f") lines.push("1 SEX F");
    else lines.push("1 SEX U");

    // BIRT / DEAT
    if (person.birth) {
        lines.push("1 BIRT");
        lines.push(`2 DATE ${HaracalndeDate.of(person.birth).toGedcom()}`);
    }
    if (person.death) {
        lines.push("1 DEAT Y");
        lines.push(`2 DATE ${HaracalndeDate.of(person.death).toGedcom()}`);
    }

    if (person.occupation !== undefined) lines.push(`1 OCCU ${person.occupation}`);

    // OBJE / FILE: portrait media reference. only emitted when the caller
    // (bundle/write.ts) hands us a path; bare GEDCOM serialisation has no
    // bundled media to point at and skips the block.
    if (portraitMediaPath !== undefined) {
        lines.push("1 OBJE");
        lines.push(`2 FILE ${portraitMediaPath}`);
    }

    // FAMC + PEDI fallback (Phase 2b.3 standard-tag fallback). One FAMC
    // pointing at the FAM grouping this child's parent set; PEDI emits the
    // strongest non-birth pedigree found across the parent refs so other
    // GEDCOM tools see "adopted" / "foster" / "sealing" rather than
    // collapsing to the default "birth". Non-standard pedi values
    // (chosen / magical / cloned / hatched / summoned / manufactured)
    // omit the PEDI tag (no standard mapping); the _TREES_PARENT_REF
    // extension below carries the full fidelity.
    const refs = getParents(person);
    if (famXref !== undefined && refs.length > 0) {
        lines.push(`1 FAMC ${famXref}`);
        const standardPedi = pickStandardPedi(refs);
        if (standardPedi !== undefined) lines.push(`2 PEDI ${standardPedi}`);
    }

    // _TREES_PARENT_REF extension (Phase 2b.3 full fidelity). One entry
    // per ParentRef with role + pedi. Registered via HEAD.SCHMA from the
    // Phase 0 namespace; tools that don't know the extension strip these
    // lines and fall back to the FAMC + PEDI emit above.
    for (const ref of refs) {
        const px = xrefByPerson.get(ref.personId);
        if (px === undefined) continue;
        lines.push(`1 _TREES_PARENT_REF ${px}`);
        if (ref.role !== undefined) lines.push(`2 _ROLE ${ref.role}`);
        if (ref.pedi !== undefined) lines.push(`2 _PEDI ${ref.pedi}`);
    }
}

/**
 * Map relationship-vocabulary ParentPedi values to the standard GEDCOM
 * PEDI vocabulary (birth / adopted / foster / sealing). Returns
 * undefined when every ref is `birth` (the GEDCOM default — omit the
 * tag) OR when no ref's pedi maps to a standard value. Non-standard
 * pedi values are preserved only through the _TREES_PARENT_REF
 * extension; this function deliberately drops them from the standard
 * fallback so a strict GEDCOM 5.5.1 parser sees a clean file.
 */
function pickStandardPedi(refs: readonly { pedi?: string }[]): string | undefined {
    // Prefer adopted > foster > sealing > (birth omits).
    const ranked = ["adopted", "foster", "sealing"] as const;
    const seen = new Set<string>();
    for (const r of refs) {
        if (r.pedi === "sealed") seen.add("sealing");
        else if (r.pedi === "adopted" || r.pedi === "foster") seen.add(r.pedi);
    }
    for (const v of ranked) if (seen.has(v)) return v;
    return undefined;
}

function appendFam(
    lines: string[],
    fam: DerivedFamily,
    xrefByPerson: Map<PersonId, string>,
    famNumber: number,
): void {
    const xref = `@F${String(famNumber)}@`;
    lines.push(`0 ${xref} FAM`);
    for (const hid of fam.husbIds) {
        const x = xrefByPerson.get(hid);
        if (x) lines.push(`1 HUSB ${x}`);
    }
    for (const wid of fam.wifeIds) {
        const x = xrefByPerson.get(wid);
        if (x) lines.push(`1 WIFE ${x}`);
    }
    for (const cid of fam.childIds) {
        const x = xrefByPerson.get(cid);
        if (x) lines.push(`1 CHIL ${x}`);
    }

    // marital metadata (round-trip MARR / _PRIMARY / _CURRENT). only emitted
    // when an explicit CoupleRecord backs this FAM; FAMs synthesised purely
    // from observed (mother, father) pairings on children carry no metadata
    const couple = fam.couple;
    if (couple !== undefined) {
        if (couple.marriageDate !== undefined) {
            lines.push("1 MARR");
            lines.push(`2 DATE ${HaracalndeDate.of(couple.marriageDate).toGedcom()}`);
        }
        if (couple.isCurrent !== undefined) {
            lines.push(`1 _CURRENT ${couple.isCurrent ? "Y" : "N"}`);
        }
        if (couple.isPrimary !== undefined) {
            lines.push(`1 _PRIMARY ${couple.isPrimary ? "Y" : "N"}`);
        }
    }
}

function appendChildren(lines: string[], nodes: readonly TreeNode[], level: number): void {
    for (const node of nodes) {
        if (node.tag === null) continue;
        const ptr = node.pointer ? ` ${node.pointer}` : "";
        const value = node.value !== null && node.value !== "" ? ` ${node.value}` : "";
        lines.push(`${String(level)}${ptr} ${node.tag}${value}`);
        appendChildren(lines, node.children, level + 1);
    }
}

function defaultHead(treeName: string): string[] {
    return [
        "0 HEAD",
        "1 SOUR FamilyTreeEditor",
        "2 WWW https://github.com/attu-project/FamilyTreeEditor",
        `1 FILE ${treeName}`,
        "1 GEDC",
        "2 VERS 5.5.1",
        "2 FORM LINEAGE-LINKED",
        "1 CHAR UTF-8",
    ];
}
