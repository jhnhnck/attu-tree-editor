/*
 * FamilyTreeEditor - encode a cropped source-rect to a webp Uint8Array
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { SourceBitmap } from "$lib/components/editor/loadSourceBitmap";

export interface EncodeOptions {
    outputW: number;
    outputH: number;
    mime?: string;
    quality?: number;
}

// produce a cropped + scaled image from the source bitmap. uses OffscreenCanvas
// when available, falls back to a detached <canvas>. caller supplies the source
// rect in source-bitmap pixel coordinates (see cropperMath.extractSourceRect).
export async function encodePortrait(
    src: SourceBitmap,
    rect: { sx: number; sy: number; sw: number; sh: number },
    opts: EncodeOptions,
): Promise<{ bytes: Uint8Array; mime: string }> {
    const mime = opts.mime ?? "image/webp";
    const quality = opts.quality ?? 0.85;
    const blob = await drawAndEncode(src, rect, opts.outputW, opts.outputH, mime, quality);
    const buf = await blob.arrayBuffer();
    return { bytes: new Uint8Array(buf), mime: blob.type || mime };
}

async function drawAndEncode(
    src: SourceBitmap,
    rect: { sx: number; sy: number; sw: number; sh: number },
    outW: number,
    outH: number,
    mime: string,
    quality: number,
): Promise<Blob> {
    if (typeof OffscreenCanvas !== "undefined") {
        const oc = new OffscreenCanvas(outW, outH);
        const ctx = oc.getContext("2d");
        if (!ctx) throw new Error("OffscreenCanvas 2d context unavailable");
        ctx.imageSmoothingQuality = "high";
        drawToContext(src, rect, ctx, outW, outH);
        if (typeof oc.convertToBlob === "function") {
            return await oc.convertToBlob({ type: mime, quality });
        }
    }
    // fallback path: detached <canvas> with toBlob
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.imageSmoothingQuality = "high";
    drawToContext(src, rect, ctx, outW, outH);
    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
            mime,
            quality,
        );
    });
}

// draw src[sx,sy,sw,sh] into [0,0,outW,outH] of the target context. for phase 0a
// this is single-pass; phase 2b adds 2-step downscale when src/out > 2.
function drawToContext(
    src: SourceBitmap,
    rect: { sx: number; sy: number; sw: number; sh: number },
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    outW: number,
    outH: number,
): void {
    // build a temporary transform from src-bitmap coords to output coords: the
    // output rect is [0..outW, 0..outH], the source rect is [sx..sx+sw, sy..sy+sh].
    // so scale = outW / sw, tx = -sx * scale, ty = -sy * scale.
    const scale = outW / rect.sw;
    const tx = -rect.sx * scale;
    const ty = -rect.sy * scale;
    // SourceBitmap.draw uses a CanvasRenderingContext2D-shaped API; both 2d
    // contexts share that surface for drawImage.
    src.draw(ctx as CanvasRenderingContext2D, { scale, tx, ty });
    // sanity: nominal sh / outH should match; if it doesn't (non-square crop),
    // the math above scaled by outW only. extractSourceRect always returns
    // sw / sh in the same ratio as outW / outH because the frame matches the
    // output aspect, so this isn't a real concern in the current pipeline.
    void outH;
}
