/*
 * FamilyTreeEditor - GEDCOM 5.5.1 parser; uses read-gedcom for tokenization, walks ourselves
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { parseGedcom as readGedcomParse } from "read-gedcom";
import type { TreeNode, TreeNodeRoot } from "read-gedcom";

import { HaracalndeDate } from "@attu/ui";
import { generateId } from "$lib/domain/ids";
import type {
    CoupleRecord,
    Group,
    GroupFrameStyle,
    ParentPedi,
    ParentRef,
    ParentRole,
    Person,
    PersonId,
    Relationship,
    RelationshipKind,
    SibshipDecorator,
    Tree,
    UnionKind,
    UnionRecord,
} from "$lib/domain/types";

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// FNV-1a 32-bit; produces a stable 5-char [A-Z0-9] id for the same xref input
// across runs. Used to fix the "different rootId per parse" bug — the previous
// `generateId(taken)` path drew from crypto, so identical GEDCOM bytes mapped
// to different person ids each parse (and so the rootId, derived from the
// first INDI, looked unstable to callers comparing parses).
function idFromXref(xref: string, taken: ReadonlySet<string>): PersonId {
    let salt = "";
    for (let attempt = 0; attempt < 1024; attempt += 1) {
        let h = 0x811c9dc5;
        const input = xref + salt;
        for (let i = 0; i < input.length; i += 1) {
            h ^= input.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        let bits = h >>> 0;
        let id = "";
        for (let i = 0; i < 5; i += 1) {
            id += ID_ALPHABET[bits % ID_ALPHABET.length] ?? "A";
            bits = Math.floor(bits / ID_ALPHABET.length);
        }
        if (!taken.has(id)) return id;
        salt = `:${String(attempt + 1)}`;
    }
    return generateId(taken);
}
import { validate, type Finding } from "$lib/domain/validate";
import { err, ok, type Result } from "@attu/ui";

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
    const unionNodes: TreeNode[] = [];
    const relNodes: TreeNode[] = [];
    const groupNodes: TreeNode[] = [];
    const sibshipNodes: TreeNode[] = [];

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
            case "_TREES_UNION":
                unionNodes.push(child);
                break;
            case "_TREES_REL":
                relNodes.push(child);
                break;
            case "_TREES_GROUP":
                groupNodes.push(child);
                break;
            case "_TREES_SIBSHIP":
                sibshipNodes.push(child);
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
    // raw _TREES_PARENT_REF data collected during pass 1; resolved after pass 2
    const pendingParentRefs = new Map<
        PersonId,
        Array<{ xref: string; role?: string; pedi?: string }>
    >();

    for (const indi of indiNodes) {
        if (indi.pointer === null) continue;
        const personId = idFromXref(indi.pointer, taken);
        taken.add(personId);
        idByXref.set(indi.pointer, personId);
        xrefByPersonId[personId] = indi.pointer;
        people[personId] = buildPerson(personId, indi, findings, pendingParentRefs);
    }

    // Pass 2: families. Resolve HUSB/WIFE/CHIL xrefs and stitch into the persons.
    // FE exports a FAM for any parent-child relationship even when one parent is
    // unknown; we always stitch the available links onto children but only emit
    // a CoupleRecord when at least two spouses are present.
    const couples: CoupleRecord[] = [];
    for (const fam of famNodes) {
        couples.push(...applyFam(fam, idByXref, people, findings));
    }

    // Pass 2b: resolve _TREES_PARENT_REF extensions. Override the role/pedi
    // written by FAM stitching with the full-fidelity data from the extension.
    for (const [personId, rawRefs] of pendingParentRefs) {
        const person = people[personId];
        if (!person) continue;
        for (const raw of rawRefs) {
            const parentId = idByXref.get(raw.xref);
            if (!parentId) continue;
            const role = raw.role as ParentRole | undefined;
            const pedi = raw.pedi as ParentPedi | undefined;
            const existing = person.parentIds ?? [];
            const idx = existing.findIndex((r) => r.personId === parentId);
            if (idx >= 0) {
                // update role/pedi in-place; extension wins over FAM default
                const updated = [...existing];
                updated[idx] = {
                    personId: parentId,
                    ...(role !== undefined ? { role } : {}),
                    ...(pedi !== undefined ? { pedi } : {}),
                };
                person.parentIds = updated;
            } else {
                const ref: ParentRef = { personId: parentId };
                if (role !== undefined) ref.role = role;
                if (pedi !== undefined) ref.pedi = pedi;
                person.parentIds = [...existing, ref];
            }
        }
    }

    // _TREES_UNION extensions: parse N>2-partner unions (top-level
    // `0 @Uxx@ _TREES_UNION` records). 2-partner unions stay covered by
    // the FAM blocks already parsed above. The extension carries the
    // full UnionRecord shape; HEAD.SCHMA registers the namespace.
    const unions: UnionRecord[] = [];
    for (const u of unionNodes) {
        const rec = parseTreesUnion(u, idByXref);
        if (rec) unions.push(rec);
    }

    // _TREES_REL extensions: parse overlay relationships (Phase 4;
    // schema 3.1.0). Each is a `0 @Rxx@ _TREES_REL` top-level record
    // with `_KIND` + `_SOURCE*` + `_TARGET*` + optional `_CAUSE` /
    // `DATE` / `_NOTES`.
    const relationships: Relationship[] = [];
    for (const r of relNodes) {
        const rec = parseTreesRel(r, idByXref);
        if (rec) relationships.push(rec);
    }

    // _TREES_GROUP extensions (Phase 6a; schema 3.3.0). Each is a
    // `0 @Gxx@ _TREES_GROUP` top-level record with `_NAME` / `_KIND` /
    // `_MEMBER*` / optional `_FOUNDER` / `_FRAME_STYLE` / `_FRAME_COLOR`
    // / `_ARMORIAL`. Tools that strip extensions render no group.
    const groups: Group[] = [];
    for (const gnode of groupNodes) {
        const rec = parseTreesGroup(gnode, idByXref);
        if (rec) groups.push(rec);
    }

    // _TREES_SIBSHIP extensions (Phase 6b; schema 3.4.0). Each is a
    // `0 @Sxx@ _TREES_SIBSHIP` top-level record with `_KIND` /
    // `_MEMBER+` / optional `_NAME`. Tools that strip extensions
    // render no sibship bracket.
    const sibshipDecorators: SibshipDecorator[] = [];
    for (const snode of sibshipNodes) {
        const rec = parseTreesSibship(snode, idByXref);
        if (rec) sibshipDecorators.push(rec);
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
        unions,
        relationships,
        groups,
        sibshipDecorators,
        editRev: 0,
        updatedAt: Date.now(),
    };

    findings.push(...validate(tree));

    if (findings.length > 0) console.warn("[io:gedcom] %d finding(s):", findings.length, findings);

    return { tree, head, findings, xrefByPersonId };
}

function buildPerson(
    id: PersonId,
    indi: TreeNode,
    findings: Finding[],
    pendingParentRefs: Map<PersonId, Array<{ xref: string; role?: string; pedi?: string }>>,
): Person {
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
                // SEX X (GEDCOM 7 non-binary): identity is not one of the
                // canonical three. We seed a struct with identity = "unknown"
                // here; if a `_TREES_GENDER_IDENTITY` extension follows on
                // this same INDI it overwrites the verbatim identity below.
                if (v === "M") person.gender = "m";
                else if (v === "F") person.gender = "f";
                else if (v === "X") person.gender = { identity: "unknown" };
                else person.gender = "u";
                break;
            }
            case "_TREES_GENDER_IDENTITY":
                if (sub.value != null) applyIdentityExtension(person, sub.value);
                break;
            case "_PRONOUNS":
                if (sub.value != null) applyPronounsExtension(person, sub.value);
                break;
            case "_ASSIGNED_SEX":
                if (sub.value != null) applyAssignedAtBirthExtension(person, sub.value);
                break;
            case "_GENDER_FLUID":
                applyFluidExtension(person, sub.value ?? undefined);
                break;
            case "_TREES_SPECIES":
                if (sub.value != null) person.species = sub.value;
                break;
            case "_TREES_PERSON_KIND":
                if (sub.value != null) person.kind = sub.value;
                break;
            case "_TREES_ORIGIN":
                if (sub.value != null) applyOriginExtension(person, sub);
                break;
            case "_TREES_BIRTH_ORDER":
                if (sub.value != null) {
                    const n = Number.parseInt(sub.value, 10);
                    if (Number.isFinite(n) && n >= 1) person.birthOrder = n;
                }
                break;
            case "_TREES_BIRTH_SURNAME":
                if (sub.value) person.surnameAtBirth = sub.value;
                break;
            case "_TREES_BIRTH_GIVN":
                if (sub.value) person.givenAtBirth = sub.value;
                break;
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
            case "_TREES_PARENT_REF": {
                const xref = sub.value;
                if (xref) {
                    const raw: { xref: string; role?: string; pedi?: string } = { xref };
                    for (const grand of sub.children) {
                        if (grand.tag === "_ROLE" && grand.value) raw.role = grand.value;
                        if (grand.tag === "_PEDI" && grand.value) raw.pedi = grand.value;
                    }
                    const list = pendingParentRefs.get(id) ?? [];
                    list.push(raw);
                    pendingParentRefs.set(id, list);
                }
                break;
            }
            case "OBJE":
                // portraits round-trip via the bundle reader, which pulls
                // bytes from media/<personId>.<ext>. the OBJE block in the
                // GEDCOM stream is informational and round-tripped by the
                // serializer when the bundle has matching media.
                break;
            default:
                if (sub.tag !== null) {
                    findings.push({ kind: "dropped-subtag", from: id, tag: sub.tag });
                }
        }
    }

    return person;
}

/**
 * Phase 5: write the verbatim identity string onto `Person.gender`,
 * promoting the field to a struct if it was still a legacy code from a
 * preceding SEX line. Canonical identities (male/female/unknown) align
 * the struct with what the SEX line would have produced; non-canonical
 * strings (e.g. "agender") land verbatim alongside the SEX X marker.
 */
