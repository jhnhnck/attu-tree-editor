<!-- SPDX-License-Identifier: MIT -->
<!--
    shared stats pill + window pair.
    both apps import this; wiki-editor passes a rows array,
    tree-editor overrides pill and body snippets for its interactive UI.
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import { dockStore, type DockCorner, type DockRenderSnippet } from "./store.svelte.js";
    import DockItem from "./DockItem.svelte";
    import DockWindow from "./DockWindow.svelte";

    export type StatsRow = { label: string; value: string | number };

    interface Props {
        windowId?: string;
        pillId?: string;
        corner: DockCorner;
        priority?: number;
        // text shown on the pill button in the dock
        pillLabel?: string;
        // rows shown in the window body
        rows?: StatsRow[];
        // override the pill button; receives forcedCollapse ctx
        pill?: DockRenderSnippet;
        // override the window body (no args)
        body?: Snippet;
    }

    let {
        windowId = "stats-window",
        pillId = "stats",
        corner,
        priority = 20,
        pillLabel = "— words",
        rows = [],
        pill,
        body,
    }: Props = $props();
</script>

{#snippet defaultPill()}
    <button
        type="button"
        class="fte-pill"
        aria-pressed={dockStore.isExpanded(windowId)}
        onclick={() => dockStore.pillClick(windowId)}
    >{pillLabel}</button>
{/snippet}

{#snippet defaultBody()}
    {#each rows as row}
        <div class="fte-window-row"><span>{row.label}</span><span>{String(row.value)}</span></div>
    {/each}
{/snippet}

{#snippet pillRender(ctx: { forcedCollapse: boolean })}
    {#if pill}
        {@render pill(ctx)}
    {:else}
        {@render defaultPill()}
    {/if}
{/snippet}

{#snippet windowRender(_ctx: { forcedCollapse: boolean })}
    <DockWindow id={windowId} title="stats" body={body ?? defaultBody} />
{/snippet}

<DockItem
    id={pillId}
    kind="pill"
    {corner}
    {priority}
    windowId={windowId}
    render={pillRender}
/>
<DockItem
    id={windowId}
    kind="window"
    {corner}
    priority={priority + 5}
    title="stats"
    render={windowRender}
/>
