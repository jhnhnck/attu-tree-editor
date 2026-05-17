/*
 * FamilyTreeEditor - A* obstacle-avoidance router for overlay segments.
 *
 * Phase 4 (relationship-vocabulary). Skeleton edges keep using simple
 * polylines via `edgePath.ts` because their endpoints are pre-aligned by
 * the layout. Overlays (sworn bonds, identity arcs, etc.) can connect any
 * two visible cards, so they need to avoid intervening cards to stay
 * legible. The Phase 1 30-overlay readability probe forced A* into scope
 * (60 skeleton crossings on Akarians without it).
 *
 * Coordinates are in unit space (same as `FamilyViewNode.x` / `.y`). The
 * router builds a coarse grid (default 0.5 units per cell), marks card
 * AABBs as blocked with a small margin, and runs A* with octile
 * heuristic. Grids are bbox-local: the world origin is the grid (0, 0).
 *
 * Output is a list of polyline points in unit space, with collinear
 * intermediate points removed so SVG paths stay short.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { CARD_H } from "$lib/layout/engines/family-view/layout";
import { PERSON_W } from "$lib/layout/constants";
import type { FamilyViewNode } from "$lib/layout/engines/family-view/types";
import type { PersonId } from "$lib/domain/types";

/** Unit-space grid step. 0.5 = 4 cells per card width. Tunable. */
export const GRID_STEP = 0.5;
/** Buffer around each card AABB so overlays don't skim the visible edge. */
export const CARD_MARGIN = 0.25;
/** Bail out if A* visits more than this — pathological tree, no path possible. */
export const MAX_NODES_VISITED = 8000;

export interface Point {
    readonly x: number;
    readonly y: number;
}

export interface RouterContext {
    /** Inclusive grid bounds in unit space. */
    readonly minX: number;
    readonly minY: number;
    readonly cols: number;
    readonly rows: number;
    /** `blocked[r * cols + c]` — 1 means a card AABB covers this cell (with margin). */
    readonly blocked: Uint8Array;
    /** Per-person ownership: `cellPerson[idx] = personId | undefined`. Lets the router
     *  let endpoints poke INTO their own card without false collisions. */
    readonly cellPerson: readonly (PersonId | undefined)[];
}

interface CellRef {
    readonly r: number;
    readonly c: number;
}

/**
 * Build the obstacle grid from a layout's nodes. Cards are blocked with
 * `CARD_MARGIN` padding so overlays don't graze them visibly.
 */
export function buildRouterContext(
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
    bbox: { readonly width: number; readonly height: number },
): RouterContext {
    // grid spans (0, 0) → (bbox.width, bbox.height) plus a one-cell halo
    // so endpoints near the edge can still find a free start cell.
    const halo = GRID_STEP * 2;
    const minX = -halo;
    const minY = -halo;
    const cols = Math.max(1, Math.ceil((bbox.width + 2 * halo) / GRID_STEP));
    const rows = Math.max(1, Math.ceil((bbox.height + 2 * halo) / GRID_STEP));
    const blocked = new Uint8Array(cols * rows);
    const cellPerson: (PersonId | undefined)[] = new Array<PersonId | undefined>(cols * rows).fill(
        undefined,
    );

    for (const [pid, n] of nodes) {
        const x0 = n.x - CARD_MARGIN;
        const y0 = n.y - CARD_MARGIN;
        const x1 = n.x + PERSON_W + CARD_MARGIN;
        const y1 = n.y + (n.h ?? CARD_H) + CARD_MARGIN;
        const c0 = Math.max(0, Math.floor((x0 - minX) / GRID_STEP));
        const r0 = Math.max(0, Math.floor((y0 - minY) / GRID_STEP));
        const c1 = Math.min(cols - 1, Math.floor((x1 - minX) / GRID_STEP));
        const r1 = Math.min(rows - 1, Math.floor((y1 - minY) / GRID_STEP));
        for (let r = r0; r <= r1; r += 1) {
            for (let c = c0; c <= c1; c += 1) {
                const i = r * cols + c;
                blocked[i] = 1;
                // first writer wins for cellPerson: if two cards overlap a
                // cell (shouldn't happen in normal layouts), the earlier one
                // claims it. doesn't affect routing correctness.
                if (cellPerson[i] === undefined) cellPerson[i] = pid;
            }
        }
    }

    return { minX, minY, cols, rows, blocked, cellPerson };
}

