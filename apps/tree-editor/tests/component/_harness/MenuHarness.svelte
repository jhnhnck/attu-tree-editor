<!--
    FamilyTreeEditor - test harness that owns the `open` state for Menu (mirrors how MenuBar drives it)
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import Menu from "$lib/components/shell/Menu.svelte";
    import type { MenuEntry } from "$lib/components/shell/menu";

    interface Props {
        label: string;
        items: readonly MenuEntry[];
    }

    let { label, items }: Props = $props();
    let open = $state(false);
</script>

<Menu {label} {items} {open} onopen={() => (open = true)} onclose={() => (open = false)} />
