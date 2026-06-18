// SPDX-License-Identifier: MIT

// runes-backed singleton registry for items that opt into the
// CanvasChromeDock. lives at module scope so any component in the app
// can register / unregister without prop-drilling.
//
// the underlying store is a SvelteMap from svelte/reactivity — a Map
// shim that notifies the runes engine on set / delete / clear, so
// reads from itemsForCorner inside $derived blocks re-run when the
// registry mutates. plain $state<Map> would only track rebinding the
// reference, not the collection's own mutations.
//
// priority-space convention (documented; not yet enforced):
//   0  - 99  always-visible status (e.g. SaveStatusPill at 10)
//   100-199 user-toggled tools
//   200-299 debug-only (layout-metrics at 230)
//   300+    menus / primary control surfaces (set forceCollapsible: false)
//
// fails loudly on duplicate ids — callers must unregister before
// re-registering with the same id. clearRegistry() exists for test
// isolation; production code should not call it.

import type { Snippet } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";

export type DockCorner = "bl" | "tl" | "tr" | "br";
// `window` is the canvas-window-manager kind: a popped-out floating
// chrome surface that lives inside the canvas-host. it sorts among
// docked entries the same way panels do (priority asc) but adds a
// `focusedAt` tiebreaker so the most-recently-focused window comes
// to the top of the within-priority group — without leaking that
// reorder across pills (kind="pill") or non-window panels.
export type DockKind = "pill" | "panel" | "window";

// phase 4: render snippets receive a `DockRenderCtx` carrying the
// dock-managed forced-collapse flag. panels and windows forward this
// to their chrome component so the body suppresses when the dock has
// forced a collapse. pills can ignore the ctx — their kind is `pill`,
// the dock never force-collapses them. backwards-compatible: snippets
// that don't declare the arg simply discard it.
export interface DockRenderCtx {
    forcedCollapse: boolean;
}
export type DockRenderSnippet = Snippet<[DockRenderCtx]>;

export interface DockItem {
    id: string;
    corner: DockCorner;
    priority: number;
    kind: DockKind;
    render: DockRenderSnippet;
    // opt-out from the dock's force-collapse pass. defaults to `true`
    // (every panel is a candidate for being shrunk to its pill form
    // when the corner's stack exceeds its cap). primary control
    // surfaces (the debug menu sits at priority 300) set this to
    // `false` so the dock never collapses them — they keep their full
    // measured height and crowd everything else into pill form first.
    // accepts `undefined` so callers can thread the field through props
    // even when not opting out (matches `exactOptionalPropertyTypes`).
    forceCollapsible?: boolean | undefined;
    // monotonically-increasing timestamp (Date.now()) recorded each time
    // the window manager focuses this item. only meaningful when
    // `kind === "window"`; the itemsForCorner sort uses it as a desc
    // tiebreaker SCOPED to window-kind items so the most-recently-
    // focused window sits at the top of its priority bucket without
    // disturbing pills or panels. pills and panels leave this
    // undefined; the sort ignores their value entirely.
    focusedAt?: number | undefined;
    // phase 4 drag-to-reorder: user-assigned ordering within a corner.
    // the PRIMARY sort key (asc) in itemsForCorner — it comes BEFORE
    // priority on purpose. defaults to 0 for every item, so until a
    // drag mutates it the whole block is tied at 0 and the sort falls
    // straight through to the priority / focusedAt / id comparator —
    // i.e. default layout + focus-to-front are byte-for-byte unchanged.
    // `reorderItem` rewrites these to dense gapped integers for the
    // corner's draggable block. NOT persisted (in-memory session only).
    // accepts `undefined` so callers thread the field through props
    // generically (matches `exactOptionalPropertyTypes`); the
    // comparator treats missing as 0.
    order?: number | undefined;
    // taskbar model (phase 6): for a pill (kind="pill"), the id of the
    // window this pill represents. the pill↔window naming is NOT uniform
    // (save-status pill `save-status` ↔ window `save-status-window`;
    // debug pill `debug-toggle` ↔ window `debug-menu`), so the link is
    // carried explicitly rather than derived by string transform.
    // `reorderPills` reads it to keep the paired window's `order` in
    // sync with the pill row, so a docked-expanded window's position in
    // the panel stack follows its pill's position in the taskbar. only
    // meaningful for pills; windows / panels leave it undefined.
    windowId?: string | undefined;
}

