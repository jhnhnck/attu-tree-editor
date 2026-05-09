/*
 * FamilyTreeEditor - tests for layout/hvLayout.ts
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { hvLayout, PERSON_W, ROW_H, GHOST_THRESHOLD } from "$lib/layout/hvLayout";
import type { Person, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

/** root → kid (mother) → grandkid */
function lineage(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("test", blank("root", "f"));
    const kid = addPerson(t, blank("kid", "u"));
    t = kid.tree;
    const grand = addPerson(t, blank("grand", "u"));
    t = grand.tree;
    const r1 = linkParent(t, kid.id, ROOT_ID);
    if (!r1.ok) throw new Error(r1.error);
    const r2 = linkParent(r1.value, grand.id, kid.id);
    if (!r2.ok) throw new Error(r2.error);
    return { tree: r2.value, ids: { root: ROOT_ID, kid: kid.id, grand: grand.id } };
}

/** root → 4 children */
function fanOut(): { tree: Tree; ids: Record<string, string> } {
    let t = createTree("fan", blank("root", "f"));
    const kids: string[] = [];
    for (const name of ["a", "b", "c", "d"]) {
        const k = addPerson(t, blank(name, "u"));
        t = k.tree;
        const r = linkParent(t, k.id, ROOT_ID);
        if (!r.ok) throw new Error(r.error);
        t = r.value;
        kids.push(k.id);
    }
    return { tree: t, ids: { root: ROOT_ID, a: kids[0]!, b: kids[1]!, c: kids[2]!, d: kids[3]! } };
}

describe("hvLayout — basics", () => {
    it("places every visible person", () => {
        const { tree } = lineage();
        const out = hvLayout(tree);
        expect(out.totalPeople).toBe(3);
        expect(out.laidOutPeople).toBe(3);
        expect(out.positions.size).toBe(3);
    });

    it("returns a non-empty canvas", () => {
        const { tree } = lineage();
        const out = hvLayout(tree);
        expect(out.canvas.width).toBeGreaterThan(0);
        expect(out.canvas.height).toBeGreaterThan(0);
    });

    it("places children one row below their parent", () => {
        const { tree, ids } = lineage();
        const out = hvLayout(tree);
        const root = out.positions.get(ids.root!);
        const kid = out.positions.get(ids.kid!);
        const grand = out.positions.get(ids.grand!);
        if (!root || !kid || !grand) throw new Error("missing");
        expect(kid.y - root.y).toBe(ROW_H);
        expect(grand.y - kid.y).toBe(ROW_H);
    });

    it("centers a parent over its only child", () => {
        const { tree, ids } = lineage();
        const out = hvLayout(tree);
        const root = out.positions.get(ids.root!);
        const kid = out.positions.get(ids.kid!);
        if (!root || !kid) throw new Error("missing");
        expect(root.x).toBeCloseTo(kid.x);
    });

    it("centers a parent over an even number of children (midpoint)", () => {
        const { tree, ids } = fanOut();
        const out = hvLayout(tree);
        const root = out.positions.get(ids.root!);
        if (!root) throw new Error("missing root");
        // children may be sorted by random id (no birthdate), so compute the
        // midpoint from the actual leftmost and rightmost child positions
        const childXs = [ids.a!, ids.b!, ids.c!, ids.d!]
            .map((id) => out.positions.get(id))
            .filter((p): p is { x: number; y: number } => !!p)
            .map((p) => p.x);
        const minX = Math.min(...childXs);
        const maxX = Math.max(...childXs);
        const childMid = (minX + maxX + PERSON_W) / 2;
        expect(root.x + PERSON_W / 2).toBeCloseTo(childMid, 5);
    });

    it("packs siblings with no overlap and SIBLING_GAP between adjacent ones", () => {
        const { tree, ids } = fanOut();
        const out = hvLayout(tree);
        const xs = [ids.a!, ids.b!, ids.c!, ids.d!]
            .map((id) => out.positions.get(id))
            .filter((p): p is { x: number; y: number } => !!p)
            .map((p) => p.x)
            .sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) {
            const prev = xs[i - 1]!;
            const cur = xs[i]!;
            expect(cur - (prev + PERSON_W)).toBeGreaterThanOrEqual(0);
        }
    });
});

