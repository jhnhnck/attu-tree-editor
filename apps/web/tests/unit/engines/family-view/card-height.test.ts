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
    CARD_H_COMPACT,
    CARD_H_WITH_PORTRAIT,
    computeLayout,
} from "$lib/layout/engines/family-view/layout";
import type { Person, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

describe("cardHeight heuristic", () => {
    it("returns CARD_H_WITH_PORTRAIT when portraitBlobId is set", () => {
        expect(cardHeight({ portraitBlobId: "blob:abc", given: "Ann" })).toBe(CARD_H_WITH_PORTRAIT);
    });

    it("returns CARD_H_COMPACT for short names without a portrait", () => {
        // "Ann Lee" → 7 chars, well under 14
        expect(cardHeight({ given: "Ann", surname: "Lee" })).toBe(CARD_H_COMPACT);
    });

    it("returns the default CARD_H for long names without a portrait", () => {
        // 20 chars, above the 14 threshold
        expect(cardHeight({ given: "Alexandra", surname: "Williamson" })).toBe(CARD_H);
    });

    it("returns CARD_H when person is undefined", () => {
        expect(cardHeight(undefined)).toBe(CARD_H);
    });

    it("portrait wins over short name", () => {
        expect(cardHeight({ portraitBlobId: "blob:x", given: "A", surname: "B" })).toBe(
            CARD_H_WITH_PORTRAIT,
        );
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
        expect(rightNode?.h).toBe(CARD_H_COMPACT);
        // "ChildLongerName" is 15+1+0 = 16 chars effective → above the 14-char
        // compact threshold, so the child gets the default CARD_H.
        expect(childNode?.h).toBe(CARD_H);
    });

    it("couple connector anchors at the shorter card's midline so it passes through both", () => {
        const { tree, ids } = makeMixedHeightCouple();
        const layout = computeLayout(tree, ids.child!, {});
        const leftNode = layout.nodes.get(ids.left!)!;
        const rightNode = layout.nodes.get(ids.right!)!;
        const bondEdge = layout.edges.find((e) => e.role === "married");
        expect(bondEdge).toBeDefined();
        const minH = Math.min(leftNode.h ?? CARD_H, rightNode.h ?? CARD_H);
        const expectedY = leftNode.y + minH / 2;
        expect(bondEdge!.points[0]!.y).toBeCloseTo(expectedY);
        expect(bondEdge!.points[1]!.y).toBeCloseTo(expectedY);
        // The bus midline must lie within both cards' vertical extents.
        expect(expectedY).toBeGreaterThanOrEqual(leftNode.y);
        expect(expectedY).toBeLessThanOrEqual(leftNode.y + (leftNode.h ?? CARD_H));
        expect(expectedY).toBeGreaterThanOrEqual(rightNode.y);
        expect(expectedY).toBeLessThanOrEqual(rightNode.y + (rightNode.h ?? CARD_H));
    });

    it("child drop starts from the couple-bus midline (mixed heights stay consistent)", () => {
        const { tree, ids } = makeMixedHeightCouple();
        const layout = computeLayout(tree, ids.child!, {});
        const leftNode = layout.nodes.get(ids.left!)!;
        const rightNode = layout.nodes.get(ids.right!)!;
        const dropEdge = layout.edges.find((e) => e.id.startsWith("drop:union:"));
        expect(dropEdge).toBeDefined();
        const minH = Math.min(leftNode.h ?? CARD_H, rightNode.h ?? CARD_H);
        const expectedY = leftNode.y + minH / 2;
        // Drop's first point is (anchorCenterX, anchorY) where anchorY is the bus midline.
        expect(dropEdge!.points[0]!.y).toBeCloseTo(expectedY);
    });
});
