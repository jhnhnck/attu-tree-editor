/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - keyboard-reachability: gender identity field
 *
 * follows the cluster-6 invariant shape: sandwiches the gender identity
 * text-input (the "type-or-pick" combobox backed by a <datalist>) between
 * two sibling inputs, tabs in, types, and tabs out. catches future
 * regressions where the field becomes readonly, blurs back to sibling,
 * or otherwise eats the keystroke.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import GenderFieldHarness from "./_harness/GenderFieldHarness.svelte";

// the gender identity input carries a `list` attribute (datalist preset
// dropdown), which promotes its ARIA role from "textbox" to "combobox".
// query by combobox role so the spec talks to the real surface.
describe("keyboard-reachability: gender identity", () => {
    it("tabs into the field from a prior sibling and lands focus on the input", async () => {
        const user = userEvent.setup();
        render(GenderFieldHarness, { onblur: vi.fn() });
        const before = screen.getByTestId<HTMLInputElement>("before");
        const field = screen.getByRole<HTMLInputElement>("combobox", { name: /gender identity/i });
        before.focus();
        expect(document.activeElement).toBe(before);
        await user.tab();
        expect(document.activeElement).toBe(field);
    });

    it("printable key after tab-focus mutates the input value", async () => {
        const user = userEvent.setup();
        render(GenderFieldHarness, { onblur: vi.fn() });
        const before = screen.getByTestId<HTMLInputElement>("before");
        const field = screen.getByRole<HTMLInputElement>("combobox", { name: /gender identity/i });
        before.focus();
        await user.tab();
        expect(document.activeElement).toBe(field);
        // sanity: text inputs default to not-readonly; assertion keeps a future
        // accidental readonly={true} from sneaking through
        expect(field).not.toHaveAttribute("readonly");
        await user.keyboard("nb");
        expect(field.value).toContain("nb");
    });

    it("tab forward from the field moves focus to the next sibling", async () => {
        const user = userEvent.setup();
        render(GenderFieldHarness, { onblur: vi.fn() });
        const before = screen.getByTestId<HTMLInputElement>("before");
        const after = screen.getByTestId<HTMLInputElement>("after");
        before.focus();
        await user.tab(); // into the gender field
        await user.tab(); // out of the gender field
        expect(document.activeElement).toBe(after);
    });

    it("tab-out triggers the blur commit hook", async () => {
        // pairs auto-commit-on-blur with the keyboard-only flow: a user
        // who never touches the mouse must still see their typed value
        // reach onblur on tab-out.
        const user = userEvent.setup();
        const onblur = vi.fn();
        render(GenderFieldHarness, { onblur });
        const before = screen.getByTestId<HTMLInputElement>("before");
        before.focus();
        await user.tab();
        await user.keyboard("agender");
        await user.tab();
        expect(onblur).toHaveBeenCalled();
        expect(onblur.mock.calls.at(-1)?.[0]).toBe("agender");
    });
});