function applyIdentityExtension(person: Person, identity: string): void {
    if (typeof person.gender === "object" && person.gender !== null) {
        person.gender = { ...person.gender, identity };
    } else {
        person.gender = { identity };
    }
}

function applyPronounsExtension(person: Person, pronouns: string): void {
    const g = person.gender;
    if (typeof g === "object" && g !== null) person.gender = { ...g, pronouns };
    else person.gender = { identity: legacyIdentityFromCode(g), pronouns };
}

function applyAssignedAtBirthExtension(person: Person, raw: string): void {
    const v = raw.toUpperCase();
    if (v === "AMAB" || v === "AFAB" || v === "UAAB") {
        const g = person.gender;
        if (typeof g === "object" && g !== null) person.gender = { ...g, assignedAtBirth: v };
        else person.gender = { identity: legacyIdentityFromCode(g), assignedAtBirth: v };
    }
}

function applyFluidExtension(person: Person, raw: string | undefined): void {
    const fluid = raw === undefined || raw.toUpperCase() === "Y";
    const g = person.gender;
    if (typeof g === "object" && g !== null) person.gender = { ...g, fluid };
    else person.gender = { identity: legacyIdentityFromCode(g), fluid };
}

function applyOriginExtension(person: Person, node: TreeNode): void {
    const kind = node.value;
    if (kind == null) return;
    const origin: NonNullable<Person["origin"]> = { kind };
    for (const sub of node.children) {
        if (sub.tag === "_CAUSE" && sub.value != null) origin.cause = sub.value;
        if (sub.tag === "DATE") {
            for (const grand of sub.children) {
                if (grand.tag === "DATE" && grand.value != null) {
                    const parsed = HaracalndeDate.parseGedcom(grand.value);
                    if (parsed.ok) origin.date = parsed.value.toJSON();
                }
            }
        }
    }
    person.origin = origin;
}

