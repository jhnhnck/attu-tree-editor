<script lang="ts">
    import { X } from "@lucide/svelte";

    type PillId = "save" | "stats" | "preview" | "mode";

    let open = $state<PillId | null>(null);
    let containerEl: HTMLDivElement | undefined = $state();

    function toggle(id: PillId) {
        open = open === id ? null : id;
    }

    function close() {
        open = null;
    }

    function handleWindowClick(e: MouseEvent) {
        if (open && containerEl && !containerEl.contains(e.target as Node)) {
            close();
        }
    }
</script>

<svelte:window
    onclick={handleWindowClick}
    onkeydown={(e: KeyboardEvent) => {
        if (e.key === "Escape") close();
    }}
/>

{#snippet hdr(label: string)}
    <div class="mb-2 flex items-center justify-between">
        <span class="text-[9px] font-semibold uppercase tracking-wider text-fg-muted">{label}</span>
        <button type="button" class="text-fg-muted hover:text-fg" onclick={close}>
            <X size={12} strokeWidth={2} />
        </button>
    </div>
{/snippet}

<div bind:this={containerEl} class="pointer-events-auto flex flex-col items-start gap-1">
    <!-- editor mode (top, furthest from corner) -->
    <div class="relative">
        <button
            type="button"
            class="fte-pill"
            aria-pressed={open === "mode"}
            onclick={() => toggle("mode")}
        >
            source
        </button>
        {#if open === "mode"}
            <div
                class="absolute bottom-full left-0 z-50 mb-2 w-52 rounded border border-line bg-canvas-elev p-3 shadow-lg"
            >
                {@render hdr("Editor mode")}
                <p class="text-xs text-fg-muted">work in progress</p>
            </div>
        {/if}
    </div>

    <!-- preview -->
    <div class="relative">
        <button
            type="button"
            class="fte-pill"
            aria-pressed={open === "preview"}
            onclick={() => toggle("preview")}
        >
            preview off
        </button>
        {#if open === "preview"}
            <div
                class="absolute bottom-full left-0 z-50 mb-2 w-52 rounded border border-line bg-canvas-elev p-3 shadow-lg"
            >
                {@render hdr("Preview")}
                <p class="text-xs text-fg-muted">work in progress</p>
            </div>
        {/if}
    </div>

    <!-- stats -->
    <div class="relative">
        <button
            type="button"
            class="fte-pill"
            aria-pressed={open === "stats"}
            onclick={() => toggle("stats")}
        >
            — words
        </button>
        {#if open === "stats"}
            <div
                class="absolute bottom-full left-0 z-50 mb-2 w-52 rounded border border-line bg-canvas-elev p-3 shadow-lg"
            >
                {@render hdr("Statistics")}
                <div class="fte-window-row"><span>Words</span><span>—</span></div>
                <div class="fte-window-row"><span>Characters</span><span>—</span></div>
                <div class="fte-window-row"><span>Sections</span><span>—</span></div>
                <div class="fte-window-row"><span>Wikilinks</span><span>—</span></div>
                <div class="fte-window-row"><span>External links</span><span>—</span></div>
                <div class="fte-window-row"><span>Templates</span><span>—</span></div>
                <div class="fte-window-row"><span>References</span><span>—</span></div>
            </div>
        {/if}
    </div>

    <!-- save status (bottom, nearest corner) -->
    <div class="relative">
        <button
            type="button"
            class="fte-pill"
            aria-pressed={open === "save"}
            onclick={() => toggle("save")}
        >
            saved
        </button>
        {#if open === "save"}
            <div
                class="absolute bottom-full left-0 z-50 mb-2 w-52 rounded border border-line bg-canvas-elev p-3 shadow-lg"
            >
                {@render hdr("Save status")}
                <div class="fte-window-row mb-2"><span>Last saved</span><span>—</span></div>
                <button
                    type="button"
                    class="fte-window-button pointer-events-none opacity-50"
                    disabled
                >
                    Save now
                </button>
            </div>
        {/if}
    </div>
</div>
