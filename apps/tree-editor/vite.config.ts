/*
 * FamilyTreeEditor - vite build config; svelte + tailwind plugins, /api proxy
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
    base: process.env["VITE_BASE"] ?? "/",
    plugins: [svelte(), tailwindcss()],
    resolve: {
        alias: {
            $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
        },
    },
    server: {
        host: true,
        port: 5173,
        strictPort: false,
        // caddy proxies on :8000; base (/trees) becomes the ws path for hmr
        hmr: { clientPort: 8000 },
    },
    build: {
        target: "es2022",
        sourcemap: true,
    },
});
