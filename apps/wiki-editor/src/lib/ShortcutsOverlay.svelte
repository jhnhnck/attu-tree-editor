<!--
    wiki-editor keyboard shortcuts body — body-only, wrapped in DockModal by App.svelte.
    DockModal handles the backdrop, close button, and Escape key.
-->
<script lang="ts">
    import { SHORTCUTS } from "./shortcuts.js";
</script>

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
                    <td class="w-48 py-1.5 pr-4 font-mono text-xs text-fg">{row.keys}</td>
                    <td class="py-1.5 text-fg-muted">{row.action}</td>
                </tr>
            {/each}
        </tbody>
    </table>
{/each}
