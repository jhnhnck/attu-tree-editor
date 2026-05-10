<!--
    FamilyTreeEditor - HyperbolicCanvas: Phase 0 walking-skeleton stub.
    Renders an empty Poincaré disk inscribed in the host element with the
    proband's name pinned at the centre. Phase 5 replaces this with the
    real Lamping-Rao + hourglass viewer (Möbius pan, geodesic edges,
    1 - |z|² fisheye scaling). Currently the canvas does not subscribe to
    the layout worker — selecting "Hyperbolic" from the engine picker
    short-circuits at this component boundary and the legacy layered
    pipeline is not invoked.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { displayName } from "$lib/layout/kinship";
    import type { Tree } from "$lib/domain/types";

    interface Props {
        tree: Tree;
    }

    let { tree }: Props = $props();

    let hostEl: HTMLDivElement | undefined = $state();
    let hostW = $state(0);
    let hostH = $state(0);

    $effect(() => {
        if (!hostEl) return;
        const obs = new ResizeObserver((entries) => {
            for (const entry of entries) {
                hostW = entry.contentRect.width;
                hostH = entry.contentRect.height;
            }
        });
        obs.observe(hostEl);
        return () => obs.disconnect();
    });

    let diskRadius = $derived(Math.min(hostW, hostH) / 2 - 16);
    let probandName = $derived(displayName(tree, tree.rootId) || tree.name || "(no proband)");
</script>

<div
    bind:this={hostEl}
    class="hyperbolic-canvas relative h-full w-full overflow-hidden"
    role="region"
    aria-label="hyperbolic canvas (Phase 5 will populate)"
>
    {#if hostW > 0 && hostH > 0}
        <svg
            class="absolute inset-0"
            width={hostW}
            height={hostH}
            viewBox="0 0 {hostW} {hostH}"
            aria-hidden="true"
        >
            <circle
                cx={hostW / 2}
                cy={hostH / 2}
                r={diskRadius}
                fill="none"
                stroke="var(--color-line)"
                stroke-width="1"
                stroke-dasharray="4 4"
            />
            <circle cx={hostW / 2} cy={hostH / 2} r="3" fill="var(--color-fg-muted)" />
        </svg>
        <div
            class="text-fg pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border border-line bg-canvas-elev px-2 py-1 text-sm shadow-sm"
            style="left: {hostW / 2}px; top: {hostH / 2 + 18}px;"
        >
            {probandName}
        </div>
        <div
            class="text-fg-muted pointer-events-none absolute bottom-3 left-3 rounded bg-canvas-elev/80 px-2 py-1 text-xs backdrop-blur"
        >
            hyperbolic engine — Phase 5 stub
        </div>
    {/if}
</div>

<style>
    .hyperbolic-canvas {
        background: var(--color-canvas);
    }
</style>
