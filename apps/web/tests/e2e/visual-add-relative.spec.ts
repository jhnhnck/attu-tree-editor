/*
 * FamilyTreeEditor - Phase 4 visual golden: add-relative affordance open.
 *
 * Captures the family-view canvas with the focus-card's `+ person`
 * (UserPlus) affordance toggled open, so stroke / icon / menu-position
 * regressions in the Phase 4 add-relative UI are caught early.
 *
 * Tolerance pinned tight (`maxDiffPixels: 100`); Phase 5's full goldens
 * supersede this.
 *
 * To regenerate the baseline (only when an intentional change has
 * landed and been reviewed):
 *   pnpm -F web exec playwright test visual-add-relative --update-snapshots
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { importViaWizard } from "./_helpers/importViaWizard";
import { maskUnstableUI } from "./_helpers/visual-mask";

const MULTI = resolve(process.cwd(), "tests/fixtures/multi-union.ged");

test.describe("add-relative visual golden", () => {
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

    test("focus card with add-relative menu open", async ({ page }) => {
        test.setTimeout(60_000);

        await page.goto("/");
        await importViaWizard(page, MULTI);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("region", { name: /family view canvas/ });
        await expect(region).toBeVisible();
        await expect(page.locator("[data-person-id]").first()).toBeVisible();

        await page.locator("[data-add-toggle='open']").first().dispatchEvent("click");
        await expect(page.locator("[data-add-toggle='menu']")).toBeVisible();

        // Wait for paint to settle.
        await page.waitForTimeout(300);

        await expect(region).toHaveScreenshot("add-relative-menu-open.png", {
            maxDiffPixels: 100,
            mask: maskUnstableUI(page),
        });
    });
});
