/*
 * FamilyTreeEditor - e2e helper: dismiss the inspector sheet on mobile.
 *
 * On narrow viewports (<= 600px, e.g. the Pixel 7 device profile) the
 * inspector renders as a bottom-anchored sheet (`isSheet` branch in
 * Inspector.svelte) that overlaps the canvas and the View-menu dropdown
 * column. Specs that (a) click a card, then (b) need to reach the View
 * menu or a second canvas target hit pointer-event interception from the
 * sheet's portrait-placeholder block.
 *
 * The fix is to close the inspector between the two interactions on
 * mobile only. On desktop the inspector is a docked side panel that
 * doesn't intercept canvas pointers, so the close is a no-op there.
 *
 * Usage:
 *
 *     await closeInspectorIfMobile(page, isMobile);
 *
 * The helper waits for the close button to be visible before clicking;
 * it does NOT assert presence when there is no selection (the empty-
 * state inspector also has a close button, but specs typically only
 * need to dismiss the populated sheet after selecting a person).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { expect, type Page } from "@playwright/test";

/**
 * Close the inspector sheet on mobile so subsequent canvas / menu-bar
 * clicks aren't intercepted by the bottom-anchored overlay. No-op on
 * desktop where the inspector is a docked side panel.
 *
 * If the inspector isn't mounted (e.g. transient state during an engine
 * swap where the canvas remounts), this is a no-op — the next caller's
 * click will hit the canvas / menu directly without interception.
 */
export async function closeInspectorIfMobile(page: Page, isMobile: boolean): Promise<void> {
    if (!isMobile) return;
    // locate the inspector aside directly via its aria-label; the implicit
    // role of `<aside>` varies between browsers and playwright versions, so
    // `getByLabel` against the literal attribute is more reliable.
    const inspector = page.locator('[aria-label="person inspector"]');
    const inspectorCount = await inspector.count();
    if (inspectorCount === 0) return;
    const closeBtn = inspector.getByRole("button", { name: "close inspector" }).first();
    // not every render of the inspector exposes a close button visible to
    // playwright on mobile (e.g. during the brief window between engine
    // swap and re-paint); a missing button means there's no sheet to
    // intercept the next click, so silently return.
    if ((await closeBtn.count()) === 0) return;
    if (!(await closeBtn.isVisible())) return;
    await closeBtn.click();
    // give the sheet's unmount a moment to settle before the caller's
    // next interaction. polling rather than a fixed sleep so fast paints
    // don't wait the full timeout.
    await expect(inspector).toHaveCount(0, { timeout: 2_000 });
}
