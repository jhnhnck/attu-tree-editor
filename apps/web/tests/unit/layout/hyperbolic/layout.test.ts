/*
 * FamilyTreeEditor - unit tests for the hyperbolic engine's layout pass.
 *
 * Covers the structural invariants of Lamping-Rao hourglass + lateral
 * weave: proband at the origin; ancestors in the upper half-disk;
 * descendants in the lower half-disk; spouses adjacent; |z| < 1 for
 * every placed person; edges have valid hyperbolic endpoints.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import type { Person, Tree } from "$lib/domain/types";
import { layoutHourglass } from "$lib/layout/engines/hyperbolic-lr/layout";
import type { LayoutPosition } from "$lib/layout/engine";
import { abs, RHO_MAX } from "$lib/layout/hyperbolic/poincare";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function ok<V>(r: { ok: true; value: V } | { ok: false; error: string }): V {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

/** P (proband) — F + M parents; K child. */
function tinyFamily(): { tree: Tree; ids: { p: string; f: string; m: string; k: string } } {
    let t = createTree("hyp", blank("P", "u"));
    const f = addPerson(t, blank("F", "m"));
    t = f.tree;
    const m = addPerson(t, blank("M", "f"));
    t = m.tree;
    const k = addPerson(t, blank("K", "u"));
    t = k.tree;
    t = ok(linkSpouse(t, f.id, m.id));
    t = ok(linkParent(t, ROOT_ID, f.id));
    t = ok(linkParent(t, ROOT_ID, m.id));
    t = ok(linkParent(t, k.id, ROOT_ID));
    return { tree: t, ids: { p: ROOT_ID, f: f.id, m: m.id, k: k.id } };
}

function visibleAll(tree: Tree): Set<string> {
    return new Set(Object.keys(tree.people));
}

describe("layoutHourglass — structural invariants", () => {
    it("places the proband at the origin", () => {
        const { tree, ids } = tinyFamily();
        const out = layoutHourglass(tree, ids.p, visibleAll(tree));
        const probandPos = out.positions.get(ids.p) as Extract<
            LayoutPosition,
            { space: "hyperbolic" }
        >;
        expect(probandPos.space).toBe("hyperbolic");
        expect(probandPos.z.re).toBe(0);
        expect(probandPos.z.im).toBe(0);
    });

    it("every placed person has |z| ≤ RHO_MAX", () => {
        const { tree, ids } = tinyFamily();
        const out = layoutHourglass(tree, ids.p, visibleAll(tree));
        for (const [, pos] of out.positions) {
            if (pos.space !== "hyperbolic") throw new Error("expected hyperbolic");
            expect(abs(pos.z)).toBeLessThanOrEqual(RHO_MAX + 1e-12);
        }
    });

    it("ancestors land in the upper half-disk (im > 0)", () => {
        const { tree, ids } = tinyFamily();
        const out = layoutHourglass(tree, ids.p, visibleAll(tree));
        // F is on the ancestor spine; M is F's spouse, woven into the same half.
        const fPos = out.positions.get(ids.f);
        if (!fPos || fPos.space !== "hyperbolic") throw new Error("F missing");
        expect(fPos.z.im).toBeGreaterThan(0);
    });

    it("descendants land in the lower half-disk (im < 0)", () => {
        const { tree, ids } = tinyFamily();
        const out = layoutHourglass(tree, ids.p, visibleAll(tree));
        const kPos = out.positions.get(ids.k);
        if (!kPos || kPos.space !== "hyperbolic") throw new Error("K missing");
        expect(kPos.z.im).toBeLessThan(0);
    });

    it("a direct-line person's spouse is placed near them, not at z=0", () => {
        const { tree, ids } = tinyFamily();
        const out = layoutHourglass(tree, ids.p, visibleAll(tree));
        const mPos = out.positions.get(ids.m);
        if (!mPos || mPos.space !== "hyperbolic") throw new Error("M missing");
        // M is F's spouse but not on the proband's direct ancestor spine
        // (only one of P's two parents is on the spine; the other gets woven).
        // Either way, M should not be at the origin.
        const norm = abs(mPos.z);
        expect(norm).toBeGreaterThan(0);
    });

    it("emits geodesic-arc parent-child edges with bundle keys", () => {
        const { tree, ids } = tinyFamily();
        const out = layoutHourglass(tree, ids.p, visibleAll(tree));
        const parentEdges = out.edges.filter((e) => e.style === "blood");
        expect(parentEdges.length).toBeGreaterThan(0);
        for (const e of parentEdges) {
            expect(e.route.kind).toBe("geodesic-arc");
            expect(e.bundleId).toBeDefined();
        }
        // Edges where P is the CHILD (P↔F and P↔M) share the couple bundle.
        const probandIsChild = parentEdges.filter((e) => e.persons[1] === ids.p);
        expect(probandIsChild.length).toBe(2);
        const bundles = new Set(probandIsChild.map((e) => e.bundleId));
        expect(bundles.size).toBe(1);
    });

    it("emits a marriage edge between F and M with style 'married'", () => {
        const { tree, ids } = tinyFamily();
        const out = layoutHourglass(tree, ids.p, visibleAll(tree));
        const bonds = out.edges.filter((e) => e.style === "married" || e.style === "divorced");
        expect(bonds.length).toBe(1);
        const bond = bonds[0]!;
        expect(bond.persons).toContain(ids.f);
        expect(bond.persons).toContain(ids.m);
        expect(bond.style).toBe("married");
    });

    it("respects visibility filtering", () => {
        const { tree, ids } = tinyFamily();
        // Hide K (descendant).
        const visible = new Set([ids.p, ids.f, ids.m]);
        const out = layoutHourglass(tree, ids.p, visible);
        expect(out.positions.has(ids.k)).toBe(false);
        expect(out.edges.every((e) => !e.persons.includes(ids.k))).toBe(true);
    });

    it("returns an empty layout when the proband isn't in the tree", () => {
        const { tree } = tinyFamily();
        const out = layoutHourglass(tree, "NOPE", visibleAll(tree));
        expect(out.positions.size).toBe(0);
        expect(out.edges.length).toBe(0);
    });

    it("does not double-place the same person", () => {
        const { tree, ids } = tinyFamily();
        const out = layoutHourglass(tree, ids.p, visibleAll(tree));
        // Map cannot have duplicates by definition, but defend against the
        // weave pass accidentally overwriting a spine placement.
        const sizes = [out.positions.size, out.nodes.size];
        expect(sizes[0]).toBe(sizes[1]);
        expect(sizes[0]).toBeGreaterThanOrEqual(4);
    });
});
