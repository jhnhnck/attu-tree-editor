/*
 * FamilyTreeEditor - phase 3 e2e: import a small ged, render nodes, edit one
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const TINY = resolve(process.cwd(), "tests/fixtures/tiny.ged");

test("import a tiny ged file, render person cards, open the editor", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="import-input"]').setInputFiles(TINY);

    // toast confirms parse + load (auto-dismisses after 10s)
    await expect(page.getByText(/loaded \d+ people/)).toBeVisible();

    // at least one PersonNode button rendered
    const cards = page.locator("[data-person-id]");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(3);

    // double-click a card opens the editor dialog (heading shows the person's name)
    await cards.first().dblclick();
    await expect(page.getByLabel("given")).toBeVisible();
    await expect(page.getByLabel("surname")).toBeVisible();

    // cancel returns to canvas without crashing
    await page.getByRole("button", { name: "cancel" }).click();
    await expect(page.getByLabel("given")).not.toBeVisible();
});
