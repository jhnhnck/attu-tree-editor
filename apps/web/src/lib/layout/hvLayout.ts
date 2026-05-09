/*
 * FamilyTreeEditor - focus-aware horizontal-vertical family-tree layout.
 *
 * Owns the placement of every visible person on a unit-coordinate grid
 * compatible with TreeCanvas.svelte's existing transform math (1 unit = UNIT
 * pixels; a person card is 2 units wide and sits in a 2-unit-tall row, with
 * the actual card visually inset by GAP/2). The output `positions` map gives
 * each person's top-left corner in unit coords; the canvas size is the
 * bounding box.
 *
 * Algorithm: a per-component Reingold-Tilford-flavoured layered tree where
 * each person attaches to a single "primary parent" (mother first, then
 * father, then any visible parent). The primary-parent forest is RT-laid-out
 * top-down and translated so the focus person lands at (0, 0) within its
 * component. Components stack horizontally with a fixed gap.
 *
 * Spouses currently keep whatever position the primary-parent walk produced
 * for them; an "attach spouse beside partner" sweep runs after the main pass
 * to nudge spouses that happen to be siblings or other relatives so they
 * sit adjacent to their partner where possible without breaking the tree's
 * left-to-right packing. In-law spouses with no visible parents become their
 * own forest root and are placed adjacent to their partner via the same
 * sweep when there's room.
 *
 * Compaction: each subtree carries a left-contour and right-contour array
 * (one entry per row it touches). When two adjacent sibling subtrees are
 * paired, the right one slides leftward by max-over-rows
 * (left.right[r] - right.left[r] - SIBLING_GAP), ensuring no overlap while
 * removing dead space — the standard tidy-tree contour merge.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";
import { buildAdjacency, connectedComponents, type Adjacency } from "$lib/layout/graph";

/** width of a single person card in unit coords (matches CELL_W / UNIT) */
export const PERSON_W = 2;
/** vertical step between generation rows in unit coords (matches relatives-tree's SIZE) */
export const ROW_H = 2;
/** minimum gap between adjacent siblings within a sibship */
export const SIBLING_GAP = 0.5;
/** minimum gap between adjacent subtrees that are not siblings */
export const SUBTREE_GAP = 1;
/** gap between disconnected components */
export const COMPONENT_GAP = 4;
/** grid step for isolated (zero-relation) people */
export const ISOLATED_STEP = 3;
/** max horizontal span for a couple bond; longer bonds trigger ghost placement */
export const GHOST_THRESHOLD = 8;

export interface HvLayoutOptions {
    /** anchor person; default = tree.rootId. focus's component centers on this person. */
    focusId?: PersonId;
    /**
     * subset of person ids that should be laid out. Default = every person in
     * `tree.people`. Hidden ids are dropped before component detection so the
     * layout stays consistent with what the renderer will draw.
     */
    visible?: ReadonlySet<PersonId>;
}

export interface ComponentInfo {
    /** the focus chosen for this component (= layout's tree.rootId if in component, else picked). */
    rootId: PersonId;
    /** number of people laid out in this component */
    size: number;
    /** horizontal offset where this component starts (unit coords) */
    offsetLeft: number;
}

export interface GhostNode {
    /** the real person being duplicated as a ghost */
    ghostOf: PersonId;
    /** partner they're placed next to */
    nearId: PersonId;
    /** position in unit coords (adjacent to nearId) */
    x: number;
    y: number;
}

export interface HvLayoutResult {
    /** every visible person → top-left in unit coords */
    positions: ReadonlyMap<PersonId, { x: number; y: number }>;
    /** bounding box in unit coords */
    canvas: { width: number; height: number };
    components: readonly ComponentInfo[];
    /** people with zero edges; rendered in a grid below the main components */
    isolated: readonly PersonId[];
    /** people rendered as ghosts adjacent to long-span spouses */
    ghosts: readonly GhostNode[];
    totalPeople: number;
    laidOutPeople: number;
}

