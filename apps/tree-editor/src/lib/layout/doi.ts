/*
 * FamilyTreeEditor - Degree-of-Interest (DOI) scoring + cluster aggregation.
 *
 * Implements the Furnas DOI framework (Generalized Fisheye Views, CHI 1986)
 * specialised to the proband-rooted spanning out-tree:
 *
 *   DOI(p, focus) = aPriori(p) − distance(p, focus)
 *
 * `aPriori` is intrinsic to the person (portrait, named, branch point,
 * pinned). `distance` is graph distance over consanguinity + spouse
 * edges. Anchors (the selected person + pinned set) clamp to +∞ so they
 * never collapse.
 *
 * Phase 5.5 emitted one dot glyph per below-threshold card; Phase 6
 * promotes to *maximal contiguous low-DOI subtrees*. The aggregator
 * walks the proband-rooted BFS tree top-down: a node whose entire subtree
 * (including itself) is below threshold and contains no anchors collapses
 * to one `ClusterGlyph` with a `+N` count. A high-DOI descendant blocks
 * the collapse — its ancestors stay individually rendered so the
 * descendant remains reachable.
 *
 * Engine-agnostic by design. The renderer supplies which persons fall
 * below the readability threshold (a screen-space concern); this module
 * decides how to aggregate them. Layered and hyperbolic engines can both
 * consume.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";
import { getParents } from "$lib/domain/tree";
import { buildLcaIndex } from "$lib/layout/probandTree";

/** Per-person DOI breakdown. `score = aPriori − distance` unless anchored. */
export interface DoiScore {
    readonly score: number;
    readonly aPriori: number;
    readonly distance: number;
    /** True when this person is a hard anchor (selection, pinned). */
    readonly anchored: boolean;
}

/** A maximal contiguous low-DOI subtree, collapsed to one glyph. */
export interface ClusterGlyph {
    readonly id: string;
    /** Subtree root; the renderer typically positions the glyph here. */
    readonly rep: PersonId;
    /** Every member of the collapsed subtree. */
    readonly members: readonly PersonId[];
    readonly count: number;
}

export interface DoiAnnotation {
    readonly scores: ReadonlyMap<PersonId, DoiScore>;
    readonly clusters: readonly ClusterGlyph[];
    /** personId → cluster.id for every person inside a cluster. */
    readonly clusterOf: ReadonlyMap<PersonId, string>;
}

/** aPriori bonus weights. Tunable; defaults follow the plan's spec. */
export interface DoiWeights {
    readonly portrait: number;
    readonly named: number;
    readonly branchPoint: number;
    /** Strictly-more-than-this number of children counts as a branch point. */
    readonly branchPointChildren: number;
}

export const DEFAULT_DOI_WEIGHTS: DoiWeights = {
    portrait: 0.5,
    named: 0.5,
    branchPoint: 1.0,
    branchPointChildren: 2,
};

export interface DoiOptions {
    readonly tree: Tree;
    readonly focus: PersonId;
    /** Hard anchors — always rendered. Pinned + selected. */
    readonly anchors?: ReadonlySet<PersonId>;
    readonly weights?: DoiWeights;
}

/**
 * Compute DOI scores for every reachable person. Anchored persons score
 * `+Infinity`; unreachable persons (not in the focus's component) are
 * omitted from the result map.
 */
export function computeDoiScores(opts: DoiOptions): ReadonlyMap<PersonId, DoiScore> {
    const { tree, focus } = opts;
    const anchors = opts.anchors ?? new Set<PersonId>();
    const weights = opts.weights ?? DEFAULT_DOI_WEIGHTS;

    const branchPoints = findBranchPoints(tree, weights.branchPointChildren);
    const distances = bfsDistances(tree, focus);

    const out = new Map<PersonId, DoiScore>();
    for (const [id, distance] of distances) {
        const person = tree.people[id];
        if (!person) continue;
        const anchored = anchors.has(id);
        const aPriori = aPrioriFor(person, branchPoints, weights);
        const score = anchored ? Number.POSITIVE_INFINITY : aPriori - distance;
        out.set(id, { score, aPriori, distance, anchored });
    }
    return out;
}

/**
 * Aggregate contiguous low-DOI persons (the ones for which `isCollapsed`
 * returns true) into maximal subtree clusters. Walks the proband-rooted
 * spanning tree top-down: a subtree collapses iff every member is
 * collapsable AND no member is an anchor.
 *
 * `isCollapsed(personId)` is the renderer's screen-space predicate — for
 * the hyperbolic canvas it is "on-screen card size below CLUSTER_THRESHOLD_PX".
 */
