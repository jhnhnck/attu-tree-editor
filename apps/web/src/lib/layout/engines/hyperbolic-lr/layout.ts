/*
 * FamilyTreeEditor - Lamping–Rao hourglass layout for the hyperbolic engine.
 *
 * Replaces the Phase 0 z=0 stub. Plays the same role for the hyperbolic
 * engine that `passes/place.ts` does for the layered one — every visible
 * person gets a position; ghost-like spouses get placed adjacent to their
 * direct-line partner; edges come out as geodesic arcs.
 *
 * Algorithm (Phase 2 spike, with lateral weave):
 *
 *   1. Proband at z = 0.
 *   2. Build two BFS spines from the proband:
 *      - ancestor spine through parent links only (upper half)
 *      - descendant spine through child links only (lower half)
 *   3. Recursive Lamping-Rao on each spine — angular wedge ∝ log(1+size),
 *      hyperbolic step D per generation.
 *   4. Weave laterals onto the spine:
 *      - Each direct-line person's spouse (if not themselves on the
 *        spine) takes a small fixed angular offset at the same depth.
 *      - Siblings of the proband (and aunts/uncles of any deeper spine
 *        node) recurse as sub-wedges off their direct-line parent's
 *        wedge. This is the "weave into direct-line slots" decision
 *        from Phase 2 plan-revise.
 *
 * Edges emitted:
 *   - parent → child: geodesic-arc, style "blood", bundle key per
 *     `couple:<sortedParents>:<unionIndex>` so the renderer collapses
 *     joint-children of the same couple to one path.
 *   - marriage:       geodesic-arc, style "married"/"divorced", bundle
 *     key `bond:<sortedIds>:<unionIndex>`.
 *
 * Numerical caveats:
 *   - Lamping-Rao with constant step at large depth produces overlapping
 *     siblings near the boundary annulus. The Phase 2 spike report
 *     measured the cutoff (D=0.08 → 66 gens before |z|≥0.999 on Akarians).
 *     This module sticks with constant step; Phase 5.5 (minimal DOI)
 *     clips deep low-DOI subtrees into glyphs.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { CoupleRecord, PersonId, Tree } from "$lib/domain/types";
import type { LayoutEdge, LayoutObstacle, LayoutPosition } from "$lib/layout/engine";
import type { LayoutNode, LayoutNodeId } from "$lib/layout/ir";
import {
    ZERO,
    type Complex,
    placeChild,
    abs,
    type Geodesic,
} from "$lib/layout/hyperbolic/poincare";

export interface HourglassLayoutOptions {
    /** Hyperbolic step distance per generation. Default 0.7. */
    readonly stepDistance?: number;
    /**
     * Angular separation (radians) given to a direct-line person's spouse
     * relative to their partner's spine slot. Default 0.12 rad (~7°).
     * Small enough to read as "alongside"; large enough that the spouse's
     * card doesn't overlap.
     */
    readonly spouseAngle?: number;
}

export interface HourglassLayoutResult {
    readonly positions: ReadonlyMap<LayoutNodeId, LayoutPosition>;
    readonly nodes: ReadonlyMap<LayoutNodeId, LayoutNode>;
    readonly edges: readonly LayoutEdge[];
    readonly obstacles: readonly LayoutObstacle[];
    /** Whether the layout clamped any node to |z| = RHO_MAX. */
    readonly hitBoundary: boolean;
}

interface SpineSubtree {
    /** parent → list of spine-children */
    readonly children: ReadonlyMap<PersonId, PersonId[]>;
    /** every node included on this spine */
    readonly included: ReadonlySet<PersonId>;
}

