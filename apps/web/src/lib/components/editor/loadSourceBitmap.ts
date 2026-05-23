/*
 * FamilyTreeEditor - decode a Blob into a drawable bitmap with exif orientation honored
 * licensed under the MIT license; see LICENSE.md for full text
 */

// abstract source bitmap interface: anything we can drawImage onto a canvas.
// the underlying type is either an ImageBitmap (preferred) or an HTMLImageElement
// (fallback). consumers use width/height for math and draw() to render.
export interface SourceBitmap {
    readonly width: number;
    readonly height: number;
    draw(ctx: CanvasRenderingContext2D, transform: { scale: number; tx: number; ty: number }): void;
    /** release any underlying resources (close ImageBitmap, revoke object URL). */
    dispose(): void;
}

// `createImageBitmap` accepts an options bag in evergreen browsers, but TS lib
// types for some targets predate the `ImageBitmapOptions` field. cast through.
interface ImageBitmapOptionsExt {
    imageOrientation?: "from-image" | "none";
    resizeWidth?: number;
    resizeHeight?: number;
    resizeQuality?: "pixelated" | "low" | "medium" | "high";
}

export interface LoadOptions {
    /** if true (default), prefer createImageBitmap with imageOrientation:"from-image" */
    preferImageBitmap?: boolean;
}

// tiny 8x4 jpeg with exif orientation 6 (rotates 90° cw). when displayed it's
// 4x8. used by the feature probe below: a browser that honors the
// imageOrientation:"from-image" option returns 4x8; one that ignores it (firefox
// < 113 historically) returns 8x4. one-time per session.
const EXIF_PROBE_B64 =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAASUkqAAgAAAABABIBAwABAAAABgAAAAAA" +
    "AAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1R" +
    "V19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2Nj" +
    "Y2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAEAAgDASIAAhEBAxEB/8QA" +
    "HwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQID" +
    "AAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6" +
    "Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm" +
    "p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QA" +
    "HwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAEC" +
    "AxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5" +
    "OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOk" +
    "paanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oA" +
    "DAMBAAIRAxEAPwDFoooryz7w/9k=";

function decodeB64ToBlob(b64: string, type: string): Blob {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type });
}

// resolves to true iff `createImageBitmap({ imageOrientation: "from-image" })`
// actually returns swapped dimensions for an exif-6 fixture. cached for the
// life of the page.
let probePromise: Promise<boolean> | undefined;
function imageBitmapHonorsOrientation(): Promise<boolean> {
    if (probePromise) return probePromise;
    if (typeof createImageBitmap !== "function") {
        probePromise = Promise.resolve(false);
        return probePromise;
    }
    probePromise = (async () => {
        try {
            const blob = decodeB64ToBlob(EXIF_PROBE_B64, "image/jpeg");
            const bm = await createImageBitmap(blob, {
                imageOrientation: "from-image",
            } as ImageBitmapOptionsExt);
            const ok = bm.width === 4 && bm.height === 8;
            bm.close();
            return ok;
        } catch {
            return false;
        }
    })();
    return probePromise;
}

/** test-only escape hatch: force-cache the probe result for unit tests. */
export function __setOrientationProbe(value: boolean | undefined): void {
    probePromise = value === undefined ? undefined : Promise.resolve(value);
}

export async function loadSourceBitmap(blob: Blob, opts: LoadOptions = {}): Promise<SourceBitmap> {
    const prefer = opts.preferImageBitmap ?? true;
    if (prefer && (await imageBitmapHonorsOrientation())) {
        try {
            const bm = await createImageBitmap(blob, {
                imageOrientation: "from-image",
            } as ImageBitmapOptionsExt);
            return wrapImageBitmap(bm);
        } catch {
            // fall through to <img> fallback
        }
    }
    return await loadViaImage(blob);
}

function wrapImageBitmap(bm: ImageBitmap): SourceBitmap {
    return {
        get width() {
            return bm.width;
        },
        get height() {
            return bm.height;
        },
        draw(ctx, t) {
            ctx.drawImage(bm, t.tx, t.ty, bm.width * t.scale, bm.height * t.scale);
        },
        dispose() {
            bm.close();
        },
    };
}

async function loadViaImage(blob: Blob): Promise<SourceBitmap> {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    // image-orientation: from-image is the css default in evergreen browsers,
    // so the <img> intrinsic size reflects the exif-rotated dimensions.
    img.style.imageOrientation = "from-image";
    img.src = url;
    try {
        if (typeof img.decode === "function") {
            await img.decode();
        } else {
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error("image decode failed"));
            });
        }
    } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
    }
    // naturalWidth/naturalHeight respect exif orientation in evergreen browsers
    // (firefox 113+, safari 16.4+, chromium). older firefox returns un-rotated;
    // that's why we treat the <img> path as the orientation-correct fallback.
    return {
        get width() {
            return img.naturalWidth;
        },
        get height() {
            return img.naturalHeight;
        },
        draw(ctx, t) {
            ctx.drawImage(img, t.tx, t.ty, img.naturalWidth * t.scale, img.naturalHeight * t.scale);
        },
        dispose() {
            URL.revokeObjectURL(url);
        },
    };
}
