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

/**
 * Per-person rejection reason — closed set. Surfaced by phase 1 of the
 * family-view-debug plan so the off-subset diagnostics overlay can explain
 * every invisible person rather than just listing ids. Each value is the
 * *primary* reason the walker stopped; a person may be reachable via more
 * than one path (e.g. they're both a great-great-grandparent and a non-
 * primary partner of a visible cousin) but the first reason a path
 * concludes with is what gets recorded.
 *
 *   - `rank-cutoff` — reached during the ancestor / descendant walk past
 *     `ANCESTOR_DEPTH` or `DESCENDANT_DEPTH`. The person *would* be visible
 *     if the bounded depth were larger.
 *   - `non-primary-partner` — co-partner of a visible person via a 2-
 *     partner couple that isn't the primary union (and not in
 *     `expandedSecondaryUnions`). Toggleable via the `˅` picker.
 *   - `secondary-union-not-expanded` — reachable only through a secondary
 *     union (the person is the *other partner* or a *child* of that union),
 *     and the union isn't in `expandedSecondaryUnions`.
 *   - `auto-collapsed` — present in the bounded subset but the layout pass
 *     replaced their sibling block with a badge. Populated by
 *     `layout.ts:recomputeAfterCollapse`, not by `selectBoundedSubset` itself;
 *     subset.ts only stamps reasons it can determine without layout context.
 *   - `unreachable` — no connectivity path from the focus through parents /
 *     children / partner edges (orphan in the tree, or in a different
 *     connected component). Distinct from `rank-cutoff` so the off-subset
 *     overlay can call out genuinely disconnected people.
 */
export type RejectionReason =
    | "rank-cutoff"
    | "non-primary-partner"
    | "secondary-union-not-expanded"
    | "auto-collapsed"
    | "unreachable";

