/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - keyboard-reachability: parent picker (PersonChooser)
 *
 * cluster-6 invariant: opening the "add parent" affordance via keyboard
 * must land focus inside the chooser popover (specifically on its
 * search input, per PersonChooser.onMount). a regression that fails
 * to autofocus the search input would leave the user keyboard-stuck on
 * the trigger button after Enter, with no visible cursor in the
 * just-opened dialog.
 *
 * the chooser is a custom popover: tab-in lands on the trigger button
 * (not the search input), Enter on the trigger opens the dialog, and
 * focus moves into the dialog only after the onMount tick fires.
 * documented inline below.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import userEvent from "@testing-library/user-event";
import ParentPickerHarness from "./_harness/ParentPickerHarness.svelte";
import type { Person, Tree } from "$lib/domain/types";

function person(over: Partial<Person> = {}): Person {
    return {
        id: "AAAAA",
        given: "Alpha",
        surname: "X",
        gender: "m",
        spouseIds: [],
        display: "z1",
        ...over,
    };
}

function tinyTree(): { tree: Tree; subject: Person } {
    const subject = person({ id: "AAAAA" });
    const mum = person({ id: "MMMMM", given: "Mum", surname: "X", gender: "f" });
    const tree: Tree = {
        id: "t",
        name: "T",
        rootId: "AAAAA",
        people: { AAAAA: subject, MMMMM: mum },
        couples: [],
        editRev: 0,
        updatedAt: 0,
    };
    return { tree, subject };
}

describe("keyboard-reachability: parent picker", () => {
    it("Enter on the 'add parent' trigger opens the chooser popover", async () => {
        const user = userEvent.setup();
        const { tree, subject } = tinyTree();
        render(ParentPickerHarness, { tree, person: subject });

        const trigger = screen.getByRole("button", { name: /add parent/i });
        trigger.focus();
        expect(document.activeElement).toBe(trigger);

        // keyboard activation - Enter must open the dialog the same as click
        await user.keyboard("{Enter}");
        // chooser dialog renders with "add parent" title
        expect(screen.getByRole("dialog", { name: /add parent/i })).toBeInTheDocument();
    });

    it("opening the chooser moves focus into the popover's search input", async () => {
        // the tab-in assertion for a custom combobox/popover: after the
        // chooser opens, the autofocus inside PersonChooser.onMount should
        // land focus on the inner search input, not leave it stranded on
        // the trigger. this is the keyboard-stuck regression we want to
        // catch.
        const user = userEvent.setup();
        const { tree, subject } = tinyTree();
        render(ParentPickerHarness, { tree, person: subject });

        const trigger = screen.getByRole("button", { name: /add parent/i });
        trigger.focus();
        await user.keyboard("{Enter}");

        // PersonChooser autofocuses its search input via onMount + tick;
        // give it a tick to settle.
        await tick();
        await tick();

        const search = screen.getByRole<HTMLInputElement>("textbox", { name: /search people/i });
        expect(document.activeElement).toBe(search);
    });

    it("Escape inside the chooser closes the popover", async () => {
        const user = userEvent.setup();
        const { tree, subject } = tinyTree();
        render(ParentPickerHarness, { tree, person: subject });

        const trigger = screen.getByRole("button", { name: /add parent/i });
        trigger.focus();
        await user.keyboard("{Enter}");
        expect(screen.getByRole("dialog", { name: /add parent/i })).toBeInTheDocument();

        await tick();
        await tick();
        await user.keyboard("{Escape}");
        // dialog should be torn down on escape
        expect(screen.queryByRole("dialog", { name: /add parent/i })).toBeNull();
    });
});
