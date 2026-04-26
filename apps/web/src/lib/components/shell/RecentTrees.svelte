<!--
    FamilyTreeEditor - dropdown showing recently-saved trees + new-tree action
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { TreeListing } from "$lib/persistence/trees";

    interface Props {
        listings: readonly TreeListing[];
        activeId: string | undefined;
        onpick: (id: string) => void;
        onnew: () => void;
        ondelete?: (id: string) => void;
    }

    let { listings, activeId, onpick, onnew, ondelete }: Props = $props();

    let detailsEl: HTMLDetailsElement | undefined = $state();

    function close(): void {
        if (detailsEl) detailsEl.open = false;
    }

    function fmtRel(ts: number): string {
        const ms = Date.now() - ts;
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${String(s)}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${String(m)}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${String(h)}h ago`;
        const d = Math.floor(h / 24);
        return `${String(d)}d ago`;
    }
</script>

<details bind:this={detailsEl} class="relative">
    <summary
        data-testid="recents-trigger"
        class="text-fg hover:bg-canvas inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium select-none"
    >
        recent
        <span aria-hidden="true" class="text-fg-muted text-xs">▾</span>
    </summary>
    <div
        class="bg-canvas-elev border-line absolute right-0 z-30 mt-2 w-72 rounded-md border shadow-xl"
    >
        <button
            type="button"
            class="border-line text-fg hover:bg-canvas/60 flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm"
            onclick={() => {
                close();
                onnew();
            }}
        >
            <span aria-hidden="true" class="text-accent">+</span>
            <span>new tree</span>
        </button>

        {#if listings.length === 0}
            <p class="text-fg-muted px-3 py-3 text-xs italic">no saved trees yet</p>
        {:else}
            <ul class="max-h-80 overflow-y-auto">
                {#each listings as t (t.id)}
                    <li class="border-line/60 flex items-stretch border-b last:border-b-0">
                        <button
                            type="button"
                            class="hover:bg-canvas/60 flex flex-1 flex-col items-start px-3 py-2 text-left"
                            class:bg-accent={t.id === activeId}
                            class:text-canvas={t.id === activeId}
                            onclick={() => {
                                close();
                                onpick(t.id);
                            }}
                        >
                            <span class="line-clamp-1 text-sm font-medium">
                                {t.name || "(untitled)"}
                            </span>
                            <span
                                class="text-fg-muted mt-0.5 font-mono text-[10px]"
                                class:text-canvas={t.id === activeId}
                            >
                                {String(t.personCount)} people · {fmtRel(t.updatedAt)}
                            </span>
                        </button>
                        {#if ondelete}
                            <button
                                type="button"
                                aria-label="delete tree {t.name}"
                                class="text-fg-muted hover:text-fg flex w-8 items-center justify-center text-base"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    ondelete?.(t.id);
                                }}
                            >
                                ×
                            </button>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</details>

<style>
    summary::-webkit-details-marker {
        display: none;
    }
</style>
