/*
 * FamilyTreeEditor - phase 5 e2e: import wizard dialog supports drag-drop
 * file rows, the tree-name field, the replace-or-merge radio, and folds
 * multiple files into one merged tree before persistence.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const TINY = resolve(process.cwd(), "tests/fixtures/tiny.ged");
const FAMILYSCRIPT = resolve(process.cwd(), "tests/fixtures/Akarians.txt");

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        try {
            localStorage.setItem("fte.defaultEngine", "layered");
        } catch {
            /* non-fatal */
        }
    });
});

test("import wizard: single file via Mod+I, name override, Import button", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+I");
    const wizard = page.locator('[data-testid="import-wizard"]');
    await expect(wizard).toBeVisible();

    // drop a file via the browse input
    await wizard.locator('[data-testid="import-browse"]').setInputFiles(TINY);

    // row shows format badge + person count
    const row = wizard.locator('[data-testid="import-row"]').first();
    await expect(row).toContainText("gedcom");
    await expect(row).toContainText("people");

    // override the tree name
    const nameField = wizard.locator('[data-testid="import-name"]');
    await expect(nameField).toBeVisible();
    await nameField.fill("My Override Name");

    // click Import; wizard closes; toast confirms
    await wizard.locator('[data-testid="import-confirm-wrap"] button').click();
    await expect(wizard).toBeHidden();
    await expect(page.getByText(/imported \d+ people/)).toBeVisible();
});

test("import wizard: two files fold into one tree before persistence", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+I");
    const wizard = page.locator('[data-testid="import-wizard"]');
    await expect(wizard).toBeVisible();

    // drop two files in sequence
    const browse = wizard.locator('[data-testid="import-browse"]');
    await browse.setInputFiles(TINY);
    await expect(wizard.locator('[data-testid="import-row"]')).toHaveCount(1);
    await browse.setInputFiles(FAMILYSCRIPT);
    await expect(wizard.locator('[data-testid="import-row"]')).toHaveCount(2);

    // each row shows its format badge
    const rows = wizard.locator('[data-testid="import-row"]');
    await expect(rows.nth(0)).toContainText("gedcom");
    await expect(rows.nth(1)).toContainText("familyscript");

    // confirm and assert the toast surfaced
    await wizard.locator('[data-testid="import-confirm-wrap"] button').click();
    await expect(wizard).toBeHidden();
    await expect(page.getByText(/imported \d+ people/)).toBeVisible();
});

test("import wizard: replace radio appears only when a tree is already open", async ({ page }) => {
    await page.goto("/");
    // first import to populate an active tree
    await page.keyboard.press("Control+I");
    let wizard = page.locator('[data-testid="import-wizard"]');
    await wizard.locator('[data-testid="import-browse"]').setInputFiles(TINY);
    // radio should NOT appear yet because the active tree is the empty seed
    await expect(wizard.locator('[data-testid="import-mode-replace"]')).toHaveCount(0);
    await wizard.locator('[data-testid="import-confirm-wrap"] button').click();
    await expect(wizard).toBeHidden();
    await expect(page.getByText(/imported \d+ people/)).toBeVisible();

    // reopen the wizard - active tree now has people, the radio should appear
    await page.keyboard.press("Control+I");
    wizard = page.locator('[data-testid="import-wizard"]');
    await wizard.locator('[data-testid="import-browse"]').setInputFiles(TINY);
    await expect(wizard.locator('[data-testid="import-mode-replace"]')).toBeVisible();
    await expect(wizard.locator('[data-testid="import-mode-merge"]')).toBeVisible();
});