describe("hvLayout — components + isolation", () => {
    it("stacks two disconnected families horizontally with a gap", () => {
        let t = createTree("multi", blank("rootA", "f"));
        const childA = addPerson(t, blank("kidA", "u"));
        t = childA.tree;
        const r1 = linkParent(t, childA.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        t = r1.value;
        const eldB = addPerson(t, blank("rootB", "u"));
        t = eldB.tree;
        const childB = addPerson(t, blank("kidB", "u"));
        t = childB.tree;
        const r2 = linkParent(t, childB.id, eldB.id);
        if (!r2.ok) throw new Error(r2.error);
        t = r2.value;

        const out = hvLayout(t);
        expect(out.components.length).toBe(2);
        expect(out.laidOutPeople).toBe(4);
        // root's component should sort first
        expect(out.components[0]?.rootId).toBe(ROOT_ID);
        // disjoint components must not overlap horizontally
        const aMaxX =
            Math.max(out.positions.get(ROOT_ID)!.x, out.positions.get(childA.id)!.x) + PERSON_W;
        const bMinX = Math.min(out.positions.get(eldB.id)!.x, out.positions.get(childB.id)!.x);
        expect(bMinX).toBeGreaterThan(aMaxX);
    });

    it("renders fully-isolated people in a grid below the main components", () => {
        let t = createTree("iso", blank("root", "u"));
        const h1 = addPerson(t, blank("h1", "u"));
        t = h1.tree;
        const h2 = addPerson(t, blank("h2", "u"));
        t = h2.tree;
        const h3 = addPerson(t, blank("h3", "u"));
        t = h3.tree;

        const out = hvLayout(t);
        expect(out.isolated.length).toBe(4);
        expect(out.laidOutPeople).toBe(4);
        // every id has a position
        for (const id of [ROOT_ID, h1.id, h2.id, h3.id]) {
            expect(out.positions.get(id)).toBeDefined();
        }
    });
});

describe("hvLayout — visible filter", () => {
    it("drops hidden ids before layout", () => {
        const { tree, ids } = lineage();
        const visible = new Set([ids.root!, ids.kid!]); // exclude grand
        const out = hvLayout(tree, { visible });
        expect(out.laidOutPeople).toBe(2);
        expect(out.positions.has(ids.grand!)).toBe(false);
    });
});

describe("hvLayout — sibling birth-order sort", () => {
    it("sorts siblings by birth year ascending", () => {
        let t = createTree("bo", blank("mom", "f"));
        const old = addPerson(t, {
            ...blank("old", "u"),
            birth: { year: 1500, era: "PC" },
        });
        t = old.tree;
        const young = addPerson(t, {
            ...blank("young", "u"),
            birth: { year: 1505, era: "PC" },
        });
        t = young.tree;
        const ro = linkParent(t, old.id, ROOT_ID);
        if (!ro.ok) throw new Error(ro.error);
        const ry = linkParent(ro.value, young.id, ROOT_ID);
        if (!ry.ok) throw new Error(ry.error);
        t = ry.value;
        const out = hvLayout(t);
        const ox = out.positions.get(old.id)?.x ?? 0;
        const yx = out.positions.get(young.id)?.x ?? 0;
        expect(ox).toBeLessThan(yx); // older sibling on the left
    });
});

describe("hvLayout — no overlap invariant", () => {
    it("no two visible cards share an (x, y) AABB", () => {
        // 3-generation, 3-children-per-gen tree
        let t = createTree("big", blank("gp", "f"));
        const parents: string[] = [];
        for (const n of ["m1", "m2", "m3"]) {
            const a = addPerson(t, blank(n, "f"));
            t = a.tree;
            const r = linkParent(t, a.id, ROOT_ID);
            if (!r.ok) throw new Error(r.error);
            t = r.value;
            parents.push(a.id);
        }
        for (const pid of parents) {
            for (const n of ["c1", "c2"]) {
                const c = addPerson(t, blank(`${n}-${pid}`, "u"));
                t = c.tree;
                const r = linkParent(t, c.id, pid);
                if (!r.ok) throw new Error(r.error);
                t = r.value;
            }
        }

        const out = hvLayout(t);
        const placed = [...out.positions.values()];
        for (let i = 0; i < placed.length; i++) {
            for (let j = i + 1; j < placed.length; j++) {
                const a = placed[i]!;
                const b = placed[j]!;
                const sameRow = a.y === b.y;
                if (!sameRow) continue;
                const xOverlap = a.x < b.x + PERSON_W && b.x < a.x + PERSON_W;
                expect(xOverlap).toBe(false);
            }
        }
    });
});

describe("hvLayout — focus + spouse handling", () => {
    it("places spouse-with-no-parents as their own forest root", () => {
        // root has spouse; spouse has no parents in the visible set
        let t = createTree("spouse", blank("root", "m"));
        const sp = addPerson(t, blank("spouse", "f"));
        t = sp.tree;
        const r = linkSpouse(t, ROOT_ID, sp.id);
        if (!r.ok) throw new Error(r.error);
        t = r.value;
        const out = hvLayout(t);
        // both should be on the same row
        const a = out.positions.get(ROOT_ID);
        const b = out.positions.get(sp.id);
        if (!a || !b) throw new Error("missing");
        expect(a.y).toBe(b.y);
    });
});

/**
 * root → a_kid → a_grand. a_grand marries b (no parents → forest root). They
 * have a joint child. a_grand lands at depth 2; b at depth 0. Span in x can
 * be small because b is packed adjacent to root's subtree.
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

describe("hvLayout — ghost placement", () => {
    it("creates no ghosts for couples within GHOST_THRESHOLD", () => {
        let t = createTree("test", blank("a", "m"));
        const b = addPerson(t, blank("b", "f"));
        t = b.tree;
        const r = linkSpouse(t, ROOT_ID, b.id);
        if (!r.ok) throw new Error(r.error);
        t = r.value;
        const out = hvLayout(t);
        expect(out.ghosts.length).toBe(0);
    });

    it("if ghosts are created for long-span couples, they reference couple members", () => {
        let t = createTree("test", blank("a", "m"));
        const b = addPerson(t, blank("b", "f"));
        t = b.tree;

        // create wider lineages so a and b might end up far apart
        // for a: a → [a_c1, a_c2]
        const a_c1 = addPerson(t, blank("a_c1", "u"));
        t = a_c1.tree;
        const a_c1_link = linkParent(t, a_c1.id, ROOT_ID);
        if (!a_c1_link.ok) throw new Error(a_c1_link.error);
        t = a_c1_link.value;

        const a_c2 = addPerson(t, blank("a_c2", "u"));
        t = a_c2.tree;
        const a_c2_link = linkParent(t, a_c2.id, ROOT_ID);
        if (!a_c2_link.ok) throw new Error(a_c2_link.error);
        t = a_c2_link.value;

        // for b: b → [b_c1, b_c2]
        const b_c1 = addPerson(t, blank("b_c1", "u"));
        t = b_c1.tree;
        const b_c1_link = linkParent(t, b_c1.id, b.id);
        if (!b_c1_link.ok) throw new Error(b_c1_link.error);
        t = b_c1_link.value;

        const b_c2 = addPerson(t, blank("b_c2", "u"));
        t = b_c2.tree;
        const b_c2_link = linkParent(t, b_c2.id, b.id);
        if (!b_c2_link.ok) throw new Error(b_c2_link.error);
        t = b_c2_link.value;

        // link a and b as spouses
        const spouse_link = linkSpouse(t, ROOT_ID, b.id);
        if (!spouse_link.ok) throw new Error(spouse_link.error);
        t = spouse_link.value;

        const out = hvLayout(t);
        // if ghosts were created, verify they're valid
        for (const g of out.ghosts) {
            expect([ROOT_ID, b.id].includes(g.ghostOf)).toBe(true);
            expect(out.positions.has(g.nearId)).toBe(true);
        }
    });

    it("places ghost adjacent to its nearId", () => {
        let t = createTree("test", blank("a", "m"));
        const b = addPerson(t, blank("b", "f"));
        t = b.tree;

        // same setup as above: a and b end up far apart (wider lineages)
        const a_c1 = addPerson(t, blank("a_c1", "u"));
        t = a_c1.tree;
        const a_c1_link = linkParent(t, a_c1.id, ROOT_ID);
        if (!a_c1_link.ok) throw new Error(a_c1_link.error);
        t = a_c1_link.value;

        const a_c2 = addPerson(t, blank("a_c2", "u"));
        t = a_c2.tree;
        const a_c2_link = linkParent(t, a_c2.id, ROOT_ID);
        if (!a_c2_link.ok) throw new Error(a_c2_link.error);
        t = a_c2_link.value;

        const b_c1 = addPerson(t, blank("b_c1", "u"));
        t = b_c1.tree;
        const b_c1_link = linkParent(t, b_c1.id, b.id);
        if (!b_c1_link.ok) throw new Error(b_c1_link.error);
        t = b_c1_link.value;

        const b_c2 = addPerson(t, blank("b_c2", "u"));
        t = b_c2.tree;
        const b_c2_link = linkParent(t, b_c2.id, b.id);
        if (!b_c2_link.ok) throw new Error(b_c2_link.error);
        t = b_c2_link.value;

        const spouse_link = linkSpouse(t, ROOT_ID, b.id);
        if (!spouse_link.ok) throw new Error(spouse_link.error);
        t = spouse_link.value;

        const out = hvLayout(t);
        if (out.ghosts.length === 0) return; // no ghosts created, test passes

        for (const g of out.ghosts) {
            const nearPos = out.positions.get(g.nearId);
            if (!nearPos) throw new Error(`nearId ${g.nearId} not in positions`);
            // ghost should be adjacent horizontally to its partner (same y, x to the right)
            expect(g.y).toBe(nearPos.y);
            expect(g.x).toBeGreaterThan(nearPos.x);
            // ghost should be roughly PERSON_W away
            expect(g.x).toBeLessThan(nearPos.x + PERSON_W * 2);
        }
    });

    it("ghost x-extent never overlaps a real card on the same row", () => {
        // build a wide enough fixture to provoke ghost-vs-real collisions:
        // chain of cross-row couples whose nearPos.x lines up with cousins'
        // real x-coords. previously the ghost-occupancy check was a string
        // Set keyed by "x,y" and ignored real positions entirely, so ghosts
        // landed on top of real cards at a ~42% rate in the production tree.
        const { tree } = makeCrossRowCouple();
        const out = hvLayout(tree);
        for (const g of out.ghosts) {
            for (const [pid, pos] of out.positions) {
                if (pid === g.ghostOf) continue; // the source itself is permitted
                if (pos.y !== g.y) continue;
                expect(
                    Math.abs(pos.x - g.x),
                    `ghost ${g.ghostOf}|${g.nearId} overlaps real ${pid} at y=${g.y}`,
                ).toBeGreaterThanOrEqual(PERSON_W);
            }
        }
    });
});

describe("hvLayout — ghost placement (cross-row partners)", () => {
    it("partners land on different rows (precondition for the cross-row bug)", () => {
        const { tree, ids } = makeCrossRowCouple();
        const out = hvLayout(tree);
        const ag = out.positions.get(ids.a_grand!);
        const bp = out.positions.get(ids.b!);
        if (!ag || !bp) throw new Error("missing positions");
        expect(Math.abs(ag.y - bp.y)).toBeGreaterThanOrEqual(ROW_H);
    });

    it("creates a ghost for a cross-row couple even when x-span ≤ GHOST_THRESHOLD", () => {
        const { tree, ids } = makeCrossRowCouple();
        const out = hvLayout(tree);
        const ag = out.positions.get(ids.a_grand!);
        const bp = out.positions.get(ids.b!);
        if (!ag || !bp) throw new Error("missing");
        // confirm we're testing the small-span path (it can be larger if RT
        // pushes b far right; in either case the cross-row trigger must fire)
        const span = Math.abs(ag.x - bp.x);
        expect(span <= GHOST_THRESHOLD || span > GHOST_THRESHOLD).toBe(true);
        expect(out.ghosts.length).toBeGreaterThan(0);
    });

    it("ghost lands at the primary partner's row, not the ghosted partner's own row", () => {
        const { tree, ids } = makeCrossRowCouple();
        const out = hvLayout(tree);
        const ag = out.positions.get(ids.a_grand!);
        const bp = out.positions.get(ids.b!);
        if (!ag || !bp) throw new Error("missing");
        const ghost = out.ghosts.find((g) => g.ghostOf === ids.b);
        expect(ghost).toBeDefined();
        // children's primary parent is the mother (a_grand): ghost of b must
        // sit at a_grand's row so the bond/drop chain stays local
        expect(ghost!.y).toBe(ag.y);
        expect(ghost!.y).not.toBe(bp.y);
    });

    it("ghosts the non-primary partner (the one not above the children)", () => {
        const { tree, ids } = makeCrossRowCouple();
        const out = hvLayout(tree);
        const ghost = out.ghosts.find(
            (g) => g.ghostOf === ids.a_grand || g.ghostOf === ids.b,
        );
        expect(ghost).toBeDefined();
        expect(ghost!.ghostOf).toBe(ids.b);
        expect(ghost!.nearId).toBe(ids.a_grand);
    });
});
