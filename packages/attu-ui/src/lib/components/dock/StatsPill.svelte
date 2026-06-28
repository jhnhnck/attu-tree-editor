<!-- SPDX-License-Identifier: MIT -->
<!--
    shared stats pill + panel pair.
    both apps import this; wiki-editor passes a rows array,
    tree-editor overrides pill and body snippets for its interactive UI.
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import { BarChart3 } from "@lucide/svelte";
    import { dockStore, type DockCorner, type DockRenderSnippet } from "./store.svelte.js";
    import DockEntry from "./DockEntry.svelte";
    import DockPanel from "./DockPanel.svelte";

    export type StatsRow = { label: string; value: string | number };

    interface Props {
        panelId?: string;
        pillId?: string;
        corner: DockCorner;
        priority?: number;
        // text shown on the pill button in the dock
        pillLabel?: string;
        // rows shown in the panel body
        rows?: StatsRow[];
        // override the pill button; receives forcedCollapse ctx
        pill?: DockRenderSnippet;
        // override the panel body (no args)
        body?: Snippet;
    }

    let {
        panelId = "stats-window",
        pillId = "stats",
        corner,
        priority = 20,
        pillLabel = "- words",
        rows = [],
        pill,
        body,
    }: Props = $props();
</script>

{#snippet defaultPill()}
    <button
        type="button"
        class="fte-pill gap-1.5"
        aria-pressed={dockStore.isExpanded(panelId)}
        onclick={() => dockStore.togglePanel(panelId)}
    ><BarChart3 size={12} />{pillLabel}</button>
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

{#snippet panelRender(_ctx: { forcedCollapse: boolean })}
    <DockPanel id={panelId} title="stats" body={body ?? defaultBody} />
{/snippet}

<DockEntry
    id={pillId}
    kind="pill"
    {corner}
    {priority}
    panelId={panelId}
    render={pillRender}
/>
<DockEntry
    id={panelId}
    kind="panel"
    {corner}
    priority={priority + 5}
    title="stats"
    render={panelRender}
/>
