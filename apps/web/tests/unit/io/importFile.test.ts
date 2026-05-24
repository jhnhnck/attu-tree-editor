/*
 * FamilyTreeEditor - importFile: file -> Tree dispatcher used by the file
 * input handler AND the canvas drag-drop overlay
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importFile } from "$lib/io/importFile";

const TINY_GED = readFileSync(resolve(process.cwd(), "tests/fixtures/tiny.ged"), "utf-8");

// jsdom's File implements `text()` but not `arrayBuffer()`. patch it for the
// importer, which calls `.arrayBuffer()` to read the magic bytes.
function fileFrom(name: string, contents: string): File {
    const f = new File([contents], name);
    if (typeof f.arrayBuffer !== "function") {
        const bytes = new TextEncoder().encode(contents);
        // copy into a fresh ArrayBuffer to avoid SharedArrayBuffer typing
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        Object.defineProperty(f, "arrayBuffer", {
            value: () => Promise.resolve(ab),
        });
    }
    return f;
}

describe("importFile", () => {
    it("parses a .ged file and reports the people count", async () => {
        const r = await importFile(fileFrom("tiny.ged", TINY_GED));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.sourceFormat).toBe("gedcom");
        expect(r.value.count).toBe(3);
        expect(r.value.portraits).toEqual([]);
    });

    it("returns an err for an unrecognised filename + content", async () => {
        const r = await importFile(fileFrom("photo.png", "not really a png"));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error).toMatch(/unrecognized/i);
    });
});
