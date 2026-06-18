/* SPDX-License-Identifier: MIT */
/*
 * Phase-0 walking-skeleton of the cluster-4 per-engine parity matrix.
 * One capability ("stats pill mounts in top-left chrome bar") x three
 * engines (layered, family-view, hyperbolic). Phase 5 expands this to
 * ~9 capabilities x 3 engines and promotes the inline matrix harness
 * into a shared module. Until then, the matrix lives in this file so a
 * second consumer has to exist before extraction.
 *
 * Behaviour gate mirrored from App.svelte's `statsPillVisible` derived:
 *   (engine === "layered" || engine === "family-view") && layoutStats !== undefined
 * Hyperbolic intentionally has no `onlayoutstats` wiring today, so the
 * hyperbolic row carries an `expectedSkip` rationale rather than an
 * assertion. The matrix harness still asserts the rationale is
 * non-empty before skipping, so a future engine that loses its
 * rationale string is caught at meta-check time.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { clearRegistry } from "@attu/ui";
import type { EngineKind } from "$lib/state/engine";
import StatsPillHarness from "./_harness/StatsPillHarness.svelte";

interface MatrixCell {
    engine: EngineKind;
    // null = active assertion; non-empty string = documented skip rationale
    expectedSkip: string | null;
}

const MATRIX: ReadonlyArray<MatrixCell> = [
    { engine: "layered", expectedSkip: null },
    { engine: "family-view", expectedSkip: null },
    {
        engine: "hyperbolic",
        expectedSkip: "ResizeObserver/canvas2d shims pending - see notes/dev/test-strategy.md",
    },
] as const;

// shared layout-stats fixture - the layered cell exercises the
// cluster-suffix branch, family-view uses the trivial 1-component form
// (the 24 may e6db6e8 fix made onlayoutstats emit components=1 /
// isolated=0 unconditionally for family-view so the pill never paints
// the misleading "N clusters" suffix).
const LAYERED_STATS = { totalPeople: 12, components: 3, isolated: 1 } as const;
const FAMILY_VIEW_STATS = { totalPeople: 8, components: 1, isolated: 0 } as const;

describe("parity matrix: stats pill", () => {
    afterEach(() => {
        // dock registry is module-scoped; reset between cells so the
        // n+1 cell never sees the n-th cell's pill registration
        clearRegistry();
        localStorage.removeItem("fte.defaultEngine");
    });

    for (const cell of MATRIX) {
        if (cell.expectedSkip !== null) {
            // meta-check: the rationale string must exist BEFORE the
            // skip flag short-circuits the run, so a future regression
            // that nulls the rationale gets caught here rather than
            // silently turning the cell into a no-op.
            it(`[${cell.engine}] meta-check: skip rationale is non-empty`, () => {
                expect(cell.expectedSkip).not.toBeNull();
                expect((cell.expectedSkip ?? "").length).toBeGreaterThan(0);
            });
            it.skip(`[${cell.engine}] stats pill mounts in top-left chrome bar (${cell.expectedSkip})`, () => {});
            continue;
        }

        it(`[${cell.engine}] stats pill mounts in top-left chrome bar`, async () => {
            // pin the engine via the documented LS override - matches
            // how App.svelte's `readDefaultEngine` reads the default
            localStorage.setItem("fte.defaultEngine", cell.engine);
            const stats = cell.engine === "layered" ? LAYERED_STATS : FAMILY_VIEW_STATS;
            render(StatsPillHarness, { engine: cell.engine, layoutStats: stats });
            // give DockRegistration's mount $effect + CanvasChromeDock's
            // $derived a tick to settle
            await tick();
            await tick();

            const pill = screen.getByTestId("stats-pill");
            expect(pill).toBeInTheDocument();
            expect(pill).toHaveTextContent(`${String(stats.totalPeople)} people`);

            if (cell.engine === "family-view") {
                // the 24 may e6db6e8 fix: family-view reports
                // components=1 / isolated=0 so the "N clusters" suffix
                // never appears. asserting absence is the regression
                // target.
                expect(pill).not.toHaveTextContent(/clusters/);
            } else {
                // layered cell uses the cluster-suffix branch so the
                // suffix wiring is exercised at least once
                expect(pill).toHaveTextContent(/clusters/);
            }
        });

        it(`[${cell.engine}] stats pill suppressed when layoutStats is undefined`, async () => {
            // pre-first-emit gate: even on an engine the pill supports,
            // a `layoutStats === undefined` reading must keep the pill
            // out of the dom (matches App.svelte's $derived)
            localStorage.setItem("fte.defaultEngine", cell.engine);
            render(StatsPillHarness, { engine: cell.engine, layoutStats: undefined });
            await tick();
            await tick();
            expect(screen.queryByTestId("stats-pill")).toBeNull();
        });
    }
});
