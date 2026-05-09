<!--
    FamilyTreeEditor - floating "back" control that appears after a popover-jump
    on the tree canvas; clicking it restores the pre-jump pan/zoom + selection.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { ArrowLeft } from "@lucide/svelte";

    interface Props {
        fromName: string;
        onclick: () => void;
    }

    let { fromName, onclick }: Props = $props();
</script>

<button
    type="button"
    class="border-line bg-canvas-elev/80 text-fg hover:border-accent pointer-events-auto absolute top-3 left-3 z-30 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
    {onclick}
    aria-label="back to {fromName}"
>
    <ArrowLeft size={14} /> back to {fromName}
</button>
