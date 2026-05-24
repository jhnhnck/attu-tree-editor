/*
 * FamilyTreeEditor - FamilyScript .txt parser; tab-split with one-char tag dispatch
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { HaracalndeDate } from "$lib/date/HaracalndeDate";
import { ROOT_ID } from "$lib/domain/ids";
import type {
    CoupleRecord,
    Gender,
    ParentPedi,
    ParentRef,
    Person,
    PersonId,
    Tree,
} from "$lib/domain/types";
import { validate, type Finding } from "$lib/domain/validate";
import {
    FS_DISPLAY_FROM_CODE,
    FS_GENDER_FROM_CODE,
    FS_PEDI_FROM_CODE,
    type FsCoupleExtras,
    type FsHeader,
} from "$lib/io/familyscript/tokens";
import { ok, type Result } from "$lib/utils/result";

export interface FsParseResult {
    tree: Tree;
    header: FsHeader;
    findings: Finding[];
    /**
     * Per-person extras for tags we have no domain slot for (e.g. `V`).
     * Preserved so the serializer can round-trip them.
     */
    personExtras: Record<PersonId, { tag: string; value: string }[]>;
    /** Per-couple extras (matches `tree.couples` order). */
    coupleExtras: FsCoupleExtras[][];
}

// FamilyScript spec: any-length alphanumeric, case-sensitive. The old
// 5-uppercase regex rejected legal IDs (e.g. Family Echo's mixed-case bot
// outputs); allowing 1+ alphanumeric per spec.
const ID_RE = /^[A-Za-z0-9]+$/;

export function parseFamilyScript(text: string): Result<FsParseResult, string> {
    const lines = splitLines(text);
    const findings: Finding[] = [];
    const personExtras: Record<PersonId, { tag: string; value: string }[]> = {};
    const coupleExtras: FsCoupleExtras[][] = [];

    const header: FsHeader = { lines: [] };
    const people: Record<PersonId, Person> = {};
    const couples: CoupleRecord[] = [];
    let rootId: PersonId | null = null;

    for (let i = 0; i < lines.length; i += 1) {
        const raw = lines[i];
        if (raw === undefined || raw === "") continue;

        if (raw.startsWith("#")) {
            // header lines may be interleaved before any data; once we see data we close the header
            if (Object.keys(people).length === 0 && couples.length === 0) {
                header.lines.push(raw);
                continue;
            }
            // a # past the data section is unusual; treat as unknown
            findings.push({ kind: "unknown-line", line: raw, lineNumber: i + 1 });
            continue;
        }

        const tokens = raw.split("\t");
        const first = tokens[0];
        if (first === undefined || first.length === 0) continue;

        // person record: first token starts with `i<5-char id>`
        if (first.startsWith("i") && ID_RE.test(first.slice(1))) {
            const personId = first.slice(1);
            const { person, extras } = parsePerson(personId, tokens.slice(1), findings);
            people[personId] = person;
            if (extras.length > 0) personExtras[personId] = extras;
            if (rootId === null && personId === ROOT_ID) rootId = personId;
            continue;
        }

        // couple record: `p<id1> <id2>\t...`
        if (first.startsWith("p")) {
            const value = first.slice(1);
            const spaceIdx = value.indexOf(" ");
            if (spaceIdx > 0) {
                const leftId = value.slice(0, spaceIdx);
                const rightId = value.slice(spaceIdx + 1);
                if (ID_RE.test(leftId) && ID_RE.test(rightId)) {
                    const { couple, extras } = parseCouple(leftId, rightId, tokens.slice(1));
                    couples.push(couple);
                    coupleExtras.push(extras);
                    continue;
                }
            }
        }

        findings.push({ kind: "unknown-line", line: raw, lineNumber: i + 1 });
    }

    if (rootId === null) {
        // pick the first person as a fallback root if START is absent (bot-generated trees may lack it)
        rootId = Object.keys(people)[0] ?? ROOT_ID;
    }

    const tree: Tree = {
        id: cryptoUuid(),
        name: deriveNameFromHeader(header),
        rootId,
        people,
        couples,
        editRev: 0,
        updatedAt: Date.now(),
    };

    findings.push(...validate(tree));

    if (findings.length > 0)
        console.warn("[io:familyscript] %d finding(s):", findings.length, findings);

    return ok({ tree, header, findings, personExtras, coupleExtras });
}

