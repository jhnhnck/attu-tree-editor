<!-- SPDX-License-Identifier: MIT -->
<!--
    canvas-chrome dock — one container per corner that mounts the items
    registered via `dockRegistry`. the active corner is driven by
    `dockConfig.corner` (persisted to fte.dock.corner); App.svelte mounts
    a single instance bound to that value and all DockRegistrations bind
    their corner to it, so changing the corner re-homes every item.

    items split into two blocks per corner: pills render in a single
    horizontal row (the taskbar), panels stack vertically. the pills
    block is ALWAYS the first child, so the corner's flex direction lands
    it at the anchored edge: tl/tr (flex-col) put pills at the top with
    panels hanging below; bl/br (flex-col-reverse) put pills at the bottom
    with panels stacking above. docked windows therefore always expand
    AWAY from the anchored corner, never toward / under it.

    the outer container carries `data-canvas-chrome` so `fitToView`
    accounts for the docked items as overlay chrome. an empty corner
    (zero items registered) renders nothing.

    overflow: `overflow-y: clip` clips items that exceed the corner's
    max height. the container stretches from the corner anchor to the
    opposite edge (top-3 to bottom-3 for tl), so overflow clips
    naturally without the force-collapse machinery that phase 0 retires.

    taskbar model (phase 6) drag-to-reorder: the dock OWNS the reorder
    gesture and it now lives on the TASKBAR PILLS, not the docked-window
    titlebars (most menus are minimized, so they have no titlebar to grab).
    a pointerdown on a pill in [data-dock-pills] starts the gesture; the
    pointer math runs HORIZONTALLY (clientX vs pill-rect midpoints) since
    the pill row is flex-row / flex-wrap. the drop-indicator is a vertical
    1px accent line painted between pills. dragging a pill reorders the
    taskbar AND, via reorderPills, mirrors the new order onto each pill's
    paired window so a docked-expanded window appears in the corresponding
    position in the panel stack.
