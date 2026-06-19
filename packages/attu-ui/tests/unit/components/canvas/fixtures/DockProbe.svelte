<!-- SPDX-License-Identifier: MIT -->
<!--
    test-only probe for dockRegistry reactivity. mounts in a jsdom env
    and writes the comma-joined ids of the active corner into a data
    attribute so unit tests can assert reactive updates.
-->
<script lang="ts">
    import { type DockCorner, itemsForCorner } from "$lib/components/canvas/dockRegistry.svelte";

    interface Props {
        corner: DockCorner;
    }
    let { corner }: Props = $props();

    const ids = $derived(
        itemsForCorner(corner)
            .map((i) => i.id)
            .join(","),
    );
</script>

<div data-probe={ids}></div>
