/*
 * FamilyTreeEditor - GEDCOM 5.5.1 serializer; deterministic xrefs, CRLF, HEAD round-trip
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { TreeNode } from "read-gedcom";
import { HaracalndeDate } from "$lib/date/HaracalndeDate";
import type { CoupleRecord, Person, PersonId, Tree } from "$lib/domain/types";
import { getParents } from "$lib/domain/tree";
import {
    getAssignedAtBirth,
    getFluid,
    getIdentity,
    getPronouns,
    legacyGenderCode,
} from "$lib/domain/personIdentity";
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

    // N>2-partner unions: emit `_TREES_UNION` top-level records (full
    // fidelity). 2-partner unions are already covered by the standard
    // FAM blocks above. The extension format mirrors `_TREES_PARENT_REF`
    // — registered via HEAD.SCHMA, stripped by tools that don't know it,
    // and re-imported by FamilyTree Editor for full round-trip.
    let unionCounter = 1;
    for (const u of tree.unions ?? []) {
        if (u.partnerIds.length <= 2) continue;
        appendUnion(lines, u, xrefByPerson, unionCounter);
        unionCounter += 1;
    }

    // Overlay relationships (Phase 4; schema 3.1.0). Emit each as a
    // `_TREES_REL` top-level record. The extension is additive — tools
    // that don't know the tag strip it; FamilyTree Editor re-imports
    // for full fidelity.
    let relCounter = 1;
    for (const r of tree.relationships ?? []) {
        appendRelationship(lines, r, xrefByPerson, relCounter);
        relCounter += 1;
    }

    // Groups (Phase 6a; schema 3.3.0). One `_TREES_GROUP` top-level
    // record per group. Same shape pattern as `_TREES_UNION` and
    // `_TREES_REL`: registered via HEAD.SCHMA, stripped by tools that
    // don't know it, re-imported by FamilyTree Editor for full
    // fidelity.
    let groupCounter = 1;
    for (const g of tree.groups ?? []) {
        appendGroup(lines, g, xrefByPerson, groupCounter);
        groupCounter += 1;
    }

    // Sibship decorators (Phase 6b; schema 3.4.0). One `_TREES_SIBSHIP`
    // top-level record per decorator. Members are emitted as INDI
    // xref pointers so the decorator survives stream-roundtrip even
    // when xrefs differ across writes.
    let sibshipCounter = 1;
    for (const d of tree.sibshipDecorators ?? []) {
        appendSibship(lines, d, xrefByPerson, sibshipCounter);
        sibshipCounter += 1;
    }

    lines.push("0 TRLR");
    return lines.join(LINE_END) + LINE_END;
}

function appendSibship(
    lines: string[],
    d: import("$lib/domain/types").SibshipDecorator,
    xrefByPerson: Map<PersonId, string>,
    sibshipNumber: number,
): void {
    const xref = `@S${String(sibshipNumber)}@`;
    lines.push(`0 ${xref} _TREES_SIBSHIP`);
    lines.push(`1 _KIND ${d.kind}`);
    for (const sid of d.sibIds) {
        const x = xrefByPerson.get(sid);
        if (x) lines.push(`1 _MEMBER ${x}`);
    }
    if (d.name !== undefined && d.name.length > 0) {
        lines.push(`1 _NAME ${d.name}`);
    }
}

function appendRelationship(
    lines: string[],
    rel: import("$lib/domain/types").Relationship,
    xrefByPerson: Map<PersonId, string>,
    relNumber: number,
): void {
    const xref = `@R${String(relNumber)}@`;
    lines.push(`0 ${xref} _TREES_REL`);
    lines.push(`1 _KIND ${rel.kind}`);
    for (const sid of rel.sourceIds) {
        const x = xrefByPerson.get(sid);
        if (x) lines.push(`1 _SOURCE ${x}`);
    }
    for (const tid of rel.targetIds) {
        const x = xrefByPerson.get(tid);
        if (x) lines.push(`1 _TARGET ${x}`);
    }
    if (rel.cause !== undefined && rel.cause.length > 0) {
        lines.push(`1 _CAUSE ${rel.cause}`);
    }
    if (rel.date !== undefined) {
        lines.push("1 DATE");
        lines.push(`2 DATE ${HaracalndeDate.of(rel.date).toGedcom()}`);
    }
    if (rel.notes !== undefined && rel.notes.length > 0) {
        lines.push(`1 _NOTES ${rel.notes}`);
    }
}

function appendGroup(
    lines: string[],
    group: import("$lib/domain/types").Group,
    xrefByPerson: Map<PersonId, string>,
    groupNumber: number,
): void {
    const xref = `@G${String(groupNumber)}@`;
    lines.push(`0 ${xref} _TREES_GROUP`);
    lines.push(`1 _NAME ${group.name}`);
    lines.push(`1 _KIND ${group.kind}`);
    for (const mid of group.memberIds) {
        const x = xrefByPerson.get(mid);
        if (x) lines.push(`1 _MEMBER ${x}`);
    }
    if (group.founderId !== undefined) {
        const x = xrefByPerson.get(group.founderId);
        if (x) lines.push(`1 _FOUNDER ${x}`);
    }
    if (group.frame !== undefined) {
        if (group.frame.style !== undefined) lines.push(`1 _FRAME_STYLE ${group.frame.style}`);
        if (group.frame.color !== undefined) lines.push(`1 _FRAME_COLOR ${group.frame.color}`);
    }
    if (group.armorial?.description !== undefined) {
        lines.push(`1 _ARMORIAL ${group.armorial.description}`);
    }
}

function appendUnion(
    lines: string[],
    union: import("$lib/domain/types").UnionRecord,
    xrefByPerson: Map<PersonId, string>,
    unionNumber: number,
): void {
    const xref = `@U${String(unionNumber)}@`;
    lines.push(`0 ${xref} _TREES_UNION`);
    for (const pid of union.partnerIds) {
        const x = xrefByPerson.get(pid);
        if (x) lines.push(`1 _PARTNER ${x}`);
    }
    for (const cid of union.childIds) {
        const x = xrefByPerson.get(cid);
        if (x) lines.push(`1 _CHIL ${x}`);
    }
    if (union.kind !== undefined) lines.push(`1 _KIND ${union.kind}`);
    if (union.closed !== undefined) lines.push(`1 _CLOSED ${union.closed ? "Y" : "N"}`);
    if (union.name !== undefined && union.name.length > 0) {
        lines.push(`1 _NAME ${union.name}`);
    }
    if (union.marriageDate !== undefined) {
        lines.push("1 MARR");
        lines.push(`2 DATE ${HaracalndeDate.of(union.marriageDate).toGedcom()}`);
    }
    if (union.isCurrent !== undefined) lines.push(`1 _CURRENT ${union.isCurrent ? "Y" : "N"}`);
    if (union.isPrimary !== undefined) lines.push(`1 _PRIMARY ${union.isPrimary ? "Y" : "N"}`);
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
            else if (parent && legacyGenderCode(parent) === "f") wifeIds.push(ref.personId);
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
            else if (parent && legacyGenderCode(parent) === "f") wifeIds.push(ref.personId);
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
            legacyGenderCode(left),
            couple.rightId,
            legacyGenderCode(right),
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

    // SEX (GEDCOM 7 vocabulary: M/F/X/U). Phase 5: non-canonical identity
    // strings (anything other than male/female/unknown) emit `SEX X` so the
    // standard tag carries a non-binary signal; the `_TREES_GENDER_IDENTITY`
    // extension below preserves the verbatim identity.
    appendSexLine(lines, person);

    // Phase 5: identity / pronouns / assignedAtBirth / fluid / species /
    // kind / origin extensions. Each emits a `_TREES_*` line for full
    // fidelity AND a structured NOTE so tools that strip extensions can
    // still surface the values on import.
    appendIdentityExtensions(lines, person);

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

    // _TREES_BIRTH_ORDER extension (Phase 6b; schema 3.4.0). 1-based
    // position within a sibship. Lossy without the extension — tools
    // that strip it lose the exact ordering; the BIRT/DATE date is
    // already emitted above and provides a coarser fallback.
    if (person.birthOrder !== undefined) {
        lines.push(`1 _TREES_BIRTH_ORDER ${String(person.birthOrder)}`);
    }
}

/**
 * Emit the GEDCOM 7 SEX line. Canonical identities map directly
 * (male → M, female → F, unknown → U); anything else emits `SEX X`
 * (GEDCOM 7's non-binary marker) so other tools surface the right
 * signal. The verbatim identity string round-trips through
 * `_TREES_GENDER_IDENTITY` below.
 */
