// SPDX-License-Identifier: MIT
//
// phase 1 — full state machine. adds:
//   localStorage persistence (opened panels; NOT floating positions)
//   pop-out support (floating state with x/y/z)
//   clampAll for viewport resize
//   drag reorder (reorderPills)
//   focus tracking (focusGen, focusPanel, focusedAt)
//   4-branch togglePanel machine (closed/minimized/expanded/floating)
//   dialog state (openDialog closes previous)
//   floatingPanels + dialogs getters for DockSurface
//   movePanel for DockPanel drag-to-move
//   getItem accessor for DockPanel corner derivation

import type { Snippet } from "svelte";
import { SvelteMap } from "svelte/reactivity";

export type DockCorner = "bl" | "tl" | "tr" | "br";
export type DockPanelState = "closed" | "minimized" | "expanded" | "floating";
export type DockKind = "pill" | "panel" | "dialog";

export interface DockRenderCtx {
    // passed to panel body snippets; dialogs receive this too (ignored).
    forcedCollapse: boolean;
}
export type DockRenderSnippet = Snippet<[DockRenderCtx]>;

export interface DockItemDef {
    id: string;
    kind: DockKind;
    corner: DockCorner;
    priority: number;
    // pill: the id of the paired panel item
    panelId?: string | undefined;
    // false → always open, no close button
    closeable?: boolean | undefined;
    // false → auto-open on mount and don't persist
    persistent?: boolean | undefined;
    title?: string | undefined;
    // sort order within corner (drag-to-reorder)
    order?: number | undefined;
    // focus timestamp for panel tiebreaker
    focusedAt?: number | undefined;
    render: DockRenderSnippet;
}

interface DockPanelPosition {
    x: number;
    y: number;
    z: number;
}

const LS_OPENED = "fte.dock.openedPanels";

