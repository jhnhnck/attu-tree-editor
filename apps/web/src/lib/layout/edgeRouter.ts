/*
 * FamilyTreeEditor - edge router: turns placed (x, y) positions into a list
 * of typed segments (spouse bonds, parent-drop / sibling-bus / child-drop)
 * with crossing detection that produces "bridge hops" on vertical lines so
 * intersecting horizontal lines read as crossings rather than X marks.
 *
 * All coordinates are in unit space — the same space as `hvLayout` outputs.
 * The renderer converts unit → px on draw by multiplying by UNIT.
 *
 * The output `EdgeRole` carries enough info for the renderer to style each
 * segment by relationship type (blood / married / divorced / etc.). The
 * domain currently has no adopted/half flags; we always emit `blood` for
 * parent edges and `married` / `divorced` for spouse bonds based on the
 * `CoupleRecord.isCurrent` field.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { CoupleRecord, PersonId, Tree } from "$lib/domain/types";

/** Layout slot shape: top-left of a person's card in unit coords. */
export interface Slot {
    readonly x: number;
    readonly y: number;
}

export type EdgeKind = "bond" | "parent-drop" | "sibling-bus" | "child-drop" | "stub";
export type EdgeRole = "blood" | "adopted" | "half" | "married" | "divorced";

export interface Segment {
    /** stable id; useful for path-trace highlighting */
    readonly id: string;
    readonly kind: EdgeKind;
    readonly role: EdgeRole;
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    /**
     * When this segment is vertical and crosses one or more perpendicular
     * horizontal segments, the y-values of those crossings are recorded here
     * so the renderer can draw a small arc ("bridge hop") at each one.
     */
    readonly hops?: readonly number[];
    /**
     * PersonIds that this segment connects; used for pathfinding UI.
     * For bonds: [leftId, rightId]. For drops: [parentId, childId].
     */
    readonly persons: readonly PersonId[];
}

export interface RouteOptions {
    /** width of a person card in unit coords */
    cardWidth?: number;
    /**
     * height of a person card in unit coords. Defaults to 1.2 to match
     * TreeCanvas's CELL_H = 1.2 * UNIT. Rows are typically `ROW_H` apart in
     * the layout output (e.g. 2 units), so the gutter is `rowH - cardHeight`.
     */
    cardHeight?: number;
    /** vertical step between generation rows in unit coords. Default 2. */
    rowH?: number;
    /**
     * optional ghost positions for spouses in long-span / cross-row couples.
     * Keyed by `${ghostOf}|${nearId}` — a single person can have multiple
     * ghosts when they have multiple cross-row spouses (one ghost per spouse,
     * placed at that spouse's row), so the lookup is couple-specific.
     */
    ghostPositions?: ReadonlyMap<string, Slot>;
}

const DEFAULT_CARD_W = 2;
const DEFAULT_CARD_H = 1.2;
const DEFAULT_ROW_H = 2;
/** small offset added to bridge-hop arcs so adjacent horizontals don't share a hop position */
const HOP_EPSILON = 0.001;

/**
 * Build the segment list for `tree` given pre-placed `positions`. Pure;
 * positions are read but not mutated. Drops segments that involve people not
 * present in `positions` (e.g. people the layout filtered out).
 */
