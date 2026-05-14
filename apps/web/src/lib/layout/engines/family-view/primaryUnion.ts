/*
 * FamilyTreeEditor - family-view per-person primary-union state (Phase 2).
 *
 * A "primary union" is a per-person UI-state flag pointing at one of the
 * person's CoupleRecords. The renderer uses it to decide which partner
 * sits next to the card and which children block appears in-line. Other
 * unions are hidden by default and reachable via the `˅` affordance.
 *
 * This is UI state, not domain state — it lives in localStorage and
 * does NOT mutate `CoupleRecord.isPrimary`. The reasoning:
 *   - viewing-time preference is per-user / per-session
 *   - canonical "current marriage" is per-tree-data
 * The `˅` tooltip says so explicitly so users don't expect the inspector
 * flag to follow.
 *
 * Storage layout:
 *   key:   `fte.family-view.primary-union.v1:{treeId}:{focusId}`
 *   value: `{ "byPerson": { [personId]: coupleIndex } }`
 *
 * Falls back gracefully if localStorage is unavailable (SSR / quota).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { CoupleRecord, PersonId, Tree } from "$lib/domain/types";

export interface PrimaryUnionState {
    /**
     * Resolved primary couple index for `personId`. Honours user override
     * first; otherwise picks `isPrimary===true`; otherwise the lowest
     * `unionIndex`. Returns undefined when the person has no unions.
     */
    primaryFor(personId: PersonId): number | undefined;
    /** Set or clear the user override for one person. */
    setPrimary(personId: PersonId, coupleIndex: number | undefined): void;
    /** Drop all overrides for the (treeId, focusId) pair. */
    reset(): void;
    /** Snapshot of the override map. */
    readonly overrides: ReadonlyMap<PersonId, number>;
}

const STORAGE_PREFIX = "fte.family-view.primary-union.v1";

export function primaryUnionStorageKey(treeId: string, focusId: PersonId): string {
    return `${STORAGE_PREFIX}:${treeId}:${focusId}`;
}

interface StoredShape {
    readonly byPerson: Record<string, number>;
}

function readStored(key: string): Map<PersonId, number> {
    try {
        if (typeof localStorage === "undefined") return new Map();
        const raw = localStorage.getItem(key);
        if (!raw) return new Map();
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed !== "object" || parsed === null) return new Map();
        const obj = (parsed as StoredShape).byPerson;
        if (typeof obj !== "object" || obj === null) return new Map();
        const out = new Map<PersonId, number>();
        for (const [k, v] of Object.entries(obj)) {
            if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
                out.set(k, v);
            }
        }
        return out;
    } catch {
        return new Map();
    }
}

function writeStored(key: string, overrides: ReadonlyMap<PersonId, number>): void {
    try {
        if (typeof localStorage === "undefined") return;
        const obj: Record<string, number> = {};
        for (const [k, v] of overrides) obj[k] = v;
        const payload: StoredShape = { byPerson: obj };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch {
        // quota / disabled - non-fatal; default resolution still works
    }
}

/**
 * Pick the default primary union when no user override is set:
 *   1. first union with `isPrimary === true`
 *   2. otherwise the lowest-unionIndex union
 * Returns the coupleIndex (position in `tree.couples`), not unionIndex.
 */
export function defaultPrimaryUnion(tree: Tree, personId: PersonId): number | undefined {
    let pick: { idx: number; couple: CoupleRecord } | undefined;
    for (let i = 0; i < tree.couples.length; i += 1) {
        const c = tree.couples[i]!;
        if (c.leftId !== personId && c.rightId !== personId) continue;
        if (c.isPrimary === true) return i;
        if (!pick || c.unionIndex < pick.couple.unionIndex) {
            pick = { idx: i, couple: c };
        }
    }
    return pick?.idx;
}

/** Convenience: list the coupleIndex for every union the person is part of. */
export function unionsOf(tree: Tree, personId: PersonId): readonly number[] {
    const out: number[] = [];
    for (let i = 0; i < tree.couples.length; i += 1) {
        const c = tree.couples[i]!;
        if (c.leftId === personId || c.rightId === personId) out.push(i);
    }
    return out;
}

export function usePrimaryUnionState(treeId: string, focusId: PersonId): PrimaryUnionState {
    const key = primaryUnionStorageKey(treeId, focusId);
    let overrides = readStored(key);

    return {
        get overrides(): ReadonlyMap<PersonId, number> {
            return overrides;
        },
        primaryFor(personId: PersonId): number | undefined {
            return overrides.get(personId);
        },
        setPrimary(personId: PersonId, coupleIndex: number | undefined): void {
            const next = new Map(overrides);
            if (coupleIndex === undefined) next.delete(personId);
            else next.set(personId, coupleIndex);
            // Skip write if no change.
            if (next.size === overrides.size) {
                let same = true;
                for (const [k, v] of next) if (overrides.get(k) !== v) same = false;
                if (same) return;
            }
            overrides = next;
            writeStored(key, overrides);
        },
        reset(): void {
            if (overrides.size === 0) return;
            overrides = new Map();
            writeStored(key, overrides);
        },
    };
}

/** Tests + debug: clear every primary-union key. */
export function clearAllPrimaryUnion(): void {
    try {
        if (typeof localStorage === "undefined") return;
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const k = localStorage.key(i);
            if (k?.startsWith(STORAGE_PREFIX)) keys.push(k);
        }
        for (const k of keys) localStorage.removeItem(k);
    } catch {
        // ignore
    }
}