-->
<script lang="ts">
    import { untrack } from "svelte";
    import { itemsForCorner, reorderPills, type DockCorner } from "./dockRegistry.svelte";
    import { windowManager } from "./windowManager.svelte";

    interface Props {
        corner: DockCorner;
    }

    let { corner }: Props = $props();

    // hide popped-out windows from the dock — they paint in the
    // WindowOverlay (z-30..z-49) instead.
    const items = $derived(
        itemsForCorner(corner).filter(
            (it) => !(it.kind === "window" && windowManager.isPoppedOut(it.id)),
        ),
    );
    const pills = $derived(items.filter((it) => it.kind === "pill"));
    // taskbar model (phase 6): a docked window renders its surface ONLY when
    // docked-expanded. a docked-MINIMIZED window contributes nothing to the
    // panel stack — only its taskbar pill represents it. non-window panels
    // (kind="panel") always render. floating windows are already filtered out
    // above (they paint in WindowOverlay).
    const panels = $derived(
        items.filter(
            (it) =>
                it.kind === "panel" ||
                (it.kind === "window" && windowManager.windowState(it.id) === "docked-expanded"),
        ),
    );

    // corner-specific outer positioning + flex direction.
    // tl/tr anchor to the top edge and expand downward (flex-col).
    // bl/br anchor to the bottom edge and expand upward (flex-col-reverse).
    // taskbar model (phase 6): the container hugs the anchored corner and
    // expands away from it, rather than spanning the full edge. dropped the
    // opposite-edge span (e.g. the `bottom-3` on tl) so the dock no longer
    // stretches the whole height of the viewport.
    const cornerClass: Record<DockCorner, string> = {
        bl: "left-3 bottom-3 flex-col-reverse items-start",
        tl: "top-3 left-3 flex-col items-start",
        tr: "top-3 right-3 flex-col items-end",
        br: "right-3 bottom-3 flex-col-reverse items-end",
    };
    // inner panel-stack direction. tl/tr expand downward → flex-col;
    // bl/br expand upward → flex-col-reverse.
    const panelStackClass: Record<DockCorner, string> = {
        bl: "flex flex-col-reverse gap-2 items-start",
        br: "flex flex-col-reverse gap-2 items-end",
        tl: "flex flex-col gap-2 items-start",
        tr: "flex flex-col gap-2 items-end",
    };
    const pillRowClass: Record<DockCorner, string> = {
        bl: "flex flex-row flex-wrap gap-2 items-end",
        br: "flex flex-row flex-wrap gap-2 items-end justify-end",
        tl: "flex flex-row flex-wrap gap-2 items-start",
        tr: "flex flex-row flex-wrap gap-2 items-start justify-end",
    };

    const cornerLabels: Record<DockCorner, string> = {
        bl: "bottom-left",
        tl: "top-left",
        tr: "top-right",
        br: "bottom-right",
    };

    // ---------- taskbar pill drag-to-reorder (phase 6) ----------
    // the pill row is flex-row + flex-wrap. pills lay out left→right in
    // DOM (= sort) order for every corner, so a single horizontal mid-point
    // scan in screen-x maps directly to a sort insert index — no reversal
    // flag needed (unlike the old vertical panel math).
    //
    // reorder gesture state. `reordering` gates the drop-indicator render.
    // dropIndex is a FULL-array insert index over the pill block (null =
    // pointer left the pill row → drop is a no-op / cancel).
    let reordering = $state(false);
    let dropIndex = $state<number | null>(null);
    let dragId: string | null = null;
    // active pointer id so the document-level handlers ignore events from a
    // sibling pointer (e.g. a concurrent floating-window drag in
    // Window.svelte attaches its own capture-phase pointermove).
    let activePointerId: number | null = null;
    // the pill-row element captured at gesture start so pointermove can
    // read its children's rects without a fresh query walk.
    let pillsEl: HTMLElement | null = null;
    // press coords + whether the pointer moved past the drag threshold. a
    // press-and-release WITHOUT crossing the threshold is a plain click
    // (it falls through to the pill's onclick → pillClick). a real drag
    // crosses the threshold and we then SWALLOW the trailing synthetic
    // click so a reorder gesture doesn't also toggle the pill's window.
    let pressX = 0;
    let pressY = 0;
    let draggedFar = false;
    const DRAG_THRESHOLD_PX = 4;

    // the dragged pill's current SORT index within the pill block,
    // recomputed live so pointerup can skip a no-op reorder.
    function currentDragSortIndex(): number {
        if (dragId === null) return -1;
        return pills.findIndex((it) => it.id === dragId);
    }

    // one-shot capture-phase click swallow, armed by a real drag so the
    // synthetic click that follows pointerup doesn't fire the pill's
    // onclick (which would toggle its window). removes itself after one
    // event regardless of whether it fired on a pill.
    function swallowNextClick(e: MouseEvent): void {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener("click", swallowNextClick, true);
    }

    function onDocPointerMove(e: PointerEvent): void {
        if (!reordering || pillsEl === null) return;
        if (activePointerId !== null && e.pointerId !== activePointerId) return;

        // arm the click-swallow once the pointer crosses the drag threshold.
        if (
            !draggedFar &&
            (Math.abs(e.clientX - pressX) > DRAG_THRESHOLD_PX ||
                Math.abs(e.clientY - pressY) > DRAG_THRESHOLD_PX)
        ) {
            draggedFar = true;
        }

        const rect = pillsEl.getBoundingClientRect();
        // outside the pill row (off the taskbar) → cancel the drop. no slop
        // on purpose so a release away from the pills is a clean no-op.
        if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
        ) {
            dropIndex = null;
            e.preventDefault();
            return;
        }

        // each pill wrapper carries data-dock-pill-id. querySelectorAll
        // returns DOM order (= sort order); pills lay out left→right in sort
        // order for every corner, so reason in pure screen-x. the slot the
        // pointer-x falls into: 0 = before the leftmost pill, n = after the
        // rightmost, k = between pills k-1 and k.
        const mids = Array.from(pillsEl.querySelectorAll<HTMLElement>("[data-dock-pill-id]")).map(
            (el) => {
                const r = el.getBoundingClientRect();
                return r.left + r.width / 2;
            },
        );
        const n = mids.length;
        let slot = n;
        for (let i = 0; i < n; i++) {
            if (e.clientX < mids[i]!) {
                slot = i;
                break;
            }
        }
        dropIndex = slot;
        e.preventDefault();
    }

    function onDocPointerUp(e: PointerEvent): void {
        if (!reordering) return;
        if (activePointerId !== null && e.pointerId !== activePointerId) return;
        const id = dragId;
        const target = dropIndex;
        const from = currentDragSortIndex();
        endReorder();
        // `target` is a FULL-array insert index (every pill, incl. the
        // dragged one, is rendered during the drag so the pointer math
        // counts it). reorderPills splices the dragged pill out FIRST, so
        // it expects a POST-removal index: when dropping after the origin
        // (target > from) every slot after `from` shifted left by one, so
        // decrement. dropping at/just-after the origin is a no-op.
        if (id !== null && target !== null && from !== -1) {
            const newIndex = target > from ? target - 1 : target;
            if (newIndex !== from) reorderPills(id, corner, newIndex);
        }
        // a real drag emits a trailing synthetic click — swallow it so the
        // reorder doesn't also fire the pill's onclick (toggle its window).
        // a threshold-less press (plain click) leaves draggedFar false so
        // pillClick still runs normally.
        if (draggedFar) {
            document.addEventListener("click", swallowNextClick, true);
        }
        e.preventDefault();
    }

    function onDocPointerCancel(e: PointerEvent): void {
        if (!reordering) return;
        if (activePointerId !== null && e.pointerId !== activePointerId) return;
        endReorder();
        e.preventDefault();
    }

    function endReorder(): void {
        reordering = false;
        dropIndex = null;
        dragId = null;
        activePointerId = null;
        pillsEl = null;
        draggedFar = false;
        document.removeEventListener("pointermove", onDocPointerMove, true);
        document.removeEventListener("pointerup", onDocPointerUp, true);
        document.removeEventListener("pointercancel", onDocPointerCancel, true);
    }

    // pill pointerdown → start a reorder drag. attached to each pill
    // wrapper in the pills block. ignores secondary buttons; resolves the
    // pill row from the event target so pointermove can read the pill rects.
    function onPillPointerDown(id: string, e: PointerEvent): void {
        if (e.button !== undefined && e.button !== 0) return;
        const startTarget = e.target as Element | null;
        const region = startTarget?.closest<HTMLElement>("[data-dock-pills]") ?? null;
        if (region === null) return;
        pillsEl = region;
        dragId = id;
        activePointerId = e.pointerId;
        dropIndex = null;
        reordering = true;
        pressX = e.clientX;
        pressY = e.clientY;
        draggedFar = false;
        // capture-phase listeners so the canvas pan / card-selection
        // pipelines never see the same pointer stream during the drag.
        document.addEventListener("pointermove", onDocPointerMove, true);
        document.addEventListener("pointerup", onDocPointerUp, true);
        document.addEventListener("pointercancel", onDocPointerCancel, true);
        // do NOT preventDefault here: the pill's own onclick (pillClick)
        // must still fire on a plain click (press + release with no move).
        // reorderPills no-ops when the drop index equals the origin, so a
        // click-without-drag leaves order untouched.
    }

    // clean up any in-flight listeners if the dock unmounts mid-drag
    // (corner switch re-mounts the whole instance). untracked so reading
    // `reordering` doesn't add it to the effect's dep set.
    $effect(() => () => untrack(() => endReorder()));

    // the drop-indicator renders as a flex child inserted BEFORE the pill
    // at DOM index `dropIndex` (trailing when dropIndex === pills.length).
    // DOM order equals sort order, and dropIndex is a sort-space index, so
    // inserting before DOM child `dropIndex` lands the indicator at the
    // correct visual gap.
