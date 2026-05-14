/*
 * FamilyTreeEditor - GEDCOM 5.5.1 serializer; deterministic xrefs, CRLF, HEAD round-trip
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { TreeNode } from "read-gedcom";
import { HaracalndeDate } from "$lib/date/HaracalndeDate";
import type { CoupleRecord, Person, PersonId, Tree } from "$lib/domain/types";
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

    const portraitMediaPath = opts.portraitMediaPathById ?? {};
    for (const [pid] of xrefSorted) {
        const person = tree.people[pid];
        const xref = xrefByPerson.get(pid);
        if (!person || !xref) continue;
        appendIndi(lines, person, xref, xrefByPerson, portraitMediaPath[pid]);
    }

    // FAM records: derived from EVERY (mother, father) pairing observed on children
    // plus any explicit CoupleRecord (which contributes spouse links and metadata)
    const families = deriveFamilies(tree, xrefByPerson);
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

function deriveFamilies(tree: Tree, xrefByPerson: Map<PersonId, string>): DerivedFamily[] {
    const groups = new Map<string, DerivedFamily>();

    // single canonical key shape so a couple with children (added in the
    // children pass) and the same couple as an explicit CoupleRecord (added in
    // the couples pass) coalesce into one FAM
    const groupKey = (husbIds: PersonId[], wifeIds: PersonId[]): string =>
        `${[...husbIds].sort().join(",")}|${[...wifeIds].sort().join(",")}`;

    // group children by (fatherId, motherId) tuple - bi-parent schema means
    // each child contributes at most one HUSB and one WIFE
    for (const person of Object.values(tree.people)) {
        if (!person.motherId && !person.fatherId) continue;
        const husbIds = person.fatherId ? [person.fatherId] : [];
        const wifeIds = person.motherId ? [person.motherId] : [];
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

    // FAMS / FAMC links omitted intentionally: read-gedcom does not require them
    // (they're a redundancy; HUSB/WIFE/CHIL on the FAM side carries the same info)
    // and including them would require we know which FAM xref each person belongs to.
    void xrefByPerson;
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