export function hvLayout(tree: Tree, opts: HvLayoutOptions = {}): HvLayoutResult {
    const adj = buildAdjacency(tree);
    const focusId = opts.focusId ?? tree.rootId;
    const visibleInput = opts.visible ?? new Set<PersonId>(Object.keys(tree.people));
    const visible = new Set<PersonId>();
    for (const id of visibleInput) {
        if (tree.people[id]) visible.add(id);
    }

    const allComps = connectedComponents(tree, adj);
    const compsFiltered: PersonId[][] = [];
    for (const comp of allComps) {
        const filtered = comp.filter((id) => visible.has(id));
        if (filtered.length > 0) compsFiltered.push(filtered);
    }

    // focus's component first, then by size desc
    compsFiltered.sort((a, b) => {
        const aFocus = a.includes(focusId) ? -1 : 0;
        const bFocus = b.includes(focusId) ? -1 : 0;
        return aFocus - bFocus || b.length - a.length;
    });

    const positions = new Map<PersonId, { x: number; y: number }>();
    const componentInfo: ComponentInfo[] = [];
    const isolatedIds: PersonId[] = [];
    let xCursor = 0;
    let canvasH = 0;

    for (const comp of compsFiltered) {
        if (comp.length === 1) {
            const only = comp[0];
            if (only !== undefined) isolatedIds.push(only);
            continue;
        }
        const compSet = new Set<PersonId>(comp);
        const compFocus = comp.includes(focusId) ? focusId : pickComponentFocus(comp, tree, adj);
        const sub = layoutComponent(tree, compSet, compFocus, adj);
        for (const [id, pos] of sub.positions) {
            positions.set(id, { x: pos.x + xCursor, y: pos.y });
        }
        componentInfo.push({ rootId: compFocus, size: comp.length, offsetLeft: xCursor });
        xCursor += sub.width + COMPONENT_GAP;
        if (sub.height > canvasH) canvasH = sub.height;
    }

    if (isolatedIds.length > 0) {
        const cols = Math.max(1, Math.ceil(Math.sqrt(isolatedIds.length)));
        const rowY = canvasH > 0 ? canvasH + COMPONENT_GAP : 0;
        for (let i = 0; i < isolatedIds.length; i++) {
            const id = isolatedIds[i];
            if (id === undefined) continue;
            const col = i % cols;
            const row = Math.floor(i / cols);
            positions.set(id, { x: col * ISOLATED_STEP, y: rowY + row * ISOLATED_STEP });
        }
        canvasH = rowY + Math.ceil(isolatedIds.length / cols) * ISOLATED_STEP;
        if (cols * ISOLATED_STEP > xCursor) xCursor = cols * ISOLATED_STEP;
    }

    // recenter so layout starts at (0, 0) — RT can produce negative x for
    // people left of the layout's primary root; shift so the bounding box
    // touches the origin
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const pos of positions.values()) {
        if (pos.x < minX) minX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.x + PERSON_W > maxX) maxX = pos.x + PERSON_W;
        if (pos.y + ROW_H > maxY) maxY = pos.y + ROW_H;
    }
    if (positions.size > 0) {
        for (const [id, pos] of positions) {
            positions.set(id, { x: pos.x - minX, y: pos.y - minY });
        }
        // adjust component offsets too so they remain accurate
        for (const ci of componentInfo) {
            ci.offsetLeft -= minX;
        }
    }

    // precompute joint-children y-positions per couple so the ghost loop
    // can identify the primary parent geometrically (whichever partner sits
    // one row above the joint children)
    const jointKey = (m: PersonId, f: PersonId): string => (m < f ? `${m}|${f}` : `${f}|${m}`);
    const jointChildrenY = new Map<string, number[]>();
    for (const person of Object.values(tree.people)) {
        const m = person.motherId;
        const f = person.fatherId;
        if (!m || !f) continue;
        const childPos = positions.get(person.id);
        if (!childPos) continue;
        const k = jointKey(m, f);
        const list = jointChildrenY.get(k);
        if (list) list.push(childPos.y);
        else jointChildrenY.set(k, [childPos.y]);
    }

    // ghost placement: for couples whose two partners landed apart in x or on
    // different rows, mirror the non-primary partner adjacent to the primary
    // partner's column at the primary partner's row, so bond/drop/bus can be
    // routed locally to the children's row instead of crossing the whole canvas
    const ghosts: GhostNode[] = [];
    // per-row x positions of every real card and every ghost placed so far;
    // used as an interval-overlap check (|dx| < PERSON_W) so a ghost never
    // lands on top of either kind. a Set<"x,y"> string-key — as before — only
    // catches exact stacks, missing the half-step offsets that subtree
    // centering produces.
    const occupiedByY = new Map<number, number[]>();
    for (const pos of positions.values()) {
        const xs = occupiedByY.get(pos.y);
        if (xs) xs.push(pos.x);
        else occupiedByY.set(pos.y, [pos.x]);
    }
    const overlapsOccupied = (x: number, y: number): boolean => {
        const xs = occupiedByY.get(y);
        if (!xs) return false;
        for (const ox of xs) if (Math.abs(ox - x) < PERSON_W) return true;
        return false;
    };
    for (const couple of tree.couples) {
        if (couple.leftId === couple.rightId) continue;
        const aPos = positions.get(couple.leftId);
        const bPos = positions.get(couple.rightId);
        if (!aPos || !bPos) continue;
        const span = Math.abs(aPos.x - bPos.x);
        const crossRow = Math.abs(aPos.y - bPos.y) >= ROW_H;
        if (span <= GHOST_THRESHOLD && !crossRow) continue;

        // primary = whichever partner is exactly one row above the joint
        // children; falls back to x-center heuristic for childless couples
        // (where no children disambiguate which partner anchors the row)
        const k = jointKey(couple.leftId, couple.rightId);
        const childYs = jointChildrenY.get(k) ?? [];
        let primary: "a" | "b" | undefined;
        for (const cy of childYs) {
            if (Math.abs(cy - aPos.y - ROW_H) < 0.01) {
                primary = "a";
                break;
            }
            if (Math.abs(cy - bPos.y - ROW_H) < 0.01) {
                primary = "b";
                break;
            }
        }

        let ghostPerson: PersonId;
        let nearPerson: PersonId;
        let nearPos: { x: number; y: number };
        if (primary === "a") {
            ghostPerson = couple.rightId;
            nearPerson = couple.leftId;
            nearPos = aPos;
        } else if (primary === "b") {
            ghostPerson = couple.leftId;
            nearPerson = couple.rightId;
            nearPos = bPos;
        } else {
            const centerX = (aPos.x + bPos.x) / 2;
            const aFar = aPos.x < centerX;
            ghostPerson = aFar ? couple.leftId : couple.rightId;
            nearPerson = aFar ? couple.rightId : couple.leftId;
            nearPos = aFar ? bPos : aPos;
        }

        let ghostX = nearPos.x + PERSON_W + SIBLING_GAP;
        const ghostY = nearPos.y;
        let attempts = 0;
        while (overlapsOccupied(ghostX, ghostY) && attempts < 20) {
            ghostX += PERSON_W + SIBLING_GAP;
            attempts++;
        }
        if (attempts >= 20) {
            console.warn(
                `hvLayout: ghost placement exhausted for ${ghostPerson} near ${nearPerson} at y=${ghostY}`,
            );
        }
        const xs = occupiedByY.get(ghostY);
        if (xs) xs.push(ghostX);
        else occupiedByY.set(ghostY, [ghostX]);
        ghosts.push({ ghostOf: ghostPerson, nearId: nearPerson, x: ghostX, y: ghostY });
    }

    // extend canvas width to include ghost x-extents
    let maxGhostX = 0;
    for (const g of ghosts) {
        if (g.x + PERSON_W > maxGhostX) maxGhostX = g.x + PERSON_W;
    }

    const width = positions.size > 0 ? Math.max(maxX - minX, maxGhostX, 1) : 1;
    const height = positions.size > 0 ? Math.max(maxY - minY, 1) : 1;

    return {
        positions,
        canvas: { width, height },
        components: componentInfo,
        isolated: isolatedIds,
        ghosts,
        totalPeople: visible.size,
        laidOutPeople: positions.size,
    };
}

