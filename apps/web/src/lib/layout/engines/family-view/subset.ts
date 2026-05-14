/*
 * FamilyTreeEditor - family-view bounded subset selection.
 *
 * Phase 0 set the bounded default: focus + 3 ancestor gens + 2
 * descendant gens + siblings at each ancestor rank. Phase 1 layered
 * an explicit-expansion set on top. Phase 2 narrows descendant /
 * partner inclusion to the **primary union** of each visible person:
 *
 *   - Each visible person's primary partner is placed at the same rank;
 *     non-primary partners stay hidden unless added to `expanded`.
 *   - Descendant walks follow `primaryChildrenOf` (= primary union's
 *     children + single-parent children), so Johnakar Oken with 6
 *     wives does not blow up the bounded subset.
 *   - Siblings of focus and of ancestors are still placed by
 *     `directChildrenOf` because they are siblings of the *parent*,
 *     not descendants through a union — half-siblings stay visible.
 *
 * Cycle-safe via a `visited` set; the schema is permissive (rule #6)
 * and self-parent / ancestral-cycle shapes are legal.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";
import { getParents } from "$lib/domain/tree";
import {
    partnersInMultiUnionsOf,
    primaryChildrenOf,
    primaryPartnerOf,
} from "$lib/layout/engines/family-view/couples";

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
    /**
     * Per-person primary-union override (per focus). Maps personId →
     * coupleIndex (position in `tree.couples`). Persons not in the map
     * fall back to `defaultPrimaryUnion` (CoupleRecord.isPrimary, else
     * lowest unionIndex). Empty by default.
     */
    readonly primaryUnionOverrides?: ReadonlyMap<PersonId, number>;
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
    const overrides = opts.primaryUnionOverrides ?? new Map<PersonId, number>();
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
    // Focus's primary partner at rank 0.
    const focusPartner = primaryPartnerOf(tree, focusId, overrides);
    if (focusPartner) place(focusPartner, 0);
    // N>2-partner unions: every partner across every closed polycule
    // the focus is in goes on rank 0. (2-partner unions stay covered
    // by primaryPartnerOf so non-primary mates stay hidden by default.)
    for (const pid of partnersInMultiUnionsOf(tree, focusId)) {
        if (!visible.has(pid)) place(pid, 0);
    }

    // Ancestor spine. Each ancestor's primary partner is placed alongside.
    let frontier: PersonId[] = [focusId];
    for (let depth = 1; depth <= ANCESTOR_DEPTH; depth += 1) {
        const next: PersonId[] = [];
        for (const id of frontier) {
            const p = tree.people[id];
            if (!p) continue;
            for (const ref of getParents(p)) {
                if (!visible.has(ref.personId)) {
                    place(ref.personId, -depth);
                    next.push(ref.personId);
                }
            }
        }
        // Primary partner of each ancestor (= the other parent of the line of focus
        // if the conventional union is primary, otherwise a step-parent).
        for (const ancestorId of next) {
            const partner = primaryPartnerOf(tree, ancestorId, overrides);
            if (partner && !visible.has(partner)) place(partner, -depth);
        }
        // Siblings at this ancestor rank: other children of each ancestor's primary
        // union (so step-half-siblings via non-primary unions stay hidden by default).
        for (const ancestorId of next) {
            for (const siblingId of primaryChildrenOf(tree, ancestorId, overrides)) {
                if (!visible.has(siblingId)) place(siblingId, -(depth - 1));
            }
        }
        frontier = next;
    }

    // Siblings of focus at rank 0. Walk full directChildrenOf each parent so
    // half-siblings (children of mom or dad via other unions) stay visible —
    // they're focus's siblings by blood, regardless of which union produced them.
    const focus = tree.people[focusId];
    if (focus) {
        for (const ref of getParents(focus)) {
            for (const siblingId of directChildrenOf(tree, ref.personId)) {
                if (!visible.has(siblingId)) place(siblingId, 0);
            }
        }
    }

    // Descendants down to the default depth, scoped to the primary-union
    // children of each person we walk.
    let downFrontier: PersonId[] = [focusId];
    for (let depth = 1; depth <= DESCENDANT_DEPTH; depth += 1) {
        const next: PersonId[] = [];
        for (const id of downFrontier) {
            for (const childId of primaryChildrenOf(tree, id, overrides)) {
                if (!visible.has(childId)) {
                    place(childId, depth);
                    next.push(childId);
                }
            }
        }
        // Primary partner of each newly placed descendant at the same rank.
        for (const childId of next) {
            const partner = primaryPartnerOf(tree, childId, overrides);
            if (partner && !visible.has(partner)) place(partner, depth);
        }
        downFrontier = next;
    }

    // Phase 1 expansion: walk every id in `expanded` and pull in the
    // appropriate adjacent generation. Phase 2 broadens to:
    //   - reveal *all* of id's children (across every union), not just
    //     the primary-union subset, so the user can explore alternate
    //     unions via `+`,
    //   - and pull in every visible-but-not-yet-placed partner.
    //
    // Heuristic per id (single + per card):
    //   - If id has un-shown children → show every direct child at
    //     id.rank + 1 plus the corresponding other-parent partner.
    //   - Else if id is at the topmost (most negative) rank with un-
    //     shown parents → show its parents at id.rank - 1.
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
    //
    // Phase 2 also pulls in the other-parent partner for each newly
    // revealed child — the user expanded an `+` button hoping to see
    // both the child and the union it came from, including the partner
    // who isn't this person's primary.
    let placedAny = false;
    const placedChildren: PersonId[] = [];
    for (const childId of directChildrenOf(tree, id)) {
        if (!visible.has(childId)) {
            place(childId, parentRank + 1);
            placedChildren.push(childId);
            placedAny = true;
        }
    }
    for (const childId of placedChildren) {
        const child = tree.people[childId];
        if (!child) continue;
        for (const ref of getParents(child)) {
            const other = ref.personId;
            if (other === id) continue;
            if (!visible.has(other)) place(other, parentRank);
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
    for (const ref of getParents(p)) {
        const parentId = ref.personId;
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
        if (getParents(person).some((r) => r.personId === parentId)) {
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
        for (const ref of getParents(p)) {
            if (!visible.has(ref.personId)) {
                out.add(id);
                break;
            }
        }
    }
    return out;
}
