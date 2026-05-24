/*
 * FamilyTreeEditor - shared file -> ImportPayload importer used by the wizard.
 * detects format, parses, returns a Result carrying both the tree and any
 * embedded portrait blobs so callers route persistence consistently.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Tree } from "$lib/domain/types";
import { readBundle } from "$lib/io/bundle/read";
import type { PortraitBlob } from "$lib/io/bundle/write";
import { detectFormat, type FormatKind } from "$lib/io/detect";
import { parseFamilyScript } from "$lib/io/familyscript/parse";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { err, ok, type Result } from "$lib/utils/result";

export type ImportSourceFormat = Exclude<FormatKind, "unknown">;

export interface ImportPayload {
    tree: Tree;
    portraits: PortraitBlob[];
    sourceFormat: ImportSourceFormat;
    /** person count at parse time; convenience for preview rows */
    count: number;
}

/**
 * Read a File -> ImportPayload, sniffing format by extension + magic bytes.
 * `portraits` is empty for formats that don't carry images; GEDZIP populates
 * it from the bundle's media/ entries so the wizard's persistence helper can
 * write them to IDB without re-parsing.
 */
export async function importFile(file: File): Promise<Result<ImportPayload, string>> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const format = detectFormat({
        filename: file.name,
        firstBytes: bytes.subarray(0, 8),
        firstChars: new TextDecoder().decode(bytes.subarray(0, 32)),
    });

    if (format === "gedzip") {
        const r = readBundle(bytes);
        if (!r.ok) return err(r.error);
        return ok({
            tree: r.value.tree,
            portraits: r.value.portraits,
            sourceFormat: format,
            count: Object.keys(r.value.tree.people).length,
        });
    }
    if (format === "gedcom") {
        const text = new TextDecoder().decode(bytes);
        const r = parseGedcom(text);
        if (!r.ok) return err(r.error);
        return ok({
            tree: r.value.tree,
            portraits: [],
            sourceFormat: format,
            count: Object.keys(r.value.tree.people).length,
        });
    }
    if (format === "familyscript") {
        const text = new TextDecoder().decode(bytes);
        const r = parseFamilyScript(text);
        if (!r.ok) return err(r.error);
        return ok({
            tree: r.value.tree,
            portraits: [],
            sourceFormat: format,
            count: Object.keys(r.value.tree.people).length,
        });
    }
    return err(`unrecognized file format: ${file.name}`);
}
