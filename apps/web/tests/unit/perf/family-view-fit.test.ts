/*
 * FamilyTreeEditor - family-view fit-zoom probe on the Akarians fixture.
 *
 * Phase 0 of `notes/plans/family-view.md` requires us to measure — not
 * golden — three things on the Akarians DEMO at 1080p minus inspector:
 *   1. card count in the bounded subset (target ≤30),
 *   2. effective card width at fit zoom (target ≥80 px),
 *   3. number of layout ranks consumed.
 *
 * The probe asserts the *contracts of the bounded view*, not strict
 * numeric bounds — Phase 0's rollback ladder relaxes 80 px → 64 px →
 * fewer cards → horizontal scroll if any of these fail. Results are
 * logged for the retro / plan-revise step.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { PERSON_W } from "$lib/layout/constants";
import { FamilyViewEngine } from "$lib/layout/engines/family-view";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");

// Probe target: 1080p viewport minus 400 px inspector ≈ 1500 usable px.
const VIEWPORT_W_PX = 1920 - 400;
const VIEWPORT_H_PX = 1080 - 100; // chrome + title strip
const TARGET_CARD_W_PX = 80;
const TARGET_MAX_CARDS = 30;

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

const cached = (() => {
    const text = readFileSync(FIXTURE, "utf8");
    const { tree } = unwrap(parseGedcom(text));
    const engine = new FamilyViewEngine();
    const layout = engine.layout({ tree, focus: tree.rootId });
    return { tree, layout };
})();

describe("family-view fit-zoom probe — Akarians DEMO", () => {
    it("reports measured numbers (informational; no hard assertion)", () => {
        const cardCount = cached.layout.nodes.size;
        const layoutWUnits = cached.layout.bbox.width;
        const layoutHUnits = cached.layout.bbox.height;
        // Maximum scale that fits both dimensions inside the viewport.
        const baseUnitPx = 80;
        const fitScale = Math.min(
            VIEWPORT_W_PX / (layoutWUnits * baseUnitPx),
            VIEWPORT_H_PX / (layoutHUnits * baseUnitPx),
        );
        const effectiveCardW = PERSON_W * baseUnitPx * fitScale;
        const ranks = new Set<number>();
        for (const node of cached.layout.nodes.values()) ranks.add(node.rank);

        // eslint-disable-next-line no-console
        console.log(
            `[family-view-fit] cards=${String(cardCount)}` +
                ` bboxUnits=${layoutWUnits.toFixed(2)}x${layoutHUnits.toFixed(2)}` +
                ` fitScale=${fitScale.toFixed(3)}` +
                ` effectiveCardW=${effectiveCardW.toFixed(1)}px` +
                ` ranks=${String(ranks.size)}`,
        );

        // Sanity floors — these are not the contract numbers (the rollback
        // ladder relaxes those). They guard against regressions where the
        // subset selector accidentally returns ~0 cards or the entire tree.
        expect(cardCount).toBeGreaterThan(0);
        expect(cardCount).toBeLessThanOrEqual(200); // generous; real cap is 30
        expect(layoutWUnits).toBeGreaterThan(0);
        expect(layoutHUnits).toBeGreaterThan(0);
    });

    it("captures the target / measured triad to the plan's bug log via console", () => {
        // The plan asks for the numbers to land in the bug log so the
        // retro / plan-revise step can decide whether the 80 px / 30-card
        // / fit-zoom triad needs the rollback ladder.
        const cardCount = cached.layout.nodes.size;
        const layoutWUnits = cached.layout.bbox.width;
        const layoutHUnits = cached.layout.bbox.height;
        const baseUnitPx = 80;
        const fitScale = Math.min(
            VIEWPORT_W_PX / (layoutWUnits * baseUnitPx),
            VIEWPORT_H_PX / (layoutHUnits * baseUnitPx),
        );
        const effectiveCardW = PERSON_W * baseUnitPx * fitScale;

        const triadHolds =
            cardCount <= TARGET_MAX_CARDS && effectiveCardW >= TARGET_CARD_W_PX && fitScale <= 1;

        // eslint-disable-next-line no-console
        console.log(
            `[family-view-fit] triad ${triadHolds ? "HOLDS" : "MISSED"} ` +
                `(target: ≤${String(TARGET_MAX_CARDS)} cards, ≥${String(TARGET_CARD_W_PX)} px width, fit scale ≤1)`,
        );
        // No hard assert here — Phase 0 explicitly says the ladder is the
        // rollback. The retro reads the console output.
        expect(typeof triadHolds).toBe("boolean");
    });
});