/**
 * Route an overlay from `from` to `to`, avoiding cards except those in
 * `excludeOwners` (typically the source and target person ids — the
 * router needs to leave their cards from inside).
 *
 * Returns the polyline in unit space, or `null` if no path exists within
 * the visit budget. Endpoints are clamped to the grid; the returned
 * polyline starts at `from` and ends at `to` (verbatim, not snapped).
 */
export function routeOverlay(
    ctx: RouterContext,
    from: Point,
    to: Point,
    excludeOwners: ReadonlySet<PersonId>,
): readonly Point[] | null {
    const start = pointToCell(ctx, from);
    const goal = pointToCell(ctx, to);
    if (!start || !goal) return null;

    const startIdx = cellIndex(ctx, start);
    const goalIdx = cellIndex(ctx, goal);
    const startBlocked = isBlockedForOwner(ctx, startIdx, excludeOwners);
    const goalBlocked = isBlockedForOwner(ctx, goalIdx, excludeOwners);

    // if start/goal collapse onto the same cell, short-circuit
    if (startIdx === goalIdx) return [from, to];

    // skip if we genuinely can't pass the start, even with owner exclusion
    if (startBlocked || goalBlocked) return null;

    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>();
    const open = new MinHeap<{ idx: number; f: number }>((a, b) => a.f - b.f);

    gScore.set(startIdx, 0);
    open.push({ idx: startIdx, f: heuristic(start, goal) });
    let visited = 0;

    while (open.size > 0) {
        const cur = open.pop();
        if (!cur) break;
        if (cur.idx === goalIdx) {
            const path = reconstructPath(cameFrom, cur.idx, ctx);
            return finishPath(from, to, path);
        }
        visited += 1;
        if (visited > MAX_NODES_VISITED) return null;
        const { r, c } = cellOf(ctx, cur.idx);
        for (const [dr, dc] of NEIGHBORS) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= ctx.rows || nc < 0 || nc >= ctx.cols) continue;
            const nIdx = nr * ctx.cols + nc;
            if (isBlockedForOwner(ctx, nIdx, excludeOwners)) continue;
            // diagonal movement: also forbid cutting between two blocked
            // cells (don't slip through a corner of two adjacent obstacles)
            if (dr !== 0 && dc !== 0) {
                if (
                    isBlockedForOwner(ctx, r * ctx.cols + nc, excludeOwners) &&
                    isBlockedForOwner(ctx, nr * ctx.cols + c, excludeOwners)
                ) {
                    continue;
                }
            }
            const stepCost = dr !== 0 && dc !== 0 ? Math.SQRT2 : 1;
            const tentative = (gScore.get(cur.idx) ?? Infinity) + stepCost;
            if (tentative < (gScore.get(nIdx) ?? Infinity)) {
                cameFrom.set(nIdx, cur.idx);
                gScore.set(nIdx, tentative);
                const f = tentative + heuristic({ r: nr, c: nc }, goal);
                open.push({ idx: nIdx, f });
            }
        }
    }
    return null;
}

/**
 * Strip collinear interior points from a polyline. SVG paths shrink and
 * the visual is identical. Endpoints are always kept.
 */
export function simplifyPath(points: readonly Point[]): readonly Point[] {
    if (points.length <= 2) return points;
    const out: Point[] = [points[0]!];
    for (let i = 1; i < points.length - 1; i += 1) {
        const prev = points[i - 1]!;
        const here = points[i]!;
        const next = points[i + 1]!;
        const dx1 = here.x - prev.x;
        const dy1 = here.y - prev.y;
        const dx2 = next.x - here.x;
        const dy2 = next.y - here.y;
        // collinear when cross product is zero (within tolerance)
        const cross = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(cross) > 1e-6) out.push(here);
    }
    out.push(points[points.length - 1]!);
    return out;
}

