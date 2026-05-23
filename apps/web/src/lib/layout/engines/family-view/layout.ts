/*
 * FamilyTreeEditor - family-view geometry pass.
 *
 * Phase 1 promotion of the Phase 0 walking skeleton. Takes the bounded
 * subset (expansion-aware, from `subset.ts`) and assigns each visible
 * person a position in unit space, emitting `UnionAnchor`s, edges, and
 * `BadgeNode`s for collapsed branches.
 *
 * Auto-collapse rule: once the visible-card count exceeds
 * `AUTO_COLLAPSE_THRESHOLD` (50), the layout pass iteratively replaces
 * the lowest-DOI sibling block with a badge until the count fits.
 * User-explicit expands are never auto-collapsed.
 *
 * Geometry:
 *   - One row per rank. Default-height rows are separated by ROW_H
 *     (1.2 card + 0.8 gutter); a row containing a portrait card pushes
 *     every subsequent rank down by the height delta via the cumulative
 *     rank-y pass in `computeLayout`.
 *   - Couples render as two cards joined by a horizontal connector at
 *     the row midline. Children hang from the connector midpoint via a
 *     vertical drop into a horizontal bus on the children's row.
 *   - Single-parent children emit a degenerate `union-anchor` with one
 *     `partnerId`; rendered as a simple drop from the lone parent.
 *   - Edge `role` is read from `roleFor()`, which today returns "blood"
 *     for every drop. Call site exists for the relationship-vocab
 *     stroke palette to plug in.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { PERSON_W, ROW_H, SIBLING_GAP, SUBTREE_GAP } from "$lib/layout/constants";
import { computeDoiScores } from "$lib/layout/doi";
import type { CoupleRecord, PersonId, Tree } from "$lib/domain/types";
import { getParents, getUnions } from "$lib/domain/tree";
import {
    orientCouple,
    otherUnionsOf,
    resolvePrimary,
    unionCount,
} from "$lib/layout/engines/family-view/couples";
import {
    computeManifold,
    PRIMARY_PRIMITIVE,
} from "$lib/layout/engines/family-view/nPartnerGeometry";
import { buildOverlays } from "$lib/layout/engines/family-view/overlays";
import { buildGroups } from "$lib/layout/engines/family-view/groups";
import type {
    BadgeNode,
    FamilyViewEdge,
    FamilyViewEdgeRole,
    FamilyViewLayout,
    FamilyViewNode,
    MultiUnionMate,
    UnionAnchor,
} from "$lib/layout/engines/family-view/types";
import { selectBoundedSubset, type RankedSubset } from "$lib/layout/engines/family-view/subset";

/** Default card height in unit space - used as the fallback when a node carries no explicit `h`. */
export const CARD_H = 1.2;
/** Card height when a portrait is present - exactly double the default, so a 3:4 portrait slot reads as a portrait, not a strip. */
export const CARD_H_WITH_PORTRAIT = CARD_H * 2;
/**
 * Vertical gap between the bottom of one rank and the top of the next,
 * matching the default-card spacing ROW_H - CARD_H = 0.8. Used by the
 * cumulative-rank-y pass so non-portrait rows stay spaced exactly like
 * `rank * ROW_H` and portrait rows expand downstream ranks by the
 * height delta instead of overlapping them.
 */
export const RANK_GUTTER = ROW_H - CARD_H;
/**
 * Phase-2 visual-fixup: distance (unit space) the card's selection-ring
 * boundary sits inside the card rect. Connectors terminate at the visible
 * edge (rect minus this inset), not the rect itself, so the line ends
 * cleanly at the card boundary instead of overrunning into the rounded
 * corner. Matches the 3 px `box-shadow: inset 0 0 0 3px` used in
 * `PersonNode.svelte` (FamilyViewCanvas's UNIT scale = 80, so 3 / 80).
 * Used by `coupleConnector` (#4) and the per-couple sibling bus (#5).
 */
export const CARD_VISIBLE_INSET_U = 3 / 80;
/**
 * How far below the parent row's bottom edge the sibling bus / multi-union
 * drop-anchor lands when the natural midpoint would otherwise fall inside
 * the parent card (e.g. when the parent has a portrait and the card is
 * taller than the default). 0.05u = 4 px at UNIT=80, just enough clearance
 * to make the bus visible without changing default-row geometry.
 */
const BUS_BELOW_ROW_CLEAR_U = 0.05;
/** Past this many visible cards, auto-collapse kicks in (Phase 1 plan). */
export const AUTO_COLLAPSE_THRESHOLD = 50;

/**
 * Content-driven card height. Deterministic from the person record
 * alone - worker-safe. Portrait present -> tall; otherwise default.
 * The silhouette/compact path was removed: no-portrait cards render
 * name+date only, with no avatar slot.
 */
export function cardHeight(person: { portraitBlobId?: string } | undefined): number {
    if (!person) return CARD_H;
    if (person.portraitBlobId) return CARD_H_WITH_PORTRAIT;
    return CARD_H;
}

