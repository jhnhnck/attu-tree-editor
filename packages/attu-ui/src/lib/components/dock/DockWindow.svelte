<!-- SPDX-License-Identifier: MIT -->
<!--
    phase 1 — full window chrome. adds:
      pop-out button (↗) when not floating
      anchor-aware minimize icon (⌃/⌄ based on corner)
      drag-to-move when floating (pointer events on titlebar)
      focus flash animation (is-flashing css class, 300ms)
      corner derived from dockStore.getItem(id)
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

    const windowStatus = $derived(dockStore.windowState(id));
    const expanded = $derived(windowStatus === "expanded");
    const floating = $derived(windowStatus === "floating");
    // derive corner from registry so DockCorner doesn't need to thread it
    const corner = $derived(dockStore.getItem(id)?.corner ?? "bl");

    // anchor-aware minimize icon: bl/br → push down (⌃), tl/tr → push up (⌄)
    const collapseIcon = $derived(
        corner === "bl" || corner === "br" ? "⌃" : "⌄"
    );

    // focus flash
    let flashing = $state(false);
    let flashTimer: ReturnType<typeof setTimeout> | undefined;

    function triggerFlash(): void {
        flashing = true;
        if (flashTimer !== undefined) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => {
            flashing = false;
            flashTimer = undefined;
        }, 300);
    }

    $effect(() => {
        return () => {
            if (flashTimer !== undefined) clearTimeout(flashTimer);
        };
    });

    // expose flash to parent (called when dockStore.focusWindow fires)
    // we hook into the focusedAt change on the item
    const focusedAt = $derived(dockStore.getItem(id)?.focusedAt);
    let prevFocusedAt: number | undefined;
    $effect(() => {
        const f = focusedAt;
        if (f !== undefined && f !== prevFocusedAt && prevFocusedAt !== undefined) {
            triggerFlash();
        }
        prevFocusedAt = f;
    });

    // drag-to-move when floating
    let dragOffset: { dx: number; dy: number } | null = $state(null);

    function onTitlebarPointerDown(e: PointerEvent): void {
        if (!floating) return;
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        const fl = dockStore.floatingItems.find(fi => fi.item.id === id);
        const pos = fl?.pos ?? { x: 0, y: 0 };
        dragOffset = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    }

    function onTitlebarPointerMove(e: PointerEvent): void {
        if (!dragOffset) return;
        dockStore.moveWindow(id, e.clientX - dragOffset.dx, e.clientY - dragOffset.dy);
    }

    function onTitlebarPointerUp(e: PointerEvent): void {
        if (!dragOffset) return;
        dragOffset = null;
        const el = e.currentTarget as HTMLElement;
        el.releasePointerCapture(e.pointerId);
    }
</script>

<div
    class={`window-stack${flashing ? " is-flashing" : ""}`}
    data-window-id={id}
>
    <div
        class="window-titlebar"
        role="toolbar"
        tabindex="-1"
        aria-label={`${title} window controls`}
        onpointerdown={onTitlebarPointerDown}
        onpointermove={onTitlebarPointerMove}
        onpointerup={onTitlebarPointerUp}
        style={floating ? "cursor: move;" : ""}
    >
        <span class="window-title">{title}</span>
        <div class="flex items-center gap-1">
            {#if !floating}
                <!-- pop-out button: only when docked -->
                <button
                    type="button"
                    class="fte-window-icon-btn"
                    aria-label="pop out"
                    onclick={() => dockStore.popOut(id, 100, 100)}
                >↗</button>
            {/if}
            {#if expanded || floating}
                <!-- minimize/collapse button -->
                <button
                    type="button"
                    class="fte-window-icon-btn"
                    aria-label="minimize"
                    onclick={() => dockStore.toggleExpanded(id)}
                >
                    {collapseIcon}
                </button>
            {/if}
            {#if closeable}
                <button
                    type="button"
                    class="fte-window-icon-btn"
                    aria-label="close"
                    onclick={() => dockStore.closeWindow(id)}
                >×</button>
            {/if}
        </div>
    </div>
    {#if expanded || floating}
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
        transition: box-shadow 300ms ease-out;
    }

    .window-stack.is-flashing {
        box-shadow: 0 0 0 2px var(--color-accent);
        animation: flash-ring 300ms ease-out;
    }

    @keyframes flash-ring {
        0% { box-shadow: 0 0 0 3px var(--color-accent); }
        100% { box-shadow: 0 0 0 0px transparent; }
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
        user-select: none;
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

    .fte-window-icon-btn {
        width: 1.25rem;
        height: 1.25rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--color-fg-muted);
        cursor: pointer;
        border-radius: 0.2rem;
        font-size: 0.75rem;
        padding: 0;
        flex-shrink: 0;
    }

    .fte-window-icon-btn:hover {
        background: var(--color-line);
        color: var(--color-fg);
    }
</style>
