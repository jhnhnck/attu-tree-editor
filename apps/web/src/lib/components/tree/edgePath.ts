/*
 * FamilyTreeEditor - SVG path-data construction for routed edges.
 *
 * Two responsibilities split out of EdgeLayer.svelte so they can be unit
 * tested in isolation: (1) translating a RenderedSegment into an `<path d>`
 * string with quadratic-curve bridge hops at each y-crossing, and (2)
 * generating perpendicular tick marks for divorced bonds.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { RenderedSegment } from "$lib/components/tree/edges";

/** radius of the bridge-hop arc on a vertical that crosses an unrelated horizontal */
export const HOP_RADIUS = 4;

/** half-length of the perpendicular tick drawn through a divorced bond */
export const DIVORCE_TICK_HALF = 4;

/** distance between the two parallel ticks drawn for a divorced bond */
export const DIVORCE_TICK_GAP = 5;

/**
 * Returns the SVG `d` attribute for a single segment. Vertical segments with
 * `hops` get quadratic-curve arcs that bow rightward over each crossing,
 * producing the standard print-genealogy "bridge hop" notation. Everything
 * else is a straight `M…L`.
 */
export function pathFor(seg: RenderedSegment, hopRadius: number = HOP_RADIUS): string {
    // HEB-bundled long bonds: bow toward the LCA's column via a quadratic.
    // Pulled toward the control by 50% to keep the curve readable rather
    // than a tight loop.
    if (seg.bundleControl) {
        const cx =
            seg.x1 * 0.5 + seg.x2 * 0.5 + (seg.bundleControl.x - (seg.x1 + seg.x2) / 2) * 0.5;
        const cy =
            seg.y1 * 0.5 + seg.y2 * 0.5 + (seg.bundleControl.y - (seg.y1 + seg.y2) / 2) * 0.5;
        return `M ${num(seg.x1)} ${num(seg.y1)} Q ${num(cx)} ${num(cy)} ${num(seg.x2)} ${num(seg.y2)}`;
    }
    const isVertical = seg.x1 === seg.x2 && seg.y1 !== seg.y2;
    if (!isVertical || !seg.hops || seg.hops.length === 0) {
        return `M ${num(seg.x1)} ${num(seg.y1)} L ${num(seg.x2)} ${num(seg.y2)}`;
    }
    const x = seg.x1;
    const downward = seg.y2 > seg.y1;
    const hops = [...seg.hops].sort((a, b) => (downward ? a - b : b - a));

    let d = `M ${num(x)} ${num(seg.y1)}`;
    for (const h of hops) {
        // skip hops that fall outside the segment's actual span — defensive
        // since the router includes a tiny epsilon and a downstream hop can
        // sometimes drift to the boundary
        const lo = Math.min(seg.y1, seg.y2);
        const hi = Math.max(seg.y1, seg.y2);
        if (h <= lo + hopRadius || h >= hi - hopRadius) continue;

        const before = downward ? h - hopRadius : h + hopRadius;
        const after = downward ? h + hopRadius : h - hopRadius;
        const ctrlX = x + hopRadius * 1.5;
        d += ` L ${num(x)} ${num(before)} Q ${num(ctrlX)} ${num(h)} ${num(x)} ${num(after)}`;
    }
    d += ` L ${num(x)} ${num(seg.y2)}`;
    return d;
}

/**
 * For a divorced horizontal bond, returns the path data for two parallel
 * diagonal tick marks (//) through the bond's midpoint — the standard print
 * convention for "marriage ended". Returns "" for non-horizontal segments
 * (the vertical legs of an L-bond don't get ticks).
 */
export function divorceTickPath(
    seg: RenderedSegment,
    tickHalf: number = DIVORCE_TICK_HALF,
    tickGap: number = DIVORCE_TICK_GAP,
): string {
    const isHorizontal = seg.y1 === seg.y2 && seg.x1 !== seg.x2;
    if (!isHorizontal) return "";
    const mx = (seg.x1 + seg.x2) / 2;
    const y = seg.y1;
    const offsets = [-tickGap / 2, tickGap / 2];
    let out = "";
    for (const off of offsets) {
        const cx = mx + off;
        out += ` M ${num(cx - tickHalf)} ${num(y + tickHalf)} L ${num(cx + tickHalf)} ${num(y - tickHalf)}`;
    }
    return out.trim();
}

/**
 * Concatenate a list of segments into a single `d` string for one `<path>`
 * element. Each segment is emitted as its own subpath with a leading `M`.
 */
export function pathDataForGroup(segments: readonly RenderedSegment[]): string {
    return segments.map((s) => pathFor(s)).join(" ");
}

/** Same idea, for the divorced tick overlay; only emits ticks for horizontals. */
export function divorceTicksForGroup(segments: readonly RenderedSegment[]): string {
    return segments
        .map((s) => divorceTickPath(s))
        .filter((s) => s.length > 0)
        .join(" ");
}

/**
 * For a horizontal `stub` segment, returns path data for a small perpendicular
 * cap at each end — a ⊢/⊣ visual that communicates "this bond continues to a
 * partner placed elsewhere in the tree." Cap height matches DIVORCE_TICK_HALF
 * so it is visually consistent with the divorced-bond tick style.
 */
export function stubCapPath(seg: RenderedSegment): string {
    if (seg.kind !== "stub") return "";
    if (seg.y1 !== seg.y2) return ""; // only horizontal stubs
    const y = seg.y1;
    const half = DIVORCE_TICK_HALF;
    return (
        `M ${num(seg.x1)} ${num(y - half)} L ${num(seg.x1)} ${num(y + half)}` +
        ` M ${num(seg.x2)} ${num(y - half)} L ${num(seg.x2)} ${num(y + half)}`
    );
}

/** Concatenate stub-cap paths for all stub segments in a group. */
export function stubCapsForGroup(segments: readonly RenderedSegment[]): string {
    return segments
        .filter((s) => s.kind === "stub")
        .map(stubCapPath)
        .filter((s) => s.length > 0)
        .join(" ");
}

/**
 * Compute an SVG `stroke-width` value (in canvas-coord units, i.e. before the
 * canvas's `scale` transform applies) such that the stroke renders at
 * `targetScreenPx` pixels on screen, with a small bonus on zoom-out so edges
 * grow thicker when individual cards become unreadable. Closes the
 * "edge lines should grow thicker / darker as the canvas zooms out" to-do.
 *
 * Formula:
 *   targetPx(scale) = basePx + zoomOutBoost * max(0, 1 - scale)
 *   strokeWidth     = targetPx(scale) / scale
 */
export function zoomAwareStroke(basePx: number, scale: number, zoomOutBoost: number = 1.5): number {
    const safeScale = Math.max(scale, 0.001);
    const targetPx = basePx + zoomOutBoost * Math.max(0, 1 - safeScale);
    return targetPx / safeScale;
}

/** Trim trailing zeros so SVG path data stays compact; not load-bearing. */
function num(n: number): string {
    return Number.isFinite(n) ? Math.round(n * 100) / 100 + "" : "0";
}
