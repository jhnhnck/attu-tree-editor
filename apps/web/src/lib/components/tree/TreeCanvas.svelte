<!--
    FamilyTreeEditor - HTML pan/zoom canvas with viewport culling.
    Layout = hvLayout (focus-aware HV tidy tree); edges = routeEdges. Both run
    over the visible person set; TreeCanvas turns unit coords into pixels and
    renders cards as absolutely-positioned PersonNode hosts plus an SVG layer
    for the routed segments.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onMount, onDestroy, untrack } from "svelte";
    import { hvLayout, type GhostNode, COMPONENT_GAP } from "$lib/layout/hvLayout";
    import { routeEdges, type Segment } from "$lib/layout/edgeRouter";
    import { shortestPath, type Path } from "$lib/layout/graph";
    import { segmentsForPath } from "$lib/layout/pathHighlight";
    import EdgeLayer from "$lib/components/tree/EdgeLayer.svelte";
    import PersonNode from "$lib/components/tree/PersonNode.svelte";
    import type { RenderedSegment, PersonNodeLevel } from "$lib/components/tree/edges";
    import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";
    import type { PersonId, Tree } from "$lib/domain/types";
    import type { CanvasController } from "./canvasController";

    interface Props {
        tree: Tree;
        selectedId?: PersonId | undefined;
        portraitUrls?: PortraitUrlCache;
        onselect?: (id: PersonId) => void;
        ondeselect?: () => void;
        onedit?: (id: PersonId) => void;
        oncontextmenu?: (id: PersonId, x: number, y: number) => void;
        /** invoked once on mount with an imperative handle */
        oncontroller?: ((c: CanvasController) => void) | undefined;
        /** notifies the parent on every scale change so the zoom widget can re-render */
        onscalechange?: ((s: number) => void) | undefined;
        /** notifies the parent when the active tool flips */
        onmodechange?: ((m: "select" | "hand") => void) | undefined;
        /** path-trace overlay: ids of edge segments to draw highlighted */
        highlightedSegmentIds?: ReadonlySet<string> | undefined;
        /** pair of people to trace path between; highlights the path on canvas */
        traceIds?: readonly [PersonId, PersonId] | undefined;
        /** path result for display in UI (read-only, derived from traceIds) */
        tracePath?: Path | undefined;
        /** clicking the people-count pill calls this to toggle the inspector */
        ontoggleinspector?: (() => void) | undefined;
    }

    let {
        tree,
        selectedId,
        portraitUrls,
        onselect,
        ondeselect,
        onedit,
        oncontextmenu,
        oncontroller,
        onscalechange,
        onmodechange,
        highlightedSegmentIds,
        traceIds,
        tracePath: _,
        ontoggleinspector,
    }: Props = $props();

    // pixels per unit. hvLayout produces positions where 1 unit = "half a card
    // width" (a card is PERSON_W = 2 units across). UNIT * cardW / 2 = card
    // width in px; with UNIT=80 that's 160px which matches the prior visual
    // tuning without changing the perceived density.
    const UNIT = 80;
    /** visible card width in unit coords (matches edgeRouter default) */
    const CARD_W_U = 2;
    /** visible card height in unit coords (matches edgeRouter default) */
    const CARD_H_U = 1.2;
    const CARD_W = CARD_W_U * UNIT; // 160
    const CARD_H = CARD_H_U * UNIT; // 96
    const MIN_SCALE = 0.05;
    const MAX_SCALE = 5.0;
    const DRAG_THRESHOLD_PX = 4;
    const SELECT_PAN_MS = 320; // duration of "center on selection" tween
    const ZOOM_FAR = 0.3; // below → 2× stroke
    const ZOOM_MID = 0.6; // below → 1.4× stroke

    let layout = $derived(hvLayout(tree));
    let canvasW = $derived(layout.canvas.width * UNIT);
    let canvasH = $derived(layout.canvas.height * UNIT);

    let hostEl: HTMLDivElement | undefined = $state();
    let panEl: HTMLDivElement | undefined = $state();
    let resizeObs: ResizeObserver | undefined;

    // canonical transform state - panEl gets `translate(panX, panY) scale(scale)`
    let scale = $state(1);
    let panX = $state(0);
    let panY = $state(0);
    let hostW = $state(0);
    let hostH = $state(0);
    let firstFitDone = $state(false);
    let lastFitTreeId = "";

    // tool mode - "select" is normal click-to-select; "hand" is cosmetic for now
    // (pan works in either mode, cursor changes on the host element).
    let mode = $state<"select" | "hand">("select");
    let isDragging = $state(false);

    let strokeMultiplier = $derived(
        scale < ZOOM_FAR ? 2 : scale < ZOOM_MID ? 1.4 : 1,
    );

    // notify parent on scale changes
    $effect(() => {
        const s = scale;
        untrack(() => onscalechange?.(s));
    });

    $effect(() => {
        const m = mode;
        untrack(() => onmodechange?.(m));
        if (hostEl) hostEl.style.cursor = m === "hand" ? "grab" : "default";
    });

    // apply transform whenever any of scale/panX/panY change
    $effect(() => {
        if (!panEl) return;
        panEl.style.transform = `translate(${String(panX)}px, ${String(panY)}px) scale(${String(scale)})`;
    });

    onMount(() => {
        if (!hostEl) return;
        const rect = hostEl.getBoundingClientRect();
        hostW = rect.width;
        hostH = rect.height;

        resizeObs = new ResizeObserver(() => {
            if (!hostEl) return;
            const r = hostEl.getBoundingClientRect();
            hostW = r.width;
            hostH = r.height;
        });
        resizeObs.observe(hostEl);

        // wait one frame for the inner stage to lay out, then reset to 100%
        requestAnimationFrame(() => {
            resetView();
            firstFitDone = true;
        });
    });

    onDestroy(() => {
        resizeObs?.disconnect();
        cancelPanAnim();
    });

    // re-fit when a new tree id arrives (typical of an import)
    $effect(() => {
        const treeKey = tree.id;
        void canvasW;
        void canvasH;
        untrack(() => {
            if (treeKey !== lastFitTreeId && hostEl && firstFitDone) {
                lastFitTreeId = treeKey;
                requestAnimationFrame(resetView);
            } else if (!lastFitTreeId) {
                lastFitTreeId = treeKey;
            }
        });
    });

    /** zoom-to-fit: shows the whole tree (used by the "fit" button) */
    function fitToView(): void {
        if (!hostEl) return;
        const rect = hostEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (canvasW === 0 || canvasH === 0) return;
        cancelPanAnim();
        const padding = 64;
        const sx = (rect.width - padding * 2) / canvasW;
        const sy = (rect.height - padding * 2) / canvasH;
        const s = clamp(Math.min(sx, sy), MIN_SCALE, 1.5);
        scale = s;
        panX = (rect.width - canvasW * s) / 2;
        panY = (rect.height - canvasH * s) / 2;
    }

    /** 100% zoom centered on the root person (used on initial load + import) */
    function resetView(): void {
        if (!hostEl) return;
        const rect = hostEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        cancelPanAnim();
        scale = 1;
        const rootPos = layout.positions.get(tree.rootId);
        if (rootPos) {
            const cx = rootPos.x * UNIT + CARD_W / 2;
            const cy = rootPos.y * UNIT + CARD_H / 2;
            panX = rect.width / 2 - cx;
            panY = rect.height / 2 - cy;
        } else {
            panX = (rect.width - canvasW) / 2;
            panY = (rect.height - canvasH) / 2;
        }
    }

    /** deselect when clicking the canvas background (not a card) */
    function onHostClick(e: MouseEvent): void {
        if (e.target === hostEl || e.target === panEl) ondeselect?.();
    }

    /** Escape key deselects; paired with onclick to satisfy a11y requirements */
    function onHostKeyDown(e: KeyboardEvent): void {
        if (e.key === "Escape") ondeselect?.();
    }

    function clamp(n: number, lo: number, hi: number): number {
        return Math.max(lo, Math.min(hi, n));
    }

    // --- smooth pan-to-center on selection ---
    let panAnimFrame: number | null = null;

    function cancelPanAnim(): void {
        if (panAnimFrame !== null) {
            cancelAnimationFrame(panAnimFrame);
            panAnimFrame = null;
        }
    }

    function easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function animatePanTo(toX: number, toY: number): void {
        cancelPanAnim();
        const fromX = panX;
        const fromY = panY;
        if (fromX === toX && fromY === toY) return;
        const start = performance.now();
        const step = (now: number): void => {
            const t = Math.min(1, (now - start) / SELECT_PAN_MS);
            const e = easeInOutCubic(t);
            panX = fromX + (toX - fromX) * e;
            panY = fromY + (toY - fromY) * e;
            if (t < 1) {
                panAnimFrame = requestAnimationFrame(step);
            } else {
                panAnimFrame = null;
            }
        };
        panAnimFrame = requestAnimationFrame(step);
    }

    function centerOnPosition(pos: { x: number; y: number }): void {
        if (!hostEl) return;
        const rect = hostEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const cx = pos.x * UNIT + CARD_W / 2;
        const cy = pos.y * UNIT + CARD_H / 2;
        const targetX = rect.width / 2 - cx * scale;
        const targetY = rect.height / 2 - cy * scale;
        animatePanTo(targetX, targetY);
    }

    function centerOnPerson(id: PersonId): void {
        const pos = layout.positions.get(id);
        if (!pos) return;
        centerOnPosition(pos);
    }

    // when selection changes externally, glide the canvas to center it
    $effect(() => {
        const id = selectedId;
        untrack(() => {
            if (id && firstFitDone) centerOnPerson(id);
        });
    });

    // --- imperative controller exposed to App.svelte ---

    function setScale(next: number): void {
        if (!hostEl) {
            scale = clamp(next, MIN_SCALE, MAX_SCALE);
            return;
        }
        const rect = hostEl.getBoundingClientRect();
        const target = clamp(next, MIN_SCALE, MAX_SCALE);
        if (target === scale) return;
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const cuX = (cx - panX) / scale;
        const cuY = (cy - panY) / scale;
        panX = cx - cuX * target;
        panY = cy - cuY * target;
        scale = target;
    }

    function zoomBy(factor: number): void {
        setScale(scale * factor);
    }

    function zoom100(): void {
        setScale(1);
    }

    function focusSelection(): void {
        if (selectedId) centerOnPerson(selectedId);
    }

    function fitSelection(): void {
        if (!selectedId || !hostEl) return;
        const pos = layout.positions.get(selectedId);
        if (!pos) return;
        const rect = hostEl.getBoundingClientRect();
        const padding = 96;
        const sx = (rect.width - padding * 2) / CARD_W;
        const sy = (rect.height - padding * 2) / CARD_H;
        const target = clamp(Math.min(sx, sy), MIN_SCALE, MAX_SCALE);
        scale = target;
        const cx = pos.x * UNIT + CARD_W / 2;
        const cy = pos.y * UNIT + CARD_H / 2;
        panX = rect.width / 2 - cx * target;
        panY = rect.height / 2 - cy * target;
    }

    function centerOnRoot(): void {
        const rid = tree.rootId;
        if (rid) centerOnPerson(rid);
    }

    onMount(() => {
        oncontroller?.({
            getScale: () => scale,
            setScale,
            zoomBy,
            fit: fitToView,
            zoom100,
            focusSelection,
            fitSelection,
            centerOnPerson,
            centerOnRoot,
            getMode: () => mode,
            setMode: (m) => (mode = m),
        });
    });

    // --- wheel zoom (cursor-anchored) ---

    function onWheel(e: WheelEvent): void {
        e.preventDefault();
        // ctrl+wheel = trackpad pinch in chrome/safari; deltas are larger
        const intensity = e.ctrlKey ? 0.012 : 0.0018;
        const factor = Math.exp(-e.deltaY * intensity);
        const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
        if (next === scale) return;

        // anchor at the center of the host viewport (not the cursor) so the
        // visible center stays put during zoom. hostW/hostH are kept in sync
        // by the ResizeObserver — reading them avoids a forced synchronous layout.
        const cx = hostW / 2;
        const cy = hostH / 2;
        const cuX = (cx - panX) / scale;
        const cuY = (cy - panY) / scale;
        panX = cx - cuX * next;
        panY = cy - cuY * next;
        scale = next;
    }

    // --- pan (drag-anywhere, including over cards) ---
    // we deliberately do NOT use setPointerCapture - that intercepts the
    // synthesized click/dblclick events and breaks the per-card handlers.
    // instead we listen on window for move/up so dragging still works when
    // the cursor leaves the host. clicks fire normally as long as the pointer
    // didn't move past DRAG_THRESHOLD_PX.

    let dragState: {
        pointerId: number;
        startX: number;
        startY: number;
        startPanX: number;
        startPanY: number;
        moved: boolean;
    } | null = null;

    function onPointerDown(e: PointerEvent): void {
        if (e.button !== 0) return;
        dragState = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startPanX: panX,
            startPanY: panY,
            moved: false,
        };
        window.addEventListener("pointermove", onWindowPointerMove);
        window.addEventListener("pointerup", onWindowPointerUp);
        window.addEventListener("pointercancel", onWindowPointerCancel);
    }

    function onWindowPointerMove(e: PointerEvent): void {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (!dragState.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
            dragState.moved = true;
            isDragging = true;
        }
        if (dragState.moved) {
            panX = dragState.startPanX + dx;
            panY = dragState.startPanY + dy;
        }
    }

    function onWindowPointerUp(e: PointerEvent): void {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const moved = dragState.moved;
        cleanupDrag();
        if (moved) {
            // suppress the click that would otherwise fire on a card after a pan
            const suppressNext = (ev: MouseEvent): void => {
                ev.stopPropagation();
                ev.preventDefault();
                window.removeEventListener("click", suppressNext, true);
            };
            window.addEventListener("click", suppressNext, true);
        }
    }

    function onWindowPointerCancel(e: PointerEvent): void {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        cleanupDrag();
    }

    function cleanupDrag(): void {
        dragState = null;
        isDragging = false;
        window.removeEventListener("pointermove", onWindowPointerMove);
        window.removeEventListener("pointerup", onWindowPointerUp);
        window.removeEventListener("pointercancel", onWindowPointerCancel);
    }

    // --- shared types + culling helpers ---

    interface VisibleNode {
        id: PersonId;
        x: number;
        y: number;
        isGhost?: boolean;
        nearId?: PersonId;
        isIsolated?: boolean;
    }
    interface VisibleRect {
        left: number;
        top: number;
        right: number;
        bottom: number;
    }

    function cullNodes(
        positions: ReadonlyMap<PersonId, { x: number; y: number }>,
        r: VisibleRect,
        ghosts?: readonly GhostNode[],
        isolated?: readonly PersonId[],
    ): VisibleNode[] {
        const isolatedSet = new Set(isolated);
        const out: VisibleNode[] = [];
        for (const [id, pos] of positions) {
            // skip ids that vanished from `tree.people` between layout +
            // render (rare; defensive). this also keeps the {#each} below
            // free of an inner {#if} so animate:flip applies to the only
            // direct child of the each block.
            if (!tree.people[id]) continue;
            const xPx = pos.x * UNIT;
            const yPx = pos.y * UNIT;
            if (
                xPx + CARD_W >= r.left &&
                xPx <= r.right &&
                yPx + CARD_H >= r.top &&
                yPx <= r.bottom
            ) {
                out.push({ id, x: pos.x, y: pos.y, isIsolated: isolatedSet.has(id) });
            }
        }
        // also cull ghost nodes
        if (ghosts) {
            for (const g of ghosts) {
                if (!tree.people[g.ghostOf]) continue;
                const xPx = g.x * UNIT;
                const yPx = g.y * UNIT;
                if (
                    xPx + CARD_W >= r.left &&
                    xPx <= r.right &&
                    yPx + CARD_H >= r.top &&
                    yPx <= r.bottom
                ) {
                    out.push({
                        id: g.ghostOf,
                        x: g.x,
                        y: g.y,
                        isGhost: true,
                        nearId: g.nearId,
                        isIsolated: isolatedSet.has(g.ghostOf),
                    });
                }
            }
        }
        return out;
    }

    function toRendered(segs: readonly Segment[]): RenderedSegment[] {
        const out: RenderedSegment[] = new Array<RenderedSegment>(segs.length);
        for (let i = 0; i < segs.length; i++) {
            const s = segs[i]!;
            const base: RenderedSegment = {
                id: s.id,
                kind: s.kind,
                role: s.role,
                x1: s.x1 * UNIT,
                y1: s.y1 * UNIT,
                x2: s.x2 * UNIT,
                y2: s.y2 * UNIT,
            };
            out[i] = s.hops ? { ...base, hops: s.hops.map((h) => h * UNIT) } : base;
        }
        return out;
    }

    let visibleRect = $derived.by(() => {
        if (hostW === 0 || hostH === 0) {
            return { left: 0, top: 0, right: canvasW, bottom: canvasH };
        }
        const margin = CARD_W;
        const left = -panX / scale - margin;
        const top = -panY / scale - margin;
        const right = left + hostW / scale + margin * 2;
        const bottom = top + hostH / scale + margin * 2;
        return { left, top, right, bottom };
    });

    // build ghost positions map for edge routing (use last ghost per person)
    let ghostPositionsMap = $derived.by(() => {
        const m = new Map<PersonId, { x: number; y: number }>();
        for (const g of layout.ghosts) {
            m.set(g.ghostOf, { x: g.x, y: g.y });
        }
        return m;
    });

    /**
     * Edge segments live on a single SVG <path> per role, so we don't cull them
     * on pan/zoom — culling would change `d` per frame and force the browser to
     * re-parse the path string. With `d` stable, the parent transform composites
     * on the GPU and pan/zoom stays smooth at 1k+ edges.
     */
    let routedEdges = $derived(
        toRendered(
            routeEdges(tree, layout.positions, {
                cardWidth: CARD_W_U,
                cardHeight: CARD_H_U,
                ghostPositions: ghostPositionsMap,
            }),
        ),
    );
    let visibleNodes = $derived(cullNodes(layout.positions, visibleRect, layout.ghosts, layout.isolated));

    let computedTracePath = $derived(
        traceIds ? shortestPath(tree, traceIds[0], traceIds[1]) : undefined
    );
    let computedHighlightedIds = $derived(
        computedTracePath ? segmentsForPath(computedTracePath, routedEdges) : highlightedSegmentIds
    );

    function levelFromScale(s: number): PersonNodeLevel {
        if (s >= 0.55) return 0;
        if (s >= 0.35) return 1;
        if (s >= 0.2) return 2;
        if (s >= 0.12) return 3;
        if (s >= 0.06) return 4;
        return 5;
    }

    let cardLevel = $derived(levelFromScale(scale));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_noninteractive_tabindex -->