export function routeEdges(
    tree: Tree,
    positions: ReadonlyMap<PersonId, Slot>,
    opts: RouteOptions = {},
): Segment[] {
    const cardW = opts.cardWidth ?? DEFAULT_CARD_W;
    const cardH = opts.cardHeight ?? DEFAULT_CARD_H;
    const rowH = opts.rowH ?? DEFAULT_ROW_H;

    const out: Segment[] = [];

    // ---------- (1) spouse bonds ----------
    for (const couple of tree.couples) {
        if (couple.leftId === couple.rightId) continue;
        const a = positions.get(couple.leftId);
        const b = positions.get(couple.rightId);
        if (!a || !b) continue;
        // use ghost positions for bond routing if available — keyed by
        // (ghostOf, nearId) since a person can be ghosted multiple times,
        // once per cross-row spouse
        const aEff =
            opts.ghostPositions?.get(`${couple.leftId}|${couple.rightId}`) ?? a;
        const bEff =
            opts.ghostPositions?.get(`${couple.rightId}|${couple.leftId}`) ?? b;
        const role: EdgeRole = couple.isCurrent === false ? "divorced" : "married";

        const bondPersons: PersonId[] = [couple.leftId, couple.rightId];
        if (sameRow(aEff, bEff, rowH)) {
            // straight horizontal between inner edges at midY
            const [l, r] = aEff.x <= bEff.x ? [aEff, bEff] : [bEff, aEff];
            const y = (cardMidY(l, cardH) + cardMidY(r, cardH)) / 2;
            out.push({
                id: bondId(couple),
                kind: "bond",
                role,
                x1: cardRightX(l, cardW),
                y1: y,
                x2: cardLeftX(r),
                y2: y,
                persons: bondPersons,
            });
        } else {
            // L-bond: cross-row spouses (uncle/niece, time-travel marriage, etc.)
            // route from the upper card's bottom-mid down to the lower card's
            // top-mid via the row gutter Y. Two segments produce a clean hook.
            const [upper, lower] = aEff.y <= bEff.y ? [aEff, bEff] : [bEff, aEff];
            const upperBottom = cardBottomY(upper, cardH);
            const lowerTop = cardTopY(lower);
            const upperMidX = cardMidX(upper, cardW);
            const lowerMidX = cardMidX(lower, cardW);
            const midY = (upperBottom + lowerTop) / 2;
            out.push({
                id: `${bondId(couple)}/v1`,
                kind: "bond",
                role,
                x1: upperMidX,
                y1: upperBottom,
                x2: upperMidX,
                y2: midY,
                persons: bondPersons,
            });
            out.push({
                id: `${bondId(couple)}/h`,
                kind: "bond",
                role,
                x1: upperMidX,
                y1: midY,
                x2: lowerMidX,
                y2: midY,
                persons: bondPersons,
            });
            out.push({
                id: `${bondId(couple)}/v2`,
                kind: "bond",
                role,
                x1: lowerMidX,
                y1: midY,
                x2: lowerMidX,
                y2: lowerTop,
                persons: bondPersons,
            });
        }
    }

    // ---------- (2) joint two-parent children grouped by couple ----------
    const jointKey = (m: PersonId, f: PersonId): string => (m < f ? `${m}|${f}` : `${f}|${m}`);
    const jointByCouple = new Map<string, PersonId[]>();
    for (const child of Object.values(tree.people)) {
        const m = child.motherId;
        const f = child.fatherId;
        if (!m || !f) continue;
        if (!positions.has(child.id)) continue;
        if (!positions.has(m) || !positions.has(f)) continue;
        const k = jointKey(m, f);
        const list = jointByCouple.get(k);
        if (list) list.push(child.id);
        else jointByCouple.set(k, [child.id]);
    }

    const handled = new Set<PersonId>();

    for (const couple of tree.couples) {
        if (couple.leftId === couple.rightId) continue;
        const a = positions.get(couple.leftId);
        const b = positions.get(couple.rightId);
        if (!a || !b) continue;
        // mirror the bond block: for cross-row or wide-span couples hvLayout
        // publishes a ghost of the non-primary partner at the primary
        // partner's row. Drop/bus geometry must use those same effective
        // positions or it ends up disconnected from the bond. Lookup is
        // keyed by (ghostOf, nearId) since a person can have multiple ghosts.
        const aEff =
            opts.ghostPositions?.get(`${couple.leftId}|${couple.rightId}`) ?? a;
        const bEff =
            opts.ghostPositions?.get(`${couple.rightId}|${couple.leftId}`) ?? b;
        const k = jointKey(couple.leftId, couple.rightId);
        const childIds = jointByCouple.get(k) ?? [];
        if (childIds.length === 0) continue;

        const bondX = sameRow(aEff, bEff, rowH)
            ? (cardRightX(aEff.x <= bEff.x ? aEff : bEff, cardW) +
                  cardLeftX(aEff.x <= bEff.x ? bEff : aEff)) /
              2
            : (cardMidX(aEff, cardW) + cardMidX(bEff, cardW)) / 2;
        const bondY = sameRow(aEff, bEff, rowH)
            ? (cardMidY(aEff, cardH) + cardMidY(bEff, cardH)) / 2
            : Math.max(cardBottomY(aEff, cardH), cardBottomY(bEff, cardH));

        const childPositions = childIds
            .map((id) => ({ id, pos: positions.get(id) }))
            .filter((c): c is { id: PersonId; pos: Slot } => !!c.pos);
        if (childPositions.length === 0) continue;

        // bus Y = midpoint of (parents' row bottom, children's row top); shared
        // across all sibships in this gutter so adjacent buses don't stack
        const parentsBottomY = Math.max(cardBottomY(aEff, cardH), cardBottomY(bEff, cardH));
        const minChildTop = Math.min(...childPositions.map((c) => cardTopY(c.pos)));
        const busY = (parentsBottomY + minChildTop) / 2;

        const couplePersons: PersonId[] = [couple.leftId, couple.rightId];

        // (a) drop from bond down to the bus
        out.push({
            id: `couple:${k}/drop`,
            kind: "parent-drop",
            role: "blood",
            x1: bondX,
            y1: bondY,
            x2: bondX,
            y2: busY,
            persons: couplePersons,
        });

        // (b) sibling bus across the children's x range
        const childCenters = childPositions.map((c) => cardMidX(c.pos, cardW));
        const minBusX = Math.min(...childCenters, bondX);
        const maxBusX = Math.max(...childCenters, bondX);
        if (minBusX !== maxBusX) {
            out.push({
                id: `couple:${k}/bus`,
                kind: "sibling-bus",
                role: "blood",
                x1: minBusX,
                y1: busY,
                x2: maxBusX,
                y2: busY,
                persons: couplePersons,
            });
        }

        // (c) per-child drops, deduped by x (stack-of-children rendered as one drop)
        const deepestByX = new Map<number, { y: number; id: PersonId }>();
        for (const c of childPositions) {
            const x = cardMidX(c.pos, cardW);
            const top = cardTopY(c.pos);
            const cur = deepestByX.get(x);
            if (!cur || top > cur.y) deepestByX.set(x, { y: top, id: c.id });
            handled.add(c.id);
        }
        for (const [x, { y, id }] of deepestByX) {
            out.push({
                id: `couple:${k}/child:${id}`,
                kind: "child-drop",
                role: "blood",
                x1: x,
                y1: busY,
                x2: x,
                y2: y,
                persons: [couple.leftId, couple.rightId, id],
            });
        }
    }

    // ---------- (3) single-parent (only mother or only father, or partner not placed) ----------
    interface ParentGroup {
        parentPos: Slot;
        kids: { id: PersonId; pos: Slot }[];
    }
    const byParent = new Map<PersonId, ParentGroup>();
    for (const person of Object.values(tree.people)) {
        if (handled.has(person.id)) continue;
        const cPos = positions.get(person.id);
        if (!cPos) continue;
        for (const parentId of [person.motherId, person.fatherId]) {
            if (!parentId) continue;
            const pPos = positions.get(parentId);
            if (!pPos) continue;
            const entry = byParent.get(parentId);
            if (entry) entry.kids.push({ id: person.id, pos: cPos });
            else byParent.set(parentId, { parentPos: pPos, kids: [{ id: person.id, pos: cPos }] });
        }
    }

    for (const [parentId, { parentPos, kids }] of byParent) {
        const dropX = cardMidX(parentPos, cardW);
        const dropY = cardBottomY(parentPos, cardH);
        if (kids.length === 1) {
            const c = kids[0];
            if (!c) continue;
            const cx = cardMidX(c.pos, cardW);
            const cy = cardTopY(c.pos);
            const midY = (dropY + cy) / 2;
            if (dropX === cx) {
                out.push({
                    id: `single:${parentId}/${c.id}`,
                    kind: "child-drop",
                    role: "blood",
                    x1: dropX,
                    y1: dropY,
                    x2: cx,
                    y2: cy,
                    persons: [parentId, c.id],
                });
            } else {
                out.push({
                    id: `single:${parentId}/${c.id}/v1`,
                    kind: "parent-drop",
                    role: "blood",
                    x1: dropX,
                    y1: dropY,
                    x2: dropX,
                    y2: midY,
                    persons: [parentId, c.id],
                });
                out.push({
                    id: `single:${parentId}/${c.id}/h`,
                    kind: "sibling-bus",
                    role: "blood",
                    x1: dropX,
                    y1: midY,
                    x2: cx,
                    y2: midY,
                    persons: [parentId, c.id],
                });
                out.push({
                    id: `single:${parentId}/${c.id}/v2`,
                    kind: "child-drop",
                    role: "blood",
                    x1: cx,
                    y1: midY,
                    x2: cx,
                    y2: cy,
                    persons: [parentId, c.id],
                });
            }
        } else {
            const minChildTop = Math.min(...kids.map((c) => cardTopY(c.pos)));
            const busY = (dropY + minChildTop) / 2;
            out.push({
                id: `single:${parentId}/drop`,
                kind: "parent-drop",
                role: "blood",
                x1: dropX,
                y1: dropY,
                x2: dropX,
                y2: busY,
                persons: [parentId],
            });

            const xs = kids.map((c) => cardMidX(c.pos, cardW));
            const minX = Math.min(...xs, dropX);
            const maxX = Math.max(...xs, dropX);
            if (minX !== maxX) {
                out.push({
                    id: `single:${parentId}/bus`,
                    kind: "sibling-bus",
                    role: "blood",
                    x1: minX,
                    y1: busY,
                    x2: maxX,
                    y2: busY,
                    persons: [parentId],
                });
            }

            const deepestByX = new Map<number, { y: number; id: PersonId }>();
            for (const c of kids) {
                const x = cardMidX(c.pos, cardW);
                const top = cardTopY(c.pos);
                const cur = deepestByX.get(x);
                if (!cur || top > cur.y) deepestByX.set(x, { y: top, id: c.id });
            }
            for (const [x, { y, id }] of deepestByX) {
                out.push({
                    id: `single:${parentId}/child:${id}`,
                    kind: "child-drop",
                    role: "blood",
                    x1: x,
                    y1: busY,
                    x2: x,
                    y2: y,
                    persons: [parentId, id],
                });
            }
        }
    }

    // ---------- (4) bridge hops on vertical/horizontal crossings ----------
    // Drop segments that collapsed to a point (parent.bottom == busY, busY ==
    // child.top, etc.). They render as nothing but clutter the debug overlay
    // and waste work in annotateHops.
    const nonDegenerate = out.filter((s) => s.x1 !== s.x2 || s.y1 !== s.y2);
    return annotateHops(nonDegenerate);
}

