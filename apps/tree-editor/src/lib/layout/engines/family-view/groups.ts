/*
 * FamilyTreeEditor - family-view group-frame walker (Phase 6a).
 *
 * Replaces the Phase 0 stub. Reads `tree.groups[]` (added in schema
 * 3.3.0) and emits one `GroupFrame` per group with computed geometry:
 *
 * - `hull`: convex hull around member card positions. Default for
 *   dynasty / house / household; semi-transparent tinted fill behind
 *   the cards.
 * - `band`: vertical slice spanning the member rank range. Default for
 *   faction / order / covenant.
 * - `ribbon`: top-of-bbox header bar spanning the group's rank range.
 *   Default for clan.
 *
 * The walker keeps only members that are visible in the current layout
 * (the `nodes` map). A group with zero visible members emits no frame
 * — keeps the SVG clean when a focus subset doesn't intersect the
 * group's roster.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Group, GroupFrameStyle, PersonId, Tree } from "$lib/domain/types";
import { PERSON_W } from "$lib/layout/constants";
import { CARD_H } from "$lib/layout/engines/family-view/layout";
import type { FamilyViewNode } from "$lib/layout/engines/family-view/types";

interface LayoutBbox {
    readonly width: number;
    readonly height: number;
}

export type GroupFrameKind = GroupFrameStyle;

/** Re-export the canonical 7-kind alias from domain so existing engine consumers stay stable. */
export type { GroupKind } from "$lib/domain/types";

export interface GroupFrame {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly frame: GroupFrameKind;
    readonly memberIds: readonly PersonId[];
    /** Hull vertices in canvas units (clockwise). Empty for band / ribbon. */
    readonly hull?: readonly { readonly x: number; readonly y: number }[];
    /** Band / ribbon rectangle in canvas units. Empty for hull. */
    readonly rect?: {
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
    };
    /** Optional palette colour override from the group's frame override. */
    readonly color?: string;
}

/** Default frame-style for a given group kind. */
function defaultFrameStyle(kind: string): GroupFrameKind {
    if (kind === "dynasty" || kind === "house" || kind === "household") return "hull";
    if (kind === "clan") return "ribbon";
    return "band";
}

/**
 * Walk every group in the tree. For each, intersect `memberIds` with
 * visible nodes; compute hull / band / ribbon geometry based on the
 * effective style (group.frame.style override falls back to the
 * kind-defaulted style). Emits frames in the order they appear in
 * `tree.groups[]` so the renderer can stack consistently.
 */
export function buildGroups(
    tree: Tree,
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
    bbox: LayoutBbox,
): readonly GroupFrame[] {
    const out: GroupFrame[] = [];
    for (const g of tree.groups ?? []) {
        const visible = g.memberIds.filter((id) => nodes.has(id));
        if (visible.length === 0) continue;
        const style = g.frame?.style ?? defaultFrameStyle(g.kind);
        const frame = buildOneFrame(g, visible, style, nodes, bbox);
        if (frame) out.push(frame);
    }
    return out;
}

function buildOneFrame(
    g: Group,
    visible: readonly PersonId[],
    style: GroupFrameKind,
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
    bbox: LayoutBbox,
): GroupFrame | null {
    const base: GroupFrame = {
        id: g.id,
        name: g.name,
        kind: g.kind,
        frame: style,
        memberIds: visible,
        ...(g.frame?.color !== undefined ? { color: g.frame.color } : {}),
    };
    if (style === "hull") {
        const points = collectMemberCenters(visible, nodes);
        if (points.length === 0) return null;
        const hull = convexHull(points);
        return { ...base, hull };
    }
    if (style === "band" || style === "ribbon") {
        const rect = bandOrRibbonRect(visible, nodes, bbox, style);
        if (!rect) return null;
        return { ...base, rect };
    }
    return base;
}

function collectMemberCenters(
    visible: readonly PersonId[],
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    for (const id of visible) {
        const n = nodes.get(id);
        if (!n) continue;
        const h = n.h ?? CARD_H;
        pts.push({ x: n.x + PERSON_W / 2, y: n.y + h / 2 });
    }
    return pts;
}

function bandOrRibbonRect(
    visible: readonly PersonId[],
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
    bbox: LayoutBbox,
    style: GroupFrameKind,
): { x: number; y: number; w: number; h: number } | null {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const id of visible) {
        const n = nodes.get(id);
        if (!n) continue;
        const h = n.h ?? CARD_H;
        if (n.x < minX) minX = n.x;
        if (n.x + PERSON_W > maxX) maxX = n.x + PERSON_W;
        if (n.y < minY) minY = n.y;
        if (n.y + h > maxY) maxY = n.y + h;
    }
    if (!Number.isFinite(minX)) return null;
    if (style === "band") {
        // Band spans the full canvas height inside the member x-range.
        // pad is in unit-space (multiplied by UNIT at SVG render time).
        const pad = 0.25;
        return { x: minX - pad, y: 0, w: maxX - minX + pad * 2, h: bbox.height };
    }
    // Ribbon: top header bar across the member x-range, fixed height in
    // unit-space (multiplied by UNIT at render time in the SVG layer).
    // 0.5 units ≈ 40px at the default UNIT=80, which fits a single text
    // line plus padding above the topmost member's card top.
    const ribbonH = 0.5;
    const pad = 0.25;
    return { x: minX - pad, y: minY - ribbonH - 0.15, w: maxX - minX + pad * 2, h: ribbonH };
}

/**
 * Andrew's monotone chain. Returns the convex hull in clockwise order
 * (smallest-y first). Duplicate points fold; collinear points are kept
 * on the hull so degenerate vertical / horizontal sequences still
 * produce a closed polygon the renderer can fill.
 */
function convexHull(points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
    if (points.length <= 1) return [...points];
    const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const cross = (
        o: { x: number; y: number },
        a: { x: number; y: number },
        b: { x: number; y: number },
    ) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower: { x: number; y: number }[] = [];
    for (const p of pts) {
        while (
            lower.length >= 2 &&
            cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
        ) {
            lower.pop();
        }
        lower.push(p);
    }
    const upper: { x: number; y: number }[] = [];
    for (let i = pts.length - 1; i >= 0; i -= 1) {
        const p = pts[i]!;
        while (
            upper.length >= 2 &&
            cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
        ) {
            upper.pop();
        }
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    return [...lower, ...upper];
}
