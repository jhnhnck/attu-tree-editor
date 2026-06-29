<!--
    FamilyTreeEditor - single dropdown for the menu bar
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { tick } from "svelte";
    import { Check, Square, ChevronRight, ArrowBigUp, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Command, CornerDownLeft, ChevronsUp, ChevronsDown, Delete, Home, MoveRight, MoveLeft } from "@lucide/svelte";
    import { formatComboTokens } from "../../keyboard.js";
    import type { IconComponent, MenuEntry, MenuItem } from "./menu";
    import type { Component } from "svelte";

    const TOKEN_ICONS: Record<string, Component> = {
        shift: ArrowBigUp,
        cmd: Command,
        arrowup: ArrowUp,
        arrowdown: ArrowDown,
        arrowleft: ArrowLeft,
        arrowright: ArrowRight,
        enter: CornerDownLeft,
        pageup: ChevronsUp,
        pagedown: ChevronsDown,
        delete: Delete,
        backspace: Delete,
        home: Home,
        end: MoveRight,
        tab: MoveLeft,
    };
    const TOKEN_FALLBACK: Record<string, string> = {
        ctrl: "^", alt: "alt", escape: "esc", insert: "ins", space: "spc",
    };

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
    let dropdownEl: HTMLDivElement | undefined = $state();
    let outerEl: HTMLDivElement | undefined = $state();
    // -1 means "no item highlighted yet" — only an explicit ↑/↓/Home/End sets it
    let activeIdx = $state(-1);
    let openArrowDown = false;
    // index of the item whose submenu is currently open (-1 = none)
    let openSubmenuIdx = $state(-1);
    // top offset of the hovered submenu trigger, relative to the outer div.
    // used to vertically align the flyout with its trigger item.
    let submenuTopOffset = $state(0);
    // delay close so the mouse can travel from trigger item → flyout without closing.
    let closeTimer: ReturnType<typeof setTimeout> | null = null;

    const enabledItems = $derived(
        items
            .map((item, i) => ({ item, i }))
            .filter(({ item }) => item !== "divider" && !item.disabled),
    );

    const flyoutItem = $derived(
        openSubmenuIdx >= 0 && items[openSubmenuIdx] !== "divider"
            ? (items[openSubmenuIdx] as MenuItem)
            : undefined,
    );

    function cancelClose(): void {
        if (closeTimer !== null) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
    }

    function scheduleClose(): void {
        cancelClose();
        closeTimer = setTimeout(() => {
            openSubmenuIdx = -1;
        }, 100);
    }

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
        dropdownEl?.querySelector<HTMLElement>(`[data-idx="${String(i)}"]`)?.focus();
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
            if (openSubmenuIdx >= 0) {
                openSubmenuIdx = -1;
            } else {
                onclose();
                buttonEl?.focus();
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            moveBy(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveBy(-1);
        } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            if (openSubmenuIdx >= 0) {
                openSubmenuIdx = -1;
            } else {
                onnavigate?.("left");
            }
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            const activeEntry = activeIdx >= 0 ? items[activeIdx] : undefined;
            if (activeEntry && activeEntry !== "divider" && activeEntry.submenu) {
                openSubmenuIdx = activeIdx;
            } else {
                onnavigate?.("right");
            }
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
            e.preventDefault();
            if (!open) {
                openArrowDown = true;
                onopen();
            }
        } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!open) onopen();
        }
    }

    $effect(() => {
        if (open) {
            void (async () => {
                await tick();
                if (openArrowDown) {
                    highlightFirst();
                    openArrowDown = false;
                } else {
                    dropdownEl?.focus();
                }
            })();
        } else {
            activeIdx = -1;
            openArrowDown = false;
            openSubmenuIdx = -1;
            cancelClose();
        }
    });
</script>

<!--
    outer div: position:relative so both the dropdown AND the flyout sibling
    are absolutely positioned relative to the same origin. the flyout is a
    sibling to the dropdown (not inside its overflow-y-auto container) so it
    never gets clipped by overflow-x:auto (which overflow-y:auto implicitly creates).
