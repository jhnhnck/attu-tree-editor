// SPDX-License-Identifier: MIT
//
// phase 1 — full state machine. adds:
//   localStorage persistence (opened windows; NOT floating positions)
//   pop-out support (floating state with x/y/z)
//   clampAll for viewport resize
//   drag reorder (reorderPills)
//   focus tracking (focusGen, focusWindow, focusedAt)
//   4-branch pillClick machine (closed/minimized/expanded/floating)
//   modal state (openModal closes previous)
//   floatingItems + modalItems getters for DockSurface
//   moveWindow for DockWindow drag-to-move
//   getItem accessor for DockWindow corner derivation

import type { Snippet } from "svelte";
import { SvelteMap } from "svelte/reactivity";

export type DockCorner = "bl" | "tl" | "tr" | "br";
export type DockWindowState = "closed" | "minimized" | "expanded" | "floating";
export type DockKind = "pill" | "window" | "modal";

export interface DockRenderCtx {
    // passed to window body snippets; modals receive this too (ignored).
    forcedCollapse: boolean;
}
export type DockRenderSnippet = Snippet<[DockRenderCtx]>;

export interface DockItemDef {
    id: string;
    kind: DockKind;
    corner: DockCorner;
    priority: number;
    // pill: the id of the paired window item
    windowId?: string | undefined;
    // false → always open, no close button
    closeable?: boolean | undefined;
    // false → auto-open on mount and don't persist
    persistent?: boolean | undefined;
    title?: string | undefined;
    // sort order within corner (drag-to-reorder)
    order?: number | undefined;
    // focus timestamp for window tiebreaker
    focusedAt?: number | undefined;
    render: DockRenderSnippet;
}

interface DockWindowPosition {
    x: number;
    y: number;
    z: number;
}

const LS_OPENED = "fte.dock.openedWindows";

function readOpenedWindows(): Set<string> {
    try {
        const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(LS_OPENED);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((x): x is string => typeof x === "string"));
    } catch {
        return new Set();
    }
}

function writeOpenedWindows(ids: Set<string>): void {
    try {
        if (typeof localStorage !== "undefined") {
            localStorage.setItem(LS_OPENED, JSON.stringify([...ids]));
        }
    } catch {
        // quota / disabled storage non-fatal
    }
}

class DockStore {
    #items = new SvelteMap<string, DockItemDef>();
    // window states: "closed" absent, otherwise one of the three states.
    #windowStates = new SvelteMap<string, Exclude<DockWindowState, "closed">>();
    // floating window positions (only present when state === "floating")
    #positions = new SvelteMap<string, DockWindowPosition>();
    // the single active modal id (undefined when none)
    #activeModal = $state<string | undefined>(undefined);
    // monotonic counter for focusGen (no Date.now())
    #focusGen = 0;
    // z-index counter for floating windows (wraps at 20)
    #zCounter = 0;

