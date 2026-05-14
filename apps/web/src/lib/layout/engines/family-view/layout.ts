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
 *   - One row per rank, rows separated by ROW_H.
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
import type {
    BadgeNode,
    FamilyViewEdge,
    FamilyViewEdgeRole,
    FamilyViewLayout,
    FamilyViewNode,
    UnionAnchor,
} from "$lib/layout/engines/family-view/types";
import { selectBoundedSubset, type RankedSubset } from "$lib/layout/engines/family-view/subset";

/** Card height in unit space — matches the layered engine's CARD_H. */
export const CARD_H = 1.2;
/** Past this many visible cards, auto-collapse kicks in (Phase 1 plan). */
export const AUTO_COLLAPSE_THRESHOLD = 50;

function roleFor(_tree: Tree, _childId: PersonId, _parentId: PersonId): FamilyViewEdgeRole {
    return "blood";
}

type RankSlot =
    | { readonly kind: "single"; readonly personId: PersonId }
    | {
          readonly kind: "couple";
          readonly leftId: PersonId;
          readonly rightId: PersonId;
          readonly coupleIndex: number;
      }
    | { readonly kind: "badge"; readonly badgeId: string };

export interface LayoutOptions {
    /** User-explicit-expansion set (Phase 1+). */
    readonly expanded?: ReadonlySet<PersonId>;
    /** Override the auto-collapse threshold; used by perf tests. */
    readonly autoCollapseThreshold?: number;
}

export function computeLayout(
    tree: Tree,
    focusId: PersonId,
    opts: LayoutOptions = {},
): FamilyViewLayout {
    const expanded = opts.expanded ?? new Set<PersonId>();
    const threshold = opts.autoCollapseThreshold ?? AUTO_COLLAPSE_THRESHOLD;
    const subset = selectBoundedSubset(tree, focusId, { expanded });

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
            working = recomputeAfterCollapse(tree, focusId, expanded, autoCollapsed);
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
                placeAt(nodes, slot.personId, r, cursor);
                cursor += PERSON_W;
            } else if (slot.kind === "couple") {
                placeAt(nodes, slot.leftId, r, cursor);
                cursor += PERSON_W + SIBLING_GAP;
                placeAt(nodes, slot.rightId, r, cursor);
                cursor += PERSON_W;
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
    const { anchors, edges } = emitAnchorsAndEdges(tree, nodes, finalBadges, autoCollapsed);

    const ranks = Array.from(byRank.keys());
    const badgeRanks = Array.from(badgesByRank.keys());
    const allRanksArr = [...ranks, ...badgeRanks];
    const height =
        allRanksArr.length > 0
            ? (Math.max(...allRanksArr) - Math.min(...allRanksArr) + 1) * ROW_H
            : 0;

    // `canCollapse` = persons the user can `−`-click. That's every id in
    // `expanded` that is currently visible (auto-collapse doesn't remove
    // the source, only its children).
    const canCollapse = new Set<PersonId>();
    for (const id of expanded) if (working.visible.has(id)) canCollapse.add(id);

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
    };
}

function placeAt(
    nodes: Map<PersonId, FamilyViewNode>,
    personId: PersonId,
    rank: number,
    x: number,
): void {
    nodes.set(personId, { personId, rank, x, y: rank * ROW_H });
}

function planRank(
    tree: Tree,
    ids: readonly PersonId[],
    badges: readonly BadgeNode[],
): readonly RankSlot[] {
    const slots: RankSlot[] = [];
    const here = new Set(ids);
    const placed = new Set<PersonId>();
    for (let ci = 0; ci < tree.couples.length; ci += 1) {
        const couple = tree.couples[ci]!;
        if (!here.has(couple.leftId) || !here.has(couple.rightId)) continue;
        if (placed.has(couple.leftId) || placed.has(couple.rightId)) continue;
        slots.push({
            kind: "couple",
            leftId: couple.leftId,
            rightId: couple.rightId,
            coupleIndex: ci,
        });
        placed.add(couple.leftId);
        placed.add(couple.rightId);
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

function emitAnchorsAndEdges(
    tree: Tree,
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
    badges: readonly BadgeNode[],
    autoCollapsed: ReadonlySet<PersonId>,
): { readonly anchors: readonly UnionAnchor[]; readonly edges: readonly FamilyViewEdge[] } {
    const anchors: UnionAnchor[] = [];
    const edges: FamilyViewEdge[] = [];
    const childCovered = new Set<PersonId>();

    for (let ci = 0; ci < tree.couples.length; ci += 1) {
        const couple = tree.couples[ci]!;
        const leftNode = nodes.get(couple.leftId);
        const rightNode = nodes.get(couple.rightId);
        if (!leftNode || !rightNode) continue;
        if (leftNode.rank !== rightNode.rank) continue;
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
        const anchorY = leftNode.y + CARD_H / 2;
        for (const kid of visibleKids) {
            const kidNode = nodes.get(kid);
            if (!kidNode) continue;
            edges.push(
                drop(
                    `drop:${anchor.id}|${kid}`,
                    [couple.leftId, couple.rightId, kid],
                    roleFor(tree, kid, couple.leftId),
                    anchorCenterX,
                    anchorY,
                    midX(kidNode),
                    kidNode.y,
                ),
            );
            childCovered.add(kid);
        }
    }

    // Single-parent children.
    for (const child of Object.values(tree.people)) {
        if (!nodes.has(child.id)) continue;
        if (childCovered.has(child.id)) continue;
        const knownParents: PersonId[] = [];
        if (child.motherId && nodes.has(child.motherId)) knownParents.push(child.motherId);
        if (child.fatherId && nodes.has(child.fatherId)) knownParents.push(child.fatherId);
        if (knownParents.length !== 1) continue;
        const parentId = knownParents[0]!;
        const parentNode = nodes.get(parentId);
        const kidNode = nodes.get(child.id);
        if (!parentNode || !kidNode) continue;
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
                parentNode.y + CARD_H,
                midX(kidNode),
                kidNode.y,
            ),
        );
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
                source.y + CARD_H,
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
    const y = left.y + CARD_H / 2;
    return {
        id: `bond:${couple.leftId}|${couple.rightId}|${String(couple.unionIndex)}`,
        persons: [couple.leftId, couple.rightId],
        role: "married",
        points: [
            { x: left.x + PERSON_W, y },
            { x: right.x, y },
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
    autoCollapsed: ReadonlySet<PersonId>,
): RankedSubset {
    const base = selectBoundedSubset(tree, focusId, { expanded });
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
            const m = p.motherId;
            const f = p.fatherId;
            if ((m && hidden.has(m)) || (f && hidden.has(f))) {
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
        if (person.motherId === parentId || person.fatherId === parentId) {
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
        if (person.motherId === sourceId || person.fatherId === sourceId) {
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
