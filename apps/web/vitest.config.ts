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
    },
    test: {
        include: ["tests/unit/**/*.test.ts"],
        environment: "jsdom",
        globals: false,
        css: false,
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/lib/**/*.ts"],
        },
    },
});
