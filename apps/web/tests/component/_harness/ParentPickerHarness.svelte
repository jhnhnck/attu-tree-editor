<!--
    FamilyTreeEditor - sandwiches ConnectionsTab between two sibling
    inputs so a keyboard-reachability spec can drive tab into the parent-
    "set mother" trigger, open the PersonChooser via keyboard, and
    observe focus landing on the chooser's search input. mirrors how
    the inspector is actually rendered (sandwiched in the inspector
    sidebar between other interactive surfaces).
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import ConnectionsTab from "$lib/components/inspector/ConnectionsTab.svelte";
    import type { Person, Tree } from "$lib/domain/types";

    interface Props {
        tree: Tree;
        person: Person;
    }

    let { tree, person }: Props = $props();

    // no-op callbacks; the spec only cares about focus mechanics
    const noop = () => {};
</script>

<div>
    <input type="text" data-testid="before" aria-label="before" />
    <ConnectionsTab
        {tree}
        {person}
        onsetParent={noop}
        onunsetParent={noop}
        onaddPartner={noop}
        onremovePartner={noop}
        onaddChild={noop}
        onremoveChild={noop}
        oncreateAndLink={noop}
        onselect={noop}
        onpatchCouple={noop}
    />
    <input type="text" data-testid="after" aria-label="after" />
</div>
