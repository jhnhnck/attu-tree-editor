<!--
    FamilyTreeEditor - family-view debug overlay.

    Sibling to `DebugOverlay.svelte` but works off `FamilyViewLayout`
    instead of the layered placedGraph. Each phase of the family-view
    debug plan adds layers inside its own `{#if}` block so off-toggles
    cost zero.

    Phase 0 walking skeleton:
      - `showVisibleSubset` — dashed rect around the laid-out cards.

    Phase 1 connectivity overlays:
      - `showOrphanBadge` — red dashed ring on every visible person
        whose in+out edge count is zero (floating-people canary).
      - `showOffSubsetPeople` — fixed-position side panel listing every
        person not in `subset.visible`, grouped by rejection reason.
      - `showSecondaryUnionState` — pill near each card showing its
        primary/secondary-union state and the total union count.

    `showEdgeRoles` lives on the edges themselves (FamilyViewCanvas
    applies a per-role stroke class) so this overlay doesn't render
    anything for that toggle — but the toggle is still owned by this
    file's `FamilyViewDebugLayerOptions` type.

    Phase 2 multi-union geometry:
      - `showMultiUnionManifold` — for every visible UnionAnchor with
        `partnerIds.length > 2`, draws an emphasis polyline on the bus
        (recomputed from the same `computeManifold` primitive `layout.ts`
        used), a hollow ring on the manifold's child anchor, a small
        circle on each partner's connection point, and a label with the
        union index. on top of the role-tinted edges from phase 1.
      - `showCardCollisions` — same-rank cards whose bounding rects
        overlap get a red dashed rect around the intersection. parity-
        in-spirit with the layered `showOverlapPairs`. independent of
        the bus overlays because card overlap is a sibling problem
        (n>2-partner row width, sibling-bus through cards, etc.).
      - `showCoupleCentroidDelta` — for each 2-partner anchor, draws
        a thin line between the bond midpoint and the centroid of the
        anchor's children's x-coordinates, plus a numeric label of the
        x-axis delta in unit space.
      - `showRankGutterLabels` — `g{-2..+2}` labels at the left margin
        of the canvas at each rank's bus y. anchors the rank addressing
        for cross-referencing the per-anchor overlays above.

    The overlay mounts inside `FamilyViewCanvas`'s pan/zoom wrapper, so
    coordinates are in unit space and `vector-effect="non-scaling-stroke"`
    keeps stroke widths visually constant across the zoom range.

    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { untrack } from "svelte";
    import { Bug } from "@lucide/svelte";
    import { PERSON_W } from "$lib/layout/constants";
    import type { FamilyViewLayout, UnionAnchor } from "$lib/layout/engines/family-view";
    import { CARD_H } from "$lib/layout/engines/family-view";
    import type { RejectionReason } from "$lib/layout/engines/family-view";
    import {
        computeManifold,
        PRIMARY_PRIMITIVE,
    } from "$lib/layout/engines/family-view/nPartnerGeometry";
    import type { FamilyViewDebugLayerOptions } from "$lib/components/tree/debugTypes";
    import type { CoiBreakdownRow } from "$lib/domain/consanguinity";
    import type { PersonId, Tree } from "$lib/domain/types";
    import { dockStore, DockItem, DockWindow } from "@attu/ui";

    interface Props {
        layout: FamilyViewLayout;
        layers: FamilyViewDebugLayerOptions;
        /** pixels per unit; passed by FamilyViewCanvas so geometry stays consistent. */
        unit: number;
        /** phase 1: source-of-truth tree for naming off-subset people + secondary-union pills. */
        tree?: Tree | undefined;
        // rationale prop dropped — the off-subset list moved to App.svelte
        // which reads `RankedSubset.rationale` directly from the
        // `onsubsetchange` callback. the per-card `offSubsetReason` (below)
        // still flows through for the "selected off-subset" warning chip.
        /** phase 1: per-person expanded-secondary-union map for the state pill. */
        expandedSecondaryUnions?: ReadonlyMap<PersonId, ReadonlySet<number>> | undefined;
        /** phase 1: per-person primary-union override → coupleIndex. */
        primaryUnionOverrides?: ReadonlyMap<PersonId, number> | undefined;
        /** phase 3: currently-selected person id (for off-subset warning + viewport-fit target). */
        selectedId?: PersonId | undefined;
        /** phase 3: when set, the selection is OFF the visible subset; this is the rejection reason. */
        offSubsetReason?: RejectionReason | "unknown" | null;
        /** phase 3: when set, the 200ms watchdog fired without an `onrecenter`. */
        recenterMissedFor?: PersonId | undefined;
        /** phase 3: green-flash trigger, mirrors the canvas's local state so this overlay can pulse the border. */
        flashActive?: boolean;
        /** phase 3: viewport rect in unit space + the canvas host dims, used to paint the viewport rect overlay. */
        viewportRectUnit?:
            | { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
            | undefined;
        /** phase 3: rolling focus-event log, newest first. */
        focusEvents?:
            | ReadonlyArray<{
                  readonly seq: number;
                  readonly ts: number;
                  readonly source: string;
                  readonly personId: PersonId | undefined;
                  readonly requestedRecenter: boolean;
                  readonly didTriggerCenterOn: boolean;
              }>
            | undefined;
        /** phase 4 coi inspector: per-pair wright contribution rows. undefined when no consanguinity. */
        coiBreakdown?: readonly CoiBreakdownRow[] | undefined;
        /** phase 4: raw float coi for the active focus, 0..1. undefined when no consanguinity. */
        coiRaw?: number | undefined;
        /** phase 4: rounded percent string that the production COI badge would render. */
        coiDisplayed?: string | undefined;
        /** phase 4: duplicate-ancestor person ids; drives the halo overlay. */
        coiDuplicateIds?: readonly PersonId[] | undefined;
        /** phase 4: active focus id, surfaced in the breakdown panel header. */
        coiFocusId?: PersonId | undefined;
        /** phase 5: most recently mutated person id; drives `showLastEditHalo`. */
        lastEditedId?: PersonId | undefined;
        /** phase 5: most recent layout pass duration in ms; drives `showLayoutMetrics`. */
        layoutDurationMs?: number | undefined;
        /** phase 5: total people count, surfaced in the layout-metrics readout. */
        treePeopleCount?: number | undefined;
        /** phase 5: expansion-state size (number of person ids with at least one expanded child set). */
        expansionStateSize?: number | undefined;
        /** dock corner for registering debug panels */
        corner: "bl" | "tl" | "tr" | "br";
    }

    let {
        layout,
        layers,
        unit,
        tree,
        expandedSecondaryUnions,
        primaryUnionOverrides,
        selectedId,
        offSubsetReason,
        recenterMissedFor,
        flashActive,
        viewportRectUnit,
        focusEvents,
        coiBreakdown,
        coiRaw,
        coiDisplayed,
        coiDuplicateIds,
        coiFocusId,
        lastEditedId,
        layoutDurationMs,
        treePeopleCount,
        expansionStateSize,
        corner,
    }: Props = $props();

    /**
     * every panel's expand state is owned by dockStore — `dockStore.isExpanded(id)`
     * is the single source of truth and `toggleExpanded(id)` the only mutator.
     * the old local `collapsed` record and the `offSubsetExpanded` /
     * `recenterMissedExpanded` flags are gone.
     */

    /**
     * badge salience via auto-expand-on-appear: the off-subset and recenter-missed
     * badges re-expand every time their trigger flips from undefined to defined.
     * user can minimize the window mid-event; the next undefined → defined
     * transition re-expands. wrapped in `untrack` so reading dockStore's reactive
     * sets inside setExpanded doesn't add them to this effect's dep set.
     */
    let prevOffSubsetActive = false;
    $effect(() => {
        const active = selectedId !== undefined && offSubsetReason != null;
        if (active && !prevOffSubsetActive) {
            untrack(() => dockStore.setExpanded("family-view-debug-off-subset-warning", true));
        }
        prevOffSubsetActive = active;
    });

    let prevRecenterMissedActive = false;
    $effect(() => {
        const active = recenterMissedFor !== undefined;
        if (active && !prevRecenterMissedActive) {
            untrack(() => dockStore.setExpanded("family-view-debug-recenter-missed", true));
        }
        prevRecenterMissedActive = active;
    });

    /**
     * Combined bbox of every visible card (nodes + badges). Different from
     * `layout.bbox` because the latter is the engine's reported canvas
     * extent; the visible-subset overlay specifically wants the rect that
     * tightly hugs the cards so the user can see at a glance which cards
     * the bounded subset selected. Empty layouts return a zero-rect.
     */
    let cardsBBox = $derived.by(() => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const node of layout.nodes.values()) {
            const h = node.h ?? CARD_H;
            if (node.x < minX) minX = node.x;
            if (node.y < minY) minY = node.y;
            if (node.x + PERSON_W > maxX) maxX = node.x + PERSON_W;
            if (node.y + h > maxY) maxY = node.y + h;
        }
        for (const badge of layout.badges) {
            // badges share the card slot width / height for layout
            // purposes; the visible-subset rect doesn't need pixel-exact
            // bounds, just a fence around everything the engine placed.
            if (badge.x < minX) minX = badge.x;
            if (badge.y < minY) minY = badge.y;
            if (badge.x + PERSON_W > maxX) maxX = badge.x + PERSON_W;
            if (badge.y + CARD_H > maxY) maxY = badge.y + CARD_H;
        }
        if (!Number.isFinite(minX)) {
            return { x: 0, y: 0, w: 0, h: 0 };
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    });

    /**
     * Phase 1: per-person `in + out` edge counts derived from `layout.edges`.
     * An edge "touches" a person when their id appears anywhere in
     * `edge.persons`. The map keys cover every visible person; persons not
     * implicated in any edge have an explicit zero so the orphan-badge
     * check is a single map lookup.
     */
    let edgeCountByPerson = $derived.by(() => {
        const out = new Map<PersonId, number>();
        for (const id of layout.nodes.keys()) out.set(id, 0);
        for (const edge of layout.edges) {
            for (const pid of edge.persons) {
                if (!out.has(pid)) continue;
                out.set(pid, (out.get(pid) ?? 0) + 1);
            }
        }
        return out;
    });

    /**
     * Phase 1: orphan list = every visible person whose `edgeCountByPerson`
     * entry is zero. Renders a small red dashed ring around each.
     */
    let orphanIds = $derived.by(() => {
        const out: PersonId[] = [];
        for (const [id, count] of edgeCountByPerson) {
            if (count === 0) out.push(id);
        }
        return out;
    });

    /**
     * off-subset list grouping moved to App.svelte where the inline
     * debug-menu section consumes the `RankedSubset.rationale` directly
     * via the `onsubsetchange` callback.
     */

    function nameOf(pid: PersonId): string {
        const p = tree?.people[pid];
        if (!p) return pid;
        const name = `${p.given} ${p.surname}`.trim();
        return name.length > 0 ? name : pid;
    }

    /**
     * Phase 1 helper for the secondary-union pill. For a visible person,
     * count their unions, find their primary, and list the indices the
     * user has expanded as secondaries. Returns null when the person has
     * 0 unions (nothing meaningful to show).
     */
    function unionsFor(pid: PersonId): {
        readonly total: number;
        readonly primaryIndex: number | undefined;
        readonly expanded: readonly number[];
    } | null {
        if (!tree) return null;
        const myCouples: number[] = [];
        for (let ci = 0; ci < tree.couples.length; ci += 1) {
            const c = tree.couples[ci];
            if (!c) continue;
            if (c.leftId === pid || c.rightId === pid) myCouples.push(ci);
        }
        if (myCouples.length === 0) return null;
        // primary = override if present, else the first union flagged
        // `isPrimary`, else the lowest index.
        const overrideIdx = primaryUnionOverrides?.get(pid);
        let primaryIndex: number | undefined;
        if (overrideIdx !== undefined && myCouples.includes(overrideIdx)) {
            primaryIndex = overrideIdx;
        } else {
            const flagged = myCouples.find((ci) => tree.couples[ci]?.isPrimary === true);
            primaryIndex = flagged ?? myCouples[0];
        }
        const expanded = Array.from(expandedSecondaryUnions?.get(pid) ?? []).sort((a, b) => a - b);
        return { total: myCouples.length, primaryIndex, expanded };
    }

    /**
     * Phase 2 helper: recompute the manifold geometry for an n>2-partner
     * anchor from the layout's node positions. Mirrors what `layout.ts`
     * fed to the `computeManifold` call for the same anchor, so the
     * overlay's child-anchor + bus polyline exactly track what the
     * renderer drew. Returns null when not all partners are placed or
     * when this isn't a multi-partner union.
     */
    function manifoldFor(anchor: UnionAnchor): {
        readonly partners: readonly {
            readonly personId: PersonId;
            readonly x: number;
            readonly y: number;
        }[];
        readonly busY: number;
        readonly childAnchor: { readonly x: number; readonly y: number };
        readonly busMinX: number;
        readonly busMaxX: number;
    } | null {
        if (anchor.partnerIds.length <= 2) return null;
        const nodes = anchor.partnerIds
            .map((pid) => layout.nodes.get(pid))
            .filter((n): n is NonNullable<typeof n> => n !== undefined);
        if (nodes.length !== anchor.partnerIds.length) return null;
        const busY = nodes[0]!.y + (nodes[0]!.h ?? CARD_H) / 2;
        const partners = nodes.map((n) => ({
            personId: n.personId,
            x: n.x + PERSON_W / 2,
            y: busY,
        }));
        const manifold = computeManifold(PRIMARY_PRIMITIVE, partners);
        const xs = partners.map((p) => p.x);
        return {
            partners,
            busY,
            childAnchor: manifold.childAnchor,
            busMinX: Math.min(...xs),
            busMaxX: Math.max(...xs),
        };
    }

    /**
     * Phase 2: visible multi-partner unions with their manifold geometry.
     * Filters out anchors whose partners aren't all placed (e.g. mid-
     * collapse transitions) so the overlay never points at thin air.
     */
    let multiUnionManifolds = $derived.by(() => {
        const out: {
            readonly anchor: UnionAnchor;
            readonly manifold: NonNullable<ReturnType<typeof manifoldFor>>;
        }[] = [];
        for (const anchor of layout.anchors) {
            const m = manifoldFor(anchor);
            if (m) out.push({ anchor, manifold: m });
        }
        return out;
    });

    /**
     * Phase 2: pairs of visible cards on the same rank whose horizontal
     * extents overlap. Cards in family-view all share the same fixed
     * `PERSON_W`, so the only collision dimension is x (and y is shared
     * by virtue of being on the same rank). Includes badges so a badge
     * that lands in a card slot is also flagged.
     */
    let cardCollisions = $derived.by(() => {
        type Box = {
            readonly id: string;
            readonly rank: number;
            readonly x: number;
            readonly y: number;
            readonly w: number;
            readonly h: number;
        };
        const boxes: Box[] = [];
        for (const node of layout.nodes.values()) {
            boxes.push({
                id: node.personId,
                rank: node.rank,
                x: node.x,
                y: node.y,
                w: PERSON_W,
                h: node.h ?? CARD_H,
            });
        }
        for (const badge of layout.badges) {
            boxes.push({
                id: badge.id,
                rank: badge.rank,
                x: badge.x,
                y: badge.y,
                w: PERSON_W,
                h: CARD_H,
            });
        }
        // group by rank, scan O(n^2) pairs per rank. tree sizes are
        // bounded for family-view; this is fine off the hot path.
        const byRank = new Map<number, Box[]>();
        for (const b of boxes) {
            const list = byRank.get(b.rank) ?? [];
            list.push(b);
            byRank.set(b.rank, list);
        }
        const out: {
            readonly a: Box;
            readonly b: Box;
            readonly rect: { x: number; y: number; w: number; h: number };
        }[] = [];
        for (const rankBoxes of byRank.values()) {
            for (let i = 0; i < rankBoxes.length; i += 1) {
                for (let j = i + 1; j < rankBoxes.length; j += 1) {
                    const a = rankBoxes[i]!;
                    const b = rankBoxes[j]!;
                    const x0 = Math.max(a.x, b.x);
                    const y0 = Math.max(a.y, b.y);
                    const x1 = Math.min(a.x + a.w, b.x + b.w);
                    const y1 = Math.min(a.y + a.h, b.y + b.h);
                    // a small epsilon avoids flagging cards that share an
                    // edge exactly (touching, not overlapping); the family-
                    // view layout's slot stepper places cards edge-to-edge
                    // intentionally for tight rows.
                    const EPS = 0.001;
                    if (x1 - x0 > EPS && y1 - y0 > EPS) {
                        out.push({
                            a,
                            b,
                            rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
                        });
                    }
                }
            }
        }
        return out;
    });

    /**
     * Phase 2: per 2-partner anchor, the |delta| between the bond
     * midpoint and the children's x-centroid. surfaces the layered
     * engine's `showBondCentroidDelta` story for family-view: a
     * healthy couple sits centered above its kids' x-range. non-zero
     * delta is the visible signature of a positioning skew.
     */
    let coupleCentroidDeltas = $derived.by(() => {
        const out: {
            readonly anchorId: string;
            readonly bond: { readonly x: number; readonly y: number };
            readonly centroid: { readonly x: number; readonly y: number };
            readonly delta: number;
        }[] = [];
        for (const anchor of layout.anchors) {
            if (anchor.partnerIds.length !== 2) continue;
            if (anchor.childIds.length === 0) continue;
            const [aId, bId] = anchor.partnerIds as readonly [PersonId, PersonId];
            const a = layout.nodes.get(aId);
            const b = layout.nodes.get(bId);
            if (!a || !b) continue;
            const bondX = (a.x + b.x) / 2 + PERSON_W / 2;
            const bondY = (a.y + (a.h ?? CARD_H) / 2 + (b.y + (b.h ?? CARD_H) / 2)) / 2;
            let cx = 0;
            let count = 0;
            let cy = 0;
            for (const cid of anchor.childIds) {
                const c = layout.nodes.get(cid);
                if (!c) continue;
                cx += c.x + PERSON_W / 2;
                cy += c.y;
                count += 1;
            }
            if (count === 0) continue;
            const centroid = { x: cx / count, y: cy / count };
            out.push({
                anchorId: anchor.id,
                bond: { x: bondX, y: bondY },
                centroid,
                delta: centroid.x - bondX,
            });
        }
        return out;
    });

    /**
     * Phase 2: rank labels. derive each rank's bus y from the first
     * node's center y, since the rank-y is otherwise opaque to the
     * overlay (row geometry is hidden inside layout.ts). Tracks every
     * rank that has at least one visible card or badge; labels render
     * at x=0 so a viewport pan parks them just past the left edge.
     */
    let rankLabels = $derived.by(() => {
        const byRank = new Map<number, { sumY: number; count: number }>();
        for (const node of layout.nodes.values()) {
            const slot = byRank.get(node.rank) ?? { sumY: 0, count: 0 };
            slot.sumY += node.y + (node.h ?? CARD_H) / 2;
            slot.count += 1;
            byRank.set(node.rank, slot);
        }
        for (const badge of layout.badges) {
            const slot = byRank.get(badge.rank) ?? { sumY: 0, count: 0 };
            slot.sumY += badge.y + CARD_H / 2;
            slot.count += 1;
            byRank.set(badge.rank, slot);
        }
        const out: { readonly rank: number; readonly y: number; readonly label: string }[] = [];
        for (const [rank, slot] of byRank) {
            if (slot.count === 0) continue;
            const label = rank === 0 ? "g0" : rank > 0 ? `g+${String(rank)}` : `g${String(rank)}`;
            out.push({ rank, y: slot.sumY / slot.count, label });
        }
        out.sort((a, b) => a.rank - b.rank);
        return out;
    });

    /**
     * One-glyph pretty-name for a `RejectionReason`. Keeps the panel
     * narrow without losing the meaning; the full reason still renders in
     * the section header underneath.
     */
    function reasonLabel(r: RejectionReason): string {
        switch (r) {
            case "rank-cutoff":
                return "rank cutoff";
            case "non-primary-partner":
                return "non-primary partner";
            case "secondary-union-not-expanded":
                return "secondary not expanded";
            case "auto-collapsed":
                return "auto collapsed";
            case "unreachable":
                return "unreachable";
        }
    }

    /**
     * Phase 3: target person's expected bbox in unit space, or `null`
     * when there's no selection / the selected person isn't currently
     * laid out. `showViewportFitTarget` uses this to paint the target
     * rect alongside the viewport rect so off-screen selections are
     * visually obvious.
     */
    let targetRect = $derived.by(() => {
        if (selectedId === undefined) return null;
        const n = layout.nodes.get(selectedId);
        if (!n) return null;
        return { x: n.x, y: n.y, w: PERSON_W, h: n.h ?? CARD_H };
    });

    /** Phase 3: HH:MM:SS.mmm for the focus-event log. Hours dropped to keep the row tight. */
    function fmtClock(ts: number): string {
        const d = new Date(ts);
        const mm = d.getMinutes().toString().padStart(2, "0");
        const ss = d.getSeconds().toString().padStart(2, "0");
        const ms = d.getMilliseconds().toString().padStart(3, "0");
        return `${mm}:${ss}.${ms}`;
    }

    function nameOfOrDash(pid: PersonId | undefined): string {
        if (pid === undefined) return "—";
        return nameOf(pid);
    }

    /**
     * Phase 4: per-duplicate-ancestor halo geometry. Filters to currently-
     * visible cards — a duplicate ancestor offscreen has nothing to ring.
     * Uses a wider stroke + larger inset than the production tint so the
     * debug halo is visually distinct from the focus ring + the
     * `data-consang-duplicate` box-shadow.
     */
    let coiDuplicateHalos = $derived.by(() => {
        if (!coiDuplicateIds || coiDuplicateIds.length === 0) return [];
        const out: {
            readonly personId: PersonId;
            readonly x: number;
            readonly y: number;
            readonly w: number;
            readonly h: number;
        }[] = [];
        for (const pid of coiDuplicateIds) {
            const n = layout.nodes.get(pid);
            if (!n) continue;
            const h = n.h ?? CARD_H;
            out.push({
                personId: pid,
                x: n.x - 0.12,
                y: n.y - 0.12,
                w: PERSON_W + 0.24,
                h: h + 0.24,
            });
        }
        return out;
    });

    /** Phase 4: breakdown sum — should match `coiRaw` to within float drift. */
    let coiBreakdownSum = $derived.by(() => {
        if (!coiBreakdown || coiBreakdown.length === 0) return 0;
        let s = 0;
        for (const row of coiBreakdown) s += row.contribution;
        return s;
    });

    /** Phase 4: short formatter for breakdown contribution column (textbook precision). */
    function fmtContribution(c: number): string {
        // (1/2)^k values land at clean negative powers of two; toString
        // shows them as 0.125, 0.0625, etc. fall back to toPrecision for
        // multi-path inflation cases where the sum is not a clean power.
        if (c === 0) return "0";
        if (c >= 0.0001) return c.toString();
        return c.toPrecision(2);
    }

    /**
     * Phase 5: position of the last-edited card in unit space, or `null`
     * when there is no last edit or the edited person isn't laid out
     * (off-subset / different focus). Drives the yellow 1s halo.
     */
    let lastEditPos = $derived.by(() => {
        if (lastEditedId === undefined) return null;
        const n = layout.nodes.get(lastEditedId);
        if (!n) return null;
        const h = n.h ?? CARD_H;
        return { id: lastEditedId, x: n.x + PERSON_W / 2, y: n.y + h / 2, h };
    });

    /**
     * Phase 5 fix: monotonically incrementing counter bumped on every
     * `lastEditedId` change. the halo key is `${id}-${editSeq}` so
     * consecutive saves to the same person produce a distinct key,
     * forcing svelte to remount the circle and replay the css fade.
     *
     * `untrack` wraps the increment so svelte does not register `editSeq`
     * as a dependency of this effect (the `+=` read would otherwise create
     * a self-referential loop: effect writes editSeq → editSeq change
     * re-fires effect → loop). only `lastEditedId` is the trigger.
     */
    let editSeq = $state(0);
    $effect(() => {
        // reading lastEditedId registers it as the sole dependency
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        lastEditedId;
        untrack(() => {
            editSeq += 1;
        });
    });

    /**
     * Phase 5: grid bounds in unit space. Pads one unit past the cards'
     * bbox in every direction so the grid extends visibly beyond the
     * layout fence. Defaults to a 10-unit square when there are no cards
     * (e.g. empty tree). Drives `showGrid`.
     */
    let gridBounds = $derived.by(() => {
        if (cardsBBox.w === 0 || cardsBBox.h === 0) {
            return { x0: 0, y0: 0, x1: 10, y1: 10 };
        }
        const pad = 1;
        return {
            x0: Math.floor(cardsBBox.x - pad),
            y0: Math.floor(cardsBBox.y - pad),
            x1: Math.ceil(cardsBBox.x + cardsBBox.w + pad),
            y1: Math.ceil(cardsBBox.y + cardsBBox.h + pad),
        };
    });

    /**
     * Phase 5: rank distribution for the layout-metrics readout. Counts
     * visible nodes per rank (badges excluded — the user wants to see
     * "how many real cards landed on each row", not the placeholder
     * badges). Sorted by rank ascending so g-N rows render first.
     */
    let rankDistribution = $derived.by(() => {
        const byRank = new Map<number, number>();
        for (const node of layout.nodes.values()) {
            byRank.set(node.rank, (byRank.get(node.rank) ?? 0) + 1);
        }
        const out: { readonly rank: number; readonly count: number }[] = [];
        for (const [rank, count] of byRank) out.push({ rank, count });
        out.sort((a, b) => a.rank - b.rank);
        return out;
    });

    /** Phase 5: short formatter for the layout-duration cell. */
    function fmtMs(ms: number | undefined): string {
        if (ms === undefined) return "—";
        if (ms < 1) return `${ms.toFixed(2)} ms`;
        if (ms < 10) return `${ms.toFixed(1)} ms`;
        return `${Math.round(ms).toString()} ms`;
    }

    /** Phase 5: short rank label for the distribution readout. */
    function fmtRank(r: number): string {
        if (r === 0) return "g0";
        return r > 0 ? `g+${String(r)}` : `g${String(r)}`;
    }
