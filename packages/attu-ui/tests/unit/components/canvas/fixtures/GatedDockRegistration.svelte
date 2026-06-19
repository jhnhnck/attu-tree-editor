<!-- SPDX-License-Identifier: MIT -->
<!--
    test-only fixture that wraps a single DockRegistration behind an
    internal boolean `open` state, exposed via an exported `setOpen`
    setter. used by the rapid-toggle unit test to drive mount / unmount
    cycles of the registration (the same lifecycle the debug menu hits
    when `debugMenuOpen` flickers) and prove the registry never throws a
    duplicate-id error.

    `mount()` returns the component's exports, so a top-level `export
    function setOpen(v)` lets the test toggle the internal $state with
    reactivity intact (writes to a returned-instance prop are not
    reactive in svelte 5 mount).
-->
<script lang="ts" module>
    // nothing module-scoped; kept for future debug instrumentation if needed.
</script>

<script lang="ts">
    import { untrack } from "svelte";
    import DockRegistration from "$lib/components/canvas/DockRegistration.svelte";
    import type {
        DockCorner,
        DockKind,
        DockRenderSnippet,
    } from "$lib/components/canvas/dockRegistry.svelte";

    interface Props {
        initialOpen?: boolean | undefined;
        id: string;
        corner: DockCorner;
        priority: number;
        kind: DockKind;
        render: DockRenderSnippet;
        forceCollapsible?: boolean | undefined;
    }
    let props: Props = $props();

    // seed the gated `open` state from `initialOpen`. wrapping the read
    // in `untrack` quiets svelte's state-referenced-locally hint —
    // initialOpen is a constructor-only signal and never re-reads.
    let open = $state(untrack(() => props.initialOpen === true));

    export function setOpen(v: boolean): void {
        open = v;
    }
</script>

{#if open}
    <DockRegistration
        id={props.id}
        corner={props.corner}
        priority={props.priority}
        kind={props.kind}
        render={props.render}
        forceCollapsible={props.forceCollapsible}
    />
{/if}
