/*
 * FamilyTreeEditor - imperative handle exposed by TreeCanvas via the
 * `oncontroller` callback so menu items / the zoom widget / the keyboard
 * binder can drive the same canvas state.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";

export interface CanvasController {
    getScale: () => number;
    setScale: (next: number) => void;
    zoomBy: (factor: number) => void;
    fit: () => void;
    zoom100: () => void;
    focusSelection: () => void;
    fitSelection: () => void;
    centerOnPerson: (id: PersonId) => void;
    centerOnRoot: () => void;
    getMode: () => "select" | "hand";
    setMode: (next: "select" | "hand") => void;
}
