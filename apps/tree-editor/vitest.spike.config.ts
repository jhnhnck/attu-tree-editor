/*
 * FamilyTreeEditor - vitest config for spike tests (long-running validation
 * runs that don't belong in `pnpm test:unit`'s fast-feedback loop).
 *
 * Spikes live under `tests/spikes/` and are invoked via `pnpm test:spike`.
 * Runtime can be 30+ seconds for fixtures the size of Akarians (1,802
 * people, ~3,500 connectors). They're allowed to be slow; the trade-off
 * is a regression check that catches "phase 4's libavoid bridge no longer
 * matches the phase 1 spike output."
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    // No svelte plugin — spikes do not import .svelte files and the
    // plugin's setup adds startup overhead.
    resolve: {
        alias: {
            $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
        },
        // No `conditions: ["browser"]` here — spikes run in plain node, so
        // libavoid-js must resolve via its "node" export condition
        // (`dist/index-node.mjs`), not the browser entry.
    },
    test: {
        include: ["tests/spikes/**/*.spike.test.ts"],
        // Spikes don't need DOM — running in plain node skips the jsdom
        // setup cost (~10 s) and avoids the SharedArrayBuffer / File API
        // shims that slow large-fixture tests on 1900-node graphs.
        environment: "node",
        globals: false,
        css: false,
        testTimeout: 120_000,
        hookTimeout: 30_000,
        // Run all test files in a single forked subprocess so libavoid's
        // WASM module (which keeps its emscripten heap alive for the
        // process lifetime) doesn't keep the parent vitest hanging on
        // exit. Without this, a passing run still trips ELIFECYCLE on
        // teardown. vitest 4 flattened the old poolOptions.forks.singleFork
        // to top-level `fileParallelism: false` (forces maxWorkers=1).
        pool: "forks",
        fileParallelism: false,
    },
});