function appendSexLine(lines: string[], person: Person): void {
    const identity = getIdentity(person);
    if (identity === "male") lines.push("1 SEX M");
    else if (identity === "female") lines.push("1 SEX F");
    else if (identity === "unknown") lines.push("1 SEX U");
    else lines.push("1 SEX X");
}

/**
 * Phase 5: emit identity / pronouns / assignedAtBirth / fluid / species /
 * kind / origin extensions on an INDI record. The `_TREES_*` lines carry
 * full fidelity; a structured NOTE block ("# trees: species=dragon")
 * mirrors the same values so tools that strip extensions still surface
 * them when re-reading the file by hand.
 */
function appendIdentityExtensions(lines: string[], person: Person): void {
    const identity = getIdentity(person);
    // Only emit the identity extension for non-canonical strings; canonical
    // male/female/unknown are already conveyed by the SEX M/F/U line above,
    // so emitting them again would just bloat the file and break byte-stable
    // round-trips on legacy trees that have no struct data to preserve.
    const isCanonical = identity === "male" || identity === "female" || identity === "unknown";
    if (!isCanonical) {
        lines.push(`1 _TREES_GENDER_IDENTITY ${identity}`);
    }
    const pronouns = getPronouns(person);
    if (pronouns !== undefined) lines.push(`1 _PRONOUNS ${pronouns}`);
    const aab = getAssignedAtBirth(person);
    if (aab !== undefined) lines.push(`1 _ASSIGNED_SEX ${aab}`);
    if (getFluid(person)) lines.push("1 _GENDER_FLUID Y");
    if (person.species !== undefined) lines.push(`1 _TREES_SPECIES ${person.species}`);
    if (person.kind !== undefined) lines.push(`1 _TREES_PERSON_KIND ${person.kind}`);
    if (person.origin?.kind !== undefined) {
        lines.push(`1 _TREES_ORIGIN ${person.origin.kind}`);
        if (person.origin.cause !== undefined) lines.push(`2 _CAUSE ${person.origin.cause}`);
        if (person.origin.date !== undefined) {
            lines.push("2 DATE");
            lines.push(`3 DATE ${HaracalndeDate.of(person.origin.date).toGedcom()}`);
        }
    }

    // structured NOTE fallback: stripping tools can still read these
    // `# trees:` prefixed lines on a manual re-read; they're skipped on
    // re-import because the `_TREES_*` extensions above are preferred.
    // Canonical identities don't appear here either — same reasoning as
    // the extension above (SEX already conveys them).
    const noteLines: string[] = [];
    if (!isCanonical) noteLines.push(`# trees: identity=${identity}`);
    if (pronouns !== undefined) noteLines.push(`# trees: pronouns=${pronouns}`);
    if (aab !== undefined) noteLines.push(`# trees: assignedAtBirth=${aab}`);
    if (getFluid(person)) noteLines.push("# trees: fluid=true");
    if (person.species !== undefined) noteLines.push(`# trees: species=${person.species}`);
    if (person.kind !== undefined) noteLines.push(`# trees: kind=${person.kind}`);
    if (person.origin?.kind !== undefined) {
        noteLines.push(`# trees: origin=${person.origin.kind}`);
    }
    if (noteLines.length > 0) {
        lines.push(`1 NOTE ${noteLines[0]}`);
        for (let i = 1; i < noteLines.length; i += 1) {
            lines.push(`2 CONT ${noteLines[i]}`);
        }
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
