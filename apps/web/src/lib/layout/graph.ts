/*
 * FamilyTreeEditor - shared graph helpers over a domain Tree.
 * Adjacency, related-sets, and BFS path-finding live here so the layout
 * engine, focus mode, and pathfinding UI can share one O(P) preprocess.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";

/**
 * Direction of a single hop in a path. `parent` means we walked from a
 * person to one of their parents; `child` means to one of their children;
 * `spouse` means a marriage edge.
 */
export type EdgeKind = "parent" | "child" | "spouse";

export interface PathStep {
    /** the person we leave */
    readonly from: PersonId;
    /** the person we arrive at */
    readonly to: PersonId;
    /** the relationship of `to` to `from` */
    readonly via: EdgeKind;
}

export interface Path {
    /** ordered list of person ids, length = steps.length + 1 */
    readonly ids: readonly PersonId[];
    readonly steps: readonly PathStep[];
}

export interface Adjacency {
    /** for each person, their parent ids (0–2 entries; orphan refs filtered) */
    readonly parentsOf: ReadonlyMap<PersonId, readonly PersonId[]>;
    /** for each person, their child ids (derived from parent links) */
    readonly childrenOf: ReadonlyMap<PersonId, readonly PersonId[]>;
    /** for each person, their spouse ids (mirrored, deduped) */
    readonly spousesOf: ReadonlyMap<PersonId, readonly PersonId[]>;
}

/**
 * Build the parent/child/spouse adjacency tables in a single pass.
 * References to ids not present in `tree.people` are silently dropped — orphan
 * findings come from `domain/validate.ts`, this function is layout-grade.
 */
export function buildAdjacency(tree: Tree): Adjacency {
    const ids = new Set<PersonId>(Object.keys(tree.people));

    const parentsOf = new Map<PersonId, PersonId[]>();
    const childrenOf = new Map<PersonId, PersonId[]>();
    const spousesOf = new Map<PersonId, PersonId[]>();

    function pushUnique(map: Map<PersonId, PersonId[]>, key: PersonId, value: PersonId): void {
        const list = map.get(key);
        if (!list) {
            map.set(key, [value]);
            return;
        }
        if (!list.includes(value)) list.push(value);
    }

    for (const id of ids) {
        // ensure every known id has at least an empty entry so callers can
        // iterate without a `?? []` at every site
        if (!parentsOf.has(id)) parentsOf.set(id, []);
        if (!childrenOf.has(id)) childrenOf.set(id, []);
        if (!spousesOf.has(id)) spousesOf.set(id, []);
    }

    for (const person of Object.values(tree.people)) {
        if (person.motherId && ids.has(person.motherId)) {
            pushUnique(parentsOf, person.id, person.motherId);
            pushUnique(childrenOf, person.motherId, person.id);
        }
        if (person.fatherId && ids.has(person.fatherId)) {
            pushUnique(parentsOf, person.id, person.fatherId);
            pushUnique(childrenOf, person.fatherId, person.id);
        }
        for (const sid of person.spouseIds) {
            if (sid === person.id) continue;
            if (!ids.has(sid)) continue;
            pushUnique(spousesOf, person.id, sid);
            pushUnique(spousesOf, sid, person.id);
        }
    }

    return { parentsOf, childrenOf, spousesOf };
}

export interface RelativesOptions {
    /** include ancestors (mother / father transitively); default true */
    includeAncestors?: boolean;
    /** include descendants (children transitively); default true */
    includeDescendants?: boolean;
    /** include spouses of the focus and of every included relative; default true */
    includeSpouses?: boolean;
    /** include full siblings + half-siblings of the focus; default true */
    includeSiblings?: boolean;
    /** include siblings' descendants (nieces / nephews); default false */
    includeNibblings?: boolean;
    /** include parents' siblings (aunts / uncles); default false */
    includeAuncles?: boolean;
    /** cap on ancestor walk depth (Infinity by default) */
    maxAncestorGen?: number;
    /** cap on descendant walk depth (Infinity by default) */
    maxDescendantGen?: number;
}

/**
 * Set of person ids "related to" `focusId` under the configured rule.
 * Defaults to ancestors ∪ descendants ∪ spouses ∪ siblings ∪ {focus}.
 *
 * Used by the focus-mode "hide unrelated" toggle and (transitively) by the
 * path-trace UI to highlight which subtree a path traverses.
 */
