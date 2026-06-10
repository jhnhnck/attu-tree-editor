<!-- SPDX-License-Identifier: MIT -->
<!--
    Phase-0 walking-skeleton harness for the parity-matrix spec.
    Mirrors App.svelte's top-left dock + statsPill gate
    (engine === "layered" || engine === "family-view") and registers
    the same snippet+priority App.svelte uses (priority 20, kind pill,
    data-testid="stats-pill") so the spec exercises real production
    plumbing (CanvasChromeDock + DockRegistration + dockRegistry)
    rather than reimplementing the assertion shape.
-->
<script lang="ts">
    import CanvasChromeDock from "$lib/components/canvas/CanvasChromeDock.svelte";
    import DockRegistration from "$lib/components/canvas/DockRegistration.svelte";
    import type { EngineKind } from "$lib/state/engine";

    interface Props {
        engine: EngineKind;
        layoutStats: { totalPeople: number; components: number; isolated: number } | undefined;
    }

    let { engine, layoutStats }: Props = $props();

    // matches App.svelte's `statsPillVisible` derived
    let statsPillVisible = $derived(
        (engine === "layered" || engine === "family-view") && layoutStats !== undefined,
    );
</script>

<div data-canvas-host class="relative" style="position: relative; width: 800px; height: 400px;">
    <CanvasChromeDock corner="tl" />

    {#snippet statsPillSnippet()}
        {#if layoutStats}
            <div class="relative">
                <button
                    type="button"
                    class="fte-pill cursor-pointer font-mono"
                    data-testid="stats-pill"
                >
                    {String(layoutStats.totalPeople)} people
                    {#if layoutStats.components > 1 || layoutStats.isolated > 0}
                        <span
                            >· {String(
                                layoutStats.components,
                            )}{#if layoutStats.isolated > 0}+{String(layoutStats.isolated)}{/if} clusters</span
                        >
                    {/if}
                </button>
            </div>
        {/if}
    {/snippet}
    {#if statsPillVisible && layoutStats}
        <DockRegistration
            id="stats"
            corner="tl"
            priority={20}
            kind="pill"
            render={statsPillSnippet}
        />
    {/if}
</div>
