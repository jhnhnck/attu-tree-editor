/*
 * FamilyTreeEditor - tests for layout/edgeRouter.ts
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { hvLayout } from "$lib/layout/hvLayout";
import { routeEdges } from "$lib/layout/edgeRouter";
import type { Person, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

/** small couple-with-2-kids fixture */
function nuclear(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("test", blank("dad", "m"));
    const mom = addPerson(t, blank("mom", "f"));
    t = mom.tree;
    const a = addPerson(t, blank("a", "u"));
    t = a.tree;
    const b = addPerson(t, blank("b", "u"));
    t = b.tree;

    const r1 = linkSpouse(t, ROOT_ID, mom.id);
    if (!r1.ok) throw new Error(r1.error);
    t = r1.value;

    const r2 = linkParent(t, a.id, ROOT_ID);
    if (!r2.ok) throw new Error(r2.error);
    const r3 = linkParent(r2.value, a.id, mom.id);
    if (!r3.ok) throw new Error(r3.error);
    const r4 = linkParent(r3.value, b.id, ROOT_ID);
    if (!r4.ok) throw new Error(r4.error);
    const r5 = linkParent(r4.value, b.id, mom.id);
    if (!r5.ok) throw new Error(r5.error);
    t = r5.value;

    return { tree: t, ids: { dad: ROOT_ID, mom: mom.id, a: a.id, b: b.id } };
}

describe("edgeRouter — bonds", () => {
    it("emits a horizontal bond for same-row spouses", () => {
        const { tree } = nuclear();
        const layout = hvLayout(tree);
        const segs = routeEdges(tree, layout.positions);
        const bonds = segs.filter((s) => s.kind === "bond");
        expect(bonds.length).toBeGreaterThanOrEqual(1);
        // pure-horizontal bond: y1 == y2
        const horiz = bonds.find((s) => s.y1 === s.y2);
        expect(horiz).toBeDefined();
        // role = married by default
        expect(horiz?.role).toBe("married");
    });

    it("marks divorced couples with role = divorced", () => {
        const { tree } = nuclear();
        // mark the couple as not current
        const t2: Tree = {
            ...tree,
            couples: tree.couples.map((c) => ({ ...c, isCurrent: false })),
        };
        const layout = hvLayout(t2);
        const segs = routeEdges(t2, layout.positions);
        const bonds = segs.filter((s) => s.kind === "bond");
        expect(bonds.every((b) => b.role === "divorced")).toBe(true);
    });

    it("emits an L-bond (3 segments) for cross-row spouses", () => {
        // override positions so the two spouses are on different rows; this
        // is rare but the router should handle it
        const { tree, ids } = nuclear();
        const layout = hvLayout(tree);
        const positions = new Map(layout.positions);
        const dadPos = positions.get(ids.dad!)!;
        positions.set(ids.dad!, { x: dadPos.x, y: dadPos.y - 4 }); // push dad up two rows
        const segs = routeEdges(tree, positions);
        const bondSegs = segs.filter((s) => s.kind === "bond");
        // L-bond emits 3 segs (vertical + horizontal + vertical)
        expect(bondSegs.length).toBeGreaterThanOrEqual(3);
    });
});

describe("edgeRouter — joint children", () => {
    it("emits drop + bus + per-child drops for a couple with 2 kids", () => {
        const { tree } = nuclear();
        const layout = hvLayout(tree);
        const segs = routeEdges(tree, layout.positions);
        const drops = segs.filter((s) => s.kind === "parent-drop");
        const buses = segs.filter((s) => s.kind === "sibling-bus");
        const childDrops = segs.filter((s) => s.kind === "child-drop");
        expect(drops.length).toBeGreaterThanOrEqual(1);
        expect(buses.length).toBeGreaterThanOrEqual(1);
        expect(childDrops.length).toBe(2);
    });

    it("does not emit a sibling bus for a single child", () => {
        let t = createTree("solo", blank("dad", "m"));
        const mom = addPerson(t, blank("mom", "f"));
        t = mom.tree;
        const kid = addPerson(t, blank("kid", "u"));
        t = kid.tree;
        const r1 = linkSpouse(t, ROOT_ID, mom.id);
        if (!r1.ok) throw new Error(r1.error);
        t = r1.value;
        const r2 = linkParent(t, kid.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);
        const r3 = linkParent(r2.value, kid.id, mom.id);
        if (!r3.ok) throw new Error(r3.error);
        t = r3.value;

        const layout = hvLayout(t);
        const segs = routeEdges(t, layout.positions);
        expect(segs.filter((s) => s.kind === "sibling-bus").length).toBe(0);
    });

    it("dedups child drops when two kids share an x", () => {
        const { tree, ids } = nuclear();
        const layout = hvLayout(tree);
        // force both kids to the same x
        const positions = new Map(layout.positions);
        const aPos = positions.get(ids.a!)!;
        positions.set(ids.b!, { x: aPos.x, y: aPos.y });
        const segs = routeEdges(tree, positions);
        const childDrops = segs.filter((s) => s.kind === "child-drop");
        // 2 kids at same x → 1 deduped child drop
        expect(childDrops.length).toBe(1);
    });
});

