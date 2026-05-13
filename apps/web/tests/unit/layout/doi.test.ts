/*
 * FamilyTreeEditor - tests for the DOI scoring + cluster aggregation.
 *
 * Covers:
 *   - aPriori bonuses (portrait, named, branch point) and anchor pinning
 *   - BFS distance metric (consanguinity + spouse edges)
 *   - Maximal-contiguous-subtree cluster aggregation, with high-DOI
 *     descendants blocking ancestor collapse and anchors blocking
 *     everywhere
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse, updatePerson } from "$lib/domain/tree";
import type { Person, Tree } from "$lib/domain/types";
import {
    aggregateClusters,
    computeDoi,
    computeDoiScores,
    DEFAULT_DOI_WEIGHTS,
} from "$lib/layout/doi";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function ok<V>(r: { ok: true; value: V } | { ok: false; error: string }): V {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

/**
 *  P (proband)
 *  ├── A (named)
 *  │   └── A1 (no name)
 *  │       └── A2 (no name)
 *  └── B (named)
 */
function buildFamily(): {
    tree: Tree;
    ids: { p: string; a: string; a1: string; a2: string; b: string };
} {
    let t = createTree("doi-test", { ...blank("P", "m") });
    const a = addPerson(t, { ...blank("A", "m") });
    t = a.tree;
    const a1 = addPerson(t, { given: "", surname: "", gender: "u", spouseIds: [], display: "z1" });
    t = a1.tree;
    const a2 = addPerson(t, { given: "", surname: "", gender: "u", spouseIds: [], display: "z1" });
    t = a2.tree;
    const b = addPerson(t, { ...blank("B", "f") });
    t = b.tree;
    t = ok(linkParent(t, a.id, ROOT_ID));
    t = ok(linkParent(t, b.id, ROOT_ID));
    t = ok(linkParent(t, a1.id, a.id));
    t = ok(linkParent(t, a2.id, a1.id));
    return { tree: t, ids: { p: ROOT_ID, a: a.id, a1: a1.id, a2: a2.id, b: b.id } };
}

describe("computeDoiScores — aPriori bonuses", () => {
    it("anchored persons get +Infinity", () => {
        const { tree, ids } = buildFamily();
        const scores = computeDoiScores({
            tree,
            focus: ids.p,
            anchors: new Set([ids.a2]),
        });
        expect(scores.get(ids.a2)?.score).toBe(Number.POSITIVE_INFINITY);
        expect(scores.get(ids.a2)?.anchored).toBe(true);
        // Non-anchored persons still get a finite score.
        expect(scores.get(ids.b)?.score).toBeLessThan(Number.POSITIVE_INFINITY);
    });

    it("named persons get the +named bonus", () => {
        const { tree, ids } = buildFamily();
        const scores = computeDoiScores({ tree, focus: ids.p });
        // A is named; A1 is not.
        expect(scores.get(ids.a)?.aPriori).toBeGreaterThanOrEqual(DEFAULT_DOI_WEIGHTS.named);
        expect(scores.get(ids.a1)?.aPriori).toBe(0);
    });

    it("branch points get the +branchPoint bonus", () => {
        const { tree, ids } = buildFamily();
        // P has 2 children — at branchPointChildren=2 (strict >) this is NOT a branch point.
        let scores = computeDoiScores({ tree, focus: ids.p });
        expect(scores.get(ids.p)?.aPriori).toBe(DEFAULT_DOI_WEIGHTS.named);

        // Now add a third child to P — branch point.
        let t = tree;
        const c = addPerson(t, { ...blank("C", "u") });
        t = c.tree;
        t = ok(linkParent(t, c.id, ROOT_ID));
        scores = computeDoiScores({ tree: t, focus: ids.p });
        expect(scores.get(ids.p)?.aPriori).toBe(
            DEFAULT_DOI_WEIGHTS.named + DEFAULT_DOI_WEIGHTS.branchPoint,
        );
    });

    it("portrait bonus stacks with named", () => {
        const { tree, ids } = buildFamily();
        const withPortrait = updatePerson(tree, ids.a, { portraitBlobId: "blob-1" });
        const scores = computeDoiScores({ tree: withPortrait, focus: ids.p });
        expect(scores.get(ids.a)?.aPriori).toBe(
            DEFAULT_DOI_WEIGHTS.named + DEFAULT_DOI_WEIGHTS.portrait,
        );
    });
});

