<!--
    FamilyTreeEditor - FamilyViewCanvas: bounded default-view renderer.

    Phase 0 walking-skeleton renderer for the new family-view engine.
    Runs `FamilyViewEngine.layout(tree, focus)` synchronously on the main
    thread (subset is ≤30 cards; the work is microsecond-scale) and paints
    cards + couple-box + drops onto an absolutely-positioned pan/zoom
    surface.

    Edges go through the Phase 0 `usePath` stub (always returns false) so
    Phase 3's path-highlight wire-up is a one-file change. Cards go through
    the Phase 0 `cardDecorator` stub so Phase 5's banding / portraits land
    without touching this file.

    The `+` buttons on card edges are Phase 0 stubs — every click fires a
    "coming in phase 4" toast via the `onaddstub` callback. Phase 4 replaces
    the callback with real add-person flows.

    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import { Plus } from "@lucide/svelte";
    import { PERSON_W } from "$lib/layout/constants";
    import PersonNode from "$lib/components/tree/PersonNode.svelte";
    import { FamilyViewEngine, CARD_H } from "$lib/layout/engines/family-view";
    import type {
        FamilyViewEdge,
        FamilyViewLayout,
        FamilyViewNode,
    } from "$lib/layout/engines/family-view";
    import { useExpansionState } from "$lib/layout/engines/family-view/expansion";
    import { usePath } from "$lib/layout/engines/family-view/path";
    import type { PersonId, Tree } from "$lib/domain/types";
    import type { CanvasController } from "./canvasController";

    interface Props {
        tree: Tree;
        selectedId?: PersonId | undefined;
        onselect?: ((id: PersonId) => void) | undefined;
        ondeselect?: (() => void) | undefined;
        onedit?: ((id: PersonId) => void) | undefined;
        oncontextmenu?: ((id: PersonId, x: number, y: number) => void) | undefined;
        oncontroller?: ((c: CanvasController) => void) | undefined;
        /** Phase 0 stub: any `+` click fires this. Phase 4 wires real flows. */
        onaddstub?:
            | ((slot: "north" | "south" | "east" | "west", anchorId: PersonId) => void)
            | undefined;
    }

    let {
        tree,
        selectedId,
        onselect,
        ondeselect,
        onedit,
        oncontextmenu,
        oncontroller,
        onaddstub,
    }: Props = $props();

    /** pixels per unit; matches TreeCanvas so card sizes feel consistent */
    const UNIT = 80;
    const CARD_W_PX = PERSON_W * UNIT;
    const CARD_H_PX = CARD_H * UNIT;
    const MIN_SCALE = 0.2;
    const MAX_SCALE = 2.0;

    const engine = new FamilyViewEngine();

    let hostEl: HTMLDivElement | undefined = $state();
    let hostW = $state(0);
    let hostH = $state(0);

    // Pan/zoom state.
    let scale = $state(1);
    let panX = $state(0);
    let panY = $state(0);

    // Hydrate the Phase 0 stubs so layout has access to (currently empty)
    // expansion + path state. Phase 1 / 3 fill these in without touching
    // the renderer.
    let expansion = $derived(useExpansionState(tree.id, tree.rootId));
    let pathHl = $derived(usePath(tree.rootId, selectedId));

    /**
     * Family-view layout. Recomputed when the tree, root, or expansion set
     * changes. The bounded subset is cheap (~ms on Akarians) so we don't
     * memoise further.
     */
    let layout = $derived<FamilyViewLayout>(engine.layout({ tree, focus: tree.rootId }));

    // Suppress "unused" warnings — these are deliberately read so the
    // renderer's reactive graph picks them up; Phase 1/3 will swap in real
    // bodies and the renderer needs to be reactive to them today.
    $effect(() => {
        void expansion.expanded;
        void expansion.autoCollapsed;
        void pathHl.pathSet;
    });

    // Resize observer to keep host dims in sync.
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

    /** Auto-fit on first paint and on layout changes that resize the chart. */
    let lastFitKey = "";
    $effect(() => {
        const w = layout.bbox.width;
        const h = layout.bbox.height;
        if (hostW <= 0 || hostH <= 0) return;
        const key = `${tree.id}:${String(w.toFixed(3))}:${String(h.toFixed(3))}`;
        if (key === lastFitKey) return;
        lastFitKey = key;
        untrack(() => fitToView());
    });

    function fitToView(): void {
        if (hostW <= 0 || hostH <= 0) return;
        const layoutWpx = layout.bbox.width * UNIT;
        const layoutHpx = layout.bbox.height * UNIT;
        if (layoutWpx <= 0 || layoutHpx <= 0) {
            scale = 1;
            panX = hostW / 2;
            panY = hostH / 2;
            return;
        }
        const sx = (hostW - 64) / layoutWpx;
        const sy = (hostH - 64) / layoutHpx;
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(sx, sy)));
        // Centre the layout in the viewport. The chart's rank-y values can be
        // negative (ancestors) so the y origin is min-rank * ROW_H — we read
        // the actual min y from placed nodes.
        const minY = minNodeY(layout);
        panX = (hostW - layoutWpx * scale) / 2;
        panY = (hostH - layoutHpx * scale) / 2 - minY * UNIT * scale;
    }

    function minNodeY(l: FamilyViewLayout): number {
        let min = 0;
        let seen = false;
        for (const node of l.nodes.values()) {
            if (!seen || node.y < min) {
                min = node.y;
                seen = true;
            }
        }
        return min;
    }

    // ---------- pointer / wheel handlers ----------

    let dragStart: { x: number; y: number; pX: number; pY: number } | undefined;

    function onPointerDown(e: PointerEvent): void {
        const target = e.target as HTMLElement | null;
        if (target?.closest("[data-person-id]")) return; // card handles its own click
        if (target?.closest("[data-add-stub]")) return;
        dragStart = { x: e.clientX, y: e.clientY, pX: panX, pY: panY };
        (e.target as Element).setPointerCapture?.(e.pointerId);
    }

    function onPointerMove(e: PointerEvent): void {
        if (!dragStart) return;
        panX = dragStart.pX + (e.clientX - dragStart.x);
        panY = dragStart.pY + (e.clientY - dragStart.y);
    }

    function onPointerUp(_e: PointerEvent): void {
        dragStart = undefined;
    }

    function onWheel(e: WheelEvent): void {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
        if (next === scale) return;
        // Zoom around the pointer — subtract host origin, normalise, scale.
        const rect = hostEl?.getBoundingClientRect();
        if (!rect) {
            scale = next;
            return;
        }
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const ratio = next / scale;
        panX = px - (px - panX) * ratio;
        panY = py - (py - panY) * ratio;
        scale = next;
    }

    // ---------- imperative controller ----------

    function recenterOn(id: PersonId): void {
        const node = layout.nodes.get(id);
        if (!node) return;
        panX = hostW / 2 - (node.x + PERSON_W / 2) * UNIT * scale;
        panY = hostH / 2 - (node.y + CARD_H / 2) * UNIT * scale;
    }

    onMount(() => {
        oncontroller?.({
            getScale: () => scale,
            setScale: (next: number) => {
                scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
            },
            zoomBy: (factor: number) => {
                scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
            },
            fit: fitToView,
            zoom100: () => {
                scale = 1;
            },
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

    // ---------- card + edge interactions ----------

    function onCardClick(id: PersonId): void {
        if (id === selectedId) ondeselect?.();
        else onselect?.(id);
    }

    function onCardDoubleClick(id: PersonId): void {
        onedit?.(id);
    }

    function onCardContextMenu(id: PersonId, x: number, y: number): void {
        oncontextmenu?.(id, x, y);
    }

    function onAddStubClick(slot: "north" | "south" | "east" | "west", id: PersonId): void {
        onaddstub?.(slot, id);
    }

    function nodes(): readonly FamilyViewNode[] {
        return Array.from(layout.nodes.values());
    }

    function edgePath(e: FamilyViewEdge): string {
        const pts = e.points;
        if (pts.length === 0) return "";
        const head = pts[0]!;
        let d = `M ${String(head.x * UNIT)} ${String(head.y * UNIT)}`;
        for (let i = 1; i < pts.length; i += 1) {
            const p = pts[i]!;
            d += ` L ${String(p.x * UNIT)} ${String(p.y * UNIT)}`;
        }
        return d;
    }

    function edgeClass(e: FamilyViewEdge): string {
        const base =
            e.role === "married"
                ? "stroke-rose-400/70"
                : e.role === "divorced"
                  ? "stroke-rose-400/40"
                  : "stroke-fg-muted/70";
        // pathHl is Phase 0 stub — always false — but the call site exists so
        // Phase 3 lights up edges by filling in `onPath`.
        const onPath = e.persons.every((id) => pathHl.onPath(id));
        return onPath ? `${base} stroke-2` : `${base} stroke-1`;
    }

    onDestroy(() => {
        // nothing to tear down; everything is purely derived
    });
</script>

<div
    bind:this={hostEl}
    class="family-view-canvas relative h-full w-full overflow-hidden bg-canvas"
    role="region"
    aria-label="family view canvas"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onwheel={onWheel}
>
    <div
        class="absolute origin-top-left"
        style:transform="translate({panX}px, {panY}px) scale({scale})"
    >
        <svg
            class="pointer-events-none absolute"
            style:left="0"
            style:top="0"
            style:overflow="visible"
            width={layout.bbox.width * UNIT}
            height={layout.bbox.height * UNIT}
            aria-hidden="true"
        >
            {#each layout.edges as edge (edge.id)}
                <path
                    d={edgePath(edge)}
                    class="fill-none {edgeClass(edge)}"
                    vector-effect="non-scaling-stroke"
                />
            {/each}
        </svg>

        {#each nodes() as node (node.personId)}
            {@const person = tree.people[node.personId]}
            {#if person}
                <div
                    class="group/card absolute"
                    style:left="{node.x * UNIT}px"
                    style:top="{node.y * UNIT}px"
                    style:width="{CARD_W_PX}px"
                    style:height="{CARD_H_PX}px"
                >
                    <PersonNode
                        {person}
                        selected={selectedId === person.id}
                        level={0}
                        onselect={(id: string) => onCardClick(id)}
                        onedit={(id: string) => onCardDoubleClick(id)}
                        oncontextmenu={(id: string, x: number, y: number) =>
                            onCardContextMenu(id, x, y)}
                    />
                    <!-- Phase 0 + buttons: visible on hover, toast on click. -->
                    {#each [["north", "-top-3 left-1/2 -translate-x-1/2", "parent"], ["south", "-bottom-3 left-1/2 -translate-x-1/2", "child"], ["east", "top-1/2 -right-3 -translate-y-1/2", "partner"], ["west", "top-1/2 -left-3 -translate-y-1/2", "partner"]] as const as [slot, pos, label]}
                        <button
                            type="button"
                            data-add-stub={slot}
                            class="border-line bg-canvas-elev text-fg-muted hover:text-accent
                                   absolute {pos} hidden h-5 w-5 items-center justify-center
                                   rounded-full border opacity-0 shadow-sm transition-opacity
                                   group-hover/card:flex group-hover/card:opacity-100"
                            aria-label="add {label}"
                            title="add {label} (coming in phase 4)"
                            onclick={(e) => {
                                e.stopPropagation();
                                onAddStubClick(slot, person.id);
                            }}
                        >
                            <Plus size={10} />
                        </button>
                    {/each}
                </div>
            {/if}
        {/each}
    </div>
</div>