export function aggregateClusters(
    tree: Tree,
    focus: PersonId,
    isCollapsed: (id: PersonId) => boolean,
    anchors?: ReadonlySet<PersonId>,
): readonly ClusterGlyph[] {
    // The focus is always treated as an anchor — it is the person the user
    // is looking at and never collapses into a cluster. Caller-supplied
    // anchors add to this set.
    const anchorSet = new Set<PersonId>(anchors ?? []);
    anchorSet.add(focus);
    const childrenOf = childrenOfBfsTree(tree, focus);

    // Post-order: for each person, does its subtree (including self) contain
    // any anchor or any non-collapsable person? If yes, can't collapse.
    const hasBlocker = new Map<PersonId, boolean>();
    const order: PersonId[] = postOrder(focus, childrenOf);
    for (const id of order) {
        let blocked = anchorSet.has(id) || !isCollapsed(id);
        if (!blocked) {
            for (const c of childrenOf.get(id) ?? []) {
                if (hasBlocker.get(c)) {
                    blocked = true;
                    break;
                }
            }
        }
        hasBlocker.set(id, blocked);
    }

    // Top-down: at each node, if the subtree is unblocked AND the parent
    // (or "above the root") was blocked, emit one cluster containing the
    // entire subtree. Otherwise recurse so blocked roots can still host
    // collapsable subtrees below them.
    const clusters: ClusterGlyph[] = [];
    const visit = (id: PersonId, parentBlocked: boolean): void => {
        const blocked = hasBlocker.get(id) ?? true;
        if (!blocked && parentBlocked) {
            const members = collectSubtree(id, childrenOf);
            clusters.push({ id: `cluster:${id}`, rep: id, members, count: members.length });
            return;
        }
        for (const c of childrenOf.get(id) ?? []) {
            visit(c, blocked);
        }
    };
    visit(focus, true);
    return clusters;
}

/**
 * One-shot helper that composes scores + cluster aggregation. Useful when
 * the caller wants a single annotation object.
 */
export function computeDoi(
    opts: DoiOptions & { readonly isCollapsed: (id: PersonId) => boolean },
): DoiAnnotation {
    const scores = computeDoiScores(opts);
    const clusters = aggregateClusters(opts.tree, opts.focus, opts.isCollapsed, opts.anchors);
    const clusterOf = new Map<PersonId, string>();
    for (const c of clusters) for (const m of c.members) clusterOf.set(m, c.id);
    return { scores, clusters, clusterOf };
}

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

function aPrioriFor(
    person: { given: string; surname: string; portraitBlobId?: string; id: PersonId },
    branchPoints: ReadonlySet<PersonId>,
    weights: DoiWeights,
): number {
    let bonus = 0;
    if (person.portraitBlobId) bonus += weights.portrait;
    if (isNamed(person)) bonus += weights.named;
    if (branchPoints.has(person.id)) bonus += weights.branchPoint;
    return bonus;
}

function isNamed(person: { given: string; surname: string }): boolean {
    return person.given.trim().length > 0 || person.surname.trim().length > 0;
}

/** Persons with strictly more than `threshold` children. */
function findBranchPoints(tree: Tree, threshold: number): ReadonlySet<PersonId> {
    const counts = new Map<PersonId, number>();
    for (const p of Object.values(tree.people)) {
        for (const ref of getParents(p)) {
            counts.set(ref.personId, (counts.get(ref.personId) ?? 0) + 1);
        }
    }
    const out = new Set<PersonId>();
    for (const [id, n] of counts) if (n > threshold) out.add(id);
    return out;
}

/**
 * BFS shortest path from `source` to `target` over the consanguinity
 * graph (mother/father ↔ child) plus spouse edges. Used by Phase 3's
 * `usePath` to surface the selected-to-focus path-highlight set.
 *
 * Returns an ordered array from `source` to `target` inclusive, or an
 * empty array when the two are disconnected (or either is missing). A
 * source === target call returns `[source]` so the renderer can still
 * treat the focus as "on path" for selection-on-self.
 *
 * Sibling of `bfsDistances`: the Phase 3 spike chose this layout (one
 * helper per concern) over extending `bfsDistances` with a predecessor
 * map because the two are read by different consumers (DOI scoring
 * vs. selection path) and bundling them would cost more than splitting.
 */
