<!--
    FamilyTreeEditor - SVG path layer for routed family-tree segments.
    Groups segments by role into one <path> per role, draws bridge-hop arcs
    over unrelated crossings, and adds perpendicular tick marks on divorced
    bonds. Uses `vector-effect: non-scaling-stroke` so pan/zoom doesn't force
    the browser to re-stroke the path geometry on every wheel tick — the
    parent transform composites on the GPU instead.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { RenderedSegment, EdgeRole } from "$lib/components/tree/edges";
    import {
        pathDataForGroup,
        divorceTicksForGroup,
        stubCapsForGroup,
    } from "$lib/components/tree/edgePath";

    interface Props {
        edges: readonly RenderedSegment[];
        /**
         * Optional set of segment ids to highlight (e.g. a path-trace overlay).
         * Highlighted segments draw on top of the base layer in a distinct color.
         */
        highlightedIds?: ReadonlySet<string> | undefined;
        /**
         * Multiplier for base stroke widths at the current zoom level.
         * At zoom-out (scale < 0.3), topology becomes thinner; this thickens it.
         * Default 1 (no change).
         */
        strokeMultiplier?: number | undefined;
    }

    let { edges, highlightedIds, strokeMultiplier = 1 }: Props = $props();

    // bucket segments by role so we render one <path> per role. fewer DOM
    // nodes than <line>-per-segment, and re-rendering is cheap as long as
    // `d` doesn't change between frames (it shouldn't on pan/zoom).
    let buckets = $derived.by(() => {
        const out = new Map<EdgeRole, RenderedSegment[]>();
        for (const s of edges) {
            const list = out.get(s.role);
            if (list) list.push(s);
            else out.set(s.role, [s]);
        }
        return out;
    });

    let highlighted = $derived(
        highlightedIds && highlightedIds.size > 0
            ? edges.filter((s) => highlightedIds.has(s.id))
            : undefined,
    );

    const baseWidths: Record<EdgeRole, number> = {
        blood: 1.25,
        married: 1.75,
        divorced: 1.75,
        adopted: 1.25,
        half: 1,
    };

    function classFor(role: EdgeRole): string {
        return `edge-${role}`;
    }

    function strokeWidthFor(role: EdgeRole): number {
        return baseWidths[role] * strokeMultiplier;
    }
</script>

<g class="edge-layer" fill="none" stroke-linecap="round">
    {#each [...buckets] as [role, segs] (role)}
        <path
            class={classFor(role)}
            d={pathDataForGroup(segs)}
            vector-effect="non-scaling-stroke"
            style:stroke-width="{strokeWidthFor(role)}px"
        />
        {#if role === "divorced"}
            {@const ticks = divorceTicksForGroup(segs)}
            {#if ticks}
                <path
                    class="edge-divorced-tick"
                    d={ticks}
                    vector-effect="non-scaling-stroke"
                    style:stroke-width="{strokeWidthFor('divorced')}px"
                />
            {/if}
        {/if}
        {#if role === "married" || role === "divorced"}
            {@const caps = stubCapsForGroup(segs)}
            {#if caps}
                <!-- caps use a dedicated solid class regardless of role:
                     stubs are tiny markers and inheriting `.edge-divorced`'s
                     `stroke-dasharray: 6 4` made the dashes longer than the
                     cap itself, leaving them invisible. -->
                <path
                    class="edge-stub-cap"
                    d={caps}
                    vector-effect="non-scaling-stroke"
                    style:stroke-width="{strokeWidthFor(role)}px"
                />
            {/if}
        {/if}
    {/each}

    {#if highlighted}
        <path
            class="edge-highlight"
            d={pathDataForGroup(highlighted)}
            vector-effect="non-scaling-stroke"
            style:stroke-width="{2 * strokeMultiplier}px"
        />
    {/if}
</g>

<style>
    /* stroke widths are now set inline via strokeMultiplier to adapt to zoom level */
    .edge-blood,
    .edge-adopted {
        stroke: var(--color-fg-muted);
    }
    .edge-married,
    .edge-divorced,
    .edge-divorced-tick,
    .edge-stub-cap {
        stroke: var(--color-fg-muted);
    }
    /* dashed line carries the divorced cue alongside the // tick — the line
       reads as "ended" even when the bond is short and the tick is hidden. */
    .edge-divorced {
        stroke-dasharray: 6 4;
    }
    .edge-adopted {
        stroke-dasharray: 4 3;
    }
    .edge-half {
        stroke: var(--color-fg-muted);
        opacity: 0.7;
    }
    /* path-trace overlay: distinct hue, drawn on top of the base layer */
    .edge-highlight {
        stroke: hsl(50 100% 65%);
    }
</style>