/** Pick a "layout focus" for a component that doesn't contain the user's focus. */
function pickComponentFocus(comp: readonly PersonId[], tree: Tree, adj: Adjacency): PersonId {
    if (comp.includes(tree.rootId)) return tree.rootId;
    const compSet = new Set(comp);
    for (const id of comp) {
        const parents = adj.parentsOf.get(id) ?? [];
        if (parents.every((p) => !compSet.has(p))) return id;
    }
    const fallback = comp[0];
    if (fallback === undefined) throw new Error("pickComponentFocus on empty component");
    return fallback;
}

interface ComponentLayout {
    positions: Map<PersonId, { x: number; y: number }>;
    width: number;
    height: number;
}

/** Place every person in a single connected component, focused on `focusId`. */
function layoutComponent(
    tree: Tree,
    compSet: ReadonlySet<PersonId>,
    focusId: PersonId,
    adj: Adjacency,
): ComponentLayout {
    // step 1: pick a primary parent for each person (mother first, then father,
    // then any visible parent); the primary parent is what they'll be anchored
    // under during the RT walk
    const primaryParent = new Map<PersonId, PersonId | undefined>();
    for (const id of compSet) {
        const person = tree.people[id];
        if (!person) continue;
        let primary: PersonId | undefined;
        if (person.motherId && compSet.has(person.motherId)) {
            primary = person.motherId;
        } else if (person.fatherId && compSet.has(person.fatherId)) {
            primary = person.fatherId;
        } else {
            const visParents = (adj.parentsOf.get(id) ?? []).filter((p) => compSet.has(p));
            primary = visParents[0];
        }
        primaryParent.set(id, primary);
    }

    // children-by-primary-parent
    const childrenByPrimary = new Map<PersonId, PersonId[]>();
    for (const [id, par] of primaryParent) {
        if (par === undefined) continue;
        const list = childrenByPrimary.get(par);
        if (list) list.push(id);
        else childrenByPrimary.set(par, [id]);
    }

    // deterministic sibling order — by birth-year if available, else by id
    for (const [, kids] of childrenByPrimary) {
        kids.sort((a, b) => birthOrderCompare(tree, a, b));
    }

    // step 2: forest roots = people with no primary parent
    const layoutRoots: PersonId[] = [];
    for (const id of compSet) {
        if (primaryParent.get(id) === undefined) layoutRoots.push(id);
    }
    // place focus's lineage root first; otherwise sort by descending subtree size
    const ancestorOfFocus = ancestorChainTo(focusId, primaryParent);
    layoutRoots.sort((a, b) => {
        const aIsAnc = ancestorOfFocus.has(a) ? -1 : 0;
        const bIsAnc = ancestorOfFocus.has(b) ? -1 : 0;
        if (aIsAnc !== bIsAnc) return aIsAnc - bIsAnc;
        return subtreeSize(b, childrenByPrimary) - subtreeSize(a, childrenByPrimary);
    });

    // step 3: RT each layout root
    const positions = new Map<PersonId, { x: number; y: number }>();
    let xCursor = 0;
    for (const root of layoutRoots) {
        const sub = rtPlace(root, childrenByPrimary, 0);
        for (const [id, pos] of sub.positions) {
            positions.set(id, { x: pos.x + xCursor - sub.minX, y: pos.y });
        }
        xCursor += sub.width + SUBTREE_GAP;
    }

    // step 4: translate so focus lands at x=0 (the canvas-level recenter
    // after this step puts (0,0) at the bounding-box top-left, but inside the
    // component we still want focus near the horizontal center for downstream
    // canvas pan-to-focus to land cleanly)
    const fpos = positions.get(focusId);
    if (fpos) {
        const dx = -fpos.x;
        for (const [id, pos] of positions) {
            positions.set(id, { x: pos.x + dx, y: pos.y });
        }
    }

    // bounding box
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = 0;
    for (const pos of positions.values()) {
        if (pos.x < minX) minX = pos.x;
        if (pos.x + PERSON_W > maxX) maxX = pos.x + PERSON_W;
        if (pos.y + ROW_H > maxY) maxY = pos.y + ROW_H;
    }

    return {
        positions,
        width: maxX - minX,
        height: maxY,
    };
}