</script>

<!-- the overlay lives inside the same scaled wrapper as the cards, so
     coordinates are in unit space; non-scaling-stroke keeps the dash
     pattern visually constant across the zoom range. pointer-events
     stay off so the overlay never intercepts card clicks. -->
<svg
    class="family-view-debug-overlay pointer-events-none absolute"
    style:left="0"
    style:top="0"
    style:overflow="visible"
    width={layout.bbox.width * unit}
    height={layout.bbox.height * unit}
    aria-hidden="true"
    data-testid="family-view-debug-overlay"
>
    {#if layers.showGrid}
        <!-- phase 5: unit grid + 10x emphasis lines (parity with layered
             `showGrid`). cyan keeps strong contrast against the canvas
             body in both themes; opacity step at every 10 units helps the
             reviewer count generations / row widths at a glance. -->
        {#each Array.from({ length: gridBounds.x1 - gridBounds.x0 + 1 }) as _, i (i)}
            {@const x = gridBounds.x0 + i}
            <line
                class="family-view-debug-grid-line"
                data-testid="family-view-debug-grid-line"
                data-axis="v"
                x1={x * unit}
                y1={gridBounds.y0 * unit}
                x2={x * unit}
                y2={gridBounds.y1 * unit}
                stroke="hsl(190 80% 55%)"
                stroke-width="0.5"
                opacity={x % 10 === 0 ? "0.45" : "0.18"}
                vector-effect="non-scaling-stroke"
            />
        {/each}
        {#each Array.from({ length: gridBounds.y1 - gridBounds.y0 + 1 }) as _, i (i)}
            {@const y = gridBounds.y0 + i}
            <line
                class="family-view-debug-grid-line"
                data-testid="family-view-debug-grid-line"
                data-axis="h"
                x1={gridBounds.x0 * unit}
                y1={y * unit}
                x2={gridBounds.x1 * unit}
                y2={y * unit}
                stroke="hsl(190 80% 55%)"
                stroke-width="0.5"
                opacity={y % 10 === 0 ? "0.45" : "0.18"}
                vector-effect="non-scaling-stroke"
            />
        {/each}
    {/if}

    {#if layers.showNodeBounds}
        <!-- phase 5: green rect + id label per laid-out card (parity with
             layered `showNodeBounds`). emits `data-person-id` so e2e can
             count / target individual rects without re-deriving from
             `layout.nodes`. badges get the same treatment with a dashed
             stroke to keep the two visually distinct. -->
        {#each [...layout.nodes.values()] as node (node.personId)}
            {@const h = node.h ?? CARD_H}
            <rect
                class="family-view-debug-node-bounds"
                data-testid="family-view-debug-node-bounds"
                data-person-id={node.personId}
                x={node.x * unit}
                y={node.y * unit}
                width={PERSON_W * unit}
                height={h * unit}
                fill="none"
                stroke="hsl(140 70% 45%)"
                stroke-width="1"
                opacity="0.7"
                vector-effect="non-scaling-stroke"
            />
            <text
                class="family-view-debug-node-bounds-label"
                data-testid="family-view-debug-node-bounds-label"
                data-person-id={node.personId}
                x={node.x * unit + 2}
                y={node.y * unit + 10}
                font-size="9"
                fill="hsl(140 70% 45%)"
                opacity="0.85"
            >
                {node.personId.slice(0, 12)}
            </text>
        {/each}
        {#each layout.badges as badge (badge.id)}
            <rect
                class="family-view-debug-badge-bounds"
                data-testid="family-view-debug-badge-bounds"
                data-badge-id={badge.id}
                x={badge.x * unit}
                y={badge.y * unit}
                width={PERSON_W * unit}
                height={CARD_H * unit}
                fill="none"
                stroke="hsl(140 70% 45%)"
                stroke-width="1"
                stroke-dasharray="3 2"
                opacity="0.5"
                vector-effect="non-scaling-stroke"
            />
        {/each}
    {/if}

    {#if layers.showLastEditHalo && lastEditPos}
        <!-- phase 5: 1s yellow ring on the most recently mutated card
             (parity with layered `showLastEditHalo`). re-keyed by
             `${id}-${editSeq}` so consecutive saves to the same person
             also remount the circle and retrigger the css fade. uses a
             softer yellow (hsl 50) that keeps ≥3:1 contrast against the
             cyan grid + green node bounds in both themes. -->
        {#key `${lastEditPos.id}-${editSeq}`}
            <circle
                class="family-view-debug-last-edit-halo"
                data-testid="family-view-debug-last-edit-halo"
                data-person-id={lastEditPos.id}
                cx={lastEditPos.x * unit}
                cy={lastEditPos.y * unit}
                r={(PERSON_W / 2 + 0.4) * unit}
                fill="none"
                stroke="hsl(50 95% 55%)"
                stroke-width="3"
                vector-effect="non-scaling-stroke"
            />
        {/key}
    {/if}

    {#if layers.showVisibleSubset && cardsBBox.w > 0 && cardsBBox.h > 0}
        <!-- dashed fence around the laid-out cards; phase 0 walking
             skeleton's only visible toggle. accent-colored stroke
             contrasts against both canvas themes; dashed pattern
             distinguishes it from the layered debug rect styles. -->
        <rect
            class="family-view-debug-visible-subset"
            data-testid="family-view-debug-visible-subset-rect"
            x={cardsBBox.x * unit}
            y={cardsBBox.y * unit}
            width={cardsBBox.w * unit}
            height={cardsBBox.h * unit}
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="6 4"
            vector-effect="non-scaling-stroke"
        />
    {/if}

    {#if layers.showDuplicateAncestors && coiDuplicateHalos.length > 0}
        <!-- phase 4: halo on every visible duplicate-ancestor card. blue
             dashed ring distinct from the production `data-consang-
             duplicate` red box-shadow + from the orphan red dashed ring.
             rings the duplicate ancestors, not the focus, so the focus
             ring keeps its own meaning. -->
        {#each coiDuplicateHalos as halo (halo.personId)}
            <rect
                class="family-view-debug-coi-duplicate"
                data-testid="family-view-debug-coi-duplicate"
                data-person-id={halo.personId}
                x={halo.x * unit}
                y={halo.y * unit}
                width={halo.w * unit}
                height={halo.h * unit}
                fill="none"
                stroke="hsl(220 85% 55%)"
                stroke-width="2.5"
                stroke-dasharray="3 3"
                vector-effect="non-scaling-stroke"
            />
        {/each}
    {/if}

    {#if layers.showOrphanBadge && orphanIds.length > 0}
        <!-- phase 1: orphan ring on every visible person with zero
             incoming + outgoing edges. floating-people canary - on a
             healthy tree the only orphan should be a tree with a single
             person; anything else flags a connectivity bug. -->
        {#each orphanIds as pid (pid)}
            {@const n = layout.nodes.get(pid)}
            {#if n}
                {@const h = n.h ?? CARD_H}
                <rect
                    class="family-view-debug-orphan"
                    data-testid="family-view-debug-orphan-rect"
                    data-person-id={pid}
                    x={(n.x - 0.05) * unit}
                    y={(n.y - 0.05) * unit}
                    width={(PERSON_W + 0.1) * unit}
                    height={(h + 0.1) * unit}
                    fill="none"
                    stroke="hsl(0 80% 50%)"
                    stroke-width="2"
                    stroke-dasharray="4 3"
                    vector-effect="non-scaling-stroke"
                />
            {/if}
        {/each}
    {/if}

    {#if layers.showMultiUnionManifold && multiUnionManifolds.length > 0}
        <!-- phase 2: per multi-partner anchor, highlight the bus
             polyline + child-anchor + per-partner connection points.
             stacked on top of the role-tinted bus edges from phase 1's
             `showEdgeRoles`; this overlay is the union-index label and
             the geometry markers, not a replacement coloring. -->
        {#each multiUnionManifolds as { anchor, manifold } (anchor.id)}
            <!-- bus polyline emphasis: thick semi-transparent stroke
                 over the existing n-partner-bus edges so the bus is
                 legible at a glance even when adjacent cards or other
                 overlays compete for attention. -->
            <line
                class="family-view-debug-mu-bus"
                data-testid="family-view-debug-mu-bus"
                data-anchor-id={anchor.id}
                x1={manifold.busMinX * unit}
                y1={manifold.busY * unit}
                x2={manifold.busMaxX * unit}
                y2={manifold.busY * unit}
                stroke="hsl(280 80% 55%)"
                stroke-width="6"
                stroke-opacity="0.25"
                stroke-linecap="round"
                vector-effect="non-scaling-stroke"
            />
            <!-- per-partner connection marker -->
            {#each manifold.partners as partner (partner.personId)}
                <circle
                    class="family-view-debug-mu-partner"
                    data-testid="family-view-debug-mu-partner"
                    data-anchor-id={anchor.id}
                    data-person-id={partner.personId}
                    cx={partner.x * unit}
                    cy={partner.y * unit}
                    r="4"
                    fill="hsl(280 80% 55%)"
                />
            {/each}
            <!-- child anchor (the manifold centroid where child drops
                 originate). hollow ring distinguishes it from the per-
                 partner markers. -->
            <circle
                class="family-view-debug-mu-anchor"
                data-testid="family-view-debug-mu-anchor"
                data-anchor-id={anchor.id}
                cx={manifold.childAnchor.x * unit}
                cy={manifold.childAnchor.y * unit}
                r="6"
                fill="none"
                stroke="hsl(280 80% 55%)"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
            />
            <!-- union index label at the bus midpoint -->
            <text
                class="family-view-debug-mu-label"
                data-testid="family-view-debug-mu-label"
                data-anchor-id={anchor.id}
                x={manifold.childAnchor.x * unit}
                y={(manifold.busY - 0.15) * unit}
                text-anchor="middle"
                font-size="10"
                fill="hsl(280 80% 55%)"
            >
                {anchor.id} · n={anchor.partnerIds.length}
            </text>
        {/each}
    {/if}

    {#if layers.showCardCollisions && cardCollisions.length > 0}
        <!-- phase 2: red dashed rect on each pair of overlapping cards.
             parity-in-spirit with the layered `showOverlapPairs`. one
             rect per intersection rather than per pair (pair endpoints
             encoded in data attributes for e2e drilling). -->
        {#each cardCollisions as collision, i (i)}
            <rect
                class="family-view-debug-collision"
                data-testid="family-view-debug-collision"
                data-rank={collision.a.rank}
                data-a-id={collision.a.id}
                data-b-id={collision.b.id}
                x={collision.rect.x * unit}
                y={collision.rect.y * unit}
                width={collision.rect.w * unit}
                height={collision.rect.h * unit}
                fill="hsl(0 90% 55% / 0.18)"
                stroke="hsl(0 90% 55%)"
                stroke-width="2"
                stroke-dasharray="4 3"
                vector-effect="non-scaling-stroke"
            />
        {/each}
    {/if}

    {#if layers.showCoupleCentroidDelta && coupleCentroidDeltas.length > 0}
        <!-- phase 2: bond/centroid delta. one line + label per 2-partner
             couple anchor with at least one child. zero delta = no
             rendered line (degenerate); the label still renders so the
             reviewer sees the value. -->
        {#each coupleCentroidDeltas as entry (entry.anchorId)}
            <line
                class="family-view-debug-cc-delta-line"
                data-testid="family-view-debug-cc-delta-line"
                data-anchor-id={entry.anchorId}
                x1={entry.bond.x * unit}
                y1={entry.bond.y * unit}
                x2={entry.centroid.x * unit}
                y2={entry.centroid.y * unit}
                stroke="hsl(180 80% 40%)"
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
            />
            <circle
                cx={entry.bond.x * unit}
                cy={entry.bond.y * unit}
                r="3"
                fill="hsl(180 80% 40%)"
            />
            <circle
                cx={entry.centroid.x * unit}
                cy={entry.centroid.y * unit}
                r="3"
                fill="none"
                stroke="hsl(180 80% 40%)"
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
            />
            <text
                class="family-view-debug-cc-delta-label"
                data-testid="family-view-debug-cc-delta-label"
                data-anchor-id={entry.anchorId}
                x={((entry.bond.x + entry.centroid.x) / 2) * unit}
                y={((entry.bond.y + entry.centroid.y) / 2 - 0.1) * unit}
                text-anchor="middle"
                font-size="10"
                fill="hsl(180 80% 40%)"
            >
                Δ {entry.delta.toFixed(2)}
            </text>
        {/each}
    {/if}

    {#if layers.showRankGutterLabels && rankLabels.length > 0}
        <!-- phase 2: rank labels at left margin. phase-5 polish: x is now
             derived from `cardsBBox.x` so the gutter parks against the
             actual leftmost card in unit space (independent of the
             viewport pan + zoom). Earlier the position was hard-coded to
             screen-px `x="2"`, which only worked because the overlay
             lived at the canvas origin; a pan-aware overlay layer would
             have broken alignment. -->
        {@const gutterX = (cardsBBox.w > 0 ? cardsBBox.x - 0.4 : 0) * unit}
        {#each rankLabels as label (label.rank)}
            <text
                class="family-view-debug-rank-label"
                data-testid="family-view-debug-rank-label"
                data-rank={label.rank}
                x={gutterX}
                y={label.y * unit}
                text-anchor="end"
                font-size="10"
                fill="currentColor"
            >
                {label.label}
            </text>
        {/each}
    {/if}

    {#if layers.showViewportFitTarget}
        <!-- phase 3 navigation diagnostics: target person's expected bbox
             plus the current viewport rect, both in unit space. when the
             target sits outside the viewport rect the recenter is either
             off-screen or pending. when the target is null (no selection
             or off-subset), only the viewport rect renders so the user
             still has a hint of what's currently visible. -->
        {#if targetRect}
            <rect
                class="family-view-debug-target-rect"
                data-testid="family-view-debug-target-rect"
                x={targetRect.x * unit}
                y={targetRect.y * unit}
                width={targetRect.w * unit}
                height={targetRect.h * unit}
                fill="none"
                stroke="hsl(140 80% 45%)"
                stroke-width="2"
                stroke-dasharray="2 2"
                vector-effect="non-scaling-stroke"
            />
        {/if}
        {#if viewportRectUnit && viewportRectUnit.w > 0 && viewportRectUnit.h > 0}
            <rect
                class="family-view-debug-viewport-rect"
                data-testid="family-view-debug-viewport-rect"
                x={viewportRectUnit.x * unit}
                y={viewportRectUnit.y * unit}
                width={viewportRectUnit.w * unit}
                height={viewportRectUnit.h * unit}
                fill="none"
                stroke="hsl(45 90% 50%)"
                stroke-width="1.5"
                stroke-dasharray="6 6"
                vector-effect="non-scaling-stroke"
            />
        {/if}
    {/if}

    {#if layers.showSecondaryUnionState && tree}
        <!-- phase 1: per-card union-state pill. small text below each
             card showing total unions and the primary-coupleIndex. when
             a secondary is expanded we surface its index too. invisible
             on cards with 0 unions (singles / orphans handled separately). -->
        {#each [...layout.nodes.values()] as node (node.personId)}
            {@const u = unionsFor(node.personId)}
            {#if u}
                {@const h = node.h ?? CARD_H}
                <text
                    class="family-view-debug-union-pill"
                    data-testid="family-view-debug-union-pill"
                    data-person-id={node.personId}
                    x={(node.x + PERSON_W / 2) * unit}
                    y={(node.y + h + 0.18) * unit}
                    text-anchor="middle"
                    font-size="10"
                    fill="currentColor"
                >
                    u:{u.total} p:{u.primaryIndex ?? "?"}{u.expanded.length > 0
                        ? ` +${u.expanded.join(",")}`
                        : ""}
                </text>
            {/if}
        {/each}
    {/if}
</svg>

{#if layers.showPendingRecenter && flashActive}
    <!-- phase 3: green border pulse when `canvasController.centerOnPerson`
         (or its `focusSelection` alias) fires. fixed-position overlay
         pinned to the canvas viewport; pointer-events stay off so the
         pulse doesn't block clicks. 250ms timeout is owned by
         FamilyViewCanvas; this overlay simply renders while
         `flashActive` is true. -->
    <div
        class="family-view-debug-flash"
        data-testid="family-view-debug-recenter-flash"
        aria-hidden="true"
    ></div>
{/if}

{#snippet debugPanelPill(pid: string, label: string)}
    <!-- every open family-view debug panel gets a real taskbar pill. the pill
         is the panel's only representation in the dock when minimized; clicking
         it routes through dockStore.pillClick to restore / focus / minimize.
         testid is `<id>-pill` so e2e can target the per-panel pill. -->
    <button
        type="button"
        class="fte-pill cursor-pointer font-mono"
        title={label}
        aria-pressed={dockStore.windowState(pid) === "expanded" ||
            dockStore.windowState(pid) === "floating"}
        data-testid={`${pid}-pill`}
        data-pill-id={pid}
        onclick={() => dockStore.pillClick(pid)}
    >
        <Bug size={12} strokeWidth={2} />
        <span>{label}</span>
    </button>
{/snippet}

{#snippet offSubsetBody()}
    <!-- phase 3 canvas-chrome-dock: badge body content. the alert
         flavour (orange background + white text) still lives on the
         outer `.family-view-debug-off-subset-warning` class so docked-
         badge contrast stays distinct from the neutral pills around it. -->
    <div
        class="family-view-debug-off-subset-warning"
        data-testid="family-view-debug-off-subset-warning"
        data-person-id={selectedId}
        data-reason={offSubsetReason}
    >
        <div class="badge-title">selected off-subset</div>
        <div class="badge-name">{nameOfOrDash(selectedId)}</div>
        <div class="badge-reason">
            {offSubsetReason == null
                ? ""
                : offSubsetReason === "unknown"
                  ? "reason: pending"
                  : reasonLabel(offSubsetReason)}
        </div>
    </div>
{/snippet}

{#snippet offSubsetPanel(_ctx: { forcedCollapse: boolean })}
    <DockWindow
        id="family-view-debug-off-subset-warning"
        title={`off-subset · ${nameOfOrDash(selectedId)}`}
        body={offSubsetBody}
    />
{/snippet}

{#if layers.showOffSubsetWarning && selectedId !== undefined && offSubsetReason}
    <DockItem id="family-view-debug-off-subset-warning" kind="window" {corner} priority={200} persistent={false} render={offSubsetPanel} />
    {#snippet offSubsetPill(_ctx: { forcedCollapse: boolean })}
        {@render debugPanelPill("family-view-debug-off-subset-warning", "off-subset")}
    {/snippet}
    <DockItem id="family-view-debug-off-subset-warning-pill" kind="pill" {corner} priority={200} persistent={false} windowId="family-view-debug-off-subset-warning" render={offSubsetPill} />
{/if}

{#snippet recenterMissedBody()}
    <!-- phase 3 canvas-chrome-dock: badge body content; the alert
         flavour (red background + white text) lives on the
         `.family-view-debug-recenter-missed` class. -->
    <div
        class="family-view-debug-recenter-missed"
        data-testid="family-view-debug-recenter-missed"
        data-person-id={recenterMissedFor}
    >
        <div class="badge-title">no recenter fired</div>
        <div class="badge-name">{nameOfOrDash(recenterMissedFor)}</div>
    </div>
{/snippet}

{#snippet recenterMissedPanel(_ctx: { forcedCollapse: boolean })}
    <DockWindow
        id="family-view-debug-recenter-missed"
        title={`no recenter · ${nameOfOrDash(recenterMissedFor)}`}
        body={recenterMissedBody}
    />
{/snippet}

{#if layers.showPendingRecenter && recenterMissedFor !== undefined}
    <DockItem id="family-view-debug-recenter-missed" kind="window" {corner} priority={210} persistent={false} render={recenterMissedPanel} />
    {#snippet recenterMissedPill(_ctx: { forcedCollapse: boolean })}
        {@render debugPanelPill("family-view-debug-recenter-missed", "no recenter")}
    {/snippet}
    <DockItem id="family-view-debug-recenter-missed-pill" kind="pill" {corner} priority={210} persistent={false} windowId="family-view-debug-recenter-missed" render={recenterMissedPill} />
{/if}

{#snippet coiBreakdownBody()}
    <!-- phase 3 canvas-chrome-dock: coi breakdown body. preserves the
         outer testid + the inner per-row testids; the header-button is
         gone (replaced by the pill) but every drilldown row testid
         (`family-view-debug-coi-focus`, `-raw`, `-displayed`, `-sum`,
         and the pre-migration `-count`) is unchanged so e2e queries
         keep resolving. -->
    <div class="family-view-debug-coi-breakdown" data-testid="family-view-debug-coi-breakdown">
        <!-- count testid preserved post-migration. used to be on the
             header-button's count span; now lives as a meta-only element
             so existing e2e queries against the row count still resolve
             without re-anchoring on the pill status text. -->
        <span hidden data-testid="family-view-debug-coi-breakdown-count">
            {coiBreakdown?.length ?? 0}
        </span>
        <div class="meta">
            <div class="fte-window-row">
                <span>focus</span>
                <span data-testid="family-view-debug-coi-focus">
                    {nameOfOrDash(coiFocusId)}
                </span>
            </div>
            <div class="fte-window-row">
                <span>raw</span>
                <span data-testid="family-view-debug-coi-raw">
                    {coiRaw !== undefined ? coiRaw.toFixed(6) : "—"}
                </span>
            </div>
            <div class="fte-window-row">
                <span>displayed</span>
                <span data-testid="family-view-debug-coi-displayed">
                    {coiDisplayed && coiDisplayed.length > 0 ? coiDisplayed : "—"}
                </span>
            </div>
            <div class="fte-window-row">
                <span>Σ rows</span>
                <span data-testid="family-view-debug-coi-sum">
                    {coiBreakdownSum.toFixed(6)}
                </span>
            </div>
        </div>
        <table>
            <thead>
                <tr>
                    <th>ancestor</th>
                    <th>d<sub>i</sub></th>
                    <th>d<sub>j</sub></th>
                    <th>(½)<sup>d+1</sup></th>
                </tr>
            </thead>
            <tbody>
                {#each coiBreakdown ?? [] as row, i (i)}
                    <tr data-ancestor-id={row.ancestorId}>
                        <td class="name">{nameOf(row.ancestorId)}</td>
                        <td class="num">{row.di}</td>
                        <td class="num">{row.dj}</td>
                        <td class="num">{fmtContribution(row.contribution)}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{/snippet}

{#snippet coiBreakdownPanel(_ctx: { forcedCollapse: boolean })}
    <DockWindow
        id="family-view-debug-coi-breakdown"
        title={`coi · ${coiDisplayed && coiDisplayed.length > 0 ? coiDisplayed : "—"}`}
        body={coiBreakdownBody}
    />
{/snippet}

{#if layers.showCoiBreakdown}
    <DockItem id="family-view-debug-coi-breakdown" kind="window" {corner} priority={220} persistent={false} render={coiBreakdownPanel} />
    {#snippet coiBreakdownPill(_ctx: { forcedCollapse: boolean })}
        {@render debugPanelPill("family-view-debug-coi-breakdown", "coi")}
    {/snippet}
    <DockItem id="family-view-debug-coi-breakdown-pill" kind="pill" {corner} priority={220} persistent={false} windowId="family-view-debug-coi-breakdown" render={coiBreakdownPill} />
{/if}

{#snippet focusLogBody()}
    <!-- phase 3 canvas-chrome-dock: focus-log body. preserves the
         outer testid + the per-row data attributes; the header-button
         is gone (replaced by the pill's label + status) but the pre-
         migration `-count` testid still resolves via a hidden meta-only
         span for backwards-compat with existing e2e queries. -->
    <div class="family-view-debug-focus-log" data-testid="family-view-debug-focus-log">
        <span hidden data-testid="family-view-debug-focus-log-count">
            {focusEvents?.length ?? 0}
        </span>
        <ul class="fte-window-list">
            {#each (focusEvents ?? []).slice(0, 20) as evt (evt.seq)}
                <li data-source={evt.source} data-person-id={evt.personId}>
                    <span class="clock">{fmtClock(evt.ts)}</span>
                    <span class="source">{evt.source}</span>
                    <span class="name">{nameOfOrDash(evt.personId)}</span>
                    <span
                        class="recenter"
                        data-requested={evt.requestedRecenter ? "true" : "false"}
                        data-triggered={evt.didTriggerCenterOn ? "true" : "false"}
                    >
                        {#if evt.requestedRecenter && evt.didTriggerCenterOn}
                            ✓ recenter
                        {:else if evt.requestedRecenter}
                            ✗ no centerOn
                        {:else}
                            ·
                        {/if}
                    </span>
                </li>
            {/each}
        </ul>
    </div>
{/snippet}

{#snippet focusLogPanel(_ctx: { forcedCollapse: boolean })}
    <DockWindow
        id="family-view-debug-focus-log"
        title={`focus · ${(focusEvents?.length ?? 0).toString()}`}
        body={focusLogBody}
    />
{/snippet}

{#if layers.logFocusEvents && focusEvents && focusEvents.length > 0}
    <DockItem id="family-view-debug-focus-log" kind="window" {corner} priority={225} persistent={false} render={focusLogPanel} />
    {#snippet focusLogPill(_ctx: { forcedCollapse: boolean })}
        {@render debugPanelPill("family-view-debug-focus-log", "focus")}
    {/snippet}
    <DockItem id="family-view-debug-focus-log-pill" kind="pill" {corner} priority={225} persistent={false} windowId="family-view-debug-focus-log" render={focusLogPill} />
{/if}

{#snippet layoutMetricsBody()}
    <!-- expanded-form body. wrapped in the legacy `.family-view-debug-
         layout-metrics` class so the existing background / border /
         font / padding / scroll-cap css keeps applying without
         per-rule rewrites. data-testid carried here post-Window-
         migration so visibility-based e2e queries (`getByTestId("...")`
         + `toBeVisible()`) resolve unchanged. data-collapsed remains
         "false" by structural invariant — when collapsed via the
         Window's titlebar chevron the Window stops rendering this
         snippet entirely, so the testid disappears (queries handle
         the absence via `.not.toBeVisible()` or `toHaveCount(0)`). -->
    <div
        class="family-view-debug-layout-metrics"
        data-testid="family-view-debug-layout-metrics"
        data-collapsed="false"
    >
        <div class="meta">
            <div class="fte-window-row">
                <span>visible</span>
                <span data-testid="family-view-debug-layout-metrics-visible">
                    {layout.nodes.size}
                </span>
            </div>
            <div class="fte-window-row">
                <span>badges</span>
                <span data-testid="family-view-debug-layout-metrics-badges">
                    {layout.badges.length}
                </span>
            </div>
            <div class="fte-window-row">
                <span>tree size</span>
                <span data-testid="family-view-debug-layout-metrics-tree-size">
                    {treePeopleCount !== undefined ? treePeopleCount.toString() : "—"}
                </span>
            </div>
            <div class="fte-window-row">
                <span>expansions</span>
                <span data-testid="family-view-debug-layout-metrics-expansions">
                    {expansionStateSize !== undefined ? expansionStateSize.toString() : "—"}
                </span>
            </div>
            <div class="fte-window-row">
                <span>anchors</span>
                <span data-testid="family-view-debug-layout-metrics-anchors">
                    {layout.anchors.length}
                </span>
            </div>
            <div class="fte-window-row">
                <span>edges</span>
                <span data-testid="family-view-debug-layout-metrics-edges">
                    {layout.edges.length}
                </span>
            </div>
            <div class="fte-window-row">
                <span>duration</span>
                <span data-testid="family-view-debug-layout-metrics-duration-row">
                    {fmtMs(layoutDurationMs)}
                </span>
            </div>
        </div>
        <div class="rank-section">
            <div class="rank-section-title">rank distribution</div>
            <ul class="ranks">
                {#each rankDistribution as r (r.rank)}
                    <li data-rank={r.rank}>
                        <span class="rank-label">{fmtRank(r.rank)}</span>
                        <span class="rank-count">{r.count}</span>
                    </li>
                {/each}
            </ul>
        </div>
    </div>
{/snippet}

{#snippet layoutMetricsPanel(_ctx: { forcedCollapse: boolean })}
    <DockWindow
        id="family-view-debug-layout-metrics"
        title={`LM · ${fmtMs(layoutDurationMs)}`}
        body={layoutMetricsBody}
    />
{/snippet}

{#if layers.showLayoutMetrics}
    <DockItem id="family-view-debug-layout-metrics" kind="window" {corner} priority={230} persistent={false} render={layoutMetricsPanel} />
    {#snippet layoutMetricsPill(_ctx: { forcedCollapse: boolean })}
        {@render debugPanelPill("family-view-debug-layout-metrics", "metrics")}
    {/snippet}
    <DockItem id="family-view-debug-layout-metrics-pill" kind="pill" {corner} priority={230} persistent={false} windowId="family-view-debug-layout-metrics" render={layoutMetricsPill} />
{/if}

<style>
    /* the overlay group inherits accent through `currentColor`; the
       parent canvas-host element sets `text-accent` on the debug overlay
       wrapper. keeping the style block here so the file declares its
       own visual contract instead of relying on App-level globals. */
    .family-view-debug-overlay {
        color: var(--color-accent);
    }
    .family-view-debug-union-pill {
        /* the union-state pill renders as plain svg text on the canvas;
           keep it small and accent-colored so it doesn't compete with
           the card chrome but stays scannable. */
        font-family: var(--font-mono);
        font-weight: 500;
        opacity: 0.85;
    }
    .family-view-debug-mu-label,
    .family-view-debug-cc-delta-label,
    .family-view-debug-rank-label {
        /* phase 2 labels share the monospaced family for crisp number
           rendering; each overlay picks its own fill so the colour map
           stays unambiguous. */
        font-family: var(--font-mono);
        font-weight: 500;
    }
    /* phase 3: navigation diagnostics. green border pulse fixed-positioned
       to the canvas; corner badges anchored top-right. */
    .family-view-debug-flash {
        position: fixed;
        inset: 0;
        z-index: 55;
        pointer-events: none;
        border: 4px solid hsl(140 80% 45%);
        animation: family-view-debug-flash-fade 250ms ease-out forwards;
    }
    @keyframes family-view-debug-flash-fade {
        from {
            opacity: 0.85;
        }
        to {
            opacity: 0;
        }
    }
    /* phase 3 canvas-chrome-dock: the recenter-missed and off-subset
       badges used to fix-position themselves at the top-right corner with
       `position: fixed; top; right; z-index`. those rules dropped in
       favour of CanvasChromeDock. only the visual flavour (red / orange
       background, white text, badge-label typography) stays here. the
       inner body wraps these classes so the dock placement is decoupled
       from the badge appearance. */
    .family-view-debug-recenter-missed,
    .family-view-debug-off-subset-warning {
        padding: 0.4rem 0.6rem;
        font-size: 10px;
        line-height: 1.3;
        font-family: var(--font-mono);
        color: var(--color-fg);
        border-radius: 4px;
        box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
        max-width: 14rem;
    }
    .family-view-debug-recenter-missed {
        background: hsl(0 80% 35% / 0.92);
        border: 1px solid hsl(0 80% 50%);
        color: white;
    }
    .family-view-debug-off-subset-warning {
        background: hsl(35 90% 30% / 0.92);
        border: 1px solid hsl(35 90% 50%);
        color: white;
    }
    .family-view-debug-recenter-missed .badge-title,
    .family-view-debug-off-subset-warning .badge-title {
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 9px;
        opacity: 0.85;
    }
    .family-view-debug-recenter-missed .badge-name,
    .family-view-debug-off-subset-warning .badge-name {
        font-weight: 500;
    }
    .family-view-debug-off-subset-warning .badge-reason {
        font-size: 9px;
        opacity: 0.85;
        margin-top: 0.1rem;
    }
    /* phase 3 canvas-chrome-dock + canvas-window-manager phase 2:
       focus-log panel renders inside the Window primitive's body slot.
       phase 5: the frosted box (background / border / radius / shadow /
       fixed width) + edge padding dropped - `.fte-window-stack` +
       `.fte-window-body` own those now, so this only keeps the scroll
       cap, the monospace flavour, and the per-row grid. the `ul` reset
       moved to the shared `.fte-window-list` class on the markup. */
    .family-view-debug-focus-log {
        max-height: 16rem;
        overflow-y: auto;
        font-size: 10px;
        line-height: 1.3;
        font-family: var(--font-mono);
        color: var(--color-fg);
    }
    .family-view-debug-focus-log li {
        display: grid;
        grid-template-columns: 4.5rem 4.5rem 1fr 5rem;
        gap: 0.4rem;
        padding: 0.1rem 0;
    }
    .family-view-debug-focus-log .clock {
        color: var(--color-fg-muted);
    }
    .family-view-debug-focus-log .source {
        color: var(--color-accent);
    }
    .family-view-debug-focus-log .recenter[data-requested="true"][data-triggered="true"] {
        color: hsl(140 60% 45%);
    }
    .family-view-debug-focus-log .recenter[data-requested="true"][data-triggered="false"] {
        color: hsl(0 80% 55%);
    }
    .family-view-debug-focus-log .recenter[data-requested="false"] {
        color: var(--color-fg-muted);
    }
    /* phase 3 canvas-chrome-dock + canvas-window-manager phase 2:
       coi-breakdown panel renders inside the Window primitive's body
       slot. phase 5: the frosted box + edge padding dropped (the window
       stack owns them); the meta rows moved to the shared
       `.fte-window-row` class. only the scroll cap, monospace flavour,
       the meta divider, the long-value word-break, and the table styling
       stay here. */
    .family-view-debug-coi-breakdown {
        max-height: 60vh;
        overflow-y: auto;
        font-size: 10px;
        line-height: 1.3;
        font-family: var(--font-mono);
        color: var(--color-fg);
    }
    .family-view-debug-coi-breakdown .meta {
        margin-bottom: 0.4rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid var(--color-line);
    }
    /* the displayed-coi value can run long; let it wrap inside the row's
       right cell rather than pushing the layout wide. */
    .family-view-debug-coi-breakdown .meta .fte-window-row > :last-child {
        word-break: break-all;
    }
    .family-view-debug-coi-breakdown table {
        width: 100%;
        border-collapse: collapse;
    }
    .family-view-debug-coi-breakdown th {
        text-align: left;
        font-weight: 500;
        color: var(--color-accent);
        padding: 0.1rem 0.2rem;
    }
    .family-view-debug-coi-breakdown td {
        padding: 0.05rem 0.2rem;
    }
    .family-view-debug-coi-breakdown td.num,
    .family-view-debug-coi-breakdown th:not(:first-child) {
        text-align: right;
    }
    /* phase 5: last-edit halo — 1s yellow ring with a css fade. re-keyed
       on `${lastEditPos.id}-${editSeq}` so consecutive saves to the same
       person also remount the circle and retrigger the animation. mirrors
       the layered DebugOverlay's `.last-edit-halo` keyframe. */
    :global(.family-view-debug-overlay .family-view-debug-last-edit-halo) {
        animation: family-view-debug-last-edit-fade 1s ease-out forwards;
    }
    @keyframes family-view-debug-last-edit-fade {
        from {
            opacity: 0.85;
        }
        to {
            opacity: 0;
        }
    }
    /* phase 0 / phase 2 canvas-chrome-dock + canvas-window-manager
       phase 2: the layout-metrics panel renders inside the Window
       primitive's body slot. phase 5: the frosted box + edge padding
       dropped (the window stack owns them); the meta rows moved to the
       shared `.fte-window-row` class. only the scroll cap, monospace
       flavour, the meta divider, and the rank section stay here. */
    .family-view-debug-layout-metrics {
        max-height: 60vh;
        overflow-y: auto;
        font-size: 10px;
        line-height: 1.3;
        font-family: var(--font-mono);
        color: var(--color-fg);
        pointer-events: auto;
    }
    .family-view-debug-layout-metrics .meta {
        margin-bottom: 0.3rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid var(--color-line);
    }
    .family-view-debug-layout-metrics .rank-section-title {
        color: var(--color-accent);
        font-weight: 500;
        margin-bottom: 0.15rem;
    }
    .family-view-debug-layout-metrics .ranks {
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .family-view-debug-layout-metrics .ranks li {
        display: grid;
        grid-template-columns: 4rem 1fr;
        gap: 0.4rem;
        padding: 0.05rem 0;
    }
    .family-view-debug-layout-metrics .ranks .rank-label {
        color: var(--color-fg-muted);
    }
    .family-view-debug-layout-metrics .ranks .rank-count {
        color: var(--color-fg);
        text-align: right;
    }
</style>
