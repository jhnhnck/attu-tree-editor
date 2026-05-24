/*
 * FamilyTreeEditor - redraw-on-save regression e2e.
 *
 * Reproduces the headline Phase 0 bug: before the fix, the layout worker's
 * cache key keyed off `tree.rev` (which the store never bumped), so the
 * worker would echo the stale `placed` graph and topology edits never made
 * it to the canvas. After the fix, the canvas badge ("N people · X+Y
 * clusters") and the inspector heading reflect the new person without a
 * page reload.
 *
 * Why the badge instead of card count: small viewports (the mobile project)
 * collapse newly unattached people into a cluster glyph rather than a
 * standalone card, so a count of [data-person-id] elements isn't a
 * portable assertion. The badge is the worker-driven "people count" from
 * the freshly emitted PlacedGraph, which is precisely what the cache fix
 * is supposed to update.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { importViaWizard } from "./_helpers/importViaWizard";

const TINY = resolve(process.cwd(), "tests/fixtures/tiny.ged");

test.beforeEach(async ({ page }) => {
    // Phase 0 family-view flipped the default; this regression-check
    // asserts the layered worker-driven "N people" badge so pin layered.
    await page.addInitScript(() => {
        try {
            localStorage.setItem("fte.defaultEngine", "layered");
        } catch {
            /* non-fatal */
        }
    });
});

test("adding an unattached person updates the canvas badge without a reload", async ({ page }) => {
    await page.goto("/");

    // Load a known small fixture so we have a deterministic baseline.
    await importViaWizard(page, TINY);
    await expect(page.getByText(/imported \d+ people/)).toBeVisible();

    // tiny.ged has 3 people; the canvas badge should reflect that.
    await expect(page.getByRole("button", { name: /^3 people/ })).toBeVisible();

    // Trigger "Add unattached person" via the menu (stable across viewports).
    await page.getByRole("button", { name: "Insert" }).click();
    await page.getByRole("menuitem", { name: "Add unattached person" }).click();

    // The badge must update to 4. Before the cache-key fix, this assertion
    // failed: the tree state had 4 people but the layout worker echoed its
    // cached 3-person PlacedGraph and the badge stayed at 3.
    await expect(page.getByRole("button", { name: /^4 people/ })).toBeVisible({
        timeout: 5_000,
    });
});