<div
    bind:this={hostEl}
    class="canvas-host bg-canvas relative h-full w-full overflow-hidden"
    class:is-dragging={isDragging}
    style:touch-action="none"
    role="application"
    tabindex="0"
    aria-label="family tree canvas"
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onclick={onHostClick}
    onkeydown={onHostKeyDown}
    oncontextmenu={(e) => e.preventDefault()}
>
    <div
        bind:this={panEl}
        class="canvas-stage absolute top-0 left-0"
        style:width="{canvasW}px"
        style:height="{canvasH}px"
        style:transform-origin="0 0"
        style:opacity={firstFitDone ? "1" : "0"}
    >
        <svg
            width={canvasW}
            height={canvasH}
            class="pointer-events-none absolute top-0 left-0"
            aria-hidden="true"
        >
            <EdgeLayer
                edges={routedEdges}
                highlightedIds={computedHighlightedIds}
                {strokeMultiplier}
            />
            <!-- component dividers between non-singleton components -->
            {#each layout.components.slice(1) as comp (comp.rootId)}
                {@const dividerX = (comp.offsetLeft - COMPONENT_GAP / 2) * UNIT}
                <line
                    x1={dividerX}
                    y1="0"
                    x2={dividerX}
                    y2={canvasH}
                    stroke="var(--color-border-muted)"
                    stroke-width="1"
                    opacity="0.4"
                    vector-effect="non-scaling-stroke"
                />
            {/each}
        </svg>

        {#each visibleNodes as v (v.isGhost ? `${v.id}-ghost-${v.nearId}` : v.id)}
            <div
                class="person-node-host absolute"
                class:is-isolated={v.isIsolated}
                style:left="{v.x * UNIT}px"
                style:top="{v.y * UNIT}px"
                style:width="{CARD_W}px"
                style:height="{CARD_H}px"
            >
                <PersonNode
                    person={tree.people[v.id]!}
                    level={cardLevel}
                    {scale}
                    selected={selectedId === v.id}
                    portraitUrl={portraitUrls?.get(tree.people[v.id]?.portraitBlobId)}
                    {...(v.isGhost && { isGhost: true })}
                    onselect={(id: string) => onselect?.(id)}
                    onedit={(id: string) => onedit?.(id)}
                    oncontextmenu={(id: string, x: number, y: number) => oncontextmenu?.(id, x, y)}
                    {...(v.isGhost && {
                        onJumpToReal: () => {
                            const realPos = layout.positions.get(v.id);
                            if (realPos) centerOnPosition(realPos);
                        },
                    })}
                />
            </div>
        {/each}
    </div>

    <div class="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2">
        <button
            type="button"
            class="text-fg-muted bg-canvas-elev/80 border-line rounded-md border px-2 py-1 font-mono text-[10px]"
            class:pointer-events-auto={!!ontoggleinspector}
            class:hover:border-accent={!!ontoggleinspector}
            class:cursor-pointer={!!ontoggleinspector}
            class:cursor-default={!ontoggleinspector}
            title={layout.components.length > 1
                ? `${String(layout.components.length)} clusters` +
                  (layout.isolated.length > 0
                      ? ` + ${String(layout.isolated.length)} isolated`
                      : "")
                : undefined}
            onclick={() => ontoggleinspector?.()}
        >
            {String(layout.totalPeople)} people
            {#if layout.components.length > 1 || layout.isolated.length > 0}
                <span class="text-amber-400"
                    >· {String(layout.components.length)}{#if layout.isolated.length > 0}+{String(
                            layout.isolated.length,
                        )}{/if}
                    clusters</span
                >
            {/if}
        </button>
    </div>
</div>

<style>
    .canvas-host {
        cursor: grab;
    }
    .canvas-host.is-dragging {
        cursor: grabbing !important;
    }
    .canvas-stage {
        transition: opacity 200ms ease-out;
        will-change: transform;
        contain: layout style;
    }
    .person-node-host {
        contain: layout style paint;
        /* cards always render above the SVG edge layer regardless of any
           future stacking-context shenanigans on the parent stage. */
        z-index: 1;
        /* opaque canvas-coloured backdrop so edges passing behind a card are
           obscured rather than visible through PersonNode's translucent
           gender tint (`bg-sky-700/35` etc.). matches PersonNode's `rounded-md`
           so the backdrop doesn't leak around the card's rounded corners. */
        background: var(--color-canvas);
        border-radius: 0.375rem;
    }
    .person-node-host.is-isolated {
        opacity: 0.55;
    }
</style>
