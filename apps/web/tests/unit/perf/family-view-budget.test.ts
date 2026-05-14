import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { FamilyViewEngine } from "$lib/layout/engines/family-view";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");

describe("family-view perf budget", () => {
    it("layout completes under 100ms on Akarians", () => {
        const text = readFileSync(FIXTURE, "utf8");
        const parsed = parseGedcom(text);
        if (!parsed.ok) throw new Error(parsed.error);
        const { tree } = parsed.value;
        const engine = new FamilyViewEngine();
        // Warm-up
        engine.layout({ tree, focus: tree.rootId });
        // Measure 5 runs
        const samples: number[] = [];
        for (let i = 0; i < 5; i += 1) {
            const t0 = performance.now();
            engine.layout({ tree, focus: tree.rootId });
            samples.push(performance.now() - t0);
        }
        const median = samples.sort((a, b) => a - b)[2]!;
        const max = Math.max(...samples);
        // eslint-disable-next-line no-console
        console.log(`[family-view-perf] median=${median.toFixed(2)}ms max=${max.toFixed(2)}ms samples=${samples.map(s=>s.toFixed(1)).join(",")}`);
        expect(median).toBeLessThan(100);
    });
});
