<!--
    FamilyTreeEditor - lightweight floating menu anchored at a viewport point
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onMount, onDestroy } from "svelte";

    export interface ContextMenuButton {
        label: string;
        onclick: () => void;
        disabled?: boolean;
    }
    export interface ContextMenuDivider {
        divider: true;
    }
    export type ContextMenuItem = ContextMenuButton | ContextMenuDivider;

    interface Props {
        x: number;
        y: number;
        items: readonly ContextMenuItem[];
        onclose: () => void;
    }

    let { x, y, items, onclose }: Props = $props();

    function isDivider(item: ContextMenuItem): item is ContextMenuDivider {
        return "divider" in item;
    }

    let menuEl: HTMLDivElement | undefined = $state();

    function onWindowDown(e: PointerEvent): void {
        if (!menuEl) return;
        if (e.target instanceof Node && menuEl.contains(e.target)) return;
        onclose();
    }
    function onKey(e: KeyboardEvent): void {
        if (e.key === "Escape") onclose();
    }

    onMount(() => {
        // capture-phase so we close before any re-open elsewhere
        window.addEventListener("pointerdown", onWindowDown, true);
        window.addEventListener("keydown", onKey);
    });
    onDestroy(() => {
        window.removeEventListener("pointerdown", onWindowDown, true);
        window.removeEventListener("keydown", onKey);
    });

    // clamp into the viewport so a click near the right/bottom edge still
    // fits the whole menu on screen
    let position = $derived.by(() => {
        const W = 200;
        const H = items.length * 32 + 8;
        const maxX = (typeof window !== "undefined" ? window.innerWidth : 1024) - W - 4;
        const maxY = (typeof window !== "undefined" ? window.innerHeight : 768) - H - 4;
        return { left: Math.max(4, Math.min(x, maxX)), top: Math.max(4, Math.min(y, maxY)) };
    });
</script>

<div
    bind:this={menuEl}
    class="bg-canvas-elev text-fg border-line fixed z-50 min-w-40 rounded-md border py-1 shadow-xl"
    style:left="{position.left}px"
    style:top="{position.top}px"
    role="menu"
>
    {#each items as item, i (i)}
        {#if isDivider(item)}
            <div class="border-line my-1 border-t" role="separator"></div>
        {:else}
            {@const btn = item as ContextMenuButton}
            <button
                type="button"
                role="menuitem"
                class="hover:bg-canvas focus:bg-canvas block w-full px-3 py-1.5 text-left text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                disabled={btn.disabled ?? false}
                onclick={() => {
                    if (btn.disabled) return;
                    btn.onclick();
                    onclose();
                }}
            >
                {btn.label}
            </button>
        {/if}
    {/each}
</div>
