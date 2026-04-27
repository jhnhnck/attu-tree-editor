/*
 * FamilyTreeEditor - shared file -> Tree importer used by the file-input handler
 * AND the canvas drag-drop overlay. detects format, parses, returns a Result.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { detectFormat } from "$lib/io/detect";
import { parseFamilyScript } from "$lib/io/familyscript/parse";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { readBundle } from "$lib/io/bundle/read";
import type { Tree } from "$lib/domain/types";
import { err, ok, type Result } from "$lib/utils/result";

export interface ImportSuccess {
    tree: Tree;
    count: number;
    format: "gedzip" | "gedcom" | "familyscript";
}

/**
 * read a File -> Tree, sniffing format by extension+magic bytes. returns a
 * structured Result so the caller can route the toast/error UX without
 * caring about the parse internals.
 */
export async function importFile(file: File): Promise<Result<ImportSuccess, string>> {
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
            count: Object.keys(r.value.tree.people).length,
            format,
        });
    }
    if (format === "gedcom") {
        const text = new TextDecoder().decode(bytes);
        const r = parseGedcom(text);
        if (!r.ok) return err(r.error);
        return ok({
            tree: r.value.tree,
            count: Object.keys(r.value.tree.people).length,
            format,
        });
    }
    if (format === "familyscript") {
        const text = new TextDecoder().decode(bytes);
        const r = parseFamilyScript(text);
        if (!r.ok) return err(r.error);
        return ok({
            tree: r.value.tree,
            count: Object.keys(r.value.tree.people).length,
            format,
        });
    }
    return err(`unrecognized file format: ${file.name}`);
}
