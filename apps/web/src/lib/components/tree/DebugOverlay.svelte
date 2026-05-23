<!--
    FamilyTreeEditor - Debug overlay SVG: grid, node bounds, segment IDs, ghosts, components, hops
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { DebugOverlayProps } from "./debugTypes";
    import { getParents } from "$lib/domain/tree";

    let {
        layout,
        segments,
        tracePath,
        selectedId,
        layers,
        unit,
        layeredGraph,
        placedGraph,
        tree,
        lastEditedId,
    }: DebugOverlayProps = $props();

    const CARD_W_U = 2;
    const CARD_H_U = 1.2;

    const kindColor: Record<string, string> = {
        bond: "#FFD700",
        "parent-drop": "#FF69B4",
        "sibling-bus": "#00CED1",
        "child-drop": "#7CFC00",
        stub: "#FF4500",
    };

    let canvasH = $derived(layout.canvas.height * unit);

    let compBounds = $derived(
        layout.components.map((comp, i) => ({
            comp,
            x: comp.offsetLeft * unit,
            w:
                ((layout.components[i + 1]?.offsetLeft ?? layout.canvas.width) - comp.offsetLeft) *
                unit,
        })),
    );

    // Phase 3 — cycle nodes: render a red ring on every person id flagged
    // by layer.ts as a cycle member (rank assignment fell back to 0 and
    // surfaced the ids via LayeredGraph.cycleNodes).
    let cycleIds = $derived(layeredGraph?.cycleNodes ?? []);

    // Phase 3 — bond/centroid delta: per couple, plot the bond midpoint
    // and a caret pointing to the children centroid. When the two differ,
    // the couple-drop emerges off-center (visual signal of the same-rank
    // bond geometry).
    let centroidDeltas = $derived.by(() => {
        if (!tree || !placedGraph)
            return [] as {
                id: string;
                bondX: number;
                bondY: number;
                centroidX: number;
            }[];
        const out: { id: string; bondX: number; bondY: number; centroidX: number }[] = [];
        for (const couple of tree.couples) {
            if (couple.leftId === couple.rightId) continue;
            const lp = placedGraph.x.get(couple.leftId);
            const rp = placedGraph.x.get(couple.rightId);
            const ly = placedGraph.y.get(couple.leftId);
            const ry = placedGraph.y.get(couple.rightId);
            if (lp === undefined || rp === undefined || ly === undefined || ry === undefined)
                continue;
            // Only consider same-rank short bonds (the bug-17 + bond-shape case).
            if (ly !== ry) continue;
            const bondMidX = (lp + rp) / 2 + CARD_W_U / 2;
            const bondY = ly + CARD_H_U / 2;
            // Children centroid via parentIds (via getParents)
            const kids: number[] = [];
            for (const p of Object.values(tree.people)) {
                const refs = getParents(p);
                const ids = refs.map((r) => r.personId);
                const hasLeft = ids.includes(couple.leftId);
                const hasRight = ids.includes(couple.rightId);
                if (!hasLeft || !hasRight) continue;
                const cx = placedGraph.x.get(p.id);
                if (cx !== undefined) kids.push(cx + CARD_W_U / 2);
            }
            if (kids.length === 0) continue;
            const centroidX = kids.reduce((s, x) => s + x, 0) / kids.length;
            out.push({
                id: `${couple.leftId}|${couple.rightId}|${String(couple.unionIndex)}`,
                bondX: bondMidX,
                bondY,
                centroidX,
            });
        }
        return out;
    });

    // Phase 3 — orphan badge: people with no in-graph parents, no spouse,
    // and no children. Data-hygiene flag for stray imports.
    let orphanIds = $derived.by(() => {
        if (!tree) return [] as string[];
        const childCount = new Map<string, number>();
        for (const p of Object.values(tree.people)) {
            for (const ref of getParents(p)) {
                childCount.set(ref.personId, (childCount.get(ref.personId) ?? 0) + 1);
            }
        }
        const out: string[] = [];
        for (const p of Object.values(tree.people)) {
            const hasParent = getParents(p).length > 0;
            const hasSpouse = p.spouseIds.length > 0;
            const hasChild = (childCount.get(p.id) ?? 0) > 0;
            if (!hasParent && !hasSpouse && !hasChild) out.push(p.id);
        }
        return out;
    });

    // Phase 3 — rank gutter labels: emit a "rank N" tag at the left edge
    // of each rank row. Derived from placedGraph.ranks length + ROW_H.
    let rankLabels = $derived.by(() => {
        if (!placedGraph) return [] as { rank: number; y: number }[];
        return placedGraph.ranks.map((_, rank) => ({
            rank,
            y: rank * 2 + CARD_H_U / 2, // ROW_H=2
        }));
    });

    // Phase 3 — last-edit halo: 1s yellow ring around the most recently
    // mutated card. `lastEditedId` is bumped by App.svelte on every
    // edit; we render unconditionally while the toggle is on (the
    // 1-second fadeout is purely a CSS animation).
    let lastEditPos = $derived.by(() => {
        if (!lastEditedId || !placedGraph) return null;
        const x = placedGraph.x.get(lastEditedId);
        const y = placedGraph.y.get(lastEditedId);
        if (x === undefined || y === undefined) return null;
        return { x: x + CARD_W_U / 2, y: y + CARD_H_U / 2, id: lastEditedId };
    });

    // pairs of (real|ghost) cards on the same row whose x-extents overlap.
    // bucketing by y first keeps this O(sum k_y^2) rather than O(n^2).
    let overlapPairs = $derived.by(() => {
        const byY = new Map<number, Array<{ id: string; x: number }>>();
        for (const [id, p] of layout.positions) {
            const row = byY.get(p.y);
            const item = { id: `real:${id}`, x: p.x };
            if (row) row.push(item);
            else byY.set(p.y, [item]);
        }
        for (const g of layout.ghosts) {
            const row = byY.get(g.y);
            const item = { id: `ghost:${g.ghostOf}|${g.nearId}`, x: g.x };
            if (row) row.push(item);
            else byY.set(g.y, [item]);
        }
        const pairs: Array<{ ax: number; bx: number; y: number; aid: string; bid: string }> = [];
        for (const [y, items] of byY) {
            for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    if (Math.abs(items[i]!.x - items[j]!.x) < CARD_W_U) {
                        pairs.push({
                            ax: items[i]!.x,
                            bx: items[j]!.x,
                            y,
                            aid: items[i]!.id,
                            bid: items[j]!.id,
                        });
                    }
                }
            }
        }
        return pairs;
    });