</script>

{#if items.length > 0}
    <div
        class={`pointer-events-none absolute flex z-30 gap-2 overflow-y-clip ${cornerClass[corner]}`}
        role="region"
        aria-label={`canvas chrome · ${cornerLabels[corner]}`}
        data-canvas-chrome
        data-testid={`canvas-chrome-dock-${corner}`}
    >
        {#if pills.length > 0}
            <div
                class={pillRowClass[corner]}
                data-dock-pills
                data-testid={`canvas-chrome-pills-${corner}`}
            >
                {#each pills as item, i (item.id)}
                    {#if reordering && dropIndex === i}
                        <div
                            class="fte-dock-drop-indicator-v pointer-events-none"
                            data-testid="dock-drop-indicator"
                        ></div>
                    {/if}
                    <!-- the wrapper is a passive drag handle; the pill it
                         wraps is the real interactive button (it carries the
                         onclick + aria-pressed). svelte-ignore the static-
                         interaction rule the way HyperbolicCanvas's pan
                         surface does for the same wrapper-drag pattern. -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="pointer-events-auto relative"
                        data-dock-pill-id={item.id}
                        onpointerdown={(e: PointerEvent) => onPillPointerDown(item.id, e)}
                    >
                        {@render item.render({ forcedCollapse: false })}
                    </div>
                {/each}
                {#if reordering && dropIndex === pills.length}
                    <div
                        class="fte-dock-drop-indicator-v pointer-events-none"
                        data-testid="dock-drop-indicator"
                    ></div>
                {/if}
            </div>
        {/if}
        {#if panels.length > 0}
            <div
                class={panelStackClass[corner]}
                data-dock-panels
                data-testid={`canvas-chrome-panels-${corner}`}
            >
                {#each panels as item (item.id)}
                    <div class="pointer-events-auto relative" data-dock-item-id={item.id}>
                        {@render item.render({ forcedCollapse: false })}
                    </div>
                {/each}
            </div>
        {/if}
    </div>
{/if}

<style>
    /* taskbar pill reorder insert line (phase 6). a 1px-wide accent rule
       painted between pills at the drop slot. vertical because the pill row
       is flex-row; height stretches to the pill height via align-self. the
       accent token matches the rest of the shell chrome. */
    .fte-dock-drop-indicator-v {
        align-self: stretch;
        width: 1px;
        min-height: 1.25rem;
        background: var(--color-accent);
        border-radius: 1px;
    }
</style>
