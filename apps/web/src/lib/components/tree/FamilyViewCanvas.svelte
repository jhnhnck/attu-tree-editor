<!--
    FamilyTreeEditor - FamilyViewCanvas: bounded default-view renderer.

    Phase 1 promotion of the Phase 0 walking skeleton. Runs
    `FamilyViewEngine.layout(tree, focus, { expanded })` synchronously on
    the main thread (typical bounded-default work is ~6 ms on Akarians; an
    auto-collapse pass with 100+ visible cards is still well under the 50
    ms latency budget) and paints cards + couple-box + drops + collapse
    badges onto an absolutely-positioned pan/zoom surface.

    Phase 1 additions over the Phase 0 skeleton:
      - + / − affordances on cards with un-shown adjacents / explicit
        expansion. Click + reveals the next generation; click − collapses
        back. State persists via `useExpansionState`.
      - Collapse badges render as a `+N FirstName` pill. Click re-expands
        every member back into person cards.
      - The Phase 0 "+ goes to a toast" buttons retire — `+` is now a
        real interaction. The Phase-4 add-person flow surfaces elsewhere
        (Insert menu, inspector connections tab).

    Edges go through the Phase 0 `usePath` stub (still always returns
    false); Phase 3 fills it in and edges restyle without renderer
    changes.

    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import { Plus, Minus, ChevronDown, UserPlus } from "@lucide/svelte";
    import { PERSON_W } from "$lib/layout/constants";
    import PersonNode from "$lib/components/tree/PersonNode.svelte";
    import { FamilyViewEngine, CARD_H } from "$lib/layout/engines/family-view";
    import type {
        BadgeNode,
        FamilyViewEdge,
        FamilyViewLayout,
        FamilyViewNode,
        MultiUnionMate,
    } from "$lib/layout/engines/family-view";
    import { useExpansionState } from "$lib/layout/engines/family-view/expansion";
    import { usePrimaryUnionState } from "$lib/layout/engines/family-view/primaryUnion";
    import { usePath, badgeOnPath } from "$lib/layout/engines/family-view/path";
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
        /**
         * Reports total / visible counts up to the shell's bottom-left bar
         * (the same stats pill the layered engine uses). `components` /
         * `isolated` aren't computed by family-view — we report `1`/`0` so
         * the pill stays compact and matches the shape `TreeCanvas` emits.
         */
        onlayoutstats?:
            | ((stats: {
                  totalPeople: number;
                  components: number;
                  isolated: number;
              }) => void)
            | undefined;
        /**
         * Phase 4 add-relative affordance. Fires with the anchor person
         * (always the focus today, but the callback is shape-stable so a
         * future "add to any visible card" variant doesn't break callers)
         * and the kind of relationship to create. App.svelte wires this to
         * the existing `addParent` / `addPartner` / `addChild` mutations,
         * which auto-select the newly-created person via `focusPerson`.
         */
        onaddRelative?:
            | ((anchorId: PersonId, kind: "parent" | "partner" | "child") => void)
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
        onlayoutstats,
        onaddRelative,
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

    /**
     * Active focus — the centre of the bounded subset. `undefined` means
     * "follow the tree's root"; `centerOnPerson(id)` sets it explicitly
     * when the target isn't already in the visible subset. Reset to
     * `undefined` whenever the tree's identity or root changes so a
     * freshly-loaded tree starts at its root instead of inheriting the
     * prior tree's focus. State is `undefined`-init (not `tree.rootId`-
     * init) so `tree.*` is only read inside reactive scopes — keeps
     * svelte's state_referenced_locally check quiet.
     */
    let focusOverride = $state<PersonId | undefined>(undefined);
    let lastTreeKey = $state<string | undefined>(undefined);
    let activeFocus = $derived<PersonId>(focusOverride ?? tree.rootId);
    $effect(() => {
        const key = `${tree.id}::${tree.rootId}`;
        if (key !== lastTreeKey) {
            lastTreeKey = key;
            focusOverride = undefined;
        }
    });

    // Phase 1 expansion state — localStorage-backed per (treeId, focusId).
    // Recreated when (tree.id, activeFocus) changes (recentering on a new
    // focus resets the expanded set per the Phase 1 spec, since the new
    // key misses the old localStorage row).
    let expansion = $derived(useExpansionState(tree.id, activeFocus));
    // Phase 2 primary-union override — same per-(treeId, focusId) lifecycle.
    let primaryUnion = $derived(usePrimaryUnionState(tree.id, activeFocus));

    let pathHl = $derived(usePath(tree, activeFocus, selectedId));

    /**
     * Family-view layout. Re-runs when the tree, focus, expansion set, or
     * primary-union overrides change. Cheap enough that we recompute on
     * every reactive tick. Bumping `expansionRev` / `primaryRev` is the
     * reactivity trigger because the underlying Maps/Sets reassign rather
     * than mutate.
     */
    let expansionRev = $state(0);
    let primaryRev = $state(0);
    let layout = $derived<FamilyViewLayout>(
        engine.layout({
            tree,
            focus: activeFocus,
            options: {
                expanded: (void expansionRev, expansion.expanded),
                primaryUnionOverrides: (void primaryRev, primaryUnion.overrides),
            },
        }),
    );

    /** Open picker state — only one `˅` menu open at a time. */
    let pickerOpenFor = $state<PersonId | null>(null);

    /**
     * Phase 4 add-relative menu open state. Distinct from `pickerOpenFor`
     * because the `˅` (primary-union swap) and `+ person` (add relative)
     * affordances are independent and could in principle both be open on
     * the same card; today only one menu is open at a time but the state
     * is separate so they don't fight for the same slot.
     */
    let addOpenFor = $state<PersonId | null>(null);

    // Mirror people-count up to the shell's bottom-left stats pill (same
    // contract TreeCanvas uses). Family-view doesn't compute connected
    // components, so report `1`/`0` to keep the pill compact.
    $effect(() => {
        onlayoutstats?.({
            totalPeople: Object.keys(tree.people).length,
            components: 1,
            isolated: 0,
        });
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

    /** Auto-fit on first paint, on layout changes that resize the chart,
     *  and whenever `activeFocus` shifts (so palette-jump / centerOnPerson
     *  always lands the new focus at the host's centre even when two
     *  subsets happen to share a bbox). */
    let lastFitKey = "";
    $effect(() => {
        const w = layout.bbox.width;
        const h = layout.bbox.height;
        if (hostW <= 0 || hostH <= 0) return;
        const key = `${tree.id}:${activeFocus}:${String(w.toFixed(3))}:${String(h.toFixed(3))}`;
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
        for (const b of l.badges) {
            if (!seen || b.y < min) {
                min = b.y;
                seen = true;
            }
        }
        return min;
    }

    // ---------- pointer / wheel handlers ----------

    let dragStart: { x: number; y: number; pX: number; pY: number } | undefined;

    function onPointerDown(e: PointerEvent): void {
        const target = e.target as HTMLElement | null;
        if (target?.closest("[data-person-id]")) return;
        if (target?.closest("[data-expand-toggle]")) return;
        if (target?.closest("[data-badge-id]")) return;
        if (target?.closest("[data-union-picker]")) return;
        if (target?.closest("[data-add-toggle]")) return;
        // Click outside any picker closes it.
        if (pickerOpenFor !== null) pickerOpenFor = null;
        if (addOpenFor !== null) addOpenFor = null;
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

    /**
     * Pan the visible card for `id` to the host's centre. If `id` isn't
     * in the current bounded subset, shift `activeFocus` to that person
     * first — family-view's layout is a bounded window around the focus,
     * so the only way to "jump to" someone off-window is to re-centre the
     * window itself. Pan settles on the next layout tick via the fit-key
     * effect (which sees the new focus, runs `fitToView`, and the new
     * focus card lands at host centre).
     */
    function recenterOn(id: PersonId): void {
        if (!tree.people[id]) return;
        const node = layout.nodes.get(id);
        if (node) {
            panX = hostW / 2 - (node.x + PERSON_W / 2) * UNIT * scale;
            panY = hostH / 2 - (node.y + CARD_H / 2) * UNIT * scale;
            return;
        }
        // Off-subset target — shift focus; the auto-fit effect re-centres
        // once the new layout lands.
        focusOverride = id;
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
            centerOnRoot: () => {
                focusOverride = undefined;
            },
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

    function onExpandClick(id: PersonId, on: boolean, e: MouseEvent): void {
        e.stopPropagation();
        expansion.setExpanded(id, on);
        expansionRev += 1;
    }

    function onPickerToggle(cardId: PersonId, e: MouseEvent): void {
        e.stopPropagation();
        pickerOpenFor = pickerOpenFor === cardId ? null : cardId;
    }

    function onPickerSelect(mateId: PersonId, coupleIndex: number, e: MouseEvent): void {
        e.stopPropagation();
        // Switching primary union is per-mate UI state — it does NOT touch
        // the domain's Couple.isPrimary or Couple.isCurrent flags.
        primaryUnion.setPrimary(mateId, coupleIndex);
        primaryRev += 1;
        pickerOpenFor = null;
    }

    function onAddToggle(cardId: PersonId, e: MouseEvent): void {
        e.stopPropagation();
        addOpenFor = addOpenFor === cardId ? null : cardId;
    }

    function onAddPick(
        anchorId: PersonId,
        kind: "parent" | "partner" | "child",
        e: MouseEvent,
    ): void {
        e.stopPropagation();
        addOpenFor = null;
        // App.svelte's addParent/addPartner/addChild handlers create a
        // blank person, link, and auto-focus via `focusPerson(newId)`. The
        // family-view's `recenterOn` shifts `activeFocus` if the new card
        // is off-subset, so a freshly-added relative always lands visible.
        onaddRelative?.(anchorId, kind);
    }

    function multiUnionMate(id: PersonId): MultiUnionMate | undefined {
        return layout.multiUnionMates.get(id);
    }

    function partnerLabel(id: PersonId | undefined): string {
        if (!id) return "(unknown)";
        const p = tree.people[id];
        if (!p) return id;
        const n = `${p.given} ${p.surname}`.trim();
        return n || id;
    }

    function onBadgeClick(badge: BadgeNode, e: MouseEvent): void {
        e.stopPropagation();
        // Re-expand: mark the source as explicitly expanded so the auto-
        // collapse pass doesn't immediately re-demote it.
        expansion.setExpanded(badge.sourceId, true);
        expansionRev += 1;
    }

    function nodes(): readonly FamilyViewNode[] {
        return Array.from(layout.nodes.values());
    }

    /**
     * Phase 5 generation badge. Cards whose rank differs from the focus
     * get a small `g+N` / `g-N` pill at top-left so the user can read
     * "this person is two generations up from focus" without counting
     * rows. Focus + same-rank siblings get no badge (rank 0 = no marker
     * needed). The focus card always has `+ person` at top-left from
     * Phase 4; non-focus cards have rank ≠ 0, so the two affordances
     * never appear on the same card.
     */
    function generationLabel(node: FamilyViewNode): string | null {
        if (node.rank === 0) return null;
        return node.rank > 0 ? `g+${String(node.rank)}` : `g${String(node.rank)}`;
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
        const hasPath = pathHl.pathSet.size > 0;
        // An edge is on-path iff every implicated person is on the path
        // (couple connector: both partners; drop: parent + child).
        const onPath = hasPath && e.persons.every((id) => pathHl.onPath(id));
        if (!hasPath) {
            return e.role === "married"
                ? "stroke-rose-400/70 stroke-1"
                : e.role === "divorced"
                  ? "stroke-rose-400/40 stroke-1"
                  : "stroke-fg-muted/70 stroke-1";
        }
        if (onPath) {
            return e.role === "married"
                ? "stroke-rose-400 stroke-[2.5]"
                : e.role === "divorced"
                  ? "stroke-rose-400/70 stroke-[2.5]"
                  : "stroke-accent stroke-[2.5]";
        }
        // Off-path while a path is active: dim.
        return e.role === "married"
            ? "stroke-rose-400/25 stroke-1"
            : e.role === "divorced"
              ? "stroke-rose-400/15 stroke-1"
              : "stroke-fg-muted/25 stroke-1";
    }

    function cardOnPath(id: PersonId): boolean {
        return pathHl.onPath(id);
    }

    function isBadgeOnPath(b: BadgeNode): boolean {
        return badgeOnPath(b, pathHl.pathSet);
    }

    function canExpand(id: PersonId): boolean {
        return layout.hasMoreChildren.has(id) || layout.hasMoreParents.has(id);
    }

    function canCollapse(id: PersonId): boolean {
        return layout.canCollapse.has(id);
    }

    onDestroy(() => {
        // nothing to tear down; everything is purely derived
    });
</script>

<div
    bind:this={hostEl}
    class="family-view-canvas bg-canvas relative h-full w-full overflow-hidden"
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
                    class="group/card absolute {cardOnPath(node.personId)
                        ? 'family-view-onpath rounded ring-2 ring-accent/70'
                        : ''}"
                    data-on-path={cardOnPath(node.personId) ? "true" : undefined}
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
                    {#if canExpand(node.personId)}
                        <button
                            type="button"
                            data-expand-toggle="expand"
                            class="card-affordance border-line bg-canvas-elev text-fg
                                   hover:border-accent hover:bg-canvas hover:text-accent
                                   absolute -bottom-3 left-1/2 z-30 flex h-6 w-6 -translate-x-1/2
                                   items-center justify-center rounded-full border
                                   opacity-80 shadow transition-opacity
                                   group-hover/card:opacity-100"
                            aria-label="expand branch"
                            title="show more of this branch"
                            onclick={(e) => onExpandClick(node.personId, true, e)}
                        >
                            <Plus size={14} strokeWidth={2.5} />
                        </button>
                    {/if}
                    {#if canCollapse(node.personId)}
                        <button
                            type="button"
                            data-expand-toggle="collapse"
                            class="card-affordance border-line bg-canvas-elev text-fg
                                   hover:border-accent hover:bg-canvas hover:text-accent
                                   absolute -top-3 -right-3 z-30 flex h-6 w-6 items-center
                                   justify-center rounded-full border opacity-80 shadow
                                   transition-opacity group-hover/card:opacity-100"
                            aria-label="collapse branch"
                            title="hide expanded branch"
                            onclick={(e) => onExpandClick(node.personId, false, e)}
                        >
                            <Minus size={14} strokeWidth={2.5} />
                        </button>
                    {/if}
                    {#if generationLabel(node)}
                        <span
                            class="border-line bg-canvas-elev/90 text-fg-muted
                                   pointer-events-none absolute -top-2 -left-2 z-20
                                   rounded-full border px-1 font-mono text-[10px]
                                   leading-tight shadow-sm"
                            data-generation-badge={generationLabel(node)}
                            aria-hidden="true">{generationLabel(node)}</span>
                    {/if}
                    {#if node.personId === activeFocus}
                        <button
                            type="button"
                            data-add-toggle="open"
                            data-add-toggle-for={node.personId}
                            class="card-affordance border-line bg-canvas-elev text-fg
                                   hover:border-accent hover:bg-canvas hover:text-accent
                                   absolute -top-3 -left-3 z-30 flex h-6 w-6 items-center
                                   justify-center rounded-full border opacity-80 shadow
                                   transition-opacity group-hover/card:opacity-100"
                            aria-label={`add a relative for ${partnerLabel(node.personId)}`}
                            aria-haspopup="menu"
                            aria-expanded={addOpenFor === node.personId}
                            title="add relative (parent / partner / child)"
                            onclick={(e) => onAddToggle(node.personId, e)}
                        >
                            <UserPlus size={14} strokeWidth={2.5} />
                        </button>
                        {#if addOpenFor === node.personId}
                            <div
                                data-add-toggle="menu"
                                role="menu"
                                class="border-line bg-canvas-elev absolute top-full left-0 z-40 mt-1
                                       min-w-32 rounded border py-1 text-xs shadow-md"
                            >
                                <button
                                    type="button"
                                    role="menuitem"
                                    data-add-kind="parent"
                                    class="text-fg hover:bg-canvas-hover block w-full
                                           px-2 py-1 text-left"
                                    onclick={(e) => onAddPick(node.personId, "parent", e)}
                                >
                                    add parent
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    data-add-kind="partner"
                                    class="text-fg hover:bg-canvas-hover block w-full
                                           px-2 py-1 text-left"
                                    onclick={(e) => onAddPick(node.personId, "partner", e)}
                                >
                                    add partner
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    data-add-kind="child"
                                    class="text-fg hover:bg-canvas-hover block w-full
                                           px-2 py-1 text-left"
                                    onclick={(e) => onAddPick(node.personId, "child", e)}
                                >
                                    add child
                                </button>
                            </div>
                        {/if}
                    {/if}
                    {#if multiUnionMate(node.personId)}
                        {@const m = multiUnionMate(node.personId)!}
                        <button
                            type="button"
                            data-union-picker="toggle"
                            data-union-picker-for={node.personId}
                            class="card-affordance border-line bg-canvas-elev text-fg
                                   hover:border-accent hover:bg-canvas hover:text-accent
                                   absolute -bottom-3 -right-3 z-30 flex h-6 w-6 items-center
                                   justify-center rounded-full border opacity-80 shadow
                                   transition-opacity group-hover/card:opacity-100"
                            aria-label={`switch shown union for ${partnerLabel(m.mateId)} (session-only preference, doesn't change record)`}
                            aria-haspopup="menu"
                            aria-expanded={pickerOpenFor === node.personId}
                            title={`switch primary union for ${partnerLabel(m.mateId)} (session-only; doesn't change record)`}
                            onclick={(e) => onPickerToggle(node.personId, e)}
                        >
                            <ChevronDown size={14} strokeWidth={2.5} />
                        </button>
                        {#if pickerOpenFor === node.personId}
                            <div
                                data-union-picker="menu"
                                role="menu"
                                class="border-line bg-canvas-elev absolute top-full right-0 z-40 mt-1
                                       min-w-32 rounded border py-1 text-xs shadow-md"
                            >
                                {#each m.alternates as alt (alt.coupleIndex)}
                                    <button
                                        type="button"
                                        role="menuitem"
                                        data-union-picker-alt={alt.coupleIndex}
                                        class="text-fg hover:bg-canvas-hover block w-full
                                               px-2 py-1 text-left"
                                        onclick={(e) =>
                                            onPickerSelect(m.mateId, alt.coupleIndex, e)}
                                    >
                                        switch to {partnerLabel(alt.partnerId)}
                                    </button>
                                {/each}
                                {#if m.alternates.length === 0}
                                    <span class="text-fg-muted block px-2 py-1"
                                        >(no other unions)</span
                                    >
                                {/if}
                            </div>
                        {/if}
                    {/if}
                </div>
            {/if}
        {/each}

        {#each layout.badges as badge (badge.id)}
            <button
                type="button"
                data-badge-id={badge.id}
                data-on-path={isBadgeOnPath(badge) ? "true" : undefined}
                class="border-line bg-canvas-elev text-fg hover:border-accent
                       absolute flex items-center justify-center gap-1 rounded-full
                       border px-2 py-0.5 text-xs shadow-sm
                       {isBadgeOnPath(badge) ? 'ring-2 ring-accent/70 border-accent' : ''}"
                style:left="{badge.x * UNIT}px"
                style:top="{badge.y * UNIT}px"
                style:width="{CARD_W_PX}px"
                style:height="{CARD_H_PX}px"
                aria-label={`expand ${String(badge.members.length)} hidden persons starting with ${badge.sampleName}`}
                title={`expand ${String(badge.members.length)} hidden: ${badge.sampleName}, ...`}
                onclick={(e) => onBadgeClick(badge, e)}
            >
                <span class="text-accent font-semibold">+{badge.members.length}</span>
                <span class="text-fg-muted truncate text-[10px]">{badge.sampleName}</span>
            </button>
        {/each}
    </div>
</div>
