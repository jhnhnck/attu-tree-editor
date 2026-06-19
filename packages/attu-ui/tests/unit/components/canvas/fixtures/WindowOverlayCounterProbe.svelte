<!-- SPDX-License-Identifier: MIT -->
<!--
    test-only probe for WindowOverlay snippet closure semantics.
    registers a Window via DockRegistration with a body snippet that
    references a caller-owned counter, mounts WindowOverlay inside a
    fake canvas-host, and exposes a popOut trigger so the test can
    pop the window into the overlay and click its body button to
    drive the counter forward. proves the snippet rendered through
    the registry's DockRenderSnippet pipeline keeps its closure over
    the parent's reactive state.
-->
<script lang="ts">
    import Window from "$lib/components/canvas/Window.svelte";
    import WindowOverlay from "$lib/components/canvas/WindowOverlay.svelte";
    import DockRegistration from "$lib/components/canvas/DockRegistration.svelte";

    interface Props {
        // caller receives a callback fired with the new value every
        // time the body button is clicked. drives the closure test
        // without needing $state in the test file (vitest test
        // modules are .ts, not .svelte.ts).
        onIncrement: (next: number) => void;
    }

    let { onIncrement }: Props = $props();
    let counter = $state(0);
    let expanded = $state(true);
</script>

{#snippet body()}
    <button
        type="button"
        data-testid="counter-probe-button"
        onclick={() => {
            counter += 1;
            onIncrement(counter);
        }}
    >
        count = {counter}
    </button>
{/snippet}

{#snippet windowSnippet(ctx: { forcedCollapse: boolean })}
    <Window
        id="counter-probe"
        pillId="counter-probe"
        title="counter probe"
        {expanded}
        forcedCollapse={ctx.forcedCollapse}
        onToggleExpanded={() => (expanded = !expanded)}
        {body}
    />
{/snippet}

<!-- canvas-host shim so WindowOverlay's `closest([data-canvas-host])`
     query resolves the test root as the host. -->
<div data-canvas-host data-testid="counter-probe-host" style="position:relative;">
    <DockRegistration
        id="counter-probe"
        corner="bl"
        priority={290}
        kind="window"
        render={windowSnippet}
    />
    <WindowOverlay />
</div>
