<!-- SPDX-License-Identifier: MIT -->
<!--
    Phase-2 harness: mirrors App.svelte's stats-pill gate
    (engine === "layered" || engine === "family-view") and registers
    the same snippet+priority App.svelte uses (priority 20, kind pill,
    data-testid="stats-pill") through the new dockStore/DockItem system.
-->
<script lang="ts">
    import { DockCorner, DockItem } from "@attu/ui";
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
    <DockCorner corner="tl" />

    {#snippet statsPillSnippet(_ctx: { forcedCollapse: boolean })}
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
        <DockItem
            id="stats"
            kind="pill"
            corner="tl"
            priority={20}
            render={statsPillSnippet}
        />
    {/if}
</div>