export function layoutHourglass(
    tree: Tree,
    proband: PersonId,
    visible: ReadonlySet<PersonId>,
    options: HourglassLayoutOptions = {},
): HourglassLayoutResult {
    const stepDistance = options.stepDistance ?? 0.7;
    const spouseAngle = options.spouseAngle ?? 0.12;

    const positions = new Map<LayoutNodeId, LayoutPosition>();
    const nodes = new Map<LayoutNodeId, LayoutNode>();
    const edges: LayoutEdge[] = [];
    const boundary = { hit: false };

    if (!tree.people[proband] || !visible.has(proband)) {
        return { positions, nodes, edges, obstacles: [], hitBoundary: false };
    }

    // Build spine subtrees from proband.
    const childrenOf = buildChildrenMap(tree, visible);
    const ancestorSpine = buildAncestorSpine(tree, proband, visible);
    const descendantSpine = buildDescendantSpine(proband, childrenOf, visible);
    const onSpine = new Set<PersonId>([...ancestorSpine.included, ...descendantSpine.included]);
    onSpine.add(proband);

    // Place proband.
    setNode(nodes, proband, 0);
    positions.set(proband, hypPos(ZERO));

    // Run the two halves.
    const ancestorSizes = subtreeSizes(ancestorSpine.children);
    const descendantSizes = subtreeSizes(descendantSpine.children);

    layoutSpine(
        ancestorSpine.children,
        proband,
        ZERO,
        Math.PI / 2,
        Math.PI,
        0,
        ancestorSizes,
        stepDistance,
        positions,
        nodes,
        boundary,
    );
    layoutSpine(
        descendantSpine.children,
        proband,
        ZERO,
        -Math.PI / 2,
        Math.PI,
        0,
        descendantSizes,
        stepDistance,
        positions,
        nodes,
        boundary,
    );

    // Weave laterals: spouses and off-spine children of spine people.
    weaveLaterals(
        tree,
        visible,
        onSpine,
        childrenOf,
        positions,
        nodes,
        boundary,
        stepDistance,
        spouseAngle,
    );

    // Emit edges: parent-child geodesics + marriage geodesics.
    emitParentChildEdges(tree, visible, positions, edges);
    emitMarriageEdges(tree, visible, positions, edges);

    return {
        positions,
        nodes,
        edges,
        obstacles: [],
        hitBoundary: boundary.hit,
    };
}

// ---------------------------------------------------------------------------
// Spine construction
// ---------------------------------------------------------------------------

function buildChildrenMap(tree: Tree, visible: ReadonlySet<PersonId>): Map<PersonId, PersonId[]> {
    const out = new Map<PersonId, PersonId[]>();
    for (const id of Object.keys(tree.people)) {
        if (!visible.has(id)) continue;
        const p = tree.people[id];
        if (!p) continue;
        for (const parentId of [p.motherId, p.fatherId]) {
            if (!parentId || !visible.has(parentId)) continue;
            const arr = out.get(parentId);
            if (arr) arr.push(id);
            else out.set(parentId, [id]);
        }
    }
    return out;
}

/** BFS ancestor walk through parent links only. */
function buildAncestorSpine(
    tree: Tree,
    proband: PersonId,
    visible: ReadonlySet<PersonId>,
): SpineSubtree {
    const children = new Map<PersonId, PersonId[]>();
    const included = new Set<PersonId>();
    const visited = new Set<PersonId>([proband]);
    let frontier: PersonId[] = [proband];
    while (frontier.length > 0) {
        const next: PersonId[] = [];
        for (const id of frontier) {
            const p = tree.people[id];
            if (!p) continue;
            const parents: PersonId[] = [];
            for (const pid of [p.motherId, p.fatherId]) {
                if (!pid || visited.has(pid) || !visible.has(pid)) continue;
                visited.add(pid);
                parents.push(pid);
                included.add(pid);
                next.push(pid);
            }
            if (parents.length) children.set(id, parents);
        }
        frontier = next;
    }
    return { children, included };
}

/** BFS descendant walk through child links only. */
function buildDescendantSpine(
    proband: PersonId,
    childrenOf: ReadonlyMap<PersonId, PersonId[]>,
    visible: ReadonlySet<PersonId>,
): SpineSubtree {
    const children = new Map<PersonId, PersonId[]>();
    const included = new Set<PersonId>();
    const visited = new Set<PersonId>([proband]);
    let frontier: PersonId[] = [proband];
    while (frontier.length > 0) {
        const next: PersonId[] = [];
        for (const id of frontier) {
            const kids = (childrenOf.get(id) ?? []).filter(
                (c) => !visited.has(c) && visible.has(c),
            );
            if (kids.length === 0) continue;
            for (const c of kids) {
                visited.add(c);
                included.add(c);
                next.push(c);
            }
            children.set(id, kids);
        }
        frontier = next;
    }
    return { children, included };
}

