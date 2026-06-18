<!--
    FamilyTreeEditor - 2px progress strip anchored to the top of the canvas area.
    Hidden when no operations are active (debounced 150ms by the store).
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { ProgressStore } from "../../state/progress.svelte.js";

    interface Props {
        progress: ProgressStore;
    }

    let { progress }: Props = $props();
</script>

{#if progress.visible}
    <div
        class="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-line"
        role="progressbar"
        aria-label={progress.label}
        aria-valuenow={progress.fraction !== undefined
            ? Math.round(progress.fraction * 100)
            : undefined}
    >
        {#if progress.fraction !== undefined}
            <div
                class="bg-accent h-full transition-[width] duration-200 ease-out"
                style:width="{progress.fraction * 100}%"
            ></div>
        {:else}
            <div class="bg-accent h-full w-1/3 animate-sweep"></div>
        {/if}
    </div>
{/if}

<style>
    @keyframes sweep {
        from {
            transform: translateX(-100%);
        }
        to {
            transform: translateX(400%);
        }
    }
    .animate-sweep {
        animation: sweep 1.4s ease-in-out infinite;
    }
</style>
