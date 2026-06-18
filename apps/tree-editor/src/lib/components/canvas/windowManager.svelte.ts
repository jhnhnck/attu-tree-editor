// SPDX-License-Identifier: MIT

// runes-backed singleton for the canvas-window-manager. owns focus
// tracking + pop-out state + bbox clamp for floating Window primitives
// that escape the dock stack, plus the open/closed gate for closeable
// windows (canvas-chrome-v2 phase 0).
//
// state shape:
//   focusedWindowId: id of the most-recently-focused window, or null.
//   popOutStates:    SvelteMap<id, { x, y, z, focusedAt }>. present iff
//                    the window is currently popped-out.
//   openedWindows:   SvelteSet<string>. ids of windows whose DockRegistration
//                    is currently mounted. non-closing ids (NON_CLOSING_IDS)
//                    are always open regardless. persisted to localStorage
//                    via fte.dock.openedWindows.
//
// invariants:
//   - z-cap is 49 — popped-out windows live in z-30..z-49; modals z-50+.
//   - popping out cascades from (host.right - 320 + n*24, host.top + 60 + n*24).
//   - moveTo(id, x, y) clamps to host - 8px margin on every edge.
//   - NON_CLOSING_IDS.has(id) → isOpen always true; openWindow/closeWindow no-op.

import { SvelteMap, SvelteSet } from "svelte/reactivity";

// per-window pop-out state. transient — not persisted across sessions.
export interface PopOutState {
    x: number;
    y: number;
    z: number;
    // monotonically-increasing focus timestamp.
    focusedAt: number;
}

// the four mutually-exclusive states a window can be in. "closed" is the
// absence of an entry; the other three are recorded in `lastState` so the
// restore branch of pillClick knows where to return a re-opened window.
export type DockWindowState = "closed" | "docked-minimized" | "docked-expanded" | "floating";

// windows that cannot be closed. isOpen always returns true; the close
// button is hidden when Window.closeable=false.
export const NON_CLOSING_IDS = new Set<string>(["save-status-window"]);

// windows whose open-state windowManager owns but does NOT persist to
// localStorage. the debug menu and the family-view debug panels are
// ephemeral debugging surfaces: they live in `openedWindows` during a
// session (so isOpen / pillClick / the × all work uniformly) but never
// round-trip through fte.dock.openedWindows, so "menu open state does
// not persist across reload" holds. family-view panels re-open on each
// family-view mount instead.
function isNonPersisted(id: string): boolean {
    return id === "debug-menu" || id.startsWith("family-view-debug-");
}

const LS_KEY_OPENED_WINDOWS = "fte.dock.openedWindows";

function readOpenedWindowsFromStorage(): string[] {
    try {
        const raw = globalThis.localStorage?.getItem(LS_KEY_OPENED_WINDOWS);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
        return [];
    }
}

function writeOpenedWindowsToStorage(ids: Iterable<string>): void {
    try {
        const persisted = [...ids].filter((id) => !isNonPersisted(id));
        globalThis.localStorage?.setItem(LS_KEY_OPENED_WINDOWS, JSON.stringify(persisted));
    } catch {
        // ignore — storage unavailable or quota exceeded
    }
}

// internal monotonically-increasing counter for focusedAt.
let focusTickCounter = 0;
function nextFocusTick(): number {
    focusTickCounter += 1;
    return focusTickCounter;
}

// z-band constants.
const Z_MIN = 30;
const Z_MAX = 49;

const CLAMP_MARGIN_PX = 8;

const CASCADE_RIGHT_OFFSET = 320;
const CASCADE_TOP_OFFSET = 60;
const CASCADE_STEP_PX = 24;
const CASCADE_SOFT_CAP = 8;
const CASCADE_WRAP_Y_PX = 32;

const DEFAULT_W = 320;
const DEFAULT_H = 150;

class WindowManager {
    focusedWindowId: string | null = $state(null);
    // bumped on every focus() call, even when focusedWindowId is unchanged
    // (re-focusing the already-focused window). Window.svelte watches this
    // to re-play its focus flash on every focus event, not just the first
    // (bugs.md cc1-3).
    focusGen: number = $state(0);
    popOutStates: SvelteMap<string, PopOutState> = new SvelteMap();
    // open/closed gate. non-closing ids are always open (see isOpen).
    // initialized from fte.dock.openedWindows on construction.
    openedWindows: SvelteSet<string> = new SvelteSet(readOpenedWindowsFromStorage());
    // docked windows whose body is expanded (vs minimized to titlebar-only).
    // popped-out windows are always effectively expanded (see isExpanded),
    // so they are not tracked here. absence = minimized.
    expandedWindows: SvelteSet<string> = new SvelteSet();
    // last non-closed state per window, so pillClick's reopen branch can
    // restore a window to where it was rather than a fixed default.
    lastState: SvelteMap<string, Exclude<DockWindowState, "closed">> = new SvelteMap();

