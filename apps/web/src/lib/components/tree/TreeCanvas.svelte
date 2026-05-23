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
    import { COMPONENT_GAP } from "$lib/layout/constants";
    import {
        type GhostNode,
        type HvLayoutResult,
        placedGraphToHvLayout,
    } from "$lib/components/tree/canvasLayout";
    import {
        hydrateLayered,
        hydrateOrdered,
        hydratePlaced,
        serializeOverrides,
        type LayeredGraph,
        type LayoutWarning,
        type OrderedGraph,
        type PlacedGraph,
        type LayoutOverrides,
        type LayeredGraphWire,
        type OrderedGraphWire,
        type PlacedGraphWire,
    } from "$lib/layout/ir";
    import type { Segment } from "$lib/layout/edgeRouter";
    import type { LayeredEngineTimings } from "$lib/layout/engines/layered-hv";
    import { shortestPath, type Path } from "$lib/layout/graph";
    import { bundlesForPath } from "$lib/layout/pathHighlight";
    import EdgeLayer from "$lib/components/tree/EdgeLayer.svelte";
    import DebugOverlay from "$lib/components/tree/DebugOverlay.svelte";
    import PersonNode from "$lib/components/tree/PersonNode.svelte";
    import InstancePopover from "$lib/components/tree/InstancePopover.svelte";
    import BackButton from "$lib/components/canvas/BackButton.svelte";
    import { buildInstanceEntries, type InstanceEntry } from "$lib/layout/instanceLabels";
    import { displayName, findNeighbour } from "$lib/layout/kinship";
    import type { RenderedSegment, PersonNodeLevel } from "$lib/components/tree/edges";
    import type { DebugLayerOptions } from "$lib/components/tree/debugTypes";
    import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";
    import type { PersonId, Tree } from "$lib/domain/types";
    import type { CanvasAnchorOpts, CanvasController } from "./canvasController";

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
        /** path-trace overlay: ids of edge bundles to draw highlighted */
        highlightedBundleIds?: ReadonlySet<string> | undefined;
        /** pair of people to trace path between; highlights the path on canvas */
        traceIds?: readonly [PersonId, PersonId] | undefined;
        // ontoggleinspector removed: the stats pill (the only caller)
        // moved out to App.svelte's shared bottom-left bar.
        /** debug overlay options (if undefined, debug overlay is not rendered) */
        debugOptions?:
            | {
                  layers: DebugLayerOptions;
                  tracePath?: Path | undefined;
              }
            | undefined;
        /** invoked on every layout response with per-pass timings (ms) */
        ontimings?: ((t: LayeredEngineTimings) => void) | undefined;
        /** Phase 3: drives the last-edit halo overlay; bumped on mutation. */
        lastEditedId?: PersonId | undefined;
        /** invoked when the in-canvas layout updates with people / cluster
         *  counts; the shell renders the stats pill so it can share a
         *  bottom-left bar with the debug toolbox pill. */
        onlayoutstats?:
            | ((stats: { totalPeople: number; components: number; isolated: number }) => void)
            | undefined;
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
        highlightedBundleIds,
        traceIds,
        debugOptions,
        ontimings,
        lastEditedId,
        onlayoutstats,
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
    const ZOOM_TAU = 80; // ms time constant for wheel-zoom easing
    const ZOOM_FAR = 0.3; // below → 2× stroke
    const ZOOM_MID = 0.6; // below → 1.4× stroke

    // Layout pipeline runs in a Web Worker (all four passes are pure/serializable).
    const layoutWorker = new Worker(new URL("$lib/layout/layout.worker.ts", import.meta.url), {
        type: "module",
    });
    let layoutSeq = 0;

    let layeredGraph = $state<LayeredGraph | undefined>(undefined);
    let orderedGraph = $state<OrderedGraph | undefined>(undefined);
    let placedGraph = $state<PlacedGraph | undefined>(undefined);
    let rawSegments = $state<readonly Segment[]>([]);
    let routedEdges = $state<readonly RenderedSegment[]>([]);
    /**
     * Non-fatal warnings emitted by the most recent layout pass. Mirrored
     * onto `window.__treeDebug.warnings[]` for diagnosis. Replaces the
     * earlier per-warning `console.warn` calls in `route.ts`.
     */
    let layoutWarnings = $state<readonly LayoutWarning[]>([]);

    // Persistent layout overrides (pinned x, swap hints, lane hints).
    // Currently empty — no drag-to-pin UX yet. Populated by future follow-up.
    let layoutOverrides = $state<LayoutOverrides>({});

    const EMPTY_LAYOUT: HvLayoutResult = {
        positions: new Map(),
        canvas: { width: 0, height: 0 },
        components: [],
        isolated: [],
        ghosts: [],
        totalPeople: 0,
        laidOutPeople: 0,
    };
    let layout = $derived(placedGraph ? placedGraphToHvLayout(placedGraph) : EMPTY_LAYOUT);
    let canvasW = $derived(layout.canvas.width * UNIT);
    let canvasH = $derived(layout.canvas.height * UNIT);

    // Shell renders the people / cluster stats pill (combined with the
    // debug toolbox pill in App.svelte's bottom-left bar). Mirror the
    // layout values up whenever they change.
    $effect(() => {
        onlayoutstats?.({
            totalPeople: layout.totalPeople,
            components: layout.components.length,
            isolated: layout.isolated.length,
        });
    });

    // Send the tree to the worker whenever tree.id, tree.editRev, or overrides change.
    // The engineId is hard-coded to "layered" here: TreeCanvas is the layered-engine
    // canvas; the hyperbolic engine has its own component and short-circuits the
    // worker entirely (Phase 5 will revisit).
    $effect(() => {
        void tree.id;
        void tree.editRev;
        const overrides = layoutOverrides;
        const seq = ++layoutSeq;
        layoutWorker.postMessage({
            seq,
            tree: $state.snapshot(tree),
            rootId: tree.rootId,
            engineId: "layered",
            overrides: serializeOverrides(overrides),
        });
    });

    layoutWorker.onmessage = (
        e: MessageEvent<{
            seq: number;
            engineId: "layered" | "hyperbolic";
            layered: LayeredGraphWire;
            ordered: OrderedGraphWire;
            placed: PlacedGraphWire;
            segments: readonly Segment[];
            warnings: readonly LayoutWarning[];
            timings?: LayeredEngineTimings;
        }>,
    ): void => {
        const { seq, layered, ordered, placed, segments: segs, warnings, timings } = e.data;
        if (seq !== layoutSeq) return; // drop stale response
        layeredGraph = hydrateLayered(layered);
        orderedGraph = hydrateOrdered(ordered);
        placedGraph = hydratePlaced(placed);
        rawSegments = segs;
        routedEdges = toRendered(segs);
        layoutWarnings = warnings;
        if (timings) {
            lastTimings = timings;
            ontimings?.(timings);
        }
    };

    let lastTimings = $state<LayeredEngineTimings | undefined>(undefined);

    onDestroy(() => layoutWorker.terminate());

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

    // One-shot: re-center on root after the first worker layout response arrives.
    // resetView() is called in onMount's rAF, but layout is empty at that point;
    // this effect fires once the first non-empty layout lands from the worker.
    let didInitialCenter = false;
    $effect(() => {
        const count = layout.positions.size;
        if (count > 0 && !didInitialCenter && firstFitDone) {
            didInitialCenter = true;
            untrack(() => requestAnimationFrame(resetView));
        }
    });

    // wheel-zoom smoothing: imperative funcs bypass by calling cancelZoomAnim()
    let targetScale = 1;
    let zoomAnimId: number | undefined;
    let zoomAnchorCx = 0;
    let zoomAnchorCy = 0;
    let zoomAnchorUx = 0;
    let zoomAnchorUy = 0;
    let zoomPrevTime = 0;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // freeze cardLevel + nodeBorderWidth during active wheel-zoom anim. without
    // this, every eased frame crosses scale thresholds and recomputes the level,
    // forcing each visible card to re-render. captured at anim start, cleared
    // when the anim settles or is cancelled.
    let isZooming = $state(false);
    let frozenCardLevel = $state<PersonNodeLevel>(0);
    let frozenBorderWidth = $state<string>("2.00px");

    // tool mode - "select" is normal click-to-select; "hand" is cosmetic for now
    // (pan works in either mode, cursor changes on the host element).
    let mode = $state<"select" | "hand">("select");
    let isDragging = $state(false);

    // per-instance ring: when set, only the matching ghost/primary glows; null
    // = ring all instances of selectedId (used by external selection sources).
    let selectedInstanceKey = $state<string | null>(null);
    // one-shot: skip the auto-pan-on-selection effect for the next select call
    // (set when clicking a ghost body, or when picking from the popover).
    let suppressNextSelectionPan = $state(false);
    // popover state: which person, which icon to anchor to, current location.
    let instancePopover = $state<{
        personId: PersonId;
        anchor: HTMLElement;
        currentKey: string;
    } | null>(null);
    // single-level undo for popover-jump navigation.
    interface JumpSnapshot {
        panX: number;
        panY: number;
        scale: number;
        selectedInstanceKey: string | null;
        fromName: string;
    }
    let lastJumpSnapshot = $state<JumpSnapshot | null>(null);
    let lastTreeRef: Tree | undefined;

    let strokeMultiplier = $derived(scale < ZOOM_FAR ? 2 : scale < ZOOM_MID ? 1.4 : 1);

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

        window.addEventListener("blur", onWindowBlur);
    });

    onDestroy(() => {
        resizeObs?.disconnect();
        cancelPanAnim();
        cancelZoomAnim();
        window.removeEventListener("blur", onWindowBlur);
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
        cancelZoomAnim();
        const padding = 64;
        const sx = (rect.width - padding * 2) / canvasW;
        const sy = (rect.height - padding * 2) / canvasH;
        const s = clamp(Math.min(sx, sy), MIN_SCALE, 1.5);
        scale = s;
        targetScale = s;
        panX = (rect.width - canvasW * s) / 2;
        panY = (rect.height - canvasH * s) / 2;
    }

    /** 100% zoom centered on the root person (used on initial load + import) */
    function resetView(): void {
        if (!hostEl) return;
        const rect = hostEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        cancelPanAnim();
        cancelZoomAnim();
        scale = 1;
        targetScale = 1;
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

    /** Escape deselects; arrow keys move selection geometrically */
    function onHostKeyDown(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            ondeselect?.();
            return;
        }
        if (!selectedId) return;
        let dir: "up" | "down" | "left" | "right" | undefined;
        if (e.key === "ArrowRight") dir = "right";
        else if (e.key === "ArrowLeft") dir = "left";
        else if (e.key === "ArrowDown") dir = "down";
        else if (e.key === "ArrowUp") dir = "up";
        if (dir) {
            e.preventDefault();
            const next = findNeighbour(selectedId, dir, layout.positions);
            if (next) onselect?.(next);
        }
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

    function cancelZoomAnim(): void {
        if (zoomAnimId !== undefined) {
            cancelAnimationFrame(zoomAnimId);
            zoomAnimId = undefined;
        }
        isZooming = false;
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

    // when selection changes externally, glide the canvas to center it.
    // also reconciles `selectedInstanceKey` (clears it if it no longer refers
    // to the new selectedId) and clears the back-jump snapshot on external
    // selection changes (popover-jump and ghost-body click both set
    // suppressNextSelectionPan first to opt out).
    $effect(() => {
        const id = selectedId;
        untrack(() => {
            const wasSuppressed = suppressNextSelectionPan;
            if (suppressNextSelectionPan) suppressNextSelectionPan = false;

            if (selectedInstanceKey) {
                const matches =
                    !!id &&
                    (selectedInstanceKey === id || selectedInstanceKey.startsWith(`${id}-ghost-`));
                if (!matches) selectedInstanceKey = null;
            }
            if (!wasSuppressed && lastJumpSnapshot) lastJumpSnapshot = null;
            if (wasSuppressed) return;
            if (id && firstFitDone) centerOnPerson(id);
        });
    });

    // tree-edit clearing for the back-jump snapshot. layout positions can
    // shift on edit, so the captured pan/zoom no longer points where the
    // user was looking.
    $effect(() => {
        const t = tree;
        untrack(() => {
            if (lastTreeRef !== undefined && lastTreeRef !== t && lastJumpSnapshot) {
                lastJumpSnapshot = null;
            }
            lastTreeRef = t;
        });
    });

    // --- debug overlay state ---

    $effect(() => {
        if (!debugOptions?.layers.exposeTreeDebug) {
            delete window.__treeDebug;
            return;
        }
        // Snapshot every live $state reference before exposing on window.
        // Without this, devtools mutations would write straight back into
        // the reactive store and corrupt the editor's source of truth.
        // $state.snapshot() uses structuredClone, which preserves Maps at
        // runtime — but Svelte's Snapshot<T> type strips Map methods. We
        // route through `unknown` to recover the declared shape; eslint's
        // typecheck rule disagrees with svelte-check on whether the cast
        // is needed, so silence it locally.
        /* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
        const capturedLayout = $state.snapshot(layout) as unknown as HvLayoutResult;
        const capturedRaw = $state.snapshot(rawSegments) as unknown as readonly Segment[];
        const capturedTree = $state.snapshot(tree) as unknown as Tree;
        const capturedLayered =
            layeredGraph !== undefined
                ? ($state.snapshot(layeredGraph) as unknown as LayeredGraph)
                : undefined;
        const capturedOrdered =
            orderedGraph !== undefined
                ? ($state.snapshot(orderedGraph) as unknown as OrderedGraph)
                : undefined;
        const capturedPlaced =
            placedGraph !== undefined
                ? ($state.snapshot(placedGraph) as unknown as PlacedGraph)
                : undefined;
        const capturedWarnings = $state.snapshot(
            layoutWarnings,
        ) as unknown as readonly LayoutWarning[];
        /* eslint-enable @typescript-eslint/no-unnecessary-type-assertion */
        const capturedCycleNodes = capturedLayered?.cycleNodes;
        window.__treeDebug = {
            layout: capturedLayout,
            rawSegments: capturedRaw,
            positions: capturedLayout.positions,
            warnings: capturedWarnings,
            ...(capturedLayered !== undefined ? { layeredGraph: capturedLayered } : {}),
            ...(capturedOrdered !== undefined ? { orderedGraph: capturedOrdered } : {}),
            ...(capturedPlaced !== undefined ? { placedGraph: capturedPlaced } : {}),
            ...(capturedCycleNodes !== undefined && capturedCycleNodes.length > 0
                ? { cycleNodes: capturedCycleNodes }
                : {}),
            ...(lastTimings !== undefined ? { timings: lastTimings } : {}),
            dumpSegment(id: string): void {
                const seg = capturedRaw.find((s) => s.id === id || s.id.startsWith(id));
                if (!seg) {
                    // eslint-disable-next-line no-console
                    console.log(`[treeDebug] no segment matching "${id}"`);
                    return;
                }
                // eslint-disable-next-line no-console
                console.log(`[treeDebug] segment ${seg.id}`, seg);
            },
            findPath(id1: string, id2: string): void {
                const result = shortestPath(capturedTree, id1, id2);
                if (!result) {
                    // eslint-disable-next-line no-console
                    console.log(`[treeDebug] no path ${id1} → ${id2}`);
                    return;
                }
                // eslint-disable-next-line no-console
                console.log(
                    `[treeDebug] path (${result.ids.length} nodes):`,
                    result.ids.join(" → "),
                );
                // eslint-disable-next-line no-console
                console.table(result.steps);
            },
        };
        return () => {
            delete window.__treeDebug;
        };
    });

    // --- imperative controller exposed to App.svelte ---

    function clearJumpSnapshot(): void {
        if (lastJumpSnapshot) lastJumpSnapshot = null;
        if (instancePopover) instancePopover = null;
    }

    function setScale(next: number, opts?: CanvasAnchorOpts): void {
        clearJumpSnapshot();
        cancelZoomAnim();
        if (!hostEl) {
            scale = clamp(next, MIN_SCALE, MAX_SCALE);
            targetScale = scale;
            return;
        }
        const rect = hostEl.getBoundingClientRect();
        const target = clamp(next, MIN_SCALE, MAX_SCALE);
        if (target === scale) return;
        // wave-2 phase 0b: anchor defaults to viewport center; callers
        // (wheel / pinch) that need cursor anchoring pass anchorPx
        // explicitly. existing widget + / − / slider / exact-percent
        // paths land here without anchorPx → host-center anchor, the
        // documented stable behaviour.
        const cx = opts?.anchorPx?.x ?? rect.width / 2;
        const cy = opts?.anchorPx?.y ?? rect.height / 2;
        const cuX = (cx - panX) / scale;
        const cuY = (cy - panY) / scale;
        panX = cx - cuX * target;
        panY = cy - cuY * target;
        scale = target;
        targetScale = target;
    }

    function zoomBy(factor: number, opts?: CanvasAnchorOpts): void {
        setScale(scale * factor, opts);
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
        cancelZoomAnim();
        const padding = 96;
        const sx = (rect.width - padding * 2) / CARD_W;
        const sy = (rect.height - padding * 2) / CARD_H;
        const target = clamp(Math.min(sx, sy), MIN_SCALE, MAX_SCALE);
        scale = target;
        targetScale = target;
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
            centerAt: (xU: number, yU: number) => centerOnPosition({ x: xU, y: yU }),
            centerOnRoot,
            getMode: () => mode,
            setMode: (m) => (mode = m),
        });
    });

    // --- wheel zoom (cursor-anchored, eased) ---

    function onWheel(e: WheelEvent): void {
        if (pinchActive) return; // ignore stray wheel events during touch pinch
        e.preventDefault();

        // ctrl+wheel = trackpad pinch gesture in chrome/safari (larger deltas);
        // sensitivity is lower than mouse wheel to avoid snap-zooming.
        const intensity = e.ctrlKey ? 0.0045 : 0.0018;
        const factor = Math.exp(-e.deltaY * intensity);
        const next = clamp(targetScale * factor, MIN_SCALE, MAX_SCALE);
        if (next === targetScale) return;

        // anchor the zoom at the cursor position in host space; recomputed on
        // every wheel event so mid-animation cursor movement is tracked.
        if (hostEl) {
            const rect = hostEl.getBoundingClientRect();
            zoomAnchorCx = e.clientX - rect.left;
            zoomAnchorCy = e.clientY - rect.top;
        } else {
            zoomAnchorCx = hostW / 2;
            zoomAnchorCy = hostH / 2;
        }
        // current canvas-space position of the cursor
        zoomAnchorUx = (zoomAnchorCx - panX) / scale;
        zoomAnchorUy = (zoomAnchorCy - panY) / scale;

        // clear the jump snapshot only at the start of a burst, not per-event
        if (zoomAnimId === undefined) clearJumpSnapshot();

        targetScale = next;

        if (prefersReducedMotion) {
            // skip lerp for users who prefer reduced motion
            scale = targetScale;
            panX = zoomAnchorCx - zoomAnchorUx * scale;
            panY = zoomAnchorCy - zoomAnchorUy * scale;
            return;
        }

        if (zoomAnimId === undefined) {
            // freeze level/border so eased intermediate scales don't trigger
            // per-card re-renders; recomputed when anim settles below.
            const lvl = levelFromScale(scale);
            frozenCardLevel = lvl;
            frozenBorderWidth = lvl >= 5 ? "0px" : `${(2 / Math.max(scale, 0.001)).toFixed(2)}px`;
            isZooming = true;
            zoomPrevTime = performance.now();
            zoomAnimId = requestAnimationFrame(onZoomFrame);
        }
        // else: existing loop already running; updated targetScale + anchor above
    }

    function onZoomFrame(now: number): void {
        const dt = Math.min(now - zoomPrevTime, 100); // cap: prevent snap on tab resume
        zoomPrevTime = now;

        const alpha = 1 - Math.exp(-dt / ZOOM_TAU);
        scale = scale + (targetScale - scale) * alpha;
        panX = zoomAnchorCx - zoomAnchorUx * scale;
        panY = zoomAnchorCy - zoomAnchorUy * scale;

        if (Math.abs(scale - targetScale) < 1e-4) {
            scale = targetScale;
            panX = zoomAnchorCx - zoomAnchorUx * scale;
            panY = zoomAnchorCy - zoomAnchorUy * scale;
            zoomAnimId = undefined;
            isZooming = false;
        } else {
            zoomAnimId = requestAnimationFrame(onZoomFrame);
        }
    }

    // --- pan + pinch-to-zoom ---
    // single-pointer pan: window listeners so dragging works outside the host.
    // two-pointer pinch: setPointerCapture so fingers off-host don't desync.
    // we do NOT capture single-pointer pan — that would intercept synthesized
    // click/dblclick events and break per-card handlers.

    const pinchPointers = new Map<number, { x: number; y: number }>();
    let pinchActive = false;
    let pinchLastDist = 0;

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

        pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pinchPointers.size === 2) {
            // second finger: cancel any active single-finger drag and start pinch
            if (dragState) {
                if (isDragging) {
                    isDragging = false;
                    if (hostEl) hostEl.style.cursor = mode === "hand" ? "grab" : "default";
                }
                dragState = null;
                // window listeners remain active for pinch event delivery
            }
            pinchActive = true;
            const pts = [...pinchPointers.values()];
            pinchLastDist = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
            for (const id of pinchPointers.keys()) hostEl?.setPointerCapture(id);
            clearJumpSnapshot();
            return;
        }

        if (pinchPointers.size > 2) return; // ignore 3rd+ finger

        // first pointer: start single-finger pan
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
        if (pinchPointers.has(e.pointerId)) {
            pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }

        if (pinchActive && pinchPointers.size === 2) {
            const pts = [...pinchPointers.values()];
            const dist = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
            if (pinchLastDist > 0 && dist > 0 && hostEl) {
                const factor = dist / pinchLastDist;
                const centroidCx = (pts[0]!.x + pts[1]!.x) / 2;
                const centroidCy = (pts[0]!.y + pts[1]!.y) / 2;
                const rect = hostEl.getBoundingClientRect();
                const cx = centroidCx - rect.left;
                const cy = centroidCy - rect.top;
                const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
                const uX = (cx - panX) / scale;
                const uY = (cy - panY) / scale;
                scale = next;
                targetScale = next; // keep in sync so wheel lerp doesn't drift
                panX = cx - uX * next;
                panY = cy - uY * next;
            }
            pinchLastDist = dist;
            return;
        }

        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (!dragState.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
            dragState.moved = true;
            isDragging = true;
            clearJumpSnapshot();
            if (hostEl) hostEl.style.cursor = "grabbing";
        }
        if (dragState.moved) {
            panX = dragState.startPanX + dx;
            panY = dragState.startPanY + dy;
        }
    }

    function onWindowPointerUp(e: PointerEvent): void {
        pinchPointers.delete(e.pointerId);

        if (pinchActive) {
            if (pinchPointers.size < 2) {
                pinchActive = false;
                if (pinchPointers.size === 1) {
                    // one finger remains: reseed single-finger pan so no position jump
                    const entry = [...pinchPointers.entries()][0]!;
                    dragState = {
                        pointerId: entry[0],
                        startX: entry[1].x,
                        startY: entry[1].y,
                        startPanX: panX,
                        startPanY: panY,
                        moved: false,
                    };
                } else {
                    cleanupDrag();
                }
            }
            return;
        }

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
        pinchPointers.delete(e.pointerId);
        if (pinchActive) {
            if (pinchPointers.size < 2) {
                pinchActive = false;
                if (pinchPointers.size === 1) {
                    const entry = [...pinchPointers.entries()][0]!;
                    dragState = {
                        pointerId: entry[0],
                        startX: entry[1].x,
                        startY: entry[1].y,
                        startPanX: panX,
                        startPanY: panY,
                        moved: false,
                    };
                } else {
                    cleanupDrag();
                }
            }
            return;
        }
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        cleanupDrag();
    }

    function cleanupDrag(): void {
        pinchPointers.clear();
        pinchActive = false;
        dragState = null;
        isDragging = false;
        window.removeEventListener("pointermove", onWindowPointerMove);
        window.removeEventListener("pointerup", onWindowPointerUp);
        window.removeEventListener("pointercancel", onWindowPointerCancel);
        if (hostEl) hostEl.style.cursor = mode === "hand" ? "grab" : "default";
    }

    function onWindowBlur(): void {
        if (dragState || pinchActive) cleanupDrag();
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
                bundleId: s.bundleId,
                kind: s.kind,
                role: s.role,
                x1: s.x1 * UNIT,
                y1: s.y1 * UNIT,
                x2: s.x2 * UNIT,
                y2: s.y2 * UNIT,
                ...(s.persons ? { persons: s.persons } : {}),
                ...(s.bundleControl
                    ? {
                          bundleControl: {
                              x: s.bundleControl.x * UNIT,
                              y: s.bundleControl.y * UNIT,
                          },
                      }
                    : {}),
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

    let visibleNodes = $derived(
        cullNodes(layout.positions, visibleRect, layout.ghosts, layout.isolated),
    );

    let computedTracePath = $derived(
        traceIds ? shortestPath(tree, traceIds[0], traceIds[1]) : undefined,
    );
    let computedHighlightedBundles = $derived(
        computedTracePath ? bundlesForPath(computedTracePath, routedEdges) : highlightedBundleIds,
    );

    function levelFromScale(s: number): PersonNodeLevel {
        if (s >= 0.55) return 0;
        if (s >= 0.35) return 1;
        if (s >= 0.2) return 2;
        if (s >= 0.12) return 3;
        if (s >= 0.06) return 4;
        return 5;
    }

    let cardLevel = $derived(isZooming ? frozenCardLevel : levelFromScale(scale));
    let nodeBorderWidth = $derived(
        isZooming
            ? frozenBorderWidth
            : cardLevel >= 5
              ? "0px"
              : `${(2 / Math.max(scale, 0.001)).toFixed(2)}px`,
    );

    let duplicatedIds = $derived(new Set(layout.ghosts.map((g) => g.ghostOf)));

    let popoverEntries = $derived.by((): InstanceEntry[] =>
        instancePopover ? buildInstanceEntries(tree, layout, instancePopover.personId) : [],
    );

    function handleInstancePick(entry: InstanceEntry): void {
        const personId = instancePopover?.personId;
        if (!personId) return;
        lastJumpSnapshot = {
            panX,
            panY,
            scale,
            selectedInstanceKey,
            fromName: displayName(tree, personId),
        };
        selectedInstanceKey = entry.instanceKey;
        suppressNextSelectionPan = true;
        onselect?.(personId);
        centerOnPosition({ x: entry.x, y: entry.y });
        instancePopover = null;
    }

    function handleBack(): void {
        if (!lastJumpSnapshot) return;
        const snap = lastJumpSnapshot;
        lastJumpSnapshot = null;
        cancelPanAnim();
        if (snap.scale !== scale) scale = snap.scale;
        animatePanTo(snap.panX, snap.panY);
        selectedInstanceKey = snap.selectedInstanceKey;
    }
</script>

<div
    bind:this={hostEl}
    class="canvas-host bg-canvas relative h-full w-full overflow-hidden"
    class:is-dragging={isDragging}
    class:is-zooming={isZooming}
    style:touch-action="none"
    role="tree"
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
        style:--node-border-width={nodeBorderWidth}
    >
        <svg
            width={canvasW}
            height={canvasH}
            class="pointer-events-none absolute top-0 left-0"
            aria-hidden="true"
        >
            <EdgeLayer
                edges={routedEdges}
                highlightedBundles={computedHighlightedBundles}
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
            {#if debugOptions}
                <DebugOverlay
                    {layout}
                    segments={routedEdges}
                    tracePath={debugOptions.tracePath}
                    {selectedId}
                    layers={debugOptions.layers}
                    unit={UNIT}
                    {layeredGraph}
                    {placedGraph}
                    {tree}
                    {lastEditedId}
                />
            {/if}
        </svg>

        {#each visibleNodes as v (v.isGhost ? `${v.id}-ghost-${v.nearId}` : v.id)}
            {@const instanceKey = v.isGhost ? `${v.id}-ghost-${v.nearId}` : v.id}
            {@const isSelected =
                selectedInstanceKey !== null
                    ? instanceKey === selectedInstanceKey
                    : selectedId === v.id}
            <div
                class="person-node-host absolute top-0 left-0"
                class:is-isolated={v.isIsolated}
                style:transform="translate({v.x * UNIT}px, {v.y * UNIT}px)"
                style:width="{CARD_W}px"
                style:height="{CARD_H}px"
            >
                <PersonNode
                    person={tree.people[v.id]!}
                    level={cardLevel}
                    selected={isSelected}
                    portraitUrl={portraitUrls?.get(tree.people[v.id]?.portraitBlobId)}
                    {...v.isGhost && { isGhost: true }}
                    hasMultipleInstances={duplicatedIds.has(v.id)}
                    onselect={(id: string, opts?: { fromGhost?: boolean }) => {
                        selectedInstanceKey = instanceKey;
                        if (opts?.fromGhost) suppressNextSelectionPan = true;
                        onselect?.(id);
                    }}
                    onedit={(id: string) => onedit?.(id)}
                    oncontextmenu={(id: string, x: number, y: number) => oncontextmenu?.(id, x, y)}
                    onShowInstances={(id: string, anchor: HTMLElement) => {
                        instancePopover = { personId: id, anchor, currentKey: instanceKey };
                    }}
                />
            </div>
        {/each}
    </div>

    {#if lastJumpSnapshot}
        <BackButton fromName={lastJumpSnapshot.fromName} onclick={handleBack} />
    {/if}

    {#if instancePopover}
        <InstancePopover
            anchorEl={instancePopover.anchor}
            entries={popoverEntries}
            currentInstanceKey={instancePopover.currentKey}
            onpick={handleInstancePick}
            onclose={() => (instancePopover = null)}
        />
    {/if}

    <!-- Stats pill moved to the shell's bottom-left bar in App.svelte
         so it can share the row with the debug toolbox pill (and any
         future shell chrome). Data flows up via `onlayoutstats`. -->
</div>

<style>
    .canvas-host {
        cursor: default;
    }
    /* during pan or wheel-zoom the cards aren't a useful hit-target and the
       hover-driven restyles compete with frame budget for layout/paint. */
    .canvas-host.is-dragging .canvas-stage,
    .canvas-host.is-zooming .canvas-stage {
        pointer-events: none;
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
    }
    .person-node-host.is-isolated {
        opacity: 0.55;
    }
</style>
