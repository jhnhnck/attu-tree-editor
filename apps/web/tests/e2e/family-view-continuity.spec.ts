/*
 * FamilyTreeEditor - Phase 0 family-view: cross-engine continuity smoke test.
 *
 * Asserts the walking-skeleton contract: a person selected in one engine
 * stays selected after switching to another engine and back. Phase 6 will
 * upgrade this to a full e2e (edits visible across engines, recenter on
 * the same person); Phase 0 only checks the selection seam.
 *
 * Clears the `fte.*` localStorage namespace in beforeEach so the
 * defaultEngine setting is the documented `family-view` regardless of
 * prior test runs.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const TINY = resolve(process.cwd(), "tests/fixtures/tiny.ged");

test.describe("family view — cross-engine continuity", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                for (const key of Object.keys(localStorage)) {
                    if (key.startsWith("fte.")) localStorage.removeItem(key);
                }
            } catch {
                /* localStorage may not be available in every context */
            }
        });
    });

    test("family-view is the default and selection survives engine swaps", async ({ page }) => {
        await page.goto("/");
        await page.locator('[data-testid="import-input"]').setInputFiles(TINY);
        await expect(page.getByText(/loaded \d+ people/)).toBeVisible();

        // Family-view region is mounted (the new walking-skeleton renderer).
        const familyRegion = page.getByRole("region", { name: /family view canvas/ });
        await expect(familyRegion).toBeVisible();

        // Select a person — any visible card.
        const firstCard = page.locator("[data-person-id]").first();
        await expect(firstCard).toBeVisible();
        const selectedId = await firstCard.getAttribute("data-person-id");
        expect(selectedId).toBeTruthy();
        await firstCard.click();
        await expect(firstCard).toHaveAttribute("aria-selected", "true");

        // Switch to layered — selection survives.
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: "Use layered engine" }).click();
        const layeredSel = page.locator(`[data-person-id="${selectedId!}"][aria-selected="true"]`);
        await expect(layeredSel).toBeVisible();

        // Switch to hyperbolic — same person stays selected.
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: /hyperbolic engine/ }).click();
        const hyperbolicSel = page.locator(
            `[data-person-id="${selectedId!}"][aria-selected="true"]`,
        );
        await expect(hyperbolicSel).toBeVisible();

        // Back to family-view — selection survives the round-trip.
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: "Use family view" }).click();
        const familySel = page.locator(`[data-person-id="${selectedId!}"][aria-selected="true"]`);
        await expect(familySel).toBeVisible();
    });

    test("Overlays placeholder appears in the View menu (disabled)", async ({ page }) => {
        await page.goto("/");
        await page.locator('[data-testid="import-input"]').setInputFiles(TINY);
        await expect(page.getByText(/loaded \d+ people/)).toBeVisible();

        await page.getByRole("button", { name: "View" }).click();
        const overlay = page.getByRole("menuitem", {
            name: /path highlight \(coming in phase 3\)/i,
        });
        await expect(overlay).toBeVisible();
        await expect(overlay).toBeDisabled();
    });

    test("the `+` editing affordance fires the coming-soon toast", async ({ page }) => {
        await page.goto("/");
        await page.locator('[data-testid="import-input"]').setInputFiles(TINY);
        await expect(page.getByText(/loaded \d+ people/)).toBeVisible();

        // Hover a card to surface the add buttons, then click one.
        const card = page.locator("[data-person-id]").first();
        await card.hover();
        const addParent = page.locator("[data-add-stub='north']").first();
        // CSS hover doesn't always reveal in Playwright; force visibility on
        // the element before clicking by using `force: true`.
        await addParent.click({ force: true });
        await expect(page.getByText(/coming in phase 4/i)).toBeVisible();
    });
});
