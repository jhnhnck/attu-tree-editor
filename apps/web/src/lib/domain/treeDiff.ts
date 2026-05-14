/*
 * FamilyTreeEditor - structural diff/patch for Tree objects used by undo/redo history
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { CoupleRecord, Person, PersonId, Tree, UnionRecord } from "$lib/domain/types";

export interface TreeDiff {
    people: Record<PersonId, { before: Person | null; after: Person | null }>;
    /** keyed by `${leftId}+${rightId}` */
    couples: Record<string, { before: CoupleRecord | null; after: CoupleRecord | null }>;
    /**
     * Keyed by `UnionRecord.id` (deterministic from migration or fresh uuid
     * from `linkUnion`). Captures inserts, deletes, and field-level changes
     * (kind, closed, name, marriageDate, isPrimary, isCurrent, preferredBy,
     * partnerIds, childIds). Mirrors the `couples` field semantically; both
     * coexist during the Phase 3a/3b transition.
     */
    unions: Record<string, { before: UnionRecord | null; after: UnionRecord | null }>;
    rootId?: { before: PersonId; after: PersonId };
    name?: { before: string; after: string };
    updatedAt?: { before: number; after: number };
    // editRev is deliberately not tracked: the store bumps it on every applied
    // mutation, so encoding it in the diff would either double-bump on undo or
    // produce non-empty diffs for trees that differ only by counter, which
    // would push spurious entries onto the undo stack.
}

function coupleKey(c: CoupleRecord): string {
    return `${c.leftId}+${c.rightId}`;
}

export function diffTrees(before: Tree, after: Tree): TreeDiff {
    const people: TreeDiff["people"] = {};

    const allPersonIds = new Set([...Object.keys(before.people), ...Object.keys(after.people)]);
    for (const id of allPersonIds) {
        const b = before.people[id] ?? null;
        const a = after.people[id] ?? null;
        if (JSON.stringify(b) !== JSON.stringify(a)) {
            people[id] = { before: b, after: a };
        }
    }

    const couples: TreeDiff["couples"] = {};
    const beforeCouples = new Map(before.couples.map((c) => [coupleKey(c), c]));
    const afterCouples = new Map(after.couples.map((c) => [coupleKey(c), c]));

    const allCoupleKeys = new Set([...beforeCouples.keys(), ...afterCouples.keys()]);
    for (const key of allCoupleKeys) {
        const b = beforeCouples.get(key) ?? null;
        const a = afterCouples.get(key) ?? null;
        if (JSON.stringify(b) !== JSON.stringify(a)) {
            couples[key] = { before: b, after: a };
        }
    }

    const unions: TreeDiff["unions"] = {};
    const beforeUnions = new Map((before.unions ?? []).map((u) => [u.id, u]));
    const afterUnions = new Map((after.unions ?? []).map((u) => [u.id, u]));
    const allUnionKeys = new Set([...beforeUnions.keys(), ...afterUnions.keys()]);
    for (const key of allUnionKeys) {
        const b = beforeUnions.get(key) ?? null;
        const a = afterUnions.get(key) ?? null;
        if (JSON.stringify(b) !== JSON.stringify(a)) {
            unions[key] = { before: b, after: a };
        }
    }

    return {
        people,
        couples,
        unions,
        ...(before.rootId !== after.rootId
            ? { rootId: { before: before.rootId, after: after.rootId } }
            : {}),
        ...(before.name !== after.name ? { name: { before: before.name, after: after.name } } : {}),
        ...(before.updatedAt !== after.updatedAt
            ? { updatedAt: { before: before.updatedAt, after: after.updatedAt } }
            : {}),
    };
}

export function applyDiff(tree: Tree, diff: TreeDiff): Tree {
    const people = { ...tree.people };
    for (const [id, { after }] of Object.entries(diff.people)) {
        if (after === null) {
            delete people[id];
        } else {
            people[id] = after;
        }
    }

    // Preserve couple order: map existing couples in-place, then append new ones.
    const processedKeys = new Set<string>();
    const couples = tree.couples
        .map((c) => {
            const key = coupleKey(c);
            const entry = diff.couples[key];
            if (entry === undefined) return c;
            processedKeys.add(key);
            return entry.after;
        })
        .filter((c): c is CoupleRecord => c !== null);

    for (const [key, { after }] of Object.entries(diff.couples)) {
        if (!processedKeys.has(key) && after !== null) {
            couples.push(after);
        }
    }

    // Same order-preserving treatment for unions[]. Omit the field
    // entirely when the diff has no union changes AND the input tree
    // had no `unions` field, so pre-3a fixtures don't grow an empty
    // `unions` key just from passing through `applyDiff`.
    const hasUnionChanges = Object.keys(diff.unions).length > 0;
    const inputHasUnions = tree.unions !== undefined;
    let unionsOut: UnionRecord[] | undefined;
    if (hasUnionChanges || inputHasUnions) {
        const processedUnionKeys = new Set<string>();
        const acc = (tree.unions ?? [])
            .map((u) => {
                const entry = diff.unions[u.id];
                if (entry === undefined) return u;
                processedUnionKeys.add(u.id);
                return entry.after;
            })
            .filter((u): u is UnionRecord => u !== null);
        for (const [key, { after }] of Object.entries(diff.unions)) {
            if (!processedUnionKeys.has(key) && after !== null) {
                acc.push(after);
            }
        }
        unionsOut = acc;
    }

    return {
        ...tree,
        people,
        couples,
        ...(unionsOut !== undefined ? { unions: unionsOut } : {}),
        ...(diff.rootId !== undefined ? { rootId: diff.rootId.after } : {}),
        ...(diff.name !== undefined ? { name: diff.name.after } : {}),
        ...(diff.updatedAt !== undefined ? { updatedAt: diff.updatedAt.after } : {}),
    };
}

export function invertDiff(diff: TreeDiff): TreeDiff {
    const people: TreeDiff["people"] = {};
    for (const [id, { before, after }] of Object.entries(diff.people)) {
        people[id] = { before: after, after: before };
    }

    const couples: TreeDiff["couples"] = {};
    for (const [key, { before, after }] of Object.entries(diff.couples)) {
        couples[key] = { before: after, after: before };
    }

    const unions: TreeDiff["unions"] = {};
    for (const [key, { before, after }] of Object.entries(diff.unions)) {
        unions[key] = { before: after, after: before };
    }

    return {
        people,
        couples,
        unions,
        ...(diff.rootId
            ? { rootId: { before: diff.rootId.after, after: diff.rootId.before } }
            : {}),
        ...(diff.name ? { name: { before: diff.name.after, after: diff.name.before } } : {}),
        ...(diff.updatedAt
            ? { updatedAt: { before: diff.updatedAt.after, after: diff.updatedAt.before } }
            : {}),
    };
}

export function isEmptyDiff(diff: TreeDiff): boolean {
    return (
        Object.keys(diff.people).length === 0 &&
        Object.keys(diff.couples).length === 0 &&
        Object.keys(diff.unions).length === 0 &&
        diff.rootId === undefined &&
        diff.name === undefined &&
        diff.updatedAt === undefined
    );
}
