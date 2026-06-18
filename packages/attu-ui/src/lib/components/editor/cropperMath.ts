/*
 * FamilyTreeEditor - pure-function math for the portrait cropper
 * licensed under the MIT license; see LICENSE.md for full text
 */

// transform applied to the source bitmap before it's drawn into the canvas.
// the frame is a fixed-position rectangle centered in the canvas; the image
// moves and scales under the frame. scale === 1 means the bitmap is drawn at
// its natural pixel size; tx/ty translate the bitmap origin (its top-left
// corner) in canvas-pixel coordinates.
export interface Transform {
    scale: number;
    tx: number;
    ty: number;
}

export interface Size {
    w: number;
    h: number;
}

// the minimum scale at which the source bitmap fully covers a frame of the
// given size. used as both the initial transform and the lower bound for
// pan/zoom clamping.
export function coverScale(src: Size, frame: Size): number {
    if (src.w <= 0 || src.h <= 0 || frame.w <= 0 || frame.h <= 0) return 1;
    return Math.max(frame.w / src.w, frame.h / src.h);
}

// center the source bitmap on a frame whose center is at (cx, cy) in canvas
// pixels, at the given scale. result is the bitmap's top-left position.
export function centerOnFrame(src: Size, scale: number, cx: number, cy: number): Transform {
    return {
        scale,
        tx: cx - (src.w * scale) / 2,
        ty: cy - (src.h * scale) / 2,
    };
}

// degenerate phase-0a initial transform: cover-fit, centered. caller supplies
// the frame center in canvas-pixel coordinates.
export function initialCoverTransform(src: Size, frame: Size, cx: number, cy: number): Transform {
    return centerOnFrame(src, coverScale(src, frame), cx, cy);
}

// extract the source-bitmap region that lies under the frame. used to drive
// the encode step: a `drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH)`
// call with these coords produces the cropped output.
export function extractSourceRect(
    src: Size,
    transform: Transform,
    frameLeft: number,
    frameTop: number,
    frame: Size,
): { sx: number; sy: number; sw: number; sh: number } {
    const s = transform.scale;
    // canvas point (x, y) maps to source-bitmap point ((x - tx) / s, (y - ty) / s).
    // frame's top-left in canvas pixels is (frameLeft, frameTop).
    const sx = (frameLeft - transform.tx) / s;
    const sy = (frameTop - transform.ty) / s;
    const sw = frame.w / s;
    const sh = frame.h / s;
    // clamp to the bitmap's bounds; drawImage tolerates out-of-bounds rects
    // but the result is implementation-defined and the encode step expects a
    // valid region.
    const cx = Math.max(0, Math.min(src.w, sx));
    const cy = Math.max(0, Math.min(src.h, sy));
    const cw = Math.max(0, Math.min(src.w - cx, sw));
    const ch = Math.max(0, Math.min(src.h - cy, sh));
    return { sx: cx, sy: cy, sw: cw, sh: ch };
}

// maximum zoom expressed as a multiple of the cover-fit scale. plan §phase 1.
export const MAX_ZOOM_MULTIPLE = 4;

// pan by (dx, dy) canvas pixels.
export function panTransform(t: Transform, dx: number, dy: number): Transform {
    return { scale: t.scale, tx: t.tx + dx, ty: t.ty + dy };
}

// zoom around a fixed canvas point (cx, cy) by `factor`. the source-bitmap
// point under (cx, cy) before the zoom is the same one under (cx, cy) after.
// derivation: canvas (x, y) -> source (x - tx) / scale; require the source
// point at (cx, cy) to be invariant -> tx' = cx - (cx - tx) * factor.
export function anchorZoom(t: Transform, cx: number, cy: number, factor: number): Transform {
    return {
        scale: t.scale * factor,
        tx: cx - (cx - t.tx) * factor,
        ty: cy - (cy - t.ty) * factor,
    };
}

// constrain a transform so the source bitmap fully covers the frame and stays
// within the zoom envelope [cover, cover * MAX_ZOOM_MULTIPLE]. assumes the
// canvas has the same dimensions as the frame (frame anchored at canvas (0,0)).
// returns a new transform; never mutates.
export function clampTransform(src: Size, frame: Size, t: Transform): Transform {
    const minScale = coverScale(src, frame);
    const maxScale = minScale * MAX_ZOOM_MULTIPLE;
    const scale = Math.min(maxScale, Math.max(minScale, t.scale));
    // bitmap drawn occupies [tx, tx + src.w * scale] x [ty, ty + src.h * scale].
    // frame is [0, frame.w] x [0, frame.h]. cover constraint: bitmap contains
    // the frame on all four sides.
    const minTx = frame.w - src.w * scale;
    const minTy = frame.h - src.h * scale;
    // when scale is exactly the cover-fit minimum and the source is wider than
    // tall (or vice versa), minTx may equal maxTx (=0) on one axis; clamp does
    // the right thing in that degenerate case.
    const tx = Math.min(0, Math.max(minTx, t.tx));
    const ty = Math.min(0, Math.max(minTy, t.ty));
    return { scale, tx, ty };
}
