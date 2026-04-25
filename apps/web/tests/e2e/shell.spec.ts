/*
 * FamilyTreeEditor - phase 0 end-to-end smoke test for the shell render
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { expect, test } from "@playwright/test";

test("phase 0 shell renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "family tree editor" })).toBeVisible();
});
