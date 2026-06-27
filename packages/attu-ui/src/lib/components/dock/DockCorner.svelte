<!-- SPDX-License-Identifier: MIT -->
<!--
    phase 1 — full corner chrome. adds:
      drag-to-reorder pills (pointer events, 4px threshold, drop indicator)
      modal close chip (renders in pill row when dockStore.activeModal is set)
      pop-out windows skip the panel stack (only "expanded" windows show there)

    layout: pills in a flex-row taskbar, panels stacking away from the corner.
    bl/br → flex-col-reverse (pills at bottom, panels above).
    tl/tr → flex-col (pills at top, panels below).
-->
<script lang="ts">
    import { dockStore, type DockCorner } from "./store.svelte.js";

    interface Props {
        corner: DockCorner;
    }

    let { corner }: Props = $props();

    const items = $derived(dockStore.itemsForCorner(corner));
    const pills = $derived(items.filter((it) => it.kind === "pill"));
    // only docked-expanded windows appear in the panel stack
    // (floating windows are rendered by DockSurface)
    const panels = $derived(
        items.filter(
            (it) => it.kind === "window" && dockStore.windowState(it.id) === "expanded",
        ),
    );

    const cornerClass: Record<DockCorner, string> = {
        bl: "left-3 bottom-3 flex-col-reverse items-start",
        tl: "top-3 left-3 flex-col items-start",
        tr: "top-3 right-3 flex-col items-end",
        br: "right-3 bottom-3 flex-col-reverse items-end",
    };

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

    // --- drag-to-reorder pills ---
    let dragState = $state<{
        draggingId: string;
        startX: number;
        startY: number;
        started: boolean;
        dropIndex: number;
    } | null>(null);
    const DRAG_THRESHOLD = 4;

    function onPillPointerDown(e: PointerEvent, pillId: string): void {
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        dragState = {
            draggingId: pillId,
            startX: e.clientX,
            startY: e.clientY,
            started: false,
            dropIndex: pills.findIndex(p => p.id === pillId),
        };
    }

    function onPillPointerMove(e: PointerEvent): void {
        if (!dragState) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (!dragState.started && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
        dragState = { ...dragState, started: true };
        // compute drop index based on pointer x relative to pill row
        // use pill elements to determine insertion point
        const row = document.querySelector(`[data-dock-pills][data-corner="${corner}"]`);
        if (!row) return;
        const pillEls = [...row.querySelectorAll("[data-dock-pill-id]")] as HTMLElement[];
        let newIndex = pills.length;
        for (let i = 0; i < pillEls.length; i++) {
            const rect = pillEls[i]!.getBoundingClientRect();
            if (e.clientX < rect.left + rect.width / 2) {
                newIndex = i;
                break;
            }
        }
        dragState = { ...dragState, dropIndex: newIndex };
    }

    function onPillPointerUp(): void {
        if (!dragState || !dragState.started) {
            dragState = null;
            return;
        }
        // build new order array
        const draggingId = dragState.draggingId;
        const dropIndex = dragState.dropIndex;
        const newOrder = pills
            .filter(p => p.id !== draggingId)
            .map(p => p.id);
        newOrder.splice(dropIndex, 0, draggingId);
        dockStore.reorderPills(corner, newOrder);
        dragState = null;
    }
</script>

{#if items.length > 0}
    <div
        class={`pointer-events-none absolute flex z-30 gap-2 overflow-y-clip ${cornerClass[corner]}`}
        role="region"
        aria-label={`canvas chrome · ${cornerLabels[corner]}`}
        data-canvas-chrome
        data-testid={`canvas-chrome-dock-${corner}`}
    >
        {#if pills.length > 0 || dockStore.activeModal !== undefined}
            <div
                class={pillRowClass[corner]}
                data-dock-pills
                data-corner={corner}
                data-testid={`canvas-chrome-pills-${corner}`}
            >
                {#each pills as item (item.id)}
                    <div
                        class="pointer-events-auto relative"
                        data-dock-pill-id={item.id}
                        style={dragState?.draggingId === item.id && dragState.started
                            ? "opacity: 0.5;"
                            : ""}
                        onpointerdown={(e) => onPillPointerDown(e, item.id)}
                        onpointermove={onPillPointerMove}
                        onpointerup={onPillPointerUp}
                        role="none"
                    >
                        {#if dragState?.started && dragState.dropIndex === pills.indexOf(item)}
                            <div class="drop-indicator"></div>
                        {/if}
                        {@render item.render({ forcedCollapse: false })}
                    </div>
                {/each}
                {#if dragState?.started && dragState.dropIndex === pills.length}
                    <div class="drop-indicator"></div>
                {/if}
                <!-- modal close chip: appears when a modal is active -->
                {#if dockStore.activeModal !== undefined}
                    {@const modalId = dockStore.activeModal}
                    {@const modalItem = dockStore.modalItems.find(m => m.id === modalId)}
                    <button
                        type="button"
                        class="fte-taskbar-modal-chip pointer-events-auto"
                        onclick={() => dockStore.closeModal()}
                        data-testid="modal-chip"
                    >
                        {modalItem?.title ?? modalId} ×
                    </button>
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
    .drop-indicator {
        position: absolute;
        left: -3px;
        top: 0;
        bottom: 0;
        width: 2px;
        background: var(--color-accent);
        border-radius: 1px;
        pointer-events: none;
    }
</style>
