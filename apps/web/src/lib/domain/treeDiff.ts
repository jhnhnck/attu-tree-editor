/*
 * FamilyTreeEditor - structural diff/patch for Tree objects used by undo/redo history
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { CoupleRecord, Person, PersonId, Tree } from "$lib/domain/types";

export interface TreeDiff {
    people: Record<PersonId, { before: Person | null; after: Person | null }>;
    /** keyed by `${leftId}+${rightId}` */
    couples: Record<string, { before: CoupleRecord | null; after: CoupleRecord | null }>;
    rootId?: { before: PersonId; after: PersonId };
    name?: { before: string; after: string };
    updatedAt?: { before: number; after: number };
    rev?: { before: number; after: number };
}

function coupleKey(c: CoupleRecord): string {
    return `${c.leftId}+${c.rightId}`;
}

export function diffTrees(before: Tree, after: Tree): TreeDiff {
    const people: TreeDiff["people"] = {};

    const allPersonIds = new Set([...Object.keys(before.people), ...Object.keys(after.people)]);
    for (const id of allPersonIds) {
        const b = before.people[id as PersonId] ?? null;
        const a = after.people[id as PersonId] ?? null;
        if (JSON.stringify(b) !== JSON.stringify(a)) {
            people[id as PersonId] = { before: b, after: a };
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

    return {
        people,
        couples,
        ...(before.rootId !== after.rootId
            ? { rootId: { before: before.rootId, after: after.rootId } }
            : {}),
        ...(before.name !== after.name ? { name: { before: before.name, after: after.name } } : {}),
        ...(before.updatedAt !== after.updatedAt
            ? { updatedAt: { before: before.updatedAt, after: after.updatedAt } }
            : {}),
        ...(before.rev !== after.rev ? { rev: { before: before.rev, after: after.rev } } : {}),
    };
}

export function applyDiff(tree: Tree, diff: TreeDiff): Tree {
    const people = { ...tree.people };
    for (const [id, { after }] of Object.entries(diff.people)) {
        if (after === null) {
            delete people[id as PersonId];
        } else {
            people[id as PersonId] = after;
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

    for (const [key, { before, after }] of Object.entries(diff.couples)) {
        if (!processedKeys.has(key) && after !== null) {
            couples.push(after);
        }
    }

    return {
        ...tree,
        people,
        couples,
        ...(diff.rootId !== undefined ? { rootId: diff.rootId.after } : {}),
        ...(diff.name !== undefined ? { name: diff.name.after } : {}),
        ...(diff.updatedAt !== undefined ? { updatedAt: diff.updatedAt.after } : {}),
        ...(diff.rev !== undefined ? { rev: diff.rev.after } : {}),
    };
}

export function invertDiff(diff: TreeDiff): TreeDiff {
    const people: TreeDiff["people"] = {};
    for (const [id, { before, after }] of Object.entries(diff.people)) {
        people[id as PersonId] = { before: after, after: before };
    }

    const couples: TreeDiff["couples"] = {};
    for (const [key, { before, after }] of Object.entries(diff.couples)) {
        couples[key] = { before: after, after: before };
    }

    return {
        people,
        couples,
        ...(diff.rootId
            ? { rootId: { before: diff.rootId.after, after: diff.rootId.before } }
            : {}),
        ...(diff.name ? { name: { before: diff.name.after, after: diff.name.before } } : {}),
        ...(diff.updatedAt
            ? { updatedAt: { before: diff.updatedAt.after, after: diff.updatedAt.before } }
            : {}),
        ...(diff.rev ? { rev: { before: diff.rev.after, after: diff.rev.before } } : {}),
    };
}

export function isEmptyDiff(diff: TreeDiff): boolean {
    return (
        Object.keys(diff.people).length === 0 &&
        Object.keys(diff.couples).length === 0 &&
        diff.rootId === undefined &&
        diff.name === undefined &&
        diff.updatedAt === undefined &&
        diff.rev === undefined
    );
}
