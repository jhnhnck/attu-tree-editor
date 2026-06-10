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

/**
 * Phase 4 of family-view-debug: per-pair Wright contribution row. The
 * walker already computes these inline; widening the return type just
 * surfaces what was being discarded. `di` / `dj` are the per-parent
 * shortest-distance edges to `ancestorId`; `contribution` is
 * `(0.5)^(di+dj+1)`. Summed across rows == the scalar `coi` to within
 * float-precision drift.
 */
export interface CoiBreakdownRow {
    readonly ancestorId: PersonId;
    readonly di: number;
    readonly dj: number;
    readonly contribution: number;
}

export interface AncestorOverlap {
    /** Person ids that appear in more than one ancestor path. */
    readonly duplicates: readonly PersonId[];
    /**
     * Coefficient of inbreeding (Wright's formula), 0..1, or `undefined`
     * if the proband has no detected consanguinity / fewer than two
     * parents.
     */
    readonly coi: number | undefined;
    /**
     * Phase 4 family-view-debug: optional per-pair contribution table.
     * Same numeric content the inner loop produces; expose for the
     * `showCoiBreakdown` overlay + the `__treeDebug.coi.breakdown`
     * handle. Undefined when there's no consanguinity (parents share no
     * ancestors). Row order is stable: ascending `ancestorId`, then
     * `(di, dj)` lexicographically.
     */
    readonly breakdown?: readonly CoiBreakdownRow[];
}

const EMPTY: AncestorOverlap = { duplicates: [], coi: undefined };

interface MemoEntry {
    readonly editRev: number;
    readonly cache: Map<PersonId, AncestorOverlap>;
}

const memo = new WeakMap<Tree, MemoEntry>();

// Phase 4 of family-view-debug: tiny instrumentation surface for the
// `__treeDebug.coi` handle. Module-level counters keep the hot path
// branch-free — the memo lookup itself increments either counter. The
// values are only read by the debug overlay; production reads round-
// trip through the normal `computeAncestorOverlap` API and ignore
// these.
let _cacheHits = 0;
let _cacheMisses = 0;
export function getCoiCacheStats(): { readonly cacheHits: number; readonly cacheMisses: number } {
    return { cacheHits: _cacheHits, cacheMisses: _cacheMisses };
}

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
    if (hit) {
        _cacheHits += 1;
        return hit;
    }
    _cacheMisses += 1;
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
    const breakdown: CoiBreakdownRow[] = [];
    let coi = 0;
    for (const [ancId, slots] of distsByAncestor) {
        if (ancId === personId) continue;
        // count parents that reach this ancestor
        let count = 0;
        for (const d of slots) if (d !== undefined) count += 1;
        if (count < 2) continue;
        duplicates.push(ancId);
        // Wright contribution per parent pair: (1/2)^(d_i + d_j + 1).
        // Phase 4 family-view-debug: record each row alongside the
        // scalar accumulation so the debug overlay can show the table
        // without re-walking the ancestor graph.
        for (let i = 0; i < slots.length; i += 1) {
            const di = slots[i];
            if (di === undefined) continue;
            for (let j = i + 1; j < slots.length; j += 1) {
                const dj = slots[j];
                if (dj === undefined) continue;
                const contribution = Math.pow(0.5, di + dj + 1);
                coi += contribution;
                breakdown.push({ ancestorId: ancId, di, dj, contribution });
            }
        }
    }

    duplicates.sort();
    if (duplicates.length === 0) return EMPTY;
    // stable row order: ancestor id asc, then (di, dj) lex
    breakdown.sort((a, b) => {
        if (a.ancestorId !== b.ancestorId) return a.ancestorId < b.ancestorId ? -1 : 1;
        if (a.di !== b.di) return a.di - b.di;
        return a.dj - b.dj;
    });
    return { duplicates, coi, breakdown };
}

/**
 * Threshold below which the production COI badge is suppressed on a
 * card. Tuned for "noteworthy on a normal pedigree" — 0.01 sits roughly
 * at the third-cousin level (1/64 = 0.0156) and above; closer
 * relationships (first cousins = 0.0625, half-sib parents = 0.125,
 * parent/offspring = 0.25) all light up, while ancient-ancestor noise
 * stays hidden.
 */
export const COI_DISPLAY_THRESHOLD = 0.01;

/**
 * Format a coefficient of inbreeding as a 4-decimal raw value with the
 * leading zero stripped — ".0417" rather than "0.0417" or "4.17%". Used
 * by the card-attached COI badge and the stats popover. Returns "" for
 * undefined / non-positive inputs so the chip can be omitted entirely.
 *
 * Values below 0.00005 (which would round to ".0000" at 4 decimals)
 * render as "<.0001" so the "this person is technically related"
 * signal isn't lost to rounding.
 */
export function formatCoi(coi: number | undefined): string {
    if (coi === undefined || coi <= 0) return "";
    // anything that would round to .0000 at 4 decimals — keep a visible
    // marker rather than collapsing to nothing
    if (coi < 0.00005) return "<.0001";
    // strip the leading "0" so "0.0417" reads as ".0417"
    const s = coi.toFixed(4);
    return s.startsWith("0") ? s.slice(1) : s;
}

/**
 * Format a coefficient of inbreeding as a percentage string for the
 * card chip / inspector overlay. Tuned to preserve canonical Wright
 * values that users recognise from textbooks:
 *
 *   - parent/offspring or full-sibling incest: 1/4 -> "25%"
 *   - half-sibling parents:                    1/8 -> "12.5%"
 *   - first cousins:                          1/16 -> "6.25%"
 *   - second cousins:                         1/32 -> "3.125%" (rendered "3.13%")
 *   - third cousins:                          1/64 -> "1.5625%" (rendered "1.56%")
 *
 * The old formatter used `Math.round` in the >=10% branch, so 12.5%
 * displayed as "13%" - the user-visible "rounding error" reported in
 * the bug log. Sub-1% values previously truncated to "0.00%" when
 * pct < 0.005; we now switch to `toPrecision(1)` so tiny but nonzero
 * COIs don't look like zero.
 *
 * Returns "" for undefined / non-positive inputs so the chip can be
 * omitted entirely.
 */
export function formatCoiPercent(coi: number | undefined): string {
    if (coi === undefined || coi <= 0) return "";
    const pct = coi * 100;
    // tiny nonzero - render as "<0.01%" rather than scientific notation; preserves the
    // "this person is technically related" signal without the ugly "5e-10%" badge
    if (pct < 0.005) return "<0.01%";
    // sub-10% range - 2 fractional digits preserves 1/16 = 6.25%, 1/32 = 3.13%, 1/128 = 0.78%
    if (pct < 10) return `${pct.toFixed(2)}%`;
    // >= 10% - 1 fractional digit preserves canonical 1/8 = 12.5%;
    // trim trailing ".0" so 25.0% renders as 25%
    const s = pct.toFixed(1);
    return s.endsWith(".0") ? `${s.slice(0, -2)}%` : `${s}%`;
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
