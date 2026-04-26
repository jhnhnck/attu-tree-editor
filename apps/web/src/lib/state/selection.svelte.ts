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
