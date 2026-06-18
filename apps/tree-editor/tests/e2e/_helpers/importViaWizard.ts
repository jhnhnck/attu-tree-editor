/*
 * FamilyTreeEditor - e2e helper: open the ImportWizard via Mod+I, drop a
 * file via the wizard's browse input, click Import. Replaces the old
 * hidden-input silent-import path that was removed in the
 * import-wizard-and-family-echo plan.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { expect, type Page } from "@playwright/test";

/**
 * Drive the import wizard end-to-end for a single file. Convenience for
 * the many e2e specs that previously used the silent `import-input` path.
 */
export async function importViaWizard(page: Page, file: string): Promise<void> {
    await page.keyboard.press("Control+I");
    const wizard = page.locator('[data-testid="import-wizard"]');
    await expect(wizard).toBeVisible();
    await wizard.locator('[data-testid="import-browse"]').setInputFiles(file);
    await expect(wizard.locator('[data-testid="import-row"]').first()).toBeVisible();
    await wizard.locator('[data-testid="import-confirm-wrap"] button').click();
    await expect(wizard).toBeHidden();
}
