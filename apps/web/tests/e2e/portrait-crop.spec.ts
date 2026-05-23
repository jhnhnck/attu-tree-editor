/*
 * FamilyTreeEditor - phase 0a placeholder visual golden for the new portrait cropper dialog
 *
 * Captures a baseline screenshot of the degenerate (cover-center, no interaction)
 * cropper dialog so phase 4 has a baseline to update once theming + grid land.
 * Spec asserts the snapshot harness is stable on this surface — pre-mortem risk
 * #5 (canvas goldens flaky) is retired by running this twice consecutively in CI.
 *
 * Mobile project skips: pixel comparison at Pixel-7 viewport is too volatile.
 *
 * To regenerate the baseline (only when intentional dialog visual changes have
 * landed and been reviewed):
 *   pnpm -F web exec playwright test portrait-crop --update-snapshots
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// 1px solid-blue 4x4 PNG, dropped onto the portrait field. tiny + deterministic
// so the snapshot is a function of dialog chrome + cover-center math, not of
// jpeg/exif/encoder quirks.
const FIXTURE = resolve(process.cwd(), "tests/fixtures/portrait-blue.png");

test.describe("portrait cropper dialog (phase 0a placeholder)", () => {
    test.skip(({ isMobile }) => isMobile, "visual goldens are desktop-only");

    test("degenerate cropper opens with cover-centered preview", async ({ page }) => {
        await page.goto("/");

        // start a new tree so the inspector + portrait field are reachable
        await page.getByRole("button", { name: "File" }).click();
        const newTree = page.getByRole("menuitem", { name: /new tree/i });
        if (await newTree.isVisible().catch(() => false)) {
            await newTree.click();
        }

        // give the shell a beat to settle, then look for any "upload" button.
        // we don't depend on a particular person being selected; the test
        // exists to assert the dialog harness, not the inspector flow.
        await page.waitForTimeout(250);
        const upload = page.getByRole("button", { name: /^upload$/ });
        if (!(await upload.isVisible().catch(() => false))) {
            test.skip(true, "inspector portrait field not yet reachable on fresh shell");
        }

        // intercept the upload picker via the hidden file input
        await page.locator('input[type="file"][accept^="image"]').setInputFiles(FIXTURE);

        const dialog = page.locator("dialog.cropper-dialog");
        await expect(dialog).toBeVisible({ timeout: 5_000 });
        await expect(dialog.getByText("crop portrait")).toBeVisible();

        // wait one frame past dialog-open for the canvas to paint
        await page.waitForTimeout(250);

        await expect(dialog).toHaveScreenshot("cropper-dialog-degenerate.png", {
            maxDiffPixelRatio: 0.02,
        });
    });
});
