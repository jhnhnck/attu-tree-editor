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