const items = new SvelteMap<string, DockItem>();

// phase 4: forced-collapse set. tracked separately from each panel's
// user-toggled `collapsed` state so the dock's overflow handler can
// force a panel to its pill form without clobbering the user's prior
// expand/collapse choice. when a forced-collapse id is removed, the
// user's prior state resumes naturally — the panel's own `expanded`
// prop is read by the panel/Window chrome, which renders the body iff
// `expanded && !forcedCollapse`. SvelteSet so derived consumers re-run
// on add/delete.
const forcedCollapseIds = new SvelteSet<string>();

export function register(item: DockItem): void {
    if (items.has(item.id)) {
        throw new Error(
            `dockRegistry: duplicate id ${JSON.stringify(item.id)} — unregister before re-registering`,
        );
    }
    items.set(item.id, item);
}

// idempotent in-place update for the per-item render snippet + ancillary
// props. used by DockRegistration to keep its effect from re-running
// register/unregister cycles (which would invalidate the dock's $derived
// and trigger update-depth-exceeded loops). callers must register the id
// first.
export function updateItem(id: string, patch: Partial<Omit<DockItem, "id">>): void {
    const existing = items.get(id);
    if (!existing) return;
    items.set(id, { ...existing, ...patch });
}

export function unregister(id: string): void {
    items.delete(id);
}

