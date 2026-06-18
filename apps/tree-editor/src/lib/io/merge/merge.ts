/*
 * FamilyTreeEditor - merge two parsed trees into one (the dual-import feature)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { HaracalndeDateData } from "$lib/date/HaracalndeDate";
import { ROOT_ID } from "$lib/domain/ids";
import type { CoupleRecord, ParentRef, Person, PersonId, Tree } from "$lib/domain/types";
import { legacyGenderCode } from "$lib/domain/personIdentity";
import { validate, type Finding } from "$lib/domain/validate";

export type MergeSource = "familyscript" | "gedcom";

export interface MergeOptions {
    /** Which side wins on a per-field conflict; default 'gedcom'. */
    preferOnConflict?: MergeSource;
    /** Override the matcher (e.g. tighter tolerance). */
    matchPerson?: (a: Person, b: Person) => boolean;
}

export interface MergeInput {
    tree: Tree;
    source: MergeSource;
}

export interface MergeResult {
    tree: Tree;
    findings: Finding[];
    /** Map from b's person id to the (possibly remapped) id in the merged tree. */
    bIdMap: Record<PersonId, PersonId>;
}

export function mergeTrees(a: MergeInput, b: MergeInput, opts: MergeOptions = {}): MergeResult {
    const prefer = opts.preferOnConflict ?? "gedcom";
    const matcher = opts.matchPerson ?? defaultMatcher;
    const findings: Finding[] = [];

    // working copy of `a`
    const people: Record<PersonId, Person> = {};
    for (const [id, p] of Object.entries(a.tree.people)) people[id] = clonePerson(p);
    const couples: CoupleRecord[] = a.tree.couples.map(cloneCouple);

    // index `a` by match key for fast lookup
    const aByKey = new Map<string, Person[]>();
    for (const person of Object.values(people)) {
        const k = matchKey(person);
        const list = aByKey.get(k) ?? [];
        list.push(person);
        aByKey.set(k, list);
    }

    // walk `b`: pair up or carry over
    const bIdMap: Record<PersonId, PersonId> = {};
    const taken = new Set<string>(Object.keys(people));

    for (const bPerson of Object.values(b.tree.people)) {
        const k = matchKey(bPerson);
        const candidates = aByKey.get(k) ?? [];
        const matches = candidates.filter((cand) => matcher(cand, bPerson));

        if (matches.length === 1) {
            const aPerson = matches[0];
            if (!aPerson) continue;
            mergeFields(aPerson, bPerson, a.source, b.source, prefer, findings);
            bIdMap[bPerson.id] = aPerson.id;
        } else if (matches.length > 1) {
            findings.push({
                kind: "ambiguous-match",
                person: bPerson.id,
                candidates: matches.map((m) => m.id),
            });
            // carry the b person across with its id (or remapped if collision)
            const newId = ensureFreshId(bPerson.id, taken);
            bIdMap[bPerson.id] = newId;
            people[newId] = { ...clonePerson(bPerson), id: newId };
            taken.add(newId);
        } else {
            // unmatched: copy across
            findings.push({ kind: "unmatched-person", person: bPerson.id, source: b.source });
            const newId = ensureFreshId(bPerson.id, taken);
            bIdMap[bPerson.id] = newId;
            people[newId] = { ...clonePerson(bPerson), id: newId };
            taken.add(newId);
        }
    }

    // remap parent / spouse / anchor ids on the carried-over `b` people
    for (const [oldId, newId] of Object.entries(bIdMap)) {
        const person = people[newId];
        if (!person) continue;
        if (person.parentIds) {
            person.parentIds = person.parentIds.map((r) => ({
                ...r,
                personId: bIdMap[r.personId] ?? r.personId,
            }));
        }
        if (person.anchorParentId)
            person.anchorParentId = bIdMap[person.anchorParentId] ?? person.anchorParentId;
        person.spouseIds = person.spouseIds.map((sid) => bIdMap[sid] ?? sid);
        // dedupe spouseIds after remap (a remap can collapse two refs into one)
        person.spouseIds = [...new Set(person.spouseIds)];
        // suppress unused var lint
        void oldId;
    }

    // union couples
    const coupleIndex = new Map<string, CoupleRecord>();
    for (const c of couples) coupleIndex.set(coupleKey(c.leftId, c.rightId), c);
    for (const bc of b.tree.couples) {
        const remapped: CoupleRecord = {
            leftId: bIdMap[bc.leftId] ?? bc.leftId,
            rightId: bIdMap[bc.rightId] ?? bc.rightId,
            unionIndex: bc.unionIndex,
            childIds: bc.childIds.map((cid) => bIdMap[cid] ?? cid),
        };
        const key = coupleKey(remapped.leftId, remapped.rightId);
        const existing = coupleIndex.get(key);
        if (!existing) {
            coupleIndex.set(key, remapped);
            couples.push(remapped);
        } else {
            // merge metadata: prefer non-zero unionIndex; union+dedupe childIds
            if (existing.unionIndex === 0 && remapped.unionIndex !== 0) {
                existing.unionIndex = remapped.unionIndex;
            }
            existing.childIds = [...new Set([...existing.childIds, ...remapped.childIds])];
        }
    }

    // pick a root: prefer a's root, fall back to ROOT_ID, fall back to first
    let rootId = a.tree.rootId;
    if (!people[rootId]) {
        if (people[ROOT_ID]) rootId = ROOT_ID;
        else rootId = Object.keys(people)[0] ?? a.tree.rootId;
    }

    const merged: Tree = {
        id: a.tree.id,
        name: a.tree.name,
        rootId,
        people,
        couples,
        editRev: 0,
        updatedAt: Date.now(),
    };

    findings.push(...validate(merged));
    return { tree: merged, findings, bIdMap };
}

