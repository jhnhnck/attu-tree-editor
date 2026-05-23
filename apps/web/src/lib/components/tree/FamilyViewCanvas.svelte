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
    import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";
    import { FamilyViewEngine, CARD_H } from "$lib/layout/engines/family-view";
    import { edgePath as buildEdgePath } from "$lib/layout/engines/family-view/edgePath";
    import type {
        BadgeNode,
        FamilyViewEdge,
        FamilyViewLayout,
        FamilyViewNode,
        MultiUnionMate,
    } from "$lib/layout/engines/family-view";
    import { useExpansionState } from "$lib/layout/engines/family-view/expansion";
    import { usePrimaryUnionState } from "$lib/layout/engines/family-view/primaryUnion";
    import { useSecondaryUnionState } from "$lib/layout/engines/family-view/secondaryUnion";
    import { usePath, badgeOnPath } from "$lib/layout/engines/family-view/path";
    import { computeAncestorOverlap } from "$lib/domain/consanguinity";
    import type { PersonId, Tree } from "$lib/domain/types";
    import type { CanvasAnchorOpts, CanvasController } from "./canvasController";

    interface Props {
        tree: Tree;
        selectedId?: PersonId | undefined;
        /**
         * Phase 6 (family-view): path-highlight overlay master switch.
         * `true` (default) → Phase 3 behaviour: edges thicken, off-path
         * dims, cards get `ring-accent`, badges accent. `false` → renderer
         * treats the path set as empty regardless of selection, so the
         * canvas reads the same as Phase 2 visually. Toggled via the
         * View > "Overlay: path highlight" menu entry; persisted to
         * `fte.overlays.pathHighlight`.
         */
        pathHighlight?: boolean | undefined;
        /**
         * Visual fix-up plan phase 0: master switch for the generation-badge
         * overlay (`g+N` / `gN` pills on cards offset from focus). Defaults
         * to `true` to preserve current behaviour; phase 4 wires a View-menu
         * toggle and flips the default to `false`. Persisted upstream via
         * `fte.overlays.generationBadge`.
         */
        showGenerationBadge?: boolean | undefined;
        /**
         * Phase 4 (relationship-vocabulary): toggle for sworn-bond /
         * oath / ritual overlays. Default `true`. Wired through View
         * menu; persisted as `fte.overlays.swornBonds`.
         */
        showOverlaySwornBonds?: boolean | undefined;
        /** Phase 4: toggle for transformation / alias overlays. Persisted as `fte.overlays.transformations`. */
        showOverlayTransformations?: boolean | undefined;
        /** Phase 4: toggle for severance overlays. Persisted as `fte.overlays.severances`. */
        showOverlaySeverances?: boolean | undefined;
        /** Phase 6a: toggle for group frames (dynasties, houses, etc.). Persisted as `fte.overlays.groupFrames`. */
        showGroupFrames?: boolean | undefined;
        /**
         * Phase 6b: toggle for consanguinity surfacing — COI badge on
         * the focus card, duplicate-ancestor tint on people appearing
         * in multiple ancestor paths of the focus. Persisted as
         * `fte.overlays.consanguinity`. Default `false` (off until the
         * user opts in via the View menu).
         */
        showConsanguinity?: boolean | undefined;
        /**
         * Wave-2 phase 2: family-view crossing-minimisation. Default
         * `true` — runs the slot-index barycentric pass with a monotone
         * gate (re-uses the candidate layout only when its geometric
         * crossing count is strictly lower). Persisted upstream via
         * `fte.layout.familyViewCrossingMin` localStorage flag; rollback
         * path is to flip the App-level default to `false`.
         */
        crossingMin?: boolean | undefined;
        /**
         * Wave-2 phase 3: smooth-diff animation. When `true` (default),
         * card positions tween via a CSS transition on `transform`
         * whenever the layout shifts (expand / collapse / refocus).
         * Edges and badge mount/unmount jump-cut — see the phase 3
         * retro for the bounded-scope rationale. Persisted upstream
         * via `fte.overlays.smoothDiff` localStorage flag; the global
         * `prefers-reduced-motion: reduce` media query in `app.css`
         * zeroes the transition for users who opt out of motion.
         */
        smoothDiff?: boolean | undefined;
        /**
         * Wave-2 phase 4: secondary-union expansion master switch. When
         * `true` (default), the `˅` picker offers a "show alongside" /
         * "hide" action that adds a second 2-partner union next to the
         * primary at the same rank — see `secondaryUnion.ts` for the
         * 1-expanded-secondary-per-person cap. When `false`, the picker
         * reverts to wave-1's swap-only behaviour. Persisted upstream
         * via `fte.layout.familyViewSecondaryUnion` localStorage flag.
         */
        secondaryUnion?: boolean | undefined;
        /**
         * Portrait blob -> object-URL cache shared with the layered engine.
         * Phase 1 of the visual fix-up plan: family-view now renders
         * portraits at the larger card height when `person.portraitBlobId`
         * is set. Absent the cache, photos silently fall back to the
         * silhouette (current pre-phase-1 behaviour).
         */
        portraitUrls?: PortraitUrlCache | undefined;
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
            | ((stats: { totalPeople: number; components: number; isolated: number }) => void)
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
        pathHighlight = true,
        showGenerationBadge = true,
        showOverlaySwornBonds = true,
        showOverlayTransformations = true,
        showOverlaySeverances = true,
        showGroupFrames = true,
        showConsanguinity = false,
        crossingMin = true,
        smoothDiff = true,
        secondaryUnion = true,
        portraitUrls,
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

    /**
     * Compute a font-size that compensates for the canvas scale so SVG
     * text reads at a stable on-screen size across the zoom range.
     * Clamped to [8, 28] so labels stay legible at the scale extremes
     * without inflating into oversized blobs at minimum zoom.
     */
    function scaledFontSize(base: number, s: number): number {
        const v = base / s;
        return Math.max(8, Math.min(28, v));
    }

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
    // Wave-2 phase 4 secondary-union expansion — same lifecycle.
    let secondaryUnionState = $derived(useSecondaryUnionState(tree.id, activeFocus));

    // Phase 6: when the Overlays > "Path highlight" toggle is off, skip
    // the BFS path lookup and present an empty path-set so the renderer
    // falls through to its no-path styling (Phase 2 visual). The
    // `pathHighlight === false` path costs O(1) — saves the BFS scan
    // on every selection / focus change for users who've turned the
    // overlay off.
    const EMPTY_PATH = {
        pathSet: new Set<PersonId>() as ReadonlySet<PersonId>,
        onPath: () => false,
    } as const;
    let pathHl = $derived(
        pathHighlight === false ? EMPTY_PATH : usePath(tree, activeFocus, selectedId),
    );

    /**
     * Family-view layout. Re-runs when the tree, focus, expansion set, or
     * primary-union overrides change. Cheap enough that we recompute on
     * every reactive tick. Bumping `expansionRev` / `primaryRev` is the
     * reactivity trigger because the underlying Maps/Sets reassign rather
     * than mutate.
     */
    let expansionRev = $state(0);
    let primaryRev = $state(0);
    let secondaryRev = $state(0);
    let layout = $derived<FamilyViewLayout>(
        engine.layout({
            tree,
            focus: activeFocus,
            options: {
                expanded: (void expansionRev, expansion.expanded),
                primaryUnionOverrides: (void primaryRev, primaryUnion.overrides),
                crossingMin,
                // Conditionally include the field rather than passing
                // `undefined` — `exactOptionalPropertyTypes` distinguishes
                // "absent" from "undefined value".
                ...(secondaryUnion
                    ? {
                          expandedSecondaryUnions:
                              (void secondaryRev, secondaryUnionState.byPerson),
                      }
                    : {}),
            },
        }),
    );

    /**
     * Phase 6b: derived consanguinity surfacing for the active focus.
     * When the Consanguinity overlay is on, drive the COI badge on the
     * focus card and the duplicate-ancestor tint on cards whose person
     * appears in more than one ancestor path.
     */
    let consang = $derived(showConsanguinity ? computeAncestorOverlap(tree, activeFocus) : null);
    let consangDuplicateSet = $derived(
        consang ? new Set<PersonId>(consang.duplicates) : new Set<PersonId>(),
    );
    function consangCardDuplicate(id: PersonId): boolean {
        return consangDuplicateSet.has(id);
    }
    function coiPercent(coi: number | undefined): string {
        if (coi === undefined || coi <= 0) return "";
        const pct = coi * 100;
        if (pct < 1) return `${pct.toFixed(2)}%`;
        if (pct < 10) return `${pct.toFixed(1)}%`;
        return `${Math.round(pct).toString()}%`;
    }

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

    /** pixels of pointer travel below which a pointerup counts as a tap. */
    const DRAG_THRESHOLD_PX = 4;
    let dragStart: { x: number; y: number; pX: number; pY: number; moved: boolean } | undefined;

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
        dragStart = { x: e.clientX, y: e.clientY, pX: panX, pY: panY, moved: false };
        (e.target as Element).setPointerCapture?.(e.pointerId);
    }

    function onPointerMove(e: PointerEvent): void {
        if (!dragStart) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        if (!dragStart.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
            dragStart.moved = true;
        }
        if (dragStart.moved) {
            panX = dragStart.pX + dx;
            panY = dragStart.pY + dy;
        }
    }

    function onPointerUp(_e: PointerEvent): void {
        if (!dragStart) return;
        const wasDrag = dragStart.moved;
        dragStart = undefined;
        // pointerdown's card / control filters above mean we only reach
        // here on the canvas background; a no-drag pointerup is a tap on
        // empty space, which clears the current selection.
        if (!wasDrag) ondeselect?.();
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
            panY = hostH / 2 - (node.y + (node.h ?? CARD_H) / 2) * UNIT * scale;
            return;
        }
        // Off-subset target — shift focus; the auto-fit effect re-centres
        // once the new layout lands.
        focusOverride = id;
    }

    /**
     * Wave-2 phase 0b: anchor-aware setScale. Without an explicit
     * anchor, pans the host viewport-center to stay fixed at the new
     * scale — fixing the prior "100% drifts the focal point" bug
     * where the widget +/- / slider / exact-percent paths bumped
     * scale without recomputing panX/panY. The wheel path
     * (FamilyViewCanvas.svelte's `onWheel`) keeps its cursor anchor by
     * mutating pan + scale directly without going through `setScale`.
     */
    function setScaleAnchored(next: number, opts?: CanvasAnchorOpts): void {
        const target = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
        if (target === scale) return;
        if (hostEl) {
            const rect = hostEl.getBoundingClientRect();
            const cx = opts?.anchorPx?.x ?? rect.width / 2;
            const cy = opts?.anchorPx?.y ?? rect.height / 2;
            const cuX = (cx - panX) / scale;
            const cuY = (cy - panY) / scale;
            panX = cx - cuX * target;
            panY = cy - cuY * target;
        }
        scale = target;
    }

    onMount(() => {
        oncontroller?.({
            getScale: () => scale,
            setScale: setScaleAnchored,
            zoomBy: (factor: number, opts?: CanvasAnchorOpts) => {
                setScaleAnchored(scale * factor, opts);
            },
            fit: fitToView,
            zoom100: () => {
                setScaleAnchored(1);
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

    /**
     * Wave-2 phase 4: pulls a secondary union into the visible subset
     * alongside the current primary, capped at one expanded secondary
     * per person by `secondaryUnion.ts`'s setter. Idempotent — calling
     * `expand` for an already-expanded entry is a no-op. Returns
     * immediately if the secondary-union master switch is off (the
     * action shouldn't even be reachable via the menu, but the guard
     * is here for completeness).
     */
    function onPickerShowAlongside(mateId: PersonId, coupleIndex: number, e: MouseEvent): void {
        e.stopPropagation();
        if (!secondaryUnion) return;
        secondaryUnionState.expand(mateId, coupleIndex);
        secondaryRev += 1;
        pickerOpenFor = null;
    }

    function onPickerHideAlongside(mateId: PersonId, coupleIndex: number, e: MouseEvent): void {
        e.stopPropagation();
        secondaryUnionState.collapse(mateId, coupleIndex);
        secondaryRev += 1;
        pickerOpenFor = null;
    }

    /** Coupleindexes currently expanded as secondaries for `mateId`. */
    function expandedSecondariesFor(mateId: PersonId): readonly number[] {
        void secondaryRev;
        return secondaryUnionState.expandedFor(mateId);
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
        return buildEdgePath(e.points, UNIT);
    }

    function overlayPath(points: readonly { x: number; y: number }[]): string {
        return buildEdgePath(points, UNIT);
    }

    /**
     * Glyph for an identity-arc overlay (transformation / alias family).
     * Mirrors the design study: ☼ transform, ∞ reincarnate, ⊕ merge,
     * ⊖ split, ≡ alias.
     */
    function overlayGlyph(rk: string): string {
        switch (rk) {
            case "transformed-from":
                return "☼";
            case "reincarnated-as":
                return "∞";
            case "merged-from":
                return "⊕";
            case "split-into":
                return "⊖";
            case "alias-of":
                return "≡";
            default:
                return "";
        }
    }

    function overlayClass(o: { kind: string }): string {
        switch (o.kind) {
            case "sworn-bond":
                return "family-view-overlay family-view-overlay-sworn";
            case "transformation":
                return "family-view-overlay family-view-overlay-transformation";
            case "alias":
                return "family-view-overlay family-view-overlay-alias";
            case "severance":
                return "family-view-overlay family-view-overlay-severance";
            default:
                return "family-view-overlay";
        }
    }

    function isOverlayVisible(kind: string): boolean {
        switch (kind) {
            case "sworn-bond":
                return showOverlaySwornBonds !== false;
            case "transformation":
            case "alias":
                return showOverlayTransformations !== false;
            case "severance":
                return showOverlaySeverances !== false;
            default:
                return true;
        }
    }

    function midpointOfPolyline(points: readonly { x: number; y: number }[]): {
        x: number;
        y: number;
    } {
        if (points.length === 0) return { x: 0, y: 0 };
        if (points.length === 1) return points[0]!;
        let total = 0;
        const segs: number[] = [];
        for (let i = 0; i < points.length - 1; i += 1) {
            const a = points[i]!;
            const b = points[i + 1]!;
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            segs.push(len);
            total += len;
        }
        const half = total / 2;
        let acc = 0;
        for (let i = 0; i < segs.length; i += 1) {
            const len = segs[i]!;
            if (acc + len >= half) {
                const t = len === 0 ? 0 : (half - acc) / len;
                const a = points[i]!;
                const b = points[i + 1]!;
                return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
            }
            acc += len;
        }
        return points[points.length - 1]!;
    }

    function edgeClass(e: FamilyViewEdge): string {
        const hasPath = pathHl.pathSet.size > 0;
        // An edge is on-path if every implicated person is on the path
        // (stem/bus include all parents; stub includes parents + the kid).
        const onPath = hasPath && edgeOnPath(e);
        if (!hasPath) {
            return e.role === "married"
                ? "stroke-rose-400/70 stroke-1"
                : e.role === "divorced"
                  ? "stroke-rose-400/40 stroke-1"
                  : "stroke-fg-muted/70 stroke-1";
        }
        if (onPath) {
            // thick translucent stroke; .family-view-onpath-edge owns the
            // stroke-width (via the --fte-on-path-stroke-width token) and the
            // accent-colored drop-shadow glow that makes the line look lit.
            return e.role === "married"
                ? "family-view-onpath-edge stroke-rose-400/55"
                : e.role === "divorced"
                  ? "family-view-onpath-edge stroke-rose-400/45"
                  : "family-view-onpath-edge stroke-accent/60";
        }
        // Off-path while a path is active: dim.
        return e.role === "married"
            ? "stroke-rose-400/25 stroke-1"
            : e.role === "divorced"
              ? "stroke-rose-400/15 stroke-1"
              : "stroke-fg-muted/25 stroke-1";
    }

    // Phase-2 split each couple-drop into stem + bus + per-child stubs,
    // each with its own `persons` set. A simple `.every(persons in path)`
    // misses the bus (whose persons union both parents + every kid) and
    // the stem (parents only). Treat the family as on-path when at least
    // one kid in the subtree is on-path AND at least one parent is too.
    function edgeOnPath(e: FamilyViewEdge): boolean {
        const onPath = e.persons.filter((id) => pathHl.onPath(id));
        if (onPath.length === 0) return false;
        // Stub edges only emit if the kid (last person) is on-path.
        if (e.id.startsWith("stub:")) return pathHl.onPath(e.persons[e.persons.length - 1]!);
        // Stem + bus + couple-bond + single-parent drops: any-implicated-on-path
        // matches the legacy pre-phase-2 behaviour the user remembers.
        return onPath.length > 0;
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
    class="family-view-canvas bg-canvas relative h-full w-full overflow-clip"
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
            {#if showGroupFrames && layout.groups}
                {#each layout.groups as group (group.id)}
                    {#if group.frame === "hull" && group.hull && group.hull.length >= 3}
                        <polygon
                            class="family-view-group family-view-group-hull"
                            data-group-id={group.id}
                            data-group-kind={group.kind}
                            points={group.hull.map((p) => `${p.x * UNIT},${p.y * UNIT}`).join(" ")}
                            style:fill={group.color ?? undefined}
                            vector-effect="non-scaling-stroke"
                        />
                    {/if}
                    {#if (group.frame === "band" || group.frame === "ribbon") && group.rect}
                        <rect
                            class="family-view-group family-view-group-{group.frame}"
                            data-group-id={group.id}
                            data-group-kind={group.kind}
                            x={group.rect.x * UNIT}
                            y={group.rect.y * UNIT}
                            width={group.rect.w * UNIT}
                            height={group.rect.h * UNIT}
                            style:fill={group.color ?? undefined}
                            vector-effect="non-scaling-stroke"
                        />
                        {#if group.frame === "ribbon"}
                            <text
                                class="family-view-group-label"
                                x={(group.rect.x + group.rect.w / 2) * UNIT}
                                y={(group.rect.y + group.rect.h / 2) * UNIT}
                                text-anchor="middle"
                                dominant-baseline="central"
                                font-size={scaledFontSize(12, scale)}>{group.name}</text
                            >
                        {/if}
                    {/if}
                {/each}
            {/if}
            {#each layout.edges as edge (edge.id)}
                <path
                    d={edgePath(edge)}
                    class="family-view-edge fill-none {edgeClass(edge)}"
                    vector-effect="non-scaling-stroke"
                />
            {/each}
            {#if layout.sibships}
                {#each layout.sibships as sib (sib.id)}
                    {#if sib.members.length >= 2}
                        {@const xs = sib.members.map((m) => m.x)}
                        {@const minX = Math.min(...xs)}
                        {@const maxX = Math.max(...xs)}
                        <!-- bracket horizontal across the sibship span -->
                        <path
                            class="family-view-sibship"
                            d={`M ${(minX * UNIT).toString()} ${(sib.bracketY * UNIT).toString()} L ${(maxX * UNIT).toString()} ${(sib.bracketY * UNIT).toString()}`}
                            data-sibship-id={sib.id}
                            data-sibship-kind={sib.kind}
                            vector-effect="non-scaling-stroke"
                        />
                        <!-- short verticals from bracket down to each sibling's card top -->
                        {#each sib.members as m (m.personId)}
                            <path
                                class="family-view-sibship"
                                d={`M ${(m.x * UNIT).toString()} ${(sib.bracketY * UNIT).toString()} L ${(m.x * UNIT).toString()} ${((sib.bracketY + 0.15) * UNIT).toString()}`}
                                vector-effect="non-scaling-stroke"
                            />
                        {/each}
                        {#if sib.tieBar === "solid"}
                            <path
                                class="family-view-sibship-tie-solid"
                                d={`M ${(minX * UNIT).toString()} ${((sib.bracketY - 0.07) * UNIT).toString()} L ${(maxX * UNIT).toString()} ${((sib.bracketY - 0.07) * UNIT).toString()}`}
                                data-sibship-tie="solid"
                                vector-effect="non-scaling-stroke"
                            />
                        {/if}
                        {#if sib.tieBar === "dashed"}
                            <path
                                class="family-view-sibship-tie-dashed"
                                d={`M ${(minX * UNIT).toString()} ${((sib.bracketY - 0.07) * UNIT).toString()} L ${(maxX * UNIT).toString()} ${((sib.bracketY - 0.07) * UNIT).toString()}`}
                                data-sibship-tie="dashed"
                                vector-effect="non-scaling-stroke"
                            />
                        {/if}
                        {#if sib.tieBar === "double"}
                            <path
                                class="family-view-sibship-tie-double"
                                d={`M ${(minX * UNIT).toString()} ${((sib.bracketY - 0.06) * UNIT).toString()} L ${(maxX * UNIT).toString()} ${((sib.bracketY - 0.06) * UNIT).toString()}`}
                                vector-effect="non-scaling-stroke"
                            />
                            <path
                                class="family-view-sibship-tie-double"
                                d={`M ${(minX * UNIT).toString()} ${((sib.bracketY - 0.1) * UNIT).toString()} L ${(maxX * UNIT).toString()} ${((sib.bracketY - 0.1) * UNIT).toString()}`}
                                vector-effect="non-scaling-stroke"
                            />
                        {/if}
                    {/if}
                {/each}
            {/if}
            {#if layout.overlays}
                {#each layout.overlays as overlay (overlay.id)}
                    {#if isOverlayVisible(overlay.kind) && overlay.points.length >= 2}
                        <path
                            d={overlayPath(overlay.points)}
                            class={overlayClass(overlay)}
                            data-overlay-kind={overlay.kind}
                            data-overlay-id={overlay.id}
                            vector-effect="non-scaling-stroke"
                        />
                        {#if overlay.kind === "transformation" || overlay.kind === "alias"}
                            {@const mid = midpointOfPolyline(overlay.points)}
                            {@const glyph = overlayGlyph(overlay.relationshipKind)}
                            {#if glyph}
                                <text
                                    class="family-view-overlay-glyph"
                                    x={mid.x * UNIT}
                                    y={mid.y * UNIT}
                                    text-anchor="middle"
                                    dominant-baseline="central"
                                    font-size={scaledFontSize(14, scale)}>{glyph}</text
                                >
                            {/if}
                        {/if}
                        {#if overlay.kind === "severance" && overlay.severanceMark}
                            <text
                                class="family-view-overlay-severance-mark"
                                x={overlay.severanceMark.x * UNIT}
                                y={overlay.severanceMark.y * UNIT}
                                text-anchor="middle"
                                dominant-baseline="central"
                                font-size={scaledFontSize(14, scale)}>//</text
                            >
                        {/if}
                    {/if}
                {/each}
            {/if}
        </svg>

        {#each nodes() as node (node.personId)}
            {@const person = tree.people[node.personId]}
            {#if person}
                <div
                    class="group/card absolute {cardOnPath(node.personId)
                        ? 'family-view-onpath rounded'
                        : ''} {smoothDiff ? 'family-view-smooth-card' : ''}"
                    data-on-path={cardOnPath(node.personId) ? "true" : undefined}
                    data-consang-duplicate={consangCardDuplicate(node.personId)
                        ? "true"
                        : undefined}
                    data-smooth-diff={smoothDiff ? "true" : undefined}
                    style:left="0"
                    style:top="0"
                    style:transform="translate3d({node.x * UNIT}px, {node.y * UNIT}px, 0)"
                    style:width="{CARD_W_PX}px"
                    style:height="{(node.h ?? CARD_H) * UNIT}px"
                >
                    <PersonNode
                        {person}
                        selected={selectedId === person.id}
                        level={0}
                        portraitUrl={portraitUrls?.get(person.portraitBlobId)}
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
                    {#if showConsanguinity && node.personId === activeFocus && consang && consang.coi !== undefined && consang.coi > 0}
                        <span
                            class="border-line bg-canvas-elev/90
                                   pointer-events-none absolute -bottom-2 -right-2 z-20
                                   rounded-full border px-1.5 font-mono text-[10px]
                                   leading-tight shadow-sm"
                            style:color="hsl(0 70% 45%)"
                            data-consang-coi={coiPercent(consang.coi)}
                            title={`coefficient of inbreeding ${coiPercent(consang.coi)} (${String(consang.duplicates.length)} duplicate ancestor${consang.duplicates.length === 1 ? "" : "s"})`}
                            aria-label="coefficient of inbreeding"
                            >COI {coiPercent(consang.coi)}</span
                        >
                    {/if}
                    {#if showGenerationBadge && generationLabel(node)}
                        <span
                            class="border-line bg-canvas-elev/90 text-fg-muted
                                   pointer-events-none absolute -top-2 -left-2 z-20
                                   rounded-full border px-1 font-mono text-[10px]
                                   leading-tight shadow-sm"
                            data-generation-badge={generationLabel(node)}
                            aria-hidden="true">{generationLabel(node)}</span
                        >
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
                                       min-w-48 rounded border py-1 text-xs shadow-md"
                            >
                                {#each m.alternates as alt (alt.coupleIndex)}
                                    {@const isExpandedSecondary = expandedSecondariesFor(
                                        m.mateId,
                                    ).includes(alt.coupleIndex)}
                                    <button
                                        type="button"
                                        role="menuitem"
                                        data-union-picker-alt={alt.coupleIndex}
                                        data-union-picker-action="set-primary"
                                        class="text-fg hover:bg-canvas-hover block w-full
                                               px-2 py-1 text-left"
                                        onclick={(e) =>
                                            onPickerSelect(m.mateId, alt.coupleIndex, e)}
                                    >
                                        set primary to {partnerLabel(alt.partnerId)}
                                    </button>
                                    {#if secondaryUnion && !isExpandedSecondary}
                                        <button
                                            type="button"
                                            role="menuitem"
                                            data-union-picker-alt={alt.coupleIndex}
                                            data-union-picker-action="show-alongside"
                                            class="text-fg-muted hover:bg-canvas-hover block w-full
                                                   px-2 py-1 pl-4 text-left"
                                            onclick={(e) =>
                                                onPickerShowAlongside(m.mateId, alt.coupleIndex, e)}
                                        >
                                            also show {partnerLabel(alt.partnerId)} alongside
                                        </button>
                                    {/if}
                                    {#if secondaryUnion && isExpandedSecondary}
                                        <button
                                            type="button"
                                            role="menuitem"
                                            data-union-picker-alt={alt.coupleIndex}
                                            data-union-picker-action="hide-alongside"
                                            class="text-fg-muted hover:bg-canvas-hover block w-full
                                                   px-2 py-1 pl-4 text-left"
                                            onclick={(e) =>
                                                onPickerHideAlongside(m.mateId, alt.coupleIndex, e)}
                                        >
                                            hide {partnerLabel(alt.partnerId)}
                                        </button>
                                    {/if}
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
                data-smooth-diff={smoothDiff ? "true" : undefined}
                class="border-line bg-canvas-elev text-fg hover:border-accent
                       absolute flex items-center justify-center gap-1 rounded-full
                       border px-2 py-0.5 text-xs shadow-sm
                       {isBadgeOnPath(badge) ? 'family-view-onpath border-accent' : ''}
                       {smoothDiff ? 'family-view-smooth-card' : ''}"
                style:left="0"
                style:top="0"
                style:transform="translate3d({badge.x * UNIT}px, {badge.y * UNIT}px, 0)"
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