function subtreeSizes(tree: ReadonlyMap<PersonId, PersonId[]>): Map<PersonId, number> {
    const sizes = new Map<PersonId, number>();
    function size(id: PersonId): number {
        const cached = sizes.get(id);
        if (cached !== undefined) return cached;
        let total = 1;
        for (const c of tree.get(id) ?? []) total += size(c);
        sizes.set(id, total);
        return total;
    }
    for (const id of tree.keys()) size(id);
    for (const arr of tree.values()) for (const c of arr) size(c);
    return sizes;
}

// ---------------------------------------------------------------------------
// Recursive spine layout (Lamping-Rao)
// ---------------------------------------------------------------------------

function layoutSpine(
    children: ReadonlyMap<PersonId, PersonId[]>,
    rootId: PersonId,
    rootZ: Complex,
    outwardDir: number,
    wedge: number,
    rootGen: number,
    sizes: ReadonlyMap<PersonId, number>,
    stepDistance: number,
    positions: Map<LayoutNodeId, LayoutPosition>,
    nodes: Map<LayoutNodeId, LayoutNode>,
    boundary: { hit: boolean },
): void {
    const kids = children.get(rootId);
    if (!kids || kids.length === 0) return;

    const weights = kids.map((c) => Math.log(1 + (sizes.get(c) ?? 1)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return;

    const childGen = rootGen + 1;
    let leftEdge = outwardDir - wedge / 2;
    for (let i = 0; i < kids.length; i += 1) {
        const id = kids[i]!;
        const childWedge = (wedge * weights[i]!) / total;
        const centre = leftEdge + childWedge / 2;
        const z = placeChild(rootZ, stepDistance, centre);
        positions.set(id, hypPos(z));
        setNode(nodes, id, childGen);
        if (abs(z) >= 1 - 1e-8) boundary.hit = true;
        layoutSpine(
            children,
            id,
            z,
            centre,
            childWedge,
            childGen,
            sizes,
            stepDistance,
            positions,
            nodes,
            boundary,
        );
        leftEdge += childWedge;
    }
}

// ---------------------------------------------------------------------------
// Lateral weave — spouses + off-spine subtrees
// ---------------------------------------------------------------------------

function weaveLaterals(
    tree: Tree,
    visible: ReadonlySet<PersonId>,
    onSpine: ReadonlySet<PersonId>,
    childrenOf: ReadonlyMap<PersonId, PersonId[]>,
    positions: Map<LayoutNodeId, LayoutPosition>,
    nodes: Map<LayoutNodeId, LayoutNode>,
    boundary: { hit: boolean },
    stepDistance: number,
    spouseAngle: number,
): void {
    // Walk every spouse pair: if exactly one side is on-spine, place the
    // other at a small angular offset adjacent to their spine partner.
    for (const couple of tree.couples) {
        const a = couple.leftId;
        const b = couple.rightId;
        if (!visible.has(a) || !visible.has(b)) continue;
        const aOn = onSpine.has(a);
        const bOn = onSpine.has(b);
        if (aOn === bOn) continue; // both on or both off — handled elsewhere
        const onId = aOn ? a : b;
        const offId = aOn ? b : a;
        if (positions.has(offId)) continue; // already placed (could share a spouse)
        const onPos = positions.get(onId);
        if (!onPos || onPos.space !== "hyperbolic") continue;
        const partnerZ = onPos.z;
        const onGen = nodes.get(onId)?.rank ?? 0;
        // Walk a small step orthogonal to the spine direction. Use the
        // partner's outward direction as the reference and add ±spouseAngle.
        const direction = Math.atan2(partnerZ.im, partnerZ.re) + spouseAngle;
        const z = placeChild(partnerZ, stepDistance * 0.4, direction);
        positions.set(offId, hypPos(z));
        setNode(nodes, offId, onGen);
        if (abs(z) >= 1 - 1e-8) boundary.hit = true;
    }

    // Place off-spine descendants of any placed person as a sub-wedge.
    // This handles aunts/uncles/cousins relative to the proband: an
    // ancestor's children-by-a-second-marriage who aren't the proband's
    // direct ancestor, plus their descendants.
    //
    // BFS from the placed set; each pass adds one generation of laterals.
    const placedFrontier: PersonId[] = [...positions.keys()].filter((id) => visible.has(id));
    const seen = new Set<PersonId>(placedFrontier);
    let frontier = placedFrontier.slice();
    while (frontier.length > 0) {
        const next: PersonId[] = [];
        for (const id of frontier) {
            const pos = positions.get(id);
            if (!pos || pos.space !== "hyperbolic") continue;
            const kids = (childrenOf.get(id) ?? []).filter((c) => !seen.has(c));
            if (kids.length === 0) continue;
            const parentZ = pos.z;
            const gen = (nodes.get(id)?.rank ?? 0) + 1;
            const direction =
                parentZ.re === 0 && parentZ.im === 0 ? 0 : Math.atan2(parentZ.im, parentZ.re);
            const wedge = Math.PI / 6; // 30° sub-wedge for off-spine kids
            let leftEdge = direction - wedge / 2;
            for (const k of kids) {
                seen.add(k);
                const centreAngle = leftEdge + wedge / (2 * kids.length);
                const z = placeChild(parentZ, stepDistance * 0.7, centreAngle);
                positions.set(k, hypPos(z));
                setNode(nodes, k, gen);
                if (abs(z) >= 1 - 1e-8) boundary.hit = true;
                leftEdge += wedge / kids.length;
                next.push(k);
            }
        }
        frontier = next;
    }
}

// ---------------------------------------------------------------------------
// Edge emission
// ---------------------------------------------------------------------------

function emitParentChildEdges(
    tree: Tree,
    visible: ReadonlySet<PersonId>,
    positions: ReadonlyMap<LayoutNodeId, LayoutPosition>,
    out: LayoutEdge[],
): void {
    // Group children by their (mother, father) couple key so the renderer
    // can collapse joint-children fans (same `bundleId`).
    const jointKey = (m: PersonId | undefined, f: PersonId | undefined): string | undefined => {
        if (!m && !f) return undefined;
        if (m && f) return m < f ? `couple:${m}|${f}` : `couple:${f}|${m}`;
        return `single:${(m ?? f) as PersonId}`;
    };

    for (const p of Object.values(tree.people)) {
        if (!visible.has(p.id)) continue;
        const childPos = positions.get(p.id);
        if (!childPos || childPos.space !== "hyperbolic") continue;
        for (const parentId of [p.motherId, p.fatherId]) {
            if (!parentId || !visible.has(parentId)) continue;
            const parentPos = positions.get(parentId);
            if (!parentPos || parentPos.space !== "hyperbolic") continue;
            const bundle = jointKey(p.motherId, p.fatherId);
            out.push({
                id: `parent:${parentId}→${p.id}`,
                persons: [parentId, p.id],
                style: "blood",
                route: { kind: "geodesic-arc", from: parentPos, to: childPos },
                ...(bundle !== undefined ? { bundleId: bundle } : {}),
            });
        }
    }
}

function emitMarriageEdges(
    tree: Tree,
    visible: ReadonlySet<PersonId>,
    positions: ReadonlyMap<LayoutNodeId, LayoutPosition>,
    out: LayoutEdge[],
): void {
    for (const couple of tree.couples) {
        const a = couple.leftId;
        const b = couple.rightId;
        if (!visible.has(a) || !visible.has(b)) continue;
        const aPos = positions.get(a);
        const bPos = positions.get(b);
        if (!aPos || aPos.space !== "hyperbolic") continue;
        if (!bPos || bPos.space !== "hyperbolic") continue;
        const sortedKey = a < b ? `${a}|${b}` : `${b}|${a}`;
        const style = couple.isCurrent === false ? "divorced" : "married";
        out.push({
            id: `bond:${sortedKey}:${String(couple.unionIndex)}`,
            persons: [a, b],
            style,
            route: { kind: "geodesic-arc", from: aPos, to: bPos },
            bundleId: `bond:${sortedKey}:${String(couple.unionIndex)}`,
        });
        markCoupleUsed(couple); // referenced for ts noUnusedParameters appeasement
    }
}

// no-op; kept so an unused `couple.unionIndex` reference doesn't get
// dropped by aggressive linting later
function markCoupleUsed(_c: CoupleRecord): void {}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function hypPos(z: Complex): LayoutPosition {
    return { space: "hyperbolic", z };
}

function setNode(nodes: Map<LayoutNodeId, LayoutNode>, id: PersonId, rank: number): void {
    nodes.set(id, { id, kind: "person", personId: id, rank });
}

// Geodesic type re-export so the renderer can import it from the engine
// boundary alongside `layoutHourglass`.
export type { Geodesic };