function legacyIdentityFromCode(code: "m" | "f" | "u"): string {
    if (code === "m") return "male";
    if (code === "f") return "female";
    return "unknown";
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
            case "NSFX":
                if (sub.value) person.suffix = sub.value;
                break;
            case "NICK":
                if (sub.value) person.nickname = sub.value;
                break;
            case "_MARNM":
                if (sub.value) person.surname = sub.value;
                break;
            // SPFX: surname prefix - no domain slot yet
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
        }
        if (sub.tag === "PLAC" && sub.value) {
            if (field === "birth") person.birthPlace = sub.value;
            else person.deathPlace = sub.value;
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
    let marriageDate: import("@attu/ui").HaracalndeDateData | undefined;
    let isPrimary: boolean | undefined;
    let isCurrent: boolean | undefined;

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
                // walk the DATE subtag if present; absence of DATE is fine
                // (FamilyEcho emits bare MARR for "marriage occurred but no
                // date known", typically alongside `1 EVEN / 2 TYPE Ending`)
                for (const grand of sub.children) {
                    if (grand.tag === "DATE" && grand.value) {
                        const parsed = HaracalndeDate.parseGedcom(grand.value);
                        if (parsed.ok) {
                            marriageDate = parsed.value.toJSON();
                        } else if (fam.pointer) {
                            findings.push({
                                kind: "bad-date",
                                from: fam.pointer,
                                field: "marriage",
                                raw: grand.value,
                                reason: parsed.error,
                            });
                        }
                    }
                }
                break;
            case "_PRIMARY":
                isPrimary = (sub.value ?? "").trim().toUpperCase() === "Y";
                break;
            case "_CURRENT":
                isCurrent = (sub.value ?? "").trim().toUpperCase() === "Y";
                break;
            case "EVEN":
                // EVEN bare or with TYPE: not modelled, drop quietly. families
                // commonly carry `1 EVEN / 2 TYPE Ending` to mark a divorce/
                // dissolution; useful future signal, but no slot for it today.
                break;
        }
    }

    // stitch parent links on every child via parentIds[]. The first HUSB
    // becomes the father slot and the first WIFE becomes the mother slot for
    // canonical role labelling; additional HUSB/WIFE entries (same-sex
    // co-parents) get role 'parent'. Any `_TREES_PARENT_REF` extension on the
    // child overrides these defaults during pass 2b.
    const primaryHusb = husbIds[0];
    const primaryWife = wifeIds[0];
    for (const cid of childIds) {
        const child = people[cid];
        if (!child) continue;
        const existing = child.parentIds ?? [];
        const seen = new Set(existing.map((r) => `${r.personId}|${r.role ?? ""}`));
        const additions: ParentRef[] = [];
        const pushRef = (ref: ParentRef) => {
            const key = `${ref.personId}|${ref.role ?? ""}`;
            if (seen.has(key)) return;
            // also skip if this personId already present with a different role
            if (existing.some((r) => r.personId === ref.personId)) return;
            if (additions.some((r) => r.personId === ref.personId)) return;
            seen.add(key);
            additions.push(ref);
        };
        if (primaryHusb) pushRef({ personId: primaryHusb, role: "father", pedi: "birth" });
        if (primaryWife) pushRef({ personId: primaryWife, role: "mother", pedi: "birth" });
        for (const hid of husbIds.slice(1))
            pushRef({ personId: hid, role: "parent", pedi: "birth" });
        for (const wid of wifeIds.slice(1))
            pushRef({ personId: wid, role: "parent", pedi: "birth" });
        if (additions.length > 0) child.parentIds = [...existing, ...additions];
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
            const couple: CoupleRecord = {
                leftId,
                rightId,
                unionIndex: 0,
                childIds: isPrimaryPair ? [...childIds] : [],
            };
            if (marriageDate !== undefined) couple.marriageDate = marriageDate;
            if (isPrimary !== undefined) couple.isPrimary = isPrimary;
            if (isCurrent !== undefined) couple.isCurrent = isCurrent;
            couples.push(couple);
        }
    }
    return couples;
}

