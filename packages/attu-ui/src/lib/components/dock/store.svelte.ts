// SPDX-License-Identifier: MIT
//
// phase 0 stub — only register/unregister/open/close/expand/corner.
// no persistence, no pop-out, no drag, no focus tracking.
// full implementation lands in phase 1.

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
    // sort order within corner (drag-to-reorder; phase 1)
    order?: number | undefined;
    // focus timestamp for window tiebreaker (phase 1)
    focusedAt?: number | undefined;
    render: DockRenderSnippet;
}

class DockStore {
    #items = new SvelteMap<string, DockItemDef>();
    // window states: "closed" absent, otherwise one of the three states.
    #windowStates = new SvelteMap<string, Exclude<DockWindowState, "closed">>();
    // the single active modal id ("closed" when undefined)
    #activeModal = $state<string | undefined>(undefined);
    #corner = $state<DockCorner>("bl");
    #hostEl = $state<Element | null>(null);

    get corner(): DockCorner { return this.#corner; }
    get activeModal(): string | undefined { return this.#activeModal; }
    get hostEl(): Element | null { return this.#hostEl; }

    setCorner(c: DockCorner): void { this.#corner = c; }
    setHostEl(el: Element | null): void { this.#hostEl = el; }

    // --- item registry ---

    register(item: DockItemDef): void {
        if (this.#items.has(item.id)) {
            throw new Error(`dockStore: duplicate id ${JSON.stringify(item.id)}`);
        }
        this.#items.set(item.id, item);
        if (item.kind === "window" && item.persistent === false) {
            this.#windowStates.set(item.id, "minimized");
        }
    }

    unregister(id: string): void {
        this.#items.delete(id);
        this.#windowStates.delete(id);
    }

    updateItem(id: string, patch: Partial<Omit<DockItemDef, "id">>): void {
        const existing = this.#items.get(id);
        if (!existing) return;
        this.#items.set(id, { ...existing, ...patch });
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
        }
    }

    closeWindow(id: string): void {
        const item = this.#items.get(id);
        if (item?.closeable === false) return;
        this.#windowStates.delete(id);
    }

    toggleExpanded(id: string): void {
        const cur = this.#windowStates.get(id) ?? "closed";
        if (cur === "expanded") {
            this.#windowStates.set(id, "minimized");
        } else if (cur === "minimized") {
            this.#windowStates.set(id, "expanded");
        }
    }

    setExpanded(id: string, expanded: boolean): void {
        const cur = this.#windowStates.get(id);
        if (cur === undefined) return;
        this.#windowStates.set(id, expanded ? "expanded" : "minimized");
    }

    // pill click 4-branch machine
    pillClick(windowId: string): void {
        const state = this.windowState(windowId);
        if (state === "closed") {
            this.openWindow(windowId);
        } else if (state === "minimized") {
            this.#windowStates.set(windowId, "expanded");
        } else if (state === "expanded") {
            this.#windowStates.set(windowId, "minimized");
        }
        // "floating" branch handled in phase 1 (refocus)
    }

    // --- modal ---

    openModal(id: string): void {
        // one modal at a time; opening closes the previous
        this.#activeModal = id;
    }

    closeModal(): void {
        this.#activeModal = undefined;
    }

    // --- test isolation ---

    resetForTest(): void {
        this.#items.clear();
        this.#windowStates.clear();
        this.#activeModal = undefined;
        this.#corner = "bl";
        this.#hostEl = null;
    }
}

export const dockStore = new DockStore();
