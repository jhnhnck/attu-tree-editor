/*
 * FamilyTreeEditor - GEDCOM 5.5.1 parser; uses read-gedcom for tokenization, walks ourselves
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { parseGedcom as readGedcomParse } from "read-gedcom";
import type { TreeNode, TreeNodeRoot } from "read-gedcom";

import { HaracalndeDate } from "$lib/date/HaracalndeDate";
import { generateId } from "$lib/domain/ids";
import type { CoupleRecord, Person, PersonId, Tree } from "$lib/domain/types";
import { validate, type Finding } from "$lib/domain/validate";
import { err, ok, type Result } from "$lib/utils/result";

export interface GedHead {
    /** Verbatim GEDCOM children of the HEAD record for round-trip. */
    children: TreeNode[];
}

export interface GedParseResult {
    tree: Tree;
    head: GedHead;
    findings: Finding[];
    /**
     * Map from this parse's freshly-allocated person id back to the original
     * GEDCOM xref (e.g. `@I123@`). Useful for the merge module and for
     * preserving xref stability on re-export.
     */
    xrefByPersonId: Record<PersonId, string>;
}

export function parseGedcom(text: string): Result<GedParseResult, string> {
    const buffer = textToArrayBuffer(text);
    let root: TreeNodeRoot;
    try {
        root = readGedcomParse(buffer);
    } catch (e) {
        return err(`gedcom parse failed: ${String(e)}`);
    }
    return ok(buildTree(root));
}

