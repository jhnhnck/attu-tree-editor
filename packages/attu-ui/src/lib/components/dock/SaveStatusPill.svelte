<!-- SPDX-License-Identifier: MIT -->
<!--
    shared save-status pill + window pair.
    both apps import this; wiki-editor uses defaults, tree-editor
    overrides pill and body snippets for its complex dual-indicator UI.
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import { Save } from "@lucide/svelte";
    import { dockStore, type DockCorner, type DockRenderSnippet } from "./store.svelte.js";
    import DockItem from "./DockItem.svelte";
    import DockWindow from "./DockWindow.svelte";

    interface Props {
        windowId?: string;
        pillId?: string;
        corner: DockCorner;
        priority?: number;
        closeable?: boolean;
        // override the pill button; receives forcedCollapse ctx
        pill?: DockRenderSnippet;
        // override the window body (no args)
        body?: Snippet;
    }

    let {
        windowId = "save-status-window",
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
        aria-pressed={dockStore.isExpanded(windowId)}
        onclick={() => dockStore.pillClick(windowId)}
    ><Save size={12} /></button>
{/snippet}

{#snippet defaultBody()}
    <div class="fte-window-row mb-2"><span>Last saved</span><span>—</span></div>
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

{#snippet windowRender(_ctx: { forcedCollapse: boolean })}
    <DockWindow id={windowId} title="save" {closeable} body={body ?? defaultBody} />
{/snippet}

<DockItem
    id={pillId}
    kind="pill"
    {corner}
    {priority}
    {closeable}
    windowId={windowId}
    render={pillRender}
/>
<DockItem
    id={windowId}
    kind="window"
    {corner}
    priority={priority + 5}
    title="save"
    {closeable}
    render={windowRender}
/>
