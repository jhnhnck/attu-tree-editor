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
        type Complex,
        type Mobius,
        ID as IDENTITY,
        apply as applyMobius,
        applyInverse,
        translationFromTo,
        mobiusFromFn,
        abs,
        RHO_MAX,
    } from "$lib/layout/hyperbolic/poincare";
    import type { LayoutEdge } from "$lib/layout/engine";
    import {
        computeDoiScores,
        aggregateClusters,
        type DoiScore,
        type ClusterGlyph,
    } from "$lib/layout/doi";

    import type { CanvasController } from "./canvasController";
    import { onMount } from "svelte";

    interface Props {
        tree: Tree;
        selectedId?: string | undefined;
        onselect?: ((id: string) => void) | undefined;
        ondeselect?: (() => void) | undefined;
        oncontroller?: ((c: CanvasController) => void) | undefined;
    }

    let { tree, selectedId, onselect, ondeselect, oncontroller }: Props = $props();

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

    // Live-tunable knobs. Persisted in localStorage so a reload keeps the
    // chosen values; the tuning panel writes the same keys back.
    interface Tuning {
        stepDistance: number;
        spouseAngle: number;
        baseCardPx: number;
        clusterThresholdPx: number;
    }
    const DEFAULT_TUNING: Tuning = {
        stepDistance: 0.7,
        spouseAngle: 0.35,
        baseCardPx: 120,
        clusterThresholdPx: 12,
    };
    const TUNING_STORAGE_KEY = "fte.hyperbolic.tuning.v1";
    function readTuning(): Tuning {
        if (typeof localStorage === "undefined") return DEFAULT_TUNING;
        try {
            const raw = localStorage.getItem(TUNING_STORAGE_KEY);
            if (!raw) return DEFAULT_TUNING;
            const parsed = JSON.parse(raw) as Partial<Tuning>;
            return { ...DEFAULT_TUNING, ...parsed };
        } catch {
            return DEFAULT_TUNING;
        }
    }
    let tuning = $state<Tuning>(readTuning());
    $effect(() => {
        if (typeof localStorage === "undefined") return;
        try {
            localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuning));
        } catch {
            /* quota or disabled — non-fatal */
        }
    });

    // Run the layout once per (tree, focus, tuning). Cheap relative to a
    // re-paint so we don't bother memoising further.
    let layoutOut = $derived(
        layoutHourglass(tree, tree.rootId, new Set(Object.keys(tree.people)), {
            stepDistance: tuning.stepDistance,
            spouseAngle: tuning.spouseAngle,
        }),
    );

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

    let isTuningOpen = $state(false);

    // DOI scores per (tree, focus, selection). Cheap; recomputed on selection
    // change. Selection enters via the `anchors` set so the focused person
    // and their direct neighbourhood stay readable.
    let doiAnchors = $derived.by((): Set<PersonId> => {
        const s = new Set<PersonId>();
        if (selectedId) s.add(selectedId);
        return s;
    });
    let doiScores = $derived(computeDoiScores({ tree, focus: tree.rootId, anchors: doiAnchors }));

    interface Projected {
        readonly id: PersonId;
        readonly cx: number;
        readonly cy: number;
        readonly scale: number;
        /** True iff the card is too small to read on screen. */
        readonly belowThreshold: boolean;
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
            const onScreenPx = tuning.baseCardPx * scale;
            const belowThreshold = onScreenPx < tuning.clusterThresholdPx;
            out.push({ id, cx, cy, scale, belowThreshold });
        }
        return out;
    });

    /** Quick lookup for projected entries by personId. */
    let projectedById = $derived.by((): ReadonlyMap<PersonId, Projected> => {
        const m = new Map<PersonId, Projected>();
        for (const p of projected) m.set(p.id, p);
        return m;
    });

    /**
     * Contiguous-subtree clusters. Recomputed when `projected` (i.e. zoom or
     * pan) changes. The aggregator walks the proband-rooted spanning tree;
     * anchors (selectedId) and any card whose belowThreshold is false block
     * the collapse, so high-DOI persons and their ancestors stay readable.
     */
    let clusters = $derived.by((): readonly ClusterGlyph[] => {
        return aggregateClusters(
            tree,
            tree.rootId,
            (id) => projectedById.get(id)?.belowThreshold ?? false,
            doiAnchors,
        );
    });

    /** personId → cluster.id; used to suppress per-person dot glyphs inside clusters. */
    let clusterOf = $derived.by((): ReadonlyMap<PersonId, string> => {
        const m = new Map<PersonId, string>();
        for (const c of clusters) for (const mid of c.members) m.set(mid, c.id);
        return m;
    });

    interface ProjectedCluster {
        readonly id: string;
        readonly cx: number;
        readonly cy: number;
        readonly count: number;
    }

    /**
     * Project each cluster glyph to its rep's screen position. The rep is
     * the subtree root — well-defined; positioning at the highest-DOI
     * member would oscillate as scores shift.
     */
    let projectedClusters = $derived.by((): readonly ProjectedCluster[] => {
        const out: ProjectedCluster[] = [];
        for (const c of clusters) {
            const rep = projectedById.get(c.rep);
            if (!rep) continue;
            out.push({ id: c.id, cx: rep.cx, cy: rep.cy, count: c.count });
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
        // Map clusterId → its rep's hyperbolic position. Edges whose
        // endpoint is inside a cluster get rerouted to the cluster's rep
        // so they terminate on the visible glyph rather than the now-
        // hidden card. Edges fully inside a single cluster are dropped.
        const clusterRepZ = new Map<string, Complex>();
        for (const c of clusters) {
            const pos = layoutOut.positions.get(c.rep);
            if (pos && pos.space === "hyperbolic") clusterRepZ.set(c.id, pos.z);
        }
        const out: ProjectedEdge[] = [];
        for (const edge of layoutOut.edges) {
            if (edge.route.kind !== "geodesic-arc") continue;
            const from = edge.route.from;
            const to = edge.route.to;
            if (from.space !== "hyperbolic" || to.space !== "hyperbolic") continue;
            const personFrom = edge.persons[0];
            const personTo = edge.persons[1];
            if (personFrom === undefined || personTo === undefined) continue;
            const fromCluster = clusterOf.get(personFrom);
            const toCluster = clusterOf.get(personTo);
            if (fromCluster && fromCluster === toCluster) continue;
            const fromZ = fromCluster ? (clusterRepZ.get(fromCluster) ?? from.z) : from.z;
            const toZ = toCluster ? (clusterRepZ.get(toCluster) ?? to.z) : to.z;
            const f = viewPoint(fromZ);
            const t = viewPoint(toZ);
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
    // pointerdown position + background-target flag, used to classify the
    // matching pointerup as either a real drag (commit Möbius) or a tap on
    // disk background (clear selection).
    const TAP_THRESHOLD_PX = 4;
    let pointerDownPx: { x: number; y: number; onBackground: boolean } | null = null;

    function onPointerDown(e: PointerEvent): void {
        pointerDownPx = null;
        // Only LMB pans; ignore clicks on PersonNode (handled there).
        if (e.button !== 0) return;
        const target = e.target as Element | null;
        if (target?.closest(".hyp-person")) return;
        // cluster glyphs and the tuning panel handle their own clicks;
        // a pointerdown landing on them is not a background tap.
        if (target?.closest(".hyp-cluster")) return;
        if (target?.closest(".hyp-tuning")) return;
        const rect = hostEl?.getBoundingClientRect();
        if (!rect) return;
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        // Drag is meaningful only inside the disk.
        const r = Math.hypot(px - diskCx, py - diskCy);
        if (r > diskRadius + 8) return;
        dragAnchor = pixelToLayoutDisk(px, py);
        pointerDownPx = { x: e.clientX, y: e.clientY, onBackground: true };
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
        if (!dragAnchor) {
            dragLive = undefined;
            pointerDownPx = null;
            return;
        }
        // classify tap vs drag from the actual pointer travel; a tiny
        // jitter under the threshold still counts as a tap even if
        // onPointerMove already created a dragLive translation.
        let wasTap = false;
        if (pointerDownPx?.onBackground) {
            const dx = e.clientX - pointerDownPx.x;
            const dy = e.clientY - pointerDownPx.y;
            wasTap = Math.hypot(dx, dy) <= TAP_THRESHOLD_PX;
        }
        // Bake what the user has been seeing — dragLive ∘ viewBase — into
        // a single canonical Mobius. Composition of two pure translations
        // is not itself a pure translation (it picks up a rotation), so we
        // recover (a, θ) from sampling rather than algebraically. Skip
        // the bake on a tap so a sub-threshold drift doesn't subtly
        // rotate the disk on every background click.
        if (dragLive && !wasTap) {
            const live = dragLive;
            const base = viewBase;
            viewBase = mobiusFromFn((z) => live(applyMobius(base, z)));
        }
        dragLive = undefined;
        dragAnchor = undefined;
        pointerDownPx = null;
        if (wasTap) ondeselect?.();
    }

    // ---------- recenter on a person ------------------------------------

    function recenterOn(personId: PersonId): void {
        // If the user is mid-drag, recentering would fight the live pan
        // overlay. Skip silently — the drag is the authoritative gesture.
        if (dragAnchor !== undefined) return;
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

    /** Reset the view back to the identity Möbius (proband at disk centre). */
    function resetView(): void {
        viewBase = IDENTITY;
        dragLive = undefined;
    }

    // ---------- imperative controller -----------------------------------

    // The hyperbolic engine doesn't have a Euclidean zoom; the fisheye is
    // implicit in the projection. We surface a "centre-on-X" controller so
    // App.svelte's menu actions (centre on selection, centre on root) work
    // identically across engines, and report a fixed scale of 1 to keep the
    // shared scale state from going stale on engine switch.
    onMount(() => {
        oncontroller?.({
            getScale: () => 1,
            setScale: () => undefined,
            zoomBy: () => undefined,
            fit: resetView,
            zoom100: resetView,
            focusSelection: () => {
                if (selectedId) recenterOn(selectedId);
            },
            fitSelection: () => {
                if (selectedId) recenterOn(selectedId);
            },
            centerOnPerson: (id: PersonId) => recenterOn(id),
            centerAt: () => undefined,
            centerOnRoot: () => recenterOn(tree.rootId),
            getMode: () => "select",
            setMode: () => undefined,
        });
    });

    function onCardSelect(id: string): void {
        if (id === selectedId) ondeselect?.();
        else onselect?.(id);
    }

    function onCardDoubleClick(id: string): void {
        recenterOn(id);
    }

    function onClusterClick(c: ProjectedCluster): void {
        // A single click on a cluster glyph recenters the viewport on the
        // subtree's representative. The fisheye then grows the rep + its
        // surroundings past the readability threshold, which deflates the
        // cluster on the next frame.
        const cluster = clusters.find((cc) => cc.id === c.id);
        if (!cluster) return;
        recenterOn(cluster.rep);
    }

    function lookupPerson(id: PersonId) {
        return tree.people[id];
    }

    let probandName = $derived(displayName(tree, tree.rootId) || tree.name || "(no proband)");

    // ---------- debug surface -------------------------------------------

    // Expose a thin DOI introspection handle on `window.__treeDebug` while
    // the hyperbolic canvas is mounted. Closes the Phase 6 DoD bullet
    // "DOI score visible in `__treeDebug` for any selected node."
    type DebugHandle = NonNullable<Window["__treeDebug"]>;
    $effect(() => {
        if (typeof window === "undefined") return;
        const scoresSnapshot = new Map(doiScores);
        const clustersSnapshot = clusters.slice();
        const prev = window.__treeDebug;
        const base: DebugHandle = prev ?? {
            rawSegments: [],
            positions: new Map(),
            warnings: [],
            dumpSegment: () => undefined,
            findPath: () => undefined,
        };
        window.__treeDebug = {
            ...base,
            doi(id: string): DoiScore | undefined {
                return scoresSnapshot.get(id);
            },
            clusters: clustersSnapshot,
        };
        return () => {
            if (prev) window.__treeDebug = prev;
            else delete window.__treeDebug;
        };
    });
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
            {#if person && !clusterOf.has(item.id)}
                <!-- Two nested transforms — the outer centres the card on (cx, cy)
                     via translate(-50%, -50%), the inner applies the fisheye
                     scale around its own center. Splitting them avoids a known
                     percent-translate × scale anchoring drift that visibly
                     detaches the card from its edge as it shrinks. -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="hyp-person absolute"
                    style="left: {item.cx}px; top: {item.cy}px; transform: translate(-50%, -50%); pointer-events: {item.scale >
                    0.15
                        ? 'auto'
                        : 'none'};"
                    ondblclick={() => onCardDoubleClick(item.id)}
                >
                    <div style="transform: scale({item.scale}); transform-origin: center;">
                        <PersonNode
                            {person}
                            selected={selectedId === item.id}
                            level={0}
                            onselect={onCardSelect}
                        />
                    </div>
                </div>
            {/if}
        {/each}

        <!-- DOI cluster glyphs. One circle per contiguous low-DOI subtree;
             a `+N` count badge appears next to clusters with more than one
             member. A single-member cluster (or a stray low-DOI card not
             rolled into one) renders as a bare dot. Click recenters on the
             cluster's representative so the user can zoom into it. -->
        <svg
            class="pointer-events-none absolute inset-0"
            width={hostW}
            height={hostH}
            viewBox="0 0 {hostW} {hostH}"
            aria-hidden="true"
        >
            <g class="hyp-glyphs">
                {#each projectedClusters as c (c.id)}
                    <g
                        class="hyp-cluster pointer-events-auto"
                        transform="translate({c.cx} {c.cy})"
                        onclick={() => onClusterClick(c)}
                        onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") onClusterClick(c);
                        }}
                        role="button"
                        tabindex="-1"
                        aria-label={c.count > 1
                            ? `cluster of ${c.count} people, click to centre`
                            : "person, click to centre"}
                    >
                        <circle r={c.count > 1 ? 3 : 1.5} />
                        {#if c.count > 1}
                            <text class="hyp-cluster-count" x="6" y="3" font-size="9"
                                >+{c.count}</text
                            >
                        {/if}
                    </g>
                {/each}
            </g>
        </svg>

        <div
            class="text-fg-muted pointer-events-none absolute bottom-3 left-3 rounded bg-canvas-elev/80 px-2 py-1 text-xs backdrop-blur"
        >
            hyperbolic engine — proband: {probandName}
        </div>

        <!-- Tuning panel. Live-adjusts the four geometric/clustering knobs
             that meaningfully change how the disk reads. Persisted to
             localStorage so reloads keep your settings. -->
        <div class="hyp-tuning absolute bottom-3 right-3 text-xs">
            <button
                type="button"
                class="text-fg-muted rounded bg-canvas-elev/80 px-2 py-1 backdrop-blur hover:text-fg"
                onclick={() => (isTuningOpen = !isTuningOpen)}
                aria-expanded={isTuningOpen}
                aria-label="toggle tuning panel"
            >
                {isTuningOpen ? "▾ tuning" : "▸ tuning"}
            </button>
            {#if isTuningOpen}
                <div
                    class="mt-1 w-64 rounded bg-canvas-elev/95 p-3 text-fg shadow-lg backdrop-blur"
                >
                    <div class="hyp-tuning-row">
                        <label for="hyp-step">step distance</label>
                        <input
                            id="hyp-step"
                            type="range"
                            min="0.3"
                            max="1.5"
                            step="0.05"
                            bind:value={tuning.stepDistance}
                        />
                        <span class="hyp-tuning-value">{tuning.stepDistance.toFixed(2)}</span>
                    </div>
                    <div class="hyp-tuning-row">
                        <label for="hyp-spouse">spouse angle (rad)</label>
                        <input
                            id="hyp-spouse"
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            bind:value={tuning.spouseAngle}
                        />
                        <span class="hyp-tuning-value">{tuning.spouseAngle.toFixed(2)}</span>
                    </div>
                    <div class="hyp-tuning-row">
                        <label for="hyp-card">base card px</label>
                        <input
                            id="hyp-card"
                            type="range"
                            min="40"
                            max="200"
                            step="5"
                            bind:value={tuning.baseCardPx}
                        />
                        <span class="hyp-tuning-value">{tuning.baseCardPx}</span>
                    </div>
                    <div class="hyp-tuning-row">
                        <label for="hyp-cluster">cluster threshold px</label>
                        <input
                            id="hyp-cluster"
                            type="range"
                            min="4"
                            max="60"
                            step="2"
                            bind:value={tuning.clusterThresholdPx}
                        />
                        <span class="hyp-tuning-value">{tuning.clusterThresholdPx}</span>
                    </div>
                    <button
                        type="button"
                        class="text-fg-muted mt-2 w-full rounded border border-fg-muted/30 px-2 py-1 hover:text-fg"
                        onclick={() => (tuning = { ...DEFAULT_TUNING })}
                    >
                        reset to defaults
                    </button>
                </div>
            {/if}
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
    .edge-divorced {
        stroke-dasharray: 6 4;
    }
    .hyp-cluster {
        cursor: pointer;
        fill: var(--color-fg-muted);
    }
    .hyp-cluster:hover circle {
        fill: var(--color-fg);
    }
    .hyp-cluster-count {
        font-family: ui-sans-serif, system-ui, sans-serif;
        pointer-events: none;
        user-select: none;
        fill: var(--color-fg-muted);
    }
    .hyp-tuning-row {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 0.5rem;
        align-items: center;
        margin: 0.25rem 0;
    }
    .hyp-tuning-row label {
        color: var(--color-fg-muted);
        font-size: 11px;
    }
    .hyp-tuning-row input[type="range"] {
        width: 100%;
    }
    .hyp-tuning-value {
        font-variant-numeric: tabular-nums;
        font-size: 11px;
        min-width: 2.5em;
        text-align: right;
    }
</style>