interface RtSubtree {
    /** every person id in this subtree → its (x, y) where x is relative to the subtree's own coordinate frame */
    positions: Map<PersonId, { x: number; y: number }>;
    /** subtree's leftmost x (often 0) */
    minX: number;
    /** subtree's full width */
    width: number;
    /** left contour: per row index, the smallest x of any node in this subtree at that row */
    left: number[];
    /** right contour: per row index, the largest (x + PERSON_W) of any node in this subtree at that row */
    right: number[];
}

/**
 * Reingold-Tilford-style placement of a subtree rooted at `id`.
 * - Leaves get x = 0.
 * - Internal nodes' children are placed adjacent left-to-right with
 *   contour-merge compaction; the parent is centered above them.
 * Returns the positions in the subtree's local frame plus its left/right
 * contours so the next sibling can compact against this subtree.
 */
function rtPlace(
    id: PersonId,
    childrenByPrimary: ReadonlyMap<PersonId, readonly PersonId[]>,
    depth: number,
): RtSubtree {
    const y = depth * ROW_H;
    const kids = childrenByPrimary.get(id) ?? [];

    if (kids.length === 0) {
        return {
            positions: new Map([[id, { x: 0, y }]]),
            minX: 0,
            width: PERSON_W,
            left: [0],
            right: [PERSON_W],
        };
    }

    // place each child as a subtree, then pack adjacent children using contour merge
    const subs: RtSubtree[] = [];
    const combinedLeft: number[] = [];
    const combinedRight: number[] = [];
    let cursor = 0;
    let firstChildCenter = 0;
    let lastChildCenter = 0;

    for (let i = 0; i < kids.length; i++) {
        const childId = kids[i];
        if (childId === undefined) continue;
        const sub = rtPlace(childId, childrenByPrimary, depth + 1);

        let shift = 0;
        if (i === 0) {
            shift = -sub.minX;
        } else {
            // contour merge: find the smallest gap across overlapping rows
            const overlapRows = Math.min(combinedRight.length, sub.left.length);
            let maxIntrusion = -Number.POSITIVE_INFINITY;
            for (let r = 0; r < overlapRows; r++) {
                const myRight = combinedRight[r];
                const theirLeft = sub.left[r];
                if (myRight === undefined || theirLeft === undefined) continue;
                const intrusion = myRight + SIBLING_GAP - theirLeft;
                if (intrusion > maxIntrusion) maxIntrusion = intrusion;
            }
            if (maxIntrusion === -Number.POSITIVE_INFINITY) {
                // no overlap rows shouldn't happen for siblings (all share row depth+1),
                // but guard anyway
                shift = cursor + SIBLING_GAP - sub.minX;
            } else {
                shift = maxIntrusion;
            }
        }

        // apply shift to sub's positions and contours
        for (const [pid, pos] of sub.positions) {
            sub.positions.set(pid, { x: pos.x + shift, y: pos.y });
        }
        const shiftedLeft = sub.left.map((v) => v + shift);
        const shiftedRight = sub.right.map((v) => v + shift);

        subs.push({
            ...sub,
            minX: sub.minX + shift,
            left: shiftedLeft,
            right: shiftedRight,
        });

        // merge contours
        for (let r = 0; r < shiftedLeft.length; r++) {
            const cl = combinedLeft[r];
            const sl = shiftedLeft[r];
            if (sl === undefined) continue;
            if (cl === undefined || sl < cl) combinedLeft[r] = sl;
        }
        for (let r = 0; r < shiftedRight.length; r++) {
            const cr = combinedRight[r];
            const sr = shiftedRight[r];
            if (sr === undefined) continue;
            if (cr === undefined || sr > cr) combinedRight[r] = sr;
        }

        cursor = combinedRight[0] ?? cursor;
        const childPos = sub.positions.get(childId);
        if (childPos) {
            const center = childPos.x + PERSON_W / 2;
            if (i === 0) firstChildCenter = center;
            lastChildCenter = center;
        }
    }

    // place this id centered above the children
    const myCenter = (firstChildCenter + lastChildCenter) / 2;
    const myX = myCenter - PERSON_W / 2;

    const positions = new Map<PersonId, { x: number; y: number }>();
    positions.set(id, { x: myX, y });
    for (const sub of subs) {
        for (const [pid, pos] of sub.positions) positions.set(pid, pos);
    }

    // prepend self to contours
    const left = [myX, ...combinedLeft];
    const right = [myX + PERSON_W, ...combinedRight];

    // bounding box at depth 0 (this row): myX vs combined contour
    let minX = myX;
    let maxRight = myX + PERSON_W;
    for (let r = 0; r < combinedLeft.length; r++) {
        const cl = combinedLeft[r];
        if (cl !== undefined && cl < minX) minX = cl;
    }
    for (let r = 0; r < combinedRight.length; r++) {
        const cr = combinedRight[r];
        if (cr !== undefined && cr > maxRight) maxRight = cr;
    }

    return {
        positions,
        minX,
        width: maxRight - minX,
        left,
        right,
    };
}

