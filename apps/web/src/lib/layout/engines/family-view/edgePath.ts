/*
 * FamilyTreeEditor - family-view SVG path emitter for edge polylines.
 *
 * Phase 2 of the visual fix-up plan extracted this from FamilyViewCanvas
 * so the integer-pixel rounding (visual-fixup #6, sub-pixel T-junction
 * artifacts) is unit-testable. The function is worker-safe pure: takes
 * a polyline in unit space + the unit→pixel scale, returns an SVG
 * `d` string with every coordinate snapped to the nearest integer
 * pixel via `Math.round`.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

export interface PolylinePoint {
    readonly x: number;
    readonly y: number;
}

/**
 * Convert a polyline (in unit space) to an SVG `d` attribute string,
 * snapping every coordinate to the nearest integer pixel. The snap
 * makes T-junction strokes render crisply at the design zoom (1.0×);
 * non-1 zooms still anti-alias because the pixel grid shifts under
 * the rounded coordinates — `shape-rendering: crispEdges` on the
 * stroke layer is the fallback for those.
 */
export function edgePath(points: readonly PolylinePoint[], unit: number): string {
    if (points.length === 0) return "";
    const head = points[0]!;
    let d = `M ${String(Math.round(head.x * unit))} ${String(Math.round(head.y * unit))}`;
    for (let i = 1; i < points.length; i += 1) {
        const p = points[i]!;
        d += ` L ${String(Math.round(p.x * unit))} ${String(Math.round(p.y * unit))}`;
    }
    return d;
}