function readOpenedPanels(): Set<string> {
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

function writeOpenedPanels(ids: Set<string>): void {
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
    // panel states: "closed" absent, otherwise one of the three states.
    #panelStates = new SvelteMap<string, Exclude<DockPanelState, "closed">>();
    // floating panel positions (only present when state === "floating")
    #positions = new SvelteMap<string, DockPanelPosition>();
    // the single active dialog id (undefined when none)
    #activeDialog = $state<string | undefined>(undefined);
    // monotonic counter for focusGen (no Date.now())
    #focusGen = 0;
    // z-index counter for floating panels (wraps at 20)
    #zCounter = 0;

    get activeDialog(): string | undefined { return this.#activeDialog; }

    // --- item registry ---

    register(item: DockItemDef): void {
        if (this.#items.has(item.id)) {
            throw new Error(`dockStore: duplicate id ${JSON.stringify(item.id)}`);
        }
        // if this pill has no explicit order but existing pills in the same corner
        // do (i.e. the user has drag-reordered), place it after them so the
        // drag arrangement is preserved when new pills mount at runtime
        if (item.kind === "pill" && item.order === undefined) {
            let maxOrder: number | undefined;
            for (const it of this.#items.values()) {
                if (it.corner === item.corner && it.kind === "pill" && it.order !== undefined) {
                    if (maxOrder === undefined || it.order > maxOrder) maxOrder = it.order;
                }
            }
            if (maxOrder !== undefined) {
                item = { ...item, order: maxOrder + 10 };
            }
        }
        this.#items.set(item.id, item);
        if (item.kind === "panel") {
            if (item.persistent === false || item.closeable === false) {
                // non-persistent or non-closeable: always auto-open as minimized
                this.#panelStates.set(item.id, "minimized");
            } else {
                // persistent: restore from localStorage if previously opened
                const opened = readOpenedPanels();
                if (opened.has(item.id)) {
                    this.#panelStates.set(item.id, "minimized");
                }
                // else: stays closed (absent from #panelStates)
            }
        }
    }

    unregister(id: string): void {
        this.#items.delete(id);
        this.#panelStates.delete(id);
        this.#positions.delete(id);
        this.#persistPanels();
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
            if (item.corner === corner && item.kind !== "dialog") out.push(item);
        }
        out.sort((a, b) => {
            const oa = a.order ?? 0;
            const ob = b.order ?? 0;
            if (oa !== ob) return oa - ob;
            if (a.priority !== b.priority) return a.priority - b.priority;
            // focusedAt desc tiebreaker scoped to panel-kind pairs
            if (a.kind === "panel" && b.kind === "panel") {
                const fa = a.focusedAt ?? -Infinity;
                const fb = b.focusedAt ?? -Infinity;
                if (fa !== fb) return fb - fa;
            }
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
        return out;
    }

    // --- panel state ---

    panelState(id: string): DockPanelState {
        return this.#panelStates.get(id) ?? "closed";
    }

    isOpen(id: string): boolean {
        const item = this.#items.get(id);
        if (item?.kind === "panel" && item.closeable === false) return true;
        return this.#panelStates.has(id);
    }

    isExpanded(id: string): boolean {
        return this.#panelStates.get(id) === "expanded";
    }

    openPanel(id: string): void {
        if (!this.#panelStates.has(id)) {
            this.#panelStates.set(id, "minimized");
            this.#persistPanels();
        }
    }

    closePanel(id: string): void {
        const item = this.#items.get(id);
        if (item?.closeable === false) return;
        this.#panelStates.delete(id);
        this.#positions.delete(id);
        this.#persistPanels();
    }

    toggleExpanded(id: string): void {
        const cur = this.#panelStates.get(id) ?? "closed";
        if (cur === "expanded") {
            this.#panelStates.set(id, "minimized");
        } else if (cur === "minimized") {
            this.#panelStates.set(id, "expanded");
        }
        this.#persistPanels();
    }

    setExpanded(id: string, expanded: boolean): void {
        const cur = this.#panelStates.get(id);
        if (cur === undefined) return;
        this.#panelStates.set(id, expanded ? "expanded" : "minimized");
        this.#persistPanels();
    }

    // togglePanel 4-branch machine
    togglePanel(panelId: string): void {
        const state = this.panelState(panelId);
        if (state === "closed") {
            this.#panelStates.set(panelId, "expanded");
            this.#persistPanels();
        } else if (state === "minimized") {
            this.#panelStates.set(panelId, "expanded");
            this.#persistPanels();
        } else if (state === "expanded") {
            this.#panelStates.set(panelId, "minimized");
            this.#persistPanels();
        } else if (state === "floating") {
            this.bringToFront(panelId);
        }
    }

    // --- float / dock ---

    floatPanel(id: string, x: number, y: number): void {
        this.#zCounter = (this.#zCounter + 1) % 20;
        const z = this.#zCounter;
        this.#panelStates.set(id, "floating");
        this.#positions.set(id, { x, y, z });
        // floating panels count as "opened" for persistence
        // but restore as "minimized" on next load (not "floating")
        this.#persistPanels();
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

    dockPanel(id: string): void {
        this.#panelStates.set(id, "minimized");
        this.#positions.delete(id);
        this.#persistPanels();
    }

    // dock and immediately expand — used by the re-dock (↙) button so it
    // differs from the minimize button (which docks to "minimized")
    dockPanelExpanded(id: string): void {
        this.#panelStates.set(id, "expanded");
        this.#positions.delete(id);
        this.#persistPanels();
    }

    movePanel(id: string, x: number, y: number): void {
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

    focusPanel(id: string): void {
        this.#focusGen += 1;
        const gen = this.#focusGen;
        this.updateItem(id, { focusedAt: gen });
        if (this.#panelStates.get(id) === "floating") {
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
            // mirror order onto paired panel so panel stack follows taskbar
            if (item.panelId) {
                this.updateItem(item.panelId, { order });
            }
        });
    }

    // --- dialog ---

    openDialog(id: string): void {
        // close current dialog first
        this.#activeDialog = undefined;
        this.#activeDialog = id;
    }

    closeDialog(): void {
        this.#activeDialog = undefined;
    }

    // --- DockSurface getters ---

    get floatingPanels(): Array<{ item: DockItemDef; pos: DockPanelPosition }> {
        const out: Array<{ item: DockItemDef; pos: DockPanelPosition }> = [];
        for (const [id, item] of this.#items) {
            if (item.kind === "panel" && this.#panelStates.get(id) === "floating") {
                const pos = this.#positions.get(id);
                if (pos) out.push({ item, pos });
            }
        }
        return out;
    }

    get dialogs(): DockItemDef[] {
        return [...this.#items.values()].filter(it => it.kind === "dialog");
    }

    // --- persistence ---

    #persistPanels(): void {
        const opened = new Set<string>();
        for (const [id] of this.#panelStates) {
            const item = this.#items.get(id);
            // skip non-persistent items
            if (item?.persistent === false) continue;
            // anything in #panelStates is non-closed; all count as "opened"
            opened.add(id);
        }
        writeOpenedPanels(opened);
    }

    // --- test isolation ---

    resetForTest(): void {
        this.#items.clear();
        this.#panelStates.clear();
        this.#positions.clear();
        this.#activeDialog = undefined;
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
