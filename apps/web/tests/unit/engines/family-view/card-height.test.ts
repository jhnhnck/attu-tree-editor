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
    RANK_GUTTER,
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
        // Left parent has a portrait (tall card, h = CARD_H_WITH_PORTRAIT),
        // right parent has none (default card, h = CARD_H), one child with
        // no portrait (default card, h = CARD_H). The child is added to
        // the couple's childIds so the layout emits the couple-bus + per-
        // child drops.
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
        // tall card holds row top; shorter card sits with equal padding
        // above and below to share the row midline. Robust against
        // `orientCouple` swapping left/right under personId order.
        const tallNode = (leftNode.h ?? CARD_H) >= (rightNode.h ?? CARD_H) ? leftNode : rightNode;
        const shortNode = tallNode === leftNode ? rightNode : leftNode;
        const rowH = Math.max(leftNode.h ?? CARD_H, rightNode.h ?? CARD_H);
        const shortH = shortNode.h ?? CARD_H;
        expect(rowH).toBe(CARD_H_WITH_PORTRAIT);
        expect(shortNode.y).toBeCloseTo(tallNode.y + (rowH - shortH) / 2);
    });

    it("no card extends past its rank's allotted slot (cross-rank clearance)", () => {
        // The blocker fix: a portrait parent at rank R must not overlap
        // the rank R+1 child card. Cumulative rank-y means each rank's
        // bottom is at least RANK_GUTTER above the next rank's top.
        const { tree, ids } = makeMixedHeightCouple();
        const layout = computeLayout(tree, ids.child!, {});
        // Group nodes by rank, derive per-rank top from min y, bottom from
        // max (y + h). Adjacent ranks must clear by at least RANK_GUTTER.
        const byRank = new Map<number, { top: number; bottom: number }>();
        for (const n of layout.nodes.values()) {
            const top = n.y;
            const bottom = n.y + (n.h ?? CARD_H);
            const cur = byRank.get(n.rank);
            if (cur === undefined) byRank.set(n.rank, { top, bottom });
            else
                byRank.set(n.rank, {
                    top: Math.min(cur.top, top),
                    bottom: Math.max(cur.bottom, bottom),
                });
        }
        const ranks = [...byRank.keys()].sort((a, b) => a - b);
        for (let i = 0; i < ranks.length - 1; i += 1) {
            const a = byRank.get(ranks[i]!)!;
            const b = byRank.get(ranks[i + 1]!)!;
            expect(b.top - a.bottom).toBeCloseTo(RANK_GUTTER);
        }
    });

    it("sibling bus runs in the gutter, below the parent row's bottom edge", () => {
        // The other half of the blocker fix: bus + stem + stub tops must
        // sit *outside* the parent card so they aren't hidden by the SVG/
        // card paint order (cards mount on top of the SVG layer).
        const { tree, ids } = makeMixedHeightCouple();
        const layout = computeLayout(tree, ids.child!, {});
        const leftNode = layout.nodes.get(ids.left!)!;
        const rightNode = layout.nodes.get(ids.right!)!;
        const parentRowBottom = Math.max(
            leftNode.y + (leftNode.h ?? CARD_H),
            rightNode.y + (rightNode.h ?? CARD_H),
        );
        const busEdge = layout.edges.find((e) => e.id.startsWith("bus:union:"));
        const stemEdge = layout.edges.find((e) => e.id.startsWith("stem:union:"));
        const stubEdge = layout.edges.find((e) => e.id.startsWith("stub:union:"));
        expect(busEdge).toBeDefined();
        expect(stemEdge).toBeDefined();
        expect(stubEdge).toBeDefined();
        expect(busEdge!.points[0]!.y).toBeGreaterThan(parentRowBottom);
        // stem ends at the bus; its tail must clear the parent row too
        expect(stemEdge!.points[1]!.y).toBeGreaterThan(parentRowBottom);
        // stubs start at the bus and end at the kid card top
        expect(stubEdge!.points[0]!.y).toBeGreaterThan(parentRowBottom);
    });

    it("bbox.height covers a tall portrait card on the bottom rank", () => {
        // Pre-fix bbox.height used `ranks * ROW_H`, which under-counted
        // by (CARD_H_WITH_PORTRAIT - CARD_H) when the lowest rank carried
        // a portrait. New cumulative formula must include the full last-
        // row height.
        let t = createTree("test", blank("Parent"));
        const kid = addPerson(t, blank("Kid"));
        t = kid.tree;
        // portrait on the child so the bottom rank carries the tall card
        t = updatePerson(t, kid.id, { portraitBlobId: "blob:test" });
        const link = linkParent(t, kid.id, ROOT_ID);
        if (!link.ok) throw new Error(link.error);
        t = link.value;
        const layout = computeLayout(t, ROOT_ID, {});
        const allNodes = [...layout.nodes.values()];
        const bottomRank = Math.max(...allNodes.map((n) => n.rank));
        const bottomNode = allNodes.find(
            (n) => n.rank === bottomRank && (n.h ?? CARD_H) === CARD_H_WITH_PORTRAIT,
        );
        expect(bottomNode).toBeDefined();
        // bbox.height is measured from the topmost rank's top, so the
        // bottom-row card's bottom-y (relative to that) must fit inside it.
        const topRankY = Math.min(...allNodes.map((n) => n.y));
        const bottomY = bottomNode!.y + (bottomNode!.h ?? CARD_H);
        expect(layout.bbox.height).toBeGreaterThanOrEqual(bottomY - topRankY);
    });
});