function splitLines(text: string): string[] {
    // tolerate CRLF or LF; strip a single trailing empty line if present
    const normalized = text.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines;
}

function parsePerson(
    id: PersonId,
    rest: string[],
    findings: Finding[],
): { person: Person; extras: { tag: string; value: string }[] } {
    const person: Person = {
        id,
        given: "",
        surname: "",
        gender: "u",
        spouseIds: [],
        display: "z1",
    };
    const extras: { tag: string; value: string }[] = [];

    // staging for the three parent-set inputs (m/f + V; X/Y + W; K/L + Q).
    // collected during the scan and flushed into person.parentIds[] at the
    // end because the pedi tag (V/W/Q) can appear in any token order
    // relative to its mother/father ids.
    interface ParentSet {
        mother?: PersonId;
        father?: PersonId;
        pedi?: ParentPedi;
    }
    const sets: [ParentSet, ParentSet, ParentSet] = [{}, {}, {}];
    function readPedi(value: string, tag: string): ParentPedi {
        const mapped = FS_PEDI_FROM_CODE[value];
        if (mapped) return mapped;
        findings.push({ kind: "unknown-tag", from: id, tag, value });
        // permissive: keep the data, fall back to "birth"
        return "birth";
    }

    for (const token of rest) {
        if (token.length === 0) continue;
        const tag = token[0];
        const value = token.slice(1);
        if (tag === undefined) continue;

        switch (tag) {
            case "^":
                if (value.length > 0) person.anchorParentId = value;
                break;
            case "g": {
                // FamilyScript spec also defines `g o[ <description>]` for
                // "other"; map that to GenderStruct since the legacy Gender
                // enum is "m" | "f" | "u" only.
                if (value.startsWith("o")) {
                    person.gender = { identity: "other" };
                    break;
                }
                const g = FS_GENDER_FROM_CODE[value];
                if (g) person.gender = g;
                else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            }
            case "p":
                person.given = value;
                break;
            case "z": {
                const flag = FS_DISPLAY_FROM_CODE[value];
                if (flag) person.display = flag;
                else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            }
            case "b":
            case "d": {
                const parsed = HaracalndeDate.parseFamilyScript(value);
                if (!parsed.ok) {
                    findings.push({
                        kind: "bad-date",
                        from: id,
                        field: tag === "b" ? "birth" : "death",
                        raw: value,
                        reason: parsed.error,
                    });
                    break;
                }
                if (parsed.value === null) break; // wholly-unknown date
                if (tag === "b") person.birth = parsed.value.toJSON();
                else person.death = parsed.value.toJSON();
                break;
            }
            case "m":
                if (ID_RE.test(value)) sets[0].mother = value;
                else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            case "f":
                if (ID_RE.test(value)) sets[0].father = value;
                else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            case "V":
                sets[0].pedi = readPedi(value, tag);
                break;
            case "X":
                if (ID_RE.test(value)) sets[1].mother = value;
                else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            case "Y":
                if (ID_RE.test(value)) sets[1].father = value;
                else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            case "W":
                sets[1].pedi = readPedi(value, tag);
                break;
            case "K":
                if (ID_RE.test(value)) sets[2].mother = value;
                else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            case "L":
                if (ID_RE.test(value)) sets[2].father = value;
                else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            case "Q":
                sets[2].pedi = readPedi(value, tag);
                break;
            case "O": {
                // birth order; spec permits decimals, domain stores int
                const n = Number(value);
                if (Number.isFinite(n)) person.birthOrder = Math.floor(n);
                else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            }
            case "s":
                if (ID_RE.test(value)) person.spouseIds.push(value);
                else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            case "l":
                person.surname = value;
                break;
            case "q":
                // FamilyScript spec: surname at birth. The previous mapping
                // wrote this to `locationOrigin` which silently put maiden
                // names under a location field; the slot lands here now.
                person.surnameAtBirth = value;
                break;
            case "n":
                person.givenAtBirth = value;
                break;
            case "N":
                person.nickname = value;
                break;
            case "J":
                person.suffix = value;
                break;
            case "v":
                person.birthPlace = value;
                break;
            case "y":
                person.deathPlace = value;
                break;
            case "T":
                person.title = value;
                break;
            case "j":
                person.occupation = value;
                break;
            case "r":
                // family echo photo reference: "<imageid> <width> <height>".
                // imageid is the only useful part for pairing with embedded
                // image bytes from a .html export. captured as an extra so
                // the html wrapper can look it up; never persisted on Person.
                extras.push({ tag, value });
                break;
            default:
                findings.push({ kind: "unknown-tag", from: id, tag, value });
                extras.push({ tag, value });
        }
    }

    // flush collected parent sets into ParentRef[]
    const refs: ParentRef[] = [];
    for (const set of sets) {
        const pedi: ParentPedi = set.pedi ?? "birth";
        if (set.mother && !refs.some((r) => r.personId === set.mother)) {
            refs.push({ personId: set.mother, role: "mother", pedi });
        }
        if (set.father && !refs.some((r) => r.personId === set.father)) {
            refs.push({ personId: set.father, role: "father", pedi });
        }
    }
    if (refs.length > 0) person.parentIds = refs;

    return { person, extras };
}

