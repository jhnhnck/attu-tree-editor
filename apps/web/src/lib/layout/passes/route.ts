/*
 * FamilyTreeEditor - edge routing pass.
 *
 * `route()` is the fourth pass in the layered layout pipeline:
 *
 *   place()  → PlacedGraph
 *     → route()  → RoutedGraph  (this file)
 *
 * Improvements over routeEdges():
 *   1. Reads ghost positions directly from PlacedGraph — no separate
 *      ghostPositions map needed.
 *   2. Gutter lane allocation: the space between each pair of adjacent ranks
 *      is divided into N_LANES horizontal slots. Multiple sibling-buses in
 *      the same gutter claim distinct y values so they never stack.
 *   3. Honest bridge hops: crossing detection is applied after all segments
 *      are placed, annotating only genuinely unavoidable crossings.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { PERSON_W, ROW_H } from "$lib/layout/hvLayout";
import type { LayoutNodeId, LayoutWarning, PlacedGraph, RoutedGraph } from "$lib/layout/ir";
import { parseGhostNodeId } from "$lib/layout/ir";
import type { EdgeRole, Segment } from "$lib/layout/edgeRouter";
import type { PersonId, Tree } from "$lib/domain/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_H = 1.2;
/** Vertical gap between card bottom and next rank's card top. */
const GUTTER_H = ROW_H - CARD_H; // 0.8 units
const N_LANES = 4;
const LANE_H = GUTTER_H / N_LANES; // 0.2 units per lane
const HOP_EPSILON = 0.001;

/**
 * Hard ceiling for the bond-span beyond which a bond becomes two stubs.
 * Adjacent DELTA-spaced spouses have a gap of DELTA − PERSON_W = 0.5 u.
 * Couples a few cluster-boundaries apart can be 8–20 u; only stub bonds
 * that are truly wall-to-wall (25+ u ≈ 2000 px at unit scale).
 *
 * Used as a ceiling — the effective threshold scales with placed.bbox.width
 * (`min(MAX_BOND_SPAN_CEILING, bbox.width / 4)`) so a tree wide enough that
 * 25 u is a small fraction of its span (e.g. a 1000-person mass) still emits
 * full bonds for moderate-distance couples instead of stubbing every one.
 * Phase 2's libavoid-routed bond bundles will replace this heuristic
 * outright.
 */
const MAX_BOND_SPAN_CEILING = 25; // units
/** Length of each stub segment (extends from the card edge outward). */
const STUB_LEN = 0.6; // units

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Produce routed edge segments from a placed graph.
 *
 * @param placed - Output of place().
 * @param tree   - Domain tree (needed for couple metadata: isCurrent).
 */
export function route(placed: PlacedGraph, tree: Tree): RoutedGraph {
    const warnings: LayoutWarning[] = [];
    const segments = buildSegments(placed, tree, warnings);
    return { placed, segments, warnings };
}

// ---------------------------------------------------------------------------
// Position helpers
// ---------------------------------------------------------------------------

interface Pos {
    readonly x: number;
    readonly y: number;
    readonly rank: number;
}

function getPos(placed: PlacedGraph, nodeId: LayoutNodeId): Pos | null {
    const node = placed.nodes.get(nodeId);
    if (!node) return null;
    return { x: placed.x.get(nodeId) ?? 0, y: placed.y.get(nodeId) ?? 0, rank: node.rank };
}

function midX(p: Pos): number {
    return p.x + PERSON_W / 2;
}
function midY(p: Pos): number {
    return p.y + CARD_H / 2;
}
function topY(p: Pos): number {
    return p.y;
}
function botY(p: Pos): number {
    return p.y + CARD_H;
}
function leftX(p: Pos): number {
    return p.x;
}
function rightX(p: Pos): number {
    return p.x + PERSON_W;
}

// ---------------------------------------------------------------------------
// Gutter lane allocator
// ---------------------------------------------------------------------------

/**
 * Assigns horizontal lane slots in each rank-boundary gutter so that
 * multiple sibling-buses sharing the same gutter never overlap in y.
 *
 * A lane reservation covers an [minX, maxX] x-extent. New allocations search
 * for the lowest-numbered lane that has no overlap with existing reservations
 * at the same x-extent.
 */
