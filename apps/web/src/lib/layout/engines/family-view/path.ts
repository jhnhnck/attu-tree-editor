/*
 * FamilyTreeEditor - family-view path-highlight hook (Phase 0 stub).
 *
 * Phase 3 fills the body with the real `bfsPath(focus, selected)` walk
 * (or extended `bfsDistances` — the spike picks one). The renderer reads
 * `onPath(edgePersonId)` to choose its stroke class, so when Phase 3
 * lands edges immediately restyle without renderer changes.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";

export interface PathHighlight {
    readonly pathSet: ReadonlySet<PersonId>;
    onPath(id: PersonId): boolean;
}

const EMPTY: ReadonlySet<PersonId> = new Set<PersonId>();

/**
 * Phase 0 stub. Returns empty set + always-false. Phase 3 replaces with
 * a BFS path walk; the shape (not the behaviour) is the Phase 3 contract.
 */
export function usePath(_focusId: PersonId, _selectedId: PersonId | undefined): PathHighlight {
    return {
        pathSet: EMPTY,
        onPath(): boolean {
            return false;
        },
    };
}
