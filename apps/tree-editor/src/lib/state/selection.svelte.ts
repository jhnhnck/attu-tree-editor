/*
 * FamilyTreeEditor - selection / hover state for the canvas
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";

export interface SelectionStore {
    readonly selectedPersonId: PersonId | undefined;
    readonly hoveredPersonId: PersonId | undefined;
    readonly editorOpenFor: PersonId | undefined;
    select(id: PersonId | undefined): void;
    hover(id: PersonId | undefined): void;
    openEditor(id: PersonId): void;
    closeEditor(): void;
}

export function createSelectionStore(): SelectionStore {
    let selected = $state<PersonId | undefined>(undefined);
    let hovered = $state<PersonId | undefined>(undefined);
    let editor = $state<PersonId | undefined>(undefined);

    return {
        get selectedPersonId() {
            return selected;
        },
        get hoveredPersonId() {
            return hovered;
        },
        get editorOpenFor() {
            return editor;
        },
        select(id): void {
            selected = id;
        },
        hover(id): void {
            hovered = id;
        },
        openEditor(id): void {
            selected = id;
            editor = id;
        },
        closeEditor(): void {
            editor = undefined;
        },
    };
}

// persistence of the last-selected person id, scoped per tree. matches the
// per-tree shape used by `fte.family-view.expansion.v1:{treeId}:{focusId}`
// (the singleton ui prefs use flat keys; selection is logically per-tree
// because the same person id can't be valid across trees). restoration is
// gated on the loaded tree actually containing the persisted id; on a miss
// the key is dropped silently so it doesn't keep leaking forever.
const SELECTION_STORAGE_PREFIX = "fte.selection.lastPersonId";

export function selectionStorageKey(treeId: string): string {
    return `${SELECTION_STORAGE_PREFIX}:${treeId}`;
}

export function readPersistedSelection(treeId: string): PersonId | undefined {
    try {
        if (typeof localStorage === "undefined") return undefined;
        const raw = localStorage.getItem(selectionStorageKey(treeId));
        if (raw === null || raw === "") return undefined;
        return raw;
    } catch {
        return undefined;
    }
}

export function writePersistedSelection(treeId: string, id: PersonId | undefined): void {
    try {
        if (typeof localStorage === "undefined") return;
        const key = selectionStorageKey(treeId);
        if (id === undefined) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, id);
        }
    } catch {
        // quota / disabled storage is non-fatal; selection just won't survive
    }
}

export function clearPersistedSelection(treeId: string): void {
    writePersistedSelection(treeId, undefined);
}