// returns the items in this corner sorted by `order` asc (phase 4
// drag-to-reorder, PRIMARY key), then priority asc, then `focusedAt`
// desc SCOPED to kind="window" entries, then id asc for stability.
// iterating items.values() reads from the SvelteMap so derived
// consumers re-run when the registry mutates.
//
// order defaults to 0 for every item; until a user drag rewrites it
// the whole block ties at 0 and the comparator falls through to the
// priority/focusedAt/id rules — default layout + focus-to-front are
// unchanged. order is deliberately PRIMARY (not a priority tiebreaker)
// because every window has a unique priority, so an order-after-
// priority key could never move a high-priority window above a low-
// priority one (the phase-4 reorder requirement).
//
// the focusedAt tiebreaker only fires when BOTH siblings are
// kind="window" AND share a priority — phase-0 focus-z spike. this
// keeps the window-manager's focus-to-front behaviour from leaking
// into pills/panels (e.g. save-status at priority 10 with a stale
// focusedAt cannot be reordered by any debug-window focus event;
// they have different priorities, and even at matching priority
// pills are excluded from the focusedAt branch by kind check).
export function itemsForCorner(corner: DockCorner): DockItem[] {
    const out: DockItem[] = [];
    for (const item of items.values()) {
        if (item.corner === corner) out.push(item);
    }
    out.sort((a, b) => {
        const oa = a.order ?? 0;
        const ob = b.order ?? 0;
        if (oa !== ob) return oa - ob;
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.kind === "window" && b.kind === "window") {
            // higher focusedAt (more recent) sorts first — desc within
            // the priority bucket. items that never focused get
            // focusedAt=undefined; treat as -Infinity so a focused
            // sibling beats them on first focus event.
            const fa = a.focusedAt ?? -Infinity;
            const fb = b.focusedAt ?? -Infinity;
            if (fa !== fb) return fb - fa;
        }
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return out;
}

// reactive helper for WindowOverlay: returns the registered ids of a
// given kind in the order itemsForCorner produces. used to iterate
// `popOutStates ∩ idsByKind("window")` so orphan ids (the registry
// item unmounted) drop automatically. reads from the SvelteMap so
// callers wrapping this in $derived re-run on register/unregister.
export function idsByKind(kind: DockKind): string[] {
    const out: string[] = [];
    for (const item of items.values()) {
        if (item.kind === kind) out.push(item.id);
    }
    return out;
}

// phase 4 drag-to-reorder. moves the item `id` to `newIndex` within
// its corner's DRAGGABLE block (the same panel/window block the dock's
// [data-dock-panels] region renders, in SORT order — pills are excluded
// because they live in their own row). reassigns dense gapped integer
// `order` values (0, 10, 20, ...) across that block in the new sequence
// so the relative order is stable. in-memory only — never written to
// localStorage. corner-scoped: only the named corner's draggable block
// is touched; pills and other corners keep their existing order.
//
// newIndex is clamped to [0, len]. when the item isn't found in the
// block (wrong corner / not draggable) the call is a no-op.
export function reorderItem(id: string, corner: DockCorner, newIndex: number): void {
    // the draggable block in current sort order — exactly what the dock
    // paints in its panels region.
    const block = itemsForCorner(corner).filter(
        (it) => it.kind === "panel" || it.kind === "window",
    );
    const fromIndex = block.findIndex((it) => it.id === id);
    if (fromIndex === -1) return;

    // pull the dragged item out, splice it back in at the clamped target.
    const [dragged] = block.splice(fromIndex, 1);
    if (dragged === undefined) return;
    const clamped = Math.max(0, Math.min(newIndex, block.length));
    block.splice(clamped, 0, dragged);

    // reassign dense gapped integers across the new sequence so the sort
    // reproduces it. only patch when the value actually changes to avoid
    // needless SvelteMap churn.
    block.forEach((it, i) => {
        const nextOrder = i * 10;
        if ((it.order ?? 0) !== nextOrder) {
            updateItem(it.id, { order: nextOrder });
        }
    });
}

// taskbar model (phase 6): reorder the PILL row of a corner (the
// [data-dock-pills] block). moves the pill `id` to `newIndex` within the
// corner's pill block in current sort order, then reassigns dense gapped
// `order` values across the pills so the row reproduces the new sequence.
//
// the design knot the phase-6 spike left: a pill and its docked window
// are SEPARATE dock items (e.g. `stats` pill ↔ `stats-window`). dragging
// the taskbar reorders the pills; the docked-window surfaces (rendered
// only when docked-expanded) must follow the same order so the taskbar
// and the panel stack stay consistent. each pill carries its paired
// `windowId`, so after laying out the pill order we mirror the SAME order
// integer onto each pill's window. windows therefore sort into the panel
// stack in pill-row order, regardless of their own priority.
//
// in-memory only — never persisted. corner-scoped. no-op when the pill
// isn't found in the corner's pill block.
export function reorderPills(id: string, corner: DockCorner, newIndex: number): void {
    const block = itemsForCorner(corner).filter((it) => it.kind === "pill");
    const fromIndex = block.findIndex((it) => it.id === id);
    if (fromIndex === -1) return;

    const [dragged] = block.splice(fromIndex, 1);
    if (dragged === undefined) return;
    const clamped = Math.max(0, Math.min(newIndex, block.length));
    block.splice(clamped, 0, dragged);

    block.forEach((it, i) => {
        const nextOrder = i * 10;
        // patch the pill itself when its order moves.
        if ((it.order ?? 0) !== nextOrder) {
            updateItem(it.id, { order: nextOrder });
        }
        // mirror the order onto the paired window so the docked-expanded
        // surface follows the taskbar. skip when the window isn't
        // registered (closed / not yet mounted) — it picks up the order
        // on its next register since updateItem no-ops on a missing id.
        if (it.windowId !== undefined) {
            const win = items.get(it.windowId);
            if (win !== undefined && (win.order ?? 0) !== nextOrder) {
                updateItem(it.windowId, { order: nextOrder });
            }
        }
    });
}

// phase 4 forced-collapse api. the dock's overflow handler calls
// forceCollapse(id) on the lowest-priority panel in a corner until the
// stack fits within the corner's max height; unforceCollapse(id) backs
// out one step when space frees up. `isForceCollapsed(id)` is reactive
// (reads the SvelteSet) so consumers can $derive against it. only
// panels (kind: "panel") are force-collapsed — pills have no body to
// hide, so the dock skips them.

export function forceCollapse(id: string): void {
    forcedCollapseIds.add(id);
}

export function unforceCollapse(id: string): void {
    forcedCollapseIds.delete(id);
}

export function isForceCollapsed(id: string): boolean {
    return forcedCollapseIds.has(id);
}

// test-only teardown for the forced-collapse set. parallel to
// clearRegistry; both are called from the dockRegistry test afterEach.
export function clearForcedCollapses(): void {
    forcedCollapseIds.clear();
}

// test-only teardown. resets the registry to empty so each unit /
// component test starts from a clean slate without leaking state across
// suites. production code should never call this.
export function clearRegistry(): void {
    items.clear();
    forcedCollapseIds.clear();
}