function roleFor(tree: Tree, childId: PersonId, parentId: PersonId): FamilyViewEdgeRole {
    const child = tree.people[childId];
    if (!child) return "blood";
    const ref = getParents(child).find((r) => r.personId === parentId);
    if (!ref) return "blood";
    switch (ref.pedi) {
        case "adopted":
        case "sealed":
            return "adopted";
        case "birth":
        case undefined:
            return "blood";
        // foster / chosen / magical / cloned / hatched / summoned / manufactured fall
        // through; Phase 4 of the relationship-vocabulary plan adds dedicated
        // edge roles for these. For now they render as "blood" (solid).
        default:
            return "blood";
    }
}

type RankSlot =
    | { readonly kind: "single"; readonly personId: PersonId }
    | {
          readonly kind: "couple";
          readonly leftId: PersonId;
          readonly rightId: PersonId;
          readonly coupleIndex: number;
      }
    | {
          /** N>2 partner union; partners get N adjacent cards in order. */
          readonly kind: "multi-union";
          readonly unionId: string;
          readonly partnerIds: readonly PersonId[];
      }
    | { readonly kind: "badge"; readonly badgeId: string };

export interface LayoutOptions {
    /** User-explicit-expansion set (Phase 1+). */
    readonly expanded?: ReadonlySet<PersonId>;
    /**
     * Per-person primary-union override (Phase 2+). Maps personId →
     * coupleIndex; persons not in the map fall back to
     * `defaultPrimaryUnion` from `couples.ts`.
     */
    readonly primaryUnionOverrides?: ReadonlyMap<PersonId, number>;
    /** Override the auto-collapse threshold; used by perf tests. */
    readonly autoCollapseThreshold?: number;
}

