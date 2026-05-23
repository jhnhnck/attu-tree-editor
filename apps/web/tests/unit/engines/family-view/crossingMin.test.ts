/*
 * FamilyTreeEditor - wave-2 phase 2 crossing-minimisation pass tests.
 *
 * Asserts the four DoD-mandated cases (no-op, avoidable, unavoidable,
 * akarians) plus the opt-out contract. The pass is monotone on the
 * user-visible geometric-crossing count via the gate in `computeLayout`,
 * so every assertion is "post-pass count ≤ off-pass count" rather than
 * "post-pass count == X". Routes layout-shape assertions through
 * `pickLeftRight` (B11) so `orientCouple`'s same-gender lex-order
 * tie-break can shift without invalidating the test.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { computeLayout, countLayoutCrossings } from "$lib/layout/engines/family-view/layout";
import { parseGedcom } from "$lib/io/gedcom/parse";
import type { Person, Tree } from "$lib/domain/types";
import { pickLeftRight } from "../../../_helpers/family-view";

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

describe("family-view crossingMin — DoD case 1: no-op on a tree with no crossings", () => {
    it("a one-couple, one-child tree has zero crossings on/off", () => {
        let t = createTree("test", blank("Focus"));
        const father = addPerson(t, blank("Father", "m"));
        t = father.tree;
        const mother = addPerson(t, blank("Mother", "f"));
        t = mother.tree;
        t = unwrap(linkParent(t, ROOT_ID, father.id));
        t = unwrap(linkParent(t, ROOT_ID, mother.id));
        t = unwrap(linkSpouse(t, father.id, mother.id));

        const off = computeLayout(t, ROOT_ID, { crossingMin: false });
        const on = computeLayout(t, ROOT_ID, { crossingMin: true });
        expect(countLayoutCrossings(off)).toBe(0);
        expect(countLayoutCrossings(on)).toBe(0);
        // and layout shape is unchanged
        expect(pickLeftRight(on, [father.id, mother.id])).toEqual(
            pickLeftRight(off, [father.id, mother.id]),
        );
    });
});

describe("family-view crossingMin — DoD case 2: avoidable crossing on a synthetic tree", () => {
    /*
     * Construct a tree where `tree.couples` field order at the great-
     * grandparent rank is the *opposite* of the natural placement at
     * the grandparent rank. With crossing-min off, the rank -3 slot
     * order pulls stems across rank -2; with it on, the pass should
     * swap or hold the order so the crossing count never increases.
     *
     * Topology:
     *   GG1+GG2 (paternal GP1's parents)
     *   GG3+GG4 (maternal GP3's parents)
     *   GG5+GG6 (paternal GP2's parents)
     *   GG7+GG8 (maternal GP4's parents)
     *   GP1+GP2: F                      <- F = father
     *   GP3+GP4: M                      <- M = mother
     *   F+M: focus
     *
     * The two paternal-side great-grandparent couples (GG1+GG2 and
     * GG5+GG6) belong on the same side of the canvas as F; the two
     * maternal-side couples (GG3+GG4 and GG7+GG8) on M's side.
     * Whatever `tree.couples` interleaving happens, the pass should
     * not yield more geometric crossings than the raw field-order
     * placement.
     */
    function build(): { tree: Tree; ids: Record<string, string> } {
        let t = createTree("test", blank("Focus"));
        const add = (name: string, sex: Person["gender"]): string => {
            const a = addPerson(t, blank(name, sex));
            t = a.tree;
            return a.id;
        };
        const ids: Record<string, string> = { focus: ROOT_ID };
        for (const k of ["F", "M", "GP1", "GP2", "GP3", "GP4"] as const) {
            ids[k] = add(k, k === "F" || k.startsWith("GP1") || k === "GP4" ? "m" : "f");
        }
        for (const k of ["GG1", "GG2", "GG3", "GG4", "GG5", "GG6", "GG7", "GG8"] as const) {
            ids[k] = add(
                k,
                k.endsWith("2") || k.endsWith("4") || k.endsWith("6") || k.endsWith("8")
                    ? "f"
                    : "m",
            );
        }
        // intentionally interleave the great-grandparent couples so the
        // raw field order is not the natural placement
        const link = (childId: string, parentId: string): void => {
            t = unwrap(linkParent(t, childId, parentId));
        };
        link(ids.focus!, ids.F!);
        link(ids.focus!, ids.M!);
        link(ids.F!, ids.GP1!);
        link(ids.F!, ids.GP2!);
        link(ids.M!, ids.GP3!);
        link(ids.M!, ids.GP4!);
        link(ids.GP1!, ids.GG1!);
        link(ids.GP1!, ids.GG2!);
        link(ids.GP2!, ids.GG5!);
        link(ids.GP2!, ids.GG6!);
        link(ids.GP3!, ids.GG3!);
        link(ids.GP3!, ids.GG4!);
        link(ids.GP4!, ids.GG7!);
        link(ids.GP4!, ids.GG8!);
        t = unwrap(linkSpouse(t, ids.F!, ids.M!));
        t = unwrap(linkSpouse(t, ids.GP1!, ids.GP2!));
        t = unwrap(linkSpouse(t, ids.GP3!, ids.GP4!));
        t = unwrap(linkSpouse(t, ids.GG1!, ids.GG2!));
        t = unwrap(linkSpouse(t, ids.GG3!, ids.GG4!));
        t = unwrap(linkSpouse(t, ids.GG5!, ids.GG6!));
        t = unwrap(linkSpouse(t, ids.GG7!, ids.GG8!));
        return { tree: t, ids };
    }

    it("crossingMin never increases the geometric crossing count vs off", () => {
        const { tree, ids } = build();
        const off = computeLayout(tree, ids.focus!, { crossingMin: false });
        const on = computeLayout(tree, ids.focus!, { crossingMin: true });
        const offCount = countLayoutCrossings(off);
        const onCount = countLayoutCrossings(on);
        expect(onCount).toBeLessThanOrEqual(offCount);
    });
});

