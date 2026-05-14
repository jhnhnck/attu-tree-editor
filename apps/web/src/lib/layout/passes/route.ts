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

import { PERSON_W, ROW_H } from "$lib/layout/constants";
import type { LayoutNodeId, LayoutWarning, PlacedGraph, RoutedGraph } from "$lib/layout/ir";
import { parseGhostNodeId } from "$lib/layout/ir";
import type { EdgeRole, Segment } from "$lib/layout/edgeRouter";
import { buildLcaIndex, lca, type LcaIndex } from "$lib/layout/probandTree";
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
    const bundled = bundleLongBonds(segments, placed, tree);
    return { placed, segments: bundled, warnings };
}

// ---------------------------------------------------------------------------
// Phase 4.4 — Holten-style cross-lineage edge bundling
// ---------------------------------------------------------------------------

/**
 * Beyond this routed-x extent (in units) a same-rank bond reads as visually
 * "long" and benefits from Holten 2006 hierarchical bundling: bend the bond
 * toward the LCA of its endpoints in the proband-rooted BFS tree, so the
 * connection follows the inclusion hierarchy instead of cutting across the
 * canvas.
 */
const BUNDLE_THRESHOLD = 8 * ROW_H;

/**
 * Holten 2006 bundling, restricted to long horizontal bonds. Each candidate
 * bond stays as a single Segment but gains a quadratic-Bezier control point;
 * the renderer interprets `bundleControl` as a `Q` command.
 *
 * The control point lives at (lca.x + PERSON_W/2, lca.y + CARD_H/2) — the
 * midpoint of the LCA's card. With the Bezier endpoints on the partners'
 * inner edges, the curve bows toward the LCA's column, visually grouping
 * bonds whose endpoints share a recent common ancestor with the proband.
 */
function bundleLongBonds(
    segments: readonly Segment[],
    placed: PlacedGraph,
    tree: Tree,
): readonly Segment[] {
    if (!tree.people[tree.rootId]) return segments;
    let idx: LcaIndex | null = null; // build lazily; many trees have no long bonds.
    const out: Segment[] = [];
    for (const seg of segments) {
        if (!isLongBond(seg)) {
            out.push(seg);
            continue;
        }
        const [a, b] = seg.persons;
        if (!a || !b) {
            out.push(seg);
            continue;
        }
        idx ??= buildLcaIndex(tree, tree.rootId);
        const anc = lca(idx, a, b);
        if (!anc) {
            out.push(seg);
            continue;
        }
        const ax = placed.x.get(anc);
        const ay = placed.y.get(anc);
        if (ax === undefined || ay === undefined) {
            out.push(seg);
            continue;
        }
        out.push({
            ...seg,
            bundleControl: { x: ax + PERSON_W / 2, y: ay + CARD_H / 2 },
        });
    }
    return out;
}