</script>

<g class="debug-overlay" pointer-events="none">
    <!-- defs for ghost arrow marker -->
    {#if layers.showGhostArrows}
        <defs>
            <marker id="dbg-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 Z" fill="orange" />
            </marker>
        </defs>
    {/if}

    <!-- unit grid -->
    {#if layers.showGrid}
        {#each Array.from({ length: Math.ceil(layout.canvas.width) + 1 }) as _, x (x)}
            <line
                x1={x * unit}
                y1={0}
                x2={x * unit}
                y2={canvasH}
                stroke="cyan"
                stroke-width="0.5"
                opacity={x % 10 === 0 ? "0.45" : "0.2"}
                vector-effect="non-scaling-stroke"
            />
        {/each}
        {#each Array.from({ length: Math.ceil(layout.canvas.height) + 1 }) as _, y (y)}
            <line
                x1={0}
                y1={y * unit}
                x2={layout.canvas.width * unit}
                y2={y * unit}
                stroke="cyan"
                stroke-width="0.5"
                opacity={y % 10 === 0 ? "0.45" : "0.2"}
                vector-effect="non-scaling-stroke"
            />
        {/each}
    {/if}

    <!-- node bounding boxes -->
    {#if layers.showNodeBounds}
        {#each [...layout.positions] as [id, pos] (id)}
            <rect
                x={pos.x * unit}
                y={pos.y * unit}
                width={CARD_W_U * unit}
                height={CARD_H_U * unit}
                fill="none"
                stroke="lime"
                stroke-width="1"
                vector-effect="non-scaling-stroke"
                opacity="0.6"
            />
            <text
                x={pos.x * unit + 2}
                y={pos.y * unit + 10}
                font-size="9px"
                fill="lime"
                opacity="0.8"
            >
                {id.slice(0, 12)}
                {#if selectedId === id}*{/if}
            </text>
        {/each}

        <!-- ghost node bounds -->
        {#each layout.ghosts as g (`${g.ghostOf}-ghost-${g.nearId}`)}
            <rect
                x={g.x * unit}
                y={g.y * unit}
                width={CARD_W_U * unit}
                height={CARD_H_U * unit}
                fill="none"
                stroke="orange"
                stroke-width="1"
                stroke-dasharray="4 3"
                vector-effect="non-scaling-stroke"
                opacity="0.6"
            />
            <text
                x={g.x * unit + 2}
                y={g.y * unit + 10}
                font-size="9px"
                fill="orange"
                opacity="0.8"
            >
                ghost:{g.ghostOf.slice(0, 8)}
            </text>
        {/each}
    {/if}

    <!-- segment ID labels with colored dots -->
    {#if layers.showSegmentIds}
        {#each segments as seg (seg.id)}
            {@const mx = (seg.x1 + seg.x2) / 2}
            {@const my = (seg.y1 + seg.y2) / 2}
            <circle cx={mx} cy={my} r={3} fill={kindColor[seg.kind] ?? "#999"} opacity="0.7" />
            <text
                x={mx + 4}
                y={my - 2}
                font-size="9px"
                fill={kindColor[seg.kind] ?? "#999"}
                opacity="0.8"
            >
                {seg.id.slice(0, 22)} ({Math.round(mx)},{Math.round(my)})
            </text>
        {/each}
    {/if}

    <!-- ghost arrows -->
    {#if layers.showGhostArrows}
        {#each layout.ghosts as g (`${g.ghostOf}-arrow-${g.nearId}`)}
            {@const realPos = layout.positions.get(g.ghostOf)}
            {#if realPos}
                {@const realX = (realPos.x + CARD_W_U / 2) * unit}
                {@const realY = (realPos.y + CARD_H_U / 2) * unit}
                {@const ghostX = (g.x + CARD_W_U / 2) * unit}
                {@const ghostY = (g.y + CARD_H_U / 2) * unit}
                <line
                    x1={realX}
                    y1={realY}
                    x2={ghostX}
                    y2={ghostY}
                    stroke="orange"
                    stroke-width="1.5"
                    stroke-dasharray="6 3"
                    vector-effect="non-scaling-stroke"
                    marker-end="url(#dbg-arrow)"
                />
            {/if}
        {/each}
    {/if}

    <!-- component bounding boxes -->
    {#if layers.showComponentBounds}
        {#each compBounds as bounds (bounds.comp.rootId)}
            <rect
                x={bounds.x}
                y={0}
                width={bounds.w}
                height={canvasH}
                fill="none"
                stroke="#a78bfa"
                stroke-width="1.5"
                stroke-dasharray="8 4"
                vector-effect="non-scaling-stroke"
                opacity="0.45"
            />
            <text x={bounds.x + 4} y={14} font-size="9px" fill="#a78bfa" opacity="0.8">
                {layout.components.indexOf(bounds.comp)}
                {bounds.comp.rootId.slice(0, 10)} ({bounds.comp.size})
            </text>
        {/each}
    {/if}

    <!-- bridge hop markers -->
    {#if layers.showHops}
        {#each segments as seg (seg.id)}
            {#if seg.hops && seg.hops.length > 0}
                {#each seg.hops as hop, idx (`${seg.id}-hop-${idx}`)}
                    <circle
                        cx={seg.x1}
                        cy={hop}
                        r={5}
                        fill="none"
                        stroke="#FF8C00"
                        stroke-width="1"
                        vector-effect="non-scaling-stroke"
                        opacity="0.7"
                    />
                    <text x={seg.x1 + 6} y={hop - 3} font-size="9px" fill="#FF8C00" opacity="0.8">
                        hop y={(hop / unit).toFixed(2)}u
                    </text>
                {/each}
            {/if}
        {/each}
    {/if}

    <!-- overlap pairs: red dashed rect on each colliding card + connector -->
    {#if layers.showOverlapPairs}
        {#each overlapPairs as pair, i (`${pair.aid}|${pair.bid}|${i}`)}
            <rect
                x={pair.ax * unit}
                y={pair.y * unit}
                width={CARD_W_U * unit}
                height={CARD_H_U * unit}
                fill="rgba(255,0,0,0.15)"
                stroke="red"
                stroke-width="2"
                stroke-dasharray="4 2"
                vector-effect="non-scaling-stroke"
            />
            <rect
                x={pair.bx * unit}
                y={pair.y * unit}
                width={CARD_W_U * unit}
                height={CARD_H_U * unit}
                fill="rgba(255,0,0,0.15)"
                stroke="red"
                stroke-width="2"
                stroke-dasharray="4 2"
                vector-effect="non-scaling-stroke"
            />
            <line
                x1={(pair.ax + CARD_W_U / 2) * unit}
                y1={(pair.y + CARD_H_U / 2) * unit}
                x2={(pair.bx + CARD_W_U / 2) * unit}
                y2={(pair.y + CARD_H_U / 2) * unit}
                stroke="red"
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
            />
        {/each}
        {#if overlapPairs.length > 0}
            <text
                x="6"
                y={canvasH - 8}
                font-size="11px"
                fill="red"
                font-weight="bold"
                opacity="0.9"
            >
                overlaps: {overlapPairs.length}
            </text>
        {/if}
    {/if}

    <!-- Phase 3: cycle nodes (red ring around layer.ts-flagged cycle members) -->
    {#if layers.showCycleNodes}
        {#each cycleIds as id (`cycle-${id}`)}
            {@const pos = layout.positions.get(id)}
            {#if pos}
                <circle
                    cx={(pos.x + CARD_W_U / 2) * unit}
                    cy={(pos.y + CARD_H_U / 2) * unit}
                    r={(CARD_W_U / 2 + 0.3) * unit}
                    fill="none"
                    stroke="#ef4444"
                    stroke-width="2.5"
                    vector-effect="non-scaling-stroke"
                    opacity="0.8"
                />
            {/if}
        {/each}
    {/if}

    <!-- Phase 3: bond/centroid delta -->
    {#if layers.showBondCentroidDelta}
        {#each centroidDeltas as d (d.id)}
            <!-- bond midpoint dot -->
            <circle cx={d.bondX * unit} cy={d.bondY * unit} r={3} fill="#22d3ee" opacity="0.9" />
            <!-- centroid caret -->
            <circle
                cx={d.centroidX * unit}
                cy={d.bondY * unit}
                r={3}
                fill="none"
                stroke="#22d3ee"
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
                opacity="0.9"
            />
            <!-- connector line; longer = more offset -->
            <line
                x1={d.bondX * unit}
                y1={d.bondY * unit}
                x2={d.centroidX * unit}
                y2={d.bondY * unit}
                stroke="#22d3ee"
                stroke-width="1"
                stroke-dasharray="3 3"
                vector-effect="non-scaling-stroke"
                opacity="0.7"
            />
        {/each}
    {/if}

    <!-- Phase 3: orphan badge (top-left corner mark on isolates) -->
    {#if layers.showOrphanBadge}
        {#each orphanIds as id (`orphan-${id}`)}
            {@const pos = layout.positions.get(id)}
            {#if pos}
                <circle
                    cx={pos.x * unit + 6}
                    cy={pos.y * unit + 6}
                    r={4}
                    fill="#f97316"
                    opacity="0.85"
                />
                <text
                    x={pos.x * unit + 12}
                    y={pos.y * unit + 9}
                    font-size="9px"
                    fill="#f97316"
                    opacity="0.85"
                >
                    orphan
                </text>
            {/if}
        {/each}
    {/if}

    <!-- Phase 3: rank gutter labels in the left margin -->
    {#if layers.showRankGutterLabels}
        {#each rankLabels as r (`rank-${r.rank}`)}
            <text
                x={-unit * 1.4}
                y={r.y * unit}
                font-size="10px"
                fill="#a3a3a3"
                opacity="0.75"
                font-weight="bold"
            >
                r{r.rank}
            </text>
        {/each}
    {/if}

    <!-- Phase 3: last-edit halo (1-second yellow ring; CSS animation handles
         the fade). Re-keyed by id so a new edit retriggers the animation. -->
    {#if layers.showLastEditHalo && lastEditPos}
        {#key lastEditPos.id}
            <circle
                class="last-edit-halo"
                cx={lastEditPos.x * unit}
                cy={lastEditPos.y * unit}
                r={(CARD_W_U / 2 + 0.5) * unit}
                fill="none"
                stroke="#fde047"
                stroke-width="3"
                vector-effect="non-scaling-stroke"
            />
        {/key}
    {/if}

    <!-- path step labels (renders when tracePath is set, no separate toggle) -->
    {#if tracePath}
        <!-- highlight person nodes in path -->
        {#each tracePath.ids as id (id)}
            {@const pos = layout.positions.get(id)}
            {#if pos}
                <circle
                    cx={(pos.x + CARD_W_U / 2) * unit}
                    cy={(pos.y + CARD_H_U / 2) * unit}
                    r={6}
                    fill="#FBBF24"
                    opacity="0.35"
                />
            {/if}
        {/each}

        <!-- label steps -->
        {#each tracePath.steps as step (step.from + "-" + step.to)}
            {@const fromPos = layout.positions.get(step.from)}
            {@const toPos = layout.positions.get(step.to)}
            {#if fromPos && toPos}
                {@const mx = ((fromPos.x + CARD_W_U / 2 + (toPos.x + CARD_W_U / 2)) / 2) * unit}
                {@const my = ((fromPos.y + CARD_H_U / 2 + (toPos.y + CARD_H_U / 2)) / 2) * unit}
                <text
                    x={mx}
                    y={my}
                    font-size="9px"
                    fill="#FBBF24"
                    font-weight="bold"
                    text-anchor="middle"
                    opacity="0.85"
                >
                    {step.via}
                </text>
            {/if}
        {/each}
    {/if}
</g>

<style>
    :global(.debug-overlay text) {
        font-family: ui-monospace, monospace;
        pointer-events: none;
        user-select: none;
    }
    /* Phase 3: last-edit halo — 1 s fade. Re-keyed by id so a new edit
       remounts the circle and restarts the animation. */
    :global(.debug-overlay .last-edit-halo) {
        animation: last-edit-fade 1s ease-out forwards;
    }
    @keyframes last-edit-fade {
        from {
            opacity: 0.85;
        }
        to {
            opacity: 0;
        }
    }
</style>
