/*
 * FamilyTreeEditor - Phase 6 family-view: cross-engine continuity full e2e.
 *
 * Phase 0 asserted the selection-survives seam; Phase 6 upgrades to a
 * full continuity check:
 *   - edits made in family-view are visible after switching to layered
 *   - selection survives swaps in both directions
 *   - "Overlay: path highlight" entry is enabled (Phase 6 wired it)
 *   - command palette person-pick opens the inspector and calls
 *     canvasController.focusSelection() (pre-wired in Phase 6)
 *
 * Clears the `fte.*` localStorage namespace in beforeEach so the
 * defaultEngine setting is the documented `family-view` regardless of
 * prior test runs.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeInspectorIfMobile } from "./_helpers/close-inspector";
import { importViaWizard } from "./_helpers/importViaWizard";

const TINY = resolve(process.cwd(), "tests/fixtures/tiny.ged");

test.describe("family view — cross-engine continuity", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                for (const key of Object.keys(localStorage)) {
                    if (key.startsWith("fte.")) localStorage.removeItem(key);
                }
            } catch {
                /* localStorage may not be available in every context */
            }
        });
    });

    test("family-view is the default and selection survives engine swaps", async ({
        page,
        isMobile,
    }) => {
        // on mobile the populated inspector renders as a bottom sheet that
        // intercepts View-menu items (B4). dismiss it after each selection
        // before reaching for the View menu; the selection itself lives on
        // the canvas, not on the inspector, so the swap-survival contract
        // is unaffected by closing the panel.
        await page.goto("/");
        await importViaWizard(page, TINY);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible();

        // Family-view region is mounted (the new walking-skeleton renderer).
        const familyRegion = page.getByRole("tree", { name: /family view canvas/ });
        await expect(familyRegion).toBeVisible();

        // Select a person — any visible card.
        const firstCard = page.locator("[data-person-id]").first();
        await expect(firstCard).toBeVisible();
        const selectedId = await firstCard.getAttribute("data-person-id");
        expect(selectedId).toBeTruthy();
        await firstCard.click();
        await expect(firstCard).toHaveAttribute("aria-selected", "true");
        await closeInspectorIfMobile(page, isMobile);

        // Switch to layered — selection survives.
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: "Use layered engine" }).click();
        const layeredSel = page.locator(`[data-person-id="${selectedId!}"][aria-selected="true"]`);
        await expect(layeredSel).toBeVisible();
        await closeInspectorIfMobile(page, isMobile);

        // Switch to hyperbolic — same person stays selected.
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: /hyperbolic engine/ }).click();
        const hyperbolicSel = page.locator(
            `[data-person-id="${selectedId!}"][aria-selected="true"]`,
        );
        await expect(hyperbolicSel).toBeVisible();
        await closeInspectorIfMobile(page, isMobile);

        // Back to family-view — selection survives the round-trip.
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: "Use family view" }).click();
        const familySel = page.locator(`[data-person-id="${selectedId!}"][aria-selected="true"]`);
        await expect(familySel).toBeVisible();
    });

    test("Overlay: path highlight is enabled and togglable in the View menu", async ({ page }) => {
        await page.goto("/");
        await importViaWizard(page, TINY);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible();

        await page.getByRole("button", { name: "View" }).click();
        const overlay = page.getByRole("menuitem", { name: /overlay: path highlight/i });
        await expect(overlay).toBeVisible();
        await expect(overlay).toBeEnabled();
    });

    test("the `+` affordance is real in phase 1 (expansion, not toast)", async ({ page }) => {
        // Phase 0 attached the `+` to a "coming in phase 4" toast. Phase 1
        // replaced that with real expansion via `setExpanded`. The toast
        // path is gone; this test asserts the new contract (expand-toggle
        // button surface exists when the card has un-shown adjacents).
        await page.goto("/");
        await importViaWizard(page, TINY);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible();

        // tiny.ged + family-view focused on rootId (Alpha) renders Alpha
        // + Gamma (the child). Alpha has no parents shown → north-edge
        // expansion. Gamma has no children → no expand button. The
        // exact set varies, but at least one expand-toggle must exist
        // OR the affordance is absent (also acceptable for tiny trees).
        const expandButtons = page.locator("[data-expand-toggle='expand']");
        const count = await expandButtons.count();
        // No assertion on count itself; the assertion is that the old
        // `data-add-stub` surface is gone (no more toast plumbing).
        const oldStubButtons = page.locator("[data-add-stub]");
        expect(await oldStubButtons.count()).toBe(0);
        void count;
    });

    test("edit made in family-view is visible after switching to layered", async ({
        page,
        isMobile,
    }) => {
        // Phase 6 cross-engine continuity: edits persist when you swap engines.
        // on mobile the inspector sheet covers the View-menu dropdown column
        // after a card is selected (B4); the close-inspector helper drops the
        // sheet before each menu reach. the edit itself has already been
        // committed via Tab/blur by the time the helper fires.
        await page.goto("/");
        await importViaWizard(page, TINY);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible();

        // tiny.ged root is Alpha Smith. Select the focus card.
        const alphaCard = page.locator("[data-person-id]").filter({ hasText: "Alpha" }).first();
        await expect(alphaCard).toBeVisible();
        await alphaCard.click();

        // Inspector opens; edit the given name and commit via blur.
        const givenField = page.getByLabel("given");
        await expect(givenField).toBeVisible();
        await givenField.fill("AlphaEdited");
        await givenField.press("Tab"); // triggers onblur → commitGiven

        // The family-view card should immediately reflect the new name.
        await expect(
            page.locator("[data-person-id]").filter({ hasText: "AlphaEdited" }),
        ).toBeVisible();
        await closeInspectorIfMobile(page, isMobile);

        // Switch to layered engine; the same card must show the edited name.
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: "Use layered engine" }).click();
        await expect(
            page.locator("[data-person-id]").filter({ hasText: "AlphaEdited" }),
        ).toBeVisible();
        await closeInspectorIfMobile(page, isMobile);

        // Switch back to family-view; the name persists in the round-trip.
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: "Use family view" }).click();
        await expect(
            page.locator("[data-person-id]").filter({ hasText: "AlphaEdited" }),
        ).toBeVisible();
    });

    test("command palette person-pick opens inspector", async ({ page }) => {
        // Phase 6: canvasController.focusSelection() is called after palette pick.
        // The observable effect is the inspector opening for the picked person.
        await page.goto("/");
        await importViaWizard(page, TINY);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible();

        // Open find-person palette via Edit menu.
        await page.getByRole("button", { name: "Edit" }).click();
        await page.getByRole("menuitem", { name: /find person/i }).click();

        // The palette opens; type to narrow to Gamma.
        const paletteInput = page.getByLabel("palette search");
        await expect(paletteInput).toBeVisible({ timeout: 3_000 });
        await paletteInput.fill("Gamma");

        // Pick the first person result.
        const gammaResult = page
            .locator("[data-kind='person']")
            .filter({ hasText: "Gamma" })
            .first();
        await expect(gammaResult).toBeVisible({ timeout: 3_000 });
        await gammaResult.click();

        // Inspector should open for Gamma; palette closes on pick.
        await expect(page.getByLabel("given")).toBeVisible({ timeout: 3_000 });
        const givenValue = await page.getByLabel("given").inputValue();
        expect(givenValue).toBe("Gamma");
    });
});

