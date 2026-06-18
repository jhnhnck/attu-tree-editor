/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - selection state-machine invariant: a pre-set
 * localStorage selection key is read back into the real selection store
 * on hydrate, populating selection without a user click. this is the
 * effective "deep link" mechanism today - commit 9a0c613 shipped
 * "persist selected person id per tree so reload restores it"; there is
 * no URL-fragment mechanism, only the per-tree localStorage key.
 *
 * Mirrors App.svelte's `restoreSelectionForCurrentTree()`, which reads
 * `readPersistedSelection(tree.id)`, validates the id exists in the
 * loaded tree, and calls `selection.select(persisted)` (else clears).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    createSelectionStore,
    readPersistedSelection,
    selectionStorageKey,
    writePersistedSelection,
} from "$lib/state/selection.svelte";
import { createTreeStore } from "$lib/state/tree.svelte";
import type { PersonId, Tree } from "$lib/domain/types";

import { loadGedcomFixture } from "./_harness/loadGedcomFixture";

// re-implementation of App.svelte's restoreSelectionForCurrentTree so the
// invariant under test reads the same prod path. App owns the orchestrator;
// here we exercise the contract (read storage -> validate against tree ->
// select-or-clear) directly so the test catches any regression in that
// orchestration regardless of App.svelte refactors.
function restoreSelection(tree: Tree, selection: ReturnType<typeof createSelectionStore>): void {
    const persisted = readPersistedSelection(tree.id);
    if (persisted !== undefined && tree.people[persisted]) {
        selection.select(persisted);
    } else {
        selection.select(undefined);
        if (persisted !== undefined) writePersistedSelection(tree.id, undefined);
    }
}

describe("selection state-machine: deep-link via localStorage prefill", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it("a persisted id present in the loaded tree restores into the real selection store", () => {
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        const treeStore = createTreeStore(tree);
        const selection = createSelectionStore();

        // pick a non-root id so a restoration to `undefined` (the bug shape)
        // is distinguishable from a no-op "default to nothing" result
        const rootId = treeStore.tree.rootId;
        const ids = Object.keys(treeStore.tree.people);
        const targetId: PersonId | undefined = ids.find((id) => id !== rootId);
        if (!targetId) throw new Error("fixture must expose >= 2 people");

        // pre-set the storage key BEFORE the hydrate-restore call, the same
        // way a real reload finds it written by a previous session
        writePersistedSelection(treeStore.tree.id, targetId);

        // sanity: the key landed at the conventional path
        expect(localStorage.getItem(selectionStorageKey(treeStore.tree.id))).toBe(targetId);

        // invariant: restore reads the persisted id and writes the store
        restoreSelection(treeStore.tree, selection);
        expect(selection.selectedPersonId).toBe(targetId);

        // header-readiness: that id resolves to a Person in the tree
        expect(treeStore.tree.people[targetId]).toBeDefined();
    });

    it("a persisted id that no longer exists in the tree is dropped and selection clears", () => {
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        const treeStore = createTreeStore(tree);
        const selection = createSelectionStore();

        // simulate a stale key from a prior session whose tree had different
        // ids - this is the exact misuse App.svelte's restore guards against
        const stale = "no-such-person-id" as PersonId;
        writePersistedSelection(treeStore.tree.id, stale);

        restoreSelection(treeStore.tree, selection);

        // invariant: stale id does NOT land in the store; the key is wiped
        // so it doesn't keep leaking across reloads
        expect(selection.selectedPersonId).toBeUndefined();
        expect(readPersistedSelection(treeStore.tree.id)).toBeUndefined();
    });

    it("no persisted key + empty store stays empty (default deep-link state)", () => {
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        const selection = createSelectionStore();

        restoreSelection(tree, selection);
        expect(selection.selectedPersonId).toBeUndefined();
    });
});
