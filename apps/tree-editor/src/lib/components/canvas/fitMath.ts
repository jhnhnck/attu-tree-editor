/*
 * FamilyTreeEditor - pure-math fit-to-window solver shared by the
 * tree-canvas (layered) and family-view canvases. Extracted so the
 * contract is unit-testable without a DOM mock and so chrome-aware
 * insets land in exactly one place.
 *
 * The hyperbolic engine does not call this module - its "fit" maps to
 * a reset-view since the disk projection has no euclidean zoom-fit
 * semantics.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

/**
 * CSS-pixel insets carved off the canvas-host's bounding rect before
 * computing the fit-to-window scale and pan. Each side is independent;
 * 0 means "no chrome on that side". Callers should pass the visible-
 * overlay extents measured against the canvas-host (not the document),
 * so e.g. the bottom-left pills row contributes a positive `bottom`
 * inset only when at least one pill is mounted.
 */
export interface CanvasChromeInsets {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
}

export const ZERO_INSETS: CanvasChromeInsets = Object.freeze({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
});

export interface FitInput {
    /** content width in CSS pixels (scale=1) */
    readonly contentWPx: number;
    /** content height in CSS pixels (scale=1) */
    readonly contentHPx: number;
    /**
     * Top-left of content in world coordinates (CSS pixels at scale=1).
     * Tree-canvas (layered): always 0,0 because the place pass
     * normalises minX to 0 and the layered engine starts ranks at y=0.
     * Family-view: y can be negative when ancestors extend above the
     * proband's row; pass `minNodeY * UNIT` so the centering math
     * accounts for the offset.
     */
    readonly contentOriginX: number;
    readonly contentOriginY: number;
    /** canvas-host width in CSS pixels (getBoundingClientRect().width) */
    readonly hostW: number;
    /** canvas-host height in CSS pixels */
    readonly hostH: number;
    /**
     * Extra breathing room inside the chrome-aware viewport, in CSS
     * pixels. Applied symmetrically; default 64 matches the prior
     * hard-coded engine values.
     */
    readonly padding?: number;
    /** chrome carved off the host edges; defaults to ZERO_INSETS */
    readonly insets?: CanvasChromeInsets;
    /** minimum scale floor (defaults preserve the engine's existing clamps) */
    readonly minScale: number;
    /** maximum scale ceiling */
    readonly maxScale: number;
}

export interface FitOutput {
    readonly scale: number;
    /** pan-x in CSS pixels (the canvas-stage's translate.x) */
    readonly panX: number;
    /** pan-y in CSS pixels (the canvas-stage's translate.y) */
    readonly panY: number;
}

/**
 * Resolve scale + pan so the content rect, scaled uniformly, lands
 * centred inside the visible viewport (host minus chrome insets minus
 * padding). When the available box is degenerate (insets/padding eat
 * the whole host), the scale collapses to `minScale` and the content
 * is placed at the visible-box centre without negative dimensions.
 */
export function computeFit(input: FitInput): FitOutput {
    const padding = input.padding ?? 64;
    const insets = input.insets ?? ZERO_INSETS;

    const visibleLeft = insets.left + padding;
    const visibleTop = insets.top + padding;
    const visibleWidthRaw = input.hostW - insets.left - insets.right - padding * 2;
    const visibleHeightRaw = input.hostH - insets.top - insets.bottom - padding * 2;
    // guard: degenerate viewport (very small host or oversized chrome).
    // pick a small positive box so the divisor below stays finite.
    const visibleWidth = Math.max(1, visibleWidthRaw);
    const visibleHeight = Math.max(1, visibleHeightRaw);

    const contentW = Math.max(1, input.contentWPx);
    const contentH = Math.max(1, input.contentHPx);

    const sx = visibleWidth / contentW;
    const sy = visibleHeight / contentH;
    const rawScale = Math.min(sx, sy);
    const scale = Math.max(input.minScale, Math.min(input.maxScale, rawScale));

    // centre the content's bbox in the visible box. The pan placing
    // world-space (0,0) on screen is:
    //   screenX = panX + worldX * scale
    // so for the content's top-left (originX, originY) to land at the
    // visible box's top-left + half of the slack:
    const slackX = visibleWidth - contentW * scale;
    const slackY = visibleHeight - contentH * scale;
    const panX = visibleLeft + slackX / 2 - input.contentOriginX * scale;
    const panY = visibleTop + slackY / 2 - input.contentOriginY * scale;

    return { scale, panX, panY };
}

