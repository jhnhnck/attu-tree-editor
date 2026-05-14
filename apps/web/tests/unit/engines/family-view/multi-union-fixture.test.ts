/*
 * FamilyTreeEditor - Phase 2 multi-union.ged fixture sanity tests.
 *
 * The fixture is a 5-person tree: Aron (focus) has two wives (Mira =
 * primary union, Sera = non-primary) with one child each. Asserts the
 * Phase 2 contract end-to-end through the GEDCOM parser → engine.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { FamilyViewEngine } from "$lib/layout/engines/family-view";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/multi-union.ged");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

const cached = (() => {
    const text = readFileSync(FIXTURE, "utf8");
    const { tree } = unwrap(parseGedcom(text));
    return tree;
})();

function findByName(given: string): string {
    for (const p of Object.values(cached.people)) {
        if (p.given === given) return p.id;
    }
    throw new Error(`no person named ${given}`);
}

describe("multi-union.ged — Phase 2 contract", () => {
    it("parses both unions with primary/non-primary flags preserved", () => {
        expect(cached.couples).toHaveLength(2);
        const primary = cached.couples.find((c) => c.isPrimary === true);
        const nonPrimary = cached.couples.find((c) => c.isPrimary === false);
        expect(primary).toBeDefined();
        expect(nonPrimary).toBeDefined();
    });

    it("default render shows primary partner + her child only (Mira, Calen)", () => {
        const engine = new FamilyViewEngine();
        const aron = findByName("Aron");
        const mira = findByName("Mira");
        const sera = findByName("Sera");
        const calen = findByName("Calen");
        const iva = findByName("Iva");
        const out = engine.layout({ tree: cached, focus: aron });
        expect(out.nodes.has(mira)).toBe(true);
        expect(out.nodes.has(calen)).toBe(true);
        expect(out.nodes.has(sera)).toBe(false);
        expect(out.nodes.has(iva)).toBe(false);
    });

    it("switching primary union swaps the visible partner + children block", () => {
        const engine = new FamilyViewEngine();
        const aron = findByName("Aron");
        const mira = findByName("Mira");
        const sera = findByName("Sera");
        const calen = findByName("Calen");
        const iva = findByName("Iva");
        // Find the index of the Sera union.
        const seraUnion = cached.couples.findIndex(
            (c) => c.leftId === sera || c.rightId === sera,
        );
        expect(seraUnion).toBeGreaterThanOrEqual(0);
        const out = engine.layout({
            tree: cached,
            focus: aron,
            options: { primaryUnionOverrides: new Map([[aron, seraUnion]]) },
        });
        expect(out.nodes.has(sera)).toBe(true);
        expect(out.nodes.has(iva)).toBe(true);
        expect(out.nodes.has(mira)).toBe(false);
        expect(out.nodes.has(calen)).toBe(false);
    });

    it("multi-union picker is surfaced on the visible partner card", () => {
        const engine = new FamilyViewEngine();
        const aron = findByName("Aron");
        const mira = findByName("Mira");
        const out = engine.layout({ tree: cached, focus: aron });
        // Mira (visible partner) gets a picker because Aron has 2 unions.
        const m = out.multiUnionMates.get(mira);
        expect(m).toBeDefined();
        expect(m!.mateId).toBe(aron);
        expect(m!.alternates).toHaveLength(1);
    });

    it("genealogy-conventional orientation places Aron (m) on the left of Mira (f)", () => {
        const engine = new FamilyViewEngine();
        const aron = findByName("Aron");
        const mira = findByName("Mira");
        const out = engine.layout({ tree: cached, focus: aron });
        const aronNode = out.nodes.get(aron);
        const miraNode = out.nodes.get(mira);
        expect(aronNode).toBeDefined();
        expect(miraNode).toBeDefined();
        expect(aronNode!.x).toBeLessThan(miraNode!.x);
    });
});
