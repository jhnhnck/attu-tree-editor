/*
 * FamilyTreeEditor - Phase 3 family-view e2e: path highlight on selection.
 *
 * Verifies the Phase 3 DoD's headline contract:
 *   - clicking a person other than the focus marks the BFS path
 *     focus→selected on every card and edge in between via
 *     `data-on-path="true"` markers,
 *   - selecting the focus collapses to a one-card path,
 *   - deselecting clears the path.
 *
 * Uses the synthetic `multi-union.ged` fixture (Aron is focus / root;
 * selecting Calen lights up Aron + Calen).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const MULTI = resolve(process.cwd(), "tests/fixtures/multi-union.ged");

test.describe("family view — Phase 3 path highlight", () => {
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

    test("selecting a relative marks the path with data-on-path", async ({ page }) => {
        test.setTimeout(60_000);
        await page.goto("/");
        await page.locator('[data-testid="import-input"]').setInputFiles(MULTI);
        await expect(page.getByText(/loaded \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("region", { name: /family view canvas/ });
        await expect(region).toBeVisible();
        const cards = page.locator("[data-person-id]");
        await expect(cards.first()).toBeVisible();

        // No selection → no on-path markers anywhere.
        await expect(page.locator("[data-on-path='true']")).toHaveCount(0);

        // Click Calen (Aron + Mira's child). Path = [Aron, Calen] → 2 cards
        // should pick up the on-path marker.
        const calen = page.locator("[data-person-id]").filter({ hasText: /Calen/ });
        await calen.click();
        await expect(calen).toHaveAttribute("aria-selected", "true");
        await expect.poll(async () => page.locator("[data-on-path='true']").count()).toBe(2);

        // Aron's card wrapper is on-path too (the focus). `data-on-path`
        // lives on the absolutely-positioned wrapper around PersonNode,
        // so don't combine the attribute with `[data-person-id]`.
        const aronOnPath = page.locator("[data-on-path='true']").filter({ hasText: /Aron/ });
        await expect(aronOnPath).toBeVisible();
    });

    test("clicking the focus collapses to a one-card path; clicking again clears it", async ({
        page,
        isMobile,
    }) => {
        // see bugs.md B4: after the first click selects Aron, the inspector
        // bottom-sheet opens with the portrait-placeholder, which covers
        // Aron's card on Pixel 7 and intercepts the second click.
        test.skip(isMobile, "B4: inspector sheet intercepts second click on focus card");
        test.setTimeout(60_000);
        await page.goto("/");
        await page.locator('[data-testid="import-input"]').setInputFiles(MULTI);
        await expect(page.getByText(/loaded \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("region", { name: /family view canvas/ });
        await expect(region).toBeVisible();
        const aron = page.locator("[data-person-id]").filter({ hasText: /Aron/ });
        await aron.click();
        await expect(aron).toHaveAttribute("aria-selected", "true");
        // Focus-on-self: one card on path.
        await expect.poll(async () => page.locator("[data-on-path='true']").count()).toBe(1);

        // Deselect by clicking again.
        await aron.click();
        await expect.poll(async () => page.locator("[data-on-path='true']").count()).toBe(0);
    });
});
