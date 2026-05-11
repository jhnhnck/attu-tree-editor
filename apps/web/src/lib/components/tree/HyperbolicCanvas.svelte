<!--
    FamilyTreeEditor - HyperbolicCanvas: Poincaré-disk viewer.

    Phase 5.3 promotion of the Phase 0 stub. Runs `layoutHourglass()` on
    tree/focus change (synchronously on the main thread; Akarians completes
    in well under 100 ms — moving to the worker is a future option, not a
    requirement). Renders the disk + person cards. Edge geometry uses
    straight Euclidean chords as a Phase-5.3 placeholder; Phase 5.4 swaps
    in `pathForGeodesic` so the edges follow the actual hyperbolic
    geodesic arcs.

    Pan model: a `viewTransform` function maps layout-disk coords to
    on-screen disk coords. Drag pans by composing a Möbius translation
    from the drag's start/end points (each mapped back to layout coords).
    Double-click on a card recenters that card to the disk origin with a
    short eased animation.

    Card positioning: each card is absolutely positioned in CSS pixels at
    the projected disk centre, with `transform: scale(s)` applying the
    natural fisheye s = 1 - |z|². Cards near the boundary thus shrink to
    near-zero — DOI/cluster glyphs (Phase 5.5) replace them outright when
    the on-screen size falls below the readability threshold.

    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { displayName } from "$lib/layout/kinship";
    import PersonNode from "$lib/components/tree/PersonNode.svelte";
    import { pathForGeodesic } from "$lib/components/tree/edgePath";
    import type { PersonId, Tree } from "$lib/domain/types";
    import { layoutHourglass } from "$lib/layout/engines/hyperbolic-lr/layout";
    import {
        ZERO,
        type Complex,
        type Mobius,
        ID as IDENTITY,
        apply as applyMobius,
        applyInverse,
        translationFromTo,
        abs,
        RHO_MAX,
    } from "$lib/layout/hyperbolic/poincare";
    import type { LayoutEdge } from "$lib/layout/engine";

    interface Props {
        tree: Tree;
        selectedId?: string | undefined;
        onselect?: ((id: string) => void) | undefined;
        ondeselect?: (() => void) | undefined;
    }

    let { tree, selectedId, onselect, ondeselect }: Props = $props();

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
    let diskCx = $derived(hostW / 2);
    let diskCy = $derived(hostH / 2);

    // Run the layout once per (tree, focus). Cheap relative to a re-paint
    // so we don't bother memoising further.
    let layoutOut = $derived(layoutHourglass(tree, tree.rootId, new Set(Object.keys(tree.people))));

    // View transform: a single Möbius that maps layout coords → viewed coords.
    // Identity at startup; drag-pan composes additional translations into it.
    let viewBase = $state<Mobius>(IDENTITY);

    // Live drag overlay: while the pointer is down, additional translation
    // we apply on top of `viewBase`. Committed to viewBase on pointerup.
    let dragLive = $state<((z: Complex) => Complex) | undefined>(undefined);

    function viewPoint(z: Complex): Complex {
        const stage1 = applyMobius(viewBase, z);
        return dragLive ? dragLive(stage1) : stage1;
    }

    /** Approximate PersonNode width in CSS pixels at level 0. */
    const BASE_CARD_PX = 120;
    /** Below this on-screen size the card collapses to a dot glyph (Phase 5.5 DOI MVP). */
    const CLUSTER_THRESHOLD_PX = 12;

    interface Projected {
        readonly id: PersonId;
        readonly cx: number;
        readonly cy: number;
        readonly scale: number;
        /** When true, render a dot glyph instead of a full PersonNode card. */
        readonly clustered: boolean;
    }

    let projected = $derived.by((): Projected[] => {
        if (diskRadius <= 0) return [];
        const out: Projected[] = [];
        for (const [id, pos] of layoutOut.positions) {
            if (pos.space !== "hyperbolic") continue;
            const z = viewPoint(pos.z);
            const r = abs(z);
            if (r > RHO_MAX) continue; // numerical excursion past the disk
            const cx = diskCx + z.re * diskRadius;
            const cy = diskCy + z.im * diskRadius;
            // Fisheye: cards near the disk boundary shrink toward zero.
            const scale = Math.max(0.05, 1 - r * r);
            const onScreenPx = BASE_CARD_PX * scale;
            const clustered = onScreenPx < CLUSTER_THRESHOLD_PX;
            out.push({ id, cx, cy, scale, clustered });
        }
        return out;
    });

    // Edges projected to disk-space geodesic arcs. Möbius transforms map
    // geodesics to geodesics, so we recompute the arc in viewed space rather
    // than transforming a path.
    interface ProjectedEdge {
        readonly id: string;
        readonly d: string;
        readonly style: LayoutEdge["style"];
    }
    let projectedEdges = $derived.by((): ProjectedEdge[] => {
        if (diskRadius <= 0) return [];
        const out: ProjectedEdge[] = [];
        for (const edge of layoutOut.edges) {
            if (edge.route.kind !== "geodesic-arc") continue;
            const from = edge.route.from;
            const to = edge.route.to;
            if (from.space !== "hyperbolic" || to.space !== "hyperbolic") continue;
            const f = viewPoint(from.z);
            const t = viewPoint(to.z);
            if (abs(f) > RHO_MAX || abs(t) > RHO_MAX) continue;
            out.push({
                id: edge.id,
                d: pathForGeodesic(f, t, diskCx, diskCy, diskRadius),
                style: edge.style,
            });
        }
        return out;
    });

    // ---------- pan -----------------------------------------------------

    function pixelToLayoutDisk(px: number, py: number): Complex {
        // Convert host pixel coord to layout-disk coord by inverting the
        // view transform: pixel → on-disk fraction → un-view → layout-disk.
        const disk: Complex = {
            re: (px - diskCx) / diskRadius,
            im: (py - diskCy) / diskRadius,
        };
        return applyInverse(viewBase, disk);
    }

    let dragAnchor: Complex | undefined;

    function onPointerDown(e: PointerEvent): void {
        // Only LMB pans; ignore clicks on PersonNode (handled there).
        if (e.button !== 0) return;
        const target = e.target as Element | null;
        if (target?.closest(".hyp-person")) return;
        const rect = hostEl?.getBoundingClientRect();
        if (!rect) return;
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        // Drag is meaningful only inside the disk.
        const r = Math.hypot(px - diskCx, py - diskCy);
        if (r > diskRadius + 8) return;
        dragAnchor = pixelToLayoutDisk(px, py);
        (e.target as Element).setPointerCapture?.(e.pointerId);
        e.preventDefault();
    }

    function onPointerMove(e: PointerEvent): void {
        if (!dragAnchor) return;
        const rect = hostEl?.getBoundingClientRect();
        if (!rect) return;
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        // The translation we want: "where the user dragged from"
        // (dragAnchor in layout coords) should appear under the pointer
        // (which is a *viewed* point, before drag). Compose a translation
        // in viewed-space that maps dragAnchor (after viewBase) → pointer.
        const viewedAnchor = applyMobius(viewBase, dragAnchor);
        const viewedPointer: Complex = {
            re: (px - diskCx) / diskRadius,
            im: (py - diskCy) / diskRadius,
        };
        // Clamp the pointer to the disk so the live transform stays valid.
        const rP = abs(viewedPointer);
        const clampedPointer =
            rP > RHO_MAX
                ? ({
                      re: (viewedPointer.re * RHO_MAX) / rP,
                      im: (viewedPointer.im * RHO_MAX) / rP,
                  } as Complex)
                : viewedPointer;
        dragLive = translationFromTo(viewedAnchor, clampedPointer);
    }

    function onPointerUp(e: PointerEvent): void {
        if (!dragAnchor) return;
        // Commit `dragLive` into viewBase. Composition: viewedZ = dragLive(viewBase(z)).
        // Parametrise the composition by re-deriving from current+anchor.
        const rect = hostEl?.getBoundingClientRect();
        if (rect) {
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const finalLayoutAnchor = pixelToLayoutDisk(px, py);
            // We want a new viewBase' such that viewBase'(dragAnchor) === viewPoint(dragAnchor)
            // after the drag. Equivalent: viewBase'(z) = translationFromTo(dragAnchor, finalLayoutAnchor)(z).
            // Since translationFromTo is a one-shot function, we capture it.
            const layoutTranslate = translationFromTo(dragAnchor, finalLayoutAnchor);
            // Convert one-shot back into a (a, θ) Mobius by sampling: take what it does to ZERO.
            const newA = layoutTranslate(ZERO);
            viewBase = { a: { re: -newA.re, im: -newA.im }, theta: 0 };
        }
        dragLive = undefined;
        dragAnchor = undefined;
    }

    // ---------- recenter on a person ------------------------------------

    function recenterOn(personId: PersonId): void {
        const pos = layoutOut.positions.get(personId);
        if (!pos || pos.space !== "hyperbolic") return;
        // After: viewBase(pos.z) === 0 → viewBase is the translate(pos.z) Möbius.
        // Animation: a short ease over 400 ms.
        const startA = viewBase.a;
        const startTheta = viewBase.theta;
        const targetA = pos.z;
        const t0 = performance.now();
        const DURATION = 400;
        const step = (now: number): void => {
            const t = Math.min(1, (now - t0) / DURATION);
            const e = easeInOutCubic(t);
            viewBase = {
                a: {
                    re: startA.re + (targetA.re - startA.re) * e,
                    im: startA.im + (targetA.im - startA.im) * e,
                },
                theta: startTheta,
            };
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function onCardSelect(id: string): void {
        if (id === selectedId) ondeselect?.();
        else onselect?.(id);
    }

    function onCardDoubleClick(id: string): void {
        recenterOn(id);
    }

    function lookupPerson(id: PersonId) {
        return tree.people[id];
    }

    let probandName = $derived(displayName(tree, tree.rootId) || tree.name || "(no proband)");
</script>

<div
    bind:this={hostEl}
    class="hyperbolic-canvas relative h-full w-full overflow-hidden"
    role="region"
    aria-label="hyperbolic canvas"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
>
    {#if hostW > 0 && hostH > 0}
        <svg
            class="pointer-events-none absolute inset-0"
            width={hostW}
            height={hostH}
            viewBox="0 0 {hostW} {hostH}"
            aria-hidden="true"
        >
            <circle
                cx={diskCx}
                cy={diskCy}
                r={diskRadius}
                fill="none"
                stroke="var(--color-line)"
                stroke-width="1"
                stroke-dasharray="4 4"
            />
            <g class="hyp-edges" stroke="var(--color-fg-muted)" stroke-width="1" fill="none">
                {#each projectedEdges as e (e.id)}
                    <path
                        d={e.d}
                        class:edge-married={e.style === "married"}
                        class:edge-divorced={e.style === "divorced"}
                    />
                {/each}
            </g>
        </svg>

        {#each projected as item (item.id)}
            {@const person = lookupPerson(item.id)}
            {#if person && !item.clustered}
                <div
                    class="hyp-person absolute -translate-x-1/2 -translate-y-1/2"
                    style="left: {item.cx}px; top: {item.cy}px; transform: translate(-50%, -50%) scale({item.scale}); transform-origin: center; pointer-events: {item.scale >
                    0.15
                        ? 'auto'
                        : 'none'};"
                    ondblclick={() => onCardDoubleClick(item.id)}
                >
                    <PersonNode
                        {person}
                        selected={selectedId === item.id}
                        level={0}
                        onselect={onCardSelect}
                    />
                </div>
            {/if}
        {/each}

        <!-- DOI cluster glyphs: tiny dots for cards too small to read.
             Drawn as a single SVG layer so 1000+ dots stay cheap. Phase 6
             will aggregate clusters and stack a count badge on each glyph. -->
        <svg
            class="pointer-events-none absolute inset-0"
            width={hostW}
            height={hostH}
            viewBox="0 0 {hostW} {hostH}"
            aria-hidden="true"
        >
            <g class="hyp-glyphs" fill="var(--color-fg-muted)">
                {#each projected as item (item.id)}
                    {#if item.clustered}
                        <circle cx={item.cx} cy={item.cy} r="1.5" />
                    {/if}
                {/each}
            </g>
        </svg>

        <div
            class="text-fg-muted pointer-events-none absolute bottom-3 left-3 rounded bg-canvas-elev/80 px-2 py-1 text-xs backdrop-blur"
        >
            hyperbolic engine — proband: {probandName}
        </div>
    {/if}
</div>

<style>
    .hyperbolic-canvas {
        background: var(--color-canvas);
        touch-action: none;
        cursor: grab;
    }
    .hyperbolic-canvas:active {
        cursor: grabbing;
    }
    .hyp-person {
        will-change: transform;
    }
    .edge-married {
        /* solid */
    }
    .edge-divorced {
        stroke-dasharray: 6 4;
    }
</style>
