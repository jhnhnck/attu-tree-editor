/*
 * FamilyTreeEditor - consanguinity / duplicate-ancestor surfacing
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * Phase 0 of the relationship-vocabulary plan
 * (notes/plans/relationship-vocabulary.md). Phase 6b fills in the real
 * Wright's-formula coefficient computation and duplicate-ancestor walk;
 * this stub exists so renderer hooks and inspector affordances can be
 * wired against the final API surface without computing anything yet.
 *
 * Today: every call returns `{ duplicates: [], coi: undefined }`. The
 * `Consanguinity` overlay toggle in the View menu is disabled until
 * Phase 6b ships.
 */

import type { PersonId, Tree } from "$lib/domain/types";

export interface AncestorOverlap {
    /** Person ids that appear in more than one ancestor path. Empty in v1. */
    readonly duplicates: readonly PersonId[];
    /**
     * Coefficient of inbreeding (Wright's formula), 0..1, or `undefined`
     * if the person has no detected consanguinity. Always `undefined` in v1.
     */
    readonly coi: number | undefined;
}

const EMPTY: AncestorOverlap = { duplicates: [], coi: undefined };

/**
 * Phase 0 stub. Always returns the empty overlap.
 * Phase 6b walks `tree.people[personId].parentIds[]` (when the v2.0.0
 * schema lands) and counts duplicate ancestors via a recursive set
 * union; the COI is computed via Wright's formula over the duplicate
 * paths. Memoised off the layout-worker cache key per the plan's
 * Phase 6b rollback criterion.
 */
export function computeAncestorOverlap(_tree: Tree, _personId: PersonId): AncestorOverlap {
    return EMPTY;
}