class GutterLanes {
    private readonly slots = new Map<number, Array<{ minX: number; maxX: number; lane: number }>>();

    alloc(gutterRank: number, minX: number, maxX: number): number {
        if (minX > maxX) {
            const t = minX;
            minX = maxX;
            maxX = t;
        }
        let list = this.slots.get(gutterRank);
        if (!list) {
            list = [];
            this.slots.set(gutterRank, list);
        }
        for (let lane = 0; lane < N_LANES + 16; lane++) {
            const blocked = list.some((s) => s.lane === lane && s.maxX > minX && s.minX < maxX);
            if (!blocked) {
                list.push({ minX, maxX, lane });
                return lane;
            }
        }
        return 0;
    }

    laneY(gutterRank: number, lane: number): number {
        return gutterRank * ROW_H + CARD_H + (lane + 0.5) * LANE_H;
    }
}

// ---------------------------------------------------------------------------
// Segment builder
// ---------------------------------------------------------------------------

function buildSegments(
    placed: PlacedGraph,
    tree: Tree,
    warnings: LayoutWarning[],
): readonly Segment[] {
    const out: Segment[] = [];
    const handled = new Set<PersonId>();
    const lanes = new GutterLanes();

    // Scale the stub-vs-bond threshold to the tree's overall width so it
    // doesn't fire indiscriminately on dense layouts where 25 u is a small
    // fraction of the canvas.
    const maxBondSpan = Math.min(MAX_BOND_SPAN_CEILING, placed.bbox.width / 4);

    // Drop-height invariant: parent-drop and child-drop segments are vertical
    // descents from a higher rank to a lower one, so y must increase. Negative
    // drops imply a layering bug upstream (most often single-parent rank
    // assignment in layer.ts for a cross-rank parent). The warning is
    // accumulated and surfaced via `__treeDebug.warnings[]`; root-cause fix
    // lives in a later phase.
    const pushDrop = (s: Segment): void => {
        if (s.y2 < s.y1 - 1e-6) {
            warnings.push({
                kind: "negative-drop",
                pass: "route",
                message: `negative drop height for ${s.kind} ${s.id}: ${String(s.y2 - s.y1)} u`,
                ids: [s.id],
                data: { y1: s.y1, y2: s.y2, drop: s.y2 - s.y1 },
            });
        }
        out.push(s);
    };

    // Ghost lookup: "personId|nearId" → ghostLayoutNodeId
    const ghostByKey = new Map<string, LayoutNodeId>();
    for (const [nodeId, node] of placed.nodes) {
        if (node.kind !== "ghost") continue;
        const p = parseGhostNodeId(nodeId);
        if (p) ghostByKey.set(`${p.ghostOf}|${p.nearId}`, nodeId);
    }

    // Joint children by sorted couple key
    const jointKids = new Map<string, PersonId[]>();
    for (const person of Object.values(tree.people)) {
        const m = person.motherId;
        const f = person.fatherId;
        if (!m || !f) continue;
        if (placed.nodes.get(m)?.kind !== "person") continue;
        if (placed.nodes.get(f)?.kind !== "person") continue;
        if (placed.nodes.get(person.id)?.kind !== "person") continue;
        const key = m < f ? `${m}|${f}` : `${f}|${m}`;
        const list = jointKids.get(key);
        if (list) list.push(person.id);
        else jointKids.set(key, [person.id]);
    }

    // -----------------------------------------------------------------------
    // (1) Bonds + couple edge groups
    // -----------------------------------------------------------------------
    for (const couple of tree.couples) {
        if (couple.leftId === couple.rightId) continue;
        if (placed.nodes.get(couple.leftId)?.kind !== "person") continue;
        if (placed.nodes.get(couple.rightId)?.kind !== "person") continue;

        const role: EdgeRole = couple.isCurrent === false ? "divorced" : "married";
        const couplePersons: PersonId[] = [couple.leftId, couple.rightId];
        const bondKey =
            couple.leftId < couple.rightId
                ? `${couple.leftId}|${couple.rightId}`
                : `${couple.rightId}|${couple.leftId}`;
        const bondIdBase = `bond:${bondKey}:${String(couple.unionIndex)}`;

        // Resolve effective layout node ids — use ghost if cross-rank so both
        // partners end up on the same rank for the bond geometry.
        let aId: LayoutNodeId = couple.leftId;
        let bId: LayoutNodeId = couple.rightId;
        const leftNode = placed.nodes.get(couple.leftId)!;
        const rightNode = placed.nodes.get(couple.rightId)!;
        if (leftNode.rank !== rightNode.rank) {
            const ghostOfRight = ghostByKey.get(`${couple.rightId}|${couple.leftId}`);
            const ghostOfLeft = ghostByKey.get(`${couple.leftId}|${couple.rightId}`);
            if (ghostOfRight) bId = ghostOfRight;
            else if (ghostOfLeft) aId = ghostOfLeft;
        }

        const aPos = getPos(placed, aId);
        const bPos = getPos(placed, bId);
        if (!aPos || !bPos) continue;

        if (aPos.rank === bPos.rank) {
            // ── Horizontal bond ──────────────────────────────────────────────
            const [l, r] = midX(aPos) <= midX(bPos) ? [aPos, bPos] : [bPos, aPos];
            const bondY = (midY(l) + midY(r)) / 2;
            const bondSpan = leftX(r) - rightX(l);
            const isLongBond = bondSpan > maxBondSpan;

            if (isLongBond) {
                // Partners are in distant subtree clusters; draw two short stubs
                // rather than a wall-to-wall line.
                out.push({
                    id: `${bondIdBase}/stub-l`,
                    kind: "stub",
                    role,
                    x1: rightX(l),
                    y1: bondY,
                    x2: rightX(l) + STUB_LEN,
                    y2: bondY,
                    persons: couplePersons,
                });
                out.push({
                    id: `${bondIdBase}/stub-r`,
                    kind: "stub",
                    role,
                    x1: leftX(r) - STUB_LEN,
                    y1: bondY,
                    x2: leftX(r),
                    y2: bondY,
                    persons: couplePersons,
                });
            } else {
                out.push({
                    id: bondIdBase,
                    kind: "bond",
                    role,
                    x1: rightX(l),
                    y1: bondY,
                    x2: leftX(r),
                    y2: bondY,
                    persons: couplePersons,
                });
            }

            // Children of this couple
            const childIds = jointKids.get(bondKey) ?? [];
            const childPosns = childIds
                .map((id): { id: PersonId; pos: Pos } | null => {
                    const p = getPos(placed, id);
                    return p ? { id, pos: p } : null;
                })
                .filter((c): c is { id: PersonId; pos: Pos } => c !== null);

            if (childPosns.length > 0) {
                // For long bonds the two partners are far apart; anchor the
                // parent-drop at the centroid of the children so it lands near
                // the family rather than floating in empty canvas space.
                const bondX = isLongBond
                    ? childPosns.reduce((s, c) => s + midX(c.pos), 0) / childPosns.length
                    : (rightX(l) + leftX(r)) / 2;
                const xs = childPosns.map((c) => midX(c.pos));
                const busMinX = Math.min(...xs, bondX);
                const busMaxX = Math.max(...xs, bondX);
                const lane = lanes.alloc(aPos.rank, busMinX, busMaxX);
                const busY = lanes.laneY(aPos.rank, lane);

                pushDrop({
                    id: `couple:${bondKey}/drop`,
                    kind: "parent-drop",
                    role: "blood",
                    x1: bondX,
                    y1: bondY,
                    x2: bondX,
                    y2: busY,
                    persons: couplePersons,
                });
                if (busMinX < busMaxX) {
                    out.push({
                        id: `couple:${bondKey}/bus`,
                        kind: "sibling-bus",
                        role: "blood",
                        x1: busMinX,
                        y1: busY,
                        x2: busMaxX,
                        y2: busY,
                        persons: couplePersons,
                    });
                }

                const deepestByX = new Map<number, { y: number; id: PersonId }>();
                for (const { id, pos } of childPosns) {
                    const cx = midX(pos);
                    const cy = topY(pos);
                    const cur = deepestByX.get(cx);
                    if (!cur || cy > cur.y) deepestByX.set(cx, { y: cy, id });
                    handled.add(id);
                }
                for (const [cx, { y, id }] of deepestByX) {
                    pushDrop({
                        id: `couple:${bondKey}/child:${id}`,
                        kind: "child-drop",
                        role: "blood",
                        x1: cx,
                        y1: busY,
                        x2: cx,
                        y2: y,
                        persons: [couple.leftId, couple.rightId, id],
                    });
                }
            }
        } else {
            // ── L-bond (genuine cross-rank, no ghost available) ──────────────
            const [upper, lower] = aPos.rank < bPos.rank ? [aPos, bPos] : [bPos, aPos];
            const upperRank = Math.min(aPos.rank, bPos.rank);
            const ux = midX(upper);
            const lx = midX(lower);
            const lane = lanes.alloc(upperRank, Math.min(ux, lx), Math.max(ux, lx));
            const midYVal = lanes.laneY(upperRank, lane);
            // Always emit the two vertical legs.
            out.push({
                id: `${bondIdBase}/v1`,
                kind: "bond",
                role,
                x1: ux,
                y1: botY(upper),
                x2: ux,
                y2: midYVal,
                persons: couplePersons,
            });
            out.push({
                id: `${bondIdBase}/v2`,
                kind: "bond",
                role,
                x1: lx,
                y1: midYVal,
                x2: lx,
                y2: topY(lower),
                persons: couplePersons,
            });
            // For the horizontal cross-piece, stub when the partners are far
            // apart so we avoid a wall-to-wall line through unrelated subtrees.
            if (Math.abs(lx - ux) > maxBondSpan) {
                out.push({
                    id: `${bondIdBase}/stub-l`,
                    kind: "stub",
                    role,
                    x1: ux,
                    y1: midYVal,
                    x2: ux + STUB_LEN,
                    y2: midYVal,
                    persons: couplePersons,
                });
                out.push({
                    id: `${bondIdBase}/stub-r`,
                    kind: "stub",
                    role,
                    x1: lx - STUB_LEN,
                    y1: midYVal,
                    x2: lx,
                    y2: midYVal,
                    persons: couplePersons,
                });
            } else {
                out.push({
                    id: `${bondIdBase}/h`,
                    kind: "bond",
                    role,
                    x1: ux,
                    y1: midYVal,
                    x2: lx,
                    y2: midYVal,
                    persons: couplePersons,
                });
            }
        }
    }

    // -----------------------------------------------------------------------
    // (2) Single-parent drops (children not already joint-handled)
    // -----------------------------------------------------------------------
    const byParent = new Map<
        PersonId,
        { parentPos: Pos; kids: Array<{ id: PersonId; pos: Pos }> }
    >();
    for (const person of Object.values(tree.people)) {
        if (handled.has(person.id)) continue;
        const cPos = getPos(placed, person.id);
        if (!cPos) continue;
        for (const parentId of [person.motherId, person.fatherId]) {
            if (!parentId) continue;
            const pPos = getPos(placed, parentId);
            if (!pPos) continue;
            const entry = byParent.get(parentId);
            if (entry) entry.kids.push({ id: person.id, pos: cPos });
            else byParent.set(parentId, { parentPos: pPos, kids: [{ id: person.id, pos: cPos }] });
        }
    }

    for (const [parentId, { parentPos, kids }] of byParent) {
        const dropX = midX(parentPos);
        const dropFromY = botY(parentPos);

        if (kids.length === 1) {
            const c = kids[0]!;
            const cx = midX(c.pos);
            const cy = topY(c.pos);
            if (Math.abs(cx - dropX) < 1e-6) {
                pushDrop({
                    id: `single:${parentId}/${c.id}`,
                    kind: "child-drop",
                    role: "blood",
                    x1: dropX,
                    y1: dropFromY,
                    x2: cx,
                    y2: cy,
                    persons: [parentId, c.id],
                });
            } else {
                const lane = lanes.alloc(parentPos.rank, Math.min(dropX, cx), Math.max(dropX, cx));
                const busY = lanes.laneY(parentPos.rank, lane);
                pushDrop({
                    id: `single:${parentId}/${c.id}/v1`,
                    kind: "parent-drop",
                    role: "blood",
                    x1: dropX,
                    y1: dropFromY,
                    x2: dropX,
                    y2: busY,
                    persons: [parentId, c.id],
                });
                out.push({
                    id: `single:${parentId}/${c.id}/h`,
                    kind: "sibling-bus",
                    role: "blood",
                    x1: dropX,
                    y1: busY,
                    x2: cx,
                    y2: busY,
                    persons: [parentId, c.id],
                });
                pushDrop({
                    id: `single:${parentId}/${c.id}/v2`,
                    kind: "child-drop",
                    role: "blood",
                    x1: cx,
                    y1: busY,
                    x2: cx,
                    y2: cy,
                    persons: [parentId, c.id],
                });
            }
        } else {
            const xs = kids.map((k) => midX(k.pos));
            const busMinX = Math.min(...xs, dropX);
            const busMaxX = Math.max(...xs, dropX);
            const lane = lanes.alloc(parentPos.rank, busMinX, busMaxX);
            const busY = lanes.laneY(parentPos.rank, lane);
            pushDrop({
                id: `single:${parentId}/drop`,
                kind: "parent-drop",
                role: "blood",
                x1: dropX,
                y1: dropFromY,
                x2: dropX,
                y2: busY,
                persons: [parentId],
            });
            if (busMinX < busMaxX) {
                out.push({
                    id: `single:${parentId}/bus`,
                    kind: "sibling-bus",
                    role: "blood",
                    x1: busMinX,
                    y1: busY,
                    x2: busMaxX,
                    y2: busY,
                    persons: [parentId],
                });
            }
            const deepestByX = new Map<number, { y: number; id: PersonId }>();
            for (const k of kids) {
                const cx = midX(k.pos);
                const cy = topY(k.pos);
                const cur = deepestByX.get(cx);
                if (!cur || cy > cur.y) deepestByX.set(cx, { y: cy, id: k.id });
            }
            for (const [cx, { y, id }] of deepestByX) {
                pushDrop({
                    id: `single:${parentId}/child:${id}`,
                    kind: "child-drop",
                    role: "blood",
                    x1: cx,
                    y1: busY,
                    x2: cx,
                    y2: y,
                    persons: [parentId, id],
                });
            }
        }
    }

    return annotateHops(out.filter((s) => s.x1 !== s.x2 || s.y1 !== s.y2));
}

