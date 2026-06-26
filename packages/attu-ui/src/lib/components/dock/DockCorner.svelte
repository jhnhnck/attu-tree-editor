<!-- SPDX-License-Identifier: MIT -->
<!--
    phase 0 stub — pill row + panel stack from dockStore; data-canvas-chrome.
    no drag-to-reorder, no modal close chips. full implementation in phase 1.

    layout mirrors old CanvasChromeDock: pills in a flex-row taskbar,
    panels stacking away from the corner. corner-aware flex direction:
    bl/br → flex-col-reverse (pills at bottom, panels above).
    tl/tr → flex-col (pills at top, panels below).

    windows render in the panel stack only when docked-expanded.
    pop-out support added in phase 1 (floating windows skip the stack).
-->
<script lang="ts">
    import { dockStore, type DockCorner } from "./store.svelte.js";

    interface Props {
        corner: DockCorner;
    }

    let { corner }: Props = $props();

    const items = $derived(dockStore.itemsForCorner(corner));
    const pills = $derived(items.filter((it) => it.kind === "pill"));
    // windows appear in the panel stack only when docked-expanded
    // (no "panel" kind in new system; only "pill" and "window")
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
                {#each pills as item (item.id)}
                    <div
                        class="pointer-events-auto relative"
                        data-dock-pill-id={item.id}
                    >
                        {@render item.render({ forcedCollapse: false })}
                    </div>
                {/each}
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