/**
 * Parse a top-level `0 @Uxx@ _TREES_UNION` record into a UnionRecord.
 * Subtags: `_PARTNER` (xref → personId), `_CHIL`, `_KIND`, `_CLOSED`,
 * `_NAME`, `MARR / DATE`, `_PRIMARY`, `_CURRENT`. Drops the record if
 * fewer than 1 resolvable partner.
 */
function parseTreesUnion(node: TreeNode, idByXref: Map<string, PersonId>): UnionRecord | null {
    const partnerIds: PersonId[] = [];
    const childIds: PersonId[] = [];
    let kind: UnionKind | undefined;
    let closed: boolean | undefined;
    let name: string | undefined;
    let marriageDate: import("@attu/ui").HaracalndeDateData | undefined;
    let isPrimary: boolean | undefined;
    let isCurrent: boolean | undefined;

    for (const sub of node.children) {
        switch (sub.tag) {
            case "_PARTNER": {
                const id = sub.value ? idByXref.get(sub.value) : undefined;
                if (id) partnerIds.push(id);
                break;
            }
            case "_CHIL": {
                const id = sub.value ? idByXref.get(sub.value) : undefined;
                if (id) childIds.push(id);
                break;
            }
            case "_KIND":
                if (sub.value) kind = sub.value as UnionKind;
                break;
            case "_CLOSED":
                closed = (sub.value ?? "").trim().toUpperCase() === "Y";
                break;
            case "_NAME":
                if (sub.value) name = sub.value;
                break;
            case "MARR":
                for (const grand of sub.children) {
                    if (grand.tag === "DATE" && grand.value) {
                        const parsed = HaracalndeDate.parseGedcom(grand.value);
                        if (parsed.ok) marriageDate = parsed.value.toJSON();
                    }
                }
                break;
            case "_PRIMARY":
                isPrimary = (sub.value ?? "").trim().toUpperCase() === "Y";
                break;
            case "_CURRENT":
                isCurrent = (sub.value ?? "").trim().toUpperCase() === "Y";
                break;
        }
    }

    if (partnerIds.length === 0) return null;
    const xref = node.pointer ?? "";
    const id =
        xref.length > 0
            ? xref.replace(/^@/, "").replace(/@$/, "")
            : `union-${partnerIds.join("-")}`;
    const rec: UnionRecord = { id, partnerIds, childIds };
    if (kind !== undefined) rec.kind = kind;
    if (closed !== undefined) rec.closed = closed;
    if (name !== undefined) rec.name = name;
    if (marriageDate !== undefined) rec.marriageDate = marriageDate;
    if (isPrimary !== undefined) rec.isPrimary = isPrimary;
    if (isCurrent !== undefined) rec.isCurrent = isCurrent;
    return rec;
}

