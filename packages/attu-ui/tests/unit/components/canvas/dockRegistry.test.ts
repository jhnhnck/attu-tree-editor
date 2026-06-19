// SPDX-License-Identifier: MIT

// unit tests for the canvas-chrome dock registry. covers the contract
// the phase 0 walking skeleton relies on: register / unregister, sort
// order, duplicate-id throw, clearRegistry teardown, and reactive
// reads from itemsForCorner.

import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount, type Snippet } from "svelte";
import {
    clearForcedCollapses,
    clearRegistry,
    forceCollapse,
    idsByKind,
    isForceCollapsed,
    itemsForCorner,
    register,
    reorderItem,
    reorderPills,
    unforceCollapse,
    unregister,
    updateItem,
} from "$lib/components/canvas/dockRegistry.svelte";
import DockProbe from "./fixtures/DockProbe.svelte";
import GatedDockRegistration from "./fixtures/GatedDockRegistration.svelte";

// dummy snippet stand-in. svelte 5's Snippet type accepts any callable
// with the snippet signature; the registry never invokes render itself
// in these unit tests so a no-op closure is fine.
const noop = (() => undefined) as unknown as Snippet;

afterEach(() => {
    clearRegistry();
});

describe("dockRegistry", () => {
    it("register + itemsForCorner returns the item under the right corner", () => {
        register({ id: "a", corner: "bl", priority: 10, kind: "pill", render: noop });
        const bl = itemsForCorner("bl");
        expect(bl).toHaveLength(1);
        expect(bl[0]?.id).toBe("a");
        expect(itemsForCorner("tr")).toHaveLength(0);
    });

    it("itemsForCorner sorts by priority asc, then id asc", () => {
        register({ id: "z", corner: "bl", priority: 10, kind: "pill", render: noop });
        register({ id: "a", corner: "bl", priority: 10, kind: "pill", render: noop });
        register({ id: "m", corner: "bl", priority: 5, kind: "pill", render: noop });
        const ids = itemsForCorner("bl").map((i) => i.id);
        expect(ids).toEqual(["m", "a", "z"]);
    });

    it("unregister removes a single item by id without disturbing siblings", () => {
        register({ id: "a", corner: "bl", priority: 10, kind: "pill", render: noop });
        register({ id: "b", corner: "bl", priority: 20, kind: "pill", render: noop });
        unregister("a");
        const ids = itemsForCorner("bl").map((i) => i.id);
        expect(ids).toEqual(["b"]);
    });

    it("duplicate id throws — callers must unregister first", () => {
        register({ id: "dup", corner: "bl", priority: 10, kind: "pill", render: noop });
        expect(() =>
            register({ id: "dup", corner: "bl", priority: 20, kind: "panel", render: noop }),
        ).toThrow(/duplicate id/);
    });

    it("clearRegistry empties state across corners", () => {
        register({ id: "a", corner: "bl", priority: 10, kind: "pill", render: noop });
        register({ id: "b", corner: "tr", priority: 10, kind: "pill", render: noop });
        clearRegistry();
        expect(itemsForCorner("bl")).toHaveLength(0);
        expect(itemsForCorner("tr")).toHaveLength(0);
    });

    // phase 4 forced-collapse api. dock's overflow handler mutates
    // these to force-collapse lowest-priority panels until the stack
    // fits. user-toggled collapse state lives elsewhere (per-panel
    // `collapsed` $state in FamilyViewDebugOverlay); these helpers
    // never touch it.

    it("forceCollapse + isForceCollapsed adds an id to the forced set", () => {
        expect(isForceCollapsed("p1")).toBe(false);
        forceCollapse("p1");
        expect(isForceCollapsed("p1")).toBe(true);
    });

    it("unforceCollapse removes an id without disturbing siblings", () => {
        forceCollapse("p1");
        forceCollapse("p2");
        unforceCollapse("p1");
        expect(isForceCollapsed("p1")).toBe(false);
        expect(isForceCollapsed("p2")).toBe(true);
    });

    it("clearForcedCollapses empties the forced set across ids", () => {
        forceCollapse("p1");
        forceCollapse("p2");
        forceCollapse("p3");
        clearForcedCollapses();
        expect(isForceCollapsed("p1")).toBe(false);
        expect(isForceCollapsed("p2")).toBe(false);
        expect(isForceCollapsed("p3")).toBe(false);
    });

    it("forceCollapse is idempotent — re-adding an id is a no-op", () => {
        forceCollapse("p1");
        forceCollapse("p1");
        forceCollapse("p1");
        unforceCollapse("p1");
        expect(isForceCollapsed("p1")).toBe(false);
    });

    it("unforceCollapse on an unknown id is a no-op (no throw)", () => {
        expect(() => unforceCollapse("never-added")).not.toThrow();
        expect(isForceCollapsed("never-added")).toBe(false);
    });

    it("forced-collapse state is independent of the items registry", () => {
        // proves forced-collapse can be set BEFORE an item registers,
        // and persists across register/unregister cycles. matches the
        // dock's measurement loop which may force-collapse an id while
        // an item is mid-mount.
        forceCollapse("future-panel");
        expect(isForceCollapsed("future-panel")).toBe(true);
        register({
            id: "future-panel",
            corner: "bl",
            priority: 200,
            kind: "panel",
            render: noop,
        });
        expect(isForceCollapsed("future-panel")).toBe(true);
        unregister("future-panel");
        // even after the item leaves the registry the forced flag
        // remains until something clears it; the dock's unmount effect
        // is responsible for cleanup in production.
        expect(isForceCollapsed("future-panel")).toBe(true);
    });

    it("clearRegistry also clears forced-collapse state", () => {
        forceCollapse("p1");
        forceCollapse("p2");
        clearRegistry();
        expect(isForceCollapsed("p1")).toBe(false);
        expect(isForceCollapsed("p2")).toBe(false);
    });

    // updateItem covers the patch-in-place path used by DockRegistration
    // when ancillary props (priority / kind / render snippet) change. it
    // intentionally avoids the unregister-and-register cycle because that
    // would invalidate the dock's $derived and risk update_depth_exceeded
    // loops; the in-place mutation keeps the SvelteMap entry stable.

    it("updateItem on an existing id patches the item in place", () => {
        register({ id: "a", corner: "bl", priority: 10, kind: "pill", render: noop });
        updateItem("a", { priority: 99 });
        const items = itemsForCorner("bl");
        expect(items).toHaveLength(1);
        expect(items[0]?.priority).toBe(99);
        // id and corner survive the patch — only the requested fields change
        expect(items[0]?.id).toBe("a");
        expect(items[0]?.corner).toBe("bl");
        expect(items[0]?.kind).toBe("pill");
    });

    it("updateItem with a partial patch only changes the patched fields", () => {
        const newRender = (() => undefined) as unknown as Snippet;
        register({ id: "a", corner: "bl", priority: 10, kind: "pill", render: noop });
        updateItem("a", { render: newRender });
        const items = itemsForCorner("bl");
        expect(items[0]?.render).toBe(newRender);
        // unchanged fields stay put
        expect(items[0]?.priority).toBe(10);
        expect(items[0]?.kind).toBe("pill");
    });

    it("updateItem on an unknown id is a no-op (no throw, registry unchanged)", () => {
        register({ id: "a", corner: "bl", priority: 10, kind: "pill", render: noop });
        // updateItem early-returns when the id isn't in the map — matches
        // the existing DockRegistration teardown contract where the
        // ancillary-prop effect can fire after unregister during unmount.
        expect(() => updateItem("never-registered", { priority: 99 })).not.toThrow();
        const items = itemsForCorner("bl");
        expect(items).toHaveLength(1);
        expect(items[0]?.priority).toBe(10);
    });

    it("updateItem propagates to mounted readers (reactivity preserved)", () => {
        // proves the SvelteMap's set notification reaches a $derived
        // consumer. without this, DockRegistration's in-place updates
        // would land in the registry but never flow to the dock's
        // itemsForCorner subscribers.
        const target = document.createElement("div");
        document.body.appendChild(target);
        const probe = mount(DockProbe, { target, props: { corner: "bl" } });
        try {
            register({ id: "a", corner: "bl", priority: 10, kind: "pill", render: noop });
            register({ id: "b", corner: "bl", priority: 20, kind: "pill", render: noop });
            flushSync();
            // initial sort: a (10) before b (20)
            expect(target.querySelector("[data-probe]")?.getAttribute("data-probe")).toBe("a,b");

            // bump a's priority above b's; sort should flip to b,a
            updateItem("a", { priority: 99 });
            flushSync();
            expect(target.querySelector("[data-probe]")?.getAttribute("data-probe")).toBe("b,a");
        } finally {
            void unmount(probe);
            target.remove();
        }
    });

    // forceCollapsible round-trip. used by the dock's force-collapse
    // pass to skip primary control surfaces (the debug menu at
    // priority 300 sets this to `false`). default is `undefined`
    // (treated as `true` at the consumer site in CanvasChromeDock).

    it("forceCollapsible: false round-trips through register + itemsForCorner", () => {
        register({
            id: "menu",
            corner: "bl",
            priority: 300,
            kind: "panel",
            render: noop,
            forceCollapsible: false,
        });
        const items = itemsForCorner("bl");
        expect(items).toHaveLength(1);
        expect(items[0]?.forceCollapsible).toBe(false);
    });

    it("forceCollapsible defaults to undefined when omitted at register time", () => {
        register({ id: "panel", corner: "bl", priority: 200, kind: "panel", render: noop });
        const items = itemsForCorner("bl");
        expect(items[0]?.forceCollapsible).toBeUndefined();
    });

    it("updateItem propagates forceCollapsible patches in place", () => {
        register({
            id: "menu",
            corner: "bl",
            priority: 300,
            kind: "panel",
            render: noop,
            forceCollapsible: false,
        });
        // patch back to default (true semantics) by flipping the field
        // and confirm the patch lands without disturbing other fields.
        updateItem("menu", { forceCollapsible: true });
        const items = itemsForCorner("bl");
        expect(items[0]?.forceCollapsible).toBe(true);
        expect(items[0]?.priority).toBe(300);
        expect(items[0]?.kind).toBe("panel");
    });

    it("DockRegistration rapid open/close cycle (20×) does not throw a duplicate-id error", () => {
        // mirrors the debug menu's `{#if debugMenuOpen}` mount path. each
        // flushSync flushes the gated DockRegistration's $effect:
        // register-then-unregister when `open` flips false-true-false.
        // a regression in register/unregister ordering would surface
        // here as a "duplicate id" throw on the first re-open.
        const target = document.createElement("div");
        document.body.appendChild(target);
        // svelte's `mount` return type doesn't carry the component's
        // exported function signatures through to ts; cast so the
        // setOpen call is typed rather than `any` (lint complains
        // about unsafe-call on the bare instance).
        const probe = mount(GatedDockRegistration, {
            target,
            props: {
                initialOpen: false,
                id: "menu",
                corner: "bl",
                priority: 300,
                kind: "panel",
                render: noop,
                forceCollapsible: false,
            },
        }) as { setOpen: (v: boolean) => void };
        try {
            for (let i = 0; i < 20; i++) {
                probe.setOpen(true);
                flushSync();
                expect(itemsForCorner("bl").map((it) => it.id)).toContain("menu");
                probe.setOpen(false);
                flushSync();
                expect(itemsForCorner("bl").map((it) => it.id)).not.toContain("menu");
            }
            // final state: closed. no orphaned entry in the registry.
            expect(itemsForCorner("bl")).toHaveLength(0);
        } finally {
            void unmount(probe);
            target.remove();
        }
    });

    it("DockRegistration registers with forceCollapsible: false reaching itemsForCorner", () => {
        // proves the prop threads end-to-end through the wrapper
        // (the unit-level updateItem patch is exercised above; this
        // case covers the mount-time register path).
        const target = document.createElement("div");
        document.body.appendChild(target);
        const probe = mount(GatedDockRegistration, {
            target,
            props: {
                initialOpen: true,
                id: "menu",
                corner: "bl",
                priority: 300,
                kind: "panel",
                render: noop,
                forceCollapsible: false,
            },
        });
        try {
            flushSync();
            const items = itemsForCorner("bl");
            expect(items).toHaveLength(1);
            expect(items[0]?.forceCollapsible).toBe(false);
        } finally {
            void unmount(probe);
            target.remove();
        }
    });

    // ---------- canvas-window-manager phase 0: focus-z-order spike ----------
    //
    // these tests pin the focus-z behavior: within `kind="window"` items
    // at the same priority, higher `focusedAt` (more recent focus event)
    // sorts first. critically, pills and non-window panels MUST NOT be
    // reordered by any focus event — proves save-status (priority 10,
    // kind="pill") never moves no matter what focusedAt churn the window-
    // kind items see.

    it("focusedAt desc tiebreaks SAME-priority window items, most-recent first", () => {
        register({
            id: "win-a",
            corner: "bl",
            priority: 200,
            kind: "window",
            render: noop,
            focusedAt: 100,
        });
        register({
            id: "win-b",
            corner: "bl",
            priority: 200,
            kind: "window",
            render: noop,
            focusedAt: 200,
        });
        const ids = itemsForCorner("bl").map((i) => i.id);
        // win-b focused more recently (200 > 100) → sorts first within
        // the priority-200 bucket
        expect(ids).toEqual(["win-b", "win-a"]);
    });

    it("focusedAt does NOT reorder across priorities — priority asc still wins", () => {
        register({
            id: "low",
            corner: "bl",
            priority: 100,
            kind: "window",
            render: noop,
            focusedAt: 1, // ancient focus
        });
        register({
            id: "high",
            corner: "bl",
            priority: 300,
            kind: "window",
            render: noop,
            focusedAt: 9999, // recent focus
        });
        // priority 100 still sorts before 300 even though "high" has a
        // much more recent focus event. focusedAt is a WITHIN-priority
        // tiebreaker only.
        expect(itemsForCorner("bl").map((i) => i.id)).toEqual(["low", "high"]);
    });

    it("save-status (kind='pill', priority 10) cannot be reordered by any focus event on a window sibling", () => {
        // simulate the production layout: save-status pill at priority
        // 10, a debug-menu window at priority 300. flip focusedAt on
        // the window through a series of focus events — save-status
        // stays first regardless.
        register({
            id: "save-status",
            corner: "bl",
            priority: 10,
            kind: "pill",
            render: noop,
        });
        register({
            id: "debug-menu",
            corner: "bl",
            priority: 300,
            kind: "window",
            render: noop,
            focusedAt: 1,
        });
        for (const ts of [1, 100, 999_999, 0, 42]) {
            updateItem("debug-menu", { focusedAt: ts });
            const ids = itemsForCorner("bl").map((i) => i.id);
            // save-status comes first under every focus event the window
            // sees. asserts the priority-asc rule has not been displaced
            // by any focusedAt branch escape.
            expect(ids[0]).toBe("save-status");
        }
    });

    it("focusedAt does NOT reorder same-priority pills (kind-scoped tiebreaker)", () => {
        // even if two pills shared a priority (which the priority-space
        // convention disallows in production but the registry tolerates),
        // a stale focusedAt on one must not reorder them. the
        // focusedAt-desc branch is gated on BOTH siblings being
        // kind="window".
        register({
            id: "pill-z",
            corner: "bl",
            priority: 20,
            kind: "pill",
            render: noop,
            focusedAt: 1,
        });
        register({
            id: "pill-a",
            corner: "bl",
            priority: 20,
            kind: "pill",
            render: noop,
            focusedAt: 9999,
        });
        // id-asc fallback wins for non-window items at the same priority
        expect(itemsForCorner("bl").map((i) => i.id)).toEqual(["pill-a", "pill-z"]);
    });

    it("focusedAt does NOT reorder a window vs a same-priority panel (mixed kind falls back to id)", () => {
        // mixed-kind pair at the same priority: id-asc fallback applies
        // because the focusedAt branch requires BOTH siblings to be
        // kind="window". this keeps the family-view debug panels (kind
        // panel) from being reordered if a future caller registers a
        // window at the same priority.
        register({
            id: "z-window",
            corner: "bl",
            priority: 230,
            kind: "window",
            render: noop,
            focusedAt: 9999,
        });
        register({
            id: "a-panel",
            corner: "bl",
            priority: 230,
            kind: "panel",
            render: noop,
        });
        expect(itemsForCorner("bl").map((i) => i.id)).toEqual(["a-panel", "z-window"]);
    });

    it("undefined focusedAt sorts after any defined focusedAt within window-kind priority bucket", () => {
        register({
            id: "never-focused",
            corner: "bl",
            priority: 200,
            kind: "window",
            render: noop,
        });
        register({
            id: "once-focused",
            corner: "bl",
            priority: 200,
            kind: "window",
            render: noop,
            focusedAt: 5,
        });
        // once-focused (5) > never-focused (-Infinity), so once sorts first
        expect(itemsForCorner("bl").map((i) => i.id)).toEqual(["once-focused", "never-focused"]);
    });

    it("idsByKind returns ids registered under the requested kind", () => {
        register({ id: "p1", corner: "bl", priority: 10, kind: "pill", render: noop });
        register({ id: "w1", corner: "bl", priority: 100, kind: "window", render: noop });
        register({ id: "w2", corner: "bl", priority: 200, kind: "window", render: noop });
        register({ id: "n1", corner: "bl", priority: 230, kind: "panel", render: noop });
        const windows = idsByKind("window").sort();
        expect(windows).toEqual(["w1", "w2"]);
        const pills = idsByKind("pill");
        expect(pills).toEqual(["p1"]);
    });

    it("itemsForCorner is reactive — a mounted reader re-renders on register / unregister", () => {
        // probe component reads itemsForCorner('bl') and writes the ids
        // into a data-attribute we can inspect after a flushSync cycle.
        // proves the rune-backed map updates downstream consumers.
        const target = document.createElement("div");
        document.body.appendChild(target);
        const probe = mount(DockProbe, { target, props: { corner: "bl" } });
        try {
            expect(target.querySelector("[data-probe]")?.getAttribute("data-probe")).toBe("");

            register({ id: "first", corner: "bl", priority: 10, kind: "pill", render: noop });
            // svelte 5 schedules effects micro-task style; force a flush
            // synchronously so the assertion runs against the post-effect dom.
            flushSync();
            expect(target.querySelector("[data-probe]")?.getAttribute("data-probe")).toBe("first");

            register({ id: "second", corner: "bl", priority: 5, kind: "pill", render: noop });
            flushSync();
            expect(target.querySelector("[data-probe]")?.getAttribute("data-probe")).toBe(
                "second,first",
            );

            unregister("second");
            flushSync();
            expect(target.querySelector("[data-probe]")?.getAttribute("data-probe")).toBe("first");
        } finally {
            void unmount(probe);
            target.remove();
        }
    });
});

