<script lang="ts">
    import { X } from "@lucide/svelte";
    import { SHORTCUTS } from "./shortcuts.js";

    let { onclose }: { onclose: () => void } = $props();
</script>

<svelte:window
    onkeydown={(e: KeyboardEvent) => {
        if (e.key === "Escape") onclose();
    }}
/>

<div
    class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 py-10 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label="Keyboard Shortcuts"
>
    <div class="w-full max-w-2xl rounded-lg border border-line bg-canvas-elev shadow-xl">
        <div
            class="sticky top-0 flex items-center justify-between rounded-t-lg border-b border-line bg-canvas-elev px-6 py-4"
        >
            <h2 class="text-base font-semibold text-fg">Keyboard Shortcuts</h2>
            <button type="button" onclick={onclose} class="text-fg-muted hover:text-fg">
                <X size={18} strokeWidth={2} />
            </button>
        </div>
        <div class="p-6">
            {#each SHORTCUTS as group (group.category)}
                <h3
                    class="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wider text-fg-muted first:mt-0"
                >
                    {group.category}
                </h3>
                <table class="mb-2 w-full border-collapse text-sm">
                    <tbody>
                        {#each group.rows as row (row.keys)}
                            <tr class="border-b border-line last:border-0">
                                <td class="w-48 py-1.5 pr-4 font-mono text-xs text-fg"
                                    >{row.keys}</td
                                >
                                <td class="py-1.5 text-fg-muted">{row.action}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/each}
        </div>
    </div>
</div>
