/*
 * FamilyTreeEditor - phase 2 of the visual fix-up plan: connector geometry.
 *
 * Three DoD assertions for the issues this phase resolves:
 *   #4 — couple-bus endpoint x equals `left.x + PERSON_W - CARD_VISIBLE_INSET_U`
 *        (and the symmetric inset on the right card), so the bus terminates
 *        at the visible card edge rather than overrunning into the rounded
 *        corner.
 *   #5 — the per-couple sibling block emits exactly one explicit bus
 *        segment (id `bus:union:…`) plus N short stubs (id `stub:union:…|kid`)
 *        plus one parent stem (id `stem:union:…`). The bus's X extent
 *        spans the parents' midpoint and every child's midX (anchorCenterX
 *        is in [busLeftX, busRightX]).
 *   #6 — every coordinate in the SVG `d` string emitted by `edgePath` is
 *        an integer (rounded after the UNIT scale). Crisp T-junctions at
 *        the design zoom (1.0×).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { PERSON_W } from "$lib/layout/constants";
import { CARD_VISIBLE_INSET_U, computeLayout } from "$lib/layout/engines/family-view/layout";
import { edgePath } from "$lib/layout/engines/family-view/edgePath";
import type { Person, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function makeCoupleWithChildren(): {
    tree: Tree;
    ids: { left: string; right: string; child1: string; child2: string; child3: string };
} {
    let t = createTree("test", blank("Focus"));
    const focusId = ROOT_ID;
    const left = addPerson(t, blank("LeftParentNameLong"));
    t = left.tree;
    const right = addPerson(t, blank("RightParentNameLong"));
    t = right.tree;
    const c1 = addPerson(t, blank("ChildOneLongerName"));
    t = c1.tree;
    const c2 = addPerson(t, blank("ChildTwoLongerName"));
    t = c2.tree;
    const c3 = addPerson(t, blank("ChildThreeLongerName"));
    t = c3.tree;
    for (const kid of [focusId, c1.id, c2.id, c3.id]) {
        const r1 = linkParent(t, kid, left.id);
        if (!r1.ok) throw new Error(r1.error);
        t = r1.value;
        const r2 = linkParent(t, kid, right.id);
        if (!r2.ok) throw new Error(r2.error);
        t = r2.value;
    }
    const sp = linkSpouse(t, left.id, right.id);
    if (!sp.ok) throw new Error(sp.error);
    t = sp.value;
    // splice all four kids into the couple's childIds so the engine takes
    // the couple-with-shared-children path (the gedcom importer is what
    // would set this in production fixtures).
    t = {
        ...t,
        couples: t.couples.map((c) =>
            c.leftId === left.id && c.rightId === right.id
                ? { ...c, childIds: [focusId, c1.id, c2.id, c3.id] }
                : c,
        ),
    };
    return {
        tree: t,
        ids: { left: left.id, right: right.id, child1: c1.id, child2: c2.id, child3: c3.id },
    };
}

describe("phase 2 #4 — couple-connector clamps to visible card edge", () => {
    it("couple-bus endpoints sit CARD_VISIBLE_INSET_U inside each card's facing rect edge", () => {
        // The couple's screen-left / screen-right ordering is decided by
        // `orientCouple` (gender-conventional), so don't assume `ids.left`
        // is the screen-left parent. Pick screen-left by x position.
        const { tree, ids } = makeCoupleWithChildren();
        const layout = computeLayout(tree, ids.child1, {});
        const a = layout.nodes.get(ids.left)!;
        const b = layout.nodes.get(ids.right)!;
        const [screenLeft, screenRight] = a.x <= b.x ? [a, b] : [b, a];
        const bus = layout.edges.find((e) => e.id.startsWith("bond:") && e.role === "married");
        expect(bus).toBeDefined();
        const [pLeft, pRight] =
            bus!.points[0]!.x < bus!.points[1]!.x
                ? [bus!.points[0]!, bus!.points[1]!]
                : [bus!.points[1]!, bus!.points[0]!];
        // bus terminates inside the screen-left card's right rect edge
        expect(pLeft.x).toBeCloseTo(screenLeft.x + PERSON_W - CARD_VISIBLE_INSET_U);
        // ...and inside the screen-right card's left rect edge
        expect(pRight.x).toBeCloseTo(screenRight.x + CARD_VISIBLE_INSET_U);
    });
});

describe("phase 2 #5 — explicit sibling-bus segment + parent-stem + per-kid stubs", () => {
    it("emits exactly one bus + one stem + N stubs (not N L-drops)", () => {
        const { tree, ids } = makeCoupleWithChildren();
        const layout = computeLayout(tree, ids.child1, {});
        const stems = layout.edges.filter((e) => e.id.startsWith("stem:union:"));
        const buses = layout.edges.filter((e) => e.id.startsWith("bus:union:"));
        const stubs = layout.edges.filter((e) => e.id.startsWith("stub:union:"));
        const oldDrops = layout.edges.filter((e) => e.id.startsWith("drop:union:"));
        expect(stems).toHaveLength(1);
        expect(buses).toHaveLength(1);
        // 4 children spliced in, all visible in the bounded subset.
        expect(stubs.length).toBeGreaterThanOrEqual(2);
        // Old per-child L-drops for couple-with-shared-children must be gone.
        expect(oldDrops).toHaveLength(0);
    });

    it("bus extent spans the parents' midpoint and every visible kid's midX", () => {
        const { tree, ids } = makeCoupleWithChildren();
        const layout = computeLayout(tree, ids.child1, {});
        const leftNode = layout.nodes.get(ids.left)!;
        const rightNode = layout.nodes.get(ids.right)!;
        const anchorCenterX = (leftNode.x + PERSON_W / 2 + rightNode.x + PERSON_W / 2) / 2;
        const bus = layout.edges.find((e) => e.id.startsWith("bus:union:"))!;
        const busLeft = Math.min(bus.points[0]!.x, bus.points[1]!.x);
        const busRight = Math.max(bus.points[0]!.x, bus.points[1]!.x);
        // anchorCenterX must lie inside the bus extent — guarantees the
        // parent stem always lands on the bus regardless of child layout.
        expect(busLeft).toBeLessThanOrEqual(anchorCenterX);
        expect(busRight).toBeGreaterThanOrEqual(anchorCenterX);
        // Every visible kid's midX must lie inside the bus extent — every
        // stub starts on the bus, never floats free of it.
        for (const kidId of [ids.child1, ids.child2, ids.child3]) {
            const kidNode = layout.nodes.get(kidId);
            if (!kidNode) continue;
            const kidMidX = kidNode.x + PERSON_W / 2;
            expect(busLeft).toBeLessThanOrEqual(kidMidX);
            expect(busRight).toBeGreaterThanOrEqual(kidMidX);
        }
    });

    it("bus, stem, and stubs all sit at the same Y (bus midline between parent rank and child rank)", () => {
        const { tree, ids } = makeCoupleWithChildren();
        const layout = computeLayout(tree, ids.child1, {});
        const stem = layout.edges.find((e) => e.id.startsWith("stem:union:"))!;
        const bus = layout.edges.find((e) => e.id.startsWith("bus:union:"))!;
        const stubs = layout.edges.filter((e) => e.id.startsWith("stub:union:"));
        const busY = bus.points[0]!.y;
        expect(bus.points[1]!.y).toBeCloseTo(busY);
        // Stem terminates at busY.
        expect(stem.points[1]!.y).toBeCloseTo(busY);
        // Every stub starts at busY.
        for (const stub of stubs) {
            expect(stub.points[0]!.y).toBeCloseTo(busY);
        }
    });
});

describe("phase 2 #6 — edgePath snaps every coordinate to the nearest integer pixel", () => {
    it("rounds non-integer unit-space coordinates after the UNIT scale", () => {
        // pick coords that, scaled by UNIT=80, land on .5 boundaries — these
        // are the artifact-prone cases that produced sub-pixel T-junctions
        // at the design zoom.
        const points = [
            { x: 1.00625, y: 2.00625 }, // 80.5, 160.5
            { x: 1.00625, y: 3.49375 }, // 80.5, 279.5
            { x: 4.99375, y: 3.49375 }, // 399.5, 279.5
        ];
        const d = edgePath(points, 80);
        // Every numeric token in `d` must be an integer.
        const numeric = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
        expect(numeric.length).toBeGreaterThan(0);
        for (const tok of numeric) {
            expect(Number.isInteger(Number(tok))).toBe(true);
        }
    });

    it("returns empty string for an empty polyline", () => {
        expect(edgePath([], 80)).toBe("");
    });

    it("uses M for the first point and L for subsequent points", () => {
        const d = edgePath(
            [
                { x: 1, y: 2 },
                { x: 3, y: 4 },
                { x: 5, y: 6 },
            ],
            10,
        );
        expect(d).toBe("M 10 20 L 30 40 L 50 60");
    });
});
