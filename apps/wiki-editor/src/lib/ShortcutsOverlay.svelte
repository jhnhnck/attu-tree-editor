<!--
    wiki-editor keyboard shortcuts body — body-only, wrapped in DockDialog by App.svelte.
    DockDialog handles the backdrop, close button, and Escape key.
-->
<script lang="ts">
    import { Keyboard } from "@lucide/svelte";
    import { isMac } from "@attu/ui";
    import { SHORTCUTS } from "./shortcuts.js";
</script>

<header class="mb-4 flex items-center gap-2">
    <Keyboard size={18} class="text-accent" />
    <h2 class="flex-1 text-base font-semibold">keyboard shortcuts</h2>
    <span class="text-fg-muted text-xs">{isMac ? "macOS" : "Windows / Linux"}</span>
</header>

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
                    <td class="w-48 py-1.5 pr-4 text-fg">
                        <kbd class="border-line bg-canvas inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px]">
                            {row.keys}
                        </kbd>
                    </td>
                    <td class="py-1.5 text-fg-muted">{row.action}</td>
                </tr>
            {/each}
        </tbody>
    </table>
{/each}

<footer class="border-line text-fg-muted mt-4 border-t px-0 py-2 text-xs">
    press <kbd class="border-line bg-canvas inline-flex items-center rounded border px-1 font-mono text-[10px]">esc</kbd> to close.
</footer>
