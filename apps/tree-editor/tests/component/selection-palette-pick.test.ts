/*
 * FamilyTreeEditor - selection state-machine invariant: command-palette
 * person-pick lands in the real selection store.
 *
 * Phase-0 walking-skeleton spec for the cluster-5 selection-state-machine
 * suite. The historical bug: a palette person-pick closed the palette
 * but the selection store did not reflect the picked id (and the canvas
 * re-centred on the previous selection - see `notes/bugs.md` 26 May 2026
 * "command-palette / find-person pick closed the palette but the canvas
 * re-centred on the previous selection"). The invariant that catches
 * any regression of that shape: after the user picks a person from the
 * palette, `selection.selectedPersonId === pickedId`.
 *
 * This test exercises the *real* `selectionStore` and `treeStore` - the
 * pre-mortem flagged that mocking the controller defeats the bug-catching
 * value, since the bug lives in the wiring between the palette item's
 * action callback and the store write.
 *
 * Phase 3 expands this to every entry point (canvas click, context menu,
 * more-actions, deep-link, reload) and every column of the invariant
 * (`selection.id === id` && `inspector.header.name === person(id).name` &&
 * `canvas.focusedPersonId === id`). Phase 0 covers one path - palette
 * pick by id - to prove the skeleton shape.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { CommandPalette } from "@attu/ui";
import type { PaletteItem } from "@attu/ui";
import { createSelectionStore } from "$lib/state/selection.svelte";
import { createTreeStore } from "$lib/state/tree.svelte";
import { eightPersonFamily } from "../fixtures/layered-bug-repros";

beforeAll(() => {
    // palette uses scrollIntoView after arrow-key nav; jsdom stubs it as
    // missing. matches the polyfill in CommandPalette.test.ts.
    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = vi.fn();
    }
});

describe("selection state-machine: command-palette person-pick", () => {
    it("typing `#<id>` and pressing Enter lands the id in the real selection store", async () => {
        // real stores - the bug we're pinning lives in wiring, not in
        // store internals, so mocking either defeats the test
        const treeStore = createTreeStore(eightPersonFamily());
        const selection = createSelectionStore();
        const tree = treeStore.tree;

        // pick a non-root person so a null/undefined selection (the bug
        // shape) is distinguishable from the default
        const pickIds = Object.keys(tree.people).filter((id) => id !== tree.rootId);
        const pickId = pickIds[0];
        if (!pickId) throw new Error("fixture missing non-root people");

        // build person items wiring each action directly into selection.select(id).
        // this is the exact contract the historical bug broke: if the palette
        // calls action() the store is written; if it doesn't, the test fails.
        const items: PaletteItem[] = Object.values(tree.people).map(
            (p): PaletteItem => ({
                id: p.id,
                label: [p.given, p.surname].filter(Boolean).join(" ").trim() || "(unnamed)",
                detail: p.id,
                kind: "person",
                action: () => {
                    selection.select(p.id);
                },
            }),
        );

        let paletteClosed = false;
        render(CommandPalette, {
            items,
            mode: "anything",
            onclose: () => {
                paletteClosed = true;
            },
        });

        const input = screen.getByLabelText<HTMLInputElement>("palette search");
        // `#<id>` is the by-id lookup path; pick by typed id is the most
        // deterministic path through the palette - no fuzzy-rank dependency
        await fireEvent.input(input, { target: { value: `#${pickId}` } });
        await fireEvent.keyDown(input, { key: "Enter" });

        // the invariant: store reflects the picked id
        expect(selection.selectedPersonId).toBe(pickId);
        // palette drives its own close on pick (calls onclose before action)
        expect(paletteClosed).toBe(true);
    });
});
