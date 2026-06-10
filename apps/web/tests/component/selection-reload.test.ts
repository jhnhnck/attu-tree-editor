/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - selection state-machine invariant: a selection made
 * in one "session" survives a tree reload (write -> tear down -> hydrate
 * fresh -> read). Pair with `selection-deep-link.test.ts`: that one tests
 * the read-back surface in isolation; this one tests the full round-trip
 * including the write side that App.svelte runs on every selection
 * change via its `$effect`.
 *
 * The reload is simulated by dropping the in-memory stores and creating
 * fresh ones against the same tree.id - mirrors what an actual page
 * reload does (the store instances vanish; only localStorage persists).
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

// App.svelte's persistence path is a `$effect` that fires on every
// selection change after the first-paint gate flips. svelte runes only
// work in `.svelte` / `.svelte.ts` files, and a `.svelte.ts` test would
// fall outside vitest's `*.test.ts` include glob - the test isn't the
// right place to drive a live $effect. instead we model the contract:
// "select-write" is "selection.select(id) followed by
// writePersistedSelection(treeId, id)". the effect is a thin wiring
// around exactly that pair; a regression in the wiring is caught by
// `Inspector.test.ts` (parent-effect surface) plus this round-trip.
function selectAndPersist(
    treeId: string,
    selection: ReturnType<typeof createSelectionStore>,
    id: PersonId | undefined,
): void {
    selection.select(id);
    writePersistedSelection(treeId, id);
}

function restoreSelection(tree: Tree, selection: ReturnType<typeof createSelectionStore>): void {
    const persisted = readPersistedSelection(tree.id);
    if (persisted !== undefined && tree.people[persisted]) {
        selection.select(persisted);
    } else {
        selection.select(undefined);
        if (persisted !== undefined) writePersistedSelection(tree.id, undefined);
    }
}

describe("selection state-machine: round-trip across reload", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it("selection.select(id) -> storage write -> fresh stores -> restore sees the same id", () => {
        // session 1: drive a selection on a real tree
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        const treeStore1 = createTreeStore(tree);
        const selection1 = createSelectionStore();

        const rootId = treeStore1.tree.rootId;
        const ids = Object.keys(treeStore1.tree.people);
        const targetId: PersonId | undefined = ids.find((id) => id !== rootId);
        if (!targetId) throw new Error("fixture must expose >= 2 people");

        // pick the target through the modelled select-and-write pair (see
        // selectAndPersist's note for why we don't drive App's $effect here)
        selectAndPersist(treeStore1.tree.id, selection1, targetId);

        // contract: storage has the picked id under the per-tree key
        expect(localStorage.getItem(selectionStorageKey(treeStore1.tree.id))).toBe(targetId);

        // simulate page reload: drop the old in-memory stores

        // session 2: fresh stores against the same tree (the reload re-loads
        // the on-disk tree, not the prior store instance). hydrate via the
        // store's `hydrate` API which is what App uses for already-on-disk
        // trees - it does not mark the store dirty
        const treeStore2 = createTreeStore(tree);
        treeStore2.hydrate(tree);
        const selection2 = createSelectionStore();
        expect(selection2.selectedPersonId).toBeUndefined();

        restoreSelection(treeStore2.tree, selection2);

        // invariant: the round-trip preserved the picked id
        expect(selection2.selectedPersonId).toBe(targetId);

        // header-readiness: id resolves to a Person in the freshly-hydrated tree
        expect(treeStore2.tree.people[targetId]).toBeDefined();
    });

    it("clearing the selection in session 1 leaves session 2 with an empty store", () => {
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        const treeStore = createTreeStore(tree);
        const selection1 = createSelectionStore();

        const rootId = treeStore.tree.rootId;
        const ids = Object.keys(treeStore.tree.people);
        const targetId: PersonId | undefined = ids.find((id) => id !== rootId);
        if (!targetId) throw new Error("fixture must expose >= 2 people");

        // select-then-clear inside the same session: storage must end up
        // empty (writePersistedSelection treats undefined as `removeItem`)
        selectAndPersist(treeStore.tree.id, selection1, targetId);
        selectAndPersist(treeStore.tree.id, selection1, undefined);

        expect(localStorage.getItem(selectionStorageKey(treeStore.tree.id))).toBeNull();

        // session 2: nothing to restore
        const selection2 = createSelectionStore();
        restoreSelection(treeStore.tree, selection2);
        expect(selection2.selectedPersonId).toBeUndefined();
    });
});