/**
 * Parse a top-level `0 @Rxx@ _TREES_REL` record into a Relationship.
 * Subtags: `_KIND`, `_SOURCE+`, `_TARGET+`, `_CAUSE`, `DATE/DATE`,
 * `_NOTES`. Drops the record if no resolvable source or target.
 */
function parseTreesRel(node: TreeNode, idByXref: Map<string, PersonId>): Relationship | null {
    let kind: RelationshipKind | undefined;
    const sourceIds: PersonId[] = [];
    const targetIds: PersonId[] = [];
    let cause: string | undefined;
    let date: import("@attu/ui").HaracalndeDateData | undefined;
    let notes: string | undefined;

    for (const sub of node.children) {
        switch (sub.tag) {
            case "_KIND":
                if (sub.value) kind = sub.value as RelationshipKind;
                break;
            case "_SOURCE": {
                const id = sub.value ? idByXref.get(sub.value) : undefined;
                if (id) sourceIds.push(id);
                break;
            }
            case "_TARGET": {
                const id = sub.value ? idByXref.get(sub.value) : undefined;
                if (id) targetIds.push(id);
                break;
            }
            case "_CAUSE":
                if (sub.value) cause = sub.value;
                break;
            case "DATE":
                for (const grand of sub.children) {
                    if (grand.tag === "DATE" && grand.value) {
                        const parsed = HaracalndeDate.parseGedcom(grand.value);
                        if (parsed.ok) date = parsed.value.toJSON();
                    }
                }
                break;
            case "_NOTES":
                if (sub.value) notes = sub.value;
                break;
        }
    }

    if (kind === undefined) return null;
    if (sourceIds.length === 0 && targetIds.length === 0) return null;
    const xref = node.pointer ?? "";
    const id =
        xref.length > 0
            ? xref.replace(/^@/, "").replace(/@$/, "")
            : `rel-${kind}-${[...sourceIds, ...targetIds].join("-")}`;
    const rec: Relationship = { id, kind, sourceIds, targetIds };
    if (cause !== undefined) rec.cause = cause;
    if (date !== undefined) rec.date = date;
    if (notes !== undefined) rec.notes = notes;
    return rec;
}

