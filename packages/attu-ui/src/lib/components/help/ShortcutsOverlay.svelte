<!--
    FamilyTreeEditor - keyboard shortcuts cheatsheet body (?)
    body-only component: wrapped in DockDialog by the caller.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { Keyboard } from "@lucide/svelte";
    import { formatCombo, isMac } from "../../keyboard.js";

    interface ShortcutItem {
        combo: string;
        alt?: string | undefined;
        label: string;
    }

    interface ShortcutGroupItem {
        group: string;
        items: readonly ShortcutItem[];
    }

    interface Props {
        groups: readonly ShortcutGroupItem[];
    }

    let { groups }: Props = $props();
</script>

<header
    class="flex items-center gap-2 mb-4"
>
    <Keyboard size={18} class="text-accent" />
    <h2 class="flex-1 text-base font-semibold">Keyboard shortcuts</h2>
    <span class="text-fg-muted text-xs">{isMac ? "macOS" : "Windows / Linux"}</span>
</header>

<div class="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
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

<footer class="border-line text-fg-muted border-t mt-4 px-0 py-2 text-xs">
    Press <kbd
        class="border-line bg-canvas inline-flex items-center rounded border px-1 font-mono text-[10px]"
        >Esc</kbd
    > to close.
</footer>
