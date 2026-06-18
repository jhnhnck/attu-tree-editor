<!--
    FamilyTreeEditor - keyboard shortcuts cheatsheet overlay (?)
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { X, Keyboard } from "@lucide/svelte";
    import { formatCombo, isMac } from "$lib/keyboard";
    import { groupedShortcuts } from "$lib/shortcuts";

    interface Props {
        onclose: () => void;
    }

    let { onclose }: Props = $props();

    const groups = groupedShortcuts();

    function onKey(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.preventDefault();
            onclose();
        }
    }

    onMount(() => {
        window.addEventListener("keydown", onKey);
    });
    onDestroy(() => {
        window.removeEventListener("keydown", onKey);
    });
</script>

<div
    class="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-label="keyboard shortcuts"
>
    <button
        type="button"
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="dismiss"
        onclick={onclose}
    ></button>
    <div
        class="bg-canvas-elev border-line text-fg relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg border shadow-2xl"
    >
        <header
            class="bg-canvas-elev border-line sticky top-0 flex items-center gap-2 border-b px-5 py-3"
        >
            <Keyboard size={18} class="text-accent" />
            <h2 class="flex-1 text-base font-semibold">Keyboard shortcuts</h2>
            <span class="text-fg-muted text-xs">{isMac ? "macOS" : "Windows / Linux"}</span>
            <button
                type="button"
                class="text-fg-muted hover:text-fg flex h-7 w-7 items-center justify-center rounded"
                aria-label="close"
                onclick={onclose}
            >
                <X size={16} />
            </button>
        </header>

        <div class="grid grid-cols-1 gap-x-8 gap-y-6 px-5 py-4 sm:grid-cols-2">
            {#each groups as g (g.group)}
                <section>
                    <h3 class="text-fg-muted mb-2 text-xs font-semibold uppercase tracking-wider">
                        {g.group}
                    </h3>
                    <ul class="space-y-1">
                        {#each g.items as s, i (g.group + i + s.combo)}
                            <li class="flex items-baseline justify-between gap-3 text-sm">
                                <span class="text-fg">{s.label}</span>
                                <span class="flex items-center gap-1">
                                    <kbd
                                        class="border-line text-fg-muted bg-canvas inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px]"
                                    >
                                        {formatCombo(s.combo)}
                                    </kbd>
                                    {#if s.alt}
                                        <span class="text-fg-muted text-[11px]">or</span>
                                        <kbd
                                            class="border-line text-fg-muted bg-canvas inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px]"
                                        >
                                            {formatCombo(s.alt)}
                                        </kbd>
                                    {/if}
                                </span>
                            </li>
                        {/each}
                    </ul>
                </section>
            {/each}
        </div>

        <footer class="border-line text-fg-muted border-t px-5 py-2 text-xs">
            Press <kbd
                class="border-line bg-canvas inline-flex items-center rounded border px-1 font-mono text-[10px]"
                >Esc</kbd
            > to close.
        </footer>
    </div>
</div>
