/*
 * FamilyTreeEditor - Phase 2 family-view e2e: multi-union UI.
 *
 * Verifies the Phase 2 DoD's headline UI contract:
 *   - the `˅` (multi-union picker) appears on the visible partner card
 *     of a multi-union person,
 *   - clicking it opens a picker listing the alternate partners,
 *   - selecting an alternate swaps the visible partner + children block.
 *
 * Uses the synthetic `multi-union.ged` fixture (Aron + Mira primary
 * union, Aron + Sera non-primary union, one child per union).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { importViaWizard } from "./_helpers/importViaWizard";

const MULTI = resolve(process.cwd(), "tests/fixtures/multi-union.ged");

test.describe("family view — Phase 2 multi-union UI", () => {
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

    test("˅ picker swaps primary union; non-primary union state persists", async ({ page }) => {
        test.setTimeout(60_000);
        await page.goto("/");
        await importViaWizard(page, MULTI);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("region", { name: /family view canvas/ });
        await expect(region).toBeVisible();
        const cards = page.locator("[data-person-id]");
        await expect(cards.first()).toBeVisible();

        // Primary union (Aron + Mira) renders Calen by default; Sera + Iva hidden.
        await expect(page.locator("[data-person-id]").filter({ hasText: /Mira/ })).toBeVisible();
        await expect(page.locator("[data-person-id]").filter({ hasText: /Calen/ })).toBeVisible();
        await expect(page.locator("[data-person-id]").filter({ hasText: /Sera/ })).toHaveCount(0);
        await expect(page.locator("[data-person-id]").filter({ hasText: /Iva/ })).toHaveCount(0);

        // `˅` picker is attached to Mira's card (because her mate Aron has 2 unions).
        const picker = page.locator("[data-union-picker='toggle']");
        await expect(picker.first()).toBeAttached();
        await picker.first().dispatchEvent("click");

        const menu = page.locator("[data-union-picker='menu']");
        await expect(menu).toBeVisible();
        // Menu lists "set primary to Sera" — the wave-1 swap action.
        // Wave-2 phase 4 added a second "show alongside Sera" button to
        // the same menu, so scope the selector to the swap action
        // explicitly via the `data-union-picker-action` attribute.
        const seraItem = menu.locator("[data-union-picker-action='set-primary']", {
            hasText: /Sera/,
        });
        await expect(seraItem).toBeVisible();
        await seraItem.dispatchEvent("click");

        // After swap: Sera + Iva visible; Mira + Calen hidden.
        await expect(page.locator("[data-person-id]").filter({ hasText: /Sera/ })).toBeVisible({
            timeout: 5000,
        });
        await expect(page.locator("[data-person-id]").filter({ hasText: /Iva/ })).toBeVisible();
        await expect(page.locator("[data-person-id]").filter({ hasText: /Mira/ })).toHaveCount(0);
        await expect(page.locator("[data-person-id]").filter({ hasText: /Calen/ })).toHaveCount(0);

        // The primary-union override key landed in localStorage so the
        // selection survives engine swaps.
        const stored = await page.evaluate(() => {
            const keys = Object.keys(localStorage).filter((k) =>
                k.startsWith("fte.family-view.primary-union.v1:"),
            );
            return keys.length > 0 ? localStorage.getItem(keys[0]!) : null;
        });
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!) as { byPerson: Record<string, number> };
        expect(Object.values(parsed.byPerson).length).toBeGreaterThan(0);
    });
});
