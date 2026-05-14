/*
 * FamilyTreeEditor - FamilyScript .txt parser; tab-split with one-char tag dispatch
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { HaracalndeDate } from "$lib/date/HaracalndeDate";
import { ROOT_ID } from "$lib/domain/ids";
import type { CoupleRecord, Gender, ParentRef, Person, PersonId, Tree } from "$lib/domain/types";
import { validate, type Finding } from "$lib/domain/validate";
import {
    FS_DISPLAY_FROM_CODE,
    FS_GENDER_FROM_CODE,
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

const ID_RE = /^[A-Z0-9]{5}$/;

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
                if (ID_RE.test(value)) {
                    const refs: ParentRef[] = person.parentIds ?? [];
                    if (!refs.some((r) => r.personId === value)) {
                        person.parentIds = [...refs, { personId: value, role: "mother", pedi: "birth" }];
                    }
                } else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            case "f":
                if (ID_RE.test(value)) {
                    const refs: ParentRef[] = person.parentIds ?? [];
                    if (!refs.some((r) => r.personId === value)) {
                        person.parentIds = [...refs, { personId: value, role: "father", pedi: "birth" }];
                    }
                } else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            case "s":
                if (ID_RE.test(value)) person.spouseIds.push(value);
                else findings.push({ kind: "unknown-tag", from: id, tag, value });
                break;
            case "l":
                person.surname = value;
                break;
            case "q":
                person.locationOrigin = value;
                break;
            case "T":
                person.title = value;
                break;
            case "j":
                person.occupation = value;
                break;
            case "V":
                // no domain slot; preserved verbatim for round-trip
                extras.push({ tag, value });
                break;
            default:
                findings.push({ kind: "unknown-tag", from: id, tag, value });
                extras.push({ tag, value });
        }
    }

    return { person, extras };
}

function parseCouple(
    leftId: PersonId,
    rightId: PersonId,
    rest: string[],
): { couple: CoupleRecord; extras: FsCoupleExtras[] } {
    let unionIndex = 0;
    const childIds: PersonId[] = [];
    const extras: FsCoupleExtras[] = [];

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
        // child references occasionally appear via `m<id>` on couple records
        if (tag === "m" && ID_RE.test(value)) {
            childIds.push(value);
            continue;
        }
        // gender hint and anything else - preserve for round-trip
        extras.push({ tag, value });
    }

    return {
        couple: { leftId, rightId, unionIndex, childIds },
        extras,
    };
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
