/*
 * FamilyTreeEditor - Phase 3 visual golden: path highlight stroke + accent.
 *
 * Loads the synthetic `multi-union.ged` fixture, selects Calen so the
 * path Aron → Calen is highlighted, then snapshots the canvas. Catches
 * stroke-class regressions in path-highlight wiring (`stroke-[2.5]`,
 * dimmed off-path strokes, card rings).
 *
 * Phase 5's full goldens supersede this; until then `maxDiffPixels: 100`
 * keeps the diff sensitive enough to catch stroke-thickness changes.
 *
 * To regenerate the baseline (only when an intentional path-highlight
 * style change has landed and been reviewed):
 *   pnpm -F web exec playwright test visual-path-highlight --update-snapshots
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { maskUnstableUI } from "./_helpers/visual-mask";

const MULTI = resolve(process.cwd(), "tests/fixtures/multi-union.ged");

test.describe("path-highlight visual golden", () => {
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

    test("path-highlight renders thick on-path and dim off-path strokes", async ({ page }) => {
        test.setTimeout(60_000);

        await page.goto("/");
        await page.locator('[data-testid="import-input"]').setInputFiles(MULTI);
        await expect(page.getByText(/loaded \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("region", { name: /family view canvas/ });
        await expect(region).toBeVisible();
        const calen = page.locator("[data-person-id]").filter({ hasText: /Calen/ });
        await calen.click();
        await expect(calen).toHaveAttribute("aria-selected", "true");

        // Wait for paint after selection.
        await page.waitForTimeout(300);

        await expect(region).toHaveScreenshot("path-highlight-multi-union.png", {
            maxDiffPixels: 100,
            mask: maskUnstableUI(page),
        });
    });
});