export function computeLayout(
    tree: Tree,
    focusId: PersonId,
    opts: LayoutOptions = {},
): FamilyViewLayout {
    const expanded = opts.expanded ?? new Set<PersonId>();
    const primaryOverrides = opts.primaryUnionOverrides ?? new Map<PersonId, number>();
    const threshold = opts.autoCollapseThreshold ?? AUTO_COLLAPSE_THRESHOLD;
    const subset = selectBoundedSubset(tree, focusId, {
        expanded,
        primaryUnionOverrides: primaryOverrides,
    });

    // Auto-collapse: while visible > threshold, demote the lowest-DOI
    // sibling block. A sibling block = all children of one (parent) +
    // their position in the subset. We pick the parent whose worst-case
    // DOI is lowest (= furthest from focus) and replace their children
    // block with a badge.
    const autoCollapsed = new Set<PersonId>();
    let visibleCount = subset.visible.size;
    let working = subset;
    if (visibleCount > threshold) {
        const scores = computeDoiScores({ tree, focus: focusId });
        const protect = new Set<PersonId>([focusId, ...expanded]);
        while (visibleCount > threshold) {
            const victim = pickCollapseVictim(tree, working, scores, protect, autoCollapsed);
            if (!victim) break;
            autoCollapsed.add(victim);
            working = recomputeAfterCollapse(
                tree,
                focusId,
                expanded,
                primaryOverrides,
                autoCollapsed,
            );
            visibleCount = working.visible.size;
        }
    }

    // Position pass.
    const byRank = new Map<number, PersonId[]>();
    for (const [id, r] of working.rank) {
        const bucket = byRank.get(r);
        if (bucket) bucket.push(id);
        else byRank.set(r, [id]);
    }

    // Build badge nodes (one per auto-collapsed + manual-collapsed source).
    const badges: BadgeNode[] = [];
    const badgesByRank = new Map<number, BadgeNode[]>();
    for (const sourceId of autoCollapsed) {
        const badge = buildBadge(tree, sourceId, working, "auto");
        if (!badge) continue;
        badges.push(badge);
        const bucket = badgesByRank.get(badge.rank);
        if (bucket) bucket.push(badge);
        else badgesByRank.set(badge.rank, [badge]);
    }

    // Plan each rank: couples / singles / badges.
    const plans = new Map<number, readonly RankSlot[]>();
    const allRanks = new Set<number>([...byRank.keys(), ...badgesByRank.keys()]);
    for (const r of allRanks) {
        const ids = byRank.get(r) ?? [];
        const rankBadges = badgesByRank.get(r) ?? [];
        plans.set(r, planRank(tree, ids, rankBadges));
    }

    // Place left-to-right per rank.
    const nodes = new Map<PersonId, FamilyViewNode>();
    const placedBadges = new Map<string, BadgeNode>();
    const widthByRank = new Map<number, number>();
    for (const [r, slots] of plans) {
        let cursor = 0;
        for (let i = 0; i < slots.length; i += 1) {
            const slot = slots[i]!;
            if (i > 0) cursor += SUBTREE_GAP;
            if (slot.kind === "single") {
                placeAt(nodes, tree, slot.personId, r, cursor);
                cursor += PERSON_W;
            } else if (slot.kind === "couple") {
                placeAt(nodes, tree, slot.leftId, r, cursor);
                cursor += PERSON_W + SIBLING_GAP;
                placeAt(nodes, tree, slot.rightId, r, cursor);
                cursor += PERSON_W;
            } else if (slot.kind === "multi-union") {
                for (let pi = 0; pi < slot.partnerIds.length; pi += 1) {
                    if (pi > 0) cursor += SIBLING_GAP;
                    placeAt(nodes, tree, slot.partnerIds[pi]!, r, cursor);
                    cursor += PERSON_W;
                }
            } else {
                const original = badges.find((b) => b.id === slot.badgeId);
                if (!original) continue;
                const placed: BadgeNode = { ...original, x: cursor, y: r * ROW_H };
                placedBadges.set(placed.id, placed);
                cursor += PERSON_W;
            }
        }
        widthByRank.set(r, cursor);
    }

    // Cumulative rank-y pass. `placeAt` and the badge placement loop
    // above set y = rank * ROW_H as a placeholder; that breaks the
    // moment any rank contains a taller-than-default card, because
    // CARD_H_WITH_PORTRAIT (2.4) > ROW_H (2) overlaps the next rank
    // by 0.4 u. Instead, walk ranks in order and accumulate
    // `max(CARD_H, maxHByRank[r]) + RANK_GUTTER`; ranks containing
    // only default-height cards keep the old `rank * ROW_H` spacing
    // exactly, while a portrait row pushes every subsequent rank down
    // by the height delta. Anchored to `sortedRanks[0] * ROW_H` so
    // the topmost rank's y matches the pre-fix coordinate.
    const maxHByRank = new Map<number, number>();
    for (const node of nodes.values()) {
        const cur = maxHByRank.get(node.rank) ?? 0;
        if ((node.h ?? CARD_H) > cur) maxHByRank.set(node.rank, node.h ?? CARD_H);
    }
    for (const badge of placedBadges.values()) {
        const cur = maxHByRank.get(badge.rank) ?? 0;
        if (CARD_H > cur) maxHByRank.set(badge.rank, CARD_H);
    }
    const ranksPresent = new Set<number>();
    for (const node of nodes.values()) ranksPresent.add(node.rank);
    for (const badge of placedBadges.values()) ranksPresent.add(badge.rank);
    const sortedRanks = [...ranksPresent].sort((a, b) => a - b);
    const rankStartY = new Map<number, number>();
    // `cumulativeEndY` is the y-coord just past the last rank's bottom edge,
    // including a trailing gutter to match the old `(rankCount) * ROW_H`
    // bbox formula. Used by the bbox.height computation below.
    let cumulativeEndY = 0;
    if (sortedRanks.length > 0) {
        let cursor = sortedRanks[0]! * ROW_H;
        for (const r of sortedRanks) {
            rankStartY.set(r, cursor);
            const rowH = Math.max(CARD_H, maxHByRank.get(r) ?? CARD_H);
            cursor += rowH + RANK_GUTTER;
        }
        cumulativeEndY = cursor;
    }
    for (const [id, node] of nodes) {
        const y = rankStartY.get(node.rank);
        if (y !== undefined && y !== node.y) nodes.set(id, { ...node, y });
    }
    for (const [id, badge] of placedBadges) {
        const y = rankStartY.get(badge.rank);
        if (y !== undefined && y !== badge.y) placedBadges.set(id, { ...badge, y });
    }

    // Vertically center cards within each rank: a portrait card forces
    // the row to be `CARD_H_WITH_PORTRAIT` tall, and any shorter cards
    // in the same rank get pushed down by half the height delta so
    // every card's vertical midpoint lines up. The shared midline is
    // what couple connectors and parent stems anchor to.
    for (const [id, node] of nodes) {
        const rowH = maxHByRank.get(node.rank) ?? CARD_H;
        const dy = (rowH - (node.h ?? CARD_H)) / 2;
        if (dy !== 0) nodes.set(id, { ...node, y: node.y + dy });
    }

    // Centre each rank under the widest rank.
    let maxWidth = 0;
    for (const w of widthByRank.values()) if (w > maxWidth) maxWidth = w;
    for (const [id, node] of nodes) {
        const w = widthByRank.get(node.rank) ?? 0;
        const offset = (maxWidth - w) / 2;
        if (offset !== 0) nodes.set(id, { ...node, x: node.x + offset });
    }
    for (const [id, badge] of placedBadges) {
        const w = widthByRank.get(badge.rank) ?? 0;
        const offset = (maxWidth - w) / 2;
        if (offset !== 0) placedBadges.set(id, { ...badge, x: badge.x + offset });
    }

    const finalBadges = Array.from(placedBadges.values());
    const rowGeometry: RowGeometry = {
        topY: (rank) => rankStartY.get(rank) ?? rank * ROW_H,
        bottomY: (rank) => {
            const top = rankStartY.get(rank) ?? rank * ROW_H;
            return top + Math.max(CARD_H, maxHByRank.get(rank) ?? CARD_H);
        },
    };
    const { anchors, edges } = emitAnchorsAndEdges(
        tree,
        nodes,
        finalBadges,
        autoCollapsed,
        rowGeometry,
    );

    // Cumulative height: top of the lowest-numbered rank to a point one
    // gutter past the highest-numbered rank's bottom, matching the legacy
    // `rankCount * ROW_H` formula on all-default trees while also covering
    // a portrait card overhang on the bottom rank.
    let height = 0;
    if (sortedRanks.length > 0) {
        height = cumulativeEndY - rowGeometry.topY(sortedRanks[0]!);
    }

    // `canCollapse` = persons the user can `−`-click. That's every id in
    // `expanded` that is currently visible (auto-collapse doesn't remove
    // the source, only its children).
    const canCollapse = new Set<PersonId>();
    for (const id of expanded) if (working.visible.has(id)) canCollapse.add(id);

    const multiUnionMates = collectMultiUnionMates(tree, anchors, primaryOverrides);
    const overlays = buildOverlays(tree, nodes, edges, { width: maxWidth, height });
    const groups = buildGroups(tree, nodes, { width: maxWidth, height });

    return {
        focus: focusId,
        nodes,
        anchors,
        edges,
        badges: finalBadges,
        bbox: { width: maxWidth, height },
        hasMoreChildren: working.hasMoreChildren,
        hasMoreParents: working.hasMoreParents,
        canCollapse,
        autoCollapsed,
        multiUnionMates,
        overlays,
        groups,
    };
}