    get activeModal(): string | undefined { return this.#activeModal; }

    // --- item registry ---

    register(item: DockItemDef): void {
        if (this.#items.has(item.id)) {
            throw new Error(`dockStore: duplicate id ${JSON.stringify(item.id)}`);
        }
        this.#items.set(item.id, item);
        if (item.kind === "window") {
            if (item.persistent === false) {
                // non-persistent: always auto-open as minimized
                this.#windowStates.set(item.id, "minimized");
            } else {
                // persistent: restore from localStorage if previously opened
                const opened = readOpenedWindows();
                if (opened.has(item.id)) {
                    this.#windowStates.set(item.id, "minimized");
                }
                // else: stays closed (absent from #windowStates)
            }
        }
    }

    unregister(id: string): void {
        this.#items.delete(id);
        this.#windowStates.delete(id);
        this.#positions.delete(id);
        this.#persistWindows();
    }

    updateItem(id: string, patch: Partial<Omit<DockItemDef, "id">>): void {
        const existing = this.#items.get(id);
        if (!existing) return;
        this.#items.set(id, { ...existing, ...patch });
    }

    getItem(id: string): DockItemDef | undefined {
        return this.#items.get(id);
    }

    // --- sorted items for a corner ---

    itemsForCorner(corner: DockCorner): DockItemDef[] {
        const out: DockItemDef[] = [];
        for (const item of this.#items.values()) {
            if (item.corner === corner && item.kind !== "modal") out.push(item);
        }
        out.sort((a, b) => {
            const oa = a.order ?? 0;
            const ob = b.order ?? 0;
            if (oa !== ob) return oa - ob;
            if (a.priority !== b.priority) return a.priority - b.priority;
            // focusedAt desc tiebreaker scoped to window-kind pairs
            if (a.kind === "window" && b.kind === "window") {
                const fa = a.focusedAt ?? -Infinity;
                const fb = b.focusedAt ?? -Infinity;
                if (fa !== fb) return fb - fa;
            }
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
        return out;
    }

    // --- window state ---

    windowState(id: string): DockWindowState {
        return this.#windowStates.get(id) ?? "closed";
    }

    isOpen(id: string): boolean {
        const item = this.#items.get(id);
        if (item?.kind === "window" && item.closeable === false) return true;
        return this.#windowStates.has(id);
    }

    isExpanded(id: string): boolean {
        return this.#windowStates.get(id) === "expanded";
    }

    openWindow(id: string): void {
        if (!this.#windowStates.has(id)) {
            this.#windowStates.set(id, "minimized");
            this.#persistWindows();
        }
    }

    closeWindow(id: string): void {
        const item = this.#items.get(id);
        if (item?.closeable === false) return;
        this.#windowStates.delete(id);
        this.#positions.delete(id);
        this.#persistWindows();
    }

    toggleExpanded(id: string): void {
        const cur = this.#windowStates.get(id) ?? "closed";
        if (cur === "expanded") {
            this.#windowStates.set(id, "minimized");
        } else if (cur === "minimized") {
            this.#windowStates.set(id, "expanded");
        }
        this.#persistWindows();
    }

    setExpanded(id: string, expanded: boolean): void {
        const cur = this.#windowStates.get(id);
        if (cur === undefined) return;
        this.#windowStates.set(id, expanded ? "expanded" : "minimized");
        this.#persistWindows();
    }

    // pillClick 4-branch machine
    pillClick(windowId: string): void {
        const state = this.windowState(windowId);
        if (state === "closed") {
            this.openWindow(windowId);
        } else if (state === "minimized") {
            this.#windowStates.set(windowId, "expanded");
            this.#persistWindows();
        } else if (state === "expanded") {
            this.#windowStates.set(windowId, "minimized");
            this.#persistWindows();
        } else if (state === "floating") {
            this.bringToFront(windowId);
        }
    }

    // --- pop-out / floating ---

    popOut(id: string, x: number, y: number): void {
        this.#zCounter = (this.#zCounter + 1) % 20;
        const z = this.#zCounter;
        this.#windowStates.set(id, "floating");
        this.#positions.set(id, { x, y, z });
        // floating windows count as "opened" for persistence
        // but restore as "minimized" on next load (not "floating")
        this.#persistWindows();
    }

    bringToFront(id: string): void {
        const pos = this.#positions.get(id);
        if (!pos) return;
        let maxZ = pos.z;
        for (const [, p] of this.#positions) {
            if (p.z > maxZ) maxZ = p.z;
        }
        this.#positions.set(id, { ...pos, z: maxZ + 1 });
    }

    moveWindow(id: string, x: number, y: number): void {
        const pos = this.#positions.get(id);
        if (!pos) return;
        this.#positions.set(id, { ...pos, x, y });
    }

    clampAll(rect: DOMRect): void {
        const margin = 8;
        const estW = 200;
        const estH = 100;
        for (const [id, pos] of this.#positions) {
            const newX = Math.max(margin, Math.min(pos.x, rect.width - estW - margin));
            const newY = Math.max(margin, Math.min(pos.y, rect.height - estH - margin));
            if (newX !== pos.x || newY !== pos.y) {
                this.#positions.set(id, { ...pos, x: newX, y: newY });
            }
        }
    }

    // --- focus tracking ---

    focusWindow(id: string): void {
        this.#focusGen += 1;
        const gen = this.#focusGen;
        this.updateItem(id, { focusedAt: gen });
        if (this.#windowStates.get(id) === "floating") {
            this.bringToFront(id);
        }
    }

    // --- drag reorder ---

    reorderPills(corner: DockCorner, ids: string[]): void {
        ids.forEach((id, idx) => {
            const item = this.#items.get(id);
            if (!item || item.kind !== "pill" || item.corner !== corner) return;
            const order = idx * 10;
            this.updateItem(id, { order });
            // mirror order onto paired window so panel stack follows taskbar
            if (item.windowId) {
                this.updateItem(item.windowId, { order });
            }
        });
    }

    // --- modal ---

    openModal(id: string): void {
        // close current modal first
        this.#activeModal = undefined;
        this.#activeModal = id;
    }

    closeModal(): void {
        this.#activeModal = undefined;
    }

    // --- DockSurface getters ---

    get floatingItems(): Array<{ item: DockItemDef; pos: DockWindowPosition }> {
        const out: Array<{ item: DockItemDef; pos: DockWindowPosition }> = [];
        for (const [id, item] of this.#items) {
            if (item.kind === "window" && this.#windowStates.get(id) === "floating") {
                const pos = this.#positions.get(id);
                if (pos) out.push({ item, pos });
            }
        }
        return out;
    }

    get modalItems(): DockItemDef[] {
        return [...this.#items.values()].filter(it => it.kind === "modal");
    }

    // --- persistence ---

    #persistWindows(): void {
        const opened = new Set<string>();
        for (const [id] of this.#windowStates) {
            const item = this.#items.get(id);
            // skip non-persistent items
            if (item?.persistent === false) continue;
            // anything in #windowStates is non-closed; all count as "opened"
            opened.add(id);
        }
        writeOpenedWindows(opened);
    }

    // --- test isolation ---

    resetForTest(): void {
        this.#items.clear();
        this.#windowStates.clear();
        this.#positions.clear();
        this.#activeModal = undefined;
        this.#focusGen = 0;
        this.#zCounter = 0;
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.removeItem(LS_OPENED);
            }
        } catch {
            // ignore
        }
    }
}

export const dockStore = new DockStore();
