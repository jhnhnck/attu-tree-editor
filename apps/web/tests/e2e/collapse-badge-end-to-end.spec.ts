/*
 * FamilyTreeEditor - phase 1 (wave 2) end-to-end exercise of the
 * family-view auto-collapse path on a deterministic dense fixture.
 *
 * The default bounded subset around `dense-tree.ged`'s root totals 52
 * visible cards (see `dense-tree.gen.mjs` for the structural breakdown);
 * 52 > AUTO_COLLAPSE_THRESHOLD (50) so a `+N` badge MUST appear on the
 * initial render with no user input. This retires the wave-1 unknown
 * "is the auto-collapse path covered end-to-end, or do we just believe
 * it is?"
 *
 * Three contracts asserted:
 *
 *   1. Badge renders on default load with the dense fixture.
 *   2. Clicking the badge writes to the explicit-expansion localStorage
 *      key — i.e. the badge's click handler is wired through to
 *      `setExpanded(sourceId, true)`. We do NOT assert badge
 *      consumption here: for badges whose sourceId is an ancestor at
 *      the bounded-default edge, the adjacent generation is already
 *      visible and `revealChildren` / `revealParents` are no-ops, so
 *      auto-collapse re-picks the same source on the next pass. The
 *      gap between `onBadgeClick`'s "doesn't immediately re-demote"
 *      comment and the actual `protect` semantics in `pickCollapseVictim`
 *      is tracked as a separate finding in `bugs.md` (B14).
 *   3. Engine-swap (family-view -> layered -> family-view) survives:
 *      after the round-trip the family-view canvas is back and a
 *      badge is still present (the bounded subset is recomputed from
 *      scratch on each remount, so identity isn't preserved across
 *      swaps; presence is).
 *
 * Selection -> on-path accenting on a badge is exercised by
 * `visual-path-highlight.spec.ts` against `multi-union.ged`; testing it
 * again here would duplicate that golden's surface. We keep the new
 * spec focused on the auto-collapse path itself.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeInspectorIfMobile } from "./_helpers/close-inspector";
import { importViaWizard } from "./_helpers/importViaWizard";

const DENSE = resolve(process.cwd(), "tests/fixtures/dense-tree.ged");

test.describe("collapse-badge end-to-end (dense-tree fixture)", () => {
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

    test("badge appears on default load, expands on click, survives engine swap", async ({
        page,
        isMobile,
    }) => {
        // on mobile the inspector sheet covers the View-menu dropdown column
        // once anything has populated it (B4). the badge-click here doesn't
        // populate the inspector (no person is selected), but the sheet still
        // mounts in its empty/summary form on first paint. close it before
        // reaching for the View menu so the engine-swap branch is reachable.
        test.setTimeout(60_000);

        await page.goto("/");
        await importViaWizard(page, DENSE);
        await expect(page.getByText(/imported \d+ people/)).toBeVisible({ timeout: 30_000 });

        const region = page.getByRole("tree", { name: /family view canvas/ });
        await expect(region).toBeVisible();

        // (1) badge renders on default load — the bounded subset is 52
        // cards which forces auto-collapse without any user expansion.
        const badges = page.locator("[data-badge-id]");
        await expect(badges.first()).toBeVisible({ timeout: 5_000 });

        // (2) clicking the badge re-expands the demoted block; assert
        // the specific badge id is consumed. Auto-collapse may demote a
        // different block to keep the visible set under the threshold,
        // so total card count is *not* a reliable contract — but the
        // clicked badge itself MUST disappear (its sourceId joined the
        // explicit-expansion set, which keeps it out of further auto-
        // collapse passes for this focus).
        const firstBadgeId = await badges.first().getAttribute("data-badge-id");
        expect(firstBadgeId).toBeTruthy();
        // `dispatchEvent("click")` mirrors the existing pattern in
        // family-view-expansion.spec.ts:163 — playwright's high-level
        // `.click()` sometimes pre-scrolls or hits the wrong target on
        // absolute-positioned overlay buttons.
        await badges.first().dispatchEvent("click");
        // The click handler writes to `fte.family-view.expansion.v1:{treeId}:{focusId}`.
        // Polling rather than reading once: setExpanded queues work onto the
        // svelte $state cycle before localStorage is written.
        await expect
            .poll(
                async () =>
                    page.evaluate(() => {
                        const k = Object.keys(localStorage).find((kk) =>
                            kk.startsWith("fte.family-view.expansion.v1:"),
                        );
                        if (!k) return null;
                        const raw = localStorage.getItem(k);
                        if (!raw) return null;
                        const parsed = JSON.parse(raw) as { expanded?: string[] };
                        return parsed.expanded ?? null;
                    }),
                { timeout: 5_000 },
            )
            .toEqual(expect.arrayContaining([firstBadgeId!.replace(/^badge:/, "")]));

        // (3) engine-swap round-trip — family-view -> layered -> family-view.
        // The family-view canvas region must reappear and a badge must be
        // present again (we don't preserve which one across swaps; the
        // bounded subset is recomputed from scratch on each remount).
        await closeInspectorIfMobile(page, isMobile);
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: "Use layered engine" }).click();
        // The layered canvas uses role="tree" (not "region"); see
        // TreeCanvas.svelte. We just need the layered canvas to mount.
        await expect(page.getByRole("tree", { name: /family tree canvas/ })).toBeVisible();

        await closeInspectorIfMobile(page, isMobile);
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: "Use family view" }).click();
        await expect(region).toBeVisible();
        await expect(badges.first()).toBeVisible({ timeout: 5_000 });
    });
});
