/*
 * FamilyTreeEditor - family-view bounded subset selection.
 *
 * Phase 0 walking skeleton. Selects the people that compose the default
 * bounded view: focus + ancestor spine (3 generations) + descendants (2)
 * + siblings at each ancestor rank. Result is the hardcoded subset; no
 * expansion state yet (Phase 1).
 *
 * The selection is intentionally permissive — `linkParent` accepts cycles
 * (rule #6) so the BFS guards against infinite loops with a visited set,
 * never with a structural assumption.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";

/** How many generations up from focus to include (parents = 1). */
export const ANCESTOR_DEPTH = 3;
/** How many generations down from focus to include (children = 1). */
export const DESCENDANT_DEPTH = 2;

export interface RankedSubset {
    /** Visible person ids. */
    readonly visible: ReadonlySet<PersonId>;
    /** Rank for each visible person: 0 = focus, negative = ancestors, positive = descendants. */
    readonly rank: ReadonlyMap<PersonId, number>;
}

/**
 * Walk the focus's ancestors up to `ANCESTOR_DEPTH`, descendants down to
 * `DESCENDANT_DEPTH`, and add siblings at every ancestor rank. Returns a
 * set + per-id rank map.
 *
 * Phase 0 does not include focus's partner or partners of intermediate
 * people; the next phase introduces partner inclusion under the expansion
 * model.
 */
export function selectBoundedSubset(tree: Tree, focusId: PersonId): RankedSubset {
    const visible = new Set<PersonId>();
    const rank = new Map<PersonId, number>();
    if (!tree.people[focusId]) return { visible, rank };

    const place = (id: PersonId, r: number): void => {
        if (!tree.people[id]) return;
        if (visible.has(id)) return;
        visible.add(id);
        rank.set(id, r);
    };

    place(focusId, 0);

    // Ancestor spine + siblings at each ancestor rank.
    let frontier: PersonId[] = [focusId];
    for (let depth = 1; depth <= ANCESTOR_DEPTH; depth += 1) {
        const next: PersonId[] = [];
        for (const id of frontier) {
            const p = tree.people[id];
            if (!p) continue;
            for (const parentId of [p.motherId, p.fatherId]) {
                if (parentId && !visible.has(parentId)) {
                    place(parentId, -depth);
                    next.push(parentId);
                }
            }
        }
        // Add siblings of each ancestor at this rank (depth-1 → parent's children).
        for (const ancestorId of next) {
            for (const siblingId of childrenOf(tree, ancestorId)) {
                // siblings of an ancestor = children of that ancestor at rank -(depth-1)
                if (!visible.has(siblingId)) place(siblingId, -(depth - 1));
            }
        }
        frontier = next;
    }

    // Siblings of focus at rank 0 (children of focus's parents).
    const focus = tree.people[focusId];
    if (focus) {
        for (const parentId of [focus.motherId, focus.fatherId]) {
            if (!parentId) continue;
            for (const siblingId of directChildrenOf(tree, parentId)) {
                if (!visible.has(siblingId)) place(siblingId, 0);
            }
        }
    }

    // Descendants down to DESCENDANT_DEPTH.
    let downFrontier: PersonId[] = [focusId];
    for (let depth = 1; depth <= DESCENDANT_DEPTH; depth += 1) {
        const next: PersonId[] = [];
        for (const id of downFrontier) {
            for (const childId of directChildrenOf(tree, id)) {
                if (!visible.has(childId)) {
                    place(childId, depth);
                    next.push(childId);
                }
            }
        }
        downFrontier = next;
    }

    return { visible, rank };
}

/**
 * Children of `parentId` in the visible-subset sense — anyone whose
 * motherId or fatherId points back to this person. Used both for sibling
 * inclusion (via a parent of the focus) and for the descendant walk.
 */
function directChildrenOf(tree: Tree, parentId: PersonId): readonly PersonId[] {
    const out: PersonId[] = [];
    for (const person of Object.values(tree.people)) {
        if (person.motherId === parentId || person.fatherId === parentId) {
            out.push(person.id);
        }
    }
    return out;
}

/**
 * Siblings of `personId` = other children of the same parents. Returns
 * `personId`'s siblings without including the person itself.
 */
function childrenOf(tree: Tree, personId: PersonId): readonly PersonId[] {
    const person = tree.people[personId];
    if (!person) return [];
    const seen = new Set<PersonId>();
    for (const parentId of [person.motherId, person.fatherId]) {
        if (!parentId) continue;
        for (const id of directChildrenOf(tree, parentId)) {
            if (id !== personId) seen.add(id);
        }
    }
    return Array.from(seen);
}