/**
 * Parse a top-level `0 @Gxx@ _TREES_GROUP` record into a Group.
 * Subtags: `_NAME`, `_KIND`, `_MEMBER+`, `_FOUNDER`, `_FRAME_STYLE`,
 * `_FRAME_COLOR`, `_ARMORIAL`. Drops the record if name + kind aren't
 * both present (permissive elsewhere — empty member list is fine, the
 * walker will skip emitting a frame).
 */
function parseTreesGroup(node: TreeNode, idByXref: Map<string, PersonId>): Group | null {
    let name: string | undefined;
    let kind: string | undefined;
    const memberIds: PersonId[] = [];
    let founderId: PersonId | undefined;
    let frameStyle: GroupFrameStyle | undefined;
    let frameColor: string | undefined;
    let armorial: string | undefined;

    for (const sub of node.children) {
        switch (sub.tag) {
            case "_NAME":
                if (sub.value) name = sub.value;
                break;
            case "_KIND":
                if (sub.value) kind = sub.value;
                break;
            case "_MEMBER": {
                const id = sub.value ? idByXref.get(sub.value) : undefined;
                if (id) memberIds.push(id);
                break;
            }
            case "_FOUNDER": {
                const id = sub.value ? idByXref.get(sub.value) : undefined;
                if (id) founderId = id;
                break;
            }
            case "_FRAME_STYLE":
                if (sub.value === "hull" || sub.value === "band" || sub.value === "ribbon") {
                    frameStyle = sub.value;
                }
                break;
            case "_FRAME_COLOR":
                if (sub.value) frameColor = sub.value;
                break;
            case "_ARMORIAL":
                if (sub.value) armorial = sub.value;
                break;
        }
    }

    if (name === undefined || kind === undefined) return null;
    const xref = node.pointer ?? "";
    const id =
        xref.length > 0
            ? xref.replace(/^@/, "").replace(/@$/, "")
            : `group-${kind}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const rec: Group = { id, name, kind, memberIds };
    if (founderId !== undefined) rec.founderId = founderId;
    if (frameStyle !== undefined || frameColor !== undefined) {
        rec.frame = {};
        if (frameStyle !== undefined) rec.frame.style = frameStyle;
        if (frameColor !== undefined) rec.frame.color = frameColor;
    }
    if (armorial !== undefined) rec.armorial = { description: armorial };
    return rec;
}

/**
 * Parse a top-level `0 @Sxx@ _TREES_SIBSHIP` record into a
 * SibshipDecorator. Subtags: `_KIND`, `_MEMBER+`, optional `_NAME`.
 * Drops the record if kind isn't present or no members resolve to
 * known persons.
 */
function parseTreesSibship(
    node: TreeNode,
    idByXref: Map<string, PersonId>,
): SibshipDecorator | null {
    let kind: string | undefined;
    let name: string | undefined;
    const sibIds: PersonId[] = [];
    for (const sub of node.children) {
        switch (sub.tag) {
            case "_KIND":
                if (sub.value) kind = sub.value;
                break;
            case "_MEMBER": {
                const id = sub.value ? idByXref.get(sub.value) : undefined;
                if (id) sibIds.push(id);
                break;
            }
            case "_NAME":
                if (sub.value) name = sub.value;
                break;
        }
    }
    if (kind === undefined || sibIds.length === 0) return null;
    const xref = node.pointer ?? "";
    const id =
        xref.length > 0
            ? xref.replace(/^@/, "").replace(/@$/, "")
            : `sibship-${kind}-${[...sibIds].sort().join("-")}`;
    const rec: SibshipDecorator = { id, sibIds, kind };
    if (name !== undefined) rec.name = name;
    return rec;
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
