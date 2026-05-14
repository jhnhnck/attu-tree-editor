/*
 * FamilyTreeEditor - Phase 5 family-view visual golden: Akarians DEMO at fit zoom.
 *
 * The Phase 5 DoD asks for goldens at Akarians DEMO + a smaller fixture
 * so generation banding (badges) / portrait fallback (silhouettes) /
 * era-underline (century-banded HSL) are caught by regression. This
 * spec covers the Akarians-fit-zoom case; `visual-multi-union.spec.ts`
 * + `visual-path-highlight.spec.ts` + `visual-add-relative.spec.ts`
 * already cover the smaller-fixture cases at higher zoom so the
 * decorator's silhouette + underline are readable in the snapshot.
 *
 * Phase 5 also reserves the four card corners + two centred edges for
 * affordances (see Phase 4 revision in `notes/plans/family-view.md`).
 * If a future change shifts a slot, this golden is the first place
 * the regression shows up.
 *
 * To regenerate the baseline (only when an intentional change has
 * landed and been reviewed):
 *   pnpm -F web exec playwright test visual-akarians-family-view --update-snapshots
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const AKARIANS = resolve(process.cwd(), "tests/fixtures/Akarians.ged");

test.describe("family-view visual golden — Akarians DEMO", () => {
    test.skip(({ isMobile }) => isMobile, "visual goldens are desktop-only");

    test.beforeEach(async ({ page }) => {
        // Phase 0 already defaults to family-view, but pin explicitly so
        // a future plan revision doesn't silently flip this back.
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

    test("Akarians DEMO renders family-view at fit zoom", async ({ page }) => {
        // 1,802-person ged takes a few seconds to parse + lay out; budget for it.
        test.setTimeout(90_000);

        await page.goto("/");
        await page.locator('[data-testid="import-input"]').setInputFiles(AKARIANS);
        await expect(page.getByText(/loaded \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("region", { name: /family view canvas/ });
        await expect(region).toBeVisible();
        const cards = page.locator("[data-person-id]");
        await expect(cards.first()).toBeVisible();

        // The bounded family-view subset is small (~20 cards on Akarians),
        // so we don't need a separate "layout settled" gate beyond the
        // first card becoming visible. Wait one frame past for paint.
        await page.waitForTimeout(500);

        await expect(region).toHaveScreenshot("akarians-family-view.png", {
            maxDiffPixelRatio: 0.02,
            mask: [
                page.locator('[role="alert"]'),
                page.locator(".save-status-pill"),
                page.getByRole("button", { name: /people/ }),
            ],
        });
    });
});