// ---------- DOM-side chrome-inset measurement ----------

/**
 * Measure visible overlay chrome inside `hostEl` and project the
 * extents as insets from the host edges. Overlays are queried by
 * `data-canvas-chrome` attribute so each producer opts in explicitly
 * (no global "everything absolute counts" rule); see the bottom-pill
 * bar and the inspector sheet-mode wrapper for the producers.
 *
 * Returns `ZERO_INSETS` when `hostEl` is undefined or when no opted-in
 * overlays are visible. Safe to call mid-effect; reads layout via
 * `getBoundingClientRect`.
 */
export function measureCanvasChromeInsets(hostEl: HTMLElement | undefined): CanvasChromeInsets {
    if (!hostEl) return ZERO_INSETS;
    const hostRect = hostEl.getBoundingClientRect();
    if (hostRect.width <= 0 || hostRect.height <= 0) return ZERO_INSETS;
    // chrome producers live inside the canvas host OR inside the
    // surrounding <main> (the mobile inspector sheet is a flex sibling
    // of the canvas container, not a descendant of the host). walk up
    // to the nearest <main>, falling back to the immediate parent if
    // the host isn't inside one (e.g. in component unit tests).
    const scope = hostEl.closest("main") ?? hostEl.parentElement ?? hostEl;
    const els = scope.querySelectorAll<HTMLElement>("[data-canvas-chrome]");
    let top = 0;
    let right = 0;
    let bottom = 0;
    let left = 0;
    for (const el of Array.from(els)) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        // skip overlays that lie fully outside the host rect (defensive).
        if (r.bottom <= hostRect.top) continue;
        if (r.top >= hostRect.bottom) continue;
        if (r.right <= hostRect.left) continue;
        if (r.left >= hostRect.right) continue;
        // measure how far the overlay penetrates from each edge of the
        // host. each overlay can contribute to at most two opposite
        // edges; pick the deepest single-side penetration (the user's
        // mental model is "the overlay covers the bottom 40px", not
        // "the overlay covers everything outside its own bbox").
        const fromTop = Math.max(0, r.bottom - hostRect.top);
        const fromBottom = Math.max(0, hostRect.bottom - r.top);
        const fromLeft = Math.max(0, r.right - hostRect.left);
        const fromRight = Math.max(0, hostRect.right - r.left);
        // anchor side: whichever pair of distances is smaller (i.e. the
        // overlay is anchored to that edge). a bottom-anchored pill has
        // fromBottom ≈ pill-height and fromTop ≈ host-height; we want
        // fromBottom.
        const verticalSide: "top" | "bottom" = fromTop <= fromBottom ? "top" : "bottom";
        const horizontalSide: "left" | "right" = fromLeft <= fromRight ? "left" : "right";
        // a chrome element typically clings to one corner; charge only
        // the smaller of (vertical extent, horizontal extent) so we
        // don't double-count a tiny bottom-left pill as both a left
        // inset and a bottom inset of its full size.
        const vertical = verticalSide === "top" ? fromTop : fromBottom;
        const horizontal = horizontalSide === "left" ? fromLeft : fromRight;
        if (vertical <= horizontal) {
            if (verticalSide === "top") top = Math.max(top, vertical);
            else bottom = Math.max(bottom, vertical);
        } else {
            if (horizontalSide === "left") left = Math.max(left, horizontal);
            else right = Math.max(right, horizontal);
        }
    }
    return { top, right, bottom, left };
}