describe("family-view crossingMin — DoD case 3: unavoidable crossing left alone", () => {
    /*
     * A child with two unmarried parents on *separate* couples (multi-
     * parent topology) forces an edge from each parent couple down to
     * the same child. Whichever couple lands on a side, one of the two
     * stems must cross the other if the couples land on opposite sides
     * of the child. The pass should leave this alone (or at least not
     * make it worse). The pass's monotone gate guarantees that.
     */
    it("multi-parent child: pass does not raise crossings", () => {
        let t = createTree("test", blank("Focus"));
        // give focus 4 parents: 2 unrelated couples both linked as parents
        const a1 = addPerson(t, blank("A1", "m"));
        t = a1.tree;
        const a2 = addPerson(t, blank("A2", "f"));
        t = a2.tree;
        const b1 = addPerson(t, blank("B1", "m"));
        t = b1.tree;
        const b2 = addPerson(t, blank("B2", "f"));
        t = b2.tree;
        t = unwrap(linkParent(t, ROOT_ID, a1.id));
        t = unwrap(linkParent(t, ROOT_ID, a2.id));
        t = unwrap(linkParent(t, ROOT_ID, b1.id));
        t = unwrap(linkParent(t, ROOT_ID, b2.id));
        t = unwrap(linkSpouse(t, a1.id, a2.id));
        t = unwrap(linkSpouse(t, b1.id, b2.id));

        const off = computeLayout(t, ROOT_ID, { crossingMin: false });
        const on = computeLayout(t, ROOT_ID, { crossingMin: true });
        expect(countLayoutCrossings(on)).toBeLessThanOrEqual(countLayoutCrossings(off));
    });
});

describe("family-view crossingMin — DoD case 4: akarians primary focus", () => {
    const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");
    const tree: Tree = unwrap(parseGedcom(readFileSync(FIXTURE, "utf8"))).tree;

    it("count at the proband focus stays at-or-below the pre-pass baseline", () => {
        const off = computeLayout(tree, tree.rootId, { crossingMin: false });
        const on = computeLayout(tree, tree.rootId, { crossingMin: true });
        expect(countLayoutCrossings(on)).toBeLessThanOrEqual(countLayoutCrossings(off));
    });
});

describe("family-view crossingMin — opt-out contract", () => {
    it("crossingMin: false leaves the slot order in raw tree.couples sequence", () => {
        let t = createTree("test", blank("Focus"));
        const father = addPerson(t, blank("Father", "m"));
        t = father.tree;
        const mother = addPerson(t, blank("Mother", "f"));
        t = mother.tree;
        t = unwrap(linkParent(t, ROOT_ID, father.id));
        t = unwrap(linkParent(t, ROOT_ID, mother.id));
        t = unwrap(linkSpouse(t, father.id, mother.id));
        const off = computeLayout(t, ROOT_ID, { crossingMin: false });
        // father is the m-gender partner so orientCouple puts him on the left
        expect(pickLeftRight(off, [father.id, mother.id])).toEqual([father.id, mother.id]);
    });

    it("default is crossingMin enabled (omitted option ≡ true)", () => {
        let t = createTree("test", blank("Focus"));
        const father = addPerson(t, blank("Father", "m"));
        t = father.tree;
        t = unwrap(linkParent(t, ROOT_ID, father.id));
        // implicit default vs explicit true should be identical
        const a = computeLayout(t, ROOT_ID);
        const b = computeLayout(t, ROOT_ID, { crossingMin: true });
        expect(countLayoutCrossings(a)).toBe(countLayoutCrossings(b));
        expect(a.nodes.size).toBe(b.nodes.size);
        expect(a.edges.length).toBe(b.edges.length);
    });
});
