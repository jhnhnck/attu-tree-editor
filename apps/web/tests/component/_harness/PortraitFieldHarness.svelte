<!--
    FamilyTreeEditor - sandwiches PortraitField between two siblings so
    a keyboard-reachability spec can drive tab into the thumbnail /
    upload button. mirrors how PortraitField sits in the inspector's
    Personal tab section: surrounded by other interactive widgets.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import PortraitField from "$lib/components/editor/PortraitField.svelte";
    import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";

    interface Props {
        treeId?: string;
        personId?: string;
        currentBlobId?: string | undefined;
    }

    let { treeId = "t", personId = "AAAAA", currentBlobId = undefined }: Props = $props();

    const portraitUrls: PortraitUrlCache = {
        get: () => undefined,
        request: () => undefined,
        prime: () => undefined,
        invalidate: () => undefined,
        clear: () => undefined,
    };

    const noop = () => {};
</script>

<div>
    <input type="text" data-testid="before" aria-label="before" />
    <PortraitField
        {treeId}
        {personId}
        {currentBlobId}
        {portraitUrls}
        onchange={noop}
        onerror={noop}
    />
    <input type="text" data-testid="after" aria-label="after" />
</div>
