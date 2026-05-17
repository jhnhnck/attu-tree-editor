/*
 * FamilyTreeEditor - phase 1 of the visual fix-up plan: content-driven card height.
 *
 * Verifies the heuristic + that connector geometry uses per-node heights so
 * the couple-bus and child-drop still connect the cards' visible bodies when
 * heights differ across a row.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse, updatePerson } from "$lib/domain/tree";
import {
    cardHeight,
    CARD_H,
    CARD_H_WITH_PORTRAIT,
    computeLayout,
} from "$lib/layout/engines/family-view/layout";
import type { Person, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

describe("cardHeight heuristic", () => {
    it("returns CARD_H_WITH_PORTRAIT when portraitBlobId is set", () => {
        expect(cardHeight({ portraitBlobId: "blob:abc" })).toBe(CARD_H_WITH_PORTRAIT);
    });

    it("returns the default CARD_H without a portrait (no silhouette path)", () => {
        expect(cardHeight({})).toBe(CARD_H);
    });

    it("returns CARD_H when person is undefined", () => {
        expect(cardHeight(undefined)).toBe(CARD_H);
    });

    it("portrait card height is exactly double the default", () => {
        expect(CARD_H_WITH_PORTRAIT).toBe(CARD_H * 2);
    });
});

describe("mixed-height row geometry", () => {
    function makeMixedHeightCouple(): { tree: Tree; ids: Record<string, string> } {
        // Left parent has a portrait (tall card, h=1.6), right parent has a
        // very short name (compact card, h=0.9), one child with a long name
        // (default card, h=1.2). The child is added to the couple's
        // childIds so the layout emits the couple-bus + per-child drops.
        let t = createTree("test", blank("ChildLongerName"));
        const ids: Record<string, string> = { child: ROOT_ID };
        const left = addPerson(t, blank("MotherLongName"));
        t = left.tree;
        const right = addPerson(t, blank("Pa"));
        t = right.tree;
        // give the left parent a portrait blob id (synthetic; no actual blob)
        t = updatePerson(t, left.id, { portraitBlobId: "blob:test" });
        const link1 = linkParent(t, ROOT_ID, left.id);
        if (!link1.ok) throw new Error(link1.error);
        t = link1.value;
        const link2 = linkParent(t, ROOT_ID, right.id);
        if (!link2.ok) throw new Error(link2.error);
        t = link2.value;
        const sp = linkSpouse(t, left.id, right.id);
        if (!sp.ok) throw new Error(sp.error);
        t = sp.value;
        // splice the child into the couple's childIds so the engine uses
        // the couple-with-shared-children path (not the multi-parent path).
        // linkSpouse + linkParent leave childIds empty by default; the
        // gedcom importer is what populates it in production fixtures.
        t = {
            ...t,
            couples: t.couples.map((c) =>
                c.leftId === left.id && c.rightId === right.id ? { ...c, childIds: [ROOT_ID] } : c,
            ),
        };
        ids.left = left.id;
        ids.right = right.id;
        return { tree: t, ids };
    }

    it("assigns each node the height from cardHeight()", () => {
        const { tree, ids } = makeMixedHeightCouple();
        const layout = computeLayout(tree, ids.child!, {});
        const leftNode = layout.nodes.get(ids.left!);
        const rightNode = layout.nodes.get(ids.right!);
        const childNode = layout.nodes.get(ids.child!);
        expect(leftNode?.h).toBe(CARD_H_WITH_PORTRAIT);
        // No-portrait cards always get CARD_H now (compact path removed).
        expect(rightNode?.h).toBe(CARD_H);
        expect(childNode?.h).toBe(CARD_H);
    });

    it("couple connector anchors at the row midline (every card's midpoint aligns)", () => {
        const { tree, ids } = makeMixedHeightCouple();
        const layout = computeLayout(tree, ids.child!, {});
        const leftNode = layout.nodes.get(ids.left!)!;
        const rightNode = layout.nodes.get(ids.right!)!;
        const bondEdge = layout.edges.find((e) => e.role === "married");
        expect(bondEdge).toBeDefined();
        // Per-row vertical centering: leftNode.y + leftNode.h/2 ===
        // rightNode.y + rightNode.h/2. The bond runs at that shared midline.
        const leftMid = leftNode.y + (leftNode.h ?? CARD_H) / 2;
        const rightMid = rightNode.y + (rightNode.h ?? CARD_H) / 2;
        expect(leftMid).toBeCloseTo(rightMid);
        expect(bondEdge!.points[0]!.y).toBeCloseTo(leftMid);
        expect(bondEdge!.points[1]!.y).toBeCloseTo(leftMid);
    });

    it("parent stem starts from the couple-bus midline", () => {
        const { tree, ids } = makeMixedHeightCouple();
        const layout = computeLayout(tree, ids.child!, {});
        const leftNode = layout.nodes.get(ids.left!)!;
        const stemEdge = layout.edges.find((e) => e.id.startsWith("stem:union:"));
        expect(stemEdge).toBeDefined();
        const expectedY = leftNode.y + (leftNode.h ?? CARD_H) / 2;
        expect(stemEdge!.points[0]!.y).toBeCloseTo(expectedY);
    });

    it("shorter cards are vertically centered within a tall portrait row", () => {
        const { tree, ids } = makeMixedHeightCouple();
        const layout = computeLayout(tree, ids.child!, {});
        const leftNode = layout.nodes.get(ids.left!)!;
        const rightNode = layout.nodes.get(ids.right!)!;
        // left has portrait (h=CARD_H_WITH_PORTRAIT), right doesn't (h=CARD_H).
        // Row top = min of both card tops; the shorter card sits with equal
        // padding above and below to center within the taller row.
        expect(leftNode.h).toBe(CARD_H_WITH_PORTRAIT);
        expect(rightNode.h).toBe(CARD_H);
        const rowH = CARD_H_WITH_PORTRAIT;
        const expectedRightY = leftNode.y + (rowH - CARD_H) / 2;
        expect(rightNode.y).toBeCloseTo(expectedRightY);
    });
});
