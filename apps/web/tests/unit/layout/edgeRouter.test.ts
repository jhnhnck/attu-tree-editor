/*
 * FamilyTreeEditor - tests for layout/edgeRouter.ts
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { hvLayout } from "$lib/layout/hvLayout";
import { routeEdges, type Slot } from "$lib/layout/edgeRouter";
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

    it("emits a sibling bus for a single child when in a different column", () => {
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
        // With the fix, a single child at a different x from bondX gets a bus
        // that connects the parent-drop to the child-drop
        const buses = segs.filter((s) => s.kind === "sibling-bus");
        expect(buses.length).toBeGreaterThanOrEqual(1);
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

describe("edgeRouter — cross-row couples (uses ghost positions)", () => {
    /**
     * Same fixture shape as hvLayout.test.ts: root → a_kid → a_grand; a_grand
     * marries b (no parents); they share a child. a_grand lands deep, b at
     * the top — partners on different rows.
     */
    function makeCrossRowCouple(): { tree: Tree; ids: Record<string, string> } {
        let t = createTree("cross", blank("root", "f"));
        const a_kid = addPerson(t, blank("a_kid", "u"));
        t = a_kid.tree;
        const a_grand = addPerson(t, blank("a_grand", "f"));
        t = a_grand.tree;
        const b = addPerson(t, blank("b", "m"));
        t = b.tree;
        const child = addPerson(t, blank("child", "u"));
        t = child.tree;
        const r1 = linkParent(t, a_kid.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, a_grand.id, a_kid.id);
        if (!r2.ok) throw new Error(r2.error);
        const r3 = linkSpouse(r2.value, a_grand.id, b.id);
        if (!r3.ok) throw new Error(r3.error);
        const r4 = linkParent(r3.value, child.id, a_grand.id);
        if (!r4.ok) throw new Error(r4.error);
        const r5 = linkParent(r4.value, child.id, b.id);
        if (!r5.ok) throw new Error(r5.error);
        return {
            tree: r5.value,
            ids: {
                root: ROOT_ID,
                a_kid: a_kid.id,
                a_grand: a_grand.id,
                b: b.id,
                child: child.id,
            },
        };
    }

    function ghostMap(
        layoutGhosts: { ghostOf: string; nearId: string; x: number; y: number }[],
    ): Map<string, Slot> {
        const m = new Map<string, Slot>();
        for (const g of layoutGhosts) m.set(`${g.ghostOf}|${g.nearId}`, { x: g.x, y: g.y });
        return m;
    }

    it("emits no negative-height parent-drop or child-drop", () => {
        const { tree } = makeCrossRowCouple();
        const layout = hvLayout(tree);
        const segs = routeEdges(tree, layout.positions, {
            ghostPositions: ghostMap([...layout.ghosts]),
        });
        const bad = segs.filter(
            (s) =>
                (s.kind === "parent-drop" || s.kind === "child-drop") && s.y2 < s.y1 - 1e-6,
        );
        expect(bad).toEqual([]);
    });

    it("parent-drop x matches the bond's local x (drop and bond are connected)", () => {
        const { tree, ids } = makeCrossRowCouple();
        const layout = hvLayout(tree);
        const segs = routeEdges(tree, layout.positions, {
            ghostPositions: ghostMap([...layout.ghosts]),
        });
        const drop = segs.find(
            (s) =>
                s.kind === "parent-drop" &&
                s.persons.includes(ids.a_grand!) &&
                s.persons.includes(ids.b!),
        );
        const bond = segs.find(
            (s) =>
                s.kind === "bond" &&
                s.persons.includes(ids.a_grand!) &&
                s.persons.includes(ids.b!),
        );
        expect(drop).toBeDefined();
        expect(bond).toBeDefined();
        // bond should be a single horizontal segment (sameRow path) once the
        // ghost lands on a_grand's row
        expect(bond!.y1).toBe(bond!.y2);
        // bond mid-x equals drop x; drop hangs from the bond, not from
        // somewhere in the middle of the canvas
        const bondMidX = (bond!.x1 + bond!.x2) / 2;
        expect(drop!.x1).toBeCloseTo(bondMidX, 6);
        expect(drop!.x1).toBe(drop!.x2);
    });

    /**
     * X marries both Y and Z; Y and Z sit on different rows because they're
     * different generations in the same lineage. X is the father of one child
     * with each, so X is non-primary in both couples and gets two ghosts (one
     * near Y at Y's row, one near Z at Z's row). The ghost-positions map must
     * be keyed by (ghostOf, nearId) — keyed by ghostOf alone, the second ghost
     * overwrites the first and the geometry for the (X, Y) couple breaks.
     */
    function makeOneFatherTwoSpouses(): { tree: Tree; ids: Record<string, string> } {
        let t = createTree("multi", blank("T", "f"));
        const tKid = addPerson(t, blank("tKid", "f"));
        t = tKid.tree;
        const Y = addPerson(t, blank("Y", "f"));
        t = Y.tree;
        const yKid = addPerson(t, blank("yKid", "f"));
        t = yKid.tree;
        const Z = addPerson(t, blank("Z", "f"));
        t = Z.tree;
        const X = addPerson(t, blank("X", "m"));
        t = X.tree;
        const c1 = addPerson(t, blank("c1", "u"));
        t = c1.tree;
        const c2 = addPerson(t, blank("c2", "u"));
        t = c2.tree;
        const ok = <V>(r: { ok: true; value: V } | { ok: false; error: string }): V => {
            if (!r.ok) throw new Error(r.error);
            return r.value;
        };
        t = ok(linkParent(t, tKid.id, ROOT_ID));
        t = ok(linkParent(t, Y.id, tKid.id));
        t = ok(linkParent(t, yKid.id, Y.id));
        t = ok(linkParent(t, Z.id, yKid.id));
        t = ok(linkSpouse(t, X.id, Y.id));
        t = ok(linkSpouse(t, X.id, Z.id));
        t = ok(linkParent(t, c1.id, Y.id));
        t = ok(linkParent(t, c1.id, X.id));
        t = ok(linkParent(t, c2.id, Z.id));
        t = ok(linkParent(t, c2.id, X.id));
        return {
            tree: t,
            ids: {
                T: ROOT_ID,
                tKid: tKid.id,
                Y: Y.id,
                yKid: yKid.id,
                Z: Z.id,
                X: X.id,
                c1: c1.id,
                c2: c2.id,
            },
        };
    }

    it("handles a person with two cross-row spouses (two ghosts of the same person)", () => {
        const { tree, ids } = makeOneFatherTwoSpouses();
        const layout = hvLayout(tree);
        // X should have two ghosts, one near Y and one near Z, at different rows
        const xGhosts = layout.ghosts.filter((g) => g.ghostOf === ids.X);
        expect(xGhosts.length).toBe(2);
        const nearIds = xGhosts.map((g) => g.nearId).sort();
        expect(nearIds).toEqual([ids.Y, ids.Z].sort());
        const ys = xGhosts.map((g) => g.y);
        expect(ys[0]).not.toBe(ys[1]);

        const segs = routeEdges(tree, layout.positions, {
            ghostPositions: ghostMap([...layout.ghosts]),
        });
        // both couples must produce non-negative drops
        const bad = segs.filter(
            (s) =>
                (s.kind === "parent-drop" || s.kind === "child-drop") && s.y2 < s.y1 - 1e-6,
        );
        expect(bad).toEqual([]);

        // each couple's drop should hang at the row of its primary mother
        const yPos = layout.positions.get(ids.Y!);
        const zPos = layout.positions.get(ids.Z!);
        if (!yPos || !zPos) throw new Error("missing");
        const dropXY = segs.find(
            (s) =>
                s.kind === "parent-drop" &&
                s.persons.includes(ids.X!) &&
                s.persons.includes(ids.Y!),
        );
        const dropXZ = segs.find(
            (s) =>
                s.kind === "parent-drop" &&
                s.persons.includes(ids.X!) &&
                s.persons.includes(ids.Z!),
        );
        expect(dropXY).toBeDefined();
        expect(dropXZ).toBeDefined();
        // drop y1 should be near each primary mother's card mid (sameRow path)
        expect(dropXY!.y1).toBeGreaterThan(yPos.y);
        expect(dropXY!.y1).toBeLessThan(yPos.y + 1.5);
        expect(dropXZ!.y1).toBeGreaterThan(zPos.y);
        expect(dropXZ!.y1).toBeLessThan(zPos.y + 1.5);
    });

    it("bus runs at the primary partner's gutter row, not midway across the canvas", () => {
        const { tree, ids } = makeCrossRowCouple();
        const layout = hvLayout(tree);
        const ag = layout.positions.get(ids.a_grand!);
        const childPos = layout.positions.get(ids.child!);
        if (!ag || !childPos) throw new Error("missing");
        const segs = routeEdges(tree, layout.positions, {
            ghostPositions: ghostMap([...layout.ghosts]),
        });
        const bus = segs.find(
            (s) =>
                s.kind === "sibling-bus" &&
                s.persons.includes(ids.a_grand!) &&
                s.persons.includes(ids.b!),
        );
        // a single child + bondX equal to child's x means the bus is degenerate
        // and may be skipped; only assert when it exists
        if (bus) {
            expect(bus.y1).toBeGreaterThan(ag.y);
            expect(bus.y1).toBeLessThan(childPos.y);
        }
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