describe("edgeRouter — single parent", () => {
    it("emits an L-shape for a single child of a single parent", () => {
        let t = createTree("sp", blank("mom", "f"));
        const kid = addPerson(t, blank("kid", "u"));
        t = kid.tree;
        const r = linkParent(t, kid.id, ROOT_ID);
        if (!r.ok) throw new Error(r.error);
        t = r.value;
        const layout = hvLayout(t);
        const segs = routeEdges(t, layout.positions);
        // mom + kid at same x (RT centers parent over child) → single straight drop
        const childDrops = segs.filter((s) => s.kind === "child-drop");
        expect(childDrops.length).toBe(1);
    });
});

describe("edgeRouter — bridge hops on crossings", () => {
    it("annotates a vertical with a hop when an unrelated horizontal crosses it", () => {
        // craft positions where two unrelated couples' lines must cross
        // GP couple has child A; sibling SibGP couple has child B. A and B are
        // both root-level couples whose drops to their children's row create
        // vertical segments. We synthesize positions so the verticals cross
        // a sibling-bus from another group.
        const tree: Tree = {
            id: "x",
            name: "x",
            rootId: ROOT_ID,
            people: {
                [ROOT_ID]: { ...blank("a", "u"), id: ROOT_ID, motherId: "M" },
                M: { ...blank("m", "f"), id: "M" },
                X: { ...blank("x", "u"), id: "X" },
                Y: { ...blank("y", "u"), id: "Y" },
            },
            couples: [],
            rev: 0,
            updatedAt: 0,
        };
        // Hand-place positions so M is at (0, 0) with child ROOT at (0, 2)
        // and an unrelated horizontal segment is generated by an isolated
        // couple X+Y at (-2, 1) and (2, 1) — same row, will produce a bond
        const t2: Tree = {
            ...tree,
            people: {
                ...tree.people,
                X: { ...blank("x", "u"), id: "X", spouseIds: ["Y"] },
                Y: { ...blank("y", "u"), id: "Y", spouseIds: ["X"] },
            },
            couples: [{ leftId: "X", rightId: "Y", unionIndex: 1, childIds: [] }],
        };
        const positions = new Map([
            ["M", { x: 0, y: 0 }],
            [ROOT_ID, { x: 0, y: 2 }],
            ["X", { x: -2, y: 1 }],
            ["Y", { x: 2, y: 1 }],
        ]);
        const segs = routeEdges(t2, positions);
        const verticalsWithHops = segs.filter((s) => s.x1 === s.x2 && (s.hops ?? []).length > 0);
        expect(verticalsWithHops.length).toBeGreaterThan(0);
    });

    it("does not annotate hops within the same couple's own edges", () => {
        const { tree } = nuclear();
        const layout = hvLayout(tree);
        const segs = routeEdges(tree, layout.positions);
        // the couple's own drop + bus + child-drops form an intentional
        // intersection skeleton; no hops should be emitted within the group
        const hopped = segs.filter((s) => (s.hops ?? []).length > 0);
        // either zero, or only on segments that genuinely cross unrelated lines
        for (const s of hopped) {
            expect(s.id.startsWith("couple:")).toBe(true);
            // the hop must not be from a sibling within this very couple
            // (rough check: hops should have come from segments outside this group)
        }
        // for the simple nuclear family there's only one couple, so any hop
        // must be unrelated — here that means zero hops
        expect(hopped.length).toBe(0);
    });
});

describe("edgeRouter — segment IDs", () => {
    it("emits stable, predictable IDs we can match for highlighting", () => {
        const { tree } = nuclear();
        const layout = hvLayout(tree);
        const segs = routeEdges(tree, layout.positions);
        const seen = new Set<string>();
        for (const s of segs) {
            expect(seen.has(s.id)).toBe(false);
            seen.add(s.id);
        }
    });
});
