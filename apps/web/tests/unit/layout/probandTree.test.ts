/*
 * FamilyTreeEditor - tests for probandTree (BFS + offline LCA).
 *
 * Extracted from passes/route.ts in Phase 5.0 so both the layered engine
 * and the hyperbolic engine share one implementation. Behaviour-equivalent
 * to the original inline version; these tests pin the bidirectional BFS
 * semantics and the climb-and-co-walk LCA.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent } from "$lib/domain/tree";
import type { Person, Tree } from "$lib/domain/types";
import { buildLcaIndex, lca } from "$lib/layout/probandTree";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function ok<V>(r: { ok: true; value: V } | { ok: false; error: string }): V {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

/**
 * P (proband)
 *  ├── L
 *  └── R
 *  Both L and R share P as LCA; depth 1 each.
 */
function tinyTree(): { tree: Tree; ids: { p: string; l: string; r: string } } {
    let t = createTree("lca", blank("P", "m"));
    const lP = addPerson(t, blank("L", "u"));
    t = lP.tree;
    const rP = addPerson(t, blank("R", "u"));
    t = rP.tree;
    t = ok(linkParent(t, lP.id, ROOT_ID));
    t = ok(linkParent(t, rP.id, ROOT_ID));
    return { tree: t, ids: { p: ROOT_ID, l: lP.id, r: rP.id } };
}

describe("buildLcaIndex", () => {
    it("returns empty maps for an unknown root", () => {
        const { tree } = tinyTree();
        const idx = buildLcaIndex(tree, "NOPE");
        expect(idx.depth.size).toBe(0);
        expect(idx.parent.size).toBe(0);
    });

    it("BFS depth: root 0, kids 1", () => {
        const { tree, ids } = tinyTree();
        const idx = buildLcaIndex(tree, ids.p);
        expect(idx.depth.get(ids.p)).toBe(0);
        expect(idx.depth.get(ids.l)).toBe(1);
        expect(idx.depth.get(ids.r)).toBe(1);
        expect(idx.parent.get(ids.l)).toBe(ids.p);
        expect(idx.parent.get(ids.r)).toBe(ids.p);
        expect(idx.parent.get(ids.p)).toBeUndefined();
    });

    it("traverses parent links too — BFS from a child sees the parent", () => {
        const { tree, ids } = tinyTree();
        const idx = buildLcaIndex(tree, ids.l);
        expect(idx.depth.get(ids.l)).toBe(0);
        expect(idx.depth.get(ids.p)).toBe(1);
        // R is reachable via L → P → R, depth 2.
        expect(idx.depth.get(ids.r)).toBe(2);
    });
});

describe("lca", () => {
    it("siblings share the parent as LCA", () => {
        const { tree, ids } = tinyTree();
        const idx = buildLcaIndex(tree, ids.p);
        expect(lca(idx, ids.l, ids.r)).toBe(ids.p);
    });

    it("self-LCA is the node itself", () => {
        const { tree, ids } = tinyTree();
        const idx = buildLcaIndex(tree, ids.p);
        expect(lca(idx, ids.l, ids.l)).toBe(ids.l);
    });

    it("returns undefined when one node is unreachable from the root", () => {
        const { tree, ids } = tinyTree();
        const idx = buildLcaIndex(tree, ids.p);
        expect(lca(idx, ids.l, "NOPE")).toBeUndefined();
    });
});
