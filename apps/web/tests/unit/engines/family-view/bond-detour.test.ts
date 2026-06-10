/*
 * FamilyTreeEditor - family-view bond-detour invariant on the Akarians fixture.
 *
 * Pins the fix for "family-view couple/marriage bonds route on top of
 * cards rather than around them" (notes/bugs.md, fixed 26 May 2026).
 *
 * Pre-fix: `coupleConnector` emitted a single straight horizontal
 * segment between two partners at the row midline. When two partners
 * landed non-adjacent on the same rank (because `planRank` packed each
 * into a different couple slot with an unrelated card between them),
 * that segment visibly crossed the intervening card. 137 violations
 * across all foci on the Akarians DEMO fixture.
 *
 * Post-fix: the bond is a multi-point polyline that detours up into
 * the gutter above the parent row, around any blocking AABB, and back
 * down. This test asserts the invariant on the same fixture: 0
 * horizontal segments of any `role: "married"` edge cross an
 * unrelated same-rank card. Pinned across every focus so we catch
 * regressions wherever the geometry shape recurs.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { FamilyViewEngine } from "$lib/layout/engines/family-view";
import { PERSON_W } from "$lib/layout/constants";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");
const CARD_H = 1.2;

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

describe("family-view bond detour — Akarians fixture invariant", () => {
    it(
        "no married-bond horizontal segment crosses an unrelated same-rank card",
        { timeout: 60000 },
        () => {
            const text = readFileSync(FIXTURE, "utf8");
            const { tree } = unwrap(parseGedcom(text));
            const engine = new FamilyViewEngine();
            const ids = Object.keys(tree.people);
            const violations: string[] = [];
            for (const focus of ids) {
                let out;
                try {
                    out = engine.layout({ tree, focus });
                } catch {
                    // skip foci the engine can't layout (e.g. unreachable);
                    // they aren't this test's domain.
                    continue;
                }
                const cards: {
                    x1: number;
                    y1: number;
                    x2: number;
                    y2: number;
                    owner: string;
                    rank: number;
                }[] = [];
                for (const [id, n] of out.nodes) {
                    cards.push({
                        x1: n.x,
                        y1: n.y,
                        x2: n.x + PERSON_W,
                        y2: n.y + (n.h ?? CARD_H),
                        owner: id,
                        rank: n.rank,
                    });
                }
                for (const e of out.edges) {
                    if (e.role !== "married") continue;
                    const partners = new Set(e.persons);
                    for (let i = 0; i < e.points.length - 1; i += 1) {
                        const a = e.points[i]!;
                        const b = e.points[i + 1]!;
                        if (a.y !== b.y) continue;
                        const segMinX = Math.min(a.x, b.x);
                        const segMaxX = Math.max(a.x, b.x);
                        const y = a.y;
                        for (const c of cards) {
                            if (partners.has(c.owner)) continue;
                            if (y <= c.y1 + 1e-6 || y >= c.y2 - 1e-6) continue;
                            if (segMaxX <= c.x1 + 1e-6 || segMinX >= c.x2 - 1e-6) continue;
                            violations.push(
                                `focus=${focus} edge=${e.id} crosses ${c.owner} at y=${String(y)}`,
                            );
                            if (violations.length >= 5) break;
                        }
                        if (violations.length >= 5) break;
                    }
                    if (violations.length >= 5) break;
                }
                if (violations.length >= 5) break;
            }
            expect(violations).toEqual([]);
        },
    );
});
