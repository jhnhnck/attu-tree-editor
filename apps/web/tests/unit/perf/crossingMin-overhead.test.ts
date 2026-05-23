/*
 * FamilyTreeEditor - wave-2 phase 2 perf delta: crossing-min overhead.
 *
 * Compares `computeLayout` latency on the akarians fixture with the
 * pass enabled (default; worst-case 2x layout work when the candidate
 * is rejected) vs disabled. The rollback criterion in `plan.md` phase
 * 2 is "if idle-machine 3-expand latency rises above 50 ms, flip the
 * default to off". This test runs 10 samples per configuration and
 * logs the median delta so the phase 2 retro records the actual
 * overhead, not an estimate.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { FamilyViewEngine } from "$lib/layout/engines/family-view";
import type { PersonId } from "$lib/domain/types";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

const tree = (() => {
    const text = readFileSync(FIXTURE, "utf8");
    return unwrap(parseGedcom(text)).tree;
})();

function median(samples: readonly number[]): number {
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
}

describe("crossing-min overhead — akarians 3-expand", () => {
    const engine = new FamilyViewEngine();
    // warm up
    engine.layout({ tree, focus: tree.rootId });

    function measure(crossingMin: boolean, expanded: Set<PersonId>): number {
        const samples: number[] = [];
        for (let i = 0; i < 10; i += 1) {
            const t0 = performance.now();
            engine.layout({
                tree,
                focus: tree.rootId,
                options: { expanded, crossingMin },
            });
            samples.push(performance.now() - t0);
        }
        return median(samples);
    }

    it("logs on/off median for baseline + 3-expand + 10-expand", () => {
        const base = engine.layout({ tree, focus: tree.rootId });
        const ids3 = new Set(Array.from(base.hasMoreChildren).slice(0, 3));
        const ids10 = new Set(Array.from(base.hasMoreChildren).slice(0, 10));

        const baselineOff = measure(false, new Set());
        const baselineOn = measure(true, new Set());
        const expand3Off = measure(false, ids3);
        const expand3On = measure(true, ids3);
        const expand10Off = measure(false, ids10);
        const expand10On = measure(true, ids10);

        const fmt = (label: string, off: number, on: number): string =>
            `[fv-crossingMin-overhead] ${label}: off=${off.toFixed(
                2,
            )}ms on=${on.toFixed(2)}ms delta=${(on - off).toFixed(2)}ms (ratio=${(on / off).toFixed(
                2,
            )}x)`;

        console.info(fmt("baseline ", baselineOff, baselineOn));
        console.info(fmt("3-expand ", expand3Off, expand3On));
        console.info(fmt("10-expand", expand10Off, expand10On));

        // sanity check: medians are finite and positive
        for (const v of [baselineOff, baselineOn, expand3Off, expand3On, expand10Off, expand10On]) {
            expect(v).toBeGreaterThan(0);
        }
    });
});
