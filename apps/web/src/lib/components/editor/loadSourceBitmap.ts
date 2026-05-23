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
}

export interface LoadOptions {
    /** if true (default), prefer createImageBitmap with imageOrientation:"from-image" */
    preferImageBitmap?: boolean;
}

export async function loadSourceBitmap(blob: Blob, opts: LoadOptions = {}): Promise<SourceBitmap> {
    const prefer = opts.preferImageBitmap ?? true;
    if (prefer && typeof createImageBitmap === "function") {
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
