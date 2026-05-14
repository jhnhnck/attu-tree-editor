/*
 * FamilyTreeEditor - subgraph extraction over the family graph.
 *
 * Phase 1 spike support. The DEMO fixture is 1,802 people / ~3,500
 * connectors, but the project never actually routes that many at once
 * in production: hyperbolic mode applies focus+context, DOI clustering
 * (Phase 6) collapses low-DOI subtrees, and zoomed-in views naturally
 * show a neighbourhood. A representative libavoid workload is therefore
 * "the proband + the people within N hops" — small enough to be
 * realistic, big enough to characterise scaling.
 *
 * Hops walk parent ↔ child ↔ spouse edges; the resulting Tree is a
 * proper subset of the input with parent links to people outside the
 * subtree pruned, spouseIds filtered, and couples filtered to those
 * with both members inside.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Person, PersonId, Tree } from "$lib/domain/types";
import { getParents } from "$lib/domain/tree";

/**
 * Extract the N-hop neighbourhood around `proband` over the family
 * graph. Returns a fresh `Tree` whose `people` is the visited subset,
 * `couples` is the subset of couples with both members visited, and
 * `rootId` is the proband. Cross-edges to people outside the subtree
 * are pruned (parentIds filtered; spouseIds filtered).
 */
export function nHopSubtree(tree: Tree, proband: PersonId, hops: number): Tree {
    if (!tree.people[proband]) {
        throw new Error(`proband ${proband} not present in tree`);
    }

    // Build a children-by-parent index once so the BFS doesn't iterate
    // every person on every frontier expansion.
    const childrenOf = new Map<PersonId, PersonId[]>();
    for (const id of Object.keys(tree.people)) {
        const p = tree.people[id];
        if (!p) continue;
        for (const ref of getParents(p)) {
            const arr = childrenOf.get(ref.personId);
            if (arr) arr.push(id);
            else childrenOf.set(ref.personId, [id]);
        }
    }

    const visited = new Set<PersonId>([proband]);
    let frontier: PersonId[] = [proband];
    for (let h = 0; h < hops; h++) {
        const next: PersonId[] = [];
        for (const id of frontier) {
            const p = tree.people[id];
            if (!p) continue;
            // Parents
            for (const ref of getParents(p)) {
                if (!visited.has(ref.personId)) {
                    visited.add(ref.personId);
                    next.push(ref.personId);
                }
            }
            // Children
            for (const childId of childrenOf.get(id) ?? []) {
                if (!visited.has(childId)) {
                    visited.add(childId);
                    next.push(childId);
                }
            }
            // Spouses
            for (const spouseId of p.spouseIds ?? []) {
                if (!visited.has(spouseId)) {
                    visited.add(spouseId);
                    next.push(spouseId);
                }
            }
        }
        frontier = next;
        if (frontier.length === 0) break;
    }

    const subPeople: Record<PersonId, Person> = {};
    for (const id of visited) {
        const p = tree.people[id];
        if (!p) continue;
        const sub: Person = {
            ...p,
            spouseIds: (p.spouseIds ?? []).filter((s) => visited.has(s)),
        };
        if (sub.parentIds) {
            const filtered = sub.parentIds.filter((r) => visited.has(r.personId));
            if (filtered.length === 0) delete sub.parentIds;
            else sub.parentIds = filtered;
        }
        subPeople[id] = sub;
    }
    const subCouples = tree.couples.filter((c) => visited.has(c.leftId) && visited.has(c.rightId));
    return {
        ...tree,
        people: subPeople,
        couples: subCouples,
        rootId: proband,
    };
}
