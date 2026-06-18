/*
 * FamilyTreeEditor - Phase 4 family-view e2e: add-relative affordance.
 *
 * Verifies the Phase 4 DoD's headline contract:
 *   - the `+ person` (UserPlus) affordance appears on the focus card,
 *   - clicking it opens an add-relative menu (parent / partner / child),
 *   - picking an option creates a blank person, links them, auto-selects
 *     the new person, and family-view re-centers if the new card lands
 *     outside the bounded subset.
 *
 * The fixture is `multi-union.ged` (focus = Aron, who already has two
 * unions; the new relative goes through the existing add-* mutations
 * which are well-covered by unit tests on `addPerson` / `linkParent` /
 * `linkSpouse`).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { importViaWizard } from "./_helpers/importViaWizard";

const MULTI = resolve(process.cwd(), "tests/fixtures/multi-union.ged");

test.describe("family view — Phase 4 add-relative", () => {
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

    test("add-relative menu surfaces parent / partner / child on the focus card", async ({
        page,
    }) => {
        test.setTimeout(60_000);
        await page.goto("/");
        await importViaWizard(page, MULTI);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("tree", { name: /family view canvas/ });
        await expect(region).toBeVisible();
        await expect(page.locator("[data-person-id]").first()).toBeVisible();

        // The `+ person` affordance lives on the focus card (Aron is I1 /
        // root). Other cards don't get it.
        const addToggle = page.locator("[data-add-toggle='open']");
        await expect(addToggle).toHaveCount(1);
        await addToggle.first().dispatchEvent("click");

        const menu = page.locator("[data-add-toggle='menu']");
        await expect(menu).toBeVisible();
        await expect(menu.locator("[data-add-kind='parent']")).toBeVisible();
        await expect(menu.locator("[data-add-kind='partner']")).toBeVisible();
        await expect(menu.locator("[data-add-kind='child']")).toBeVisible();

        // Pick "add child". The handler creates a blank "New Person" and
        // auto-selects them; family-view's recenterOn shifts activeFocus
        // if the new card is off-subset, so the card lands visible.
        await menu.locator("[data-add-kind='child']").dispatchEvent("click");

        const fresh = page.locator("[data-person-id]").filter({ hasText: /New Person/ });
        await expect(fresh.first()).toBeVisible({ timeout: 5000 });

        // Menu closes after pick.
        await expect(page.locator("[data-add-toggle='menu']")).toHaveCount(0);
    });

    test("add-relative menu closes on outside click", async ({ page }) => {
        test.setTimeout(60_000);
        await page.goto("/");
        await importViaWizard(page, MULTI);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("tree", { name: /family view canvas/ });
        await expect(region).toBeVisible();
        await expect(page.locator("[data-person-id]").first()).toBeVisible();

        await page.locator("[data-add-toggle='open']").first().dispatchEvent("click");
        await expect(page.locator("[data-add-toggle='menu']")).toBeVisible();

        // Click on the canvas background (outside the card / picker / menu).
        // `onPointerDown` checks for `[data-add-toggle]` in the closest
        // ancestor list; if it's not there, the menu closes. click the
        // top-right corner: the canvas-chrome dock now anchors top-left
        // (all items corner="tl"), so the old top-left target lands on a
        // dock pill — whose pointerdown never reaches the host handler.
        const box = await region.boundingBox();
        if (!box) throw new Error("region has no bounding box");
        await page.mouse.click(box.x + box.width - 20, box.y + 20);

        await expect(page.locator("[data-add-toggle='menu']")).toHaveCount(0);
    });
});
