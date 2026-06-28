<!-- SPDX-License-Identifier: MIT -->
<!--
    shared save-status pill + panel pair.
    both apps import this; wiki-editor uses defaults, tree-editor
    overrides pill and body snippets for its complex dual-indicator UI.
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import { Save } from "@lucide/svelte";
    import { dockStore, type DockCorner, type DockRenderSnippet } from "./store.svelte.js";
    import DockEntry from "./DockEntry.svelte";
    import DockPanel from "./DockPanel.svelte";

    interface Props {
        panelId?: string;
        pillId?: string;
        corner: DockCorner;
        priority?: number;
        closeable?: boolean;
        // override the pill button; receives forcedCollapse ctx
        pill?: DockRenderSnippet;
        // override the panel body (no args)
        body?: Snippet;
    }

    let {
        panelId = "save-status-window",
        pillId = "save-status",
        corner,
        priority = 10,
        closeable = false,
        pill,
        body,
    }: Props = $props();
</script>

{#snippet defaultPill()}
    <button
        type="button"
        class="fte-pill fte-pill-icon"
        aria-pressed={dockStore.isExpanded(panelId)}
        onclick={() => dockStore.togglePanel(panelId)}
    ><Save size={12} /></button>
{/snippet}

{#snippet defaultBody()}
    <div class="fte-window-row"><span>Last saved</span><span>-</span></div>
    <button type="button" class="fte-window-button pointer-events-none opacity-50" disabled>
        Save now
    </button>
{/snippet}

{#snippet pillRender(ctx: { forcedCollapse: boolean })}
    {#if pill}
        {@render pill(ctx)}
    {:else}
        {@render defaultPill()}
    {/if}
{/snippet}

{#snippet panelRender(_ctx: { forcedCollapse: boolean })}
    <DockPanel id={panelId} title="save" {closeable} body={body ?? defaultBody} />
{/snippet}

<DockEntry
    id={pillId}
    kind="pill"
    {corner}
    {priority}
    {closeable}
    panelId={panelId}
    render={pillRender}
/>
<DockEntry
    id={panelId}
    kind="panel"
    {corner}
    priority={priority + 5}
    title="save"
    {closeable}
    render={panelRender}
/>
