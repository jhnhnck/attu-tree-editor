/*
 * FamilyTreeEditor - phase 4 follow-up: overlay walker + A* router tests
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { addPerson, addRelationship, createTree, linkParent } from "$lib/domain/tree";
import type { Person, PersonId, Tree } from "$lib/domain/types";
import { computeLayout } from "$lib/layout/engines/family-view/layout";
import { buildOverlays } from "$lib/layout/engines/family-view/overlays";
import {
    buildRouterContext,
    routeOverlay,
    simplifyPath,
} from "$lib/layout/engines/family-view/overlayRouter";
import type { FamilyViewNode } from "$lib/layout/engines/family-view/types";
import { ROOT_ID } from "$lib/domain/ids";

function person(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return { given: name, surname: "", gender, spouseIds: [], display: "z1" };
}

function buildSmallTree(): { tree: Tree; ids: Record<string, PersonId> } {
    let t = createTree("ovr", { ...person("Root", "f") });
    const root = ROOT_ID;
    const childA = addPerson(t, person("A"));
    t = childA.tree;
    const childB = addPerson(t, person("B"));
    t = childB.tree;
    const linkA = linkParent(t, childA.id, root);
    if (!linkA.ok) throw new Error(linkA.error);
    t = linkA.value;
    const linkB = linkParent(t, childB.id, root);
    if (!linkB.ok) throw new Error(linkB.error);
    t = linkB.value;
    return { tree: t, ids: { root, a: childA.id, b: childB.id } };
}

describe("overlay walker (buildOverlays)", () => {
    it("returns [] when tree has no relationships", () => {
        const { tree } = buildSmallTree();
        const layout = computeLayout(tree, ROOT_ID);
        const out = buildOverlays(tree, layout.nodes, layout.edges, layout.bbox);
        expect(out).toEqual([]);
    });

    it("emits one overlay per source x target pair", () => {
        const { tree, ids } = buildSmallTree();
        // sworn-bond between a and b — should produce 1 overlay
        const t = addRelationship(tree, {
            kind: "sworn-bond",
            sourceIds: [ids.a!],
            targetIds: [ids.b!],
        }).tree;
        const layout = computeLayout(t, ROOT_ID);
        const out = buildOverlays(t, layout.nodes, layout.edges, layout.bbox);
        expect(out).toHaveLength(1);
        const seg = out[0]!;
        expect(seg.kind).toBe("sworn-bond");
        expect(seg.relationshipKind).toBe("sworn-bond");
        expect(seg.sourceIds).toEqual([ids.a]);
        expect(seg.targetIds).toEqual([ids.b]);
        expect(seg.points.length).toBeGreaterThanOrEqual(2);
    });

    it("maps RelationshipKind groups to OverlayKinds correctly", () => {
        const { tree, ids } = buildSmallTree();
        let t = tree;
        // pick one of each visual family
        for (const k of ["sworn-bond", "transformed-from", "alias-of", "severed"] as const) {
            t = addRelationship(t, { kind: k, sourceIds: [ids.a!], targetIds: [ids.b!] }).tree;
        }
        const layout = computeLayout(t, ROOT_ID);
        const out = buildOverlays(t, layout.nodes, layout.edges, layout.bbox);
        const kinds = out.map((o) => o.kind).sort();
        expect(kinds).toEqual(["alias", "severance", "sworn-bond", "transformation"]);
    });

    it("severance segments include a midpoint mark", () => {
        const { tree, ids } = buildSmallTree();
        const t = addRelationship(tree, {
            kind: "severed",
            sourceIds: [ids.root!],
            targetIds: [ids.a!],
        }).tree;
        const layout = computeLayout(t, ROOT_ID);
        const out = buildOverlays(t, layout.nodes, layout.edges, layout.bbox);
        expect(out).toHaveLength(1);
        const seg = out[0]!;
        expect(seg.kind).toBe("severance");
        expect(seg.severanceMark).toBeDefined();
    });

    it("skips relationships whose endpoints aren't visible", () => {
        const { tree, ids } = buildSmallTree();
        // reference a non-existent person — overlay should be silently dropped
        const t = addRelationship(tree, {
            kind: "sworn-bond",
            sourceIds: [ids.a!],
            targetIds: ["ghost"],
        }).tree;
        const layout = computeLayout(t, ROOT_ID);
        const out = buildOverlays(t, layout.nodes, layout.edges, layout.bbox);
        expect(out).toEqual([]);
    });

    it("emits N x M overlays for many-to-many sources/targets", () => {
        const { tree, ids } = buildSmallTree();
        // root → {a, b}: should be 1 source × 2 targets = 2 segments
        const t = addRelationship(tree, {
            kind: "sworn-bond",
            sourceIds: [ids.root!],
            targetIds: [ids.a!, ids.b!],
        }).tree;
        const layout = computeLayout(t, ROOT_ID);
        const out = buildOverlays(t, layout.nodes, layout.edges, layout.bbox);
        expect(out).toHaveLength(2);
    });
});

describe("A* router (routeOverlay)", () => {
    function nodes(): ReadonlyMap<PersonId, FamilyViewNode> {
        // two cards on the same row with a horizontal gap
        const m = new Map<PersonId, FamilyViewNode>();
        m.set("a", { personId: "a", rank: 0, x: 0, y: 0, h: 1.2 });
        m.set("b", { personId: "b", rank: 0, x: 6, y: 0, h: 1.2 });
        return m;
    }

    it("routes a clear path between two cards on the same row", () => {
        const ctx = buildRouterContext(nodes(), { width: 10, height: 4 });
        const path = routeOverlay(
            ctx,
            { x: 2, y: 0.6 },
            { x: 6, y: 0.6 },
            new Set<PersonId>(["a", "b"]),
        );
        expect(path).not.toBeNull();
        expect(path!.length).toBeGreaterThanOrEqual(2);
        expect(path![0]).toEqual({ x: 2, y: 0.6 });
        expect(path![path!.length - 1]).toEqual({ x: 6, y: 0.6 });
    });

    it("routes around a blocking card", () => {
        // place a third card directly in the gap between a and b
        const m = new Map<PersonId, FamilyViewNode>();
        m.set("a", { personId: "a", rank: 0, x: 0, y: 0, h: 1.2 });
        m.set("blocker", { personId: "blocker", rank: 0, x: 3, y: 0, h: 1.2 });
        m.set("b", { personId: "b", rank: 0, x: 6, y: 0, h: 1.2 });
        const ctx = buildRouterContext(m, { width: 10, height: 4 });
        const path = routeOverlay(
            ctx,
            { x: 2, y: 0.6 },
            { x: 6, y: 0.6 },
            new Set<PersonId>(["a", "b"]),
        );
        expect(path).not.toBeNull();
        // path must go AROUND the blocker — at least one waypoint must
        // have y far enough from the row to dodge the card AABB
        const dodged = path!.some((p) => Math.abs(p.y - 0.6) > 0.5);
        expect(dodged).toBe(true);
    });

    it("returns null when start and goal are both deep inside foreign cards", () => {
        const ctx = buildRouterContext(nodes(), { width: 10, height: 4 });
        // exclude no owners — a and b are now obstacles to the router
        const path = routeOverlay(ctx, { x: 1, y: 0.6 }, { x: 7, y: 0.6 }, new Set<PersonId>());
        expect(path).toBeNull();
    });

    it("simplifyPath drops collinear interior points", () => {
        const out = simplifyPath([
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 3, y: 0 },
            { x: 3, y: 1 },
            { x: 3, y: 2 },
        ]);
        // expect: only corners + endpoints
        expect(out).toEqual([
            { x: 0, y: 0 },
            { x: 3, y: 0 },
            { x: 3, y: 2 },
        ]);
    });
});
