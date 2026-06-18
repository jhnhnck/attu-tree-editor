<!--
    FamilyTreeEditor - popover anchored to the link icon on a person card,
    listing every location where the person appears (primary + ghosts) so the
    user can pick which one to pan to.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { Link2 } from "@lucide/svelte";
    import type { InstanceEntry } from "$lib/layout/instanceLabels";

    interface Props {
        anchorEl: HTMLElement;
        entries: InstanceEntry[];
        currentInstanceKey: string;
        onpick: (entry: InstanceEntry) => void;
        onclose: () => void;
    }

    let { anchorEl, entries, currentInstanceKey, onpick, onclose }: Props = $props();

    const POP_WIDTH = 256; // matches w-64
    const GAP = 6;

    let popEl: HTMLDivElement | undefined = $state();
    let top = $state(0);
    let left = $state(0);
    let highlight = $state(0);

    function firstPickableIndex(es: InstanceEntry[], current: string): number {
        for (let i = 0; i < es.length; i++) if (es[i]!.instanceKey !== current) return i;
        return 0;
    }

    function place(): void {
        const r = anchorEl.getBoundingClientRect();
        // default: drop down + right-aligned to the icon (icon sits top-right of a card)
        const popH = popEl?.offsetHeight ?? 0;
        let nextTop = r.bottom + GAP;
        if (nextTop + popH > window.innerHeight - 8 && r.top - GAP - popH > 8) {
            nextTop = r.top - GAP - popH;
        }
        let nextLeft = r.right - POP_WIDTH;
        if (nextLeft < 8) nextLeft = 8;
        if (nextLeft + POP_WIDTH > window.innerWidth - 8) {
            nextLeft = window.innerWidth - 8 - POP_WIDTH;
        }
        top = nextTop;
        left = nextLeft;
    }

    function pick(entry: InstanceEntry): void {
        if (entry.instanceKey === currentInstanceKey) return;
        onpick(entry);
    }

    function moveHighlight(delta: number): void {
        if (entries.length === 0) return;
        let i = highlight;
        for (let n = 0; n < entries.length; n++) {
            i = (i + delta + entries.length) % entries.length;
            if (entries[i]!.instanceKey !== currentInstanceKey) {
                highlight = i;
                return;
            }
        }
    }

    function onWindowDown(e: PointerEvent): void {
        if (!popEl) return;
        if (e.target instanceof Node && popEl.contains(e.target)) return;
        if (e.target instanceof Node && anchorEl.contains(e.target)) return;
        onclose();
    }

    function onWindowKey(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.preventDefault();
            onclose();
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            moveHighlight(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveHighlight(-1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            const entry = entries[highlight];
            if (entry) pick(entry);
        }
    }

    onMount(() => {
        highlight = firstPickableIndex(entries, currentInstanceKey);
        window.addEventListener("pointerdown", onWindowDown, true);
        window.addEventListener("keydown", onWindowKey);
        void tick().then(place);
    });
    onDestroy(() => {
        window.removeEventListener("pointerdown", onWindowDown, true);
        window.removeEventListener("keydown", onWindowKey);
    });
</script>

<div
    bind:this={popEl}
    class="bg-canvas-elev border-line text-fg fixed z-50 w-64 rounded-md border py-1 shadow-xl"
    style:top="{top}px"
    style:left="{left}px"
    role="menu"
    aria-label="jump to instance"
>
    {#each entries as entry, i (entry.instanceKey)}
        {@const isCurrent = entry.instanceKey === currentInstanceKey}
        <button
            type="button"
            class="flex w-full items-start gap-2 px-2 py-1.5 text-left text-sm"
            class:cursor-default={isCurrent}
            class:cursor-pointer={!isCurrent}
            class:opacity-50={isCurrent}
            class:hover:bg-canvas={!isCurrent}
            class:bg-canvas={!isCurrent && i === highlight}
            disabled={isCurrent}
            aria-disabled={isCurrent}
            role="menuitem"
            onclick={() => pick(entry)}
            onmouseenter={() => {
                if (!isCurrent) highlight = i;
            }}
        >
            <span class="text-fg-muted mt-0.5 shrink-0"><Link2 size={14} /></span>
            <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{entry.label}</span>
                <span class="text-fg-muted block truncate text-xs">
                    {entry.sublabel}{isCurrent ? " · here" : ""}
                </span>
            </span>
        </button>
    {/each}
</div>
