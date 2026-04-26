<!--
    FamilyTreeEditor - HTML pan/zoom canvas with viewport culling
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onMount, onDestroy, untrack } from "svelte";
    import { adaptToLayout } from "$lib/layout/relativesTreeAdapter";
    import EdgeLayer from "$lib/components/tree/EdgeLayer.svelte";
    import PersonNode from "$lib/components/tree/PersonNode.svelte";
    import type { DerivedEdge, PersonNodeLevel } from "$lib/components/tree/edges";
    import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";
    import type { PersonId, Tree } from "$lib/domain/types";

    interface Props {
        tree: Tree;
        selectedId?: PersonId | undefined;
        portraitUrls?: PortraitUrlCache;
        onselect?: (id: PersonId) => void;
        ondeselect?: () => void;
        onedit?: (id: PersonId) => void;
        oncontextmenu?: (id: PersonId, x: number, y: number) => void;
    }

    let { tree, selectedId, portraitUrls, onselect, ondeselect, onedit, oncontextmenu }: Props =
        $props();

    // pixels per relatives-tree unit. relatives-tree assumes nodes occupy a
    // 2x2 unit cell; we render the card narrower in height than width so it
    // looks like a typical family-tree node and tiers get a visible gap.
    const UNIT = 80;
    const CELL_W = 2 * UNIT; // 160 px - matches relatives-tree's cell width
    const CELL_H = 1.2 * UNIT; // 96 px - shorter cell so tiers don't crowd
    // we render the actual card smaller than its cell so neighboring people
    // don't touch; the card sits centered inside the cell with GAP/2 padding
    const GAP = 14;
    const NODE_W = CELL_W - GAP; // 146
    const NODE_H = CELL_H - GAP; // 82
    const MIN_SCALE = 0.05;
    const MAX_SCALE = 1.5;
    const DRAG_THRESHOLD_PX = 4;
    const SELECT_PAN_MS = 320; // duration of "center on selection" tween

    let layout = $derived(adaptToLayout(tree));
    let canvasW = $derived(layout.layout.canvas.width * UNIT);
    let canvasH = $derived(layout.layout.canvas.height * UNIT);

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
        const rootPos = positionByPersonId.get(tree.rootId);
        if (rootPos) {
            const cx = rootPos.left * UNIT + CELL_W / 2;
            const cy = rootPos.top * UNIT + CELL_H / 2;
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

    function centerOnPerson(id: PersonId): void {
        const pos = positionByPersonId.get(id);
        if (!pos || !hostEl) return;
        const rect = hostEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        // card center in canvas-local pixels
        const cx = pos.left * UNIT + CELL_W / 2;
        const cy = pos.top * UNIT + CELL_H / 2;
        // pan so that point lands at the screen center
        const targetX = rect.width / 2 - cx * scale;
        const targetY = rect.height / 2 - cy * scale;
        animatePanTo(targetX, targetY);
    }

    // when selection changes externally, glide the canvas to center it
    $effect(() => {
        const id = selectedId;
        untrack(() => {
            if (id && firstFitDone) centerOnPerson(id);
        });
    });

    // --- wheel zoom (cursor-anchored) ---

    function onWheel(e: WheelEvent): void {
        if (!hostEl) return;
        e.preventDefault();
        // ctrl+wheel = trackpad pinch in chrome/safari; deltas are larger
        const intensity = e.ctrlKey ? 0.012 : 0.0018;
        const factor = Math.exp(-e.deltaY * intensity);
        const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
        if (next === scale) return;

        // anchor at the center of the host viewport (not the cursor) so the
        // visible center stays put during zoom
        const rect = hostEl.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
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
            if (hostEl) hostEl.style.cursor = "grabbing";
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
        if (hostEl) hostEl.style.cursor = "grab";
        window.removeEventListener("pointermove", onWindowPointerMove);
        window.removeEventListener("pointerup", onWindowPointerUp);
        window.removeEventListener("pointercancel", onWindowPointerCancel);
    }

    // --- shared types + culling helpers ---

    interface Pos {
        left: number;
        top: number;
    }
    interface VisibleNode {
        id: PersonId;
        left: number;
        top: number;
    }
    interface VisibleRect {
        left: number;
        top: number;
        right: number;
        bottom: number;
    }

    function buildPositionMap(layoutNodes: typeof layout.layout.nodes): Map<PersonId, Pos> {
        const map = new Map<PersonId, Pos>();
        for (const n of layoutNodes) {
            if (!map.has(n.id)) map.set(n.id, { left: n.left, top: n.top });
        }
        return map;
    }

    /**
     * Standard family-tree connector style (matches FamilyEcho / Geni / Gramps):
     *
     *   ┌──┐ ────── ┌──┐     (1) spouse bond: horizontal between inner edges
     *   │A │        │B │
     *   └──┘    │   └──┘
     *           │            (2) drop from bond midpoint
     *      ─────┴─────       (3) sibling bus above the children
     *      │    │    │       (4) vertical drops to each child's top
     *    ┌─┴┐ ┌─┴┐ ┌─┴┐
     *    │C │ │D │ │E │
     *    └──┘ └──┘ └──┘
     *
     * Single-parent links use a simple L-shape (parent bottom -> midpoint ->
     * child top). Each segment is its own DerivedEdge so EdgeLayer culling
     * can drop ones that fall outside the viewport.
     */
    function deriveEdges(t: Tree, posMap: ReadonlyMap<PersonId, Pos>): DerivedEdge[] {
        const out: DerivedEdge[] = [];

        // helpers return the actual card-edge pixel coords (the card sits
        // inset GAP/2 from each side of its layout cell)
        function topMidX(pos: Pos): number {
            return pos.left * UNIT + CELL_W / 2;
        }
        function topY(pos: Pos): number {
            return pos.top * UNIT + GAP / 2;
        }
        function bottomY(pos: Pos): number {
            return pos.top * UNIT + CELL_H - GAP / 2;
        }
        function leftX(pos: Pos): number {
            return pos.left * UNIT + GAP / 2;
        }
        function rightX(pos: Pos): number {
            return pos.left * UNIT + CELL_W - GAP / 2;
        }
        function midY(pos: Pos): number {
            return pos.top * UNIT + CELL_H / 2;
        }

        // group joint (two-parent) children by their parent pair
        const jointByCouple = new Map<string, PersonId[]>();
        for (const child of Object.values(t.people)) {
            const m = child.motherId;
            const f = child.fatherId;
            if (!m || !f) continue;
            const k = m < f ? `${m}|${f}` : `${f}|${m}`;
            const arr = jointByCouple.get(k) ?? [];
            arr.push(child.id);
            jointByCouple.set(k, arr);
        }

        const handledChildren = new Set<PersonId>();

        for (const couple of t.couples) {
            if (couple.leftId === couple.rightId) continue;
            const aPos = posMap.get(couple.leftId);
            const bPos = posMap.get(couple.rightId);
            if (!aPos || !bPos) continue;

            // figure out which card sits geometrically left vs right
            const [lPos, rPos] = aPos.left * UNIT <= bPos.left * UNIT ? [aPos, bPos] : [bPos, aPos];

            // (1) spouse bond - horizontal at the cards' midline, between
            // inner edges. when cards are at different Y values we still draw
            // a single horizontal at the average; rare for a typical layout.
            const bondY = (midY(lPos) + midY(rPos)) / 2;
            const bondLeftX = rightX(lPos);
            const bondRightX = leftX(rPos);
            out.push({ kind: "spouse", x1: bondLeftX, y1: bondY, x2: bondRightX, y2: bondY });

            const k =
                couple.leftId < couple.rightId
                    ? `${couple.leftId}|${couple.rightId}`
                    : `${couple.rightId}|${couple.leftId}`;
            const childIds = jointByCouple.get(k) ?? [];
            const kids: { id: PersonId; pos: Pos }[] = [];
            for (const cid of childIds) {
                const cp = posMap.get(cid);
                if (cp) kids.push({ id: cid, pos: cp });
            }
            if (kids.length === 0) continue;

            const bondMidX = (bondLeftX + bondRightX) / 2;
            const minChildTop = Math.min(...kids.map((c) => topY(c.pos)));
            const busY = (bondY + minChildTop) / 2;

            // (2) drop from bond midpoint down to the sibling bus
            out.push({ kind: "parent", x1: bondMidX, y1: bondY, x2: bondMidX, y2: busY });

            // (3) sibling bus across the children (only when 2+ kids;
            // otherwise the single drop already covers it)
            if (kids.length > 1) {
                const xs = kids.map((c) => topMidX(c.pos));
                const minX = Math.min(...xs, bondMidX);
                const maxX = Math.max(...xs, bondMidX);
                if (minX !== maxX) {
                    out.push({ kind: "parent", x1: minX, y1: busY, x2: maxX, y2: busY });
                }
            }

            // (4) drop from bus down to each child's top edge
            for (const c of kids) {
                const x = topMidX(c.pos);
                out.push({ kind: "parent", x1: x, y1: busY, x2: x, y2: topY(c.pos) });
                handledChildren.add(c.id);
            }
        }

        // remaining: single-parent links (only one of mother/father set, or
        // the other parent isn't in the tree). draw an L-shape from parent
        // bottom to child top.
        for (const person of Object.values(t.people)) {
            if (handledChildren.has(person.id)) continue;
            const cPos = posMap.get(person.id);
            if (!cPos) continue;
            for (const parentId of [person.motherId, person.fatherId]) {
                if (!parentId) continue;
                const pPos = posMap.get(parentId);
                if (!pPos) continue;
                const px = topMidX(pPos);
                const py = bottomY(pPos);
                const cx = topMidX(cPos);
                const cy = topY(cPos);
                const my = (py + cy) / 2;
                if (px !== cx) {
                    out.push({ kind: "parent", x1: px, y1: py, x2: px, y2: my });
                    out.push({ kind: "parent", x1: px, y1: my, x2: cx, y2: my });
                    out.push({ kind: "parent", x1: cx, y1: my, x2: cx, y2: cy });
                } else {
                    out.push({ kind: "parent", x1: px, y1: py, x2: cx, y2: cy });
                }
            }
        }

        return out;
    }

    function cullNodes(posMap: ReadonlyMap<PersonId, Pos>, r: VisibleRect): VisibleNode[] {
        const out: VisibleNode[] = [];
        for (const [id, pos] of posMap) {
            const x = pos.left * UNIT;
            const y = pos.top * UNIT;
            if (x + CELL_W >= r.left && x <= r.right && y + CELL_H >= r.top && y <= r.bottom) {
                out.push({ id, left: pos.left, top: pos.top });
            }
        }
        return out;
    }

    function cullEdges(edges: readonly DerivedEdge[], r: VisibleRect): DerivedEdge[] {
        const out: DerivedEdge[] = [];
        for (const e of edges) {
            const cl = Math.min(e.x1, e.x2);
            const cr = Math.max(e.x1, e.x2);
            const ct = Math.min(e.y1, e.y2);
            const cb = Math.max(e.y1, e.y2);
            if (cr >= r.left && cl <= r.right && cb >= r.top && ct <= r.bottom) {
                out.push(e);
            }
        }
        return out;
    }

    let visibleRect = $derived.by(() => {
        if (hostW === 0 || hostH === 0) {
            return { left: 0, top: 0, right: canvasW, bottom: canvasH };
        }
        const margin = CELL_W;
        const left = -panX / scale - margin;
        const top = -panY / scale - margin;
        const right = left + hostW / scale + margin * 2;
        const bottom = top + hostH / scale + margin * 2;
        return { left, top, right, bottom };
    });

    let positionByPersonId = $derived(buildPositionMap(layout.layout.nodes));
    let derivedEdges = $derived(deriveEdges(tree, positionByPersonId));
    let visibleNodes = $derived(cullNodes(positionByPersonId, visibleRect));
    let visibleEdges = $derived(cullEdges(derivedEdges, visibleRect));

    function levelFromScale(s: number): PersonNodeLevel {
        if (s >= 0.55) return 0;
        if (s >= 0.35) return 1;
        if (s >= 0.2) return 2;
        if (s >= 0.12) return 3;
        if (s >= 0.06) return 4;
        return 5;
    }

    let cardLevel = $derived(levelFromScale(scale));

    function reset(): void {
        fitToView();
    }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_noninteractive_tabindex -->
<div
    bind:this={hostEl}
    class="bg-canvas relative h-full w-full cursor-grab overflow-hidden"
    style:touch-action="none"
    role="application"
    tabindex="0"
    aria-label="family tree canvas"
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onclick={onHostClick}
    onkeydown={onHostKeyDown}
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
            <EdgeLayer edges={visibleEdges} />
        </svg>

        {#each visibleNodes as v (v.id)}
            {@const person = tree.people[v.id]}
            {#if person}
                <div
                    class="person-node-host absolute"
                    style:left="{v.left * UNIT + GAP / 2}px"
                    style:top="{v.top * UNIT + GAP / 2}px"
                    style:width="{NODE_W}px"
                    style:height="{NODE_H}px"
                >
                    <PersonNode
                        {person}
                        level={cardLevel}
                        {scale}
                        selected={selectedId === person.id}
                        portraitUrl={portraitUrls?.get(person.portraitBlobId)}
                        onselect={(id: string) => onselect?.(id)}
                        onedit={(id: string) => onedit?.(id)}
                        oncontextmenu={(id: string, x: number, y: number) =>
                            oncontextmenu?.(id, x, y)}
                    />
                </div>
            {/if}
        {/each}
    </div>

    <div class="pointer-events-none absolute right-3 bottom-3 flex items-center gap-2">
        <button
            type="button"
            onclick={reset}
            class="text-fg-muted bg-canvas-elev/80 border-line hover:text-fg pointer-events-auto rounded-md border px-2 py-1 font-mono text-[10px] uppercase backdrop-blur"
        >
            fit
        </button>
        <span
            class="text-fg-muted bg-canvas-elev/80 border-line rounded-md border px-2 py-1 font-mono text-[10px]"
            title={layout.components.length > 1
                ? `${String(layout.components.length)} clusters` +
                  (layout.isolated.length > 0
                      ? ` + ${String(layout.isolated.length)} isolated`
                      : "")
                : undefined}
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
        </span>
        <span
            class="text-fg-muted bg-canvas-elev/80 border-line rounded-md border px-2 py-1 font-mono text-[10px]"
        >
            {Math.round(scale * 100)}%
        </span>
    </div>
</div>

<style>
    .canvas-stage {
        transition: opacity 200ms ease-out;
        will-change: transform;
    }
    .person-node-host {
        contain: layout style paint;
    }
</style>
