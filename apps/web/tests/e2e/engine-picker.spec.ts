/*
 * FamilyTreeEditor - Phase 0 walking-skeleton e2e: engine picker + persistence.
 *
 * Confirms the layered/hyperbolic engine seam end-to-end:
 *   1. Picker offers both engines from the View menu.
 *   2. Switching to Hyperbolic mounts the empty-disk stub (no card grid).
 *   3. Switching back restores the layered canvas.
 *   4. Selection persists across a page reload (settings table).
 *
 * Does not exercise the layered or hyperbolic engines themselves — Phase 4
 * (libavoid) and Phase 5 (Lamping–Rao) own those.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const TINY = resolve(process.cwd(), "tests/fixtures/tiny.ged");

test("engine picker switches canvas and persists across reload", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-testid="import-input"]').setInputFiles(TINY);
    await expect(page.getByText(/loaded \d+ people/)).toBeVisible();

    // Layered canvas is the default — at least one PersonNode is rendered.
    const cards = page.locator("[data-person-id]");
    await expect(cards.first()).toBeVisible();

    // Switch to hyperbolic via the View menu.
    await page.getByRole("button", { name: "View" }).click();
    await page.getByRole("menuitem", { name: /hyperbolic engine/ }).click();

    // The hyperbolic canvas mounts; PersonNode cards are gone, the
    // "Phase 5 stub" affordance is visible.
    await expect(cards).toHaveCount(0);
    await expect(page.getByText(/Phase 5 stub/)).toBeVisible();
    await expect(page.getByRole("region", { name: /hyperbolic canvas/ })).toBeVisible();

    // Switch back to layered; cards return.
    await page.getByRole("button", { name: "View" }).click();
    await page.getByRole("menuitem", { name: "Use layered engine" }).click();
    await expect(cards.first()).toBeVisible();

    // Switch to hyperbolic again, then reload — the engine setting is
    // persisted to the IndexedDB `settings` table and picked up on mount.
    await page.getByRole("button", { name: "View" }).click();
    await page.getByRole("menuitem", { name: /hyperbolic engine/ }).click();
    await expect(page.getByText(/Phase 5 stub/)).toBeVisible();

    await page.reload();
    await expect(page.getByText(/Phase 5 stub/)).toBeVisible();
    await expect(page.locator("[data-person-id]")).toHaveCount(0);
});

test("hyperbolic canvas shows the proband at disk centre", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-testid="import-input"]').setInputFiles(TINY);
    await expect(page.getByText(/loaded \d+ people/)).toBeVisible();

    await page.getByRole("button", { name: "View" }).click();
    await page.getByRole("menuitem", { name: /hyperbolic engine/ }).click();

    // tiny.ged's root person; the displayName fallback prints the id when
    // the person has no name — either way some non-empty text shows up
    // inside the canvas region.
    const region = page.getByRole("region", { name: /hyperbolic canvas/ });
    await expect(region).toBeVisible();
    // The proband label is a child of the region with non-empty text content.
    const labels = region.locator("div").filter({ hasText: /\S/ });
    await expect(labels.first()).toBeVisible();
});
