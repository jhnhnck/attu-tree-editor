/*
 * FamilyTreeEditor - family-view path-highlight hook (Phase 3).
 *
 * Surfaces the BFS path from the currently-selected person to the focus
 * as a flat `pathSet`. Renderer probes membership with `onPath(id)` to
 * thicken edges, accent cards, and stripe collapsed badges whose hidden
 * members lie on the path.
 *
 * Hook surface (`pathSet`, `onPath`) is unchanged from the Phase 0
 * stub so the renderer call sites stay stable.
 *
 * Disconnected pairs and undefined selection both yield an empty set;
 * selection === focus collapses to a one-element set so the focus card
 * still picks up the on-path accent.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";
import { getParents } from "$lib/domain/tree";
import { bfsPath } from "$lib/layout/doi";

export interface PathHighlight {
    readonly pathSet: ReadonlySet<PersonId>;
    onPath(id: PersonId): boolean;
}

const EMPTY: ReadonlySet<PersonId> = new Set<PersonId>();
const EMPTY_HIGHLIGHT: PathHighlight = {
    pathSet: EMPTY,
    onPath(): boolean {
        return false;
    },
};

export function usePath(
    tree: Tree | undefined,
    focusId: PersonId | undefined,
    selectedId: PersonId | undefined,
): PathHighlight {
    if (!tree || !focusId || !selectedId) return EMPTY_HIGHLIGHT;
    const path = bfsPath(tree, selectedId, focusId);
    if (path.length === 0) return EMPTY_HIGHLIGHT;
    const set = new Set<PersonId>(path);
    // extend one hop downward: include immediate children of the selected
    // person so stub edges (selected → child) are also highlighted.
    // stem/bus/bond edges already light up because the selected parent is
    // already in the path set and edgeOnPath uses any-implicated-on-path
    // for non-stub edges.
    // source of truth is each child's parentIds (same pattern as bfsPath).
    for (const p of Object.values(tree.people)) {
        for (const ref of getParents(p)) {
            if (ref.personId === selectedId) {
                set.add(p.id);
                break;
            }
        }
    }
    return {
        pathSet: set,
        onPath(id: PersonId): boolean {
            return set.has(id);
        },
    };
}

/**
 * True iff `badge`'s collapsed members include any person on the path
 * set. Used by the renderer to stripe a collapsed-branch badge when
 * the highlighted path threads through one of its hidden members —
 * keeps the visual chain unbroken without exposing the hidden cards.
 */
export function badgeOnPath(
    badge: { readonly members: readonly PersonId[]; readonly sourceId: PersonId },
    pathSet: ReadonlySet<PersonId>,
): boolean {
    if (pathSet.size === 0) return false;
    if (pathSet.has(badge.sourceId)) return true;
    for (const m of badge.members) if (pathSet.has(m)) return true;
    return false;
}