// ---------- helpers ----------

function sameRow(a: Slot, b: Slot, rowH: number): boolean {
    return Math.abs(a.y - b.y) < rowH / 2;
}

function cardMidX(p: Slot, cardW: number): number {
    return p.x + cardW / 2;
}
function cardMidY(p: Slot, cardH: number): number {
    return p.y + cardH / 2;
}
function cardTopY(p: Slot): number {
    return p.y;
}
function cardBottomY(p: Slot, cardH: number): number {
    return p.y + cardH;
}
function cardLeftX(p: Slot): number {
    return p.x;
}
function cardRightX(p: Slot, cardW: number): number {
    return p.x + cardW;
}

function bondId(couple: CoupleRecord): string {
    const k =
        couple.leftId < couple.rightId
            ? `${couple.leftId}|${couple.rightId}`
            : `${couple.rightId}|${couple.leftId}`;
    return `bond:${k}:${String(couple.unionIndex)}`;
}

/**
 * Walk every (vertical, horizontal) segment pair and mark vertical segments
 * that cross an unrelated horizontal with a hop at the crossing y. "Unrelated"
 * = the two segments don't share a segment id prefix (different couple group),
 * because a couple's own bond/bus/drop intersections are intentional and
 * shouldn't get hops.
 */
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
            // strict-interior crossing only — endpoint touches don't count
            if (x <= hMinX || x >= hMaxX) continue;
            if (sameGroup(seg.id, h.id)) continue;
            hops.push(h.y1 + HOP_EPSILON);
        }
        if (hops.length === 0) {
            out.push(seg);
        } else {
            hops.sort((a, b) => a - b);
            out.push({ ...seg, hops });
        }
    }
    return out;
}

/**
 * Two segments share a "group" if their ids share the same prefix up to the
 * first slash. Used to skip hops within the same couple's edge skeleton.
 */
function sameGroup(idA: string, idB: string): boolean {
    const a = idA.split("/", 1)[0];
    const b = idB.split("/", 1)[0];
    return a !== undefined && a === b;
}
