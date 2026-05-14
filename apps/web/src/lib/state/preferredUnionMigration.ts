/*
 * FamilyTreeEditor - Phase 3c follow-up: localStorage primary-union →
 * `UnionRecord.preferredBy` migration on first v3 read.
 *
 * Phase 0 of this plan reconciled the preferred-union commitment as
 * decision (a): the per-browser localStorage UI flag introduced in
 * Phase 6 of the family-view workstream
 * (`fte.family-view.primary-union.v1:{treeId}:{focusId}` →
 * `{ byPerson: { [personId]: coupleIndex } }`) migrates into the
 * domain field `UnionRecord.preferredBy: Record<PersonId, boolean>`
 * the first time a v3-aware code path observes the tree.
 *
 * One-way, idempotent:
 *   - First call writes preferredBy onto matching unions and sets a
 *     per-tree sentinel `fte.migrations.preferred-union.v1:{treeId}`.
 *   - Subsequent calls see the sentinel and return the tree unchanged.
 *   - The migration does NOT delete the legacy localStorage entries.
 *     Phase 4 / Phase 8 can sweep them after the inspector toggle
 *     re-syncs preferences through the domain field for one ship cycle.
 *
 * The legacy storage is per (treeId, focusId) - a person could in
 * principle have different preferences in different focus contexts.
 * The domain field collapses to "one preferred union per person." The
 * collapse rule: first entry encountered (in localStorage key order)
 * wins per personId. The losing entries are dropped silently.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree, UnionRecord } from "$lib/domain/types";

const LEGACY_PREFIX = "fte.family-view.primary-union.v1";
const SENTINEL_PREFIX = "fte.migrations.preferred-union.v1";

interface StoredShape {
    readonly byPerson: Record<string, number>;
}

function sentinelKey(treeId: string): string {
    return `${SENTINEL_PREFIX}:${treeId}`;
}

function legacyKeyPrefix(treeId: string): string {
    return `${LEGACY_PREFIX}:${treeId}:`;
}

/**
 * If the migration has already run for this tree, returns the tree
 * unchanged. Otherwise reads every legacy primary-union key scoped to
 * `tree.id`, applies the collapsed preferences to `tree.unions[]`, and
 * writes a sentinel so the next call no-ops.
 *
 * Safe to call on trees that never had a localStorage entry - we just
 * write the sentinel and return.
 */
export function migratePreferredUnion(tree: Tree): Tree {
    if (typeof localStorage === "undefined") return tree;
    let sentinelExisted = false;
    try {
        sentinelExisted = localStorage.getItem(sentinelKey(tree.id)) !== null;
    } catch {
        return tree;
    }
    if (sentinelExisted) return tree;

    const prefix = legacyKeyPrefix(tree.id);
    const legacyKeys: string[] = [];
    try {
        for (let i = 0; i < localStorage.length; i += 1) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix)) legacyKeys.push(k);
        }
    } catch {
        return tree;
    }

    // walk legacy keys; collapse to first-wins per personId
    const wantPreferred = new Map<PersonId, number>();
    for (const key of legacyKeys) {
        let raw: string | null;
        try {
            raw = localStorage.getItem(key);
        } catch {
            continue;
        }
        if (!raw) continue;
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            continue;
        }
        if (typeof parsed !== "object" || parsed === null) continue;
        const obj = (parsed as StoredShape).byPerson;
        if (typeof obj !== "object" || obj === null) continue;
        for (const [pid, idx] of Object.entries(obj)) {
            if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0) continue;
            if (!wantPreferred.has(pid)) wantPreferred.set(pid, idx);
        }
    }

    // resolve each (personId → coupleIndex) → union (by partnerIds match)
    let mutated: UnionRecord[] | undefined;
    if (wantPreferred.size > 0 && tree.unions && tree.unions.length > 0) {
        for (const [personId, coupleIdx] of wantPreferred) {
            const couple = tree.couples[coupleIdx];
            if (!couple) continue;
            if (couple.leftId !== personId && couple.rightId !== personId) continue;
            // find the union whose partnerIds match the couple pair
            const pair = new Set([couple.leftId, couple.rightId]);
            const source = mutated ?? tree.unions;
            const uIdx = source.findIndex(
                (u) =>
                    u.partnerIds.length === 2 &&
                    pair.has(u.partnerIds[0]!) &&
                    pair.has(u.partnerIds[1]!),
            );
            if (uIdx < 0) continue;
            mutated = mutated ?? source.map((u) => ({ ...u }));
            const target = mutated[uIdx];
            if (!target) continue;
            target.preferredBy = { ...(target.preferredBy ?? {}), [personId]: true };
        }
    }

    // write sentinel even when there was nothing to migrate so the next
    // load skips the localStorage scan entirely
    try {
        localStorage.setItem(sentinelKey(tree.id), "done");
    } catch {
        // quota / disabled - non-fatal; the migration is best-effort
    }

    if (!mutated) return tree;
    return { ...tree, unions: mutated };
}
