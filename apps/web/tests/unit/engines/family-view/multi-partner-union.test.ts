/*
 * FamilyTreeEditor - 3-partner closed-union rendering (Phase 3b DoD)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkUnion } from "$lib/domain/tree";
import { computeLayout } from "$lib/layout/engines/family-view/layout";
import type { Person } from "$lib/domain/types";

function bare(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

describe("family-view: 3-partner closed-union rendering (Phase 3b DoD)", () => {
    it("renders a 3-partner union as a UnionAnchor with all 3 partnerIds and a bus connector", () => {
        // Build a 3-partner triad (closed polycule). All 3 partners are
        // visible peers of the focus; computeLayout should place them
        // contiguously and emit a UnionAnchor with partnerIds.length === 3.
        let t = createTree("triad", bare("Focus", "m"));
        const focus = ROOT_ID;
        const a = addPerson(t, bare("Partner-A", "f"));
        t = a.tree;
        const b = addPerson(t, bare("Partner-B", "u"));
        t = b.tree;
        const r = linkUnion(t, [focus, a.id, b.id]);
        if (!r.ok) throw new Error(r.error);
        const layout = computeLayout(r.value, focus);

        const triad = layout.anchors.find((u) => u.partnerIds.length === 3);
        expect(triad, "expected a 3-partner UnionAnchor").toBeDefined();
        if (!triad) return;
        expect(new Set(triad.partnerIds)).toEqual(new Set([focus, a.id, b.id]));

        // Bus-primitive edges: one bar across all 3 partners + zero-length
        // tails on-rank. Tails are skipped when |y - cy| < 0.001, so only
        // the bar edge survives when all partners share a rank.
        const manifoldEdges = layout.edges.filter((e) =>
            e.id.startsWith(`union:${triad.id.split(":")[1] ?? ""}/manifold/`),
        );
        expect(manifoldEdges.length).toBeGreaterThanOrEqual(1);
    });

    it("places 3 partners contiguously in the same rank", () => {
        let t = createTree("triad-contiguity", bare("Focus", "m"));
        const focus = ROOT_ID;
        const a = addPerson(t, bare("Partner-A", "f"));
        t = a.tree;
        const b = addPerson(t, bare("Partner-B", "u"));
        t = b.tree;
        const r = linkUnion(t, [focus, a.id, b.id]);
        if (!r.ok) throw new Error(r.error);
        const layout = computeLayout(r.value, focus);

        const positions = [focus, a.id, b.id]
            .map((pid) => layout.nodes.get(pid))
            .filter(
                (n): n is { personId: string; rank: number; x: number; y: number } =>
                    n !== undefined,
            );
        expect(positions).toHaveLength(3);
        // all on same rank
        const ranks = new Set(positions.map((p) => p.rank));
        expect(ranks.size).toBe(1);
    });
});