/**
 * For every couple-anchor in the layout, mark each partner card as
 * having a multi-union mate (= the other partner) iff the mate has
 * >1 unions. The renderer uses this to decide whether to render a
 * `˅` and what alternates the picker shows.
 */
function collectMultiUnionMates(
    tree: Tree,
    anchors: readonly UnionAnchor[],
    primaryOverrides: ReadonlyMap<PersonId, number>,
): ReadonlyMap<PersonId, MultiUnionMate> {
    const out = new Map<PersonId, MultiUnionMate>();
    for (const anchor of anchors) {
        if (anchor.partnerIds.length !== 2) continue;
        const [a, b] = [anchor.partnerIds[0]!, anchor.partnerIds[1]!];
        markMate(tree, out, a, b, primaryOverrides);
        markMate(tree, out, b, a, primaryOverrides);
    }
    return out;
}

function markMate(
    tree: Tree,
    out: Map<PersonId, MultiUnionMate>,
    cardId: PersonId,
    mateId: PersonId,
    primaryOverrides: ReadonlyMap<PersonId, number>,
): void {
    if (unionCount(tree, mateId) <= 1) return;
    const primaryIdx = resolvePrimary(tree, mateId, primaryOverrides);
    if (primaryIdx === undefined) return;
    out.set(cardId, {
        mateId,
        primaryCoupleIndex: primaryIdx,
        alternates: otherUnionsOf(tree, mateId, primaryIdx),
    });
}

function placeAt(
    nodes: Map<PersonId, FamilyViewNode>,
    tree: Tree,
    personId: PersonId,
    rank: number,
    x: number,
): void {
    // y is a placeholder (rank * ROW_H); the cumulative-rank-y pass in
    // `computeLayout` rewrites it after every node and badge is placed,
    // so portrait-row expansion can push downstream ranks down.
    const h = cardHeight(tree.people[personId]);
    nodes.set(personId, { personId, rank, x, y: rank * ROW_H, h });
}

function planRank(
    tree: Tree,
    ids: readonly PersonId[],
    badges: readonly BadgeNode[],
): readonly RankSlot[] {
    const slots: RankSlot[] = [];
    const here = new Set(ids);
    const placed = new Set<PersonId>();
    // Walk legacy `tree.couples` for 2-partner slots so existing orientation
    // and coupleIndex semantics stay byte-identical, then walk
    // `getUnions(tree)` for N>2 unions (which have no `tree.couples` entry).
    for (let ci = 0; ci < tree.couples.length; ci += 1) {
        const couple = tree.couples[ci]!;
        if (!here.has(couple.leftId) || !here.has(couple.rightId)) continue;
        if (placed.has(couple.leftId) || placed.has(couple.rightId)) continue;
        // Apply the genealogy-conventional orientation: father-left /
        // mother-right; same-gender → personId asc. Stable across renders.
        const oriented = orientCouple(tree, couple, ci);
        slots.push({
            kind: "couple",
            leftId: oriented.leftId,
            rightId: oriented.rightId,
            coupleIndex: ci,
        });
        placed.add(couple.leftId);
        placed.add(couple.rightId);
    }
    // N>2 partner unions: emit a `multi-union` slot per visible union so
    // all partners land contiguously in the rank. 2-partner unions are
    // covered by the loop above (via the legacy `tree.couples` sync).
    const visibleUnions = getUnions(tree).filter(
        (u) => u.partnerIds.length > 2 && u.partnerIds.every((pid) => here.has(pid)),
    );
    for (const u of visibleUnions) {
        if (u.partnerIds.some((pid) => placed.has(pid))) continue;
        slots.push({ kind: "multi-union", unionId: u.id, partnerIds: u.partnerIds });
        for (const pid of u.partnerIds) placed.add(pid);
    }
    for (const id of ids) {
        if (placed.has(id)) continue;
        slots.push({ kind: "single", personId: id });
        placed.add(id);
    }
    for (const badge of badges) {
        slots.push({ kind: "badge", badgeId: badge.id });
    }
    return slots;
}

