/*
 * FamilyTreeEditor - proband-rooted spanning tree + offline LCA.
 *
 * Both the layered engine (Phase 4.4 HEB) and the hyperbolic engine
 * (Phase 5 Lamping-Rao + DOI) need a BFS spanning tree rooted at the
 * proband over the family's consanguinity edges. Putting it here means
 * one implementation, one O(N) preprocess per layout call, one cache for
 * pairwise LCA queries.
 *
 * Bidirectional edges by design: ancestors (parent links) and descendants
 * (child links) both count, so the tree captures "every person in the
 * proband's blood-tree component". Spouse edges are intentionally excluded
 * — the LCA we want is the consanguinity ancestor, not "first connected
 * person".
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";

export interface LcaIndex {
    readonly depth: ReadonlyMap<PersonId, number>;
    readonly parent: ReadonlyMap<PersonId, PersonId | undefined>;
}

/**
 * BFS the family graph from `rootId` through bidirectional consanguinity
 * edges (mother/father ↔ child). Returns depth + bfsParent per node so
 * `lca(a, b)` can climb-equalise-depth then co-climb.
 *
 * Empty maps if `rootId` isn't in the tree.
 */
export function buildLcaIndex(tree: Tree, rootId: PersonId): LcaIndex {
    const depth = new Map<PersonId, number>();
    const parent = new Map<PersonId, PersonId | undefined>();
    if (!tree.people[rootId]) return { depth, parent };
    depth.set(rootId, 0);
    parent.set(rootId, undefined);

    const childrenOf = new Map<PersonId, PersonId[]>();
    for (const p of Object.values(tree.people)) {
        for (const parentId of [p.motherId, p.fatherId]) {
            if (!parentId) continue;
            const arr = childrenOf.get(parentId);
            if (arr) arr.push(p.id);
            else childrenOf.set(parentId, [p.id]);
        }
    }
    const queue: PersonId[] = [rootId];
    while (queue.length) {
        const id = queue.shift();
        if (id === undefined) continue;
        const d = depth.get(id) ?? 0;
        const person = tree.people[id];
        if (!person) continue;
        const neighbours: PersonId[] = [];
        if (person.motherId) neighbours.push(person.motherId);
        if (person.fatherId) neighbours.push(person.fatherId);
        const kids = childrenOf.get(id);
        if (kids) neighbours.push(...kids);
        for (const n of neighbours) {
            if (depth.has(n)) continue;
            depth.set(n, d + 1);
            parent.set(n, id);
            queue.push(n);
        }
    }
    return { depth, parent };
}

/**
 * Lowest common ancestor of `a` and `b` in the proband-rooted BFS tree.
 * Returns `undefined` if either node is unreachable from the root.
 *
 * O(depth) per call — fine for the few-dozen long-bond queries on Akarians;
 * if a future caller fires thousands, swap for Tarjan's offline LCA.
 */
export function lca(idx: LcaIndex, a: PersonId, b: PersonId): PersonId | undefined {
    let da = idx.depth.get(a);
    let db = idx.depth.get(b);
    if (da === undefined || db === undefined) return undefined;
    let ca: PersonId | undefined = a;
    let cb: PersonId | undefined = b;
    while (da > db) {
        ca = idx.parent.get(ca);
        if (!ca) return undefined;
        da -= 1;
    }
    while (db > da) {
        cb = idx.parent.get(cb);
        if (!cb) return undefined;
        db -= 1;
    }
    while (ca && cb && ca !== cb) {
        ca = idx.parent.get(ca);
        cb = idx.parent.get(cb);
    }
    return ca && cb && ca === cb ? ca : undefined;
}
