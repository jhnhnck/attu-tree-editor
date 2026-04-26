/*
 * FamilyTreeEditor - immutable tree operations (add, link, remove, traverse)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { generateId, ROOT_ID } from "$lib/domain/ids";
import type { CoupleRecord, Person, PersonId, Tree } from "$lib/domain/types";
import { err, ok, type Result } from "$lib/utils/result";

export function createTree(name: string, root: Omit<Person, "id">): Tree {
    const rootPerson: Person = { ...root, id: ROOT_ID };
    return {
        id: cryptoUuid(),
        name,
        rootId: ROOT_ID,
        people: { [ROOT_ID]: rootPerson },
        couples: [],
        rev: 0,
        updatedAt: Date.now(),
    };
}

export function addPerson(t: Tree, p: Omit<Person, "id">): { tree: Tree; id: PersonId } {
    const id = generateId(new Set(Object.keys(t.people)));
    const person: Person = { ...p, id };
    const tree: Tree = {
        ...t,
        people: { ...t.people, [id]: person },
    };
    return { tree, id };
}

export function updatePerson(t: Tree, id: PersonId, patch: Partial<Person>): Tree {
    const existing = t.people[id];
    if (!existing) return t;
    const next: Person = { ...existing, ...patch, id: existing.id };
    return { ...t, people: { ...t.people, [id]: next } };
}

export function removePerson(t: Tree, id: PersonId): Tree {
    if (!(id in t.people)) return t;
    const remaining: Record<PersonId, Person> = {};
    for (const [pid, person] of Object.entries(t.people)) {
        if (pid === id) continue;
        remaining[pid] = sweepReferences(person, id);
    }
    const couples = t.couples.filter(
        (c) => c.leftId !== id && c.rightId !== id && !c.childIds.includes(id),
    );
    return { ...t, people: remaining, couples };
}

function sweepReferences(p: Person, removedId: PersonId): Person {
    const next: Person = { ...p, spouseIds: p.spouseIds.filter((s) => s !== removedId) };
    if (p.motherId === removedId) delete next.motherId;
    if (p.fatherId === removedId) delete next.fatherId;
    if (p.anchorParentId === removedId) delete next.anchorParentId;
    return next;
}

export function linkParent(t: Tree, childId: PersonId, parentId: PersonId): Result<Tree, string> {
    const child = t.people[childId];
    const parent = t.people[parentId];
    if (!child) return err(`unknown child id: ${childId}`);
    if (!parent) return err(`unknown parent id: ${parentId}`);

    // self-parent and ancestral cycles are allowed (time travel, recursive
    // lineage, asexual self-reproduction); validate.ts flags them as findings
    // so the editor can surface the loop without blocking the operation
    const role: "motherId" | "fatherId" = parent.gender === "f" ? "motherId" : "fatherId";
    const next: Person = { ...child, [role]: parentId };
    return ok({ ...t, people: { ...t.people, [childId]: next } });
}

export function unlinkParent(t: Tree, childId: PersonId, role: "mother" | "father"): Tree {
    const child = t.people[childId];
    if (!child) return t;
    const next: Person = { ...child };
    if (role === "mother") delete next.motherId;
    else delete next.fatherId;
    return { ...t, people: { ...t.people, [childId]: next } };
}

export function linkSpouse(
    t: Tree,
    aId: PersonId,
    bId: PersonId,
    unionIndex?: number,
): Result<Tree, string> {
    const a = t.people[aId];
    const b = t.people[bId];
    if (!a) return err(`unknown spouse id: ${aId}`);
    if (!b) return err(`unknown spouse id: ${bId}`);

    if (aId === bId) {
        // self-spouse is allowed; record as a single-id couple and flag in validate
        const spouseIds = a.spouseIds.includes(aId) ? a.spouseIds : [...a.spouseIds, aId];
        const couples = upsertCouple(t.couples, aId, aId, unionIndex ?? nextUnionIndex(t.couples));
        return ok({
            ...t,
            people: { ...t.people, [aId]: { ...a, spouseIds } },
            couples,
        });
    }

    const aSpouses = a.spouseIds.includes(bId) ? a.spouseIds : [...a.spouseIds, bId];
    const bSpouses = b.spouseIds.includes(aId) ? b.spouseIds : [...b.spouseIds, aId];

    const couples = upsertCouple(t.couples, aId, bId, unionIndex ?? nextUnionIndex(t.couples));

    return ok({
        ...t,
        people: {
            ...t.people,
            [aId]: { ...a, spouseIds: aSpouses },
            [bId]: { ...b, spouseIds: bSpouses },
        },
        couples,
    });
}

export function unlinkSpouse(t: Tree, aId: PersonId, bId: PersonId): Tree {
    const a = t.people[aId];
    const b = t.people[bId];
    if (!a || !b) return t;
    const couples = t.couples.filter(
        (c) =>
            !((c.leftId === aId && c.rightId === bId) || (c.leftId === bId && c.rightId === aId)),
    );
    return {
        ...t,
        people: {
            ...t.people,
            [aId]: { ...a, spouseIds: a.spouseIds.filter((s) => s !== bId) },
            [bId]: { ...b, spouseIds: b.spouseIds.filter((s) => s !== aId) },
        },
        couples,
    };
}

function upsertCouple(
    couples: readonly CoupleRecord[],
    aId: PersonId,
    bId: PersonId,
    unionIndex: number,
): CoupleRecord[] {
    const existing = couples.find(
        (c) => (c.leftId === aId && c.rightId === bId) || (c.leftId === bId && c.rightId === aId),
    );
    if (existing) return [...couples];
    return [...couples, { leftId: aId, rightId: bId, unionIndex, childIds: [] }];
}

function nextUnionIndex(couples: readonly CoupleRecord[]): number {
    let max = 0;
    for (const c of couples) if (c.unionIndex > max) max = c.unionIndex;
    return max + 1;
}

export function* ancestorsOf(t: Tree, id: PersonId): Iterable<Person> {
    const seen = new Set<PersonId>();
    const queue: PersonId[] = [];
    const start = t.people[id];
    if (!start) return;
    if (start.motherId) queue.push(start.motherId);
    if (start.fatherId) queue.push(start.fatherId);
    while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined || seen.has(next)) continue;
        seen.add(next);
        const p = t.people[next];
        if (!p) continue;
        yield p;
        if (p.motherId) queue.push(p.motherId);
        if (p.fatherId) queue.push(p.fatherId);
    }
}

export function* descendantsOf(t: Tree, id: PersonId): Iterable<Person> {
    const seen = new Set<PersonId>();
    const queue: PersonId[] = [];
    queue.push(...directChildren(t, id));
    while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined || seen.has(next)) continue;
        seen.add(next);
        const p = t.people[next];
        if (!p) continue;
        yield p;
        queue.push(...directChildren(t, next));
    }
}

export function* siblingsOf(t: Tree, id: PersonId): Iterable<Person> {
    const me = t.people[id];
    if (!me) return;
    if (!me.motherId && !me.fatherId) return;
    for (const p of Object.values(t.people)) {
        if (p.id === id) continue;
        const sharesMother = me.motherId !== undefined && p.motherId === me.motherId;
        const sharesFather = me.fatherId !== undefined && p.fatherId === me.fatherId;
        if (sharesMother || sharesFather) yield p;
    }
}

function directChildren(t: Tree, id: PersonId): PersonId[] {
    const out: PersonId[] = [];
    for (const p of Object.values(t.people)) {
        if (p.motherId === id || p.fatherId === id) out.push(p.id);
    }
    return out;
}

function cryptoUuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // node test environment without crypto.randomUUID: fall back to a coarse id
    return `tree-${String(Date.now())}-${String(Math.floor(Math.random() * 1e9))}`;
}
