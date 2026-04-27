/*
 * FamilyTreeEditor - phase 3 e2e: import a small ged, render nodes, focus the inspector
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const TINY = resolve(process.cwd(), "tests/fixtures/tiny.ged");

test("import a tiny ged file, render person cards, focus the inspector", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="import-input"]').setInputFiles(TINY);

    // toast confirms parse + load
    await expect(page.getByText(/loaded \d+ people/)).toBeVisible();

    // at least one PersonNode button rendered
    const cards = page.locator("[data-person-id]");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(3);

    // single-click selects the person; the right-side inspector switches to the
    // Personal tab with the person's editable fields
    await cards.first().click();
    await expect(page.getByLabel("given")).toBeVisible();
    await expect(page.getByLabel("surname")).toBeVisible();

    // close inspector via the X button; the canvas remains
    await page.getByRole("button", { name: "close inspector" }).click();
    await expect(page.getByLabel("given")).not.toBeVisible();
    await expect(cards.first()).toBeVisible();
});
