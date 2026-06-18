/*
 * FamilyTreeEditor - imperative handle exposed by TreeCanvas via the
 * `oncontroller` callback so menu items / the zoom widget / the keyboard
 * binder can drive the same canvas state.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";

/**
 * Optional anchor for `setScale` / `zoomBy`. Coordinates are in host
 * (canvas-element) CSS pixels — same space as
 * `event.clientX - rect.left`. When omitted, the engine implementations
 * default to the host's viewport-center, so widget +/-, slider, and
 * exact-percent-entry paths get a stable focal point. Wheel + pinch
 * paths bypass `setScale` and run their own cursor-anchored math.
 */
export interface CanvasAnchorOpts {
    readonly anchorPx?: { readonly x: number; readonly y: number };
}

export interface CanvasController {
    getScale: () => number;
    /**
     * Reshaped wave-2 phase 0b: optional anchor. Defaulted behaviour
     * pans to keep the host's viewport center fixed at the new scale.
     */
    setScale: (next: number, opts?: CanvasAnchorOpts) => void;
    zoomBy: (factor: number, opts?: CanvasAnchorOpts) => void;
    fit: () => void;
    zoom100: () => void;
    focusSelection: () => void;
    fitSelection: () => void;
    centerOnPerson: (id: PersonId) => void;
    centerAt: (xUnits: number, yUnits: number) => void;
    centerOnRoot: () => void;
    getMode: () => "select" | "hand";
    setMode: (next: "select" | "hand") => void;
}