function midX(node: FamilyViewNode): number {
    return node.x + PERSON_W / 2;
}

function badgeMidX(badge: BadgeNode): number {
    return badge.x + PERSON_W / 2;
}

interface RowGeometry {
    readonly topY: (rank: number) => number;
    readonly bottomY: (rank: number) => number;
}

function emitAnchorsAndEdges(
    tree: Tree,
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
    badges: readonly BadgeNode[],
    autoCollapsed: ReadonlySet<PersonId>,
    rowGeometry: RowGeometry,
): { readonly anchors: readonly UnionAnchor[]; readonly edges: readonly FamilyViewEdge[] } {
    const anchors: UnionAnchor[] = [];
    const edges: FamilyViewEdge[] = [];
    const childCovered = new Set<PersonId>();

    for (let ci = 0; ci < tree.couples.length; ci += 1) {
        const couple = tree.couples[ci]!;
        const aNode = nodes.get(couple.leftId);
        const bNode = nodes.get(couple.rightId);
        if (!aNode || !bNode) continue;
        if (aNode.rank !== bNode.rank) continue;
        // Determine screen-left / screen-right by placed x, not by the
        // raw CoupleRecord field order — `planRank` may have swapped
        // them under the genealogy-conventional orientation rule.
        const [leftNode, rightNode] = aNode.x <= bNode.x ? [aNode, bNode] : [bNode, aNode];
        const visibleKids = couple.childIds.filter((id) => nodes.has(id));
        const anchor: UnionAnchor = {
            id: `union:${couple.leftId}|${couple.rightId}|${String(couple.unionIndex)}`,
            partnerIds: [couple.leftId, couple.rightId],
            childIds: visibleKids,
            coupleIndex: ci,
            rank: leftNode.rank,
        };
        anchors.push(anchor);
        edges.push(coupleConnector(couple, leftNode, rightNode));
        const anchorCenterX = (midX(leftNode) + midX(rightNode)) / 2;
        // both partners are vertically centered to the same row midline,
        // so either card's midpoint works as the bus anchor.
        const anchorY = leftNode.y + (leftNode.h ?? CARD_H) / 2;
        // visual-fixup #5: emit one explicit sibling-bus segment + N child
        // stubs instead of N L-drops whose horizontal segments overlapped
        // into an emergent bus. Bus extent spans the parents' midpoint and
        // every child's midX so the parent stem always lands on the bus.
        // Bus Y = midpoint between parent rank midline and child top.
        const visibleKidNodes = visibleKids
            .map((id) => nodes.get(id))
            .filter((n): n is FamilyViewNode => n !== undefined);
        if (visibleKidNodes.length > 0) {
            // Kid rank's row top - stable across mixed-height siblings
            // (unlike `visibleKidNodes[0].y`, which shifts under per-row
            // centering when only some kids in the rank are tall).
            const kidRowY = rowGeometry.topY(visibleKidNodes[0]!.rank);
            // Clamp the bus below the parent row's bottom edge so it stays
            // visible when a partner has a portrait (otherwise the bus
            // would render inside the parent card and be hidden by it).
            const parentRowBottom = rowGeometry.bottomY(leftNode.rank);
            const busY = Math.max((anchorY + kidRowY) / 2, parentRowBottom + BUS_BELOW_ROW_CLEAR_U);
            const kidXs = visibleKidNodes.map(midX);
            const busLeftX = Math.min(anchorCenterX, ...kidXs);
            const busRightX = Math.max(anchorCenterX, ...kidXs);
            const partnerPair: readonly PersonId[] = [leftNode.personId, rightNode.personId];
            // parent stem — vertical line from couple-bus midpoint down to the sibling bus
            edges.push({
                id: `stem:${anchor.id}`,
                persons: partnerPair,
                role: "blood",
                points: [
                    { x: anchorCenterX, y: anchorY },
                    { x: anchorCenterX, y: busY },
                ],
            });
            // sibling bus — single horizontal segment across the parents' midpoint and all kids
            edges.push({
                id: `bus:${anchor.id}`,
                persons: [...partnerPair, ...visibleKidNodes.map((n) => n.personId)],
                role: "blood",
                points: [
                    { x: busLeftX, y: busY },
                    { x: busRightX, y: busY },
                ],
            });
            // per-child stubs — short verticals from bus down into each kid
            for (const kidNode of visibleKidNodes) {
                const kid = kidNode.personId;
                const kidPerson = tree.people[kid];
                const kidParentIds = kidPerson
                    ? new Set(getParents(kidPerson).map((r) => r.personId))
                    : new Set<PersonId>();
                // half-sibling: child is in CoupleRecord.childIds but its
                // own parentIds list doesn't include both partners. Render
                // the stub with the "half" stroke role rather than "blood".
                const sharesBoth =
                    kidParentIds.has(couple.leftId) && kidParentIds.has(couple.rightId);
                const role: FamilyViewEdgeRole = sharesBoth
                    ? roleFor(tree, kid, leftNode.personId)
                    : "half";
                edges.push({
                    id: `stub:${anchor.id}|${kid}`,
                    persons: [...partnerPair, kid],
                    role,
                    points: [
                        { x: midX(kidNode), y: busY },
                        { x: midX(kidNode), y: kidNode.y },
                    ],
                });
                childCovered.add(kid);
            }
        }
    }

    // N>2-partner union anchors. Each visible union with all partners
    // placed gets a UnionAnchor and a bus-primitive connector (computed
    // by `computeManifold`). Children of the union (from `union.childIds`)
    // hang from the manifold's childAnchor centroid.
    for (const u of getUnions(tree)) {
        if (u.partnerIds.length <= 2) continue;
        const partnerNodes = u.partnerIds
            .map((pid) => nodes.get(pid))
            .filter((n): n is FamilyViewNode => n !== undefined);
        if (partnerNodes.length !== u.partnerIds.length) continue;
        if (!partnerNodes.every((n) => n.rank === partnerNodes[0]?.rank)) continue;
        const rank = partnerNodes[0]!.rank;
        const visibleKids = u.childIds.filter((id) => nodes.has(id));
        const anchor: UnionAnchor = {
            id: `union:${u.id}`,
            partnerIds: u.partnerIds,
            childIds: visibleKids,
            rank,
        };
        anchors.push(anchor);
        // Connector edges from the bus primitive (one bar across all
        // partners + zero-length tails on-rank). Per-row vertical
        // centering puts every partner's midpoint at the same y, so
        // any partner's midline serves as the shared bus y.
        const busY = partnerNodes[0]!.y + (partnerNodes[0]!.h ?? CARD_H) / 2;
        const partnerPositions = partnerNodes.map((n) => ({
            personId: n.personId,
            x: midX(n),
            y: busY,
        }));
        const manifold = computeManifold(PRIMARY_PRIMITIVE, partnerPositions);
        for (let ei = 0; ei < manifold.edges.length; ei += 1) {
            const me = manifold.edges[ei]!;
            edges.push({
                id: `${anchor.id}/manifold/${String(ei)}`,
                persons: me.endpoints ? [me.endpoints[0], me.endpoints[1]] : u.partnerIds,
                role: "married",
                points: [
                    { x: me.from.x, y: me.from.y },
                    { x: me.to.x, y: me.to.y },
                ],
            });
        }
        // Child drops normally hang from the manifold's centroid y (the
        // partner-bus midline). The L-drop's horizontal segment sits at
        // `midY = (centroid.y + kidY) / 2` - that already lands in the
        // inter-rank gutter for default-height partner rows, so leave
        // those untouched. Only when the partner row is tall enough to
        // pull `midY` back inside the parent cards (e.g. a portrait in
        // the union) do we raise the drop origin so the horizontal
        // clears the row bottom.
        const partnerRowBottom = rowGeometry.bottomY(rank);
        for (const kid of visibleKids) {
            const kidNode = nodes.get(kid);
            if (!kidNode) continue;
            const kidPerson = tree.people[kid];
            const kidParentIds = kidPerson
                ? new Set(getParents(kidPerson).map((r) => r.personId))
                : new Set<PersonId>();
            const partnerSet = new Set(u.partnerIds);
            const sharesAll =
                kidParentIds.size > 0 &&
                u.partnerIds.every((pid) => kidParentIds.has(pid)) &&
                [...kidParentIds].every((pid) => partnerSet.has(pid));
            // role choice: blood when the kid's parentIds == the union's
            // partnerIds set; otherwise "half" (e.g. kid is a child of a
            // subset of the union).
            const role: FamilyViewEdgeRole = sharesAll
                ? roleFor(tree, kid, u.partnerIds[0]!)
                : "half";
            // Raise the drop origin only when the natural midpoint would
            // sit inside the partner cards (= partner row is taller than
            // the natural gutter allows). Default-height multi-unions are
            // unaffected and keep their pre-fix midpoint geometry.
            const naiveMidY = (manifold.childAnchor.y + kidNode.y) / 2;
            const dropFromY =
                naiveMidY > partnerRowBottom
                    ? manifold.childAnchor.y
                    : 2 * (partnerRowBottom + BUS_BELOW_ROW_CLEAR_U) - kidNode.y;
            edges.push(
                drop(
                    `drop:${anchor.id}|${kid}`,
                    [...u.partnerIds, kid],
                    role,
                    manifold.childAnchor.x,
                    dropFromY,
                    midX(kidNode),
                    kidNode.y,
                ),
            );
            childCovered.add(kid);
        }
    }

    // Single-parent and multi-parent (>2) children. Two-parent unions are
    // covered by the for-couples loop above via couple.childIds; anything
    // still uncovered falls into one of these two paths.
    for (const child of Object.values(tree.people)) {
        if (!nodes.has(child.id)) continue;
        if (childCovered.has(child.id)) continue;
        const knownParents: PersonId[] = [];
        for (const ref of getParents(child)) {
            if (nodes.has(ref.personId)) knownParents.push(ref.personId);
        }
        if (knownParents.length === 0) continue;
        const kidNode = nodes.get(child.id);
        if (!kidNode) continue;

        if (knownParents.length === 1) {
            const parentId = knownParents[0]!;
            const parentNode = nodes.get(parentId);
            if (!parentNode) continue;
            const anchorRank = (parentNode.rank + kidNode.rank) / 2;
            const anchor: UnionAnchor = {
                id: `union:solo:${parentId}|${child.id}`,
                partnerIds: [parentId],
                childIds: [child.id],
                rank: anchorRank,
            };
            anchors.push(anchor);
            edges.push(
                drop(
                    `drop:${anchor.id}`,
                    [parentId, child.id],
                    roleFor(tree, child.id, parentId),
                    midX(parentNode),
                    parentNode.y + (parentNode.h ?? CARD_H),
                    midX(kidNode),
                    kidNode.y,
                ),
            );
            continue;
        }

        // Multi-parent (>=2 parents, but not covered by a known couple).
        // Each parent contributes a drop to a parent-gather pill at the
        // x-centroid of the parents' centers, located in the gutter
        // between the parent rank and the child rank. The pill→child drop
        // uses the highest-rank parent as the rank anchor.
        const parentNodes = knownParents
            .map((pid) => nodes.get(pid))
            .filter((n): n is FamilyViewNode => n !== undefined);
        const parentXs = parentNodes.map((n) => midX(n));
        const centroidX = parentXs.reduce((s, x) => s + x, 0) / parentXs.length;
        const maxParentY = Math.max(...parentNodes.map((n) => n.y + (n.h ?? CARD_H)));
        const minParentRank = Math.min(...parentNodes.map((n) => n.rank));
        const pillY = (maxParentY + kidNode.y) / 2;
        const anchorRank = (minParentRank + kidNode.rank) / 2;
        const anchor: UnionAnchor = {
            id: `union:multi:${knownParents.slice().sort().join("|")}|${child.id}`,
            partnerIds: knownParents,
            childIds: [child.id],
            rank: anchorRank,
        };
        anchors.push(anchor);
        // parent → pill drops
        for (const parentNode of parentNodes) {
            edges.push({
                id: `drop:${anchor.id}|${parentNode.personId}-pill`,
                persons: [parentNode.personId, child.id],
                role: roleFor(tree, child.id, parentNode.personId),
                points: [
                    { x: midX(parentNode), y: parentNode.y + (parentNode.h ?? CARD_H) },
                    { x: midX(parentNode), y: pillY },
                    { x: centroidX, y: pillY },
                ],
            });
        }
        // pill → child drop
        edges.push({
            id: `drop:${anchor.id}|pill-child`,
            persons: [...knownParents, child.id],
            role: "blood",
            points: [
                { x: centroidX, y: pillY },
                { x: midX(kidNode), y: pillY },
                { x: midX(kidNode), y: kidNode.y },
            ],
        });
    }

    // Badge drops: each auto-collapsed source needs a drop into its badge.
    for (const badge of badges) {
        const source = nodes.get(badge.sourceId);
        if (!source) continue;
        edges.push(
            drop(
                `drop:badge:${badge.id}`,
                [badge.sourceId],
                "blood",
                midX(source),
                source.y + (source.h ?? CARD_H),
                badgeMidX(badge),
                badge.y,
            ),
        );
    }

    void autoCollapsed;
    return { anchors, edges };
}

