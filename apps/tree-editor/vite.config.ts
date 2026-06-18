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
        // when served through the python proxy on :8000, hmr must point back to vite directly
        hmr: { port: 5173 },
        proxy: {
            "/api": {
                target: "http://127.0.0.1:8000",
                changeOrigin: true,
            },
        },
    },
    build: {
        target: "es2022",
        sourcemap: true,
    },
});
