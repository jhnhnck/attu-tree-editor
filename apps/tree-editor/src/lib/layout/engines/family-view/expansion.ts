/*
 * FamilyTreeEditor - family-view expansion-state hook (Phase 1).
 *
 * The user-explicit-expand set lives in `localStorage` keyed by
 * `fte.family-view.expansion.v1:{treeId}:{focusId}`. Each entry is a
 * person id whose adjacent generation (children today; ancestors in a
 * later phase) was explicitly expanded by the user via the `+`
 * affordance. The default bounded subset is *not* in this set; only
 * explicit user choices live here.
 *
 * `autoCollapsed` is *not* persisted — it is recomputed each layout
 * pass from the visible-count budget. Storing it would let stale
 * collapse decisions outlive their context (e.g. user clears expanded
 * state but autoCollapsed stays).
 *
 * The hook surface (`expanded`, `autoCollapsed`, `setExpanded`,
 * `reset`) matches Phase 0's stub so the renderer's call site does
 * not change.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";

export interface ExpansionState {
    readonly expanded: ReadonlySet<PersonId>;
    readonly autoCollapsed: ReadonlySet<PersonId>;
    setExpanded(id: PersonId, on: boolean): void;
    reset(): void;
}

const STORAGE_PREFIX = "fte.family-view.expansion.v1";

export function expansionStorageKey(treeId: string, focusId: PersonId): string {
    return `${STORAGE_PREFIX}:${treeId}:${focusId}`;
}

interface StoredShape {
    readonly expanded: PersonId[];
}

function readStored(key: string): Set<PersonId> {
    try {
        if (typeof localStorage === "undefined") return new Set();
        const raw = localStorage.getItem(key);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed !== "object" || parsed === null) return new Set();
        const arr = (parsed as StoredShape).expanded;
        if (!Array.isArray(arr)) return new Set();
        return new Set(arr.filter((v): v is PersonId => typeof v === "string"));
    } catch {
        return new Set();
    }
}

function writeStored(key: string, set: ReadonlySet<PersonId>): void {
    try {
        if (typeof localStorage === "undefined") return;
        const payload: StoredShape = { expanded: Array.from(set) };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch {
        // quota / disabled — non-fatal; auto-rules still cap visible count
    }
}

/**
 * The Phase 1 hook is structurally simple — it owns a `Set<PersonId>`
 * backed by localStorage. `autoCollapsed` is intentionally always
 * empty here; the layout pass recomputes it per-render from the
 * visible-count budget and surfaces it to the renderer alongside the
 * positioned nodes.
 */
export function useExpansionState(treeId: string, focusId: PersonId): ExpansionState {
    const key = expansionStorageKey(treeId, focusId);
    let expanded = readStored(key);
    const autoCollapsed = new Set<PersonId>();

    return {
        get expanded(): ReadonlySet<PersonId> {
            return expanded;
        },
        get autoCollapsed(): ReadonlySet<PersonId> {
            return autoCollapsed;
        },
        setExpanded(id: PersonId, on: boolean): void {
            const next = new Set(expanded);
            if (on) next.add(id);
            else next.delete(id);
            if (next.size === expanded.size) {
                // No change — avoid a needless write.
                let same = true;
                for (const v of next) if (!expanded.has(v)) same = false;
                if (same) return;
            }
            expanded = next;
            writeStored(key, expanded);
        },
        reset(): void {
            if (expanded.size === 0) return;
            expanded = new Set();
            writeStored(key, expanded);
        },
    };
}

/** For tests + debug: clear every family-view expansion key for one tree. */
export function clearAllExpansion(): void {
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