describe("computeDoiScores — distance metric", () => {
    it("focus has distance 0; children distance 1", () => {
        const { tree, ids } = buildFamily();
        const scores = computeDoiScores({ tree, focus: ids.p });
        expect(scores.get(ids.p)?.distance).toBe(0);
        expect(scores.get(ids.a)?.distance).toBe(1);
        expect(scores.get(ids.a1)?.distance).toBe(2);
        expect(scores.get(ids.a2)?.distance).toBe(3);
        expect(scores.get(ids.b)?.distance).toBe(1);
    });

    it("score = aPriori − distance for non-anchored persons", () => {
        const { tree, ids } = buildFamily();
        const scores = computeDoiScores({ tree, focus: ids.p });
        const a = scores.get(ids.a)!;
        expect(a.score).toBe(a.aPriori - a.distance);
    });

    it("spouse edges count as +1 distance", () => {
        const { tree, ids } = buildFamily();
        const sp = addPerson(tree, { ...blank("Sp", "f") });
        let t = sp.tree;
        t = ok(linkSpouse(t, ids.a, sp.id));
        const scores = computeDoiScores({ tree: t, focus: ids.p });
        // Sp is reached via P → A → Sp = distance 2.
        expect(scores.get(sp.id)?.distance).toBe(2);
    });
});

describe("aggregateClusters", () => {
    it("collapses a contiguous low-DOI subtree into one cluster", () => {
        const { tree, ids } = buildFamily();
        // Mark A1, A2 as below-threshold; A and B stay readable.
        const isCollapsed = (id: string) => id === ids.a1 || id === ids.a2;
        const clusters = aggregateClusters(tree, ids.p, isCollapsed);
        expect(clusters.length).toBe(1);
        expect(clusters[0]?.rep).toBe(ids.a1);
        expect(clusters[0]?.count).toBe(2);
        expect(new Set(clusters[0]?.members)).toEqual(new Set([ids.a1, ids.a2]));
    });

    it("a high-DOI descendant blocks ancestor collapse", () => {
        const { tree, ids } = buildFamily();
        // A is below-threshold but its descendant A2 is high — A must NOT
        // collapse, but A1 can't collapse alone because A2 blocks. So
        // there are no clusters here.
        const isCollapsed = (id: string) => id === ids.a || id === ids.a1;
        const clusters = aggregateClusters(tree, ids.p, isCollapsed);
        expect(clusters.length).toBe(0);
    });

    it("anchors prevent collapse of their subtrees", () => {
        const { tree, ids } = buildFamily();
        const isCollapsed = () => true; // everyone below threshold
        // Without anchors: the whole subtree below P collapses (P stays).
        const noAnchors = aggregateClusters(tree, ids.p, isCollapsed);
        expect(noAnchors.length).toBe(2); // one for A's subtree, one for B
        // With A2 as an anchor: A2 blocks itself, A1, A all the way up.
        // So A1, A2, A stay individually rendered; B still collapses.
        const withAnchor = aggregateClusters(tree, ids.p, isCollapsed, new Set([ids.a2]));
        const reps = withAnchor.map((c) => c.rep);
        expect(reps).toContain(ids.b);
        expect(reps).not.toContain(ids.a);
        expect(reps).not.toContain(ids.a1);
    });

    it("emits singleton clusters for isolated low-DOI leaves", () => {
        const { tree, ids } = buildFamily();
        // Only A2 below threshold.
        const isCollapsed = (id: string) => id === ids.a2;
        const clusters = aggregateClusters(tree, ids.p, isCollapsed);
        expect(clusters.length).toBe(1);
        expect(clusters[0]?.rep).toBe(ids.a2);
        expect(clusters[0]?.count).toBe(1);
    });
});

describe("computeDoi (compound)", () => {
    it("scores + clusters + clusterOf are mutually consistent", () => {
        const { tree, ids } = buildFamily();
        const out = computeDoi({
            tree,
            focus: ids.p,
            isCollapsed: (id) => id === ids.a1 || id === ids.a2,
        });
        expect(out.scores.size).toBeGreaterThan(0);
        expect(out.clusters.length).toBe(1);
        const cid = out.clusters[0]?.id;
        expect(out.clusterOf.get(ids.a1)).toBe(cid);
        expect(out.clusterOf.get(ids.a2)).toBe(cid);
        expect(out.clusterOf.has(ids.a)).toBe(false);
    });
});