function coupleConnector(
    couple: CoupleRecord,
    left: FamilyViewNode,
    right: FamilyViewNode,
): FamilyViewEdge {
    // both cards share a row midline after per-row vertical centering,
    // so either side's midpoint anchors the bond cleanly.
    const y = left.y + (left.h ?? CARD_H) / 2;
    // visual-fixup #4: terminate at the visible card edge (selection-ring
    // boundary), not the rect, so the connector doesn't overrun into the
    // rounded corner.
    return {
        id: `bond:${couple.leftId}|${couple.rightId}|${String(couple.unionIndex)}`,
        persons: [couple.leftId, couple.rightId],
        role: "married",
        points: [
            { x: left.x + PERSON_W - CARD_VISIBLE_INSET_U, y },
            { x: right.x + CARD_VISIBLE_INSET_U, y },
        ],
    };
}

function drop(
    id: string,
    persons: readonly PersonId[],
    role: FamilyViewEdgeRole,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
): FamilyViewEdge {
    const midY = (fromY + toY) / 2;
    return {
        id,
        persons,
        role,
        points: [
            { x: fromX, y: fromY },
            { x: fromX, y: midY },
            { x: toX, y: midY },
            { x: toX, y: toY },
        ],
    };
}

// ---------------- auto-collapse ----------------