-->
<div bind:this={outerEl} class="relative">
    <button
        bind:this={buttonEl}
        type="button"
        class="text-fg hover:bg-canvas inline-flex cursor-pointer items-center gap-0.5 rounded px-2 py-1 text-xs font-medium select-none focus:outline-none focus-visible:bg-canvas"
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
        <!-- z-[55]: above the inspector sheet (z-50). -->
        <!-- scrollable items container — overflow-y-auto is isolated here so it
             cannot clip the flyout sibling that lives outside this div -->
        <div
            bind:this={dropdownEl}
            class="bg-canvas-elev border-line absolute left-0 top-full z-[55] mt-0.5 min-w-[21rem] rounded-md border py-1 shadow-xl max-h-[calc(100vh-3rem)] overflow-y-auto"
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
                    {#if item.submenu}
                        <!-- submenu trigger: ▶ indicator; opens flyout on hover -->
                        <div
                            role="none"
                            onmouseenter={(e) => {
                                cancelClose();
                                openSubmenuIdx = i;
                                // compute the item's top offset relative to outerEl so the
                                // flyout sibling (positioned absolute to outerEl) aligns with it
                                if (outerEl) {
                                    const itemRect = (
                                        e.currentTarget as HTMLElement
                                    ).getBoundingClientRect();
                                    const outerRect = outerEl.getBoundingClientRect();
                                    submenuTopOffset = itemRect.top - outerRect.top;
                                }
                            }}
                            onmouseleave={() => scheduleClose()}
                        >
                            <button
                                type="button"
                                role="menuitem"
                                data-idx={i}
                                disabled={item.disabled ?? false}
                                class="hover:bg-canvas focus:bg-canvas flex w-full items-center gap-2 px-3 py-1 text-left text-xs outline-none disabled:cursor-not-allowed disabled:opacity-40"
                                class:bg-canvas={openSubmenuIdx === i}
                                onclick={() => {
                                    openSubmenuIdx = openSubmenuIdx === i ? -1 : i;
                                }}
                                tabindex="-1"
                            >
                                {#if Icon}
                                    <Icon
                                        size={14}
                                        strokeWidth={2.25}
                                        class="text-fg-muted shrink-0"
                                    />
                                {:else}
                                    <span class="w-3.5 shrink-0"></span>
                                {/if}
                                <span class="flex-1">{item.label}</span>
                                <ChevronRight
                                    size={12}
                                    strokeWidth={2}
                                    class="text-fg-muted shrink-0"
                                />
                            </button>
                        </div>
                    {:else}
                        <button
                            type="button"
                            role="menuitem"
                            data-idx={i}
                            disabled={item.disabled ?? false}
                            class="hover:bg-canvas focus:bg-canvas group flex w-full items-center gap-2 px-3 py-1 text-left text-xs outline-none disabled:cursor-not-allowed disabled:opacity-40"
                            class:text-danger={item.danger}
                            onclick={() => selectItem(item)}
                            tabindex="-1"
                        >
                            {#if Icon}
                                <Icon
                                    size={14}
                                    strokeWidth={2.25}
                                    class="text-fg-muted shrink-0"
                                />
                            {:else}
                                <span class="w-3.5 shrink-0"></span>
                            {/if}
                            <span class="flex-1">{item.label}</span>
                            {#if item.checked === true}
                                <Check size={12} strokeWidth={2.5} class="text-accent shrink-0" />
                            {:else if item.checked === false}
                                <Square
                                    size={12}
                                    strokeWidth={1.75}
                                    class="text-fg-muted shrink-0 opacity-60"
                                />
                            {/if}
                            {#if sc}
                                <span class="text-fg-muted ml-auto flex items-center gap-px pl-4">
                                    {#each formatComboTokens(sc) as token}
                                        {@const Icon = TOKEN_ICONS[token]}
                                        {#if Icon}
                                            <Icon size={12} strokeWidth={2} />
                                        {:else}
                                            <span class="font-mono text-xs leading-none">{TOKEN_FALLBACK[token] ?? token}</span>
                                        {/if}
                                    {/each}
                                </span>
                            {/if}
                        </button>
                    {/if}
                {/if}
            {/each}
        </div>

        <!-- flyout panel: sibling to the dropdown div, NOT inside the overflow container.
             left is the dropdown's rendered pixel width (= its right edge relative to outerEl).
             top aligns with the hovered trigger item. -->
        {#if flyoutItem?.submenu}
            <div
                role="menu"
                aria-label={flyoutItem.label}
                tabindex="-1"
                class="bg-canvas-elev border-line absolute z-[56] min-w-48 rounded-md border py-1 shadow-xl max-h-[calc(100vh-3rem)] overflow-y-auto"
                style="left:{dropdownEl?.offsetWidth ?? 0}px;top:{submenuTopOffset}px"
                onmouseenter={() => cancelClose()}
                onmouseleave={() => scheduleClose()}
            >
                {#each flyoutItem.submenu as subentry, j (j)}
                    {#if subentry === "divider"}
                        <div class="border-line my-1 border-t" role="separator"></div>
                    {:else}
                        {@const subitem = subentry as MenuItem}
                        {@const SubIcon = subitem.icon as IconComponent | undefined}
                        <button
                            type="button"
                            role="menuitem"
                            disabled={subitem.disabled ?? false}
                            class="hover:bg-canvas focus:bg-canvas flex w-full items-center gap-2 px-3 py-1 text-left text-xs outline-none disabled:cursor-not-allowed disabled:opacity-40"
                            class:text-danger={subitem.danger}
                            onclick={() => selectItem(subitem)}
                            tabindex="-1"
                        >
                            {#if SubIcon}
                                <SubIcon
                                    size={14}
                                    strokeWidth={2.25}
                                    class="text-fg-muted shrink-0"
                                />
                            {:else}
                                <span class="w-3.5 shrink-0"></span>
                            {/if}
                            <span class="flex-1">{subitem.label}</span>
                            {#if subitem.shortcut}
                                <span class="text-fg-muted ml-auto flex items-center gap-px pl-4">
                                    {#each formatComboTokens(subitem.shortcut) as token}
                                        {@const SubKbdIcon = TOKEN_ICONS[token]}
                                        {#if SubKbdIcon}
                                            <SubKbdIcon size={12} strokeWidth={2} />
                                        {:else}
                                            <span class="font-mono text-xs leading-none">{TOKEN_FALLBACK[token] ?? token}</span>
                                        {/if}
                                    {/each}
                                </span>
                            {/if}
                        </button>
                    {/if}
                {/each}
            </div>
        {/if}
    {/if}
</div>
