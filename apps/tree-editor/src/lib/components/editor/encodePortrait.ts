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

// the threshold at which a one-shot drawImage starts to look mealy from
// nyquist-violating downsampling. browsers' bilinear / "high" smoothing only
// samples 4 source pixels per output pixel, so any ratio > ~2 leaves obvious
// aliasing on busy textures. phase 2b adds a one-time half-resolution step
// before the final draw when the ratio exceeds this. exported for tests.
export const DOWNSCALE_RATIO_THRESHOLD = 2;

// draw src[sx,sy,sw,sh] into [0,0,outW,outH] of the target context. uses a
// two-step downscale when src/out > 2 (phase 2b); otherwise single-pass.
function drawToContext(
    src: SourceBitmap,
    rect: { sx: number; sy: number; sw: number; sh: number },
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    outW: number,
    outH: number,
): void {
    const ratio = Math.max(rect.sw / outW, rect.sh / outH);
    if (ratio > DOWNSCALE_RATIO_THRESHOLD) {
        drawTwoStep(src, rect, ctx, outW, outH, ratio);
        return;
    }
    drawDirect(src, rect, ctx, outW);
    void outH;
}

// build a temporary transform from src-bitmap coords to output coords: the
// output rect is [0..outW, 0..outH], the source rect is [sx..sx+sw, sy..sy+sh].
// scale = outW / sw, tx = -sx * scale, ty = -sy * scale.
function drawDirect(
    src: SourceBitmap,
    rect: { sx: number; sy: number; sw: number; sh: number },
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    outW: number,
): void {
    const scale = outW / rect.sw;
    const tx = -rect.sx * scale;
    const ty = -rect.sy * scale;
    src.draw(ctx as CanvasRenderingContext2D, { scale, tx, ty });
}

// route the cropped region through an intermediate canvas at half the
// downscale ratio (clamped at MAX_INTERMEDIATE_RATIO so we don't spin up a
// 4× canvas for pathological inputs), then copy that into the final output.
// requires both stages have a 2d context; degrades to single-pass on failure.
const MAX_INTERMEDIATE_RATIO = 4;
function drawTwoStep(
    src: SourceBitmap,
    rect: { sx: number; sy: number; sw: number; sh: number },
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    outW: number,
    outH: number,
    ratio: number,
): void {
    // pick the largest power-of-two intermediate that's still > the output but
    // <= MAX_INTERMEDIATE_RATIO * out. this gives an upper bound on memory.
    const intermediateScale = Math.min(MAX_INTERMEDIATE_RATIO, ratio / 2);
    const interW = Math.max(outW, Math.round(outW * intermediateScale));
    const interH = Math.max(outH, Math.round(outH * intermediateScale));

    // build an intermediate canvas (offscreen when available, plain otherwise)
    // and bind its 2d context. the union return type of getContext on a
    // HTMLCanvasElement | OffscreenCanvas union isn't narrowable by ts; split
    // the branches and resolve the context type explicitly per branch.
    let interSource: CanvasImageSource;
    let interCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (typeof OffscreenCanvas !== "undefined") {
        const oc = new OffscreenCanvas(interW, interH);
        interCtx = oc.getContext("2d");
        interSource = oc;
    } else {
        const cv = document.createElement("canvas");
        cv.width = interW;
        cv.height = interH;
        interCtx = cv.getContext("2d");
        interSource = cv;
    }
    if (!interCtx) {
        // intermediate context not available — degrade to single-pass.
        drawDirect(src, rect, ctx, outW);
        return;
    }
    interCtx.imageSmoothingQuality = "high";
    drawDirect(src, rect, interCtx, interW);

    // second pass: draw the intermediate into the final output at outW × outH.
    // the SourceBitmap interface is for the original source; we draw the
    // intermediate canvas directly via the target context's drawImage.
    (ctx as CanvasRenderingContext2D).drawImage(
        interSource,
        0,
        0,
        interW,
        interH,
        0,
        0,
        outW,
        outH,
    );
}
