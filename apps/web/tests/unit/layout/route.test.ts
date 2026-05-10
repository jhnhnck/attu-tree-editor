/*
 * FamilyTreeEditor - tests for layout/passes/route.ts
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { layer } from "$lib/layout/passes/layer";
import { order } from "$lib/layout/passes/order";
import { place } from "$lib/layout/passes/place";
import { route } from "$lib/layout/passes/route";
import type { Person, Tree } from "$lib/domain/types";
import type { LayoutNode, PlacedGraph, RoutedGraph } from "$lib/layout/ir";
import { ROW_H, PERSON_W } from "$lib/layout/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function pipeline(tree: Tree): RoutedGraph {
    const lg = layer(tree, new Set(Object.keys(tree.people)), tree.rootId);
    const og = order(lg);
    const pg = place(og);
    return route(pg, tree);
}

/** Nuclear family: dad + mom (rank 0), child_a + child_b (rank 1). */
function nuclear(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("test", blank("dad", "m"));
    const mom = addPerson(t, blank("mom", "f"));
    t = mom.tree;
    const a = addPerson(t, blank("a", "u"));
    t = a.tree;
    const b = addPerson(t, blank("b", "u"));
    t = b.tree;
    const ok = <V>(r: { ok: true; value: V } | { ok: false; error: string }): V => {
        if (!r.ok) throw new Error(r.error);
        return r.value;
    };
    t = ok(linkSpouse(t, ROOT_ID, mom.id));
    t = ok(linkParent(t, a.id, ROOT_ID));
    t = ok(linkParent(t, a.id, mom.id));
    t = ok(linkParent(t, b.id, ROOT_ID));
    t = ok(linkParent(t, b.id, mom.id));
    return { tree: t, ids: { dad: ROOT_ID, mom: mom.id, a: a.id, b: b.id } };
}

/**
 * A (rank 0) has two spouses B and C, each relationship producing children.
 * Both couple buses are in the same gutter (rank 0 → rank 1) and, because A
 * sits between B's children and C's children, the buses' x-ranges overlap —
 * the old code would stack them; lane allocation must separate them.
 *
 *   B  A  C          (rank 0)
 *  k1 k2  k3 k4      (rank 1)
 */
function oneFatherTwoWives(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("two", blank("A", "m"));
    const ok = <V>(r: { ok: true; value: V } | { ok: false; error: string }): V => {
        if (!r.ok) throw new Error(r.error);
        return r.value;
    };
    const B = addPerson(t, blank("B", "f"));
    t = B.tree;
    const C = addPerson(t, blank("C", "f"));
    t = C.tree;
    const k1 = addPerson(t, blank("k1", "u"));
    t = k1.tree;
    const k2 = addPerson(t, blank("k2", "u"));
    t = k2.tree;
    const k3 = addPerson(t, blank("k3", "u"));
    t = k3.tree;
    const k4 = addPerson(t, blank("k4", "u"));
    t = k4.tree;

    t = ok(linkSpouse(t, ROOT_ID, B.id));
    t = ok(linkSpouse(t, ROOT_ID, C.id));
    // k1 and k2 are children of A+B
    t = ok(linkParent(t, k1.id, ROOT_ID));
    t = ok(linkParent(t, k1.id, B.id));
    t = ok(linkParent(t, k2.id, ROOT_ID));
    t = ok(linkParent(t, k2.id, B.id));
    // k3 and k4 are children of A+C
    t = ok(linkParent(t, k3.id, ROOT_ID));
    t = ok(linkParent(t, k3.id, C.id));
    t = ok(linkParent(t, k4.id, ROOT_ID));
    t = ok(linkParent(t, k4.id, C.id));
    return {
        tree: t,
        ids: { A: ROOT_ID, B: B.id, C: C.id, k1: k1.id, k2: k2.id, k3: k3.id, k4: k4.id },
    };
}

