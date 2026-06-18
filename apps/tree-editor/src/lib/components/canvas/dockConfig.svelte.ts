// SPDX-License-Identifier: MIT

// runes-backed singleton for dock placement config: which corner the
// canvas-chrome dock anchors to. module-scoped (like windowManager and
// dockRegistry) so the deeply-nested family-view debug panels can bind
// their DockRegistration corner to the live value without prop-drilling
// through FamilyViewCanvas. persisted to fte.dock.corner; defaults to
// "tl" on first launch or when the stored value is missing/invalid.

import type { DockCorner } from "./dockRegistry.svelte";

const LS_KEY_CORNER = "fte.dock.corner";
const VALID_CORNERS = new Set<DockCorner>(["tl", "tr", "bl", "br"]);

function isDockCorner(value: string): value is DockCorner {
    return VALID_CORNERS.has(value as DockCorner);
}

function readCornerFromStorage(): DockCorner {
    try {
        const raw = globalThis.localStorage?.getItem(LS_KEY_CORNER);
        if (raw && isDockCorner(raw)) return raw;
    } catch {
        // ignore — storage unavailable
    }
    return "tl";
}

export class DockConfig {
    corner: DockCorner = $state(readCornerFromStorage());

    setCorner(next: DockCorner): void {
        this.corner = next;
        try {
            globalThis.localStorage?.setItem(LS_KEY_CORNER, next);
        } catch {
            // ignore — storage unavailable or quota exceeded
        }
    }
}

export const dockConfig = new DockConfig();
