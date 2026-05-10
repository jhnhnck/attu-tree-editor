/*
 * FamilyTreeEditor - Phase 2 spike: Lamping-Rao recursive layout with
 * hourglass mode for pedigree DAGs.
 *
 * Lamping & Rao's 1996 hyperbolic browser algorithm laid out an
 * arbitrary tree by allocating angular wedges to each subtree
 * proportional to its log cardinality and walking a constant
 * hyperbolic distance per generation. The textbook algorithm is
 * unidirectional — a node has one parent and N children.
 *
 * Pedigree DAGs are NOT unidirectional: each person has up to 2 parents
 * AND multiple children. Hourglass mode resolves this by splitting the
 * disk into two half-planes — ancestors (parent-chain from proband)
 * occupy the upper half, descendants (child-chain from proband) occupy
 * the lower half, and both share the proband at z=0. Each half-plane
 * runs Lamping-Rao independently as a unidirectional tree.
 *
 * Aunts / uncles / cousins / spouses-of-ancestors are NOT placed by
 * this spike. Phase 5 decides whether to weave them into either half-
 * plane or to render them in a "neutral zone" at the equator.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";
import { type Complex, ZERO, abs, placeChild } from "$lib/layout/spikes/hyperbolic";

export interface HourglassOptions {
    /**
     * Hyperbolic distance walked from a node to each of its children
     * (constant per generation). Default 0.7 keeps gen-10 around
     * |z| ≈ 0.999 with linear scaling; the spike measures the actual
     * cutoff and reports.
     */
    readonly stepDistance?: number;
    /**
     * If true, scales the step distance as `step * log(1 + gen) /
     * log(2)`, which keeps deeper generations distinguishable. Default
     * false; spike runs both to compare.
     */
    readonly logDistance?: boolean;
}

export interface HourglassLayout {
    readonly positions: ReadonlyMap<PersonId, Complex>;
    /** Map from each placed person id to its generation depth (0 = proband). */
    readonly generations: ReadonlyMap<PersonId, number>;
    /** People on the ancestor side (excluding proband). */
    readonly ancestors: ReadonlySet<PersonId>;
    /** People on the descendant side (excluding proband). */
    readonly descendants: ReadonlySet<PersonId>;
    /** Whether any node was clipped at |z| = RHO_MAX during layout. */
    readonly hitBoundary: boolean;
}

/** Children-of-node lookup over the family graph. */
function buildChildrenMap(tree: Tree): Map<PersonId, PersonId[]> {
    const out = new Map<PersonId, PersonId[]>();
    for (const id of Object.keys(tree.people)) {
        const p = tree.people[id];
        if (!p) continue;
        if (p.motherId) {
            const arr = out.get(p.motherId);
            if (arr) arr.push(id);
            else out.set(p.motherId, [id]);
        }
        if (p.fatherId) {
            const arr = out.get(p.fatherId);
            if (arr) arr.push(id);
            else out.set(p.fatherId, [id]);
        }
    }
    return out;
}

/**
 * BFS ancestor walk from proband (parents only). Returns a children
 * map of the resulting tree (proband → parents → grandparents …).
 * Cycles (would mean inbreeding loop) are silently broken via the
 * visited set.
 */
function buildAncestorSubtree(tree: Tree, proband: PersonId): Map<PersonId, PersonId[]> {
    const subtree = new Map<PersonId, PersonId[]>();
    const visited = new Set<PersonId>([proband]);
    let frontier: PersonId[] = [proband];
    while (frontier.length > 0) {
        const next: PersonId[] = [];
        for (const id of frontier) {
            const p = tree.people[id];
            if (!p) continue;
            const parents: PersonId[] = [];
            if (p.motherId && !visited.has(p.motherId) && tree.people[p.motherId]) {
                visited.add(p.motherId);
                parents.push(p.motherId);
                next.push(p.motherId);
            }
            if (p.fatherId && !visited.has(p.fatherId) && tree.people[p.fatherId]) {
                visited.add(p.fatherId);
                parents.push(p.fatherId);
                next.push(p.fatherId);
            }
            if (parents.length > 0) subtree.set(id, parents);
        }
        frontier = next;
    }
    return subtree;
}

/**
 * BFS descendant walk from proband. Returns a children map of the
 * resulting tree (proband → children → grandchildren …).
 */
function buildDescendantSubtree(
    tree: Tree,
    proband: PersonId,
    childrenOf: Map<PersonId, PersonId[]>,
): Map<PersonId, PersonId[]> {
    const subtree = new Map<PersonId, PersonId[]>();
    const visited = new Set<PersonId>([proband]);
    let frontier: PersonId[] = [proband];
    while (frontier.length > 0) {
        const next: PersonId[] = [];
        for (const id of frontier) {
            const children = (childrenOf.get(id) ?? []).filter(
                (c) => !visited.has(c) && tree.people[c],
            );
            if (children.length === 0) continue;
            for (const c of children) {
                visited.add(c);
                next.push(c);
            }
            subtree.set(id, children);
        }
        frontier = next;
    }
    return subtree;
}

