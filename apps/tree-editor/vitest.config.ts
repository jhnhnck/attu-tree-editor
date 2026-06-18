/*
 * FamilyTreeEditor - vitest config for unit tests; jsdom environment
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

export default defineConfig({
    plugins: [svelte()],
    resolve: {
        alias: {
            $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
        },
        // jsdom is a browser-shaped env; without this the svelte plugin returns
        // the server-only build of components, which crashes inside mount()
        conditions: ["browser"],
    },
    test: {
        include: ["tests/unit/**/*.test.ts", "tests/component/**/*.test.ts"],
        environment: "jsdom",
        setupFiles: ["./tests/setup.ts"],
        globals: false,
        css: false,
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/lib/**/*.ts"],
        },
    },
});