// FamilyScript date shape: optional B (TT era) + 4-digit-or-more year + 2 mo + 2 day + optional ~.
// Used to disambiguate couple `m` between a marriage date and a (legacy) child-id reference.
const FS_DATE_SHAPE_RE = /^B?\d{8}~?$/;

function parseCouple(
    leftId: PersonId,
    rightId: PersonId,
    rest: string[],
): { couple: CoupleRecord; extras: FsCoupleExtras[] } {
    let unionIndex = 0;
    const childIds: PersonId[] = [];
    const extras: FsCoupleExtras[] = [];
    let marriageDate: CoupleRecord["marriageDate"] | undefined;

    for (const token of rest) {
        if (token.length === 0) continue;
        const tag = token[0];
        const value = token.slice(1);
        if (tag === undefined) continue;

        if (tag === "e") {
            // "e" = unionIndex 0; "e1" / "e2" = parsed
            const n = value === "" ? 0 : Number(value);
            unionIndex = Number.isFinite(n) ? n : 0;
            continue;
        }
        if (tag === "m") {
            // Spec: marriage date YYYYMMDD. Some prior fixtures wrote child
            // references as `m<personId>`; we disambiguate by date shape so
            // both forms still work.
            if (FS_DATE_SHAPE_RE.test(value)) {
                const parsed = HaracalndeDate.parseFamilyScript(value);
                if (parsed.ok && parsed.value !== null) {
                    marriageDate = parsed.value.toJSON();
                    continue;
                }
            }
            if (ID_RE.test(value)) {
                childIds.push(value);
                continue;
            }
        }
        // gender hint and anything else - preserve for round-trip
        extras.push({ tag, value });
    }

    const couple: CoupleRecord = { leftId, rightId, unionIndex, childIds };
    if (marriageDate !== undefined) couple.marriageDate = marriageDate;
    return { couple, extras };
}

function deriveNameFromHeader(header: FsHeader): string {
    // first non-empty `# Name` line typically holds the tree name
    for (const line of header.lines) {
        const m = /^#\s+([^\s#].*)$/.exec(line);
        if (m && m[1] && !m[1].toLowerCase().startsWith("familyscript")) {
            return m[1].trim();
        }
    }
    return "Imported tree";
}

function cryptoUuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `tree-${String(Date.now())}-${String(Math.floor(Math.random() * 1e9))}`;
}

// re-export for tests
export type { Gender };
