/*
 * FamilyTreeEditor - family-view expansion-state hook (Phase 0 stub).
 *
 * Phase 1 fills the bodies with real localStorage-backed state + auto-
 * collapse ranking; the call-site signature here is the one Phase 1 will
 * keep so layout.ts does not change.
 *
 * Storage convention (when wired): localStorage key
 * `fte.family-view.expansion.v1:{treeId}:{focusId}` carries a JSON-
 * encoded `{ expanded: PersonId[] }` blob. The `autoCollapsed` set is
 * computed each layout pass, not persisted.
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

const EMPTY: ReadonlySet<PersonId> = new Set<PersonId>();

/**
 * Phase 0 stub. Returns an inert state object — both sets empty,
 * mutators are no-ops. The shape (not the behaviour) is the Phase 1
 * contract; do not change the return type without updating Phase 1's
 * call sites in `layout.ts`.
 */
export function useExpansionState(_treeId: string, _focusId: PersonId): ExpansionState {
    return {
        expanded: EMPTY,
        autoCollapsed: EMPTY,
        setExpanded(): void {
            // Phase 1: persist to localStorage + flip in-memory set.
        },
        reset(): void {
            // Phase 1: clear persisted set for this (treeId, focusId).
        },
    };
}
