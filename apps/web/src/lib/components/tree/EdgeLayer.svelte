<!--
    FamilyTreeEditor - SVG path layer for spouse + parent/child connectors
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { DerivedEdge } from "$lib/components/tree/edges";

    interface Props {
        edges: readonly DerivedEdge[];
    }

    let { edges }: Props = $props();
</script>

<g class="edge-layer" fill="none" stroke-linecap="round">
    {#each edges as e, i (i)}
        <line
            class={e.kind === "spouse" ? "edge-spouse" : "edge-parent"}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
        />
    {/each}
</g>

<style>
    /* match the canonical family-tree look (FamilyEcho / Geni / Gramps):
       both spouse and parent connectors are thin solid neutral lines.
       spouse gets a hair more weight to feel like a "bond". */
    .edge-spouse {
        stroke: var(--color-fg-muted);
        stroke-width: 1.75;
    }
    .edge-parent {
        stroke: var(--color-fg-muted);
        stroke-width: 1.25;
    }
</style>
