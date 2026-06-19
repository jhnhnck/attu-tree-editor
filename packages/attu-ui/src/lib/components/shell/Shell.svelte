<!--
    AttuUI - canonical app shell: full-viewport layout with header bar and content area.
    all attu project apps use this component as their root.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import type { MenuConfig } from "./menu.js";
    import MenuBar from "./MenuBar.svelte";

    type DockCorner = "tl" | "tr" | "bl" | "br";

    interface Props {
        /** page / document title — always rendered in the header */
        title: string;
        /** menu bar entries */
        menus: readonly MenuConfig[];
        /** if provided, clicking the title enters an inline-rename input */
        onTitleChange?: (title: string) => void;
        /** suppresses title editing and shows "(read-only)" badge */
        readOnly?: boolean;
        /** left-most slot: logo SVG or other identity mark */
        logo?: Snippet;
        /** icon toolbar buttons rendered after the menus divider */
        tools?: Snippet;
        /** auth strip; Shell wraps it in ml-auto to push it to the right edge */
        auth?: Snippet;
        /** corner-pinned overlay (pills, dock windows) rendered on top of content */
        dock?: Snippet;
        /** which corner the dock anchors to — defaults to bottom-left */
        dockCorner?: DockCorner;
        /** fixed/absolute overlays that sit outside the content area: dialogs, toasts, context menus */
        overlays?: Snippet;
        /** main content area — fills remaining height */
        children: Snippet;
    }

    const dockCornerClass: Record<DockCorner, string> = {
        tl: "top-3 left-3",
        tr: "top-3 right-3",
        bl: "bottom-3 left-3",
        br: "bottom-3 right-3",
    };

    let {
        title,
        menus,
        onTitleChange,
        readOnly = false,
        logo,
        tools,
        auth,
        dock,
        dockCorner = "bl",
        overlays,
        children,
    }: Props = $props();

    const canEdit = $derived(!!onTitleChange && !readOnly);

    let editing = $state(false);
    let draft = $state("");
    let inputEl: HTMLInputElement | undefined = $state();

    export function startEdit() {
        if (!canEdit) return;
        draft = title;
        editing = true;
        queueMicrotask(() => {
            inputEl?.focus();
            inputEl?.select();
        });
    }

    function commit() {
        if (!editing) return;
        editing = false;
        const next = draft.trim() || "untitled";
        if (next !== title) onTitleChange?.(next);
    }

    function cancel() {
        editing = false;
        draft = title;
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === "Enter") {
            e.preventDefault();
            commit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
        }
    }
</script>

<div class="flex h-dvh flex-col bg-canvas text-fg">
    <header class="flex h-9 shrink-0 items-center gap-0.5 border-b border-line bg-canvas-elev px-2">
        {#if logo}
            {@render logo()}
        {/if}
        {#if canEdit}
            {#if editing}
                <input
                    bind:this={inputEl}
                    bind:value={draft}
                    class="bg-canvas border-accent text-fg rounded border px-1.5 py-0.5 text-sm font-semibold outline-none"
                    onblur={commit}
                    onkeydown={onKeyDown}
                    aria-label="title"
                />
            {:else}
                <button
                    type="button"
                    class="text-fg hover:bg-canvas truncate rounded px-1.5 py-0.5 text-sm font-semibold select-text"
                    onclick={startEdit}
                    title="click to rename"
                >
                    {title || "untitled"}
                </button>
            {/if}
        {:else}
            <span class="truncate px-1.5 py-0.5 text-sm font-semibold" {title}
                >{title || "untitled"}</span
            >
        {/if}
        {#if readOnly}
            <span class="text-fg-muted text-xs">(read-only)</span>
        {/if}
        <div class="mx-1.5 h-5 w-px shrink-0 border-l border-line"></div>
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
    <div class="relative min-h-0 flex-1 overflow-hidden">
        {@render children()}
        {#if dock}
            <div class={`pointer-events-none absolute z-30 ${dockCornerClass[dockCorner]}`}>
                {@render dock()}
            </div>
        {/if}
    </div>
    {#if overlays}
        {@render overlays()}
    {/if}
</div>
