/*
 * FamilyTreeEditor - file format sniffer; routes a dropped file to the right parser
 * licensed under the MIT license; see LICENSE.md for full text
 */

export type FormatKind = "familyscript" | "gedcom" | "gedzip" | "familyecho-html" | "unknown";

export interface DetectInput {
    filename?: string;
    firstBytes?: Uint8Array;
    firstChars?: string;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

export function detectFormat(input: DetectInput): FormatKind {
    // 1. zip magic bytes beat everything else
    if (input.firstBytes && hasZipMagic(input.firstBytes)) return "gedzip";

    // 2. content sniff
    const head = (input.firstChars ?? "").slice(0, 256).trimStart();
    if (head.startsWith("0 HEAD")) return "gedcom";
    if (head.startsWith("# ")) return "familyscript";
    if (head.startsWith("<HTML") || head.startsWith("<html") || head.startsWith("<!DOCTYPE")) {
        return "familyecho-html";
    }

    // 3. extension
    const lower = (input.filename ?? "").toLowerCase();
    if (lower.endsWith(".gdz")) return "gedzip";
    if (lower.endsWith(".zip")) return "gedzip";
    if (lower.endsWith(".ged") || lower.endsWith(".gedcom")) return "gedcom";
    if (lower.endsWith(".txt")) return "familyscript";
    if (lower.endsWith(".html") || lower.endsWith(".htm")) return "familyecho-html";

    return "unknown";
}

function hasZipMagic(bytes: Uint8Array): boolean {
    if (bytes.length < ZIP_MAGIC.length) return false;
    for (let i = 0; i < ZIP_MAGIC.length; i += 1) {
        if (bytes[i] !== ZIP_MAGIC[i]) return false;
    }
    return true;
}