export function relativesOf(
    tree: Tree,
    focusId: PersonId,
    opts: RelativesOptions = {},
    adj?: Adjacency,
): Set<PersonId> {
    const out = new Set<PersonId>();
    if (!tree.people[focusId]) return out;
    const a = adj ?? buildAdjacency(tree);

    const includeAncestors = opts.includeAncestors ?? true;
    const includeDescendants = opts.includeDescendants ?? true;
    const includeSpouses = opts.includeSpouses ?? true;
    const includeSiblings = opts.includeSiblings ?? true;
    const includeNibblings = opts.includeNibblings ?? false;
    const includeAuncles = opts.includeAuncles ?? false;
    const maxAncestorGen = opts.maxAncestorGen ?? Number.POSITIVE_INFINITY;
    const maxDescendantGen = opts.maxDescendantGen ?? Number.POSITIVE_INFINITY;

    out.add(focusId);

    // ancestors
    if (includeAncestors) {
        const queue: { id: PersonId; gen: number }[] = [{ id: focusId, gen: 0 }];
        while (queue.length > 0) {
            const next = queue.shift();
            if (!next) break;
            if (next.gen >= maxAncestorGen) continue;
            for (const pid of a.parentsOf.get(next.id) ?? []) {
                if (out.has(pid)) continue;
                out.add(pid);
                queue.push({ id: pid, gen: next.gen + 1 });
            }
        }
    }

    // descendants (BFS down)
    if (includeDescendants) {
        const queue: { id: PersonId; gen: number }[] = [{ id: focusId, gen: 0 }];
        while (queue.length > 0) {
            const next = queue.shift();
            if (!next) break;
            if (next.gen >= maxDescendantGen) continue;
            for (const cid of a.childrenOf.get(next.id) ?? []) {
                if (out.has(cid)) continue;
                out.add(cid);
                queue.push({ id: cid, gen: next.gen + 1 });
            }
        }
    }

    // siblings (people sharing at least one parent with focus)
    if (includeSiblings) {
        for (const pid of a.parentsOf.get(focusId) ?? []) {
            for (const sib of a.childrenOf.get(pid) ?? []) {
                if (sib !== focusId) out.add(sib);
            }
        }
    }

    // aunts/uncles: siblings of each parent
    if (includeAuncles) {
        for (const pid of a.parentsOf.get(focusId) ?? []) {
            for (const gpid of a.parentsOf.get(pid) ?? []) {
                for (const auncle of a.childrenOf.get(gpid) ?? []) {
                    if (auncle !== pid) out.add(auncle);
                }
            }
        }
    }

    // nieces/nephews: children of the focus's siblings
    if (includeNibblings) {
        const sibs: PersonId[] = [];
        for (const pid of a.parentsOf.get(focusId) ?? []) {
            for (const sib of a.childrenOf.get(pid) ?? []) {
                if (sib !== focusId) sibs.push(sib);
            }
        }
        const queue: { id: PersonId; gen: number }[] = sibs.map((id) => ({ id, gen: 0 }));
        for (const sid of sibs) out.add(sid);
        while (queue.length > 0) {
            const next = queue.shift();
            if (!next) break;
            if (next.gen >= maxDescendantGen) continue;
            for (const cid of a.childrenOf.get(next.id) ?? []) {
                if (out.has(cid)) continue;
                out.add(cid);
                queue.push({ id: cid, gen: next.gen + 1 });
            }
        }
    }

    // spouses of every included relative (incl. focus)
    if (includeSpouses) {
        const snapshot = [...out];
        for (const id of snapshot) {
            for (const sid of a.spousesOf.get(id) ?? []) out.add(sid);
        }
    }

    return out;
}

/**
 * BFS over the undirected (parent ↔ child) and (spouse) edges. Returns the
 * shortest path or `undefined` if the two people are in different connected
 * components. Edge weights are uniform; ties broken by insertion order so
 * the result is deterministic for a given input.
 */
export function shortestPath(
    tree: Tree,
    fromId: PersonId,
    toId: PersonId,
    adj?: Adjacency,
): Path | undefined {
    if (fromId === toId) {
        return { ids: [fromId], steps: [] };
    }
    if (!tree.people[fromId] || !tree.people[toId]) return undefined;

    const a = adj ?? buildAdjacency(tree);

    /** previous-step record per visited id, used to reconstruct the path */
    const prev = new Map<PersonId, { from: PersonId; via: EdgeKind }>();
    const seen = new Set<PersonId>([fromId]);
    const queue: PersonId[] = [fromId];

    while (queue.length > 0) {
        const cur = queue.shift();
        if (!cur) break;
        if (cur === toId) break;

        const next: { id: PersonId; via: EdgeKind }[] = [];
        for (const pid of a.parentsOf.get(cur) ?? []) next.push({ id: pid, via: "parent" });
        for (const cid of a.childrenOf.get(cur) ?? []) next.push({ id: cid, via: "child" });
        for (const sid of a.spousesOf.get(cur) ?? []) next.push({ id: sid, via: "spouse" });

        for (const n of next) {
            if (seen.has(n.id)) continue;
            seen.add(n.id);
            prev.set(n.id, { from: cur, via: n.via });
            if (n.id === toId) {
                queue.length = 0;
                queue.push(toId);
                break;
            }
            queue.push(n.id);
        }
    }

    if (!seen.has(toId)) return undefined;

    // walk back from toId to fromId, then reverse
    const reversedSteps: PathStep[] = [];
    let cursor: PersonId = toId;
    while (cursor !== fromId) {
        const p = prev.get(cursor);
        if (!p) return undefined; // shouldn't happen if seen.has(toId)
        reversedSteps.push({ from: p.from, to: cursor, via: p.via });
        cursor = p.from;
    }
    const steps = reversedSteps.reverse();
    const ids = [fromId, ...steps.map((s) => s.to)];
    return { ids, steps };
}

/**
 * BFS over (parent ↔ child ↔ spouse) edges to find every connected component.
 * Returns components as arrays of ids; each id appears in exactly one. Useful
 * when the layout needs to render disjoint families separately.
 */
export function connectedComponents(tree: Tree, adj?: Adjacency): PersonId[][] {
    const a = adj ?? buildAdjacency(tree);
    const seen = new Set<PersonId>();
    const out: PersonId[][] = [];
    for (const id of Object.keys(tree.people)) {
        if (seen.has(id)) continue;
        const comp: PersonId[] = [];
        const queue: PersonId[] = [id];
        while (queue.length > 0) {
            const cur = queue.shift();
            if (cur === undefined || seen.has(cur)) continue;
            seen.add(cur);
            comp.push(cur);
            for (const pid of a.parentsOf.get(cur) ?? []) if (!seen.has(pid)) queue.push(pid);
            for (const cid of a.childrenOf.get(cur) ?? []) if (!seen.has(cid)) queue.push(cid);
            for (const sid of a.spousesOf.get(cur) ?? []) if (!seen.has(sid)) queue.push(sid);
        }
        out.push(comp);
    }
    return out;
}
