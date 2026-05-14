/*
 * FamilyTreeEditor - Phase 0 walking-skeleton: DEMO visual golden snapshot.
 *
 * Loads the Akarians DEMO fixture (1,802 people, 167 ghosts, 204 couples)
 * in the layered engine and snapshots the canvas. The first run captures
 * the baseline; subsequent runs diff against it. Phase 4 (libavoid),
 * Phase 5 (hyperbolic), Phase 6 (DOI) re-run this test as a regression
 * check — *the layered engine output should not change* until they
 * intentionally update the baseline with `--update-snapshots`.
 *
 * Mobile project skips: pixel comparison at Pixel-7 viewport is too
 * volatile across CI / dev box; the regression value comes from the
 * desktop Chromium baseline.
 *
 * To regenerate the baseline (only when an intentional layered-engine
 * change has landed and been reviewed):
 *   pnpm -F web exec playwright test visual-akarians --update-snapshots
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const AKARIANS = resolve(process.cwd(), "tests/fixtures/Akarians.ged");

test.describe("DEMO visual golden", () => {
    test.skip(({ isMobile }) => isMobile, "visual goldens are desktop-only");

    test.beforeEach(async ({ page }) => {
        // Phase 0 of family-view.md flipped the default engine. The layered
        // canvas-host selector this golden asserts against only mounts when
        // the layered engine is active; pin it via the documented
        // `fte.defaultEngine` localStorage override.
        await page.addInitScript(() => {
            try {
                localStorage.setItem("fte.defaultEngine", "layered");
            } catch {
                /* non-fatal */
            }
        });
    });

    test("Akarians fixture renders the layered canvas", async ({ page }) => {
        // 1,802-person ged takes a few seconds to parse + lay out; budget for it.
        test.setTimeout(60_000);

        await page.goto("/");
        await page.locator('[data-testid="import-input"]').setInputFiles(AKARIANS);
        await expect(page.getByText(/loaded \d+ people/)).toBeVisible({ timeout: 30_000 });

        // The badge becomes the synchronisation point — it shows once the
        // worker has emitted the first PlacedGraph for the loaded tree.
        await expect(page.getByRole("button", { name: /^1802 people/ })).toBeVisible({
            timeout: 30_000,
        });

        // Wait one frame past the layout-settled badge for the canvas to
        // paint. Mask volatile UI (toasts, save status, badge counts that
        // depend on timing) so the diff is bounded to the canvas geometry.
        await page.waitForTimeout(500);

        const canvas = page.locator(".canvas-host");
        await expect(canvas).toHaveScreenshot("akarians-layered.png", {
            maxDiffPixelRatio: 0.02,
            mask: [
                page.locator('[role="alert"]'), // toasts
                page.locator(".save-status-pill"),
                page.getByRole("button", { name: /people/ }),
            ],
        });
    });
});
