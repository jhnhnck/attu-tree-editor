<!-- SPDX-License-Identifier: MIT -->
<!--
    test-only probe for Window.svelte. mounts a Window with a snippet
    body that writes a sentinel into the dom so unit tests can assert
    body presence (matches the three-branch expansion model from the
    phase-0 spike).
-->
<script lang="ts">
    import Window from "$lib/components/canvas/Window.svelte";

    interface Props {
        id: string;
        pillId: string;
        title: string;
        expanded: boolean;
        forcedCollapse?: boolean;
        onToggleExpanded: () => void;
    }

    let { id, pillId, title, expanded, forcedCollapse = false, onToggleExpanded }: Props = $props();
</script>

{#snippet body()}
    <div data-testid="window-probe-body">body content</div>
{/snippet}

<Window {id} {pillId} {title} {expanded} {forcedCollapse} {onToggleExpanded} {body} />
