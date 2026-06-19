<!--
    AttuUI - canonical app shell: full-viewport layout with header bar and content area.
    all attu project apps use this component as their root.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import type { MenuConfig } from "./menu.js";
    import MenuBar from "./MenuBar.svelte";

    interface Props {
        menus: readonly MenuConfig[];
        /** left-most slot: logo SVG or other identity mark */
        logo?: Snippet;
        /** title slot: editable title button, static span, etc. */
        title?: Snippet;
        /** icon toolbar buttons rendered after the menus divider */
        tools?: Snippet;
        /** auth strip; Shell wraps it in ml-auto to push it to the right edge */
        auth?: Snippet;
        /** fixed/absolute overlays that sit outside the content area: dialogs, toasts, context menus */
        overlays?: Snippet;
        /** main content area — fills remaining height */
        children: Snippet;
    }

    let { menus, logo, title, tools, auth, overlays, children }: Props = $props();
</script>

<div class="flex h-dvh flex-col bg-canvas text-fg">
    <header class="flex h-9 shrink-0 items-center gap-0.5 border-b border-line bg-canvas-elev px-2">
        {#if logo}
            {@render logo()}
        {/if}
        {#if title}
            {@render title()}
        {/if}
        {#if logo || title}
            <div class="mx-1.5 h-5 w-px shrink-0 border-l border-line"></div>
        {/if}
        <MenuBar {menus} />
        {#if tools}
            <div class="mx-1.5 h-5 w-px shrink-0 border-l border-line"></div>
            {@render tools()}
        {/if}
        {#if auth}
            <div class="ml-auto">
                {@render auth()}
            </div>
        {/if}
    </header>
    <div class="relative min-h-0 flex-1 overflow-clip">
        {@render children()}
    </div>
    {#if overlays}
        {@render overlays()}
    {/if}
</div>
