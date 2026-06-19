/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - toggle-indicator visible-state skeleton (cluster-3 invariant)
 *
 * skeleton of the cluster-3 toggle-indicator-visible-state sweep. mounts
 * a Menu with a single toggleable item, captures its dom in the off
 * state, flips `checked` to true via rerender, and asserts the rendered
 * outerHTML differs - i.e. the user can actually see which state the
 * toggle is in. phase 6 expands this shape to every `[role=menuitem]`
 * carrying a `checked` prop and every `[aria-pressed]` button in mounted
 * menus.
 *
 * historical regression targets:
 *   e9ea981 "fix(menu): tri-state toggle indicator so View > Overlays
 *           off-state reads" - View > Overlays toggles had no visible
 *           difference between on/off because both rendered identically
 *           (no check vs check); fix added the outlined Square off-state
 *           so the user can tell at a glance.
 *   73a9a53 "fix(debug): swap class set instead of overlaying so active
 *           toggle state actually shows" - same shape on the debug menu's
 *           active toggle.
 *
 * Menu items use `role="menuitem"`, not `role="menuitemcheckbox"` (the
 * tri-state is conveyed via the trailing icon, not aria semantics). the
 * plan calls out menuitemcheckbox / aria-pressed as the phase-6
 * targets - this skeleton is the smallest possible proxy: same
 * before/after-html assertion shape, just against the surface that
 * actually exists today.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import ToggleMenuHarness from "./_harness/ToggleMenuHarness.svelte";

async function openMenuAndGetItemHtml(): Promise<string> {
    const button = screen.getByRole("button", { name: /view/i });
    await fireEvent.click(button);
    await tick();
    await tick();
    const item = screen.getByRole("menuitem", { name: /path highlight/i });
    return item.outerHTML;
}

async function closeMenu(): Promise<void> {
    const button = screen.getByRole("button", { name: /view/i });
    await fireEvent.click(button);
    await tick();
}

describe("toggle-indicator visible-state", () => {
    it("a toggleable menuitem renders different dom in its off vs on states", async () => {
        // off state first
        const { rerender } = render(ToggleMenuHarness, { checked: false });
        const offHtml = await openMenuAndGetItemHtml();
        await closeMenu();

        // flip to on, re-open, snapshot again
        await rerender({ checked: true });
        const onHtml = await openMenuAndGetItemHtml();

        // the user-observable assertion: the two states must produce
        // different output. without the tri-state icon (e9ea981) both
        // strings would be identical and this assertion catches it.
        expect(offHtml).not.toEqual(onHtml);
    });

    it("off-state shows the outlined indicator and on-state shows the check (lucide svg delta)", async () => {
        // a slightly stronger shape than raw not-equal - the icon swap is
        // the specific visible-delta we shipped in e9ea981. if the icons
        // ever collapse back to one identifier the assertion will trip.
        const { rerender } = render(ToggleMenuHarness, { checked: false });

        const offHtml = await openMenuAndGetItemHtml();
        await closeMenu();
        await rerender({ checked: true });
        const onHtml = await openMenuAndGetItemHtml();

        // lucide icons render their family as a `lucide-<name>` class on
        // the svg, so the class set differs between the two states. we
        // don't pin specific class names here; the skeleton only asserts
        // that *some* lucide-class is present in each and the two sets
        // are not the same set.
        const offClasses = (offHtml.match(/lucide-[a-z-]+/g) ?? []).sort();
        const onClasses = (onHtml.match(/lucide-[a-z-]+/g) ?? []).sort();
        expect(offClasses.length).toBeGreaterThan(0);
        expect(onClasses.length).toBeGreaterThan(0);
        expect(offClasses).not.toEqual(onClasses);
    });
});
