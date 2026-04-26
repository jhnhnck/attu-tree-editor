/*
 * FamilyTreeEditor - phase 4 e2e: tree persists across reloads via Dexie autosave
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const TINY = resolve(process.cwd(), "tests/fixtures/tiny.ged");

test("imported tree survives a page reload via dexie autosave", async ({ page }) => {
    await page.goto("/");

    // import the tiny fixture and wait for the success toast
    await page.locator('[data-testid="import-input"]').setInputFiles(TINY);
    await expect(page.getByText(/loaded \d+ people/)).toBeVisible();

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

test("recent dropdown lists the saved tree", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="import-input"]').setInputFiles(TINY);
    await expect(page.getByText(/loaded \d+ people/)).toBeVisible();
    await page.waitForTimeout(2500);

    // open the recents dropdown - it should contain the freshly-saved tree
    await page.locator('[data-testid="recents-trigger"]').click();
    await expect(page.getByText(/3 people/).first()).toBeVisible();
});
