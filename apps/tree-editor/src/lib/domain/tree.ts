/*
 * FamilyTreeEditor - immutable tree operations (add, link, remove, traverse)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { generateId, ROOT_ID } from "$lib/domain/ids";
import { legacyGenderCode } from "$lib/domain/personIdentity";
import type { HaracalndeDateData } from "@attu/ui/pure";
import type {
    CoupleRecord,
    Group,
    GroupKind,
    ParentPedi,
    ParentRef,
    ParentRole,
    Person,
    PersonId,
    Relationship,
    RelationshipKind,
    SibshipDecorator,
    SibshipKind,
    Tree,
    UnionKind,
    UnionRecord,
} from "$lib/domain/types";
import { err, ok, type Result } from "@attu/ui/pure";

/**
 * Canonical parent-list reader. Returns `person.parentIds` if it's
 * populated, otherwise an empty array. Always use this rather than
 * reading `parentIds` directly so a missing array reads as no parents.
 */
export function getParents(person: Person): readonly ParentRef[] {
    return person.parentIds ?? [];
}

/**
 * Canonical union-list reader. Returns `tree.unions` if it's populated,
 * otherwise derives a union list from the legacy `tree.couples` array.
 * Use this rather than reading `unions` or `couples` directly so the
 * Phase 3b reader migration is a search-replace from `t.couples` /
 * `t.unions` to `getUnions(t)`.
 *
 * The derivation matches the 2.0.0 → 3.0.0 migration shape exactly:
 * `partnerIds: [leftId, rightId]`, `id: union-<unionIndex>-<l>-<r>`,
 * `childIds` / `marriageDate` / `isPrimary` / `isCurrent` threaded
 * verbatim. New fields (`kind`, `closed`, `preferredBy`, `name`) stay
 * undefined.
 */
export function getUnions(tree: Tree): readonly UnionRecord[] {
    if (tree.unions && tree.unions.length > 0) return tree.unions;
    return tree.couples.map((c) => coupleToUnion(c));
}

function coupleToUnion(c: CoupleRecord): UnionRecord {
    const u: UnionRecord = {
        id: `union-${String(c.unionIndex)}-${c.leftId}-${c.rightId}`,
        partnerIds: [c.leftId, c.rightId],
        childIds: [...c.childIds],
    };
    if (c.marriageDate !== undefined) u.marriageDate = c.marriageDate;
    if (c.isPrimary !== undefined) u.isPrimary = c.isPrimary;
    if (c.isCurrent !== undefined) u.isCurrent = c.isCurrent;
    return u;
}

function matchUnion(u: UnionRecord, partnerIds: readonly PersonId[]): boolean {
    if (u.partnerIds.length !== partnerIds.length) return false;
    const a = [...u.partnerIds].sort();
    const b = [...partnerIds].sort();
    return a.every((id, i) => id === b[i]);
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
        // Phase 3b: every newly-created tree carries `unions: []` from
        // rev 0 so writers can sync unconditionally. Pre-3a fixtures /
        // bundles still load (the helper `getUnions(tree)` falls back to
        // `tree.couples` when the field is absent), but new code paths
        // produce trees that always have both representations populated.
        unions: [],
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
    // Mirror the same field changes onto the matching `unions[]` entry so
    // readers using `getUnions(tree)` see the update. Identifies the union
    // by partner-id set match (legacy couples are 2-partner by construction).
    const unions = (t.unions ?? []).map((u) => {
        if (!matchUnion(u, [aId, bId])) return u;
        const next: UnionRecord = { ...u };
        for (const [k, v] of Object.entries(patch) as [keyof CouplePatch, unknown][]) {
            if (v === undefined) delete next[k];
            else (next[k] as unknown) = v;
        }
        return next;
    });
    return { ...t, couples, unions };
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
    // Strip `id` from every union's partnerIds and childIds; drop the
    // union entirely if no partners remain.
    const unions = (t.unions ?? [])
        .map((u) => {
            if (!u.partnerIds.includes(id) && !u.childIds.includes(id)) return u;
            const partnerIds = u.partnerIds.filter((p) => p !== id);
            const childIds = u.childIds.filter((c) => c !== id);
            return { ...u, partnerIds, childIds };
        })
        .filter((u) => u.partnerIds.length > 0);
    return { ...t, people: remaining, couples, unions };
}

