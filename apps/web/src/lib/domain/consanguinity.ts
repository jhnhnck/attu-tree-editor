/*
 * FamilyTreeEditor - consanguinity / duplicate-ancestor surfacing
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * Phase 6b: real implementation of Wright's-formula coefficient of
 * inbreeding (COI) + duplicate-ancestor detection. Replaces the
 * Phase 0 stub. Walks `Person.parentIds[]` from each parent of the
 * proband; intersects per-parent ancestor sets; for every common
 * ancestor sums `(1/2)^(d1+d2+1)` Wright contributions per pair of
 * parents (matches the canonical first-cousin = 1/16 table value).
 *
 * Inbreeding of common ancestors themselves is approximated as zero
 * (a v2 extension would recurse here). Only shortest path-pairs are
 * counted — multi-path inflation lands in a follow-up.
 *
 * Memoised on the `Tree` object via a WeakMap keyed by `tree.editRev`;
 * layout-worker re-renders during pan / zoom don't re-walk the
 * ancestor graph.
 */

import { getParents } from "$lib/domain/tree";
import type { PersonId, Tree } from "$lib/domain/types";

export interface AncestorOverlap {
    /** Person ids that appear in more than one ancestor path. */
    readonly duplicates: readonly PersonId[];
    /**
     * Coefficient of inbreeding (Wright's formula), 0..1, or `undefined`
     * if the proband has no detected consanguinity / fewer than two
     * parents.
     */
    readonly coi: number | undefined;
}

const EMPTY: AncestorOverlap = { duplicates: [], coi: undefined };

interface MemoEntry {
    readonly editRev: number;
    readonly cache: Map<PersonId, AncestorOverlap>;
}

const memo = new WeakMap<Tree, MemoEntry>();

/**
 * Compute COI + duplicate ancestors for `personId`. Memoised on the
 * tree object; the cache invalidates when `tree.editRev` advances.
 * Returns `EMPTY` when the person has zero or one parent or no
 * common ancestors across parents.
 */
export function computeAncestorOverlap(tree: Tree, personId: PersonId): AncestorOverlap {
    let entry = memo.get(tree);
    if (!entry || entry.editRev !== tree.editRev) {
        entry = { editRev: tree.editRev, cache: new Map() };
        memo.set(tree, entry);
    }
    const hit = entry.cache.get(personId);
    if (hit) return hit;
    const computed = computeOverlapImpl(tree, personId);
    entry.cache.set(personId, computed);
    return computed;
}

function computeOverlapImpl(tree: Tree, personId: PersonId): AncestorOverlap {
    const proband = tree.people[personId];
    if (!proband) return EMPTY;
    const parents = getParents(proband);
    if (parents.length < 2) return EMPTY;

    // For each parent, BFS ancestors and record shortest distance.
    // Include the parent itself at distance 0 so parent/ancestor
    // overlaps (e.g. incest by one degree closer than cousin
    // marriages) get counted.
    const parentIds = parents.map((p) => p.personId);
    const perParent: Map<PersonId, number>[] = [];
    for (const pid of parentIds) {
        const dists = ancestorDistances(tree, pid);
        dists.set(pid, 0);
        perParent.push(dists);
    }

    // Bucket ancestors by id with which parents reach them and at
    // what shortest distance.
    const distsByAncestor = new Map<PersonId, (number | undefined)[]>();
    for (let i = 0; i < perParent.length; i += 1) {
        const map = perParent[i]!;
        for (const [ancId, d] of map) {
            let slots = distsByAncestor.get(ancId);
            if (!slots) {
                slots = new Array<number | undefined>(perParent.length);
                distsByAncestor.set(ancId, slots);
            }
            slots[i] = d;
        }
    }

    const duplicates: PersonId[] = [];
    let coi = 0;
    for (const [ancId, slots] of distsByAncestor) {
        if (ancId === personId) continue;
        // count parents that reach this ancestor
        let count = 0;
        for (const d of slots) if (d !== undefined) count += 1;
        if (count < 2) continue;
        duplicates.push(ancId);
        // Wright contribution per parent pair: (1/2)^(d_i + d_j + 1).
        for (let i = 0; i < slots.length; i += 1) {
            const di = slots[i];
            if (di === undefined) continue;
            for (let j = i + 1; j < slots.length; j += 1) {
                const dj = slots[j];
                if (dj === undefined) continue;
                coi += Math.pow(0.5, di + dj + 1);
            }
        }
    }

    duplicates.sort();
    if (duplicates.length === 0) return EMPTY;
    return { duplicates, coi };
}

/**
 * BFS over `getParents` to enumerate every ancestor of `rootId` and
 * the shortest distance (in edges) from `rootId` to each. Excludes
 * `rootId` itself. Visited-set breaks ancestral cycles (valid
 * in-universe via time travel — see schema rule #4).
 */
function ancestorDistances(tree: Tree, rootId: PersonId): Map<PersonId, number> {
    const out = new Map<PersonId, number>();
    const visited = new Set<PersonId>([rootId]);
    let frontier: PersonId[] = [rootId];
    let depth = 0;
    while (frontier.length > 0) {
        const next: PersonId[] = [];
        depth += 1;
        for (const id of frontier) {
            const p = tree.people[id];
            if (!p) continue;
            for (const ref of getParents(p)) {
                if (visited.has(ref.personId)) continue;
                visited.add(ref.personId);
                out.set(ref.personId, depth);
                next.push(ref.personId);
            }
        }
        frontier = next;
        // Safety cap on absurdly deep DAGs — keeps the worker pass bounded.
        if (depth > 64) break;
    }
    return out;
}