// ---------------------------------------------------------------------------
// Bridge hop annotation
// ---------------------------------------------------------------------------

function annotateHops(segments: readonly Segment[]): Segment[] {
    const isV = (s: Segment): boolean => s.x1 === s.x2 && s.y1 !== s.y2;
    const isH = (s: Segment): boolean => s.y1 === s.y2 && s.x1 !== s.x2;
    const horizontals = segments.filter(isH);
    const out: Segment[] = [];
    for (const seg of segments) {
        if (!isV(seg)) {
            out.push(seg);
            continue;
        }
        const minY = Math.min(seg.y1, seg.y2);
        const maxY = Math.max(seg.y1, seg.y2);
        const x = seg.x1;
        const hops: number[] = [];
        for (const h of horizontals) {
            if (h.y1 <= minY || h.y1 >= maxY) continue;
            const hMinX = Math.min(h.x1, h.x2);
            const hMaxX = Math.max(h.x1, h.x2);
            if (x <= hMinX || x >= hMaxX) continue;
            if (sameGroup(seg.id, h.id)) continue;
            hops.push(h.y1 + HOP_EPSILON);
        }
        if (hops.length === 0) {
            out.push(seg);
            continue;
        }
        hops.sort((a, b) => a - b);
        out.push({ ...seg, hops });
    }
    return out;
}

function sameGroup(idA: string, idB: string): boolean {
    const a = idA.split("/", 1)[0];
    const b = idB.split("/", 1)[0];
    return a !== undefined && a === b;
}
