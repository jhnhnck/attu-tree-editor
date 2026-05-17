/*
 * FamilyTreeEditor - family-view overlay render-pass.
 *
 * Phase 4 of the relationship-vocabulary plan
 * (notes/plans/relationship-vocabulary.md). The overlay pass runs AFTER
 * the skeleton route pass and emits non-skeletal edges:
 *
 *  - sworn-bond / oath / ritual edges (chained stroke palette class)
 *  - transformation / reincarnation / merge / split / alias identity arcs
 *  - severance decorations on existing skeleton edges
 *
 * Walker reads `tree.relationships[]`, fans out each record into one or
 * more `OverlaySegment`s (one segment per source × target pair), and
 * routes non-severance segments through the A* obstacle-avoidance router
 * (`overlayRouter.ts`). Severances do not route — they decorate the
 * existing skeleton edge between source and target with a short marker
 * at its midpoint.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { CARD_H } from "$lib/layout/engines/family-view/layout";
import { PERSON_W } from "$lib/layout/constants";
import {
    buildRouterContext,
    routeOverlay,
    type Point,
} from "$lib/layout/engines/family-view/overlayRouter";
import type { FamilyViewEdge, FamilyViewNode } from "$lib/layout/engines/family-view/types";
import type { PersonId, Relationship, RelationshipKind, Tree } from "$lib/domain/types";

/** Kinds of overlay segment the renderer knows about. */
export type OverlayKind = "sworn-bond" | "transformation" | "alias" | "severance";

export interface OverlaySegment {
    readonly id: string;
    readonly kind: OverlayKind;
    /** Original Relationship.kind — drives the palette glyph (☼ ∞ ⊕ ⊖ ≡ //). */
    readonly relationshipKind: RelationshipKind;
    readonly sourceIds: readonly PersonId[];
    readonly targetIds: readonly PersonId[];
    /** Routed polyline in unit space. Empty iff routing failed (renderer skips the segment). */
    readonly points: readonly Point[];
    /** Severance marker midpoint in unit space. Set only for severance kinds. */
    readonly severanceMark?: Point;
}

/**
 * Walk `tree.relationships[]` and emit one `OverlaySegment` per
 * source × target pair. Severances decorate existing skeleton edges
 * (no A* needed); other kinds route via `overlayRouter`.
 *
 * Returns an empty array when the tree has no relationships, no nodes,
 * or every overlay endpoint is hidden (filter visibility before routing).
 */
export function buildOverlays(
    tree: Tree,
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
    edges: readonly FamilyViewEdge[],
    bbox: { readonly width: number; readonly height: number },
): readonly OverlaySegment[] {
    const rels = tree.relationships ?? [];
    if (rels.length === 0 || nodes.size === 0) return [];

    const ctx = buildRouterContext(nodes, bbox);
    const out: OverlaySegment[] = [];

    for (const rel of rels) {
        const visibleSources = rel.sourceIds.filter((id) => nodes.has(id));
        const visibleTargets = rel.targetIds.filter((id) => nodes.has(id));
        if (visibleSources.length === 0 || visibleTargets.length === 0) continue;

        const kind = mapKind(rel.kind);

        for (const sId of visibleSources) {
            for (const tId of visibleTargets) {
                if (sId === tId) continue; // self-loop is non-trivial; skip for v1
                const seg = buildSegment(rel, kind, sId, tId, nodes, edges, ctx);
                if (seg) out.push(seg);
            }
        }
    }
    return out;
}

function mapKind(rk: RelationshipKind): OverlayKind {
    switch (rk) {
        case "sworn-bond":
        case "oath-sibling":
        case "blood-brother":
        case "master-apprentice":
        case "covenant":
            return "sworn-bond";
        case "transformed-from":
        case "reincarnated-as":
        case "merged-from":
        case "split-into":
            return "transformation";
        case "alias-of":
            return "alias";
        case "severed":
        case "estranged":
        case "exiled":
        case "disowned":
            return "severance";
    }
}

