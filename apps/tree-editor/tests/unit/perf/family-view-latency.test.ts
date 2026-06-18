/*
 * FamilyTreeEditor - Phase 1 expand/collapse latency budget.
 *
 * The Phase 1 DoD requires expand/collapse latency < 50 ms on Akarians.
 * The cost is dominated by `computeLayout` (subset selection + DOI scoring
 * + auto-collapse loop + placement); a `setExpanded` toggle re-runs
 * exactly one `computeLayout`. We measure the layout cost under three
 * scenarios:
 *
 *   1. Baseline (no expansion): bounded default.
 *   2. Three explicit expands: typical user state after exploring.
 *   3. Heavy expansion (10 ids in `expanded`): worst case before
 *      auto-collapse kicks in.
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
const LATENCY_BUDGET_MS = 50;

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

const cached = (() => {
    const text = readFileSync(FIXTURE, "utf8");
    const { tree } = unwrap(parseGedcom(text));
    return { tree };
})();

function median(samples: readonly number[]): number {
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
}

describe("family-view expand/collapse latency — Akarians DEMO", () => {
    const engine = new FamilyViewEngine();
    // Warm up.
    engine.layout({ tree: cached.tree, focus: cached.tree.rootId });

    function measure(opts: { expanded?: Set<PersonId> }): number {
        const samples: number[] = [];
        for (let i = 0; i < 5; i += 1) {
            const t0 = performance.now();
            engine.layout({
                tree: cached.tree,
                focus: cached.tree.rootId,
                options: { expanded: opts.expanded ?? new Set() },
            });
            samples.push(performance.now() - t0);
        }
        return median(samples);
    }

    it("baseline (no expansion) under 50 ms", () => {
        const m = measure({});
        // eslint-disable-next-line no-console
        console.log(`[fv-latency] baseline=${m.toFixed(2)}ms`);
        expect(m).toBeLessThan(LATENCY_BUDGET_MS);
    });

    it("3 explicit expands under 50 ms", () => {
        // Pick three nodes from the bounded subset to expand.
        const base = engine.layout({ tree: cached.tree, focus: cached.tree.rootId });
        const candidates = Array.from(base.hasMoreChildren).slice(0, 3);
        const expanded = new Set(candidates);
        const m = measure({ expanded });
        // eslint-disable-next-line no-console
        console.log(`[fv-latency] 3-expand=${m.toFixed(2)}ms (expanded ids: ${candidates.length})`);
        expect(m).toBeLessThan(LATENCY_BUDGET_MS);
    });

    it("10 explicit expands (auto-collapse engaged) under 50 ms", () => {
        const base = engine.layout({ tree: cached.tree, focus: cached.tree.rootId });
        const candidates = Array.from(base.hasMoreChildren).slice(0, 10);
        const expanded = new Set(candidates);
        const m = measure({ expanded });
        // eslint-disable-next-line no-console
        console.log(
            `[fv-latency] 10-expand=${m.toFixed(2)}ms (expanded ids: ${candidates.length})`,
        );
        expect(m).toBeLessThan(LATENCY_BUDGET_MS);
    });
});