export function bfsPath(tree: Tree, source: PersonId, target: PersonId): readonly PersonId[] {
    if (!tree.people[source] || !tree.people[target]) return [];
    if (source === target) return [source];

    const childrenOf = new Map<PersonId, PersonId[]>();
    for (const p of Object.values(tree.people)) {
        for (const ref of getParents(p)) {
            const arr = childrenOf.get(ref.personId);
            if (arr) arr.push(p.id);
            else childrenOf.set(ref.personId, [p.id]);
        }
    }
    // BFS with predecessors so we can reconstruct one shortest path.
    const pred = new Map<PersonId, PersonId>();
    const visited = new Set<PersonId>([source]);
    const queue: PersonId[] = [source];
    let reached = false;
    while (queue.length) {
        const id = queue.shift();
        if (id === undefined) continue;
        if (id === target) {
            reached = true;
            break;
        }
        const person = tree.people[id];
        if (!person) continue;
        const neighbours: PersonId[] = [];
        for (const ref of getParents(person)) neighbours.push(ref.personId);
        const kids = childrenOf.get(id);
        if (kids) neighbours.push(...kids);
        for (const sId of person.spouseIds) neighbours.push(sId);
        for (const n of neighbours) {
            if (visited.has(n)) continue;
            visited.add(n);
            pred.set(n, id);
            queue.push(n);
        }
    }
    if (!reached) return [];
    // Reconstruct source → target.
    const path: PersonId[] = [target];
    let cur: PersonId | undefined = target;
    while (cur !== undefined && cur !== source) {
        const p = pred.get(cur);
        if (p === undefined) break;
        path.push(p);
        cur = p;
    }
    path.reverse();
    return path;
}

/**
 * BFS distances from `focus` over the consanguinity graph (mother/father
 * ↔ child) plus spouse edges. Spouses get a +1 distance so a direct-line
 * spouse outranks a step-deeper ancestor.
 */
function bfsDistances(tree: Tree, focus: PersonId): ReadonlyMap<PersonId, number> {
    const out = new Map<PersonId, number>();
    if (!tree.people[focus]) return out;
    out.set(focus, 0);

    const childrenOf = new Map<PersonId, PersonId[]>();
    for (const p of Object.values(tree.people)) {
        for (const ref of getParents(p)) {
            const arr = childrenOf.get(ref.personId);
            if (arr) arr.push(p.id);
            else childrenOf.set(ref.personId, [p.id]);
        }
    }
    const queue: PersonId[] = [focus];
    while (queue.length) {
        const id = queue.shift();
        if (id === undefined) continue;
        const d = out.get(id) ?? 0;
        const person = tree.people[id];
        if (!person) continue;
        const neighbours: PersonId[] = [];
        for (const ref of getParents(person)) neighbours.push(ref.personId);
        const kids = childrenOf.get(id);
        if (kids) neighbours.push(...kids);
        for (const sId of person.spouseIds) neighbours.push(sId);
        for (const n of neighbours) {
            if (out.has(n)) continue;
            out.set(n, d + 1);
            queue.push(n);
        }
    }
    return out;
}

/**
 * Build a proper out-tree (parent → children) rooted at `focus` from the
 * BFS spanning tree in [[probandTree]]. Spouses are excluded so the
 * structure stays a tree (no spouse back-cycles).
 */
function childrenOfBfsTree(
    tree: Tree,
    focus: PersonId,
): ReadonlyMap<PersonId, readonly PersonId[]> {
    const idx = buildLcaIndex(tree, focus);
    const out = new Map<PersonId, PersonId[]>();
    for (const [child, parent] of idx.parent) {
        if (parent === undefined) continue;
        const arr = out.get(parent);
        if (arr) arr.push(child);
        else out.set(parent, [child]);
    }
    return out;
}

function postOrder(
    root: PersonId,
    children: ReadonlyMap<PersonId, readonly PersonId[]>,
): PersonId[] {
    // Iterative post-order so deep ancestry chains (Akarians: ~66 gens)
    // don't blow the recursion stack.
    const out: PersonId[] = [];
    const stack: { id: PersonId; visited: boolean }[] = [{ id: root, visited: false }];
    while (stack.length) {
        const frame = stack[stack.length - 1];
        if (!frame) break;
        if (frame.visited) {
            out.push(frame.id);
            stack.pop();
            continue;
        }
        frame.visited = true;
        const kids = children.get(frame.id) ?? [];
        for (let i = kids.length - 1; i >= 0; i -= 1) {
            const k = kids[i];
            if (k !== undefined) stack.push({ id: k, visited: false });
        }
    }
    return out;
}

function collectSubtree(
    root: PersonId,
    children: ReadonlyMap<PersonId, readonly PersonId[]>,
): PersonId[] {
    const out: PersonId[] = [];
    const stack: PersonId[] = [root];
    while (stack.length) {
        const id = stack.pop();
        if (id === undefined) continue;
        out.push(id);
        for (const c of children.get(id) ?? []) stack.push(c);
    }
    return out;
}