/** Compute subtree sizes (including the node itself) for every node. */
function subtreeSizes(subtree: Map<PersonId, PersonId[]>): Map<PersonId, number> {
    const sizes = new Map<PersonId, number>();
    function size(id: PersonId): number {
        const cached = sizes.get(id);
        if (cached !== undefined) return cached;
        let total = 1;
        for (const c of subtree.get(id) ?? []) total += size(c);
        sizes.set(id, total);
        return total;
    }
    for (const id of subtree.keys()) size(id);
    // Also size leaves not in the subtree map.
    for (const children of subtree.values()) {
        for (const c of children) size(c);
    }
    return sizes;
}

/**
 * Lay out one unidirectional subtree starting at `rootZ` with outward
 * angle `outwardDir` and the angular wedge `[outwardDir - wedge/2,
 * outwardDir + wedge/2]`. Mutates `positions` and `generations` in
 * place. Returns whether the layout hit the disk boundary clamp.
 */
function layoutSubtree(
    subtree: Map<PersonId, PersonId[]>,
    rootId: PersonId,
    rootZ: Complex,
    outwardDir: number,
    wedge: number,
    rootGen: number,
    sizes: Map<PersonId, number>,
    options: Required<HourglassOptions>,
    positions: Map<PersonId, Complex>,
    generations: Map<PersonId, number>,
    boundary: { hit: boolean },
): void {
    const children = subtree.get(rootId);
    if (!children || children.length === 0) return;

    const weights = children.map((c) => Math.log(1 + (sizes.get(c) ?? 1)));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) return;

    const childGen = rootGen + 1;
    const step = options.logDistance
        ? options.stepDistance * (Math.log(1 + childGen) / Math.LN2)
        : options.stepDistance;

    let leftEdge = outwardDir - wedge / 2;
    for (let i = 0; i < children.length; i++) {
        const childId = children[i]!;
        const childWedge = (wedge * weights[i]!) / totalWeight;
        const childCenter = leftEdge + childWedge / 2;
        const childZ = placeChild(rootZ, step, childCenter);
        positions.set(childId, childZ);
        generations.set(childId, childGen);
        if (abs(childZ) >= 1 - 1e-8) boundary.hit = true;
        layoutSubtree(
            subtree,
            childId,
            childZ,
            childCenter,
            childWedge,
            childGen,
            sizes,
            options,
            positions,
            generations,
            boundary,
        );
        leftEdge += childWedge;
    }
}

export function layoutHourglass(
    tree: Tree,
    proband: PersonId,
    options: HourglassOptions = {},
): HourglassLayout {
    const opts: Required<HourglassOptions> = {
        stepDistance: options.stepDistance ?? 0.7,
        logDistance: options.logDistance ?? false,
    };

    const childrenOf = buildChildrenMap(tree);
    const ancestorSubtree = buildAncestorSubtree(tree, proband);
    const descendantSubtree = buildDescendantSubtree(tree, proband, childrenOf);

    const ancestorSizes = subtreeSizes(ancestorSubtree);
    const descendantSizes = subtreeSizes(descendantSubtree);

    const positions = new Map<PersonId, Complex>();
    const generations = new Map<PersonId, number>();
    positions.set(proband, ZERO);
    generations.set(proband, 0);

    const boundary = { hit: false };

    // Upper half-disk (math angle +y up) for ancestors; outward = π/2.
    layoutSubtree(
        ancestorSubtree,
        proband,
        ZERO,
        Math.PI / 2,
        Math.PI,
        0,
        ancestorSizes,
        opts,
        positions,
        generations,
        boundary,
    );

    // Lower half-disk for descendants; outward = -π/2.
    layoutSubtree(
        descendantSubtree,
        proband,
        ZERO,
        -Math.PI / 2,
        Math.PI,
        0,
        descendantSizes,
        opts,
        positions,
        generations,
        boundary,
    );

    const ancestors = new Set<PersonId>();
    for (const id of positions.keys()) {
        if (id !== proband && ancestorSubtreeContains(ancestorSubtree, proband, id)) {
            ancestors.add(id);
        }
    }
    const descendants = new Set<PersonId>();
    for (const id of positions.keys()) {
        if (id !== proband && !ancestors.has(id)) descendants.add(id);
    }

    return {
        positions,
        generations,
        ancestors,
        descendants,
        hitBoundary: boundary.hit,
    };
}

function ancestorSubtreeContains(
    subtree: Map<PersonId, PersonId[]>,
    root: PersonId,
    target: PersonId,
): boolean {
    // BFS from root through subtree edges.
    const visited = new Set<PersonId>([root]);
    let frontier: PersonId[] = [root];
    while (frontier.length > 0) {
        const next: PersonId[] = [];
        for (const id of frontier) {
            if (id === target) return true;
            for (const c of subtree.get(id) ?? []) {
                if (!visited.has(c)) {
                    visited.add(c);
                    next.push(c);
                }
            }
        }
        frontier = next;
    }
    return false;
}
