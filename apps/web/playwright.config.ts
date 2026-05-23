/*
 * FamilyTreeEditor - playwright config; chromium + mobile projects, vite preview server
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: "on-first-retry",
    },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "mobile", use: { ...devices["Pixel 7"] } },
    ],
    webServer: {
        // chain `vite build` before `vite preview`: the preview server serves
        // dist/, so a stale (or missing) build would otherwise render the
        // wrong markup or 404. when reuseExistingServer hits an already-warm
        // preview the rebuild is fast (vite's cache) and harmless.
        command: `npx vite build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
    },
});
