/*
 * FamilyTreeEditor - immutable tree operations (add, link, remove, traverse)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { generateId, ROOT_ID } from "$lib/domain/ids";
import type { CoupleRecord, ParentRef, Person, PersonId, Tree } from "$lib/domain/types";
import { err, ok, type Result } from "$lib/utils/result";

/**
 * Canonical parent-list reader (Phase 2a of the relationship-vocabulary
 * plan). Returns `person.parentIds` if it's populated; otherwise derives
 * from the legacy `motherId` / `fatherId` fields so pre-migration data
 * still resolves cleanly.
 *
 * Use this everywhere a consumer needs to enumerate a person's parents.
 * Reading the legacy fields directly is OK in Phase 2a (the migration
 * keeps both in sync) but breaks in Phase 2b when the legacy fields are
 * removed from the `Person` type entirely.
 */
export function getParents(person: Person): readonly ParentRef[] {
    if (person.parentIds && person.parentIds.length > 0) return person.parentIds;
    const derived: ParentRef[] = [];
    if (person.motherId !== undefined) {
        derived.push({ personId: person.motherId, role: "mother", pedi: "birth" });
    }
    if (person.fatherId !== undefined) {
        derived.push({ personId: person.fatherId, role: "father", pedi: "birth" });
    }
    return derived;
}

/**
 * Patch type for `updatePerson`. Required `Person` fields stay set (you can
 * change them but you can't clear them); optional fields accept `undefined`
 * as an explicit "clear this field" sentinel that `updatePerson` honors by
 * deleting the key from the resulting record. closes the long-standing
 * editor-cannot-clear-optional-fields papercut documented in to-do.md.
 */
type RequiredPersonKeys = "id" | "given" | "surname" | "gender" | "spouseIds" | "display";
type OptionalPersonKeys = Exclude<keyof Person, RequiredPersonKeys>;
export type PersonPatch = {
    [K in RequiredPersonKeys]?: Person[K];
} & {
    [K in OptionalPersonKeys]?: Person[K] | undefined;
};

export function createTree(name: string, root: Omit<Person, "id">): Tree {
    const rootPerson: Person = { ...root, id: ROOT_ID };
    return {
        id: cryptoUuid(),
        name,
        rootId: ROOT_ID,
        people: { [ROOT_ID]: rootPerson },
        couples: [],
        editRev: 0,
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

export type CouplePatch = {
    marriageDate?: CoupleRecord["marriageDate"];
    isPrimary?: CoupleRecord["isPrimary"];
    isCurrent?: CoupleRecord["isCurrent"];
};

export function updateCouple(t: Tree, aId: PersonId, bId: PersonId, patch: CouplePatch): Tree {
    const couples = t.couples.map((c) => {
        if (!((c.leftId === aId && c.rightId === bId) || (c.leftId === bId && c.rightId === aId)))
            return c;
        const next: CoupleRecord = { ...c };
        for (const [k, v] of Object.entries(patch) as [keyof CouplePatch, unknown][]) {
            if (v === undefined) delete next[k];
            else (next[k] as unknown) = v;
        }
        return next;
    });
    return { ...t, couples };
}

export function updatePerson(t: Tree, id: PersonId, patch: PersonPatch): Tree {
    const existing = t.people[id];
    if (!existing) return t;
    const next: Record<string, unknown> = { ...existing };
    for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
    }
    next.id = existing.id;
    return { ...t, people: { ...t.people, [id]: next as unknown as Person } };
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

export function linkParent(
    t: Tree,
    childId: PersonId,
    parentId: PersonId,
    roleOverride?: "mother" | "father",
): Result<Tree, string> {
    const child = t.people[childId];
    const parent = t.people[parentId];
    if (!child) return err(`unknown child id: ${childId}`);
    if (!parent) return err(`unknown parent id: ${parentId}`);

    // self-parent and ancestral cycles are allowed (time travel, recursive
    // lineage, asexual self-reproduction); validate.ts flags them as findings
    // so the editor can surface the loop without blocking the operation
    const role: "mother" | "father" =
        roleOverride === "mother" || roleOverride === "father"
            ? roleOverride
            : parent.gender === "f"
              ? "mother"
              : "father";

    // Phase 2a: write to BOTH the legacy field and `parentIds[]`. Phase
    // 2b removes the legacy write.
    const legacyKey = role === "mother" ? "motherId" : "fatherId";
    const existingParents = getParents(child);
    // Drop any existing entry for the same slot (mother/father), then
    // append the new one. For non-mother/father roles (Phase 2b), this
    // collapses to "append if not present".
    const filtered = existingParents.filter((p) => p.role !== role);
    const updatedParents: ParentRef[] = [
        ...filtered,
        { personId: parentId, role, pedi: "birth" },
    ];
    const next: Person = {
        ...child,
        [legacyKey]: parentId,
        parentIds: updatedParents,
    };
    return ok({ ...t, people: { ...t.people, [childId]: next } });
}

export function unlinkParent(t: Tree, childId: PersonId, role: "mother" | "father"): Tree {
    const child = t.people[childId];
    if (!child) return t;
    const next: Person = { ...child };
    if (role === "mother") delete next.motherId;
    else delete next.fatherId;
    // Phase 2a: also drop the matching entry from `parentIds`. Phase 2b
    // removes the legacy `delete` above.
    const existingParents = getParents(child);
    next.parentIds = existingParents.filter((p) => p.role !== role);
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
    for (const p of getParents(start)) queue.push(p.personId);
    while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined || seen.has(next)) continue;
        seen.add(next);
        const p = t.people[next];
        if (!p) continue;
        yield p;
        for (const parent of getParents(p)) queue.push(parent.personId);
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
    const myParents = getParents(me);
    if (myParents.length === 0) return;
    const myParentIds = new Set(myParents.map((p) => p.personId));
    for (const p of Object.values(t.people)) {
        if (p.id === id) continue;
        const theirParents = getParents(p);
        const sharesAny = theirParents.some((parent) => myParentIds.has(parent.personId));
        if (sharesAny) yield p;
    }
}

export function directChildren(t: Tree, id: PersonId): PersonId[] {
    const out: PersonId[] = [];
    for (const p of Object.values(t.people)) {
        const parents = getParents(p);
        if (parents.some((parent) => parent.personId === id)) out.push(p.id);
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
