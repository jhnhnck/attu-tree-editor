/*
 * FamilyTreeEditor - wave-2 phase 4 visual golden: 2-expanded-union focus.
 *
 * Captures the family-view canvas after expanding Aron Vance's
 * secondary union (F2 with Sera, child Iva) on top of the primary
 * (F1 with Mira, child Calen). Visual contract: both partners sit at
 * rank 0 with the focus between them, each union has its own
 * couple-bus drop to its child at rank 1, and the half-sibling
 * rendering emerges naturally (Calen + Iva are children of
 * Aron through different partners).
 *
 * Tolerance pinned tight (`maxDiffPixels: 100`) — the goal is to
 * catch positioning regressions in the secondary-union geometry
 * specifically.
 *
 * To regenerate the baseline (only when an intentional change has
 * landed and been reviewed):
 *   pnpm -F web exec playwright test visual-secondary-union --update-snapshots
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { maskUnstableUI } from "./_helpers/visual-mask";

const MULTI = resolve(process.cwd(), "tests/fixtures/multi-union.ged");

test.describe("secondary-union visual golden", () => {
    test.skip(({ isMobile }) => isMobile, "visual goldens are desktop-only");

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                for (const key of Object.keys(localStorage)) {
                    if (key.startsWith("fte.")) localStorage.removeItem(key);
                }
                localStorage.setItem("fte.defaultEngine", "family-view");
                // Disable smooth-diff for the golden so the mid-animation
                // tween doesn't enter the captured frame.
                localStorage.setItem("fte.overlays.smoothDiff", "false");
            } catch {
                /* non-fatal */
            }
        });
    });

    test("2-expanded focus with primary + secondary visible alongside", async ({ page }) => {
        test.setTimeout(60_000);

        await page.goto("/");
        await page.locator('[data-testid="import-input"]').setInputFiles(MULTI);
        await expect(page.getByText(/loaded \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("region", { name: /family view canvas/ });
        await expect(region).toBeVisible();
        await expect(page.locator("[data-person-id]").first()).toBeVisible();

        // Open the picker and click "also show ... alongside".
        const pickerToggle = page.locator("[data-union-picker='toggle']").first();
        await pickerToggle.dispatchEvent("click");
        const showAlongside = page
            .locator("[data-union-picker='menu']")
            .locator("[data-union-picker-action='show-alongside']")
            .first();
        await showAlongside.dispatchEvent("click");

        // Wait for the secondary partner card (Sera) to appear, so the
        // layout has settled before the screenshot.
        await expect(page.locator("[data-person-id]", { hasText: /Sera/ })).toHaveCount(1, {
            timeout: 5_000,
        });

        // Layout's settled — let one paint flush.
        await page.waitForTimeout(300);

        await expect(region).toHaveScreenshot("secondary-union-expanded.png", {
            maxDiffPixels: 100,
            mask: maskUnstableUI(page),
        });
    });
});
