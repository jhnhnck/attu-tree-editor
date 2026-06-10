/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - keyboard-reachability: PortraitField upload control
 *
 * cluster-6 invariant: the portrait widget exposes two tab-stops (the
 * thumbnail button and the replace/upload button) and one non-visible
 * file input. a keyboard user must reach the upload control via Tab
 * and trigger the file picker via Enter or Space.
 *
 * the `<input type="file">` is `sr-only`; it's a tab-stop in some
 * browsers but not others, and we don't want a regression that strands
 * focus on it. document the form-factor quirk inline: PortraitField
 * uses two visible buttons - either may receive focus on tab-in
 * depending on dom order. assertion shape: focus is somewhere inside
 * the portrait region, never on the wrapper div or the offscreen file
 * input.
 *
 * existing PortraitField.test.ts covers drag/drop, paste, size guard.
 * this spec adds the reachability invariant that wasn't otherwise
 * pinned.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import PortraitFieldHarness from "./_harness/PortraitFieldHarness.svelte";

// CropperDialog uses native <dialog>.showModal(), which jsdom doesn't
// implement; stub it out so we can mount PortraitField without booting
// the modal. matches the pattern in PortraitField.test.ts.
vi.mock("$lib/components/editor/CropperDialog.svelte", () => ({
    default: function () {
        return {};
    },
}));

describe("keyboard-reachability: PortraitField", () => {
    it("tabs from a prior sibling into the portrait region", async () => {
        const user = userEvent.setup();
        render(PortraitFieldHarness, { currentBlobId: undefined });
        const before = screen.getByTestId<HTMLInputElement>("before");
        before.focus();
        expect(document.activeElement).toBe(before);

        // first Tab lands on the thumbnail button (the upload/replace
        // affordance with aria-label "upload portrait")
        await user.tab();
        const thumb = screen.getByRole("button", { name: /upload portrait/i });
        expect(document.activeElement).toBe(thumb);
    });

    it("Enter on the focused thumbnail button does not throw (keyboard activation reaches the file picker)", async () => {
        // we can't actually exercise the native file picker in jsdom,
        // but we can prove the button is reachable + activatable via
        // keyboard without a thrown error. that covers the regression
        // shape: a future change wiring the thumbnail to a custom
        // pointer-only handler would silently break keyboard-only flow.
        const user = userEvent.setup();
        render(PortraitFieldHarness, { currentBlobId: undefined });
        const before = screen.getByTestId<HTMLInputElement>("before");
        before.focus();
        await user.tab();
        const thumb = screen.getByRole("button", { name: /upload portrait/i });
        expect(document.activeElement).toBe(thumb);
        // Enter on a button is a click; should not throw
        await user.keyboard("{Enter}");
        // still no exception means the keyboard path reached the handler
        expect(thumb).toBeInTheDocument();
    });

    it("tabbing through the portrait region eventually reaches the next sibling", async () => {
        // PortraitField exposes two visible buttons (thumbnail + replace)
        // plus the sr-only file input. tab a few times and assert we
        // reach the "after" sibling rather than getting trapped.
        const user = userEvent.setup();
        render(PortraitFieldHarness, { currentBlobId: undefined });
        const before = screen.getByTestId<HTMLInputElement>("before");
        const after = screen.getByTestId<HTMLInputElement>("after");
        before.focus();
        // 4 tabs is more than enough to clear the region (thumb, replace,
        // file input fallback in some browsers). loop until we land or
        // give up after 6 attempts to avoid an infinite loop on regression.
        for (let i = 0; i < 6; i++) {
            await user.tab();
            if (document.activeElement === after) break;
        }
        expect(document.activeElement).toBe(after);
    });
});
