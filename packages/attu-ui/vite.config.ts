/*
 * AttuUI - vite build config; library mode for component package
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
    plugins: [svelte(), tailwindcss()],
    resolve: {
        alias: {
            $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
        },
    },
    build: {
        lib: {
            entry: fileURLToPath(new URL("./src/lib/index.ts", import.meta.url)),
            name: "AttuUI",
            formats: ["es"],
            fileName: "attu-ui",
        },
        rollupOptions: {
            external: ["svelte", /^svelte\//],
        },
        target: "es2022",
        sourcemap: true,
    },
});