// ---------- canvas-chrome-v2 phase 4: drag-to-reorder ----------
//
// `order` is the PRIMARY sort key (asc), ahead of priority. it defaults
// to 0, so until a reorder mutates it the block ties at 0 and the sort
// falls through to priority/focusedAt/id — i.e. default layout is
// unchanged. `reorderItem` rewrites the order values of a corner's
// draggable block (panels + windows, NOT pills) so the new sequence is
// stable. corner-scoped; never touches another corner.

describe("dockRegistry — phase 4 reorder", () => {
    afterEach(() => {
        clearRegistry();
    });

    it("default order=0 leaves existing priority-based ordering intact", () => {
        register({ id: "low", corner: "bl", priority: 25, kind: "window", render: noop });
        register({ id: "high", corner: "bl", priority: 300, kind: "window", render: noop });
        // no reorder yet — both tie at order 0, priority asc decides
        expect(itemsForCorner("bl").map((i) => i.id)).toEqual(["low", "high"]);
    });

    it("reorderItem moves a higher-priority window above a lower-priority one (the e2e case)", () => {
        // mirrors the production debug-menu (prio 300) vs stats-window
        // (prio 25): an order-after-priority tiebreaker could never flip
        // these; order-as-primary can.
        register({ id: "stats-window", corner: "bl", priority: 25, kind: "window", render: noop });
        register({ id: "debug-menu", corner: "bl", priority: 300, kind: "window", render: noop });
        // baseline: priority asc → stats, debug
        expect(itemsForCorner("bl").map((i) => i.id)).toEqual(["stats-window", "debug-menu"]);
        // drag debug-menu to the top (sort index 0)
        reorderItem("debug-menu", "bl", 0);
        expect(itemsForCorner("bl").map((i) => i.id)).toEqual(["debug-menu", "stats-window"]);
    });

    it("reorderItem repositions within the draggable block; itemsForCorner reflects it", () => {
        register({ id: "a", corner: "tl", priority: 10, kind: "window", render: noop });
        register({ id: "b", corner: "tl", priority: 20, kind: "window", render: noop });
        register({ id: "c", corner: "tl", priority: 30, kind: "window", render: noop });
        expect(itemsForCorner("tl").map((i) => i.id)).toEqual(["a", "b", "c"]);
        // move c to the front
        reorderItem("c", "tl", 0);
        expect(itemsForCorner("tl").map((i) => i.id)).toEqual(["c", "a", "b"]);
        // then move a to the end
        reorderItem("a", "tl", 2);
        expect(itemsForCorner("tl").map((i) => i.id)).toEqual(["c", "b", "a"]);
    });

    it("reorderItem assigns dense gapped order values across the block", () => {
        register({ id: "a", corner: "tl", priority: 10, kind: "window", render: noop });
        register({ id: "b", corner: "tl", priority: 20, kind: "window", render: noop });
        register({ id: "c", corner: "tl", priority: 30, kind: "window", render: noop });
        reorderItem("c", "tl", 0);
        // new sequence c,a,b → 0,10,20. c lands at order 0, which equals
        // its prior default (undefined ≡ 0) so the no-churn guard may
        // leave it undefined; normalize with ?? 0 since the sort treats
        // them identically.
        const byId = new Map(itemsForCorner("tl").map((it) => [it.id, it.order ?? 0]));
        expect(byId.get("c")).toBe(0);
        expect(byId.get("a")).toBe(10);
        expect(byId.get("b")).toBe(20);
    });

    it("reorderItem excludes pills from the draggable block (panels/windows only)", () => {
        register({ id: "pill", corner: "tl", priority: 5, kind: "pill", render: noop });
        register({ id: "w1", corner: "tl", priority: 10, kind: "window", render: noop });
        register({ id: "w2", corner: "tl", priority: 20, kind: "window", render: noop });
        // block is [w1, w2]; move w2 to front
        reorderItem("w2", "tl", 0);
        // pill keeps order 0 (untouched), windows get reassigned
        const items = itemsForCorner("tl");
        const pill = items.find((it) => it.id === "pill");
        expect(pill?.order ?? 0).toBe(0);
        // windows now ordered w2,w1 within their reassigned order values
        const windowIds = items.filter((it) => it.kind === "window").map((it) => it.id);
        expect(windowIds).toEqual(["w2", "w1"]);
    });

    it("reorderItem is corner-scoped — does not disturb another corner's order", () => {
        register({ id: "bl-a", corner: "bl", priority: 10, kind: "window", render: noop });
        register({ id: "bl-b", corner: "bl", priority: 20, kind: "window", render: noop });
        register({ id: "tr-a", corner: "tr", priority: 10, kind: "window", render: noop });
        register({ id: "tr-b", corner: "tr", priority: 20, kind: "window", render: noop });
        // reorder bl only
        reorderItem("bl-b", "bl", 0);
        expect(itemsForCorner("bl").map((i) => i.id)).toEqual(["bl-b", "bl-a"]);
        // tr untouched: still priority asc, both at default order 0
        expect(itemsForCorner("tr").map((i) => i.id)).toEqual(["tr-a", "tr-b"]);
        expect(itemsForCorner("tr").every((it) => (it.order ?? 0) === 0)).toBe(true);
    });

    it("reorderItem clamps an out-of-range index to the block end", () => {
        register({ id: "a", corner: "tl", priority: 10, kind: "window", render: noop });
        register({ id: "b", corner: "tl", priority: 20, kind: "window", render: noop });
        register({ id: "c", corner: "tl", priority: 30, kind: "window", render: noop });
        // index 99 clamps to len → a lands at the end
        reorderItem("a", "tl", 99);
        expect(itemsForCorner("tl").map((i) => i.id)).toEqual(["b", "c", "a"]);
    });

    it("reorderItem on an id not in the corner's block is a no-op", () => {
        register({ id: "a", corner: "tl", priority: 10, kind: "window", render: noop });
        register({ id: "b", corner: "tl", priority: 20, kind: "window", render: noop });
        // wrong corner: no-op, no throw, order untouched
        expect(() => reorderItem("a", "bl", 0)).not.toThrow();
        expect(itemsForCorner("tl").every((it) => (it.order ?? 0) === 0)).toBe(true);
        expect(itemsForCorner("tl").map((i) => i.id)).toEqual(["a", "b"]);
    });

    it("focus-to-front still works among same-priority windows after a no-op-order reorder", () => {
        // proves order-as-primary doesn't break the focusedAt tiebreaker:
        // when two windows share an order (0) AND a priority, focusedAt
        // desc still decides.
        register({
            id: "win-a",
            corner: "bl",
            priority: 200,
            kind: "window",
            render: noop,
            focusedAt: 100,
        });
        register({
            id: "win-b",
            corner: "bl",
            priority: 200,
            kind: "window",
            render: noop,
            focusedAt: 200,
        });
        // no reorder; both at order 0 → focusedAt desc → win-b first
        expect(itemsForCorner("bl").map((i) => i.id)).toEqual(["win-b", "win-a"]);
    });
});

