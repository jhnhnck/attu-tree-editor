/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - keyboard-reachability skeleton (cluster-6 invariant)
 *
 * skeleton of the cluster-6 keyboard-reachability sweep. exercises a
 * single field (DateInput) inside a parent with sibling focusables, then
 * tabs in, types a printable key, tabs out, and re-tabs in to drive
 * ArrowDown into the picker. phase 6 expands this shape to the gender
 * select, AGAB toggle, parent picker, and portrait field, with one spec
 * per surface.
 *
 * historical regression target: 642766e "fix(inspector): make DateInput
 * keyboard-reachable on tab focus" - before that commit the field was
 * `readonly` until a pointer click, so tab focus reached the input but no
 * key could change its value or open the picker. the fix added onfocus
 * (drops to manual edit when focus did not originate from a pointerdown,
 * tracked via the `pointerFocus` flag) plus ArrowDown (opens the picker
 * from any non-picker mode).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import TabOrderHarness from "./_harness/TabOrderHarness.svelte";

describe("keyboard-reachability: DateInput", () => {
    it("tabs into the field from a prior sibling and lands focus on the input", async () => {
        const user = userEvent.setup();
        render(TabOrderHarness, { value: undefined, onchange: vi.fn() });
        const before = screen.getByTestId<HTMLInputElement>("before");
        const field = screen.getByRole<HTMLInputElement>("textbox", { name: /date/i });
        before.focus();
        expect(document.activeElement).toBe(before);
        await user.tab();
        expect(document.activeElement).toBe(field);
    });

    it("printable key after tab-focus mutates the input value (no readonly trap)", async () => {
        // pre-fix repro: the field stayed readonly on focus, so typing was
        // a no-op. post-fix: onfocus drops to manual edit when the focus
        // path did not start with a pointerdown, so the keystroke lands.
        const user = userEvent.setup();
        render(TabOrderHarness, { value: undefined, onchange: vi.fn() });
        const before = screen.getByTestId<HTMLInputElement>("before");
        const field = screen.getByRole<HTMLInputElement>("textbox", { name: /date/i });
        before.focus();
        await user.tab();
        expect(document.activeElement).toBe(field);
        // sanity: not readonly after keyboard focus
        expect(field).not.toHaveAttribute("readonly");
        await user.keyboard("5");
        expect(field.value).toContain("5");
    });

    it("tab forward from the field moves focus to the next sibling", async () => {
        const user = userEvent.setup();
        render(TabOrderHarness, { value: undefined, onchange: vi.fn() });
        const before = screen.getByTestId<HTMLInputElement>("before");
        const after = screen.getByTestId<HTMLInputElement>("after");
        before.focus();
        await user.tab(); // into field
        await user.tab(); // out of field
        expect(document.activeElement).toBe(after);
    });

    it("ArrowDown from a tab-focused field opens the picker dialog", async () => {
        const user = userEvent.setup();
        render(TabOrderHarness, {
            value: { era: "PC", year: 1700 },
            onchange: vi.fn(),
        });
        const before = screen.getByTestId<HTMLInputElement>("before");
        before.focus();
        await user.tab(); // into the date field
        expect(screen.queryByRole("dialog", { name: /calendar/i })).toBeNull();
        await user.keyboard("{ArrowDown}");
        expect(screen.getByRole("dialog", { name: /calendar/i })).toBeInTheDocument();
    });
});
