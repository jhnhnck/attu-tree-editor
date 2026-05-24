/*
 * FamilyTreeEditor - parse Family Echo .html exports: embedded FamilyScript
 * + inlined base64 portraits paired by the FS `r` tag imageid.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFamilyEchoHtml } from "$lib/io/familyecho-html/parse";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/familyecho-sample.html");

describe("parseFamilyEchoHtml", () => {
    it("parses the embedded FamilyScript into a tree", () => {
        const html = readFileSync(FIXTURE, "utf-8");
        const r = parseFamilyEchoHtml(html);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // sample fixture has 1802 person records; if Family Echo bumps its
        // export shape and breaks this, the assertion will flag it directly.
        expect(Object.keys(r.value.tree.people).length).toBeGreaterThan(100);
        expect(r.value.tree.rootId).toBeDefined();
    });

    it("pairs base64 portrait data URIs with their FS r-tag imageid", () => {
        const html = readFileSync(FIXTURE, "utf-8");
        const r = parseFamilyEchoHtml(html);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // sample fixture has exactly one portrait: image-211177890 -> START
        expect(r.value.portraits.length).toBe(1);
        const portrait = r.value.portraits[0];
        if (!portrait) return;
        expect(portrait.personId).toBe("START");
        expect(portrait.ext).toBe("jpg");
        // JPEG magic bytes
        expect(portrait.bytes[0]).toBe(0xff);
        expect(portrait.bytes[1]).toBe(0xd8);
        expect(portrait.bytes[2]).toBe(0xff);
    });

    it("does not leak the r-tag imageid onto persisted Person records", () => {
        const html = readFileSync(FIXTURE, "utf-8");
        const r = parseFamilyEchoHtml(html);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // imageid lives in personExtras (consumed at import time), never on the Person object.
        for (const person of Object.values(r.value.tree.people)) {
            const json = JSON.stringify(person);
            expect(json).not.toMatch(/211177890/);
        }
    });

    it("returns an err for HTML that has no newscript input", () => {
        const r = parseFamilyEchoHtml("<html><body><p>nope</p></body></html>");
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error).toMatch(/Family Echo/i);
    });

    it("returns an err for HTML whose newscript input is empty", () => {
        const r = parseFamilyEchoHtml(
            '<html><body><input id="newscript" value="   "></body></html>',
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error).toMatch(/empty/i);
    });
});
