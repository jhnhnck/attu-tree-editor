<!-- SPDX-License-Identifier: MIT -->
<!--
    phase 1 — full surface. renders:
      floating panels at (x, y) with z-index 30+z
      active dialog at z-index 50+
    uses window resize event + document viewport for clampAll.
    DockCorner handles the docked pill/panel stack (not this component).
-->
<script lang="ts">
    import { dockStore } from "./store.svelte.js";

    // clamp all floating panels to the viewport on resize
    $effect(() => {
        function onResize(): void {
            const rect = document.documentElement.getBoundingClientRect();
            dockStore.clampAll(rect);
        }
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    });
</script>

<div
    class="pointer-events-none fixed inset-0 z-30"
    aria-hidden="true"
    data-dock-surface
>
    <!-- floating panels: rendered at (x, y) with z-index 30+z -->
    {#each dockStore.floatingPanels as { item, pos } (item.id)}
        <div
            class="pointer-events-auto absolute"
            style="left:{pos.x}px;top:{pos.y}px;z-index:{30 + pos.z};"
            data-floating-id={item.id}
        >
            {@render item.render({ forcedCollapse: false })}
        </div>
    {/each}

    <!-- dialog layer: z-index 50+ -->
    {#if dockStore.activeDialog !== undefined}
        {#each dockStore.dialogs as item (item.id)}
            {#if item.id === dockStore.activeDialog}
                <div
                    class="pointer-events-auto"
                    style="position:fixed;inset:0;z-index:50;"
                >
                    {@render item.render({ forcedCollapse: false })}
                </div>
            {/if}
        {/each}
    {/if}
</div>
