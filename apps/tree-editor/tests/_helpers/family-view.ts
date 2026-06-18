/*
 * FamilyTreeEditor - shared unit-test helpers for family-view layout
 * assertions.
 *
 * `pickLeftRight(layout, ids)` and `leftmostAtRank(layout, rank)` ask
 * the *layout* who rendered on the left, instead of hard-coding ids
 * derived from `tree.couples` field order. `orientCouple` swaps left /
 * right by genealogy-conventional rules (father-left, then personId
 * asc as the same-gender tie-break), so a test that asserts
 * `couple.leftId === "X"` flips silently when one of those inputs
 * shifts — bug-log entry B11. routing tests through this helper
 * keeps the assertion stable across personId-lex-order churn.
 *
 * Phase 2 (crossing-minimisation): the new pass reorders rank slots
 * by parent-barycenter; the easiest reorder-aware assertion is
 * "leftmost-at-rank-N is X". both helpers are wired with the same
 * tie-break (personId asc) so a future implementation can match
 * deterministically.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";
import type { FamilyViewLayout } from "$lib/layout/engines/family-view/types";

/**
 * Sort `ids` left-to-right by their placed x-coordinate in `layout`.
 * Ids with the same x break tie by `localeCompare` (matches the
 * `orientCouple` same-gender rule so a tied pair lands the same way
 * the layout would have placed them).
 *
 * Throws on ids missing from `layout.nodes` to fail loudly rather
 * than silently returning a truncated order.
 */
export function pickLeftRight(layout: FamilyViewLayout, ids: readonly PersonId[]): PersonId[] {
    return [...ids].sort((a, b) => {
        const na = layout.nodes.get(a);
        const nb = layout.nodes.get(b);
        if (!na) throw new Error(`pickLeftRight: ${a} not in layout.nodes`);
        if (!nb) throw new Error(`pickLeftRight: ${b} not in layout.nodes`);
        if (na.x !== nb.x) return na.x - nb.x;
        return a.localeCompare(b);
    });
}

/**
 * Return the leftmost person at `rank`, or undefined when no node is
 * placed at that rank. Same tie-break as `pickLeftRight`.
 */
export function leftmostAtRank(layout: FamilyViewLayout, rank: number): PersonId | undefined {
    let best: { id: PersonId; x: number } | undefined;
    for (const [id, node] of layout.nodes) {
        if (node.rank !== rank) continue;
        if (best === undefined) {
            best = { id, x: node.x };
            continue;
        }
        if (node.x < best.x) {
            best = { id, x: node.x };
        } else if (node.x === best.x && id.localeCompare(best.id) < 0) {
            best = { id, x: node.x };
        }
    }
    return best?.id;
}
