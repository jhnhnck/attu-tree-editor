/*
 * FamilyTreeEditor - Phase 2 visual golden: multi-union family view.
 *
 * Loads the synthetic `multi-union.ged` fixture (5 people, Aron with 2
 * wives, one child per union) into the family-view engine and
 * snapshots the canvas. Tolerance pinned tight (`maxDiffPixels: 100`)
 * so stroke-class regressions in union-anchor rendering are caught.
 *
 * Phase 5's full goldens supersede this; until then the inline class
 * names on the synthetic fixture keep the snapshot stable across
 * theme-token churn.
 *
 * To regenerate the baseline (only when an intentional change has
 * landed and been reviewed):
 *   pnpm -F web exec playwright test visual-multi-union --update-snapshots
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const MULTI = resolve(process.cwd(), "tests/fixtures/multi-union.ged");

test.describe("multi-union visual golden", () => {
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

    test("multi-union fixture renders the family-view canvas", async ({ page }) => {
        test.setTimeout(60_000);

        await page.goto("/");
        await page.locator('[data-testid="import-input"]').setInputFiles(MULTI);
        await expect(page.getByText(/loaded \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("region", { name: /family view canvas/ });
        await expect(region).toBeVisible();
        const cards = page.locator("[data-person-id]");
        await expect(cards.first()).toBeVisible();

        // Wait for paint to settle.
        await page.waitForTimeout(300);

        await expect(region).toHaveScreenshot("multi-union-family-view.png", {
            maxDiffPixels: 100,
            mask: [
                page.locator('[role="alert"]'),
                page.locator(".save-status-pill"),
                page.getByRole("button", { name: /people/ }),
            ],
        });
    });
});
