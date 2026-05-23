/*
 * FamilyTreeEditor - phase 1 (wave 2) visual golden: dense-tree fixture
 * with the auto-collapse badge rendered.
 *
 * This is the FIRST novel surface phase 1 exercises that wave-1's
 * goldens don't touch. The rev-1 brittleness check on the plan asks
 * that `maskUnstableUI` works here too, not only on the four wave-1
 * goldens — so this spec is intentionally minimal: load the fixture,
 * wait for a `+N` badge (the headline phase-1 deliverable), snapshot
 * the canvas with the shared mask helper.
 *
 * If `maskUnstableUI` ever drifts from the actual unstable-region
 * footprint, this golden trips first because the dense fixture exposes
 * more decorative surface (8 great-grandparents + their siblings) than
 * the wave-1 fixtures do.
 *
 * To regenerate the baseline (only when an intentional rendering
 * change has landed and been reviewed):
 *   pnpm -F web exec playwright test visual-dense-tree --update-snapshots
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { maskUnstableUI } from "./_helpers/visual-mask";

const DENSE = resolve(process.cwd(), "tests/fixtures/dense-tree.ged");

test.describe("dense-tree visual golden", () => {
    test.skip(({ isMobile }) => isMobile, "visual goldens are desktop-only");

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                for (const key of Object.keys(localStorage)) {
                    if (key.startsWith("fte.")) localStorage.removeItem(key);
                }
                localStorage.setItem("fte.defaultEngine", "family-view");
            } catch {
                /* non-fatal */
            }
        });
    });

    test("dense-tree fixture renders the auto-collapse badge", async ({ page }) => {
        test.setTimeout(60_000);

        await page.goto("/");
        await page.locator('[data-testid="import-input"]').setInputFiles(DENSE);
        await expect(page.getByText(/loaded \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("region", { name: /family view canvas/ });
        await expect(region).toBeVisible();

        // Wait for the badge — its presence is the phase-1 contract.
        await expect(page.locator("[data-badge-id]").first()).toBeVisible({ timeout: 5_000 });

        // Wait for the toast to fade out so the mask doesn't move between
        // runs.
        await page.waitForTimeout(300);

        await expect(region).toHaveScreenshot("dense-tree-collapse-badge.png", {
            maxDiffPixels: 100,
            mask: maskUnstableUI(page),
        });
    });
});
