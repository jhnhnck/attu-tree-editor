/*
 * FamilyTreeEditor - family-view per-person secondary-union state (wave-2 phase 4).
 *
 * Parallel to `primaryUnion.ts`, but tracks which *additional* 2-partner
 * unions a person should render side-by-side with their primary union,
 * not which one is primary. Used by `subset.ts` to pull secondary
 * partners + their children into the bounded subset, and by `layout.ts`
 * to emit a `secondary-mate` rank slot for the secondary partner card.
 *
 * Distinct from:
 *   - `partnersInMultiUnionsOf` (couples.ts) — N>2-partner polycules,
 *     a totally different shape (one union, many partners).
 *   - `usePrimaryUnionState` (primaryUnion.ts) — which 2-partner union
 *     is the *primary* for a person.
 *   - `useExpansionState` (expansion.ts) — which persons have their
 *     `+`/`-` toggles flipped (independent semantic: gates the
 *     "show next generation" behaviour).
 *
 * Cap: at most one expanded secondary union per person (the v1 rollback
 * partner). The setter rejects additions past 1; 3+ expansion stays
 * routed to a follow-up. This is enforced in the setter, not at the
 * read path, so a corrupt localStorage row (manually edited to 3+)
 * still renders sensibly — the extra entries are ignored in
 * `expandedFor(personId)`.
 *
 * Storage layout:
 *   key:   `fte.family-view.secondary-union.v1:{treeId}:{focusId}`
 *   value: `{ "byPerson": { [personId]: number[] } }`  // coupleIndexes
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";

export interface SecondaryUnionState {
    /**
     * Resolved expanded-secondary-union couple indexes for `personId`,
     * honouring the 2-max cap (returns at most 1 entry). Returns an
     * empty array if no secondary union is expanded for that person.
     */
    expandedFor(personId: PersonId): readonly number[];
    /**
     * Add `coupleIndex` to the person's expanded-secondary set. Rejects
     * silently if the person already has the cap (1) expanded — the
     * caller is expected to hide one first. Idempotent.
     */
    expand(personId: PersonId, coupleIndex: number): void;
    /** Remove `coupleIndex` from the person's expanded-secondary set. */
    collapse(personId: PersonId, coupleIndex: number): void;
    /** Drop every expanded-secondary entry for the (treeId, focusId) pair. */
    reset(): void;
    /** Snapshot of the full byPerson map (testing + debug). */
    readonly byPerson: ReadonlyMap<PersonId, ReadonlySet<number>>;
}

const STORAGE_PREFIX = "fte.family-view.secondary-union.v1";
const PER_PERSON_CAP = 1;

export function secondaryUnionStorageKey(treeId: string, focusId: PersonId): string {
    return `${STORAGE_PREFIX}:${treeId}:${focusId}`;
}

interface StoredShape {
    readonly byPerson: Record<string, number[]>;
}

function readStored(key: string): Map<PersonId, Set<number>> {
    try {
        if (typeof localStorage === "undefined") return new Map();
        const raw = localStorage.getItem(key);
        if (!raw) return new Map();
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed !== "object" || parsed === null) return new Map();
        const obj = (parsed as StoredShape).byPerson;
        if (typeof obj !== "object" || obj === null) return new Map();
        const out = new Map<PersonId, Set<number>>();
        for (const [k, v] of Object.entries(obj)) {
            if (!Array.isArray(v)) continue;
            const set = new Set<number>();
            for (const n of v) {
                if (typeof n === "number" && Number.isInteger(n) && n >= 0) set.add(n);
            }
            if (set.size > 0) out.set(k, set);
        }
        return out;
    } catch {
        return new Map();
    }
}

function writeStored(key: string, byPerson: ReadonlyMap<PersonId, ReadonlySet<number>>): void {
    try {
        if (typeof localStorage === "undefined") return;
        const obj: Record<string, number[]> = {};
        for (const [pid, set] of byPerson) {
            if (set.size === 0) continue;
            obj[pid] = [...set].sort((a, b) => a - b);
        }
        const payload: StoredShape = { byPerson: obj };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch {
        // quota / disabled - non-fatal; default empty resolution still works
    }
}

export function useSecondaryUnionState(treeId: string, focusId: PersonId): SecondaryUnionState {
    const key = secondaryUnionStorageKey(treeId, focusId);
    let byPerson = readStored(key);

    return {
        get byPerson(): ReadonlyMap<PersonId, ReadonlySet<number>> {
            return byPerson;
        },
        expandedFor(personId: PersonId): readonly number[] {
            const set = byPerson.get(personId);
            if (!set) return [];
            // honour the cap on read too — a corrupt localStorage row
            // (manually edited to 3+) still renders sensibly.
            return [...set].sort((a, b) => a - b).slice(0, PER_PERSON_CAP);
        },
        expand(personId: PersonId, coupleIndex: number): void {
            const existing = byPerson.get(personId) ?? new Set<number>();
            if (existing.has(coupleIndex)) return;
            if (existing.size >= PER_PERSON_CAP) return; // cap honoured silently
            const next = new Map(byPerson);
            const nextSet = new Set(existing);
            nextSet.add(coupleIndex);
            next.set(personId, nextSet);
            byPerson = next;
            writeStored(key, byPerson);
        },
        collapse(personId: PersonId, coupleIndex: number): void {
            const existing = byPerson.get(personId);
            if (!existing?.has(coupleIndex)) return;
            const next = new Map(byPerson);
            const nextSet = new Set(existing);
            nextSet.delete(coupleIndex);
            if (nextSet.size === 0) next.delete(personId);
            else next.set(personId, nextSet);
            byPerson = next;
            writeStored(key, byPerson);
        },
        reset(): void {
            if (byPerson.size === 0) return;
            byPerson = new Map();
            writeStored(key, byPerson);
        },
    };
}

/** Tests + debug: clear every secondary-union key. */
export function clearAllSecondaryUnion(): void {
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

/** Per-person v1 cap, exposed for callers that want to inspect / validate. */
export const SECONDARY_UNION_PER_PERSON_CAP = PER_PERSON_CAP;
