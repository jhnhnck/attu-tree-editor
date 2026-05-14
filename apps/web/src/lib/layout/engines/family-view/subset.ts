/*
 * FamilyTreeEditor - family-view bounded subset selection.
 *
 * Phase 0 set the bounded default: focus + 3 ancestor gens + 2
 * descendant gens + siblings at each ancestor rank. Phase 1 layers
 * an explicit-expansion set on top: each id in `expanded` includes
 * its next-generation relatives (children for descendant-side or
 * sibling-of-ancestor cards; parents for the topmost ancestor rank).
 *
 * Cycle-safe via a `visited` set; the schema is permissive (rule #6)
 * and self-parent / ancestral-cycle shapes are legal.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";

/** How many generations up from focus the default subset includes. */
export const ANCESTOR_DEPTH = 3;
/** How many generations down from focus the default subset includes. */
export const DESCENDANT_DEPTH = 2;

export interface RankedSubset {
    /** Visible person ids. */
    readonly visible: ReadonlySet<PersonId>;
    /** Rank: 0 = focus, negative = ancestors, positive = descendants. */
    readonly rank: ReadonlyMap<PersonId, number>;
    /** Persons whose `+` button has un-revealed children to show. */
    readonly hasMoreChildren: ReadonlySet<PersonId>;
    /** Persons at the topmost ancestor rank who still have un-shown parents. */
    readonly hasMoreParents: ReadonlySet<PersonId>;
}

export interface SubsetOptions {
    /**
     * Explicit-expansion set: ids whose adjacent generation should be
     * included beyond the default bounded subset. Empty by default.
     */
    readonly expanded?: ReadonlySet<PersonId>;
}

/**
 * Walk the focus's ancestors / descendants / siblings per the bounded
 * default, then expand any ids in `opts.expanded`.
 */
export function selectBoundedSubset(
    tree: Tree,
    focusId: PersonId,
    opts: SubsetOptions = {},
): RankedSubset {
    const expanded = opts.expanded ?? new Set<PersonId>();
    const visible = new Set<PersonId>();
    const rank = new Map<PersonId, number>();
    if (!tree.people[focusId]) {
        return {
            visible,
            rank,
            hasMoreChildren: new Set(),
            hasMoreParents: new Set(),
        };
    }

    const place = (id: PersonId, r: number): void => {
        if (!tree.people[id]) return;
        if (visible.has(id)) return;
        visible.add(id);
        rank.set(id, r);
    };

    place(focusId, 0);

    // Ancestor spine.
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
        // Siblings at this ancestor rank: other children of each ancestor.
        for (const ancestorId of next) {
            for (const siblingId of directChildrenOf(tree, ancestorId)) {
                if (!visible.has(siblingId)) place(siblingId, -(depth - 1));
            }
        }
        frontier = next;
    }

    // Siblings of focus at rank 0.
    const focus = tree.people[focusId];
    if (focus) {
        for (const parentId of [focus.motherId, focus.fatherId]) {
            if (!parentId) continue;
            for (const siblingId of directChildrenOf(tree, parentId)) {
                if (!visible.has(siblingId)) place(siblingId, 0);
            }
        }
    }

    // Descendants down to the default depth.
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

    // Phase 1 expansion: walk every id in `expanded` and pull in the
    // appropriate adjacent generation.
    //
    // Heuristic per id (single + per card):
    //   - If id has un-shown children → show its children at id.rank + 1.
    //   - Else if id is at the topmost (most negative) rank with un-shown
    //     parents → show its parents at id.rank - 1.
    //
    // Repeat over the expanded set until quiescent so a deep chain of
    // explicit expands all materialise in one pass.
    let changed = true;
    let iter = 0;
    const MAX_ITER = 32; // generous safety cap
    while (changed && iter < MAX_ITER) {
        changed = false;
        iter += 1;
        const minRank = minOf(rank);
        for (const id of expanded) {
            if (!visible.has(id)) continue;
            const r = rank.get(id);
            if (r === undefined) continue;
            const hadChildren = revealChildren(tree, id, r, visible, rank, place);
            if (hadChildren) {
                changed = true;
                continue;
            }
            if (r === minRank) {
                const hadParents = revealParents(tree, id, r, visible, rank, place);
                if (hadParents) changed = true;
            }
        }
    }

    const hasMoreChildren = collectHasMoreChildren(tree, visible);
    const hasMoreParents = collectHasMoreParents(tree, visible, rank);

    return { visible, rank, hasMoreChildren, hasMoreParents };
}

function revealChildren(
    tree: Tree,
    id: PersonId,
    parentRank: number,
    visible: Set<PersonId>,
    _rank: Map<PersonId, number>,
    place: (id: PersonId, r: number) => void,
): boolean {
    // Returns true iff we placed at least one new child. If every child
    // is already visible (nothing new to reveal), return false so the
    // caller can try the "reveal parents" branch instead.
    let placedAny = false;
    for (const childId of directChildrenOf(tree, id)) {
        if (!visible.has(childId)) {
            place(childId, parentRank + 1);
            placedAny = true;
        }
    }
    return placedAny;
}

function revealParents(
    tree: Tree,
    id: PersonId,
    childRank: number,
    visible: Set<PersonId>,
    rank: Map<PersonId, number>,
    place: (id: PersonId, r: number) => void,
): boolean {
    const p = tree.people[id];
    if (!p) return false;
    let any = false;
    for (const parentId of [p.motherId, p.fatherId]) {
        if (!parentId) continue;
        if (!visible.has(parentId)) {
            place(parentId, childRank - 1);
            any = true;
        } else if ((rank.get(parentId) ?? 0) !== childRank - 1) {
            // Conflict — keep silent
        } else {
            any = true;
        }
    }
    return any;
}

function directChildrenOf(tree: Tree, parentId: PersonId): readonly PersonId[] {
    const out: PersonId[] = [];
    for (const person of Object.values(tree.people)) {
        if (person.motherId === parentId || person.fatherId === parentId) {
            out.push(person.id);
        }
    }
    return out;
}

function minOf(rank: ReadonlyMap<PersonId, number>): number {
    let m = 0;
    let seen = false;
    for (const r of rank.values()) {
        if (!seen || r < m) {
            m = r;
            seen = true;
        }
    }
    return m;
}

/** Visible persons who have at least one child that isn't visible. */
function collectHasMoreChildren(tree: Tree, visible: ReadonlySet<PersonId>): ReadonlySet<PersonId> {
    const out = new Set<PersonId>();
    for (const id of visible) {
        for (const child of directChildrenOf(tree, id)) {
            if (!visible.has(child)) {
                out.add(id);
                break;
            }
        }
    }
    return out;
}

/** Visible persons at the topmost rank with at least one un-shown parent. */
function collectHasMoreParents(
    tree: Tree,
    visible: ReadonlySet<PersonId>,
    rank: ReadonlyMap<PersonId, number>,
): ReadonlySet<PersonId> {
    if (visible.size === 0) return new Set();
    const minR = minOf(rank);
    const out = new Set<PersonId>();
    for (const id of visible) {
        if (rank.get(id) !== minR) continue;
        const p = tree.people[id];
        if (!p) continue;
        if (p.motherId && !visible.has(p.motherId)) {
            out.add(id);
            continue;
        }
        if (p.fatherId && !visible.has(p.fatherId)) {
            out.add(id);
            continue;
        }
    }
    return out;
}
