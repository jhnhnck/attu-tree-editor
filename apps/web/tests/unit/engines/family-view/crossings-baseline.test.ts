/*
 * FamilyTreeEditor - phase 2 pre-spike: measure family-view edge
 * crossings against the akarians fixture at three foci.
 *
 * Definition of "crossing" used here: a *strict proper intersection*
 * between two edge polyline segments — both segments cross transversally
 * (neither endpoint touches the other segment) and the two edges share
 * no person in their `persons` lists. The shared-person filter excludes
 * intentional shared geometry (couple connector + its parent-stem + its
 * sibling bus + per-kid stubs all share the partner pair; counting them
 * against each other would just measure the bus topology, not crossings).
 *
 * Foci picked deterministically from `tree.people` to make the
 * measurement reproducible across machines:
 *   - root = `tree.rootId` (proband; mirrors the visual-akarians golden)
 *   - dense = highest `parents + spouses + child-count` aggregate; the
 *     person whose bounded subset is most likely to contain crossing
 *     opportunities
 *   - leaf = lowest non-zero aggregate among persons with parents but
 *     zero children; a sparse branch endpoint
 *
 * Today this test logs the counts and asserts only that they're finite
 * non-negative integers — the absolute number is captured in the phase 2
 * retro and drives the defer-vs-implement decision. Once the
 * `crossingMin` pass lands, this same file is the regression guard: the
 * pass must not raise the counts above the baseline, and the implement
 * branch tightens the assertions to `expect(count).toBeLessThanOrEqual(...)`.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { computeLayout } from "$lib/layout/engines/family-view/layout";
import type { PersonId, Tree } from "$lib/domain/types";
import { getParents } from "$lib/domain/tree";
import type { FamilyViewEdge, FamilyViewLayout } from "$lib/layout/engines/family-view/types";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

const tree: Tree = (() => {
    const text = readFileSync(FIXTURE, "utf8");
    return unwrap(parseGedcom(text)).tree;
})();

// strict orientation: +1 ccw, -1 cw, 0 collinear
function ori(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
    const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (v > 1e-12) return 1;
    if (v < -1e-12) return -1;
    return 0;
}

// strict proper intersection — collinear / touching endpoints do not
// count as a crossing. matches the standard "do these two graph edges
// visually cross" semantic.
function segmentsCross(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    dx: number,
    dy: number,
): boolean {
    const o1 = ori(ax, ay, bx, by, cx, cy);
    const o2 = ori(ax, ay, bx, by, dx, dy);
    const o3 = ori(cx, cy, dx, dy, ax, ay);
    const o4 = ori(cx, cy, dx, dy, bx, by);
    return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

function sharePerson(a: FamilyViewEdge, b: FamilyViewEdge): boolean {
    const seen = new Set<PersonId>(a.persons);
    for (const p of b.persons) if (seen.has(p)) return true;
    return false;
}

function edgePairCrosses(a: FamilyViewEdge, b: FamilyViewEdge): boolean {
    for (let i = 0; i < a.points.length - 1; i += 1) {
        const a0 = a.points[i]!;
        const a1 = a.points[i + 1]!;
        for (let j = 0; j < b.points.length - 1; j += 1) {
            const b0 = b.points[j]!;
            const b1 = b.points[j + 1]!;
            if (segmentsCross(a0.x, a0.y, a1.x, a1.y, b0.x, b0.y, b1.x, b1.y)) {
                return true;
            }
        }
    }
    return false;
}

function countCrossings(layout: FamilyViewLayout): number {
    const edges = layout.edges;
    let count = 0;
    for (let i = 0; i < edges.length; i += 1) {
        for (let j = i + 1; j < edges.length; j += 1) {
            if (sharePerson(edges[i]!, edges[j]!)) continue;
            if (edgePairCrosses(edges[i]!, edges[j]!)) count += 1;
        }
    }
    return count;
}

// O(N) focus picker: score each person by parents + spouses + child
// count (= "neighborhood density"); pick max and the min over leaves
// (children=0, parents>0).
function profileFoci(t: Tree): { dense: PersonId; leaf: PersonId } {
    const childCount = new Map<PersonId, number>();
    for (const couple of t.couples) {
        const k = couple.childIds.length;
        for (const partnerId of [couple.leftId, couple.rightId]) {
            childCount.set(partnerId, (childCount.get(partnerId) ?? 0) + k);
        }
    }
    let dense: { id: PersonId; score: number } = { id: t.rootId, score: -1 };
    let leaf: { id: PersonId; score: number } = { id: t.rootId, score: Infinity };
    for (const [id, person] of Object.entries(t.people)) {
        const parents = getParents(person).length;
        const spouses = person.spouseIds.length;
        const children = childCount.get(id) ?? 0;
        const score = parents + spouses + children;
        if (score > dense.score) dense = { id, score };
        if (children === 0 && parents > 0 && score < leaf.score) {
            leaf = { id, score };
        }
    }
    return { dense: dense.id, leaf: leaf.id };
}

describe("family-view crossings — phase 2 baseline against fixtures", () => {
    it("counts strict-cross edges at root + dense + leaf foci on akarians, pre- and post-crossingMin", () => {
        const { dense, leaf } = profileFoci(tree);
        const foci = [
            { label: "akarians-root ", id: tree.rootId },
            { label: "akarians-dense", id: dense },
            { label: "akarians-leaf ", id: leaf },
        ] as const;

        for (const { label, id } of foci) {
            const off = computeLayout(tree, id, { crossingMin: false });
            const on = computeLayout(tree, id, { crossingMin: true });
            const offCount = countCrossings(off);
            const onCount = countCrossings(on);
            console.info(
                `[phase-2] ${label} (focus=${id}, visible=${String(
                    off.nodes.size,
                )}, edges=${String(off.edges.length)}): off=${String(
                    offCount,
                )} on=${String(onCount)} delta=${String(onCount - offCount)}`,
            );
            expect(offCount).toBeGreaterThanOrEqual(0);
            expect(onCount).toBeGreaterThanOrEqual(0);
            expect(onCount).toBeLessThanOrEqual(offCount); // monotone gate
            expect(offCount).toBeLessThanOrEqual(500);
        }
    });

    it("dense-tree fixture: counts at the dense-tree root", () => {
        const denseTreePath = resolve(process.cwd(), "tests/fixtures/dense-tree.ged");
        const denseTree = unwrap(parseGedcom(readFileSync(denseTreePath, "utf8"))).tree;
        const off = computeLayout(denseTree, denseTree.rootId, { crossingMin: false });
        const on = computeLayout(denseTree, denseTree.rootId, { crossingMin: true });
        const offCount = countCrossings(off);
        const onCount = countCrossings(on);
        console.info(
            `[phase-2] dense-tree-root (focus=${denseTree.rootId}, visible=${String(
                off.nodes.size,
            )}, edges=${String(off.edges.length)}): off=${String(
                offCount,
            )} on=${String(onCount)} delta=${String(onCount - offCount)}`,
        );
        expect(onCount).toBeLessThanOrEqual(offCount);
    });

    it("multi-union fixture: counts at the multi-union root", () => {
        const muPath = resolve(process.cwd(), "tests/fixtures/multi-union.ged");
        const muTree = unwrap(parseGedcom(readFileSync(muPath, "utf8"))).tree;
        const off = computeLayout(muTree, muTree.rootId, { crossingMin: false });
        const on = computeLayout(muTree, muTree.rootId, { crossingMin: true });
        const offCount = countCrossings(off);
        const onCount = countCrossings(on);
        console.info(
            `[phase-2] multi-union-root (focus=${muTree.rootId}, visible=${String(
                off.nodes.size,
            )}, edges=${String(off.edges.length)}): off=${String(
                offCount,
            )} on=${String(onCount)} delta=${String(onCount - offCount)}`,
        );
        expect(onCount).toBeLessThanOrEqual(offCount);
    });
});