/**
 * Pick the next sibling block to demote to a badge. Strategy:
 * walk every visible parent → child-set; rank by parent's DOI
 * (lowest first = furthest from focus). Skip if any child is in
 * `protect` (explicit-expansion or focus) or if all children are
 * already auto-collapsed. Returns the parent person id whose children
 * should be replaced; null if nothing collapsible remains.
 */
function pickCollapseVictim(
    tree: Tree,
    subset: RankedSubset,
    scores: ReadonlyMap<PersonId, { readonly score: number }>,
    protect: ReadonlySet<PersonId>,
    alreadyCollapsed: ReadonlySet<PersonId>,
): PersonId | null {
    // `protect` only protects from being HIDDEN. The source person whose
    // children get badged stays visible (only the children collapse), so
    // a protected source is fine — what matters is that none of the
    // CHILDREN about to be hidden are themselves in `protect`.
    let worstScore = Number.POSITIVE_INFINITY;
    let victim: PersonId | null = null;
    for (const id of subset.visible) {
        if (alreadyCollapsed.has(id)) continue;
        const kids = directChildrenOfInSubset(tree, id, subset.visible);
        if (kids.length === 0) continue;
        let hasProtected = false;
        for (const k of kids) if (protect.has(k)) hasProtected = true;
        if (hasProtected) continue;
        const sc = scores.get(id)?.score ?? Number.NEGATIVE_INFINITY;
        if (sc < worstScore) {
            worstScore = sc;
            victim = id;
        }
    }
    return victim;
}

