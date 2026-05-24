/*
 * FamilyTreeEditor - real-browser regression for the inspector header
 * more-actions menu. confirms the four menu items (Duplicate person /
 * Set as tree root / Copy ID / Delete person) actually fire their
 * handlers when clicked in a live chromium instance. companion to the
 * unit tests in tests/component/Inspector.test.ts which exercise the
 * same path under jsdom + userEvent.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { importViaWizard } from "./_helpers/importViaWizard";

const TINY = resolve(process.cwd(), "tests/fixtures/tiny.ged");

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        try {
            localStorage.setItem("fte.defaultEngine", "layered");
        } catch {
            /* non-fatal */
        }
    });
});

test("inspector more-actions menu items fire their handlers", async ({ page }) => {
    await page.goto("/");
    await importViaWizard(page, TINY);
    await expect(page.getByText(/imported \d+ people/)).toBeVisible();

    // open inspector by clicking a card; we use the first visible person card
    const firstCard = page.locator("[data-person-id]").first();
    await firstCard.click();

    // inspector should now show; the more-actions button is in the header
    const moreBtn = page.getByRole("button", { name: /more actions/i });
    await expect(moreBtn).toBeVisible();

    // 1) Duplicate person — should grow people count
    const peopleBadge = page.getByRole("button", { name: /^\d+ people/ });
    const beforeText = await peopleBadge.textContent();
    const beforeCount = parseInt(beforeText?.match(/^(\d+)/)?.[1] ?? "0", 10);
    await moreBtn.click();
    await page.getByRole("button", { name: /duplicate person/i }).click();
    await expect(peopleBadge).toHaveText(new RegExp(`^${String(beforeCount + 1)} people`));

    // 2) Copy ID — open the menu and click; we can't reliably read the clipboard
    // in playwright without grants, so just confirm the menu closed (handler
    // ran the `menuOpen = false` line)
    await moreBtn.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("button", { name: /copy id/i }).click();
    await expect(page.getByRole("menu")).toBeHidden();

    // 3) Set as tree root — toast confirms the just-promoted person
    await moreBtn.click();
    await page.getByRole("button", { name: /set as tree root/i }).click();
    await expect(page.getByText(/is now the tree root/i)).toBeVisible();

    // 4) Delete person — people count drops
    const afterDupText = await peopleBadge.textContent();
    const afterDupCount = parseInt(afterDupText?.match(/^(\d+)/)?.[1] ?? "0", 10);
    await moreBtn.click();
    await page.getByRole("button", { name: /delete person/i }).click();
    await expect(peopleBadge).toHaveText(new RegExp(`^${String(afterDupCount - 1)} people`));
});
