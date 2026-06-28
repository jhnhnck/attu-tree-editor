<!-- SPDX-License-Identifier: MIT -->
<!--
    canonical panel chrome restored from canvas-chrome-v2 design:
      float/re-dock button always present (corner-aware diagonal arrow)
      minimize button always present (corner-aware chevron)
      close button when closeable=true
      14×14 colored circles: neutral/amber/red at 40% alpha
      titlebar click → dockStore.focusPanel (flash + z-order)
      cascade float computed from canvas-host rect + floating count
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import {
        ArrowUpRight,
        ArrowUpLeft,
        ArrowDownRight,
        ArrowDownLeft,
        ChevronUp,
        ChevronDown,
        X,
    } from "@lucide/svelte";
    import { dockStore } from "./store.svelte.js";

    interface Props {
        id: string;
        title: string;
        body: Snippet;
        // false → hide close button
        closeable?: boolean;
    }

    let { id, title, body, closeable = true }: Props = $props();

    const panelStatus = $derived(dockStore.panelState(id));
    const expanded = $derived(panelStatus === "expanded");
    const floating = $derived(panelStatus === "floating");
    // derive corner from registry so DockCorner doesn't need to thread it
    const corner = $derived(dockStore.getItem(id)?.corner ?? "bl");

    // corner-aware icon derivations — ported from old canvas/Window.svelte
    const isTop = $derived(corner === "tl" || corner === "tr");
    const isLeft = $derived(corner === "tl" || corner === "bl");
    const MinimizeIcon = $derived(isTop ? ChevronUp : ChevronDown);
    const PopOutIcon = $derived(
        isTop ? (isLeft ? ArrowDownRight : ArrowDownLeft) : isLeft ? ArrowUpRight : ArrowUpLeft
    );
    const ReDockIcon = $derived(
        isTop ? (isLeft ? ArrowUpLeft : ArrowUpRight) : isLeft ? ArrowDownLeft : ArrowDownRight
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

    // expose flash to parent (called when dockStore.focusPanel fires)
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

    function onTitlebarClick(e: MouseEvent): void {
        // don't fire focus when clicking a panel control — controls have their own handlers
        if ((e.target as Element | null)?.closest("[data-window-control]")) return;
        dockStore.focusPanel(id);
    }

    function onFloatClick(e: MouseEvent): void {
        const el = e.currentTarget as HTMLElement;
        const host = el.closest<HTMLElement>("[data-canvas-host]");
        const n = dockStore.floatingPanels.length;
        let x = 100, y = 100;
        if (host) {
            const r = host.getBoundingClientRect();
            const row = n % 8;
            const wrap = Math.floor(n / 8);
            x = r.right - 320 + row * 24;
            y = r.top + 60 + row * 24 + wrap * 32;
        }
        dockStore.floatPanel(id, x, y);
    }

    function onTitlebarPointerDown(e: PointerEvent): void {
        // ignore presses that originate from a panel control (close/minimize/float)
        if ((e.target as Element | null)?.closest("[data-window-control]")) return;
        if (!floating) return;
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        const fl = dockStore.floatingPanels.find(fi => fi.item.id === id);
        const pos = fl?.pos ?? { x: 0, y: 0 };
        dragOffset = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    }

    function onTitlebarPointerMove(e: PointerEvent): void {
        if (!dragOffset) return;
        dockStore.movePanel(id, e.clientX - dragOffset.dx, e.clientY - dragOffset.dy);
    }

    function onTitlebarPointerUp(e: PointerEvent): void {
        if (!dragOffset) return;
        dragOffset = null;
        const el = e.currentTarget as HTMLElement;
        el.releasePointerCapture(e.pointerId);
    }
</script>

<div
    class="window-stack"
    data-window-id={id}
    data-popped-out={floating ? "true" : undefined}
>
    <!-- titlebar is a div (not button) so controls can be real buttons without nesting violations.
         role="toolbar" satisfies a11y for an interactive row of tools. -->
    <div
        class="fte-window-titlebar"
        class:fte-window-titlebar-focused={flashing}
        class:fte-window-titlebar-popped={floating}
        aria-label={`${title} panel titlebar`}
        role="toolbar"
        tabindex="-1"
        onclick={onTitlebarClick}
        onkeydown={(e) => { if (e.key === "Enter" && !(e.target as Element | null)?.closest("[data-window-control]")) { dockStore.focusPanel(id); } }}
        onpointerdown={onTitlebarPointerDown}
        onpointermove={onTitlebarPointerMove}
        onpointerup={onTitlebarPointerUp}
    >
        <span class="fte-window-title">{title}</span>
        <span class="fte-window-controls">
            <!-- float/re-dock: always present, toggles icon + action on floating state -->
            <button
                type="button"
                class="fte-window-control fte-window-control-popdock"
                data-window-control
                aria-label={floating ? "re-dock" : "pop out"}
                onclick={(e) => { e.stopPropagation(); floating ? dockStore.dockPanelExpanded(id) : onFloatClick(e); }}
                onpointerdown={(e) => e.stopPropagation()}
            >
                {#if floating}
                    <ReDockIcon size={10} strokeWidth={2.5} />
                {:else}
                    <PopOutIcon size={10} strokeWidth={2.5} />
                {/if}
            </button>
            <!-- minimize: always present -->
            <button
                type="button"
                class="fte-window-control fte-window-control-minimize"
                data-window-control
                aria-label="minimize"
                onclick={(e) => { e.stopPropagation(); floating ? dockStore.dockPanel(id) : dockStore.toggleExpanded(id); }}
                onpointerdown={(e) => e.stopPropagation()}
            >
                <MinimizeIcon size={10} strokeWidth={2.5} />
            </button>
            {#if closeable}
                <button
                    type="button"
                    class="fte-window-control fte-window-control-close"
                    data-window-control
                    aria-label="close"
                    onclick={(e) => { e.stopPropagation(); dockStore.closePanel(id); }}
                    onpointerdown={(e) => e.stopPropagation()}
                >
                    <X size={10} strokeWidth={2.5} />
                </button>
            {/if}
        </span>
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
        gap: 0;
        width: var(--fte-window-width, 18rem);
        border-radius: 0.375rem;
        border: 1px solid var(--color-line);
        background: color-mix(in srgb, var(--color-canvas-elev) 80%, transparent);
        backdrop-filter: blur(4px);
        overflow: hidden;
    }

    /* floating windows can grow wider than the docked width */
    .window-stack[data-popped-out="true"] {
        width: auto;
        min-width: var(--fte-window-width, 18rem);
    }

    .fte-window-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem;
        color: var(--color-fg-muted);
        font-size: 0.75rem;
        line-height: 1rem;
        cursor: default;
        user-select: none;
        transition: color 120ms ease-out;
        min-height: 1.75rem;
    }

    .fte-window-titlebar:hover {
        color: var(--color-fg);
    }

    @keyframes fte-window-flash {
        0% { background-color: color-mix(in srgb, var(--color-accent) 22%, transparent); }
        100% { background-color: transparent; }
    }
    .fte-window-titlebar-focused {
        animation: fte-window-flash 300ms ease-out;
    }

    /* grab cursor when floating (drag handle) */
    .fte-window-titlebar-popped {
        touch-action: none;
        cursor: grab;
    }
    .fte-window-titlebar-popped:active {
        cursor: grabbing;
    }

    .fte-window-title {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: left;
        text-transform: lowercase;
    }

    .fte-window-controls {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        flex: 0 0 auto;
    }

    /* each control is a small circular chip with a semantic fill colour;
       icon inside renders at stroke 2.5. hover darkens by 20%. */
    .fte-window-control {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 0.875rem;
        height: 0.875rem;
        padding: 0;
        border: none;
        border-radius: 9999px;
        color: var(--color-fg);
        cursor: pointer;
        transition: filter 120ms ease-out;
    }

    .fte-window-control :global(svg) {
        display: block;
        width: 0.625rem;
        height: 0.625rem;
    }

    .fte-window-control:hover {
        filter: brightness(0.8);
    }

    /* semantic fills: neutral-600/40, amber-600/40, red-700/40 */
    .fte-window-control-popdock  { background-color: rgb(82 82 82 / 0.4); }
    .fte-window-control-minimize { background-color: rgb(217 119 6 / 0.4); }
    .fte-window-control-close    { background-color: rgb(185 28 28 / 0.4); }

    .window-body {
        padding: 0.5rem;
        border-top: 1px solid var(--color-line);
        font-size: 0.75rem;
        overflow: auto;
    }
</style>