function recomputeAfterCollapse(
    tree: Tree,
    focusId: PersonId,
    expanded: ReadonlySet<PersonId>,
    primaryUnionOverrides: ReadonlyMap<PersonId, number>,
    autoCollapsed: ReadonlySet<PersonId>,
): RankedSubset {
    const base = selectBoundedSubset(tree, focusId, { expanded, primaryUnionOverrides });
    if (autoCollapsed.size === 0) return base;
    // Remove children of any auto-collapsed source from the visible set.
    const visible = new Set(base.visible);
    const rank = new Map(base.rank);
    const hidden = new Set<PersonId>();
    for (const sourceId of autoCollapsed) {
        const kids = directChildrenOfInSubset(tree, sourceId, visible);
        for (const k of kids) hidden.add(k);
    }
    // Iteratively hide descendants of hidden cards too (a hidden child's
    // children must also vanish).
    let changed = true;
    while (changed) {
        changed = false;
        for (const id of Array.from(visible)) {
            const p = tree.people[id];
            if (!p) continue;
            const anyParentHidden = getParents(p).some((r) => hidden.has(r.personId));
            if (anyParentHidden) {
                if (!hidden.has(id)) {
                    hidden.add(id);
                    changed = true;
                }
            }
        }
    }
    for (const id of hidden) {
        visible.delete(id);
        rank.delete(id);
    }
    return {
        visible,
        rank,
        hasMoreChildren: base.hasMoreChildren,
        hasMoreParents: base.hasMoreParents,
    };
}

function directChildrenOfInSubset(
    tree: Tree,
    parentId: PersonId,
    visible: ReadonlySet<PersonId>,
): readonly PersonId[] {
    const out: PersonId[] = [];
    for (const person of Object.values(tree.people)) {
        if (!visible.has(person.id)) continue;
        if (getParents(person).some((r) => r.personId === parentId)) {
            out.push(person.id);
        }
    }
    return out;
}

function buildBadge(
    tree: Tree,
    sourceId: PersonId,
    workingSubset: RankedSubset,
    origin: "auto" | "manual",
): BadgeNode | null {
    const sourceRank = workingSubset.rank.get(sourceId);
    if (sourceRank === undefined) {
        // Source isn't visible anymore (e.g. nested collapse). Look up the
        // tree-wide rank: a child is one below its parent's rank — for
        // badge purposes the rank is one below the deepest visible
        // ancestor of source. Conservatively skip — the badge is moot.
        return null;
    }
    // Members = all direct children of source in the tree (since the
    // working subset has already removed them).
    const members: PersonId[] = [];
    for (const person of Object.values(tree.people)) {
        if (getParents(person).some((r) => r.personId === sourceId)) {
            members.push(person.id);
        }
    }
    if (members.length === 0) return null;
    // Sample name = first member's given name (alphabetical, deterministic).
    members.sort();
    const sample = tree.people[members[0]!];
    const sampleName = sample
        ? `${sample.given} ${sample.surname}`.trim() || members[0]!
        : members[0]!;
    return {
        id: `badge:${sourceId}`,
        rank: sourceRank + 1,
        x: 0,
        y: (sourceRank + 1) * ROW_H,
        sourceId,
        members,
        sampleName,
        origin,
    };
}