    private hostEl: HTMLElement | null = null;

    // ---------- host wiring ----------

    setHostElement(el: HTMLElement | null): void {
        this.hostEl = el;
    }

    // ---------- open / close gate ----------

    openWindow(id: string): void {
        if (NON_CLOSING_IDS.has(id)) return;
        this.openedWindows.add(id);
        // a freshly opened docked window shows its body by default. don't
        // touch a window that's currently popped out (it stays floating).
        if (!this.popOutStates.has(id)) {
            this.expandedWindows.add(id);
            this.lastState.set(id, "docked-expanded");
        }
        writeOpenedWindowsToStorage(this.openedWindows);
    }

    closeWindow(id: string): void {
        if (NON_CLOSING_IDS.has(id)) return;
        this.openedWindows.delete(id);
        this.expandedWindows.delete(id);
        // keep lastState so a pill-reopen can restore where it was; it is
        // overwritten on the next open and wiped by clear(). clean up
        // pop-out state so no orphan entry lingers.
        if (this.popOutStates.has(id)) this.redock(id);
        writeOpenedWindowsToStorage(this.openedWindows);
    }

    // non-closing ids always return true; others gate on openedWindows.
    isOpen(id: string): boolean {
        return NON_CLOSING_IDS.has(id) || this.openedWindows.has(id);
    }

    // body-expansion gate for docked windows. popped-out windows always
    // show their body (pop-out implicitly forces expanded), matching
    // Window.svelte's effectiveExpanded.
    isExpanded(id: string): boolean {
        if (this.popOutStates.has(id)) return true;
        return this.expandedWindows.has(id);
    }

    setExpanded(id: string, expanded: boolean): void {
        if (expanded) this.expandedWindows.add(id);
        else this.expandedWindows.delete(id);
        if (!this.popOutStates.has(id) && this.isOpen(id)) {
            this.lastState.set(id, expanded ? "docked-expanded" : "docked-minimized");
        }
    }

    toggleExpanded(id: string): void {
        this.setExpanded(id, !this.isExpanded(id));
    }

    // the window's current mutually-exclusive state.
    windowState(id: string): DockWindowState {
        if (!this.isOpen(id)) return "closed";
        if (this.popOutStates.has(id)) return "floating";
        return this.expandedWindows.has(id) ? "docked-expanded" : "docked-minimized";
    }

    // pill click — four branches over the current state:
    //   closed          → open (restoring to floating if it was last floating,
    //                     otherwise docked + expanded) and focus
    //   docked-minimized → restore (expand) and focus
    //   docked-expanded  → focus
    //   floating         → focus; if already focused, minimize (re-dock +
    //                     collapse) so a second click tucks it away
    pillClick(id: string): void {
        switch (this.windowState(id)) {
            case "closed": {
                const prior = this.lastState.get(id);
                this.openWindow(id);
                if (prior === "floating") {
                    this.popOut(id);
                } else {
                    this.setExpanded(id, true);
                    this.focus(id);
                }
                break;
            }
            case "docked-minimized":
                this.setExpanded(id, true);
                this.focus(id);
                break;
            case "docked-expanded":
                this.focus(id);
                break;
            case "floating":
                if (this.focusedWindowId === id) {
                    this.redock(id);
                    this.setExpanded(id, false);
                } else {
                    this.focus(id);
                }
                break;
        }
    }

    // ---------- focus tracking ----------

    focus(id: string): number {
        const ts = nextFocusTick();
        this.focusedWindowId = id;
        // bump even when focusedWindowId is unchanged so re-focusing the
        // already-focused window still re-plays the flash (cc1-3).
        this.focusGen += 1;
        const entry = this.popOutStates.get(id);
        if (entry !== undefined) {
            const nextZ = this.nextZ();
            this.popOutStates.set(id, { ...entry, focusedAt: ts, z: nextZ });
        }
        return ts;
    }

    blur(): void {
        this.focusedWindowId = null;
    }

    // ---------- pop-out / re-dock ----------

