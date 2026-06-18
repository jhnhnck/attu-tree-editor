/*
 * FamilyTreeEditor - Family Echo .html parser: extracts the embedded
 * FamilyScript from a hidden <input id="newscript"> and pairs base64
 * portrait data URIs in hidden <img id="image-N"> tags with the FS `r`
 * tag's imageid to produce an ImportPayload with PortraitBlobs ready
 * for IDB persistence.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PortraitBlob } from "$lib/io/bundle/write";
import { parseFamilyScript } from "$lib/io/familyscript/parse";
import { err, ok, type Result } from "$lib/utils/result";
import type { Tree } from "$lib/domain/types";

export interface FamilyEchoHtmlParseResult {
    tree: Tree;
    portraits: PortraitBlob[];
    /** count of <img id="image-N"> elements that found no matching person. */
    unmatchedPortraits: number;
}

const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/svg+xml": "svg",
};

function extForMime(mime: string): string {
    return MIME_TO_EXT[mime.toLowerCase()] ?? "bin";
}

/** decode a `data:image/...;base64,...` URI into raw bytes + ext. */
function decodeDataUri(dataUri: string): { ext: string; bytes: Uint8Array } | undefined {
    const match = /^data:([^;]+);base64,(.*)$/i.exec(dataUri);
    if (!match) return undefined;
    const mime = match[1];
    const b64 = match[2];
    if (!mime || !b64) return undefined;
    try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return { ext: extForMime(mime), bytes };
    } catch {
        return undefined;
    }
}

/**
 * Parse the Family Echo HTML export.
 *
 * Shape we rely on:
 *   <input id="newscript" value="# Start of FamilyScript...">
 *   <img id="image-<id>" src="data:image/...;base64,...">
 */
export function parseFamilyEchoHtml(htmlText: string): Result<FamilyEchoHtmlParseResult, string> {
    if (typeof DOMParser === "undefined") {
        return err("DOMParser unavailable (browser/jsdom required for HTML import)");
    }
    const doc = new DOMParser().parseFromString(htmlText, "text/html");

    const newscript = doc.getElementById("newscript");
    if (!newscript) return err('not a Family Echo export (no <input id="newscript">)');
    const fsValue = (newscript as HTMLInputElement).value ?? newscript.getAttribute("value") ?? "";
    if (!fsValue.trim()) return err("Family Echo HTML's newscript input is empty");

    const fsResult = parseFamilyScript(fsValue);
    if (!fsResult.ok) return err(`embedded FamilyScript parse failed: ${fsResult.error}`);
    const { tree, personExtras } = fsResult.value;

    // build imageid -> bytes map from <img id="image-N">
    const imageById = new Map<string, { ext: string; bytes: Uint8Array }>();
    const imgs = doc.querySelectorAll<HTMLImageElement>('img[id^="image-"]');
    imgs.forEach((img) => {
        const idAttr = img.getAttribute("id") ?? "";
        if (!idAttr.startsWith("image-")) return;
        const imageId = idAttr.slice("image-".length);
        const src = img.getAttribute("src") ?? "";
        const decoded = decodeDataUri(src);
        if (!decoded) return;
        imageById.set(imageId, decoded);
    });

    // walk the FS extras and pair `r` captures with image bytes
    const portraits: PortraitBlob[] = [];
    const usedImages = new Set<string>();
    for (const [personId, extras] of Object.entries(personExtras)) {
        for (const ex of extras) {
            if (ex.tag !== "r") continue;
            const imageId = ex.value.split(" ")[0];
            if (!imageId) continue;
            const image = imageById.get(imageId);
            if (!image) continue;
            portraits.push({ personId, ext: image.ext, bytes: image.bytes });
            usedImages.add(imageId);
        }
    }

    const unmatchedPortraits = imageById.size - usedImages.size;
    return ok({ tree, portraits, unmatchedPortraits });
}
