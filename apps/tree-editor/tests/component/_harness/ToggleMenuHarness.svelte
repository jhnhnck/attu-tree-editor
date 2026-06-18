<!--
    FamilyTreeEditor - menu with a single tri-state toggle item; `checked`
    is driven from props so a test can compare off vs on snapshots by
    re-rendering. mirrors how MenuBar drives Menu's `open` state.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import Menu from "$lib/components/shell/Menu.svelte";
    import type { MenuEntry } from "$lib/components/shell/menu";

    interface Props {
        label?: string;
        toggleLabel?: string;
        checked: boolean;
    }

    let { label = "View", toggleLabel = "path highlight", checked }: Props = $props();

    let open = $state(false);

    const items: MenuEntry[] = $derived([
        {
            label: toggleLabel,
            checked,
            onclick: () => {},
        },
    ]);
</script>

<Menu {label} {items} {open} onopen={() => (open = true)} onclose={() => (open = false)} />