// ----- internal -----

const NEIGHBORS: readonly (readonly [number, number])[] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
];

function pointToCell(ctx: RouterContext, p: Point): CellRef | null {
    const c = Math.floor((p.x - ctx.minX) / GRID_STEP);
    const r = Math.floor((p.y - ctx.minY) / GRID_STEP);
    if (r < 0 || r >= ctx.rows || c < 0 || c >= ctx.cols) return null;
    return { r, c };
}

function cellIndex(ctx: RouterContext, cell: CellRef): number {
    return cell.r * ctx.cols + cell.c;
}

function cellOf(ctx: RouterContext, idx: number): CellRef {
    return { r: Math.floor(idx / ctx.cols), c: idx % ctx.cols };
}

function isBlockedForOwner(
    ctx: RouterContext,
    idx: number,
    excludeOwners: ReadonlySet<PersonId>,
): boolean {
    if (ctx.blocked[idx] !== 1) return false;
    const owner = ctx.cellPerson[idx];
    if (owner !== undefined && excludeOwners.has(owner)) return false;
    return true;
}

function heuristic(a: CellRef, b: CellRef): number {
    // octile distance — admissible for 8-direction grids
    const dx = Math.abs(a.c - b.c);
    const dy = Math.abs(a.r - b.r);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

function reconstructPath(
    cameFrom: ReadonlyMap<number, number>,
    goalIdx: number,
    ctx: RouterContext,
): Point[] {
    const cells: number[] = [goalIdx];
    let cur: number | undefined = goalIdx;
    while (cur !== undefined) {
        const prev = cameFrom.get(cur);
        if (prev === undefined) break;
        cells.push(prev);
        cur = prev;
    }
    cells.reverse();
    return cells.map((idx) => {
        const { r, c } = cellOf(ctx, idx);
        return {
            x: ctx.minX + (c + 0.5) * GRID_STEP,
            y: ctx.minY + (r + 0.5) * GRID_STEP,
        };
    });
}

function finishPath(from: Point, to: Point, path: readonly Point[]): readonly Point[] {
    // start grid-snap path with the verbatim from/to so the polyline
    // attaches cleanly to the source/target visual anchors
    const out: Point[] = [from];
    for (const p of path.slice(1, -1)) out.push(p);
    out.push(to);
    return simplifyPath(out);
}

// minimal binary heap; small surface, no deps
class MinHeap<T> {
    private data: T[] = [];
    constructor(private cmp: (a: T, b: T) => number) {}
    get size(): number {
        return this.data.length;
    }
    push(x: T): void {
        this.data.push(x);
        this.bubbleUp(this.data.length - 1);
    }
    pop(): T | undefined {
        if (this.data.length === 0) return undefined;
        const top = this.data[0]!;
        const last = this.data.pop();
        if (this.data.length > 0 && last !== undefined) {
            this.data[0] = last;
            this.sinkDown(0);
        }
        return top;
    }
    private bubbleUp(i: number): void {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.cmp(this.data[i]!, this.data[parent]!) < 0) {
                [this.data[i], this.data[parent]] = [this.data[parent]!, this.data[i]!];
                i = parent;
            } else break;
        }
    }
    private sinkDown(i: number): void {
        const n = this.data.length;
        while (true) {
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            let smallest = i;
            if (left < n && this.cmp(this.data[left]!, this.data[smallest]!) < 0) smallest = left;
            if (right < n && this.cmp(this.data[right]!, this.data[smallest]!) < 0)
                smallest = right;
            if (smallest === i) break;
            [this.data[i], this.data[smallest]] = [this.data[smallest]!, this.data[i]!];
            i = smallest;
        }
    }
}
