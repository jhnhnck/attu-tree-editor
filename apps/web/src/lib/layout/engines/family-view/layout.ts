/*
 * FamilyTreeEditor - family-view geometry pass.
 *
 * Phase 0 walking skeleton. Takes the bounded subset (from `subset.ts`)
 * and assigns each visible person a position in unit space, emitting
 * `UnionAnchor`s and `FamilyViewEdge`s along the way.
 *
 * Geometry conventions:
 *   - One row per rank, rows separated by ROW_H.
 *   - Couples render as two cards joined by a horizontal connector at the
 *     row midline. Children of the couple hang from the connector mid-
 *     point via a single vertical drop down to a horizontal bus on the
 *     children's row.
 *   - Single-parent children (`motherId XOR fatherId`) emit a degenerate
 *     anchor with one `partnerId`; rendered as a simple drop from the
 *     lone parent — no couple-box.
 *   - Edge `role` is read from `roleFor()`, which today returns "blood"
 *     for every drop. The call site exists so the relationship-vocab
 *     stroke palette can land as a renderer-only change once the schema
 *     fields exist (rule #3).
 *
 * Placement is left-to-right within each rank, greedy. There is no
 * crossing-minimisation pass — the bounded ≤30-card window is small
 * enough that visible crossings are rare, and Phase 1's expand/collapse
 * intentionally re-runs layout on every toggle.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { PERSON_W, ROW_H, SIBLING_GAP, SUBTREE_GAP } from "$lib/layout/constants";
import type { CoupleRecord, PersonId, Tree } from "$lib/domain/types";
import type {
    FamilyViewEdge,
    FamilyViewEdgeRole,
    FamilyViewLayout,
    FamilyViewNode,
    UnionAnchor,
} from "$lib/layout/engines/family-view/types";
import type { RankedSubset } from "$lib/layout/engines/family-view/subset";

/** Card height in unit space — matches the layered engine's CARD_H. */
export const CARD_H = 1.2;

/**
 * Single per-edge role accessor. Today returns `"blood"` for every drop;
 * the call site exists so the relationship-vocabulary stroke palette can
 * drop in once the schema fields exist. Rule #3 from the plan.
 */
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
      };

export function computeLayout(
    tree: Tree,
    subset: RankedSubset,
    focusId: PersonId,
): FamilyViewLayout {
    // Group visible people by rank.
    const byRank = new Map<number, PersonId[]>();
    for (const [id, r] of subset.rank) {
        const bucket = byRank.get(r);
        if (bucket) bucket.push(id);
        else byRank.set(r, [id]);
    }

    // Plan each rank: pair people who are in a CoupleRecord *and* both
    // visible; everyone else is a singleton.
    const plans = new Map<number, readonly RankSlot[]>();
    for (const [r, ids] of byRank) {
        plans.set(r, planRank(tree, ids));
    }

    // Place left-to-right per rank, track the rightmost extent.
    const nodes = new Map<PersonId, FamilyViewNode>();
    const widthByRank = new Map<number, number>();
    for (const [r, slots] of plans) {
        let cursor = 0;
        for (let i = 0; i < slots.length; i += 1) {
            const slot = slots[i]!;
            if (i > 0) cursor += SUBTREE_GAP;
            if (slot.kind === "single") {
                placeAt(nodes, slot.personId, r, cursor);
                cursor += PERSON_W;
            } else {
                placeAt(nodes, slot.leftId, r, cursor);
                cursor += PERSON_W + SIBLING_GAP;
                placeAt(nodes, slot.rightId, r, cursor);
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

    const { anchors, edges } = emitAnchorsAndEdges(tree, nodes);

    // bbox: y origin = min-rank * ROW_H, height = (max-min+1) * ROW_H.
    const ranks = Array.from(byRank.keys());
    const height = ranks.length > 0 ? (Math.max(...ranks) - Math.min(...ranks) + 1) * ROW_H : 0;
    return {
        focus: focusId,
        nodes,
        anchors,
        edges,
        bbox: { width: maxWidth, height },
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

function planRank(tree: Tree, ids: readonly PersonId[]): readonly RankSlot[] {
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
    return slots;
}

/** Mid-x of a placed card in unit space. */
function midX(node: FamilyViewNode): number {
    return node.x + PERSON_W / 2;
}

function emitAnchorsAndEdges(
    tree: Tree,
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
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

/**
 * Three-segment drop: vertical from anchor, horizontal bus across to the
 * child's column, vertical down to the card top. For Phase 0 the bus
 * runs at the midpoint between the two rows; refinement is Phase 1+.
 */
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
