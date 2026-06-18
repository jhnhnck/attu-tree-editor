<!--
    FamilyTreeEditor - label + slot wrapper for form inputs
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        label: string;
        hint?: string;
        error?: string;
        for_?: string;
        children: Snippet;
    }

    let { label, hint, error, for_, children }: Props = $props();
</script>

<div class="flex flex-col gap-1">
    <label class="text-fg-muted text-xs uppercase tracking-wide" for={for_}>{label}</label>
    {@render children()}
    {#if error}
        <p class="text-xs text-red-400">{error}</p>
    {:else if hint}
        <p class="text-fg-muted text-xs">{hint}</p>
    {/if}
</div>
