/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - selection state-machine invariant: clicking a
 * `[data-person-id]` card on the canvas lands the picked id in the real
 * selection store. mirrors App.svelte's `FamilyViewCanvas onselect={(id)
 * => selection.select(id)}` wiring; the invariant catches any regression
 * that breaks the card-click -> store path.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { fireEvent } from "@testing-library/svelte";

import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
import { createSelectionStore } from "$lib/state/selection.svelte";
import { createTreeStore } from "$lib/state/tree.svelte";
import type { PersonId } from "$lib/domain/types";

import { loadGedcomFixture } from "./_harness/loadGedcomFixture";
import { mountWithHostRect } from "./_harness/mountWithHostRect";

describe("selection state-machine: canvas card click", () => {
    beforeEach(() => {
        // family-view's selection effect calls scrollIntoView; jsdom omits it
        if (!Element.prototype.scrollIntoView) {
            Element.prototype.scrollIntoView = vi.fn();
        }
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("clicking a non-focus card writes that card's id to the real selection store", async () => {
        // real stores - the wire we care about (card click -> onselect ->
        // selection.select) is the bug surface; mocking either store hides
        // any regression that breaks the propagation contract
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        const treeStore = createTreeStore(tree);
        const selection = createSelectionStore();

        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: {
                tree: treeStore.tree,
                selectedId: selection.selectedPersonId,
                onselect: (id: PersonId) => selection.select(id),
                ondeselect: () => selection.select(undefined),
            },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const cards = handle.container.querySelectorAll<HTMLElement>("[data-person-id]");
        expect(cards.length, "expected the canvas to mount at least one card").toBeGreaterThan(0);

        // pick a non-root card so a null/undefined selection (the bug shape)
        // is distinguishable from "fell back to the rootId default"
        const rootId = treeStore.tree.rootId;
        const targetCard = Array.from(cards).find(
            (c) => c.dataset.personId && c.dataset.personId !== rootId,
        );
        expect(targetCard, "fixture must expose at least one non-root card").toBeDefined();
        const targetId = targetCard?.dataset.personId;
        expect(targetId).toBeDefined();

        await fireEvent.click(targetCard!);
        await tick();

        // primary invariant: the click landed in the store
        expect(selection.selectedPersonId).toBe(targetId);

        // header-readiness invariant: the inspector would render that person.
        // we don't mount the inspector here (its own test exercises the header
        // template) - we assert the underlying derived state is reachable:
        // the picked id resolves to a `Person` in the real tree.
        const picked = treeStore.tree.people[targetId!];
        expect(picked, "picked id must resolve to a Person in the tree").toBeDefined();

        handle.unmount();
    });
});