/** People in `target`'s primary-parent chain (their direct ancestors). */
function ancestorChainTo(
    target: PersonId,
    primaryParent: ReadonlyMap<PersonId, PersonId | undefined>,
): Set<PersonId> {
    const out = new Set<PersonId>();
    let cur: PersonId | undefined = target;
    while (cur !== undefined) {
        out.add(cur);
        cur = primaryParent.get(cur);
    }
    return out;
}

/** Subtree size (count) — for sorting sibling subtrees biggest-first. */
function subtreeSize(
    id: PersonId,
    childrenByPrimary: ReadonlyMap<PersonId, readonly PersonId[]>,
): number {
    let n = 1;
    for (const child of childrenByPrimary.get(id) ?? []) {
        n += subtreeSize(child, childrenByPrimary);
    }
    return n;
}

/** Compare for sibling birth order; falls back to id-string compare. */
function birthOrderCompare(tree: Tree, a: PersonId, b: PersonId): number {
    const pa = tree.people[a];
    const pb = tree.people[b];
    const ya = pa?.birth?.year;
    const yb = pb?.birth?.year;
    if (ya !== undefined && yb !== undefined && ya !== yb) return ya - yb;
    if (ya !== undefined && yb === undefined) return -1;
    if (ya === undefined && yb !== undefined) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
}
