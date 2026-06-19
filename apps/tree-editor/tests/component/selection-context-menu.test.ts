/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - selection state-machine invariant: right-click a
 * canvas card opens the context menu; clicking any context-menu entry
 * lands the right-clicked person's id in the real selection store.
 *
 * App.svelte's context-menu wiring is two-stage: the canvas's
 * `oncontextmenu(id, x, y)` only stashes `{ personId, x, y }` - opening
 * the menu does NOT change selection on its own. every concrete menu
 * item (edit person, edit connections, add parent, ...) eventually calls
 * `focusPerson(personId)` which writes to `selection.select(...)`. that
 * is the invariant under test: picking any item resolves to the
 * right-clicked person, not the previously-selected one.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { fireEvent, render, screen } from "@testing-library/svelte";

import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
import { ContextMenu } from "@attu/ui";
import type { ContextMenuItem } from "@attu/ui";
import { createSelectionStore } from "$lib/state/selection.svelte";
import { createTreeStore } from "$lib/state/tree.svelte";
import type { PersonId } from "$lib/domain/types";

import { loadGedcomFixture } from "./_harness/loadGedcomFixture";
import { mountWithHostRect } from "./_harness/mountWithHostRect";

describe("selection state-machine: context menu", () => {
    beforeEach(() => {
        if (!Element.prototype.scrollIntoView) {
            Element.prototype.scrollIntoView = vi.fn();
        }
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("right-click on a card opens the context menu wired to that card's id", async () => {
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        const treeStore = createTreeStore(tree);
        const selection = createSelectionStore();

        // App-shape: oncontextmenu receives (id, x, y) and stashes it.
        // capture the id the canvas reports so the assertion sees the
        // exact path-from-card-to-state that App.svelte runs in prod.
        let stashed: { personId: PersonId; x: number; y: number } | undefined;

        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: {
                tree: treeStore.tree,
                selectedId: selection.selectedPersonId,
                onselect: (id: PersonId) => selection.select(id),
                oncontextmenu: (id: PersonId, x: number, y: number) => {
                    stashed = { personId: id, x, y };
                },
            },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const cards = handle.container.querySelectorAll<HTMLElement>("[data-person-id]");
        const rootId = treeStore.tree.rootId;
        const targetCard = Array.from(cards).find(
            (c) => c.dataset.personId && c.dataset.personId !== rootId,
        );
        expect(targetCard, "fixture must expose a non-root card").toBeDefined();
        const targetId = targetCard!.dataset.personId as PersonId;

        // PersonNode's oncontextmenu handler calls `e.preventDefault()` then
        // forwards (id, x, y). fireEvent.contextMenu drives that handler.
        await fireEvent.contextMenu(targetCard!);
        await tick();

        // contract-step 1: the canvas reported the right-clicked card's id
        expect(stashed?.personId).toBe(targetId);

        // contract-step 2: opening the menu must NOT have changed selection -
        // App.svelte deliberately defers the write until an item is clicked
        expect(selection.selectedPersonId).toBeUndefined();

        handle.unmount();
    });

    it("clicking a context-menu item routes the right-clicked id into the selection store", async () => {
        // mirror App.svelte's `menuItems(personId)` wiring: each entry is a
        // closure over the right-clicked personId. we exercise the menu
        // surface (ContextMenu.svelte) directly with the same shape - the
        // canvas-side of the contract is covered by the case above.
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        const treeStore = createTreeStore(tree);
        const selection = createSelectionStore();

        // pre-existing selection on a different person - the invariant says
        // the menu pick must overwrite this, not preserve it
        const rootId = treeStore.tree.rootId;
        const ids = Object.keys(treeStore.tree.people);
        const targetId: PersonId | undefined = ids.find((id) => id !== rootId);
        if (!targetId) throw new Error("fixture must expose >= 2 people");
        selection.select(rootId);

        // shape matches App.svelte's `menuItems(personId)`: first entry is
        // "edit person" -> focusPerson(personId, "personal") -> selection.select
        const items: ContextMenuItem[] = [
            {
                label: "edit person",
                onclick: () => selection.select(targetId),
            },
        ];
        let closed = false;
        render(ContextMenu, {
            x: 100,
            y: 100,
            items,
            onclose: () => {
                closed = true;
            },
        });

        const editBtn = screen.getByRole("menuitem", { name: /edit person/i });
        await fireEvent.click(editBtn);

        // primary invariant: store now reflects the menu's anchor person
        expect(selection.selectedPersonId).toBe(targetId);
        // sanity: menu fired its onclose contract (catches a regression
        // where a click silently no-ops without closing)
        expect(closed).toBe(true);

        // header-readiness: the picked id resolves to a Person in the tree
        expect(treeStore.tree.people[targetId]).toBeDefined();
    });
});
