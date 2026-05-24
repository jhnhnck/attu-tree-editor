<!--
    FamilyTreeEditor - single dropdown for the menu bar
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { tick } from "svelte";
    import { Check, Square } from "@lucide/svelte";
    import { formatCombo } from "$lib/keyboard";
    import type { IconComponent, MenuEntry, MenuItem } from "./menu";

    interface Props {
        label: string;
        items: readonly MenuEntry[];
        open: boolean;
        onopen: () => void;
        onclose: () => void;
        /** controls keyboard nav across menus from MenuBar */
        onnavigate?: (direction: "left" | "right") => void;
        /** mouseenter on trigger; MenuBar uses this to switch menus when one is already open */
        onhover?: () => void;
    }

    let { label, items, open, onopen, onclose, onnavigate, onhover }: Props = $props();

    let buttonEl: HTMLButtonElement | undefined = $state();
    let menuEl: HTMLDivElement | undefined = $state();
    // -1 means "no item highlighted yet" — only an explicit ↑/↓/Home/End sets it
    let activeIdx = $state(-1);
    // openArrowDown is set by the trigger's ArrowDown key — when true, the very
    // first item is auto-highlighted on open (matches the menubar convention).
    // plain Enter/Space and mouse-click leave activeIdx at -1; the first arrow
    // key inside the menu then sets it.
    let openArrowDown = false;

    const enabledItems = $derived(
        items
            .map((item, i) => ({ item, i }))
            .filter(({ item }) => item !== "divider" && !item.disabled),
    );

    function toggle(): void {
        if (open) onclose();
        else onopen();
    }

    function selectItem(item: MenuItem): void {
        if (item.disabled) return;
        item.onclick?.();
        onclose();
    }

    function focusItem(i: number): void {
        menuEl?.querySelector<HTMLElement>(`[data-idx="${String(i)}"]`)?.focus();
    }

    function highlightFirst(): void {
        activeIdx = enabledItems[0]?.i ?? -1;
        if (activeIdx >= 0) focusItem(activeIdx);
    }

    function highlightLast(): void {
        activeIdx = enabledItems[enabledItems.length - 1]?.i ?? -1;
        if (activeIdx >= 0) focusItem(activeIdx);
    }

    function moveBy(delta: number): void {
        if (enabledItems.length === 0) return;
        // first arrow on an unhighlighted menu jumps to first (ArrowDown) /
        // last (ArrowUp) — matches the WAI-ARIA menubar pattern
        if (activeIdx < 0) {
            if (delta > 0) highlightFirst();
            else highlightLast();
            return;
        }
        const order = enabledItems.map((e) => e.i);
        const here = order.indexOf(activeIdx);
        const nextPos = here < 0 ? 0 : (here + delta + order.length) % order.length;
        activeIdx = order[nextPos]!;
        focusItem(activeIdx);
    }

    function onMenuKey(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.preventDefault();
            onclose();
            buttonEl?.focus();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            moveBy(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveBy(-1);
        } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            onnavigate?.("left");
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            onnavigate?.("right");
        } else if (e.key === "Home") {
            e.preventDefault();
            highlightFirst();
        } else if (e.key === "End") {
            e.preventDefault();
            highlightLast();
        }
    }

    function onButtonKey(e: KeyboardEvent): void {
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            onnavigate?.("left");
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            onnavigate?.("right");
        } else if (e.key === "ArrowDown") {
            // ArrowDown is the explicit "open and start at first item" gesture
            e.preventDefault();
            if (!open) {
                openArrowDown = true;
                onopen();
            }
        } else if (e.key === "Enter" || e.key === " ") {
            // Enter / Space open the menu but don't pre-highlight — match the
            // mouse-open behaviour. The first ↑/↓ then sets the highlight.
            e.preventDefault();
            if (!open) onopen();
        }
    }

    $effect(() => {
        if (open) {
            // focus the menu container so keydown handlers receive the event;
            // do NOT auto-focus the first item unless the user explicitly
            // requested it by pressing ArrowDown on the trigger
            void (async () => {
                await tick();
                if (openArrowDown) {
                    highlightFirst();
                    openArrowDown = false;
                } else {
                    menuEl?.focus();
                }
            })();
        } else {
            activeIdx = -1;
            openArrowDown = false;
        }
    });
</script>

<div class="relative">
    <button
        bind:this={buttonEl}
        type="button"
        class="text-fg hover:bg-canvas inline-flex cursor-pointer items-center gap-0.5 rounded px-2 py-1 text-sm font-medium select-none focus:outline-none focus-visible:bg-canvas"
        class:bg-canvas={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onclick={toggle}
        onkeydown={onButtonKey}
        onmouseenter={() => onhover?.()}
    >
        {label}
    </button>

    {#if open}
        <div
            bind:this={menuEl}
            class="bg-canvas-elev border-line absolute left-0 top-full z-40 mt-0.5 min-w-56 rounded-md border py-1 shadow-xl"
            role="menu"
            aria-label={label}
            tabindex="-1"
            onkeydown={onMenuKey}
        >
            {#each items as entry, i (i)}
                {#if entry === "divider"}
                    <div class="border-line my-1 border-t" role="separator"></div>
                {:else}
                    {@const item = entry as MenuItem}
                    {@const Icon = item.icon as IconComponent | undefined}
                    {@const sc = item.shortcut ?? ""}
                    <button
                        type="button"
                        role="menuitem"
                        data-idx={i}
                        disabled={item.disabled ?? false}
                        class="hover:bg-canvas focus:bg-canvas group flex w-full items-center gap-2 px-3 py-1 text-left text-sm outline-none disabled:cursor-not-allowed disabled:opacity-40"
                        class:text-danger={item.danger}
                        onclick={() => selectItem(item)}
                        tabindex="-1"
                    >
                        {#if Icon}
                            <Icon size={14} strokeWidth={2.25} class="text-fg-muted shrink-0" />
                        {:else}
                            <span class="w-3.5 shrink-0"></span>
                        {/if}
                        <span class="flex-1">{item.label}</span>
                        {#if item.checked === true}
                            <Check size={12} strokeWidth={2.5} class="text-accent shrink-0" />
                        {:else if item.checked === false}
                            <!-- explicit off-state for toggleable items so the user can
                                 tell at a glance which overlays are off without scanning
                                 for the absence of a checkmark -->
                            <Square
                                size={12}
                                strokeWidth={1.75}
                                class="text-fg-muted shrink-0 opacity-60"
                            />
                        {/if}
                        {#if sc}
                            <span class="text-fg-muted ml-3 font-mono text-[11px] tracking-tight">
                                {formatCombo(sc)}
                            </span>
                        {/if}
                    </button>
                {/if}
            {/each}
        </div>
    {/if}
</div>