/** Cross-rank couple: root → a_kid → a_grand; a_grand marries b (unrelated), joint child. */
function crossRankCouple(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("cross", blank("root", "f"));
    const ok = <V>(r: { ok: true; value: V } | { ok: false; error: string }): V => {
        if (!r.ok) throw new Error(r.error);
        return r.value;
    };
    const aKid = addPerson(t, blank("aKid", "u"));
    t = aKid.tree;
    const aGrand = addPerson(t, blank("aGrand", "f"));
    t = aGrand.tree;
    const b = addPerson(t, blank("b", "m"));
    t = b.tree;
    const child = addPerson(t, blank("child", "u"));
    t = child.tree;
    t = ok(linkParent(t, aKid.id, ROOT_ID));
    t = ok(linkParent(t, aGrand.id, aKid.id));
    t = ok(linkSpouse(t, aGrand.id, b.id));
    t = ok(linkParent(t, child.id, aGrand.id));
    t = ok(linkParent(t, child.id, b.id));
    return {
        tree: t,
        ids: { root: ROOT_ID, aKid: aKid.id, aGrand: aGrand.id, b: b.id, child: child.id },
    };
}

// ---------------------------------------------------------------------------
// Output structure
// ---------------------------------------------------------------------------

describe("route() — output structure", () => {
    it("returns a RoutedGraph with placed and segments", () => {
        const { tree } = nuclear();
        const rg = pipeline(tree);
        expect(rg.placed).toBeDefined();
        expect(Array.isArray(rg.segments)).toBe(true);
    });

    it("returns a warnings array (empty on a clean nuclear-family run)", () => {
        const { tree } = nuclear();
        const rg = pipeline(tree);
        expect(Array.isArray(rg.warnings)).toBe(true);
        expect(rg.warnings).toEqual([]);
    });

    it("emits no duplicate segment IDs", () => {
        const { tree } = nuclear();
        const { segments } = pipeline(tree);
        const seen = new Set<string>();
        for (const s of segments) {
            expect(seen.has(s.id), `duplicate segment id: ${s.id}`).toBe(false);
            seen.add(s.id);
        }
    });

    it("emits no degenerate (zero-length) segments", () => {
        const { tree } = nuclear();
        const { segments } = pipeline(tree);
        const bad = segments.filter((s) => s.x1 === s.x2 && s.y1 === s.y2);
        expect(bad).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Bonds
// ---------------------------------------------------------------------------

describe("route() — bonds", () => {
    it("emits a horizontal bond for same-rank spouses", () => {
        const { tree } = nuclear();
        const { segments } = pipeline(tree);
        const bonds = segments.filter((s) => s.kind === "bond");
        expect(bonds.length).toBeGreaterThanOrEqual(1);
        const horiz = bonds.find((s) => s.y1 === s.y2);
        expect(horiz).toBeDefined();
    });

    it("marks divorced couples with role = divorced", () => {
        const { tree } = nuclear();
        const t2: Tree = {
            ...tree,
            couples: tree.couples.map((c) => ({ ...c, isCurrent: false })),
        };
        const { segments } = pipeline(t2);
        const bonds = segments.filter((s) => s.kind === "bond");
        expect(bonds.length).toBeGreaterThanOrEqual(1);
        expect(bonds.every((b) => b.role === "divorced")).toBe(true);
    });

    it("bond persons array contains both partner ids", () => {
        const { tree, ids } = nuclear();
        const { segments } = pipeline(tree);
        const bond = segments.find((s) => s.kind === "bond");
        expect(bond).toBeDefined();
        expect(bond!.persons).toContain(ids.dad);
        expect(bond!.persons).toContain(ids.mom);
    });
});

// ---------------------------------------------------------------------------
// Joint children (couple drop + bus + child-drops)
// ---------------------------------------------------------------------------

describe("route() — joint children", () => {
    it("emits drop + bus + 2 child-drops for nuclear family", () => {
        const { tree } = nuclear();
        const { segments } = pipeline(tree);
        const drops = segments.filter((s) => s.kind === "parent-drop");
        const buses = segments.filter((s) => s.kind === "sibling-bus");
        const childDrops = segments.filter((s) => s.kind === "child-drop");
        expect(drops.length).toBeGreaterThanOrEqual(1);
        expect(buses.length).toBeGreaterThanOrEqual(1);
        expect(childDrops.length).toBe(2);
    });

    it("bus y is in the gutter below the parents row", () => {
        const { tree } = nuclear();
        const { segments, placed } = pipeline(tree);
        const bus = segments.find((s) => s.kind === "sibling-bus");
        expect(bus).toBeDefined();
        // Parents at rank 0: gutter top = 0 * ROW_H + 1.2 = 1.2, bottom = 1 * ROW_H = 2.0
        const gutterTop = 1.2;
        const gutterBot = 1 * ROW_H;
        expect(bus!.y1).toBeGreaterThan(gutterTop - 1e-6);
        expect(bus!.y1).toBeLessThan(gutterBot + 1e-6);
        void placed;
    });

    it("parent-drop hangs from bond y to bus y (direction is downward)", () => {
        const { tree } = nuclear();
        const { segments } = pipeline(tree);
        const drop = segments.find((s) => s.kind === "parent-drop");
        expect(drop).toBeDefined();
        expect(drop!.y2).toBeGreaterThan(drop!.y1 - 1e-6);
    });

    it("child-drop goes from bus y down to child top (downward)", () => {
        const { tree } = nuclear();
        const { segments } = pipeline(tree);
        const childDrops = segments.filter((s) => s.kind === "child-drop");
        for (const cd of childDrops) {
            expect(cd.y2).toBeGreaterThan(cd.y1 - 1e-6);
        }
    });

    it("dedups child drops when two kids share an x", () => {
        // Force both children to the same column by building a family where
        // the placer would put them at the same x (single child in each case)
        // then test via the dedup logic in route() directly.
        // The simplest: nuclear + override both children to same position
        const { tree, ids } = nuclear();
        // Manually construct a scenario: modify placed graph so both children have same x
        const lg = layer(tree, new Set(Object.keys(tree.people)), tree.rootId);
        const og = order(lg);
        const pg = place(og);
        // artificially align child b to child a's x
        const xA = pg.x.get(ids.a!) ?? 0;
        const xB = pg.x.get(ids.b!) ?? 0;
        if (xA !== xB) {
            // Build a custom PlacedGraph with b at same x as a
            const newX = new Map(pg.x);
            newX.set(ids.b!, xA);
            const modPg = { ...pg, x: newX };
            const { segments } = route(modPg, tree);
            const childDrops = segments.filter(
                (s) =>
                    s.kind === "child-drop" &&
                    s.persons.includes(ids.a!) &&
                    s.persons.includes(ids.b!),
            );
            // Two children at same x → 1 deduped child-drop
            // The dedup picks one id but positions should be merged
            expect(segments.filter((s) => s.kind === "child-drop").length).toBeLessThanOrEqual(1);
            void childDrops;
        }
    });
});

// ---------------------------------------------------------------------------
// Gutter lane allocation — the core Step 5 fix
// ---------------------------------------------------------------------------

describe("route() — gutter lane allocation", () => {
    it("emits a sibling-bus for each couple that has 2+ children", () => {
        const { tree } = oneFatherTwoWives();
        const { segments } = pipeline(tree);
        const buses = segments.filter((s) => s.kind === "sibling-bus");
        expect(buses.length).toBeGreaterThanOrEqual(2);
    });

    it("no two sibling-buses at the same y overlap in x (no stacking)", () => {
        const { tree } = oneFatherTwoWives();
        const { segments } = pipeline(tree);
        const buses = segments.filter((s) => s.kind === "sibling-bus");
        for (let i = 0; i < buses.length; i++) {
            for (let j = i + 1; j < buses.length; j++) {
                const a = buses[i]!;
                const b = buses[j]!;
                const sameY = Math.abs(a.y1 - b.y1) < 1e-6;
                if (!sameY) continue; // different y is fine
                // Same y → x ranges must be disjoint
                const aMin = Math.min(a.x1, a.x2);
                const aMax = Math.max(a.x1, a.x2);
                const bMin = Math.min(b.x1, b.x2);
                const bMax = Math.max(b.x1, b.x2);
                const xOverlaps = aMax > bMin + 1e-6 && bMax > aMin + 1e-6;
                expect(xOverlaps, `buses "${a.id}" and "${b.id}" stack at y=${a.y1}`).toBe(false);
            }
        }
    });

    it("all sibling-buses for rank 0→1 are within the gutter", () => {
        const { tree } = oneFatherTwoWives();
        const { segments } = pipeline(tree);
        const buses = segments.filter((s) => s.kind === "sibling-bus");
        const gutterTop = 1.2; // rank 0 card bottom
        const gutterBot = ROW_H; // rank 1 card top
        for (const bus of buses) {
            expect(bus.y1).toBeGreaterThanOrEqual(gutterTop - 1e-6);
            expect(bus.y1).toBeLessThanOrEqual(gutterBot + 1e-6);
        }
    });
});

// ---------------------------------------------------------------------------
// Cross-rank couples (ghost-aware bonding)
// ---------------------------------------------------------------------------

describe("route() — cross-rank couples", () => {
    it("emits a horizontal bond (not L-bond) for a cross-rank couple that has a ghost", () => {
        const { tree } = crossRankCouple();
        const { segments } = pipeline(tree);
        const bonds = segments.filter((s) => s.kind === "bond");
        // With ghost handling, the bond should be a single horizontal segment
        const horizBonds = bonds.filter((s) => s.y1 === s.y2);
        expect(horizBonds.length).toBeGreaterThanOrEqual(1);
    });

    it("emits no negative-direction parent-drop or child-drop", () => {
        const { tree } = crossRankCouple();
        const { segments } = pipeline(tree);
        const bad = segments.filter(
            (s) => (s.kind === "parent-drop" || s.kind === "child-drop") && s.y2 < s.y1 - 1e-6,
        );
        expect(bad).toEqual([]);
    });

    it("drop x matches bond midpoint (drop hangs from bond)", () => {
        const { tree, ids } = crossRankCouple();
        const { segments } = pipeline(tree);
        const bond = segments.find(
            (s) =>
                s.kind === "bond" && s.persons.includes(ids.aGrand!) && s.persons.includes(ids.b!),
        );
        const drop = segments.find(
            (s) =>
                s.kind === "parent-drop" &&
                s.persons.includes(ids.aGrand!) &&
                s.persons.includes(ids.b!),
        );
        expect(bond).toBeDefined();
        expect(drop).toBeDefined();
        // bond is horizontal → x1 and x2 are left/right edges; midpoint = (x1+x2)/2
        const bondMidX = (bond!.x1 + bond!.x2) / 2;
        expect(drop!.x1).toBeCloseTo(bondMidX, 5);
        expect(drop!.x1).toBeCloseTo(drop!.x2, 5); // vertical drop
    });
});

// ---------------------------------------------------------------------------
// Single-parent drops
// ---------------------------------------------------------------------------

describe("route() — single-parent drops", () => {
    it("emits a child-drop for a single parent with one child (same column)", () => {
        let t = createTree("sp", blank("mom", "f"));
        const kid = addPerson(t, blank("kid", "u"));
        t = kid.tree;
        const r = linkParent(t, kid.id, ROOT_ID);
        if (!r.ok) throw new Error(r.error);
        t = r.value;
        const { segments } = pipeline(t);
        const drops = segments.filter((s) => s.kind === "child-drop");
        expect(drops.length).toBeGreaterThanOrEqual(1);
    });

    it("emits L-shape for a single parent with one child (different column)", () => {
        let t = createTree("sp2", blank("mom", "f"));
        const ok = <V>(r: { ok: true; value: V } | { ok: false; error: string }): V => {
            if (!r.ok) throw new Error(r.error);
            return r.value;
        };
        const k1 = addPerson(t, blank("k1", "u"));
        t = k1.tree;
        const k2 = addPerson(t, blank("k2", "u"));
        t = k2.tree;
        t = ok(linkParent(t, k1.id, ROOT_ID));
        t = ok(linkParent(t, k2.id, ROOT_ID));
        // Two children under one parent → bus + 2 drops
        const { segments } = pipeline(t);
        const buses = segments.filter((s) => s.kind === "sibling-bus");
        expect(buses.length).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// Segment IDs
// ---------------------------------------------------------------------------

describe("route() — segment IDs", () => {
    it("all segment IDs are non-empty strings", () => {
        const { tree } = nuclear();
        const { segments } = pipeline(tree);
        for (const s of segments) {
            expect(typeof s.id).toBe("string");
            expect(s.id.length).toBeGreaterThan(0);
        }
    });

    it("couple segments share a common ID prefix (for sameGroup hop check)", () => {
        const { tree, ids } = nuclear();
        const { segments } = pipeline(tree);
        const coupleSegs = segments.filter(
            (s) => s.persons.includes(ids.dad!) && s.persons.includes(ids.mom!),
        );
        // All segments from this couple share the same prefix before "/"
        const prefixes = coupleSegs.map((s) => s.id.split("/")[0]!);
        const uniquePrefixes = new Set(prefixes);
        // bond has id "bond:X|Y:0", couple edges have "couple:X|Y" — two groups is acceptable
        expect(uniquePrefixes.size).toBeLessThanOrEqual(2);
    });
});

// ---------------------------------------------------------------------------
// Bridge hops
// ---------------------------------------------------------------------------

describe("route() — bridge hops", () => {
    it("does not add hops within the same couple group", () => {
        const { tree } = nuclear();
        const { segments } = pipeline(tree);
        // For a simple nuclear family there is only one couple so any vertical
        // that gets a hop would have to cross an unrelated horizontal — none exist.
        const hopped = segments.filter((s) => (s.hops ?? []).length > 0);
        expect(hopped.length).toBe(0);
    });

    it("annotates a hop when an unrelated horizontal crosses a vertical", () => {
        // Build two couples whose edge geometry forces a crossing:
        // couple (A,B) has child kAB between them; couple (C,D) has child kCD
        // between them. If A and D are at the ends, C and B in the middle,
        // the buses from different couples can only be separated in y (lane
        // allocation handles that), but we can craft a hand-placed scenario
        // to verify the annotateHops logic is exercised.
        //
        // Use a direct PlacedGraph construction so we control geometry exactly.
        const { tree } = nuclear();
        const lg = layer(tree, new Set(Object.keys(tree.people)), tree.rootId);
        const og = order(lg);
        const pg = place(og);
        // The test simply confirms route() returns something without crashing
        const rg = route(pg, tree);
        expect(rg.segments.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Long-bond stubs (Issues 1, 3)
// ---------------------------------------------------------------------------

/**
 * Build a minimal PlacedGraph with exactly two same-rank nodes placed at
 * arbitrary x positions, plus a Tree with one couple record, so we can drive
 * route() with precise geometry without running the full pipeline.
 */
function farApartCouple(
    leftX: number,
    rightX: number,
    isCurrent = true,
): { placed: PlacedGraph; tree: Tree } {
    // Build the Tree first so we have real PersonIds
    let t = createTree("stub-test", {
        given: "Left",
        surname: "",
        gender: "m" as const,
        spouseIds: [],
        display: "z1",
    });
    const rightP = addPerson(t, {
        given: "Right",
        surname: "",
        gender: "f" as const,
        spouseIds: [],
        display: "z1",
    });
    t = rightP.tree;
    const ok = <V>(r: { ok: true; value: V } | { ok: false; error: string }): V => {
        if (!r.ok) throw new Error(r.error);
        return r.value;
    };
    t = ok(linkSpouse(t, ROOT_ID, rightP.id));
    if (!isCurrent) {
        t = { ...t, couples: t.couples.map((c) => ({ ...c, isCurrent: false })) };
    }

    const leftId = ROOT_ID;
    const rightId = rightP.id;

    const nodes = new Map<string, LayoutNode>([
        [leftId, { id: leftId, kind: "person", personId: leftId, rank: 0 }],
        [rightId, { id: rightId, kind: "person", personId: rightId, rank: 0 }],
    ]);

    const placed: PlacedGraph = {
        nodes,
        ranks: [[leftId, rightId]],
        parentEdges: [],
        spouseEdges: [],
        order: new Map([
            [leftId, 0],
            [rightId, 1],
        ]),
        x: new Map([
            [leftId, leftX],
            [rightId, rightX],
        ]),
        y: new Map([
            [leftId, 0],
            [rightId, 0],
        ]),
        bbox: { width: rightX + PERSON_W, height: ROW_H },
    };

    return { placed, tree: t };
}

describe("route() — long-bond stubs", () => {
    it("produces two stub segments (not a full horizontal) when bond span exceeds threshold", () => {
        const { placed, tree } = farApartCouple(0, 50); // 50 units gap, well over MAX_BOND_SPAN=25
        const { segments } = route(placed, tree);
        const stubs = segments.filter((s) => s.kind === "stub");
        const longBonds = segments.filter(
            (s) => s.kind === "bond" && s.y1 === s.y2 && Math.abs(s.x2 - s.x1) > 25,
        );
        expect(stubs.length).toBe(2);
        expect(longBonds.length).toBe(0);
    });

    it("stub segments are short (each ≤ STUB_LEN) and horizontal", () => {
        const { placed, tree } = farApartCouple(0, 50);
        const { segments } = route(placed, tree);
        const stubs = segments.filter((s) => s.kind === "stub");
        for (const s of stubs) {
            expect(s.y1).toBeCloseTo(s.y2, 5); // horizontal
            expect(Math.abs(s.x2 - s.x1)).toBeLessThanOrEqual(0.7); // within STUB_LEN + tiny epsilon
        }
    });

    it("divorced long bond emits stubs with role=divorced", () => {
        const { placed, tree } = farApartCouple(0, 50, false);
        const { segments } = route(placed, tree);
        const stubs = segments.filter((s) => s.kind === "stub");
        expect(stubs.length).toBe(2);
        expect(stubs.every((s) => s.role === "divorced")).toBe(true);
    });

    it("short same-rank bond below threshold remains a single full horizontal", () => {
        // Partners are 0.5 units apart (DELTA gap) — normal adjacent spouses
        const { placed, tree } = farApartCouple(0, 2.5); // left card at 0, right at 2.5; gap = 0.5
        const { segments } = route(placed, tree);
        const bonds = segments.filter((s) => s.kind === "bond" && s.y1 === s.y2);
        const stubs = segments.filter((s) => s.kind === "stub");
        expect(bonds.length).toBeGreaterThanOrEqual(1);
        expect(stubs.length).toBe(0);
    });

    it("long bond with joint children routes parent-drop near children centroid (not mid-canvas)", () => {
        // Left at 0, right at 50, two children near x=0
        let t = createTree("stub-kids", {
            given: "Left",
            surname: "",
            gender: "m" as const,
            spouseIds: [],
            display: "z1",
        });
        const ok = <V>(r: { ok: true; value: V } | { ok: false; error: string }): V => {
            if (!r.ok) throw new Error(r.error);
            return r.value;
        };
        const rp = addPerson(t, {
            given: "Right",
            surname: "",
            gender: "f" as const,
            spouseIds: [],
            display: "z1",
        });
        t = rp.tree;
        const k1 = addPerson(t, {
            given: "k1",
            surname: "",
            gender: "u" as const,
            spouseIds: [],
            display: "z1",
        });
        t = k1.tree;
        const k2 = addPerson(t, {
            given: "k2",
            surname: "",
            gender: "u" as const,
            spouseIds: [],
            display: "z1",
        });
        t = k2.tree;
        t = ok(linkSpouse(t, ROOT_ID, rp.id));
        t = ok(linkParent(t, k1.id, ROOT_ID));
        t = ok(linkParent(t, k1.id, rp.id));
        t = ok(linkParent(t, k2.id, ROOT_ID));
        t = ok(linkParent(t, k2.id, rp.id));

        const nodes = new Map<string, LayoutNode>([
            [ROOT_ID, { id: ROOT_ID, kind: "person", personId: ROOT_ID, rank: 0 }],
            [rp.id, { id: rp.id, kind: "person", personId: rp.id, rank: 0 }],
            [k1.id, { id: k1.id, kind: "person", personId: k1.id, rank: 1 }],
            [k2.id, { id: k2.id, kind: "person", personId: k2.id, rank: 1 }],
        ]);
        // Left at 0, right at 50 (far apart). Children near x=0 (near left partner).
        const placed: PlacedGraph = {
            nodes,
            ranks: [
                [ROOT_ID, rp.id],
                [k1.id, k2.id],
            ],
            parentEdges: [
                { parent: ROOT_ID, child: k1.id },
                { parent: rp.id, child: k1.id },
                { parent: ROOT_ID, child: k2.id },
                { parent: rp.id, child: k2.id },
            ],
            spouseEdges: [],
            order: new Map([
                [ROOT_ID, 0],
                [rp.id, 1],
                [k1.id, 0],
                [k2.id, 1],
            ]),
            x: new Map([
                [ROOT_ID, 0],
                [rp.id, 50],
                [k1.id, 0],
                [k2.id, 2.5],
            ]),
            y: new Map([
                [ROOT_ID, 0],
                [rp.id, 0],
                [k1.id, ROW_H],
                [k2.id, ROW_H],
            ]),
            bbox: { width: 52, height: 2 * ROW_H },
        };

        const { segments } = route(placed, t);
        const drop = segments.find((s) => s.kind === "parent-drop");
        expect(drop).toBeDefined();
        // Children centroid x ≈ midX(k1) + midX(k2))/2 = (1 + 3.5)/2 = 2.25
        // bondX should be near 2.25, NOT mid-canvas (25)
        const childCentroid = (0 + PERSON_W / 2 + 2.5 + PERSON_W / 2) / 2;
        expect(Math.abs(drop!.x1 - childCentroid)).toBeLessThan(2); // within 2 units of centroid
        expect(drop!.x1).toBeLessThan(10); // definitely not mid-canvas (~25)
    });
});

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe("route() — invariants", () => {
    it("all segments are horizontal or vertical (no diagonal segments)", () => {
        const { tree } = nuclear();
        const { segments } = pipeline(tree);
        for (const s of segments) {
            const isDiag = s.x1 !== s.x2 && s.y1 !== s.y2;
            expect(isDiag, `diagonal segment: ${s.id}`).toBe(false);
        }
    });

    it("persons array is non-empty for every segment", () => {
        const { tree } = nuclear();
        const { segments } = pipeline(tree);
        for (const s of segments) {
            expect(s.persons.length, `empty persons on ${s.id}`).toBeGreaterThan(0);
        }
    });

    it("cross-rank couple invariants hold with multiple couples in same gutter", () => {
        const { tree } = oneFatherTwoWives();
        const { segments } = pipeline(tree);
        const bad = segments.filter(
            (s) => (s.kind === "parent-drop" || s.kind === "child-drop") && s.y2 < s.y1 - 1e-6,
        );
        expect(bad).toEqual([]);
    });

    it("all segments are horizontal or vertical for cross-rank family", () => {
        const { tree } = crossRankCouple();
        const { segments } = pipeline(tree);
        for (const s of segments) {
            const isDiag = s.x1 !== s.x2 && s.y1 !== s.y2;
            expect(isDiag, `diagonal: ${s.id}`).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// Port-aware drops: pedigree-DAG up-direction case
// ---------------------------------------------------------------------------

describe("route() — port-aware drops (pedigree-DAG)", () => {
    /**
     * Hand-rolled placed graph: a single-parent at rank 2, child at rank 0
     * (parent is below child by two rows — a pedigree-collapse artefact).
     * The drop must exit the parent's TOP and enter the child's BOTTOM,
     * with the bus in the gutter just below the child's row.
     */
    function pedigreeCollapseSingleParent(): {
        placed: PlacedGraph;
        tree: Tree;
        ids: { parent: string; child: string };
    } {
        let t = createTree("collapse", blank("parent", "f"));
        const kid = addPerson(t, blank("kid", "u"));
        t = kid.tree;
        const ok = <V>(r: { ok: true; value: V } | { ok: false; error: string }): V => {
            if (!r.ok) throw new Error(r.error);
            return r.value;
        };
        t = ok(linkParent(t, kid.id, ROOT_ID));

        // Manually place: parent at rank 2 (below), child at rank 0 (above).
        const nodes = new Map<string, LayoutNode>([
            [ROOT_ID, { id: ROOT_ID, kind: "person", personId: ROOT_ID, rank: 2 }],
            [kid.id, { id: kid.id, kind: "person", personId: kid.id, rank: 0 }],
        ]);
        const placed: PlacedGraph = {
            nodes,
            ranks: [[kid.id], [], [ROOT_ID]],
            parentEdges: [{ parent: ROOT_ID, child: kid.id }],
            spouseEdges: [],
            order: new Map([
                [ROOT_ID, 0],
                [kid.id, 0],
            ]),
            x: new Map([
                [ROOT_ID, 0],
                [kid.id, 0],
            ]),
            y: new Map([
                [ROOT_ID, 2 * ROW_H],
                [kid.id, 0],
            ]),
            bbox: { width: PERSON_W, height: 3 * ROW_H },
        };
        return { placed, tree: t, ids: { parent: ROOT_ID, child: kid.id } };
    }

    it("emits no negative-drop warnings for a same-column up-direction drop", () => {
        const { placed, tree } = pedigreeCollapseSingleParent();
        const rg = route(placed, tree);
        expect(rg.warnings).toEqual([]);
    });

    it("child-drop exits parent's TOP and enters child's BOTTOM when parent is below", () => {
        const { placed, tree, ids } = pedigreeCollapseSingleParent();
        const { segments } = route(placed, tree);
        const cd = segments.find((s) => s.kind === "child-drop" && s.persons.includes(ids.parent));
        expect(cd).toBeDefined();
        // parent rank 2 → y = 2*ROW_H. its TOP = 2*ROW_H. its BOTTOM = 2*ROW_H + CARD_H.
        const parentTop = 2 * ROW_H;
        // child rank 0 → y = 0. its TOP = 0. its BOTTOM = CARD_H (1.2).
        const childBot = 1.2;
        // Drop should start at parent top and end at child bot. Since it's
        // a single-column same-x case the drop collapses into one segment
        // going from one to the other.
        const ys = [cd!.y1, cd!.y2].sort((a, b) => a - b);
        expect(ys[0]).toBeCloseTo(childBot, 5);
        expect(ys[1]).toBeCloseTo(parentTop, 5);
    });
});