// taskbar model (phase 6): reorderPills reorders the PILL row of a corner
// and mirrors the new order integer onto each pill's paired window so the
// docked-expanded window stack follows the taskbar. corner-scoped; pills
// carry a `windowId` linking them to their window.
describe("dockRegistry — phase 6 reorderPills", () => {
    afterEach(() => {
        clearRegistry();
    });

    it("reorders the pill block and reflects it in itemsForCorner", () => {
        register({ id: "p-a", corner: "tl", priority: 10, kind: "pill", render: noop });
        register({ id: "p-b", corner: "tl", priority: 20, kind: "pill", render: noop });
        register({ id: "p-c", corner: "tl", priority: 30, kind: "pill", render: noop });
        // baseline: priority asc
        expect(itemsForCorner("tl").map((i) => i.id)).toEqual(["p-a", "p-b", "p-c"]);
        // drag p-c to the front
        reorderPills("p-c", "tl", 0);
        expect(itemsForCorner("tl").map((i) => i.id)).toEqual(["p-c", "p-a", "p-b"]);
    });

    it("mirrors the pill order onto each pill's paired window so the panel stack follows", () => {
        // two pill↔window pairs in one corner. windows have their own
        // priorities; after a pill drag the windows must sort into the
        // pill-row order regardless of priority.
        register({
            id: "stats",
            corner: "bl",
            priority: 20,
            kind: "pill",
            render: noop,
            windowId: "stats-window",
        });
        register({
            id: "debug-toggle",
            corner: "bl",
            priority: 30,
            kind: "pill",
            render: noop,
            windowId: "debug-menu",
        });
        register({ id: "stats-window", corner: "bl", priority: 25, kind: "window", render: noop });
        register({ id: "debug-menu", corner: "bl", priority: 300, kind: "window", render: noop });

        // baseline windows: priority asc → stats-window, debug-menu
        const windowsBefore = itemsForCorner("bl")
            .filter((it) => it.kind === "window")
            .map((it) => it.id);
        expect(windowsBefore).toEqual(["stats-window", "debug-menu"]);

        // drag the debug-toggle pill to the front of the taskbar
        reorderPills("debug-toggle", "bl", 0);

        // pills now debug-toggle, stats
        const pillsAfter = itemsForCorner("bl")
            .filter((it) => it.kind === "pill")
            .map((it) => it.id);
        expect(pillsAfter).toEqual(["debug-toggle", "stats"]);

        // and the paired windows followed: debug-menu (order 0) now sorts
        // above stats-window (order 10), inverting the priority default.
        const windowsAfter = itemsForCorner("bl")
            .filter((it) => it.kind === "window")
            .map((it) => it.id);
        expect(windowsAfter).toEqual(["debug-menu", "stats-window"]);
    });

    it("is a no-op when the pill's paired window is not registered (closed)", () => {
        register({
            id: "stats",
            corner: "tl",
            priority: 20,
            kind: "pill",
            render: noop,
            windowId: "stats-window",
        });
        register({
            id: "debug-toggle",
            corner: "tl",
            priority: 30,
            kind: "pill",
            render: noop,
            windowId: "debug-menu",
        });
        // neither window registered — reorder still reorders the pills and
        // does not throw on the missing windows.
        expect(() => reorderPills("debug-toggle", "tl", 0)).not.toThrow();
        expect(
            itemsForCorner("tl")
                .filter((it) => it.kind === "pill")
                .map((it) => it.id),
        ).toEqual(["debug-toggle", "stats"]);
    });

    it("excludes windows/panels from the pill block (pills only)", () => {
        register({ id: "p-a", corner: "tl", priority: 10, kind: "pill", render: noop });
        register({ id: "w-b", corner: "tl", priority: 20, kind: "window", render: noop });
        register({ id: "p-c", corner: "tl", priority: 30, kind: "pill", render: noop });
        // pill block is [p-a, p-c]; move p-c to the front
        reorderPills("p-c", "tl", 0);
        const pills = itemsForCorner("tl")
            .filter((it) => it.kind === "pill")
            .map((it) => it.id);
        expect(pills).toEqual(["p-c", "p-a"]);
    });

    it("on an id not in the corner's pill block is a no-op", () => {
        register({ id: "p-a", corner: "tl", priority: 10, kind: "pill", render: noop });
        register({ id: "p-b", corner: "tl", priority: 20, kind: "pill", render: noop });
        expect(() => reorderPills("p-a", "bl", 0)).not.toThrow();
        expect(itemsForCorner("tl").map((i) => i.id)).toEqual(["p-a", "p-b"]);
    });
});