function sweepReferences(p: Person, removedId: PersonId): Person {
    const next: Person = { ...p, spouseIds: p.spouseIds.filter((s) => s !== removedId) };
    if (p.parentIds) {
        const filtered = p.parentIds.filter((r) => r.personId !== removedId);
        if (filtered.length === 0) delete next.parentIds;
        else next.parentIds = filtered;
    }
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
            : legacyGenderCode(parent) === "f"
              ? "mother"
              : "father";

    // Drop any existing entry for the same slot (mother/father), then
    // append the new one. For non-mother/father roles this collapses to
    // "append if not present".
    const existingParents = getParents(child);
    const filtered = existingParents.filter((p) => p.role !== role);
    const updatedParents: ParentRef[] = [...filtered, { personId: parentId, role, pedi: "birth" }];
    const next: Person = { ...child, parentIds: updatedParents };
    return ok({ ...t, people: { ...t.people, [childId]: next } });
}

export function unlinkParent(t: Tree, childId: PersonId, role: "mother" | "father"): Tree {
    const child = t.people[childId];
    if (!child) return t;
    const next: Person = { ...child };
    const existingParents = getParents(child);
    const filtered = existingParents.filter((p) => p.role !== role);
    if (filtered.length === 0) delete next.parentIds;
    else next.parentIds = filtered;
    return { ...t, people: { ...t.people, [childId]: next } };
}

/**
 * Append a parent ref with explicit role + pedi. Use this for the
 * N-parent inspector affordance where the user picks a non-mother/
 * father role or a non-birth pedi. The legacy `linkParent` stays
 * around for callers that only know the two-slot world (drag-drop,
 * GEDCOM HUSB/WIFE stitch). Returns err if `personId` is already
 * present in the child's parentIds — callers should call
 * `updateParentRef` to change an existing entry's role / pedi.
 */
export function linkParentRef(t: Tree, childId: PersonId, ref: ParentRef): Result<Tree, string> {
    const child = t.people[childId];
    if (!child) return err(`unknown child id: ${childId}`);
    if (!t.people[ref.personId]) return err(`unknown parent id: ${ref.personId}`);
    const existing = getParents(child);
    if (existing.some((r) => r.personId === ref.personId)) {
        return err(`parent ${ref.personId} already linked to ${childId}`);
    }
    const next: Person = { ...child, parentIds: [...existing, { ...ref }] };
    return ok({ ...t, people: { ...t.people, [childId]: next } });
}

/**
 * Drop the parent ref pointing at `parentId` from `childId`'s
 * parentIds[]. No-op if not present. Distinct from `unlinkParent`
 * which removes by role.
 */
export function unlinkParentByPersonId(t: Tree, childId: PersonId, parentId: PersonId): Tree {
    const child = t.people[childId];
    if (!child) return t;
    const next: Person = { ...child };
    const existing = getParents(child);
    const filtered = existing.filter((r) => r.personId !== parentId);
    if (filtered.length === existing.length) return t;
    if (filtered.length === 0) delete next.parentIds;
    else next.parentIds = filtered;
    return { ...t, people: { ...t.people, [childId]: next } };
}

/**
 * Mutate an existing parent ref's role and/or pedi (identity stays
 * `personId`). Returns the tree unchanged if no matching entry.
 */