export interface RankedSubset {
    /** Visible person ids. */
    readonly visible: ReadonlySet<PersonId>;
    /** Rank: 0 = focus, negative = ancestors, positive = descendants. */
    readonly rank: ReadonlyMap<PersonId, number>;
    /** Persons whose `+` button has un-revealed children to show. */
    readonly hasMoreChildren: ReadonlySet<PersonId>;
    /** Persons at the topmost ancestor rank who still have un-shown parents. */
    readonly hasMoreParents: ReadonlySet<PersonId>;
    /**
     * Phase 1 (family-view-debug plan): per-person rejection reason for
     * every person in `tree.people` that is NOT in `visible`. Keys never
     * overlap with `visible`; together they cover the full `tree.people`
     * keyset. The map is empty when every person in the tree is visible
     * (small fixtures, deep zoom).
     *
     * Read-only consumers (the debug overlay) iterate this map; the
     * production render path ignores it entirely, so its O(N) construction
     * cost is paid even when the overlay is off — but `selectBoundedSubset`
     * already walks every person at least once for sibling resolution, so
     * the extra pass is bounded by tree size, not the visible subset.
     */
    readonly rationale: ReadonlyMap<PersonId, RejectionReason>;
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
    /**
     * Wave-2 phase 4: per-person expanded-secondary-union set. Maps
     * personId → set of `coupleIndex` (position in `tree.couples`).
     * For each entry in the set, the OTHER partner of that 2-partner
     * union and all of its children get pulled into the bounded subset
     * alongside the primary union's render. Empty by default. Cap of
     * one expanded secondary per person is enforced upstream by
     * `secondaryUnion.ts`'s `expand()`; subset honours whatever is in
     * the map (a corrupt localStorage row with multiple entries would
     * pull in multiple secondary partners, which is degraded but not
     * unsafe).
     */
    readonly expandedSecondaryUnions?: ReadonlyMap<PersonId, ReadonlySet<number>>;
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
    const secondaryExpanded =
        opts.expandedSecondaryUnions ?? new Map<PersonId, ReadonlySet<number>>();
    const visible = new Set<PersonId>();
    const rank = new Map<PersonId, number>();
    if (!tree.people[focusId]) {
        // No focus → no walk → every person in the tree is unreachable.
        const allUnreachable = new Map<PersonId, RejectionReason>();
        for (const id of Object.keys(tree.people)) {
            allUnreachable.set(id, "unreachable");
        }
        return {
            visible,
            rank,
            hasMoreChildren: new Set(),
            hasMoreParents: new Set(),
            rationale: allUnreachable,
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
    // Wave-2 phase 4: expanded-secondary unions for the focus. Each
    // entry in `secondaryExpanded.get(focusId)` adds the OTHER partner
    // of that 2-partner couple at rank 0 + its children at rank 1.
    // The rest of the layout pipeline (`planRank` + `emitAnchorsAndEdges`)
    // requires no changes — both partners visible at the same rank
    // already trigger a UnionAnchor + couple-bus + sibling-bus drop in
    // `emitAnchorsAndEdges`'s `for (let ci = 0; ci < tree.couples.length; ci += 1)`
    // loop, so the second union renders automatically as a fan
    // beside the primary.
    placeSecondaryUnions(tree, focusId, 0, secondaryExpanded, visible, place);

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
    const rationale = classifyRejections(tree, visible, overrides, secondaryExpanded);

    return { visible, rank, hasMoreChildren, hasMoreParents, rationale };
}

/**
 * Phase 1 (family-view-debug): walk every person not in `visible` and
 * stamp the primary reason they didn't make it into the bounded subset.
 * Priority order: non-primary-partner > secondary-union-not-expanded >
 * rank-cutoff > unreachable. The first three are "reachable in principle —
 * a different toggle / depth would surface this person"; `unreachable`
 * names a person in a different connected component (or an isolate).
 *
 * Cost: O(P + C) where P = `tree.people` size and C = `tree.couples` size,
 * plus one pre-scan to invert couple endpoints → coupleIndex sets. The
 * caller already pays O(P) walking sibling cohorts, so this stays within
 * the same big-O class.
 */
function classifyRejections(
    tree: Tree,
    visible: ReadonlySet<PersonId>,
    overrides: ReadonlyMap<PersonId, number>,
    secondaryExpanded: ReadonlyMap<PersonId, ReadonlySet<number>>,
): ReadonlyMap<PersonId, RejectionReason> {
    const out = new Map<PersonId, RejectionReason>();

    // pre-index per-person couple memberships so the partner / secondary
    // checks below are O(1) per person rather than O(C) per person.
    const couplesByPerson = new Map<PersonId, number[]>();
    for (let ci = 0; ci < tree.couples.length; ci += 1) {
        const c = tree.couples[ci]!;
        for (const pid of [c.leftId, c.rightId]) {
            const bucket = couplesByPerson.get(pid);
            if (bucket) bucket.push(ci);
            else couplesByPerson.set(pid, [ci]);
        }
    }

    for (const id of Object.keys(tree.people)) {
        if (visible.has(id)) continue;

        // priority 1: non-primary partner of a visible person via a 2-couple.
        let reason: RejectionReason | undefined;
        for (const ci of couplesByPerson.get(id) ?? []) {
            const couple = tree.couples[ci]!;
            const mateId = couple.leftId === id ? couple.rightId : couple.leftId;
            if (!visible.has(mateId)) continue;
            // mate is visible, this person isn't → either non-primary or secondary-not-expanded.
            const matePrimary = overrides.get(mateId);
            const expandedForMate = secondaryExpanded.get(mateId);
            // if the mate has this couple as their explicitly-set primary, this person
            // *should* have been pulled in via primaryPartnerOf; treat as rank-cutoff
            // because the only remaining explanation is the walk didn't reach this branch.
            if (matePrimary !== undefined && matePrimary === ci) continue;
            if (expandedForMate && expandedForMate.has(ci)) continue;
            reason = "non-primary-partner";
            break;
        }

        // priority 2: child of a not-expanded secondary union of a visible parent.
        if (!reason) {
            for (const ci of couplesByPerson.get(id) ?? []) {
                // couplesByPerson keys on partners, not children; check the
                // children separately below.
                void ci;
            }
            for (let ci = 0; ci < tree.couples.length; ci += 1) {
                const c = tree.couples[ci]!;
                if (!c.childIds.includes(id)) continue;
                const leftVisible = visible.has(c.leftId);
                const rightVisible = visible.has(c.rightId);
                if (!leftVisible && !rightVisible) continue;
                // a parent of this child is visible, but the child isn't.
                // skip if this couple is the visible parent's primary union
                // (then the child should have been pulled in — fall through
                // to rank-cutoff). otherwise this is a secondary union the
                // user hasn't expanded.
                const visibleParent = leftVisible ? c.leftId : c.rightId;
                const visibleParentPrimary = overrides.get(visibleParent);
                if (visibleParentPrimary === ci) continue;
                const expandedForVisible = secondaryExpanded.get(visibleParent);
                if (expandedForVisible && expandedForVisible.has(ci)) continue;
                reason = "secondary-union-not-expanded";
                break;
            }
        }

        // priority 3: reachable via any edge from a visible person (parent,
        // child, or any-couple partner) but past the bounded depth.
        if (!reason) {
            const p = tree.people[id];
            if (p) {
                // parent of a visible person?
                for (const visibleId of visible) {
                    const v = tree.people[visibleId];
                    if (!v) continue;
                    if (getParents(v).some((r) => r.personId === id)) {
                        reason = "rank-cutoff";
                        break;
                    }
                }
                if (!reason) {
                    // child of a visible person?
                    if (getParents(p).some((r) => visible.has(r.personId))) {
                        reason = "rank-cutoff";
                    }
                }
                if (!reason) {
                    // any-couple partner of a visible person? (already screened
                    // above for non-primary; if we got here it's because the
                    // couple's primary chain was visible but the walk capped).
                    for (const ci of couplesByPerson.get(id) ?? []) {
                        const couple = tree.couples[ci]!;
                        const mateId = couple.leftId === id ? couple.rightId : couple.leftId;
                        if (visible.has(mateId)) {
                            reason = "rank-cutoff";
                            break;
                        }
                    }
                }
            }
        }

        out.set(id, reason ?? "unreachable");
    }
    return out;
}

/**
 * Wave-2 phase 4 helper. For each expanded-secondary couple index in
 * `secondaryExpanded.get(personId)`, place the other partner at
 * `personRank` and every child at `personRank + 1`. Idempotent via
 * `visible.has` checks inside `place`. No-op when the person has no
 * entry in the map.
 */
function placeSecondaryUnions(
    tree: Tree,
    personId: PersonId,
    personRank: number,
    secondaryExpanded: ReadonlyMap<PersonId, ReadonlySet<number>>,
    visible: ReadonlySet<PersonId>,
    place: (id: PersonId, r: number) => void,
): void {
    const expandedSet = secondaryExpanded.get(personId);
    if (!expandedSet || expandedSet.size === 0) return;
    for (const coupleIdx of expandedSet) {
        const couple = tree.couples[coupleIdx];
        if (!couple) continue;
        if (couple.leftId !== personId && couple.rightId !== personId) continue;
        const partnerId = couple.leftId === personId ? couple.rightId : couple.leftId;
        if (partnerId !== undefined && !visible.has(partnerId)) {
            place(partnerId, personRank);
        }
        for (const childId of couple.childIds) {
            if (!visible.has(childId)) place(childId, personRank + 1);
        }
    }
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
