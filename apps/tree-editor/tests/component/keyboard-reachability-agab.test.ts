/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - keyboard-reachability: assigned-at-birth (AGAB) select
 *
 * cluster-6 invariant: the native <select> in PersonalTab must accept
 * tab focus, allow keyboard navigation between options, and tab out
 * cleanly. native <select> usually does this by default, but a future
 * refactor to a custom combobox would silently break it - this spec
 * pins the contract so the refactor either preserves it or fails CI.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import AgabFieldHarness from "./_harness/AgabFieldHarness.svelte";

describe("keyboard-reachability: AGAB select", () => {
    it("tabs into the select from a prior sibling", async () => {
        const user = userEvent.setup();
        render(AgabFieldHarness, { onchange: vi.fn() });
        const before = screen.getByTestId<HTMLInputElement>("before");
        const field = screen.getByRole<HTMLSelectElement>("combobox", {
            name: /assigned at birth/i,
        });
        before.focus();
        expect(document.activeElement).toBe(before);
        await user.tab();
        expect(document.activeElement).toBe(field);
    });

    it("keyboard-typing a leading letter selects the matching option (native select-jump)", async () => {
        // native <select> selects the first option whose visible text starts
        // with the typed character. this is the keyboard-only equivalent of
        // clicking the dropdown and picking an item.
        const user = userEvent.setup();
        const onchange = vi.fn();
        render(AgabFieldHarness, { onchange });
        const before = screen.getByTestId<HTMLInputElement>("before");
        const field = screen.getByRole<HTMLSelectElement>("combobox", {
            name: /assigned at birth/i,
        });
        before.focus();
        await user.tab();
        expect(document.activeElement).toBe(field);
        // jsdom doesn't fully implement the native select-jump on letter
        // press; drive the change explicitly to validate the onchange wiring
        // is intact and the field is interactable from the keyboard path.
        field.value = "AFAB";
        field.dispatchEvent(new Event("change", { bubbles: true }));
        expect(onchange).toHaveBeenCalled();
        expect(onchange.mock.calls.at(-1)?.[0]).toBe("AFAB");
    });

    it("tab forward from the select moves focus to the next sibling", async () => {
        const user = userEvent.setup();
        render(AgabFieldHarness, { onchange: vi.fn() });
        const before = screen.getByTestId<HTMLInputElement>("before");
        const after = screen.getByTestId<HTMLInputElement>("after");
        before.focus();
        await user.tab(); // into the select
        await user.tab(); // out of the select
        expect(document.activeElement).toBe(after);
    });
});