function clonePerson(p: Person): Person {
    const next: Person = { ...p, spouseIds: [...p.spouseIds] };
    if (p.parentIds) next.parentIds = p.parentIds.map((r) => ({ ...r }));
    return next;
}

function cloneCouple(c: CoupleRecord): CoupleRecord {
    return { ...c, childIds: [...c.childIds] };
}

function ensureFreshId(preferred: PersonId, taken: Set<string>): PersonId {
    if (!taken.has(preferred)) return preferred;
    // append a numeric suffix; not crypto-grade since collisions are rare here
    let i = 2;
    while (taken.has(`${preferred}-${String(i)}`)) i += 1;
    return `${preferred}-${String(i)}`;
}

function coupleKey(a: PersonId, b: PersonId): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function defaultMatcher(a: Person, b: Person): boolean {
    return matchKey(a) === matchKey(b);
}

function matchKey(p: Person): string {
    const given = normalize(p.given);
    const surname = normalize(p.surname);
    const birthYear = yearOf(p.birth);
    const deathYear = yearOf(p.death);
    return `${given}|${surname}|${birthYear}|${deathYear}`;
}

function yearOf(d?: HaracalndeDateData): string {
    if (!d) return "?";
    return `${d.era}${String(d.year)}`;
}

function normalize(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function mergeFields(
    target: Person,
    source: Person,
    targetSource: MergeSource,
    sourceSource: MergeSource,
    prefer: MergeSource,
    findings: Finding[],
): void {
    // simple non-empty wins, preference on conflict
    target.given = pickString(
        target.given,
        source.given,
        targetSource,
        prefer,
        target.id,
        "given",
        findings,
    );
    target.surname = pickString(
        target.surname,
        source.surname,
        targetSource,
        prefer,
        target.id,
        "surname",
        findings,
    );
    setOptional(
        target,
        "title",
        pickOptional(
            target.title,
            source.title,
            targetSource,
            prefer,
            target.id,
            "title",
            findings,
        ),
    );
    setOptional(
        target,
        "occupation",
        pickOptional(
            target.occupation,
            source.occupation,
            targetSource,
            prefer,
            target.id,
            "occupation",
            findings,
        ),
    );
    setOptional(
        target,
        "location",
        pickOptional(
            target.location,
            source.location,
            targetSource,
            prefer,
            target.id,
            "location",
            findings,
        ),
    );
    setOptional(
        target,
        "locationOrigin",
        pickOptional(
            target.locationOrigin,
            source.locationOrigin,
            targetSource,
            prefer,
            target.id,
            "locationOrigin",
            findings,
        ),
    );
    setOptional(
        target,
        "wikiTitle",
        pickOptional(
            target.wikiTitle,
            source.wikiTitle,
            targetSource,
            prefer,
            target.id,
            "wikiTitle",
            findings,
        ),
    );

    // gender: 'u' loses to anything specific; otherwise preference
    const tCode = legacyGenderCode(target);
    const sCode = legacyGenderCode(source);
    if (tCode === "u" && sCode !== "u") target.gender = source.gender;
    else if (tCode !== sCode && sCode !== "u") {
        const winner = prefer === sourceSource ? source.gender : target.gender;
        if (winner !== target.gender) {
            findings.push({
                kind: "field-conflict",
                person: target.id,
                field: "gender",
                fromFamilyScript: targetSource === "familyscript" ? target.gender : source.gender,
                fromGedcom: targetSource === "gedcom" ? target.gender : source.gender,
                chosen: prefer,
            });
            target.gender = winner;
        }
    }

    // dates: prefer the more-specific; on tie use preference
    setOptional(
        target,
        "birth",
        pickDate(target.birth, source.birth, targetSource, prefer, target.id, "birth", findings),
    );
    setOptional(
        target,
        "death",
        pickDate(target.death, source.death, targetSource, prefer, target.id, "death", findings),
    );

    // parent refs: union by personId; preference wins on role/pedi conflict
    const merged = mergeParentRefs(
        target.parentIds ?? [],
        source.parentIds ?? [],
        targetSource,
        prefer,
        target.id,
        findings,
    );
    if (merged.length === 0) delete target.parentIds;
    else target.parentIds = merged;
    setOptional(
        target,
        "anchorParentId",
        pickOptional(
            target.anchorParentId,
            source.anchorParentId,
            targetSource,
            prefer,
            target.id,
            "anchorParentId",
            findings,
        ),
    );

    // spouse ids: union + dedupe (remap happens later)
    target.spouseIds = [...new Set([...target.spouseIds, ...source.spouseIds])];

    // portrait blob: keep whichever side has it; on tie prefer
    if (target.portraitBlobId === undefined && source.portraitBlobId !== undefined) {
        target.portraitBlobId = source.portraitBlobId;
    }

    // display: 'z1' (normal) wins over 'z0' (faded) only if target was implicit
    // mostly leave as-is from `a`
}

/**
 * Set-or-delete helper for optional fields under exactOptionalPropertyTypes.
 * The target's index signature is widened to accept delete; callers must only
 * pass keys whose declared type already includes undefined.
 */
function setOptional<T extends object>(target: T, key: keyof T, value: unknown): void {
    if (value === undefined) {
        delete (target as Record<string, unknown>)[key as string];
    } else {
        (target as Record<string, unknown>)[key as string] = value;
    }
}

function pickString(
    a: string,
    b: string,
    aSrc: MergeSource,
    prefer: MergeSource,
    pid: PersonId,
    field: string,
    findings: Finding[],
): string {
    if (a === b) return a;
    if (a === "") return b;
    if (b === "") return a;
    findings.push(makeConflict(pid, field, a, b, aSrc, prefer));
    return prefer === aSrc ? a : b;
}

function pickOptional<T>(
    a: T | undefined,
    b: T | undefined,
    aSrc: MergeSource,
    prefer: MergeSource,
    pid: PersonId,
    field: string,
    findings: Finding[],
): T | undefined {
    if (a === b) return a;
    if (a === undefined) return b;
    if (b === undefined) return a;
    findings.push(makeConflict(pid, field, a, b, aSrc, prefer));
    return prefer === aSrc ? a : b;
}

function pickDate(
    a: HaracalndeDateData | undefined,
    b: HaracalndeDateData | undefined,
    aSrc: MergeSource,
    prefer: MergeSource,
    pid: PersonId,
    field: string,
    findings: Finding[],
): HaracalndeDateData | undefined {
    if (a === undefined) return b;
    if (b === undefined) return a;

    const aSpec = dateSpecificity(a);
    const bSpec = dateSpecificity(b);
    if (aSpec > bSpec) return a;
    if (bSpec > aSpec) return b;

    if (a.era === b.era && a.year === b.year && a.month === b.month && a.day === b.day) {
        return a;
    }
    findings.push(makeConflict(pid, field, a, b, aSrc, prefer));
    return prefer === aSrc ? a : b;
}

function dateSpecificity(d: HaracalndeDateData): number {
    if (d.day !== undefined) return 3;
    if (d.month !== undefined) return 2;
    return 1;
}

function mergeParentRefs(
    aRefs: readonly ParentRef[],
    bRefs: readonly ParentRef[],
    aSrc: MergeSource,
    prefer: MergeSource,
    pid: PersonId,
    findings: Finding[],
): ParentRef[] {
    const byId = new Map<PersonId, ParentRef>();
    for (const ref of aRefs) byId.set(ref.personId, { ...ref });
    for (const ref of bRefs) {
        const existing = byId.get(ref.personId);
        if (!existing) {
            byId.set(ref.personId, { ...ref });
            continue;
        }
        if (existing.role !== ref.role && existing.role !== undefined && ref.role !== undefined) {
            findings.push(
                makeConflict(
                    pid,
                    `parentRef[${ref.personId}].role`,
                    existing.role,
                    ref.role,
                    aSrc,
                    prefer,
                ),
            );
            if (prefer !== aSrc) existing.role = ref.role;
        } else if (existing.role === undefined && ref.role !== undefined) {
            existing.role = ref.role;
        }
        if (existing.pedi !== ref.pedi && existing.pedi !== undefined && ref.pedi !== undefined) {
            findings.push(
                makeConflict(
                    pid,
                    `parentRef[${ref.personId}].pedi`,
                    existing.pedi,
                    ref.pedi,
                    aSrc,
                    prefer,
                ),
            );
            if (prefer !== aSrc) existing.pedi = ref.pedi;
        } else if (existing.pedi === undefined && ref.pedi !== undefined) {
            existing.pedi = ref.pedi;
        }
    }
    return Array.from(byId.values());
}

function makeConflict(
    pid: PersonId,
    field: string,
    aVal: unknown,
    bVal: unknown,
    aSrc: MergeSource,
    prefer: MergeSource,
): Finding {
    return {
        kind: "field-conflict",
        person: pid,
        field,
        fromFamilyScript: aSrc === "familyscript" ? aVal : bVal,
        fromGedcom: aSrc === "gedcom" ? aVal : bVal,
        chosen: prefer,
    };
}
