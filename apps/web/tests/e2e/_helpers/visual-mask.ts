/*
 * FamilyTreeEditor - shared mask helper for visual golden tests.
 *
 * Every visual golden in the family-view suite masks the same set of
 * known-unstable regions: the toast container, the autosave status
 * pill, and the bottom-left people-count stats pill. Repeating those
 * three selectors in five specs invites drift. This helper collapses
 * them into one call site with a typed options object for golden-
 * specific overrides.
 *
 * Migration contract (phase 1, wave 2):
 *
 *   1. The default mask list is a strict superset of the per-golden
 *      rect-masks that exist today. Visual diffs after migration must
 *      be byte-identical OR strictly smaller (more masked, not less).
 *      `extra: [...]` adds golden-specific masks on top.
 *
 *   2. The helper is a *locator factory*, not a screenshot helper.
 *      Callers still own `toHaveScreenshot(name, { ... })` so per-
 *      golden tolerances (maxDiffPixels / maxDiffPixelRatio) stay
 *      explicit.
 *
 *   3. `omitDefaults` is the escape hatch when a specific golden wants
 *      to drop one of the defaults (e.g. when the autosave pill is
 *      already gone from the captured region's bbox). Use sparingly —
 *      every drop is a chance for a real regression to slip past.
 *
 * Usage:
 *
 *     await expect(region).toHaveScreenshot("foo.png", {
 *         maxDiffPixels: 100,
 *         mask: maskUnstableUI(page),
 *     });
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Locator, Page } from "@playwright/test";

/** Options for `maskUnstableUI`. */
export interface MaskOptions {
    /**
     * Locators to add on top of the defaults. Use for golden-specific
     * unstable regions (e.g. a tooltip that animates in for the
     * add-relative menu test).
     */
    readonly extra?: readonly Locator[];
    /**
     * Default-mask names to omit. Strongly discouraged — every omitted
     * default is a hole where a real regression can land.
     */
    readonly omitDefaults?: ReadonlySet<MaskName>;
}

/** Names of the built-in defaults so callers can omit them by name. */
export type MaskName = "toasts" | "saveStatusPill" | "statsPill";

/**
 * Compose the standard set of visual-golden masks for the family-view
 * surface. Order is irrelevant (playwright treats `mask` as a set), but
 * the list is sorted by visual-prominence so reviewers reading the
 * diff context know which one likely caught a regression.
 */
export function maskUnstableUI(page: Page, opts: MaskOptions = {}): Locator[] {
    const omit = opts.omitDefaults ?? new Set<MaskName>();
    const defaults: Locator[] = [];
    if (!omit.has("toasts")) {
        // The toast container scrolls in on import and animates out a
        // few seconds later. Always mask it — the "loaded N people"
        // toast is the most common false-positive source.
        defaults.push(page.locator('[role="alert"]'));
    }
    if (!omit.has("saveStatusPill")) {
        // Autosave pill text drifts between "Saving…" and "Saved · just
        // now" depending on test timing. The `.save-status-pill` class
        // is set on the wrapper.
        defaults.push(page.locator(".save-status-pill"));
    }
    if (!omit.has("statsPill")) {
        // Bottom-left people-count pill ("1802 people · 4 clusters")
        // varies by fixture and animates in once layout-stats arrive.
        // Targeted via the people-count button's accessible name.
        defaults.push(page.getByRole("button", { name: /people/ }));
    }
    const extras = opts.extra ?? [];
    return [...defaults, ...extras];
}
