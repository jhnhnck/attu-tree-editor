/*
 * FamilyTreeEditor - phase 4 e2e: tree persists across reloads via Dexie autosave
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { importViaWizard } from "./_helpers/importViaWizard";

const TINY = resolve(process.cwd(), "tests/fixtures/tiny.ged");

test.beforeEach(async ({ page }) => {
    // Phase 0 family-view flipped the default; this test asserts the
    // layered-only "N people" badge so pin layered explicitly.
    await page.addInitScript(() => {
        try {
            localStorage.setItem("fte.defaultEngine", "layered");
        } catch {
            /* non-fatal */
        }
    });
});

test("imported tree survives a page reload via dexie autosave", async ({ page }) => {
    await page.goto("/");

    // import the tiny fixture and wait for the success toast
    await importViaWizard(page, TINY);
    await expect(page.getByText(/imported \d+ people/)).toBeVisible();

    // wait for the autosave debounce window to flush (the saver uses a 1s
    // default; allow a healthy buffer for the IDB write to commit)
    await page.waitForTimeout(2500);

    // reload the page; the lastOpenedTreeId setting should rehydrate the tree
    await page.reload();

    // the canvas should already be populated with the cards from before
    const cards = page.locator("[data-person-id]");
    await expect(cards.first()).toBeVisible();
    await expect(cards).toHaveCount(3, { timeout: 10_000 });
});

test("File > Open tree dialog lists the saved tree", async ({ page }) => {
    await page.goto("/");

    await importViaWizard(page, TINY);
    await expect(page.getByText(/imported \d+ people/)).toBeVisible();
    await page.waitForTimeout(2500);

    // open the File menu and trigger Open tree…
    await page.getByRole("button", { name: /^File$/ }).click();
    await page.getByRole("menuitem", { name: /Open tree/i }).click();

    // dialog appears with the freshly-saved tree
    await expect(page.locator('[data-testid="open-dialog"]')).toBeVisible();
    await expect(page.getByText(/3 people/).first()).toBeVisible();
});