function buildSegment(
    rel: Relationship,
    kind: OverlayKind,
    sId: PersonId,
    tId: PersonId,
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
    edges: readonly FamilyViewEdge[],
    ctx: ReturnType<typeof buildRouterContext>,
): OverlaySegment | null {
    const sNode = nodes.get(sId);
    const tNode = nodes.get(tId);
    if (!sNode || !tNode) return null;

    if (kind === "severance") {
        return buildSeveranceSegment(rel, sId, tId, sNode, tNode, edges);
    }

    const from = anchorPointOnEdge(sNode, tNode);
    const to = anchorPointOnEdge(tNode, sNode);
    const exclude = new Set<PersonId>([sId, tId]);
    const points = routeOverlay(ctx, from, to, exclude);
    if (!points || points.length < 2) return null;

    return {
        id: `overlay:${rel.id}:${sId}->${tId}`,
        kind,
        relationshipKind: rel.kind,
        sourceIds: [sId],
        targetIds: [tId],
        points,
    };
}

function buildSeveranceSegment(
    rel: Relationship,
    sId: PersonId,
    tId: PersonId,
    sNode: FamilyViewNode,
    tNode: FamilyViewNode,
    edges: readonly FamilyViewEdge[],
): OverlaySegment {
    // search for a skeleton edge that connects source and target, decorate
    // its midpoint. fall back to the straight midpoint between cards if
    // no such edge exists (e.g. severance crossing rank groups).
    const skeletonEdge = edges.find((e) => {
        const set = new Set(e.persons);
        return set.has(sId) && set.has(tId);
    });
    let mark: Point;
    let points: readonly Point[];
    if (skeletonEdge && skeletonEdge.points.length >= 2) {
        const seg = midpointOfPolyline(skeletonEdge.points);
        mark = seg;
        // points kept short — just the marker pair so the renderer can
        // draw a small `//` decoration at the midpoint
        points = [skeletonEdge.points[0]!, skeletonEdge.points[skeletonEdge.points.length - 1]!];
    } else {
        const from = anchorPointOnEdge(sNode, tNode);
        const to = anchorPointOnEdge(tNode, sNode);
        mark = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        points = [from, to];
    }
    return {
        id: `overlay:${rel.id}:${sId}->${tId}`,
        kind: "severance",
        relationshipKind: rel.kind,
        sourceIds: [sId],
        targetIds: [tId],
        points,
        severanceMark: mark,
    };
}

/**
 * Pick a point on the boundary of `from`'s card that faces `toward`.
 * Used as the start/end anchor for the routed polyline so overlays
 * leave / enter cards through the side facing the partner.
 */
function anchorPointOnEdge(from: FamilyViewNode, toward: FamilyViewNode): Point {
    const fcx = from.x + PERSON_W / 2;
    const fcy = from.y + (from.h ?? CARD_H) / 2;
    const tcx = toward.x + PERSON_W / 2;
    const tcy = toward.y + (toward.h ?? CARD_H) / 2;
    const dx = tcx - fcx;
    const dy = tcy - fcy;
    // pick the dominant axis to leave through
    if (Math.abs(dx) >= Math.abs(dy)) {
        // leave through left or right edge
        return {
            x: dx >= 0 ? from.x + PERSON_W : from.x,
            y: fcy,
        };
    } else {
        // leave through top or bottom edge
        return {
            x: fcx,
            y: dy >= 0 ? from.y + (from.h ?? CARD_H) : from.y,
        };
    }
}

function midpointOfPolyline(pts: readonly Point[]): Point {
    // total length, then walk to the half-length point. handles bends.
    let total = 0;
    const segs: number[] = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        segs.push(len);
        total += len;
    }
    const half = total / 2;
    let acc = 0;
    for (let i = 0; i < segs.length; i += 1) {
        const len = segs[i]!;
        if (acc + len >= half) {
            const t = len === 0 ? 0 : (half - acc) / len;
            const a = pts[i]!;
            const b = pts[i + 1]!;
            return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        }
        acc += len;
    }
    return pts[pts.length - 1]!;
}