function textToArrayBuffer(text: string): ArrayBuffer {
    // read-gedcom does its own encoding sniff (utf-8 / utf-16 / ascii / cp1252 / ansel)
    // we hand it raw bytes; here we encode the JS string as utf-8
    const bytes = new TextEncoder().encode(text);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function buildTree(root: TreeNodeRoot): GedParseResult {
    const findings: Finding[] = [];
    let head: GedHead = { children: [] };
    const indiNodes: TreeNode[] = [];
    const famNodes: TreeNode[] = [];

    for (const child of root.children) {
        switch (child.tag) {
            case "HEAD":
                head = { children: child.children };
                break;
            case "INDI":
                indiNodes.push(child);
                break;
            case "FAM":
                famNodes.push(child);
                break;
            case "TRLR":
            case "SUBM":
            case "SUBN":
            case "SOUR":
            case "REPO":
            case "NOTE":
                // top-level records other than INDI/FAM are dropped; we don't model them yet
                break;
            default:
                if (child.tag !== null) {
                    findings.push({
                        kind: "unknown-line",
                        line: `0 ${child.tag} ${child.value ?? ""}`.trim(),
                        lineNumber: child.indexSource + 1,
                    });
                }
        }
    }

    // Pass 1: persons. Allocate fresh ids and remember xref -> id.
    const idByXref = new Map<string, PersonId>();
    const xrefByPersonId: Record<PersonId, string> = {};
    const people: Record<PersonId, Person> = {};
    const taken = new Set<string>();

    for (const indi of indiNodes) {
        if (indi.pointer === null) continue;
        const personId = generateId(taken);
        taken.add(personId);
        idByXref.set(indi.pointer, personId);
        xrefByPersonId[personId] = indi.pointer;
        people[personId] = buildPerson(personId, indi, findings);
    }

    // Pass 2: families. Resolve HUSB/WIFE/CHIL xrefs and stitch into the persons.
    // FE exports a FAM for any parent-child relationship even when one parent is
    // unknown; we always stitch the available links onto children but only emit
    // a CoupleRecord when at least two spouses are present.
    const couples: CoupleRecord[] = [];
    for (const fam of famNodes) {
        couples.push(...applyFam(fam, idByXref, people, findings));
    }

    // pick a root: first INDI (xref @I1@ in FE exports is the file's "owner")
    const firstId = Object.keys(people)[0];
    const rootId = firstId ?? "START";

    const tree: Tree = {
        id: cryptoUuid(),
        name: deriveTreeName(head),
        rootId,
        people,
        couples,
        rev: 0,
        updatedAt: Date.now(),
    };

    findings.push(...validate(tree));

    if (findings.length > 0) console.warn("[io:gedcom] %d finding(s):", findings.length, findings);

    return { tree, head, findings, xrefByPersonId };
}

function buildPerson(id: PersonId, indi: TreeNode, findings: Finding[]): Person {
    const person: Person = {
        id,
        given: "",
        surname: "",
        gender: "u",
        spouseIds: [],
        display: "z1",
    };

    for (const sub of indi.children) {
        switch (sub.tag) {
            case "NAME":
                applyName(person, sub);
                break;
            case "SEX": {
                const v = sub.value?.toUpperCase() ?? "";
                person.gender = v === "M" ? "m" : v === "F" ? "f" : "u";
                break;
            }
            case "BIRT":
                applyEvent(person, "birth", sub, findings);
                break;
            case "DEAT":
                applyEvent(person, "death", sub, findings);
                break;
            case "OCCU":
                if (sub.value) person.occupation = sub.value;
                break;
            case "FAMC":
            case "FAMS":
                // resolved in pass 2
                break;
            case "OBJE":
                // portraits land in phase 4 alongside the bundle reader
                findings.push({ kind: "dropped-subtag", from: id, tag: "OBJE" });
                break;
            default:
                if (sub.tag !== null) {
                    findings.push({ kind: "dropped-subtag", from: id, tag: sub.tag });
                }
        }
    }

    return person;
}

function applyName(person: Person, name: TreeNode): void {
    // value form: `Given /Surname/`
    const raw = name.value ?? "";
    const m = /^(.*?)\s*\/(.*?)\/\s*(.*)$/.exec(raw);
    if (m) {
        if (m[1]) person.given = m[1].trim();
        if (m[2]) person.surname = m[2].trim();
    } else if (raw.length > 0) {
        person.given = raw;
    }

    // subtags override (more authoritative)
    for (const sub of name.children) {
        switch (sub.tag) {
            case "GIVN":
                if (sub.value) person.given = sub.value;
                break;
            case "SURN":
                if (sub.value) person.surname = sub.value;
                break;
            case "NPFX":
                if (sub.value) person.title = sub.value;
                break;
            case "_MARNM":
                if (sub.value) person.surname = sub.value;
                break;
            // ignore the rest (NICK, SPFX, NSFX) for now
        }
    }
}

function applyEvent(
    person: Person,
    field: "birth" | "death",
    event: TreeNode,
    findings: Finding[],
): void {
    for (const sub of event.children) {
        if (sub.tag === "DATE" && sub.value) {
            const parsed = HaracalndeDate.parseGedcom(sub.value);
            if (parsed.ok) {
                if (field === "birth") person.birth = parsed.value.toJSON();
                else person.death = parsed.value.toJSON();
            } else {
                findings.push({
                    kind: "bad-date",
                    from: person.id,
                    field,
                    raw: sub.value,
                    reason: parsed.error,
                });
            }
            return;
        }
    }
}

function applyFam(
    fam: TreeNode,
    idByXref: Map<string, PersonId>,
    people: Record<PersonId, Person>,
    findings: Finding[],
): CoupleRecord[] {
    const husbIds: PersonId[] = [];
    const wifeIds: PersonId[] = [];
    const childIds: PersonId[] = [];

    for (const sub of fam.children) {
        switch (sub.tag) {
            case "HUSB": {
                const xref = sub.value;
                if (xref) {
                    const id = idByXref.get(xref);
                    if (id) husbIds.push(id);
                }
                break;
            }
            case "WIFE": {
                const xref = sub.value;
                if (xref) {
                    const id = idByXref.get(xref);
                    if (id) wifeIds.push(id);
                }
                break;
            }
            case "CHIL": {
                const xref = sub.value;
                if (xref) {
                    const id = idByXref.get(xref);
                    if (id) childIds.push(id);
                }
                break;
            }
            case "MARR":
            case "_PRIMARY":
            case "_CURRENT":
            case "EVEN":
                if (fam.pointer && sub.tag) {
                    findings.push({
                        kind: "dropped-subtag",
                        from: fam.pointer,
                        tag: `FAM.${sub.tag}`,
                    });
                }
                break;
        }
    }

    // stitch parent links on every child. With multiple HUSB / WIFE (same-sex
    // co-parents) the bi-parent schema can only hold one of each role, so the
    // first HUSB becomes father and the first WIFE becomes mother.
    const primaryHusb = husbIds[0];
    const primaryWife = wifeIds[0];
    for (const cid of childIds) {
        const child = people[cid];
        if (!child) continue;
        if (primaryHusb && child.fatherId === undefined) child.fatherId = primaryHusb;
        if (primaryWife && child.motherId === undefined) child.motherId = primaryWife;
    }

    const allSpouseIds = [...husbIds, ...wifeIds];
    if (allSpouseIds.length < 2) return [];

    // link every spouse to every other (mutual marriage, including same-sex pairs
    // expressed as duplicate HUSB/WIFE)
    for (let i = 0; i < allSpouseIds.length; i += 1) {
        for (let j = i + 1; j < allSpouseIds.length; j += 1) {
            const aId = allSpouseIds[i];
            const bId = allSpouseIds[j];
            if (aId === undefined || bId === undefined) continue;
            const aPerson = people[aId];
            const bPerson = people[bId];
            if (aPerson && !aPerson.spouseIds.includes(bId)) aPerson.spouseIds.push(bId);
            if (bPerson && !bPerson.spouseIds.includes(aId)) bPerson.spouseIds.push(aId);
        }
    }

    // emit one CoupleRecord per pair so the explicit couple list stays accurate
    const couples: CoupleRecord[] = [];
    for (let i = 0; i < allSpouseIds.length; i += 1) {
        for (let j = i + 1; j < allSpouseIds.length; j += 1) {
            const leftId = allSpouseIds[i];
            const rightId = allSpouseIds[j];
            if (leftId === undefined || rightId === undefined) continue;
            // children attach only to the canonical first pair; secondary pairs
            // share the marital bond but the bi-parent schema can't claim
            // co-parentage on them
            const isPrimaryPair = i === 0 && j === 1;
            couples.push({
                leftId,
                rightId,
                unionIndex: 0,
                childIds: isPrimaryPair ? [...childIds] : [],
            });
        }
    }
    return couples;
}

function deriveTreeName(head: GedHead): string {
    for (const sub of head.children) {
        if (sub.tag === "FILE" && sub.value) return sub.value;
    }
    return "Imported tree";
}

function cryptoUuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `tree-${String(Date.now())}-${String(Math.floor(Math.random() * 1e9))}`;
}