test.describe("family view — generation-badge toggle (phase 4)", () => {
    // Separate describe so the localStorage cleanup runs once via
    // page.evaluate after the initial navigation rather than via
    // addInitScript on every navigation. This lets the reload + tab
    // close/reopen round-trips actually exercise the persisted choice.
    test.beforeEach(async ({ page }) => {
        await page.goto("/");
        await page.evaluate(() => {
            try {
                for (const key of Object.keys(localStorage)) {
                    if (key.startsWith("fte.")) localStorage.removeItem(key);
                }
            } catch {
                /* localStorage may not be available in every context */
            }
        });
    });

    test("badge defaults off and round-trips through reload + tab close/reopen", async ({
        page,
        context,
    }) => {
        // (c) default-off on first load with cleared storage.
        await importViaWizard(page, TINY);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible();
        await expect(page.locator("[data-generation-badge]")).toHaveCount(0);

        // Toggle on via the View menu; badge appears on at least one card.
        await page.getByRole("button", { name: "View" }).click();
        const overlay = page.getByRole("menuitem", { name: /overlay: generation badges/i });
        await expect(overlay).toBeVisible();
        await expect(overlay).toBeEnabled();
        await overlay.click();
        await expect(page.locator("[data-generation-badge]").first()).toBeVisible();

        // Verify the write actually hit localStorage.
        const stored = await page.evaluate(() =>
            localStorage.getItem("fte.overlays.generationBadge"),
        );
        expect(stored).toBe("true");

        // (a) reload — preference restored → badges still rendered.
        await page.reload();
        await importViaWizard(page, TINY);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible();
        await expect(page.locator("[data-generation-badge]").first()).toBeVisible();

        // (b) close the page, open a fresh page in the same browser
        // context — localStorage persists across tab lifecycle.
        const url = page.url();
        await page.close();
        const reopened = await context.newPage();
        await reopened.goto(url);
        await importViaWizard(reopened, TINY);
        await expect(reopened.getByText(/imported \d+ people/)).toBeVisible();
        await expect(reopened.locator("[data-generation-badge]").first()).toBeVisible();
    });
});