    popOut(id: string): boolean {
        if (this.popOutStates.has(id)) return false;
        const slot = this.popOutStates.size;
        const { x, y } = this.cascadeSlot(slot);
        const ts = nextFocusTick();
        this.popOutStates.set(id, { x, y, z: this.nextZ(), focusedAt: ts });
        this.focusedWindowId = id;
        this.focusGen += 1;
        this.lastState.set(id, "floating");
        return true;
    }

    redock(id: string): boolean {
        const wasPopped = this.popOutStates.delete(id);
        if (wasPopped && this.isOpen(id)) {
            this.lastState.set(
                id,
                this.expandedWindows.has(id) ? "docked-expanded" : "docked-minimized",
            );
        }
        return wasPopped;
    }

    bringToFront(id: string): void {
        const entry = this.popOutStates.get(id);
        if (entry === undefined) return;
        this.popOutStates.set(id, { ...entry, z: this.nextZ() });
    }

    moveTo(id: string, x: number, y: number, w: number = DEFAULT_W, h: number = DEFAULT_H): void {
        const entry = this.popOutStates.get(id);
        if (entry === undefined) return;
        const clamped = this.clampToHost(x, y, w, h);
        this.popOutStates.set(id, { ...entry, x: clamped.x, y: clamped.y });
    }

    clampAll(sizes?: Map<string, { w: number; h: number }>): void {
        for (const [id, entry] of this.popOutStates) {
            const s = sizes?.get(id);
            const w = s?.w ?? DEFAULT_W;
            const h = s?.h ?? DEFAULT_H;
            const clamped = this.clampToHost(entry.x, entry.y, w, h);
            if (clamped.x !== entry.x || clamped.y !== entry.y) {
                this.popOutStates.set(id, { ...entry, x: clamped.x, y: clamped.y });
            }
        }
    }

    // ---------- introspection ----------

    isPoppedOut(id: string): boolean {
        return this.popOutStates.has(id);
    }

    poppedOutCount(): number {
        return this.popOutStates.size;
    }

    // test-only teardown.
    clear(): void {
        this.focusedWindowId = null;
        this.focusGen = 0;
        this.popOutStates.clear();
        this.openedWindows.clear();
        this.expandedWindows.clear();
        this.lastState.clear();
        focusTickCounter = 0;
    }

    // ---------- internals ----------

    private nextZ(): number {
        let max = Z_MIN - 1;
        for (const entry of this.popOutStates.values()) {
            if (entry.z > max) max = entry.z;
        }
        return Math.min(Z_MAX, Math.max(Z_MIN, max + 1));
    }

    private cascadeSlot(n: number): { x: number; y: number } {
        const wrap = Math.floor(n / CASCADE_SOFT_CAP);
        const i = n % CASCADE_SOFT_CAP;
        const stepOffset = i * CASCADE_STEP_PX;
        if (this.hostEl === null) {
            const fakeRight = 1440;
            return {
                x: fakeRight - CASCADE_RIGHT_OFFSET + stepOffset,
                y: CASCADE_TOP_OFFSET + stepOffset + wrap * CASCADE_WRAP_Y_PX,
            };
        }
        const r = this.hostEl.getBoundingClientRect();
        return {
            x: r.width - CASCADE_RIGHT_OFFSET + stepOffset,
            y: CASCADE_TOP_OFFSET + stepOffset + wrap * CASCADE_WRAP_Y_PX,
        };
    }

    private clampToHost(x: number, y: number, w: number, h: number): { x: number; y: number } {
        if (this.hostEl === null) return { x, y };
        const r = this.hostEl.getBoundingClientRect();
        const maxX = Math.max(CLAMP_MARGIN_PX, r.width - w - CLAMP_MARGIN_PX);
        const maxY = Math.max(CLAMP_MARGIN_PX, r.height - h - CLAMP_MARGIN_PX);
        return {
            x: Math.min(maxX, Math.max(CLAMP_MARGIN_PX, x)),
            y: Math.min(maxY, Math.max(CLAMP_MARGIN_PX, y)),
        };
    }
}

export const windowManager = new WindowManager();

export const WINDOW_MANAGER_CONSTANTS = {
    Z_MIN,
    Z_MAX,
    CLAMP_MARGIN_PX,
    CASCADE_RIGHT_OFFSET,
    CASCADE_TOP_OFFSET,
    CASCADE_STEP_PX,
    CASCADE_SOFT_CAP,
    CASCADE_WRAP_Y_PX,
};