function isLongBond(seg: Segment): boolean {
    if (seg.kind !== "bond") return false;
    if (seg.y1 !== seg.y2) return false; // L-bond verticals already curve geometrically
    return Math.abs(seg.x2 - seg.x1) >= BUNDLE_THRESHOLD;
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
// Port-aware drop direction
// ---------------------------------------------------------------------------

type DropDirection = "down" | "up" | "level";

interface DropPorts {
    readonly direction: DropDirection;
    /** y of the parent's exit port (bottom-mid normally; top-mid when going up). */
    readonly parentExitY: number;
    /** y of the child's entry port (top-mid normally; bottom-mid when going up). */
    readonly childEntryY: number;
    /** Gutter rank — the bus sits below this rank. min(parent, child). */
    readonly gutterRank: number;
}

/**
 * Pedigree DAGs (pedigree-collapse, cycles via remarriage) can land a parent
 * at a higher rank than their child — `passes/layer.ts`'s longest-path pass
 * is forced into a single rank when paths through different ancestors
 * disagree, so the loser gets routed "up". Pick the port-pair that keeps the
 * resulting drop visually coherent: parent exits the edge of its card that
 * faces the child, child enters the edge that faces the parent, and the bus
 * sits in the single-rank gap between them.
 */
function pickDropPorts(parentPos: Pos, childPos: Pos): DropPorts {
    if (parentPos.rank < childPos.rank) {
        return {
            direction: "down",
            parentExitY: botY(parentPos),
            childEntryY: topY(childPos),
            gutterRank: parentPos.rank,
        };
    }
    if (parentPos.rank > childPos.rank) {
        return {
            direction: "up",
            parentExitY: topY(parentPos),
            childEntryY: botY(childPos),
            gutterRank: childPos.rank,
        };
    }
    // Same-rank parent-child (pedigree-DAG cycle artefact). Bus right
    // alongside them; ports use mid-Y on both sides.
    return {
        direction: "level",
        parentExitY: midY(parentPos),
        childEntryY: midY(childPos),
        gutterRank: parentPos.rank,
    };
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
        // Clamp lane-y to within the gutter band. Without this the allocator
        // happily emits lanes ≥ N_LANES when many buses overlap, which
        // pushes the bus y into the next row's card AABB and produces
        // negative-direction drops by ≈0.1 u. Clamping keeps the bus inside
        // [CARD_H, ROW_H − 0.05]; visually a few buses stack at the bottom
        // of the gutter, which is preferable to crossing a card.
        const offset = Math.min((lane + 0.5) * LANE_H, GUTTER_H - 0.05);
        return gutterRank * ROW_H + CARD_H + offset;
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
    // Drafts hold every Segment field except `bundleId`; we derive that
    // once at the end from each id's prefix (everything up to the first
    // `/`). Keeps the many emission sites short and the bundle key in
    // lockstep with the id naming convention.
    type SegmentDraft = Omit<Segment, "bundleId">;
    const out: SegmentDraft[] = [];
    const handled = new Set<PersonId>();
    const lanes = new GutterLanes();

    // Scale the stub-vs-bond threshold to the tree's overall width so it
    // doesn't fire indiscriminately on dense layouts where 25 u is a small
    // fraction of the canvas. Floor at BUNDLE_THRESHOLD so small fixtures
    // (where bbox.width/4 collapses to a few units) don't mis-classify
    // short bonds as long — fixes bugs.md:17.
    const maxBondSpan = Math.min(
        MAX_BOND_SPAN_CEILING,
        Math.max(BUNDLE_THRESHOLD, placed.bbox.width / 4),
    );

    // Drop-direction invariant: a parent-drop / child-drop segment is vertical
    // and must agree with its expected direction (`down` for a parent above
    // the child, `up` for a parent below — pedigree-DAG case). A mismatch
    // means port selection upstream picked the wrong card edge; warn and
    // surface via `__treeDebug.warnings[]`.
    const pushDrop = (s: SegmentDraft, expectedDirection: DropDirection): void => {
        const dy = s.y2 - s.y1;
        const wrong =
            (expectedDirection === "down" && dy < -1e-6) ||
            (expectedDirection === "up" && dy > 1e-6);
        if (wrong) {
            warnings.push({
                kind: "negative-drop",
                pass: "route",
                message: `wrong-direction ${s.kind} ${s.id}: expected ${expectedDirection}, got dy=${String(dy)} u`,
                ids: [s.id],
                data: { y1: s.y1, y2: s.y2, drop: dy, expected: expectedDirection },
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
                // Group kids by drop direction relative to the bond. A
                // pedigree-DAG can land a kid at lower rank than the bond
                // (the "up" group); in that case the bus belongs above the
                // parents' row, and the parent-drop exits the bond going up.
                // Bond's y is between the partners' mid-Y (same rank, equal),
                // so any kid with rank < bond.rank routes "up" and rank >
                // bond.rank routes "down".
                type Group = { dir: DropDirection; kids: typeof childPosns };
                const downKids = childPosns.filter((c) => c.pos.rank > aPos.rank);
                const upKids = childPosns.filter((c) => c.pos.rank < aPos.rank);
                const levelKids = childPosns.filter((c) => c.pos.rank === aPos.rank);
                const groups: Group[] = [];
                if (downKids.length) groups.push({ dir: "down", kids: downKids });
                if (upKids.length) groups.push({ dir: "up", kids: upKids });
                if (levelKids.length) groups.push({ dir: "level", kids: levelKids });

                for (const group of groups) {
                    // For long bonds the partners are far apart; anchor the
                    // parent-drop at the children centroid so it lands near
                    // the family rather than floating in empty canvas space.
                    const bondX = isLongBond
                        ? group.kids.reduce((s, c) => s + midX(c.pos), 0) / group.kids.length
                        : (rightX(l) + leftX(r)) / 2;
                    const xs = group.kids.map((c) => midX(c.pos));
                    const busMinX = Math.min(...xs, bondX);
                    const busMaxX = Math.max(...xs, bondX);
                    // gutterRank: down → parents' rank (bus below them);
                    // up → kid's rank (bus below kid, above parents).
                    const gutterRank =
                        group.dir === "down"
                            ? aPos.rank
                            : group.dir === "up"
                              ? group.kids[0]!.pos.rank
                              : aPos.rank;
                    const lane = lanes.alloc(gutterRank, busMinX, busMaxX);
                    const busY = lanes.laneY(gutterRank, lane);
                    // Bond exit-y: for down, the bond itself is the source
                    // (drop hangs from it); for up, the parent-drop exits
                    // the bond upward toward the bus above.
                    const bondExitY = bondY;
                    const groupSuffix = group.dir === "down" ? "" : `-${group.dir}`;

                    pushDrop(
                        {
                            id: `couple:${bondKey}/drop${groupSuffix}`,
                            kind: "parent-drop",
                            role: "blood",
                            x1: bondX,
                            y1: bondExitY,
                            x2: bondX,
                            y2: busY,
                            persons: couplePersons,
                        },
                        group.dir,
                    );
                    if (busMinX < busMaxX) {
                        out.push({
                            id: `couple:${bondKey}/bus${groupSuffix}`,
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
                    for (const { id, pos } of group.kids) {
                        const cx = midX(pos);
                        // child entry-y depends on direction: top for down,
                        // bot for up, mid for level.
                        const cy =
                            group.dir === "down"
                                ? topY(pos)
                                : group.dir === "up"
                                  ? botY(pos)
                                  : midY(pos);
                        const cur = deepestByX.get(cx);
                        const better =
                            group.dir === "down"
                                ? cy > (cur?.y ?? -Infinity)
                                : cy < (cur?.y ?? Infinity);
                        if (!cur || better) deepestByX.set(cx, { y: cy, id });
                        handled.add(id);
                    }
                    for (const [cx, { y, id }] of deepestByX) {
                        pushDrop(
                            {
                                id: `couple:${bondKey}/child${groupSuffix}:${id}`,
                                kind: "child-drop",
                                role: "blood",
                                x1: cx,
                                y1: busY,
                                x2: cx,
                                y2: y,
                                persons: [couple.leftId, couple.rightId, id],
                            },
                            group.dir,
                        );
                    }
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

        // Partition kids by direction relative to parent. Same-rank kids
        // (pedigree-DAG cycle artefact) are rare; bundle them into "level".
        type GroupKid = { id: PersonId; pos: Pos };
        const downKids: GroupKid[] = kids.filter((k) => k.pos.rank > parentPos.rank);
        const upKids: GroupKid[] = kids.filter((k) => k.pos.rank < parentPos.rank);
        const levelKids: GroupKid[] = kids.filter((k) => k.pos.rank === parentPos.rank);

        const groups: Array<{ dir: DropDirection; kids: GroupKid[] }> = [];
        if (downKids.length) groups.push({ dir: "down", kids: downKids });
        if (upKids.length) groups.push({ dir: "up", kids: upKids });
        if (levelKids.length) groups.push({ dir: "level", kids: levelKids });

        for (const group of groups) {
            const groupSuffix = group.dir === "down" ? "" : `-${group.dir}`;

            if (group.kids.length === 1) {
                const c = group.kids[0]!;
                const ports = pickDropPorts(parentPos, c.pos);
                const cx = midX(c.pos);
                if (Math.abs(cx - dropX) < 1e-6 && group.dir !== "level") {
                    pushDrop(
                        {
                            id: `single:${parentId}/${c.id}${groupSuffix}`,
                            kind: "child-drop",
                            role: "blood",
                            x1: dropX,
                            y1: ports.parentExitY,
                            x2: cx,
                            y2: ports.childEntryY,
                            persons: [parentId, c.id],
                        },
                        ports.direction,
                    );
                } else {
                    const lane = lanes.alloc(
                        ports.gutterRank,
                        Math.min(dropX, cx),
                        Math.max(dropX, cx),
                    );
                    const busY = lanes.laneY(ports.gutterRank, lane);
                    pushDrop(
                        {
                            id: `single:${parentId}/${c.id}${groupSuffix}/v1`,
                            kind: "parent-drop",
                            role: "blood",
                            x1: dropX,
                            y1: ports.parentExitY,
                            x2: dropX,
                            y2: busY,
                            persons: [parentId, c.id],
                        },
                        ports.direction,
                    );
                    out.push({
                        id: `single:${parentId}/${c.id}${groupSuffix}/h`,
                        kind: "sibling-bus",
                        role: "blood",
                        x1: dropX,
                        y1: busY,
                        x2: cx,
                        y2: busY,
                        persons: [parentId, c.id],
                    });
                    pushDrop(
                        {
                            id: `single:${parentId}/${c.id}${groupSuffix}/v2`,
                            kind: "child-drop",
                            role: "blood",
                            x1: cx,
                            y1: busY,
                            x2: cx,
                            y2: ports.childEntryY,
                            persons: [parentId, c.id],
                        },
                        ports.direction,
                    );
                }
            } else {
                // Multi-kid: all kids in a group share rank-direction; pick
                // any kid for the gutterRank decision (they all give the
                // same answer).
                const sample = pickDropPorts(parentPos, group.kids[0]!.pos);
                const xs = group.kids.map((k) => midX(k.pos));
                const busMinX = Math.min(...xs, dropX);
                const busMaxX = Math.max(...xs, dropX);
                const lane = lanes.alloc(sample.gutterRank, busMinX, busMaxX);
                const busY = lanes.laneY(sample.gutterRank, lane);
                pushDrop(
                    {
                        id: `single:${parentId}/drop${groupSuffix}`,
                        kind: "parent-drop",
                        role: "blood",
                        x1: dropX,
                        y1: sample.parentExitY,
                        x2: dropX,
                        y2: busY,
                        persons: [parentId],
                    },
                    sample.direction,
                );
                if (busMinX < busMaxX) {
                    out.push({
                        id: `single:${parentId}/bus${groupSuffix}`,
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
                for (const k of group.kids) {
                    const ports = pickDropPorts(parentPos, k.pos);
                    const cx = midX(k.pos);
                    const cy = ports.childEntryY;
                    const cur = deepestByX.get(cx);
                    const better =
                        sample.direction === "down"
                            ? cy > (cur?.y ?? -Infinity)
                            : cy < (cur?.y ?? Infinity);
                    if (!cur || better) deepestByX.set(cx, { y: cy, id: k.id });
                }
                for (const [cx, { y, id }] of deepestByX) {
                    pushDrop(
                        {
                            id: `single:${parentId}/child${groupSuffix}:${id}`,
                            kind: "child-drop",
                            role: "blood",
                            x1: cx,
                            y1: busY,
                            x2: cx,
                            y2: y,
                            persons: [parentId, id],
                        },
                        sample.direction,
                    );
                }
            }
        }
    }

    const bundleIdOf = (id: string): string => {
        const i = id.indexOf("/");
        return i === -1 ? id : id.slice(0, i);
    };
    const detoured = detourAroundCards(
        out.filter((s) => s.x1 !== s.x2 || s.y1 !== s.y2),
        placed,
    );
    const bundled: Segment[] = detoured.map((s) => ({ ...s, bundleId: bundleIdOf(s.id) }));
    return annotateHops(bundled);
}

// ---------------------------------------------------------------------------
// Obstacle avoidance: detour horizontal segments around unrelated card AABBs
// ---------------------------------------------------------------------------

/** Vertical clearance between a detour leg and the card it bypasses. */
const DETOUR_CLEAR = 0.15; // units
/** Horizontal pad either side of the obstacle's AABB. */
const DETOUR_PAD = 0.1; // units

/**
 * Horizontals (bonds, sibling-buses, stub legs) emitted by `buildSegments` are
 * straight x1→x2 chords with no awareness of card AABBs in between. On dense
 * rows that often produces a bond passing visually through a third party — the
 * Kadar Arkaran DEMO bug, where Kadar↔Harmain crosses Araim's intervening
 * ghost card. This pass detours each horizontal around any unrelated card it
 * crosses by punching a small rectangular bump (clear → over the top → back
 * down) above the obstacle.
 *
 * Verticals are not detoured: drops run at card-mid-x (their own card's
 * column), so they live inside their card's AABB by construction.
 */
function detourAroundCards(
    drafts: readonly Omit<Segment, "bundleId">[],
    placed: PlacedGraph,
): Omit<Segment, "bundleId">[] {
    // Snapshot card AABBs. For ghosts, the AABB is the same shape; the
    // owner-personId comes from the ghost's `personId` field.
    interface Obstacle {
        readonly x1: number;
        readonly y1: number;
        readonly x2: number;
        readonly y2: number;
        readonly ownerId: PersonId;
    }
    const obstacles: Obstacle[] = [];
    for (const [nodeId, node] of placed.nodes) {
        const x = placed.x.get(nodeId);
        const y = placed.y.get(nodeId);
        if (x === undefined || y === undefined) continue;
        obstacles.push({
            x1: x,
            y1: y,
            x2: x + PERSON_W,
            y2: y + CARD_H,
            ownerId: node.personId,
        });
    }

    const out: Omit<Segment, "bundleId">[] = [];
    for (const seg of drafts) {
        const isHoriz = seg.y1 === seg.y2 && seg.x1 !== seg.x2;
        if (!isHoriz) {
            out.push(seg);
            continue;
        }
        // Vertical drops are not detoured (see header).
        if (seg.kind !== "bond" && seg.kind !== "sibling-bus" && seg.kind !== "stub") {
            out.push(seg);
            continue;
        }
        const segMinX = Math.min(seg.x1, seg.x2);
        const segMaxX = Math.max(seg.x1, seg.x2);
        const y = seg.y1;
        const owners = new Set<PersonId>(seg.persons);
        // Collect crossing obstacles: AABB crosses y, x-overlap, owner not in segment's persons.
        const crossings = obstacles
            .filter((o) => owners.size === 0 || !owners.has(o.ownerId))
            .filter((o) => y > o.y1 + 1e-6 && y < o.y2 - 1e-6)
            .filter((o) => o.x2 > segMinX + 1e-6 && o.x1 < segMaxX - 1e-6)
            .sort((a, b) => a.x1 - b.x1);
        if (crossings.length === 0) {
            out.push(seg);
            continue;
        }
        // Walk the segment LEFT to RIGHT regardless of (x1,x2) order — the
        // emitted detour rectangle represents the same line either way; the
        // renderer is direction-agnostic. Doing the walk in canonical L→R
        // order lets us iterate obstacles in the same order without
        // crossing previously-visited obstacles on the approach leg.
        const detourY = crossings[0]!.y1 - DETOUR_CLEAR;
        let cursorX = segMinX;
        for (let i = 0; i < crossings.length; i += 1) {
            const o = crossings[i]!;
            const leftEdge = Math.max(segMinX, o.x1 - DETOUR_PAD);
            const rightEdge = Math.min(segMaxX, o.x2 + DETOUR_PAD);
            // Approach horizontal up to the obstacle's leading edge.
            if (Math.abs(cursorX - leftEdge) > 1e-6) {
                out.push({
                    ...seg,
                    id: `${seg.id}/d${String(i)}/h1`,
                    x1: cursorX,
                    y1: y,
                    x2: leftEdge,
                    y2: y,
                });
            }
            // Vertical leg up to detourY.
            out.push({
                ...seg,
                id: `${seg.id}/d${String(i)}/v1`,
                x1: leftEdge,
                y1: y,
                x2: leftEdge,
                y2: detourY,
            });
            // Detour horizontal over the obstacle.
            out.push({
                ...seg,
                id: `${seg.id}/d${String(i)}/h2`,
                x1: leftEdge,
                y1: detourY,
                x2: rightEdge,
                y2: detourY,
            });
            // Vertical leg back down to y.
            out.push({
                ...seg,
                id: `${seg.id}/d${String(i)}/v2`,
                x1: rightEdge,
                y1: detourY,
                x2: rightEdge,
                y2: y,
            });
            cursorX = rightEdge;
        }
        // Tail of the original segment up to segMaxX.
        if (Math.abs(cursorX - segMaxX) > 1e-6) {
            out.push({
                ...seg,
                id: `${seg.id}/d-tail`,
                x1: cursorX,
                y1: y,
                x2: segMaxX,
                y2: y,
            });
        }
    }
    return out;
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
