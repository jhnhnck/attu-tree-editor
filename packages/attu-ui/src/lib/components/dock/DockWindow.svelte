<!-- SPDX-License-Identifier: MIT -->
<!--
    phase 0 stub — title + minimize + close chrome only.
    no pop-out, no drag, no focus flash. full chrome in phase 1.
    styles are scoped here (same pattern as old Window.svelte); the
    global .fte-window-* theme tokens are added to theme.css in phase 1.
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import { dockStore } from "./store.svelte.js";

    interface Props {
        id: string;
        title: string;
        body: Snippet;
        // false → hide close button
        closeable?: boolean;
    }

    let { id, title, body, closeable = true }: Props = $props();

    const expanded = $derived(dockStore.isExpanded(id));
</script>

<div class="window-stack" data-window-id={id}>
    <div class="window-titlebar">
        <span class="window-title">{title}</span>
        <div class="flex items-center gap-1">
            <button
                type="button"
                class="fte-window-button"
                aria-label={expanded ? "minimize" : "expand"}
                onclick={() => dockStore.toggleExpanded(id)}
            >
                {expanded ? "⌃" : "⌄"}
            </button>
            {#if closeable}
                <button
                    type="button"
                    class="fte-window-button"
                    aria-label="close"
                    onclick={() => dockStore.closeWindow(id)}
                >×</button>
            {/if}
        </div>
    </div>
    {#if expanded}
        <div class="window-body">
            {@render body()}
        </div>
    {/if}
</div>

<style>
    .window-stack {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        width: var(--fte-window-width, 18rem);
        border-radius: 0.375rem;
        border: 1px solid var(--color-line);
        background: color-mix(in srgb, var(--color-canvas-elev) 80%, transparent);
        backdrop-filter: blur(4px);
        overflow: hidden;
    }

    .window-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem;
        color: var(--color-fg-muted);
        font-size: 0.75rem;
        line-height: 1rem;
        min-height: 1.75rem;
    }

    .window-title {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-transform: lowercase;
    }

    .window-body {
        padding: 0.5rem;
        border-top: 1px solid var(--color-line);
        font-size: 0.75rem;
    }
</style>