export function updateParentRef(
    t: Tree,
    childId: PersonId,
    parentId: PersonId,
    patch: { role?: ParentRole | undefined; pedi?: ParentPedi | undefined },
): Tree {
    const child = t.people[childId];
    if (!child) return t;
    const existing = getParents(child);
    if (!existing.some((r) => r.personId === parentId)) return t;
    const updated = existing.map((r) => {
        if (r.personId !== parentId) return r;
        const merged: ParentRef = { personId: r.personId };
        const role = patch.role !== undefined ? patch.role : r.role;
        const pedi = patch.pedi !== undefined ? patch.pedi : r.pedi;
        if (role !== undefined) merged.role = role;
        if (pedi !== undefined) merged.pedi = pedi;
        return merged;
    });
    return { ...t, people: { ...t.people, [childId]: { ...child, parentIds: updated } } };
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
        const idx = unionIndex ?? nextUnionIndex(t.couples);
        const couples = upsertCouple(t.couples, aId, aId, idx);
        const unions = upsertUnion(t.unions, [aId], idx);
        return ok({
            ...t,
            people: { ...t.people, [aId]: { ...a, spouseIds } },
            couples,
            unions,
        });
    }

    const aSpouses = a.spouseIds.includes(bId) ? a.spouseIds : [...a.spouseIds, bId];
    const bSpouses = b.spouseIds.includes(aId) ? b.spouseIds : [...b.spouseIds, aId];

    const idx = unionIndex ?? nextUnionIndex(t.couples);
    const couples = upsertCouple(t.couples, aId, bId, idx);
    const unions = upsertUnion(t.unions, [aId, bId], idx);

    return ok({
        ...t,
        people: {
            ...t.people,
            [aId]: { ...a, spouseIds: aSpouses },
            [bId]: { ...b, spouseIds: bSpouses },
        },
        couples,
        unions,
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
    const unions = (t.unions ?? []).filter((u) => !matchUnion(u, [aId, bId]));
    return {
        ...t,
        people: {
            ...t.people,
            [aId]: { ...a, spouseIds: a.spouseIds.filter((s) => s !== bId) },
            [bId]: { ...b, spouseIds: b.spouseIds.filter((s) => s !== aId) },
        },
        couples,
        unions,
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

/**
 * Phase 3a forward-compat: insert a UnionRecord matching `partnerIds`
 * into `unions[]`. No-ops if a record with the same partner set already
 * exists. Always returns an array (creates one if `unions` was
 * undefined) so writers can always produce a populated `unions[]`
 * post-link.
 */
function upsertUnion(
    unions: readonly UnionRecord[] | undefined,
    partnerIds: readonly PersonId[],
    unionIndex: number,
): UnionRecord[] {
    const base = unions ?? [];
    const existing = base.find((u) => matchUnion(u, partnerIds));
    if (existing) return [...base];
    const id =
        partnerIds.length === 2
            ? `union-${String(unionIndex)}-${partnerIds[0] ?? ""}-${partnerIds[1] ?? ""}`
            : `union-${String(unionIndex)}-${[...partnerIds].sort().join("-")}`;
    return [
        ...base,
        {
            id,
            partnerIds: [...partnerIds],
            childIds: [],
        },
    ];
}

function nextUnionIndex(couples: readonly CoupleRecord[]): number {
    let max = 0;
    for (const c of couples) if (c.unionIndex > max) max = c.unionIndex;
    return max + 1;
}

/**
 * Phase 3a N-partner-aware link op. Creates a new union spanning every
 * person in `partnerIds`, generates a fresh deterministic id, and
 * mirrors the resulting bonds into `Person.spouseIds[]` and (for
 * 2-partner unions only) `tree.couples[]`. Unions of size > 2 do not
 * back-fill `couples` — legacy readers will silently miss them until
 * Phase 3b migrates them to `getUnions(tree)`.
 *
 * Returns an error if any partner id is unknown or if `partnerIds` is
 * empty. Self-unions and duplicate-partner unions are tolerated
 * (validate.ts surfaces them as findings).
 */
export function linkUnion(t: Tree, partnerIds: readonly PersonId[]): Result<Tree, string> {
    if (partnerIds.length === 0) return err("linkUnion: partnerIds must be non-empty");
    for (const pid of partnerIds) {
        if (!t.people[pid]) return err(`unknown partner id: ${pid}`);
    }
    const idx = nextUnionIndex(t.couples);
    const unions = upsertUnion(t.unions, partnerIds, idx);

    // mirror spouseIds across every pair within the union
    const peopleNext: Record<PersonId, Person> = { ...t.people };
    for (let i = 0; i < partnerIds.length; i += 1) {
        for (let j = i + 1; j < partnerIds.length; j += 1) {
            const aId = partnerIds[i];
            const bId = partnerIds[j];
            if (aId === undefined || bId === undefined) continue;
            const a = peopleNext[aId];
            const b = peopleNext[bId];
            if (!a || !b) continue;
            if (!a.spouseIds.includes(bId)) {
                peopleNext[aId] = { ...a, spouseIds: [...a.spouseIds, bId] };
            }
            if (!b.spouseIds.includes(aId)) {
                peopleNext[bId] = { ...b, spouseIds: [...b.spouseIds, aId] };
            }
        }
    }

    // self-union is a single-partner case
    if (partnerIds.length === 1) {
        const only = partnerIds[0];
        if (only === undefined) return err("linkUnion: missing partner id");
        const a = peopleNext[only];
        if (a && !a.spouseIds.includes(only)) {
            peopleNext[only] = { ...a, spouseIds: [...a.spouseIds, only] };
        }
    }

    // 2-partner unions back-fill couples; >2-partner unions do not
    let couples = t.couples;
    if (partnerIds.length === 2) {
        const aId = partnerIds[0];
        const bId = partnerIds[1];
        if (aId !== undefined && bId !== undefined) {
            couples = upsertCouple(t.couples, aId, bId, idx);
        }
    } else if (partnerIds.length === 1) {
        const only = partnerIds[0];
        if (only !== undefined) couples = upsertCouple(t.couples, only, only, idx);
    }

    return ok({ ...t, people: peopleNext, couples, unions });
}

/**
 * Append a new partner to an existing union. Mirrors the bond into
 * every existing partner's `spouseIds[]`. Returns err if the union
 * doesn't exist, the person is unknown, or the person is already a
 * partner.
 */
export function addUnionPartner(
    t: Tree,
    unionId: string,
    personId: PersonId,
): Result<Tree, string> {
    if (!t.people[personId]) return err(`unknown person id: ${personId}`);
    const unions = t.unions ?? [];
    const idx = unions.findIndex((u) => u.id === unionId);
    if (idx < 0) return err(`unknown union id: ${unionId}`);
    const u = unions[idx];
    if (!u) return err(`unknown union id: ${unionId}`);
    if (u.partnerIds.includes(personId)) {
        return err(`person ${personId} already in union ${unionId}`);
    }
    const nextUnion: UnionRecord = { ...u, partnerIds: [...u.partnerIds, personId] };
    const nextUnions = [...unions.slice(0, idx), nextUnion, ...unions.slice(idx + 1)];

    // mirror bond on every existing partner
    const peopleNext: Record<PersonId, Person> = { ...t.people };
    const newPerson = peopleNext[personId];
    if (!newPerson) return err(`unknown person id: ${personId}`);
    const newSpouseAdds: PersonId[] = [];
    for (const pid of u.partnerIds) {
        if (pid === personId) continue;
        const existing = peopleNext[pid];
        if (!existing) continue;
        if (!existing.spouseIds.includes(personId)) {
            peopleNext[pid] = { ...existing, spouseIds: [...existing.spouseIds, personId] };
        }
        if (!newPerson.spouseIds.includes(pid) && !newSpouseAdds.includes(pid)) {
            newSpouseAdds.push(pid);
        }
    }
    if (newSpouseAdds.length > 0) {
        peopleNext[personId] = {
            ...newPerson,
            spouseIds: [...newPerson.spouseIds, ...newSpouseAdds],
        };
    }
    return ok({ ...t, people: peopleNext, unions: nextUnions });
}

/**
 * Remove a partner from an existing union. If the union drops to zero
 * partners, the record itself is deleted. Does NOT remove
 * `Person.spouseIds[]` entries — a person can have a spouse bond
 * outside this union (e.g. open polycule). The caller decides whether
 * to also call `unlinkSpouse` for symmetry.
 */
export function removeUnionPartner(t: Tree, unionId: string, personId: PersonId): Tree {
    const unions = t.unions ?? [];
    const idx = unions.findIndex((u) => u.id === unionId);
    if (idx < 0) return t;
    const u = unions[idx];
    if (!u) return t;
    if (!u.partnerIds.includes(personId)) return t;
    const remaining = u.partnerIds.filter((p) => p !== personId);
    if (remaining.length === 0) {
        return { ...t, unions: [...unions.slice(0, idx), ...unions.slice(idx + 1)] };
    }
    const nextUnion: UnionRecord = { ...u, partnerIds: remaining };
    return { ...t, unions: [...unions.slice(0, idx), nextUnion, ...unions.slice(idx + 1)] };
}

/**
 * Patch a union's metadata fields without changing its identity or
 * partnership. Useful for renaming, toggling `closed`, setting `kind`,
 * etc. No-ops if `unionId` is unknown.
 */
export type UnionPatch = {
    kind?: UnionKind | undefined;
    closed?: boolean | undefined;
    name?: string | undefined;
    marriageDate?: UnionRecord["marriageDate"] | undefined;
    isPrimary?: boolean | undefined;
    isCurrent?: boolean | undefined;
    /**
     * Per-partner preferred-union flag. Pass `{ [personId]: true }` to
     * mark a person's preferred union; pass `{ [personId]: false }` (or
     * omit the key from a fresh map) to clear. Passing `undefined`
     * clears the entire field.
     */
    preferredBy?: Record<PersonId, boolean> | undefined;
};

export function updateUnion(t: Tree, unionId: string, patch: UnionPatch): Tree {
    const unions = t.unions ?? [];
    const idx = unions.findIndex((u) => u.id === unionId);
    if (idx < 0) return t;
    const u = unions[idx];
    if (!u) return t;
    const next: UnionRecord = { ...u };
    for (const [k, v] of Object.entries(patch) as [keyof UnionPatch, unknown][]) {
        if (v === undefined) delete next[k];
        else (next[k] as unknown) = v;
    }
    return { ...t, unions: [...unions.slice(0, idx), next, ...unions.slice(idx + 1)] };
}

/**
 * Mark `personId`'s preferred union to be `unionId` (or clear it when
 * `preferred` is false). Enforces the one-preferred-union-per-person
 * invariant by sweeping every other union and clearing the same key.
 * No-ops if `unionId` is unknown or `personId` isn't in the target
 * union. Called by the inspector "preferred" toggle and the
 * Phase 3c localStorage migration.
 */
export function setPreferredUnion(
    t: Tree,
    unionId: string,
    personId: PersonId,
    preferred: boolean,
): Tree {
    const unions = t.unions ?? [];
    const idx = unions.findIndex((u) => u.id === unionId);
    if (idx < 0) return t;
    const target = unions[idx];
    if (!target || !target.partnerIds.includes(personId)) return t;
    const nextUnions = unions.map((u, i) => {
        const pref = { ...(u.preferredBy ?? {}) };
        if (i === idx) {
            if (preferred) pref[personId] = true;
            else delete pref[personId];
        } else {
            // sweep: a person has at most one preferred union
            if (pref[personId] !== undefined) delete pref[personId];
        }
        const nextU: UnionRecord = { ...u };
        if (Object.keys(pref).length === 0) delete nextU.preferredBy;
        else nextU.preferredBy = pref;
        return nextU;
    });
    return { ...t, unions: nextUnions };
}

/**
 * Patch shape for `updateRelationship`. Every field optional; passing
 * `undefined` clears that field on the record. Domain layer does not
 * validate kind / source / target combinations — the schema is permissive
 * (CLAUDE.md hard rule 4).
 */
export type RelationshipPatch = {
    kind?: RelationshipKind;
    sourceIds?: readonly PersonId[];
    targetIds?: readonly PersonId[];
    cause?: string | undefined;
    date?: HaracalndeDateData | undefined;
    notes?: string | undefined;
};

/**
 * Append a Relationship to `tree.relationships[]`. Generates a stable id
 * `rel-<kind>-<sourceIds...>-<targetIds...>` so reconstruction from
 * GEDCOM produces the same id when the xref-derived id isn't available.
 * Initialises `relationships` to `[]` if absent.
 */
export function addRelationship(
    t: Tree,
    rel: Omit<Relationship, "id"> & { id?: string },
): { tree: Tree; id: string } {
    const id = rel.id ?? defaultRelationshipId(rel);
    const next: Relationship = {
        id,
        kind: rel.kind,
        sourceIds: [...rel.sourceIds],
        targetIds: [...rel.targetIds],
    };
    if (rel.cause !== undefined) next.cause = rel.cause;
    if (rel.date !== undefined) next.date = rel.date;
    if (rel.notes !== undefined) next.notes = rel.notes;
    const list = t.relationships ?? [];
    return { tree: { ...t, relationships: [...list, next] }, id };
}

/**
 * Remove a Relationship by id. No-op if the id is unknown (consistent
 * with the rest of the domain layer's permissive style).
 */
export function removeRelationship(t: Tree, relId: string): Tree {
    const list = t.relationships ?? [];
    const next = list.filter((r) => r.id !== relId);
    if (next.length === list.length) return t;
    return { ...t, relationships: next };
}

/**
 * Patch a Relationship in place. `undefined` in the patch clears the
 * corresponding optional field; arrays are replaced wholesale (no
 * append semantics). Returns the tree unchanged if the id is unknown.
 */
export function updateRelationship(t: Tree, relId: string, patch: RelationshipPatch): Tree {
    const list = t.relationships ?? [];
    const idx = list.findIndex((r) => r.id === relId);
    if (idx < 0) return t;
    const r = list[idx];
    if (!r) return t;
    const next: Relationship = { ...r };
    if (patch.kind !== undefined) next.kind = patch.kind;
    if (patch.sourceIds !== undefined) next.sourceIds = [...patch.sourceIds];
    if (patch.targetIds !== undefined) next.targetIds = [...patch.targetIds];
    if ("cause" in patch) {
        if (patch.cause === undefined) delete next.cause;
        else next.cause = patch.cause;
    }
    if ("date" in patch) {
        if (patch.date === undefined) delete next.date;
        else next.date = patch.date;
    }
    if ("notes" in patch) {
        if (patch.notes === undefined) delete next.notes;
        else next.notes = patch.notes;
    }
    return { ...t, relationships: [...list.slice(0, idx), next, ...list.slice(idx + 1)] };
}

function defaultRelationshipId(rel: {
    kind: RelationshipKind;
    sourceIds: readonly PersonId[];
    targetIds: readonly PersonId[];
}): string {
    const parts = [...rel.sourceIds, ...rel.targetIds];
    return `rel-${rel.kind}-${parts.join("-")}`;
}

export type GroupPatch = {
    name?: Group["name"];
    kind?: Group["kind"];
    founderId?: Group["founderId"] | undefined;
    armorial?: Group["armorial"] | undefined;
    frame?: Group["frame"] | undefined;
};

/**
 * Append a `Group` to `tree.groups[]`. Generates a stable id
 * `group-<kind>-<name-slug>-<memberIds.length>` so GEDCOM round-trip
 * + programmatic creation produce the same id. Initialises `groups`
 * to `[]` if absent.
 */
export function addGroup(
    t: Tree,
    g: Omit<Group, "id"> & { id?: string },
): { tree: Tree; id: string } {
    const id = g.id ?? defaultGroupId(g);
    const next: Group = {
        id,
        name: g.name,
        kind: g.kind,
        memberIds: [...g.memberIds],
    };
    if (g.founderId !== undefined) next.founderId = g.founderId;
    if (g.armorial !== undefined) next.armorial = g.armorial;
    if (g.frame !== undefined) next.frame = g.frame;
    const list = t.groups ?? [];
    return { tree: { ...t, groups: [...list, next] }, id };
}

/**
 * Remove a group by id. No-op if unknown.
 */
export function removeGroup(t: Tree, groupId: string): Tree {
    const list = t.groups ?? [];
    const next = list.filter((g) => g.id !== groupId);
    if (next.length === list.length) return t;
    return { ...t, groups: next };
}

/**
 * Patch a group's scalar fields. `undefined` in the patch clears the
 * corresponding optional field. memberIds are not patched here — use
 * `addGroupMember` / `removeGroupMember` for membership mutations.
 */
export function updateGroup(t: Tree, groupId: string, patch: GroupPatch): Tree {
    const list = t.groups ?? [];
    const idx = list.findIndex((g) => g.id === groupId);
    if (idx < 0) return t;
    const g = list[idx];
    if (!g) return t;
    const next: Group = { ...g };
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.kind !== undefined) next.kind = patch.kind;
    if ("founderId" in patch) {
        if (patch.founderId === undefined) delete next.founderId;
        else next.founderId = patch.founderId;
    }
    if ("armorial" in patch) {
        if (patch.armorial === undefined) delete next.armorial;
        else next.armorial = patch.armorial;
    }
    if ("frame" in patch) {
        if (patch.frame === undefined) delete next.frame;
        else next.frame = patch.frame;
    }
    return { ...t, groups: [...list.slice(0, idx), next, ...list.slice(idx + 1)] };
}

export function addGroupMember(t: Tree, groupId: string, personId: PersonId): Tree {
    const list = t.groups ?? [];
    const idx = list.findIndex((g) => g.id === groupId);
    if (idx < 0) return t;
    const g = list[idx];
    if (!g || g.memberIds.includes(personId)) return t;
    const next: Group = { ...g, memberIds: [...g.memberIds, personId] };
    return { ...t, groups: [...list.slice(0, idx), next, ...list.slice(idx + 1)] };
}

export function removeGroupMember(t: Tree, groupId: string, personId: PersonId): Tree {
    const list = t.groups ?? [];
    const idx = list.findIndex((g) => g.id === groupId);
    if (idx < 0) return t;
    const g = list[idx];
    if (!g) return t;
    const filtered = g.memberIds.filter((id) => id !== personId);
    if (filtered.length === g.memberIds.length) return t;
    const next: Group = { ...g, memberIds: filtered };
    return { ...t, groups: [...list.slice(0, idx), next, ...list.slice(idx + 1)] };
}

function defaultGroupId(g: {
    kind: GroupKind;
    name: string;
    memberIds: readonly PersonId[];
}): string {
    const slug = g.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return `group-${g.kind}-${slug || "unnamed"}-${String(g.memberIds.length)}`;
}

export type SibshipPatch = {
    kind?: SibshipDecorator["kind"];
    name?: SibshipDecorator["name"] | undefined;
};

/**
 * Append a `SibshipDecorator` to `tree.sibshipDecorators[]`. Generates
 * a stable id `sibship-<kind>-<sorted-sibIds-hash>` so re-runs produce
 * the same id; initialises the list to `[]` if absent. Caller is
 * responsible for ensuring members actually share a parent — the
 * renderer filters decorators whose members don't share a visible
 * parent.
 */
export function addSibshipDecorator(
    t: Tree,
    d: Omit<SibshipDecorator, "id"> & { id?: string },
): { tree: Tree; id: string } {
    const id = d.id ?? defaultSibshipId(d);
    const next: SibshipDecorator = {
        id,
        sibIds: [...d.sibIds],
        kind: d.kind,
    };
    if (d.name !== undefined) next.name = d.name;
    const list = t.sibshipDecorators ?? [];
    return { tree: { ...t, sibshipDecorators: [...list, next] }, id };
}

export function removeSibshipDecorator(t: Tree, id: string): Tree {
    const list = t.sibshipDecorators ?? [];
    const next = list.filter((d) => d.id !== id);
    if (next.length === list.length) return t;
    return { ...t, sibshipDecorators: next };
}

export function updateSibshipDecorator(t: Tree, id: string, patch: SibshipPatch): Tree {
    const list = t.sibshipDecorators ?? [];
    const idx = list.findIndex((d) => d.id === id);
    if (idx < 0) return t;
    const d = list[idx];
    if (!d) return t;
    const next: SibshipDecorator = { ...d };
    if (patch.kind !== undefined) next.kind = patch.kind;
    if ("name" in patch) {
        if (patch.name === undefined) delete next.name;
        else next.name = patch.name;
    }
    return { ...t, sibshipDecorators: [...list.slice(0, idx), next, ...list.slice(idx + 1)] };
}

export function addSibshipMember(t: Tree, id: string, personId: PersonId): Tree {
    const list = t.sibshipDecorators ?? [];
    const idx = list.findIndex((d) => d.id === id);
    if (idx < 0) return t;
    const d = list[idx];
    if (!d || d.sibIds.includes(personId)) return t;
    const next: SibshipDecorator = { ...d, sibIds: [...d.sibIds, personId] };
    return { ...t, sibshipDecorators: [...list.slice(0, idx), next, ...list.slice(idx + 1)] };
}

export function removeSibshipMember(t: Tree, id: string, personId: PersonId): Tree {
    const list = t.sibshipDecorators ?? [];
    const idx = list.findIndex((d) => d.id === id);
    if (idx < 0) return t;
    const d = list[idx];
    if (!d) return t;
    const filtered = d.sibIds.filter((pid) => pid !== personId);
    if (filtered.length === d.sibIds.length) return t;
    const next: SibshipDecorator = { ...d, sibIds: filtered };
    return { ...t, sibshipDecorators: [...list.slice(0, idx), next, ...list.slice(idx + 1)] };
}

function defaultSibshipId(d: { kind: SibshipKind; sibIds: readonly PersonId[] }): string {
    const sorted = [...d.sibIds].sort().join("-");
    return `sibship-${d.kind}-${sorted}`;
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
