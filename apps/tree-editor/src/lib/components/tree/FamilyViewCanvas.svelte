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
    import { fade } from "svelte/transition";
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
        RejectionReason,
    } from "$lib/layout/engines/family-view";
    import { useExpansionState } from "$lib/layout/engines/family-view/expansion";
    import { usePrimaryUnionState } from "$lib/layout/engines/family-view/primaryUnion";
    import { useSecondaryUnionState } from "$lib/layout/engines/family-view/secondaryUnion";
    import { usePath, badgeOnPath } from "$lib/layout/engines/family-view/path";
    import {
        computeAncestorOverlap,
        formatCoiPercent,
        formatCoi,
        COI_DISPLAY_THRESHOLD,
        getCoiCacheStats,
    } from "$lib/domain/consanguinity";
    import type { PersonId, Tree } from "$lib/domain/types";
    import type { CanvasAnchorOpts, CanvasController } from "./canvasController";
    import { computeFit, measureCanvasChromeInsets } from "@attu/ui";
    import FamilyViewDebugOverlay from "$lib/components/tree/FamilyViewDebugOverlay.svelte";
    import type { FamilyViewDebugLayerOptions } from "$lib/components/tree/debugTypes";
    import { selectBoundedSubset } from "$lib/layout/engines/family-view/subset";

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
         * Phase 1 family-view-debug plan: push the current `RankedSubset`
         * (visible set + rationale map) up to the shell so the debug
         * panel can render the off-subset section inline in its own
         * column instead of as a floating overlay on the canvas. Fires
         * only when `debugOptions` is defined; emits `null` otherwise.
         */
        onsubsetchange?:
            | ((
                  subset: import("$lib/layout/engines/family-view/subset").RankedSubset | null,
              ) => void)
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
        /**
         * Phase 0 of the family-view debug overlay plan. Walking skeleton:
         * when `debugOptions` is defined, the canvas mounts
         * `FamilyViewDebugOverlay` (gated by each layer's `{#if}`) and
         * populates `window.__treeDebug` with the family-view shape when
         * `layers.exposeFamilyDebug` is on. `undefined` keeps the canvas
         * in production mode — zero debug work. Parallels the layered
         * canvas's `debugOptions` prop; the layer types are distinct
         * (`FamilyViewDebugLayerOptions` vs `DebugLayerOptions`) because
         * the two engines have non-overlapping overlay geometry.
         *
         * `window.__treeDebug` is shared across engines; the
         * `engine: "family-view"` discriminator on the handle makes the
         * source unambiguous in devtools. The handle is restored to its
         * previous value when this canvas unmounts or when
         * `exposeFamilyDebug` is turned off, matching the existing
         * HyperbolicCanvas pattern (see vite-env.d.ts `TreeDebugHandle`).
         */
        debugOptions?: { layers: FamilyViewDebugLayerOptions } | undefined;
        /**
         * Phase 3 of the family-view debug overlay plan. The canvas owns
         * the `recenterOn` mechanism but App.svelte owns the selection-
         * event origin. These three props close the loop so the overlay
         * can render the focus-events panel, the green-flash pulse, and
         * the red corner badge:
         *
         *   - `onrecenter` fires every time `recenterOn` is invoked (palette
         *     jump, `focusSelection`, `centerOnPerson`, programmatic
         *     fitSelection). App's watchdog clears its pending timer here.
         *   - `pendingRecenterSeq` is an App-owned counter bumped on every
         *     recenter. The overlay watches the seq to flash the canvas
         *     border green for ~250ms.
         *   - `recenterMissedFor` carries the personId whose 200ms watchdog
         *     fired without a matching `onrecenter`. The red corner badge
         *     names that person and the rejection reason (if off-subset).
         *   - `focusEventsForOverlay` is the rolling window (newest first)
         *     of selection / focus events for the in-canvas log panel.
         */
        onrecenter?: ((id: PersonId) => void) | undefined;
        pendingRecenterSeq?: number | undefined;
        recenterMissedFor?: PersonId | undefined;
        focusEventsForOverlay?:
            | ReadonlyArray<{
                  readonly seq: number;
                  readonly ts: number;
                  readonly source: string;
                  readonly personId: PersonId | undefined;
                  readonly requestedRecenter: boolean;
                  readonly didTriggerCenterOn: boolean;
              }>
            | undefined;
        /**
         * Phase 5 of the family-view debug overlay plan: most recently
         * mutated person id. App.svelte sets this on every save; the
         * canvas forwards it to the debug overlay so `showLastEditHalo`
         * can ring the freshly-edited card for 1s.
         */
        lastEditedId?: PersonId | undefined;
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
        onsubsetchange,
        onaddRelative,
        debugOptions,
        onrecenter,
        pendingRecenterSeq,
        recenterMissedFor,
        focusEventsForOverlay,
        lastEditedId,
    }: Props = $props();

    /** pixels per unit; matches TreeCanvas so card sizes feel consistent */
    const UNIT = 80;
    const CARD_W_PX = PERSON_W * UNIT;
    const CARD_H_PX = CARD_H * UNIT;
    const MIN_SCALE = 0.2;
    const MAX_SCALE = 2.0;
    const PAN_KEY_STEP_PX = 60; // arrow-key pan step in host css px (shift = 5x)

    // one-time read at module init — matches TreeCanvas pattern
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // gate fade duration on both smoothDiff prop and user's motion preference
    let fadeDuration = $derived(smoothDiff && !prefersReducedMotion ? 200 : 0);

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
    // Phase 5: surface the last layout-pass duration to the debug overlay.
    // `performance.now()` brackets the synchronous `engine.layout` call.
    // The result + duration are returned together from the derivation so
    // we never mutate `$state` from inside `$derived.by` (which throws
    // `state_unsafe_mutation` in Svelte 5). The debug overlay reads
    // `layoutDurationMs` via a sibling derived getter.
    let layoutWithDuration = $derived.by<{
        readonly layout: FamilyViewLayout;
        readonly durationMs: number;
    }>(() => {
        const hasPerf = typeof performance !== "undefined" && typeof performance.now === "function";
        const t0 = hasPerf ? performance.now() : 0;
        const result = engine.layout({
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
        });
        const t1 = hasPerf ? performance.now() : 0;
        return { layout: result, durationMs: t1 - t0 };
    });
    let layout = $derived(layoutWithDuration.layout);
    let layoutDurationMs = $derived(layoutWithDuration.durationMs);

    /**
     * Phase 6b: derived consanguinity surfacing for the active focus.
     * When the Consanguinity overlay is on, drive the COI badge on the
     * focus card and the duplicate-ancestor tint on cards whose person
     * appears in more than one ancestor path.
     *
     * Phase 4 family-view-debug: the derivation also runs when any of the
     * phase-4 debug surfaces are on — `__treeDebug.coi`, the breakdown
     * panel, or the duplicate-ancestor halo overlay — so the diagnostics
     * don't require the production consanguinity overlay to be visible.
     */
    let coiDebugWanted = $derived(
        Boolean(
            debugOptions &&
            (debugOptions.layers.exposeFamilyDebug ||
                debugOptions.layers.showCoiBreakdown ||
                debugOptions.layers.showDuplicateAncestors),
        ),
    );
    let consang = $derived(
        showConsanguinity || coiDebugWanted ? computeAncestorOverlap(tree, activeFocus) : null,
    );
    let consangDuplicateSet = $derived(
        consang ? new Set<PersonId>(consang.duplicates) : new Set<PersonId>(),
    );
    function consangCardDuplicate(id: PersonId): boolean {
        return consangDuplicateSet.has(id);
    }
    // delegate to the shared formatter in $lib/domain/consanguinity so the
    // canonical Wright values (1/8 = 12.5%, 1/16 = 6.25%, ...) render with
    // textbook precision instead of Math.round-mangled approximations
    const coiPercent = formatCoiPercent;
    // production badge format: ".XXXX" raw value with leading zero
    // stripped (per-card badge + stats popover).
    const coiBadge = formatCoi;
    // per-card COI badge gating: any visible node whose Wright COI sits
    // above `COI_DISPLAY_THRESHOLD` gets a badge, not just the active
    // focus. `computeAncestorOverlap` memoises per `tree.editRev`, so
    // re-querying per card on the same render is cache-bound.
    function coiForCard(id: PersonId): number | undefined {
        if (!showConsanguinity) return undefined;
        return computeAncestorOverlap(tree, id).coi;
    }

    // Phase 1 of family-view debug plan: derive the subset (with rationale)
    // whenever the debug overlay is mounted, so the off-subset / orphan
    // overlays have a rationale to consume even when `exposeFamilyDebug`
    // is off. Re-runs on the same triggers as `layout` so the two stay
    // consistent. Returns `null` when no debug options are passed; the
    // overlay's `{#if}` blocks short-circuit on null.
    let debugSubset = $derived.by(() => {
        if (!debugOptions) return null;
        return selectBoundedSubset(tree, activeFocus, {
            expanded: (void expansionRev, expansion.expanded),
            primaryUnionOverrides: (void primaryRev, primaryUnion.overrides),
            ...(secondaryUnion
                ? {
                      expandedSecondaryUnions: (void secondaryRev, secondaryUnionState.byPerson),
                  }
                : {}),
        });
    });

    // Reactive accessors for the debug overlay's per-card pill props. The
    // void-comma trick keeps the underlying Maps as the value while
    // triggering on rev bumps, but it can't appear in svelte attribute
    // expressions (no comma operator there), so wrap in $derived so the
    // template can read a plain reference.
    let debugExpandedSecondaryUnions = $derived((void secondaryRev, secondaryUnionState.byPerson));
    let debugPrimaryUnionOverrides = $derived((void primaryRev, primaryUnion.overrides));
    // Phase 5: expansion-state size for the layout-metrics readout. Same
    // pattern as the two above — the underlying Set reassigns rather than
    // mutates, so the void-comma trick re-fires on `expansionRev`.
    let debugExpansionStateSize = $derived((void expansionRev, expansion.expanded.size));

    // Phase 3 family-view debug: the viewport rect in unit space, derived
    // from the current pan/zoom + host dims. used by the overlay's
    // `showViewportFitTarget` toggle to paint the visible window
    // alongside the selection's expected card rect. unit-space transform:
    // `(panX, panY)` is the css-px offset; one unit = `UNIT * scale` css
    // px. so the visible viewport in unit space starts at `(-panX,
    // -panY) / (UNIT * scale)` and spans `hostW / (UNIT * scale)` by
    // `hostH / (UNIT * scale)`. recomputes on pan / zoom / resize.
    let debugViewportRectUnit = $derived.by(() => {
        if (hostW <= 0 || hostH <= 0) return undefined;
        const u = UNIT * scale;
        if (u <= 0) return undefined;
        return {
            x: -panX / u,
            y: -panY / u,
            w: hostW / u,
            h: hostH / u,
        };
    });

    // Phase 0 of family-view debug plan: populate `window.__treeDebug`
    // with the family-view shape when `debugOptions.layers.exposeFamilyDebug`
    // is on. The handle is shared with the layered + hyperbolic canvases
    // (see vite-env.d.ts `TreeDebugHandle`); the `engine: "family-view"`
    // discriminator makes the source unambiguous in devtools, and
    // restoring `prev` on cleanup matches the HyperbolicCanvas pattern.
    // The subset is re-derived from `selectBoundedSubset` because the
    // engine layout doesn't expose it on `FamilyViewLayout` — phase 1
    // will extend `selectBoundedSubset` to surface rejections too.
    //
    // off-toggle cost: zero — the effect's body returns immediately when
    // `debugOptions` is undefined or `exposeFamilyDebug` is false.
    $effect(() => {
        if (typeof window === "undefined") return;
        if (!debugOptions || !debugOptions.layers.exposeFamilyDebug) return;
        const subset = debugSubset;
        if (!subset) return;
        type DebugHandle = NonNullable<Window["__treeDebug"]>;
        const prev = window.__treeDebug;
        const base: DebugHandle = prev ?? {
            rawSegments: [],
            positions: new Map(),
            warnings: [],
            dumpSegment: () => undefined,
            findPath: () => undefined,
        };
        // phase 4 family-view-debug: include the coi snapshot under
        // `__treeDebug.coi` when consanguinity has produced a result.
        // raw + breakdown surface enough state to diff the displayed
        // rounded percent against the underlying float in devtools.
        const cacheStats = getCoiCacheStats();
        const coiSnapshot =
            consang && consang.coi !== undefined
                ? {
                      duplicates: consang.duplicates,
                      rawCoi: consang.coi,
                      breakdown: consang.breakdown ?? [],
                      cacheHits: cacheStats.cacheHits,
                      cacheMisses: cacheStats.cacheMisses,
                      editRev: tree.editRev,
                  }
                : undefined;
        window.__treeDebug = {
            ...base,
            engine: "family-view",
            familyView: {
                focus: activeFocus,
                layout,
                subset: {
                    visible: subset.visible,
                    rank: subset.rank,
                    hasMoreChildren: subset.hasMoreChildren,
                    hasMoreParents: subset.hasMoreParents,
                    rationale: subset.rationale,
                },
                expansion: expansion.expanded,
                primaryUnion: primaryUnion.overrides,
                secondaryUnion: secondaryUnionState.byPerson,
                selectedId,
                pathHighlight: pathHl.pathSet,
            },
            ...(coiSnapshot ? { coi: coiSnapshot } : {}),
        };
        return () => {
            if (prev) window.__treeDebug = prev;
            else delete window.__treeDebug;
        };
    });

    /**
     * Phase 4 family-view-debug: emit a one-line `console.warn` the first
     * time a focus with `duplicates.length > 0` is observed, naming the
     * duplicates. Track the (treeId, focusId) pairs we've already
     * warned on so the warning fires once per unique focus per session.
     * Off-toggle cost is zero — the derivation gates on `consang`, which
     * only computes when consanguinity / debug-coi surfaces are on.
     */
    const _coiWarnedFor = new Set<string>();
    $effect(() => {
        const c = consang;
        if (!c || c.duplicates.length === 0) return;
        const key = `${tree.id}:${activeFocus}`;
        if (_coiWarnedFor.has(key)) return;
        _coiWarnedFor.add(key);
        // brief one-liner; full breakdown lives in the panel and the
        // __treeDebug handle. lowercase + no trailing period per repo style.
        console.warn(
            `coi: focus ${activeFocus} has ${String(c.duplicates.length)} duplicate ancestor${c.duplicates.length === 1 ? "" : "s"}: ${c.duplicates.join(", ")}`,
        );
    });

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

    // push the current debug subset (visible + rationale) up to the shell so
    // the debug panel can render the off-subset section inline in its column
    $effect(() => {
        onsubsetchange?.(debugSubset);
    });

    // Resize observer to keep host dims in sync and re-anchor pan so the
    // world-space point at the old viewport center stays centred after resize.
    $effect(() => {
        const el = hostEl;
        if (!el) return;
        const obs = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newW = entry.contentRect.width;
                const newH = entry.contentRect.height;
                // apply pan correction before updating dims so hostW/hostH
                // still hold the old values during the delta computation.
                // dividing by scale converts screen-space delta to canvas units.
                if (hostW > 0 && hostH > 0) {
                    panX += (newW - hostW) / (2 * scale);
                    panY += (newH - hostH) / (2 * scale);
                }
                hostW = newW;
                hostH = newH;
            }
        });
        // untrack prevents the initial synchronous observe() callback from
        // registering hostW/hostH/panX/panY/scale as reactive dependencies
        // of this effect — matching real-browser ResizeObserver semantics,
        // where the callback never fires synchronously during observe().
        untrack(() => obs.observe(el));
        return () => obs.disconnect();
    });

    /** Auto-fit on first paint, on layout changes that resize the chart,
     *  and whenever `activeFocus` shifts (so palette-jump / centerOnPerson
     *  always lands the new focus at the host's centre even when two
     *  subsets happen to share a bbox).
     *
     *  Suppressed when the user just clicked a `+` (expand-subtree) or a
     *  `+N Name` collapse-badge mid-session — those are user-driven
     *  expansions where the expected behaviour is to extend the canvas
     *  off-screen and keep the current zoom/pan, not yank the viewport.
     *  `suppressNextFit` is set in the expand handlers and consumed on
     *  the next fit-key change; `lastFitKey` still advances so a later
     *  unrelated layout shift doesn't accidentally fit on a stale key. */
    let hasInitialFit = false;
    let lastFitKey = "";
    let suppressNextFit = false;
    /** margin in screen-px: content must drift past this from a visible-band
     *  edge before the passive predicate decides a refit is needed. generous
     *  enough to absorb minor layout shifts; small enough that content near
     *  an edge still triggers a refit. */
    const FIT_SKIP_MARGIN = 60;
    /** passive guard: returns true when the content bbox (in screen-px) already
     *  sits inside the chrome-aware visible band with FIT_SKIP_MARGIN to spare.
     *  must be called inside untrack() to avoid subscribing to pan/zoom state. */
    function contentFitsInView(): boolean {
        if (hostW <= 0 || hostH <= 0) return false;
        const layoutWpx = layout.bbox.width * UNIT;
        const layoutHpx = layout.bbox.height * UNIT;
        if (layoutWpx <= 0 || layoutHpx <= 0) return false;
        const insets = measureCanvasChromeInsets(hostEl);
        // visible band edges (no padding — padding is a fit aesthetic, not a guard threshold)
        const visLeft = insets.left;
        const visTop = insets.top;
        const visRight = hostW - insets.right;
        const visBottom = hostH - insets.bottom;
        // content bbox in screen-px. family-view content starts at (0, minNodeY) in unit space.
        const miny = minNodeY(layout);
        const contentLeft = panX; // 0 * UNIT * scale + panX
        const contentTop = miny * UNIT * scale + panY;
        const contentRight = layout.bbox.width * UNIT * scale + panX;
        const contentBottom = (miny + layout.bbox.height) * UNIT * scale + panY;
        return (
            contentLeft >= visLeft - FIT_SKIP_MARGIN &&
            contentTop >= visTop - FIT_SKIP_MARGIN &&
            contentRight <= visRight + FIT_SKIP_MARGIN &&
            contentBottom <= visBottom + FIT_SKIP_MARGIN
        );
    }
    $effect(() => {
        const w = layout.bbox.width;
        const h = layout.bbox.height;
        if (hostW <= 0 || hostH <= 0) return;
        const key = `${tree.id}:${activeFocus}:${String(w.toFixed(3))}:${String(h.toFixed(3))}:${hostW}:${hostH}`;
        if (key === lastFitKey) return;
        lastFitKey = key;
        if (suppressNextFit) {
            suppressNextFit = false;
            return;
        }
        untrack(() => {
            if (hasInitialFit && contentFitsInView()) return;
            hasInitialFit = true;
            fitToView();
        });
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
        // family-view's bbox is the content span; ancestors can land
        // above y=0, so contentOriginY = minNodeY * UNIT. chrome insets
        // come from the canvas-host's data-canvas-chrome overlays
        // (bottom pills, debug panel, sheet-mode inspector) so the
        // fitted tree centres inside the visible viewport rather than
        // sliding underneath the chrome.
        const minY = minNodeY(layout);
        const insets = measureCanvasChromeInsets(hostEl);
        const fit = computeFit({
            contentWPx: layoutWpx,
            contentHPx: layoutHpx,
            contentOriginX: 0,
            contentOriginY: minY * UNIT,
            hostW,
            hostH,
            padding: 32,
            insets,
            minScale: MIN_SCALE,
            maxScale: MAX_SCALE,
        });
        scale = fit.scale;
        panX = fit.panX;
        panY = fit.panY;
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
    let dragStart:
        | {
              x: number;
              y: number;
              pX: number;
              pY: number;
              moved: boolean;
              // true when pointerdown landed on a card body (data-person-id)
              // rather than the empty canvas background. a no-drag pointerup
              // from a card body lets the card's own onclick fire naturally
              // (do not call ondeselect). a drag from a card body pans the
              // canvas and suppresses the post-drag click.
              onCard: boolean;
          }
        | undefined;

    function onPointerDown(e: PointerEvent): void {
        const target = e.target as HTMLElement | null;
        // explicit interactive controls consume the pointer entirely — no pan,
        // no deselect. the card body ([data-person-id]) is intentionally not in
        // this list: dragging from card body should pan; tapping it lets the
        // card's own onclick fire (which handles select/deselect).
        if (target?.closest("[data-expand-toggle]")) return;
        if (target?.closest("[data-badge-id]")) return;
        if (target?.closest("[data-union-picker]")) return;
        if (target?.closest("[data-add-toggle]")) return;
        // click outside any picker closes it
        if (pickerOpenFor !== null) pickerOpenFor = null;
        if (addOpenFor !== null) addOpenFor = null;
        // background-click focus: with roving-tabindex the host is
        // tabindex=-1, so the browser won't auto-focus it. focus it
        // programmatically on a background pointerdown so arrow-key
        // pan (which lives on the host's onkeydown) still works after
        // the user clicks empty canvas to deselect.
        hostEl?.focus({ preventScroll: true });
        const onCard = Boolean(target?.closest("[data-person-id]"));
        dragStart = { x: e.clientX, y: e.clientY, pX: panX, pY: panY, moved: false, onCard };
        // only capture when starting from the canvas background — capturing on
        // a card button would steal the card's own click after a no-drag tap.
        // card drags suppress the post-drag click in onPointerUp instead.
        if (!onCard) (e.target as Element).setPointerCapture?.(e.pointerId);
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
        const { moved: wasDrag, onCard } = dragStart;
        dragStart = undefined;
        if (wasDrag) {
            // suppress the click that would otherwise fire on the card after a pan
            const suppressNext = (ev: MouseEvent): void => {
                ev.stopPropagation();
                ev.preventDefault();
                window.removeEventListener("click", suppressNext, true);
            };
            window.addEventListener("click", suppressNext, true);
            return;
        }
        // no-drag tap: if we started on a card, the card's own onclick handles
        // it. if we started on empty canvas background, deselect.
        if (!onCard) ondeselect?.();
    }

    function onWheel(e: WheelEvent): void {
        e.preventDefault();
        // ctrl+wheel = trackpad pinch gesture in chrome/safari (larger deltas);
        // sensitivity is lower than mouse wheel to avoid snap-zooming. matches
        // TreeCanvas.onWheel so the two views feel consistent.
        const intensity = e.ctrlKey ? 0.0045 : 0.0018;
        const factor = Math.exp(-e.deltaY * intensity);
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

    /**
     * Arrow-keys pan the viewport when focus is on the canvas host;
     * shift+arrow goes 5x. Step is in host css px, matching the
     * drag-pan path (panX += dx). Escape clears selection.
     */
    function onHostKeyDown(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            ondeselect?.();
            return;
        }
        let dir: "up" | "down" | "left" | "right" | undefined;
        if (e.key === "ArrowRight") dir = "right";
        else if (e.key === "ArrowLeft") dir = "left";
        else if (e.key === "ArrowDown") dir = "down";
        else if (e.key === "ArrowUp") dir = "up";
        if (!dir) return;
        e.preventDefault();
        // arrow direction matches viewport motion (maps/figma convention) -
        // panX += step for right matches drag-pan where panX += dx
        const step = e.shiftKey ? PAN_KEY_STEP_PX * 5 : PAN_KEY_STEP_PX;
        if (dir === "right") panX += step;
        else if (dir === "left") panX -= step;
        else if (dir === "down") panY += step;
        else if (dir === "up") panY -= step;
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
        // Phase-3 family-view debug: tell App we attempted a recenter,
        // BEFORE the off-subset branch fires `focusOverride = id`. App's
        // watchdog cancellation depends on this firing for both the
        // happy-path (panX/Y settle) and the off-subset path (focus
        // shifts, fit-effect runs on the next tick).
        onrecenter?.(id);
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

    // Phase-3 family-view debug: green-flash on each App-bumped recenter
    // seq. We track the seq the canvas has reacted to so the overlay's
    // `data-flash-active` flips off after 250ms.
    let flashActive = $state(false);
    let lastFlashSeq = $state(0);
    $effect(() => {
        const seq = pendingRecenterSeq ?? 0;
        if (seq === lastFlashSeq) return;
        lastFlashSeq = seq;
        flashActive = true;
        const id = setTimeout(() => {
            flashActive = false;
        }, 250);
        return () => clearTimeout(id);
    });

    // Phase-3 family-view debug: derive the off-subset reason for the
    // selected person from the phase-1 rationale machinery. `null` when
    // there's no selection / the person is visible / no debug subset is
    // computed (debug overlay isn't mounted).
    let selectedOffSubsetReason = $derived.by<RejectionReason | "unknown" | null>(() => {
        if (selectedId === undefined) return null;
        if (layout.nodes.has(selectedId)) return null;
        const r = debugSubset?.rationale.get(selectedId);
        return r ?? "unknown";
    });

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
        // user-driven expand: keep current zoom/pan, let new branches
        // extend off-screen rather than refitting the viewport.
        if (on) suppressNextFit = true;
        expansion.setExpanded(id, on);
        expansionRev += 1;
    }

    function onPickerToggle(cardId: PersonId, e: MouseEvent): void {
        e.stopPropagation();
        pickerOpenFor = pickerOpenFor === cardId ? null : cardId;
    }

    function onPickerSelect(mateId: PersonId, coupleIndex: number, e: MouseEvent): void {
        suppressNextFit = true;
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
        suppressNextFit = true;
        secondaryUnionState.expand(mateId, coupleIndex);
        secondaryRev += 1;
        pickerOpenFor = null;
    }

    function onPickerHideAlongside(mateId: PersonId, coupleIndex: number, e: MouseEvent): void {
        e.stopPropagation();
        suppressNextFit = true;
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
        // user-driven expand via the `+N Name` collapse-badge: same
        // contract as `onExpandClick(on=true)` - hold zoom/pan steady.
        suppressNextFit = true;
        // Re-expand: mark the source as explicitly expanded so the auto-
        // collapse pass doesn't immediately re-demote it.
        expansion.setExpanded(badge.sourceId, true);
        expansionRev += 1;
    }

    function nodes(): readonly FamilyViewNode[] {
        return Array.from(layout.nodes.values());
    }

    /**
     * Roving-tabindex anchor for family-view. With no person selected,
     * one visible card (preferring `activeFocus`, falling back to the
     * first visible node) carries tabindex=0 so Tab from outside lands
     * on it. With a selection, the selected card owns the tab-stop and
     * this is undefined. Only one card per canvas should ever be
     * `selected || isFirstFocusable` at a time.
     */
    let firstFocusableId = $derived.by<PersonId | undefined>(() => {
        if (selectedId) return undefined;
        if (layout.nodes.has(activeFocus)) return activeFocus;
        const first = layout.nodes.keys().next();
        return first.done ? undefined : first.value;
    });

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

    /**
     * Phase 1 of the family-view-debug plan: classify an edge by its
     * structural role for the `showEdgeRoles` debug toggle. The id prefix
     * scheme is established by `emitAnchorsAndEdges` in `layout.ts` (`bond:`,
     * `stem:`, `bus:`, `stub:`, `drop:`, `manifold`). Returning a stable
     * lowercase token lets both the data-attr and the `family-view-edge-
     * role-*` class hook into the same vocabulary.
     *
     *   - `couple-bond` — horizontal bond between two partners (2-couple).
     *   - `parent-drop` — vertical stem from couple-midpoint down to the
     *     sibling bus.
     *   - `sibling-bus` — horizontal bus across the children's row.
     *   - `child-drop` — per-child stub vertical between bus and card.
     *   - `solo-drop` — single-parent drop with no bus.
     *   - `n-partner-bus` — bar segments of an n>2 union manifold.
     *   - `n-partner-drop` — child drop from an n>2 union's childAnchor.
     *   - `badge-drop` — drop from a card to its auto-collapsed badge.
     *   - `other` — fallback; should not appear in a healthy layout.
     */
    function edgeKindFor(id: string): string {
        if (id.startsWith("bond:")) return "couple-bond";
        if (id.startsWith("stem:")) return "parent-drop";
        if (id.startsWith("bus:")) return "sibling-bus";
        if (id.startsWith("stub:")) return "child-drop";
        if (id.startsWith("drop:badge:")) return "badge-drop";
        if (id.startsWith("drop:union:solo:")) return "solo-drop";
        if (id.includes("/manifold/")) return "n-partner-bus";
        if (id.startsWith("drop:union:")) return "n-partner-drop";
        if (id.startsWith("drop:")) return "solo-drop";
        return "other";
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
        // base off-path stroke-width: bumped from stroke-1 (1px) to 1.5px so
        // edges stay legible against shrunken cards at low zoom (~25-50%).
        // strokes carry vector-effect="non-scaling-stroke" so the nominal
        // width holds in screen-px; the on-path bucket already sits at
        // --fte-on-path-stroke-width (2.5) and is left alone.
        if (!hasPath) {
            return e.role === "married"
                ? "stroke-rose-400/70 stroke-[1.5]"
                : e.role === "divorced"
                  ? "stroke-rose-400/40 stroke-[1.5]"
                  : "stroke-fg-muted/70 stroke-[1.5]";
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
        // off-path while a path is active: dim.
        return e.role === "married"
            ? "stroke-rose-400/25 stroke-[1.5]"
            : e.role === "divorced"
              ? "stroke-rose-400/15 stroke-[1.5]"
              : "stroke-fg-muted/25 stroke-[1.5]";
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
        // Bond edges require BOTH endpoints on-path — "any" would light up
        // a spouse's other unions whenever just one member is on-path.
        if (e.id.startsWith("bond:")) return e.persons.every((id) => pathHl.onPath(id));
        // Stem + bus + single-parent drops: any-implicated-on-path
        // matches the legacy pre-phase-2 behaviour the user remembers.
        return onPath.length > 0;
    }

    function cardOnPath(id: PersonId): boolean {
        // exclude the activeFocus card: it is the path endpoint (and the layout
        // anchor), not an intermediate node. applying family-view-onpath to the
        // focus produces a persistent outer ring on the root card that competes
        // with the selection ring and never clears until all cards are deselected.
        if (id === activeFocus) return false;
        return pathHl.onPath(id);
    }

    function isBadgeOnPath(b: BadgeNode): boolean {
        return badgeOnPath(b, pathHl.pathSet);
    }

    function badgeTitle(badge: BadgeNode): string {
        const names = badge.members
            .slice(0, 2)
            .map((id) => tree.people[id]?.given ?? "?")
            .filter(Boolean);
        const rest = badge.members.length - names.length;
        const nameStr = rest > 0 ? `${names.join(", ")}, +${rest} more` : names.join(", ");
        return `expand hidden: ${nameStr}`;
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

<!-- role="tree" + roving-tabindex on PersonNode is the canonical pattern
     for a tree-shaped interactive widget. the underlying graph is a DAG
     (multi-parent, cycles, asexual reproduction are all in scope per the
     permissive schema), but family-view itself renders a bounded tree-
     shaped window around the focus with single-anchor stems, so role="tree"
     reads more accurately to AT users than role="group". host carries
     tabindex=-1 so Tab from outside lands on the active treeitem inside
     rather than a wrapping focus stop; a background pointerdown still
     forwards focus to the host so arrow-key pan keeps working after the
     user clicks empty canvas to deselect. -->
<div
    bind:this={hostEl}
    class="family-view-canvas bg-canvas relative z-0 h-full w-full overflow-clip"
    role="tree"
    aria-label="family view canvas"
    tabindex="-1"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onwheel={onWheel}
    onkeydown={onHostKeyDown}
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
                    class="family-view-edge fill-none {edgeClass(edge)} {debugOptions?.layers
                        .showEdgeRoles
                        ? `family-view-edge-role-${edgeKindFor(edge.id)}`
                        : ''}"
                    data-edge-id={edge.id}
                    data-edge-role={edgeKindFor(edge.id)}
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

        {#if debugOptions}
            <FamilyViewDebugOverlay
                {layout}
                layers={debugOptions.layers}
                unit={UNIT}
                {tree}
                expandedSecondaryUnions={debugExpandedSecondaryUnions}
                primaryUnionOverrides={debugPrimaryUnionOverrides}
                {selectedId}
                offSubsetReason={selectedOffSubsetReason}
                {recenterMissedFor}
                {flashActive}
                viewportRectUnit={debugViewportRectUnit}
                focusEvents={focusEventsForOverlay}
                coiBreakdown={consang?.breakdown}
                coiRaw={consang?.coi}
                coiDisplayed={coiPercent(consang?.coi)}
                coiDuplicateIds={consang?.duplicates}
                coiFocusId={activeFocus}
                {lastEditedId}
                {layoutDurationMs}
                treePeopleCount={Object.keys(tree.people).length}
                expansionStateSize={debugExpansionStateSize}
            />
        {/if}

        {#each nodes() as node (node.personId)}
            {@const person = tree.people[node.personId]}
            {#if person}
                <div
                    transition:fade={{ duration: fadeDuration }}
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
                    style:z-index={pickerOpenFor === node.personId ? 50 : undefined}
                >
                    <PersonNode
                        {person}
                        selected={selectedId === person.id}
                        isFirstFocusable={person.id === firstFocusableId}
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
                    {#if showConsanguinity && (coiForCard(node.personId) ?? 0) > COI_DISPLAY_THRESHOLD}
                        <span
                            class="border-line bg-canvas-elev/90
                                   pointer-events-none absolute -bottom-2 -right-2 z-20
                                   rounded-full border px-1.5 font-mono text-[10px]
                                   leading-tight shadow-sm"
                            style:color="hsl(0 70% 45%)"
                            data-consang-coi={coiBadge(coiForCard(node.personId))}
                            title={`coefficient of inbreeding ${coiBadge(coiForCard(node.personId))}`}
                            aria-label="coefficient of inbreeding"
                            >COI {coiBadge(coiForCard(node.personId))}</span
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
                                class="border-line bg-canvas-elev absolute top-full right-0 z-50 mt-1
                                       min-w-48 rounded border py-1 text-xs shadow-lg"
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
                transition:fade={{ duration: fadeDuration }}
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
                aria-label={badgeTitle(badge)}
                title={badgeTitle(badge)}
                onclick={(e) => onBadgeClick(badge, e)}
            >
                <span class="text-accent font-semibold">+{badge.members.length}</span>
                <span class="text-fg-muted truncate text-[10px]">{badge.sampleName}</span>
            </button>
        {/each}
    </div>
</div>

<style>
    /* phase 1 of family-view-debug plan: per-role edge tints. only active
       when `showEdgeRoles` is on (the FamilyViewCanvas template gates the
       class application on `debugOptions?.layers.showEdgeRoles`). each
       role gets a distinct hue so a visual scan can disambiguate the bus
       from a drop without consulting devtools. !important wins over the
       tailwind stroke utilities applied by `edgeClass` so the debug tint
       doesn't fight the production palette. */
    :global(.family-view-edge-role-couple-bond) {
        stroke: hsl(330 80% 55%) !important;
    }
    :global(.family-view-edge-role-parent-drop) {
        stroke: hsl(200 80% 55%) !important;
    }
    :global(.family-view-edge-role-sibling-bus) {
        stroke: hsl(35 90% 50%) !important;
    }
    :global(.family-view-edge-role-child-drop) {
        stroke: hsl(140 60% 45%) !important;
    }
    :global(.family-view-edge-role-solo-drop) {
        stroke: hsl(280 60% 55%) !important;
    }
    :global(.family-view-edge-role-n-partner-bus) {
        stroke: hsl(15 80% 50%) !important;
    }
    :global(.family-view-edge-role-n-partner-drop) {
        stroke: hsl(95 60% 45%) !important;
    }
    :global(.family-view-edge-role-badge-drop) {
        stroke: hsl(0 0% 50%) !important;
    }
    :global(.family-view-edge-role-other) {
        stroke: hsl(60 80% 50%) !important;
    }
</style>
