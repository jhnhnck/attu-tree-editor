<!--
    SPDX-License-Identifier: MIT

    FamilyTreeEditor - tiny shell that wires FamilyViewCanvas + Inspector
    against a shared $state selection slot. used by `import-edit.test.ts`
    (phase-1c migration of `tests/e2e/import-edit.spec.ts`) to exercise the
    click-card -> inspector-renders-fields -> close-button-clears-selection
    loop entirely inside jsdom, bypassing the import wizard and store
    hydration paths.

    family-view is the engine that mounts cleanly under jsdom (TreeCanvas
    spins up a Web Worker for the layered layout pipeline; jsdom has no
    Worker). the migrated assertions don't depend on engine choice - all
    three engines render `[data-person-id]` person cards and feed the same
    selection contract.

    intentionally only wires the props the migrated assertions touch -
    `tree`, `selectedId`, `onselect`, `ondeselect`, and the inspector close /
    no-op write callbacks. everything else (parent links, partner ops, group
    ops, palette focus, etc.) is satisfied with `() => {}` stubs.
-->
<script lang="ts">
    import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
    import Inspector from "$lib/components/inspector/Inspector.svelte";
    import type { PersonId, Tree } from "$lib/domain/types";
    import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";

    interface Props {
        tree: Tree;
    }

    let { tree }: Props = $props();

    let selectedId = $state<PersonId | undefined>(undefined);

    // no-op portrait cache - tiny.ged has no portraits, so get() returning
    // undefined and request() being a no-op is the correct behaviour
    const portraitUrls: PortraitUrlCache = {
        get: () => undefined,
        request: () => undefined,
        prime: () => undefined,
        invalidate: () => undefined,
        clear: () => undefined,
    };

    function noop(): void {
        // satisfy required callbacks the migrated assertions don't drive
    }
</script>

<div class="flex h-full w-full">
    <div class="flex-1" data-canvas-host>
        <FamilyViewCanvas
            {tree}
            {selectedId}
            {portraitUrls}
            onselect={(id: PersonId) => {
                selectedId = id;
            }}
            ondeselect={() => (selectedId = undefined)}
        />
    </div>
    <Inspector
        {tree}
        {selectedId}
        treeId={tree.id}
        {portraitUrls}
        onpatch={noop}
        onsetParent={noop}
        onunsetParent={noop}
        onaddPartner={noop}
        onremovePartner={noop}
        onaddChild={noop}
        onremoveChild={noop}
        oncreateAndLink={noop}
        onselect={(id: PersonId) => {
            selectedId = id;
        }}
        onpatchCouple={noop}
        onduplicate={noop}
        onsetRoot={noop}
        ondelete={noop}
        onclose={() => (selectedId = undefined)}
    />
</div>
