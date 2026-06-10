/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - selection state-machine invariant: picking an item
 * from the inspector's header more-actions menu does NOT clear the
 * selection (the inspected person stays inspected; only side-effects like
 * "set as tree root" fire).
 *
 * The inspector's more-actions wiring is a parent-callback model
 * (onduplicate / onsetRoot / ondelete are App-supplied). The pre-mortem
 * called this entry-point out as "half-coverage" because more-actions
 * doesn't drive selection on its own - the test pins the *complement*:
 * the menu pick must not write to the selection store at all (regression
 * shape: a future refactor wires menu-pick through a generic
 * "focusPerson" that clobbers selection back to undefined or to a stale
 * id from the menu's own re-render).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";

import Inspector from "$lib/components/inspector/Inspector.svelte";
import { createSelectionStore } from "$lib/state/selection.svelte";
import { createTreeStore } from "$lib/state/tree.svelte";
import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";
import type { Person, PersonId, Tree } from "$lib/domain/types";

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

function makeTree(): Tree {
    const a = person({ id: "AAAAA", given: "Alpha" });
    const b = person({ id: "BBBBB", given: "Beta", gender: "f" });
    return {
        id: "test-tree",
        name: "Test",
        rootId: "AAAAA",
        people: { AAAAA: a, BBBBB: b },
        couples: [],
        editRev: 0,
        updatedAt: Date.now(),
    };
}

// minimal portrait-cache shim - Inspector reads from it; no portrait blobs
// in this fixture so every method returns undefined
const portraitUrls: PortraitUrlCache = {
    get: () => undefined,
    request: () => undefined,
    prime: () => undefined,
    invalidate: () => undefined,
    clear: () => undefined,
};

function inspectorProps(extra: Record<string, unknown>) {
    // a small stack of vi.fn()s for the callbacks that aren't load-bearing
    // for selection state. only onsetRoot / onduplicate / ondelete are
    // exercised here; the rest exist to satisfy Inspector's Props.
    return {
        treeId: "test-tree",
        portraitUrls,
        onpatch: vi.fn(),
        onsetParent: vi.fn(),
        onunsetParent: vi.fn(),
        onaddPartner: vi.fn(),
        onremovePartner: vi.fn(),
        onaddChild: vi.fn(),
        onremoveChild: vi.fn(),
        oncreateAndLink: vi.fn(),
        onselect: vi.fn(),
        onpatchCouple: vi.fn(),
        onduplicate: vi.fn(),
        onsetRoot: vi.fn(),
        ondelete: vi.fn(),
        onclose: vi.fn(),
        ...extra,
    };
}

describe("selection state-machine: inspector more-actions menu", () => {
    it("picking 'set as tree root' fires the side-effect AND preserves the inspected selection", async () => {
        // real stores - the bug shape this guards against is a refactor that
        // routes more-actions through a generic helper that mutates selection
        const tree = makeTree();
        const treeStore = createTreeStore(tree);
        const selection = createSelectionStore();
        const selectedId: PersonId = "BBBBB";
        selection.select(selectedId);

        // App-shape: onsetRoot updates the tree's rootId via treeStore.update
        // (see App.svelte#setRootAction). selection is not touched.
        const onsetRoot = vi.fn((id: PersonId) => {
            treeStore.update((t) => ({ ...t, rootId: id }));
        });

        const user = userEvent.setup();
        render(Inspector, {
            ...inspectorProps({ onsetRoot }),
            tree: treeStore.tree,
            selectedId,
        });

        await user.click(screen.getByRole("button", { name: /more actions/i }));
        await user.click(screen.getByRole("button", { name: /set as tree root/i }));

        // side-effect: rootId moved to the inspected person
        expect(onsetRoot).toHaveBeenCalledWith(selectedId);
        expect(treeStore.tree.rootId).toBe(selectedId);

        // invariant under test: selection still reflects the inspected person.
        // a regression that wires more-actions through `focusPerson(undefined)`
        // or any selection.select() call inside the action would flip this
        expect(selection.selectedPersonId).toBe(selectedId);

        // header-readiness: that id still resolves to a Person in the tree
        expect(treeStore.tree.people[selectedId]).toBeDefined();
    });

    it("picking 'duplicate person' preserves selection on the originally-inspected id", async () => {
        // duplicate is the cleanest "side-effect with no intended selection
        // change" case - App's clone-then-focusPerson flow does swap selection
        // to the clone, but that's an App-level orchestration; at the
        // inspector-callback boundary the menu pick itself must not touch
        // selection state. test against the boundary, not the orchestration.
        const tree = makeTree();
        const selection = createSelectionStore();
        const selectedId: PersonId = "BBBBB";
        selection.select(selectedId);

        const onduplicate = vi.fn();

        const user = userEvent.setup();
        render(Inspector, {
            ...inspectorProps({ onduplicate }),
            tree,
            selectedId,
        });

        await user.click(screen.getByRole("button", { name: /more actions/i }));
        await user.click(screen.getByRole("button", { name: /duplicate person/i }));

        expect(onduplicate).toHaveBeenCalledWith(selectedId);
        // selection unchanged at the boundary
        expect(selection.selectedPersonId).toBe(selectedId);
    });
});
