---
name: tree-debugger
description: Investigate or fix layout / edge-routing bugs in the FamilyTreeEditor tree canvas — wrong segments, ghost nodes in the wrong row, mis-placed cards, drop heights out of range, degenerate verticals, missing horizontal buses, or anything visible on the SVG canvas that traces back to lib/layout/passes/. Use when a "wrong line" or mis-positioned card has been observed on the tree canvas. Workflow uses the window.__treeDebug console handle, the DebugOverlay panel (Ctrl+Shift+D), and the four-pass IR (LayeredGraph → OrderedGraph → PlacedGraph → Segment[]).
---

# Tree Debugger — How It Works & How to Approach Bugfixes

## What it is

A toggleable SVG overlay + browser-console handle that exposes the internals of
the layout/edge-routing pipeline directly on the canvas. It was built to make
visual layout bugs introspectable without sprinkling `console.log`s through
the layout code.

**Two pieces:**

1. **Visual overlay** — a Svelte component (`DebugOverlay.svelte`) rendered as
   an SVG `<g>` group on top of the tree, behind the regular edges and cards.
   Six toggleable layers, all opt-in.
2. **Console handle** — `window.__treeDebug`, populated by an `$effect` in
   `TreeCanvas.svelte`. Holds the four-pass IR snapshots, raw segments, and
   helper methods (`dumpSegment`, `findPath`).

## How to use it

**Open/close**: `Ctrl+Shift+D` toggles the floating panel center-top of the
canvas. The shortcut is intentionally hidden from the shortcuts overlay.

**Layers** (checkboxes in the panel):

| Layer | Color | What it shows |
|---|---|---|
| Unit grid | cyan | One line per integer unit; brighter every 10 units. Useful for sanity-checking that positions are in unit-space and not pixel-space. |
| Node bounds | lime / orange | Lime rect + id label for each real person; orange dashed rect with `ghost:` prefix for each ghost. |
| Segment IDs | by kind | Colored dot at every segment midpoint with the first 22 chars of the segment id. Color matches the kind (bond=gold, parent-drop=pink, sibling-bus=cyan, child-drop=green, stub=red). |
| Ghost arrows | orange | Dashed arrow from a real card to its ghost copy. Confirms which person is being duplicated and where. |
| Component bounds | purple | Dashed rect around each connected component with index, root id prefix, and size. |
| Bridge hops | orange | Hollow circle at every annotated hop on a vertical segment, plus its y-coord in units. |

**Path step labels** render automatically (no separate toggle) when a path
trace is active — yellow circles at each person in the path and `via` labels
between consecutive steps.

## The console handle: `window.__treeDebug`

```js
window.__treeDebug.layout          // HvLayoutResult shim — positions, ghosts, canvas
                                   // (components=[] — use orderedGraph/placedGraph for IR)
window.__treeDebug.orderedGraph    // OrderedGraph — nodes, ranks, order, parentEdges, spouseEdges
window.__treeDebug.placedGraph     // PlacedGraph  — nodes, x (Map), y (Map), bbox, edges
window.__treeDebug.rawSegments     // Segment[] in unit space (before × UNIT = 80)
window.__treeDebug.positions       // shorthand: layout.positions (Map<PersonId, {x,y}>)
window.__treeDebug.dumpSegment(id) // prints any segment whose id starts with `id`
window.__treeDebug.findPath(a, b)  // BFS over kinship graph; prints ids and step table
```

`rawSegments` are in **unit space**, not pixels. To convert to pixel space,
multiply by `UNIT = 80`.

**Ghost nodes** are first-class `LayoutNode` entries in `placedGraph.nodes`
with `kind === "ghost"`. Their id is `ghost:${ghostOf}|${nearId}`. Query them
directly from the IR rather than from `layout.ghosts` (the shim version drops
some per-partner detail):

```js
// All ghost nodes with their positions
[...window.__treeDebug.placedGraph.nodes.entries()]
  .filter(([, n]) => n.kind === "ghost")
  .map(([id, n]) => ({
    id,
    ghostOf: n.personId,
    x: +window.__treeDebug.placedGraph.x.get(id).toFixed(2),
    y: +window.__treeDebug.placedGraph.y.get(id).toFixed(2),
    rank: n.rank,
  }))
```

A single person can have multiple ghost copies (one per cross-rank spouse), so
always query by `n.personId`, not by node id alone.

### Wrap queries in `copy(JSON.stringify(…, null, 2))`

When sending diagnostics to a collaborator (or asking an LLM to interpret
them), don't paste raw object output — Chrome/Firefox truncate nested
objects and the `Array(184)` collapse loses every element past the first
few. Instead, wrap the result in `copy(JSON.stringify(value, null, 2))`:
the full structure lands on your clipboard as readable text. A few
ergonomics rules:

- **Cap rows.** `slice(0, 10)` after the filter. Long-tail dumps balloon
  the response and rarely add signal beyond the first ten.
- **Round floats.** `+(s.x1).toFixed(2)` keeps the output skimmable;
  `169.3447265625` adds noise without information.
- **Convert Maps/Sets to arrays.** `[...map.entries()]` so they survive
  `JSON.stringify`.
- **Aggregate before dumping.** Counts and groupings beat raw rows for
  spotting patterns (e.g. midpoint stacking shows up as a `count: 6`
  bucket but is invisible in a flat segment list).

Example pattern:

```js
copy(JSON.stringify(
  window.__treeDebug.rawSegments
    .filter(s => s.id.startsWith('bond:') && s.id.endsWith('/v2'))
    .slice(0, 10)
    .map(s => ({
      id: s.id,
      x1: +s.x1.toFixed(2), y1: +s.y1.toFixed(2),
      x2: +s.x2.toFixed(2), y2: +s.y2.toFixed(2),
    })),
  null, 2));
```

## How to approach a layout / edge-routing bug

### Step 1 — Make it concrete

The pipeline is:

```
domain Tree
  → layer()  → LayeredGraph   (rank assignment, ghost insertion)
  → order()  → OrderedGraph   (crossing minimisation, spouse/sibling constraints)
  → place()  → PlacedGraph    (Brandes–Köpf coordinate assignment)
  → route()  → Segment[]      (gutter-lane orthogonal routing)
  → SVG
```

A "wrong line" almost always boils down to: at which pass does a value go
wrong? Don't guess. Pick a representative bad segment from the screen, then
walk it backwards.

```js
// Find every segment with no horizontal extent
window.__treeDebug.rawSegments
  .filter(s => Math.abs(s.x2 - s.x1) < 0.5)
  .length

// Pull one out by id prefix
window.__treeDebug.dumpSegment("bond:GOHMT|L5QCM:0")
```

### Step 2 — Distinguish "expected" from "actual" verticals

Several segment kinds are vertical *by design*:

- `parent-drop` — always vertical (x1 == x2 = bondX or parentMidX)
- `child-drop` — always vertical (x1 == x2 = childMidX)
- `bond:.../v1`, `bond:.../v2` — the two vertical legs of an L-bond

A horizontal `bond:.../h` between L-bond legs is the only "horizontal bond"
thing inside an L-bond group. It can degenerate (x1 == x2) when both spouses
end up in the same column — which is itself a bug, but a different one than
"the horizontal doesn't exist."

Always check the actual ratio: a 1.8k-person tree should have **hundreds** of
horizontal segments (sibling buses, same-row bonds, L-bond /h's). If the count
is in the dozens, something upstream is wrong.

```js
// horizontal segments (excluding zero-length)
window.__treeDebug.rawSegments.filter(s =>
  Math.abs(s.y2 - s.y1) < 0.5 && Math.abs(s.x2 - s.x1) >= 0.5
).length
```

### Step 3 — Check positions before blaming the router

If the router is producing `x1 == x2` everywhere, ask whether the *positions*
it received are sane. Nine times out of ten the bug is upstream.

Toggle **Node bounds** and **Unit grid** together. You should see:

- Cards spread across many columns, not stacked in one. Different family
  branches should have a visibly larger gap (≈1.5 card-widths) than siblings
  within the same family (≈0.25 card-widths). If all gaps look equal, the
  `rankGaps` computation in `passes/place.ts` is not seeing the right parent
  edges.
- Cross-generation people on different rows (not all at y=0).
- Ghosts adjacent to their partners (not floating in the wrong row). The ghost
  and its near-partner should be exactly one `DELTA` (2.5 u) apart — they are
  treated as a close pair in the gap policy.

If positions look wrong → bug is in `passes/layer.ts` (rank assignment, ghost
insertion), `passes/order.ts` (within-rank ordering), or `passes/place.ts`
(coordinate assignment). If positions look right → bug is in `passes/route.ts`.

### Step 3.5 — Fingerprint drop heights

Histogramming `y2 - y1` for every parent-drop and child-drop is a fast
bug filter. Unlike the old router (fixed buckets 0.4/0.8/1.0), the new
gutter-lane router produces **variable heights** per lane (lane 0–3, each
0.2 u wide in a 0.8 u gutter). The invariants to check are:

| What | Healthy range | Meaning of a violation |
|---|---|---|
| Any drop `y2 - y1` | **> 0** | Negative = parent positioned below child. For joint couples this is the cross-row ghost failure: routing from the real position when a ghost should be used. |
| Any drop `y2 - y1` | **≤ ROW_H = 2.0** | Larger = routing crossed a rank boundary it shouldn't. |
| Single-parent same-column `child-drop` | **exactly 0.8** | Full gutter (card-bottom to child-top). Any other value means the bus-y computation is wrong. |
| Joint-couple `parent-drop` (bondY → busY) | **0.7 – 1.3** | Ranges across lanes 0–3. All lanes are valid; a value outside this range means bondY or busY is miscalculated. |
| Joint-couple `child-drop` (busY → childTop) | **0.1 – 0.7** | Complements parent-drop for the same lane: parent-drop + child-drop ≈ 0.8 + half-card = 1.4 per lane pair. |

A useful single query — all heights with counts, sorted by frequency:

```js
copy(JSON.stringify(
  Object.entries(
    window.__treeDebug.rawSegments
      .filter(s => s.kind === 'parent-drop' || s.kind === 'child-drop')
      .map(s => +(s.y2 - s.y1).toFixed(2))
      .reduce((a, h) => { a[h] = (a[h] || 0) + 1; return a; }, {})
  ).sort((a, b) => b[1] - a[1]),
  null, 2));
```

**Anything negative** is always a bug. **Anything > 2.0** is always a bug.
Values within [0.1, 0.8] but outside the expected lanes (0.2 multiples) mean
the lane allocator gave an unexpected slot — check for overlapping x-extents
passed to `GutterLanes.alloc`.

### Step 4 — Trace coordinate flow

Segment coordinates are built from a small set of local helpers in
`passes/route.ts` operating on `PlacedGraph`:

```
midX(pos) = pos.x + PERSON_W / 2        (card horizontal centre)
midY(pos) = pos.y + CARD_H / 2          (card vertical centre)
topY(pos) = pos.y                        (card top edge)
botY(pos) = pos.y + CARD_H              (card bottom edge)
leftX(pos) = pos.x
rightX(pos) = pos.x + PERSON_W
```

where `pos = { x: placed.x.get(nodeId), y: placed.y.get(nodeId), rank }`.

If a segment endpoint is wrong, one of these inputs (`pos.x`, `pos.y`) is
wrong, or the wrong helper was called. Use `dumpSegment` to read the literal
x1/y1/x2/y2, then look up positions directly from the IR:

```js
// Lookup by PersonId (real node)
window.__treeDebug.placedGraph.x.get("GOHMT")   // unit x
window.__treeDebug.placedGraph.y.get("GOHMT")   // unit y

// Lookup via HvLayout shim (same values, slightly different API)
window.__treeDebug.positions["GOHMT"]            // { x, y }

// Lookup a ghost node (need the full ghost LayoutNodeId)
const ghostId = "ghost:GOHMT|L5QCM";
window.__treeDebug.placedGraph.x.get(ghostId)
window.__treeDebug.placedGraph.y.get(ghostId)
```

### Step 5 — Pay attention to ghost-vs-real position routing

`route()` uses **ghost positions** for bond endpoints when partners are on
different ranks, by looking up `ghost:${ghostOf}|${nearId}` in `placed.nodes`.
Both the bond endpoints and the parent-drop/bus/child-drop skeleton are anchored
to the ghost position so they route locally to the children's row.

The earlier asymmetry (bonds use ghosts, drops use reals) has been eliminated:
all geometry for a cross-rank couple is derived from the ghost node in
`PlacedGraph`. Today's failure mode is different: a ghost placed at the wrong
rank by `layer()` will anchor the *whole skeleton* at the wrong y — no gap,
just visually wrong placement.

When debugging long-span couples, toggle **Ghost arrows** and verify:

1. Each ghost is at the **same rank** as its near partner (not the rank of the
   person it's a copy of).
2. `placed.nodes.get(ghostId).rank` matches `placed.nodes.get(nearId).rank`.
3. The ghost's x is within `DELTA` (2.5 u) of its near partner.

```js
// Check all ghost ranks vs their near-partner ranks
const pg = window.__treeDebug.placedGraph;
[...pg.nodes.entries()]
  .filter(([, n]) => n.kind === "ghost")
  .map(([id, n]) => {
    const nearId = id.split("|")[1];
    const nearRank = pg.nodes.get(nearId)?.rank;
    return { id, ghostRank: n.rank, nearRank, ok: n.rank === nearRank };
  })
  .filter(r => !r.ok)
```

### Step 6 — Read the tests as a spec

`tests/unit/layout/place.test.ts`, `tests/unit/layout/route.test.ts`, and the
other pass tests encode the expected behavior. If a test passes but the visual
is broken, the test is checking the wrong thing — strengthen the test alongside
the fix.

## Common bug patterns and where they live

| Symptom | Likely root cause | File |
|---|---|---|
| Lines connecting nothing (no bus between drop and child) | parent-drop and child-drop at different x, bus suppressed | `passes/route.ts` (bus guard / `busMinX < busMaxX`) |
| Bond floating above the family | ghost at wrong rank → bond routes at wrong row | `passes/layer.ts` (`choosePrimary`, ghost rank assignment) |
| Cards stacked in one column | `place()` median propagation collapsing to one x | `passes/place.ts` (type-1 conflict marking, or `rankGaps` wrong) |
| All gaps look equal (no visual branch separation) | `closePairs` not detecting siblings/spouses correctly | `passes/place.ts` (`rankGaps` computation, `parentsOf` map) |
| Ghost too far from near partner | `closePairs` missing ghost-near pair | `passes/place.ts` (`parseGhostNodeId` check in gap setup) |
| Bridge hops on intentional crossings | `sameGroup` id-prefix collision | `passes/route.ts` (`annotateHops`, `sameGroup`) |
| Ghost in wrong row | `nearRank` wrong in `layer()` | `passes/layer.ts` (`choosePrimary`, `ghostNodeId` assignment) |
| Cross-row bonds rendered as horizontals | ghost not found, falls through to L-bond path | `passes/route.ts` (ghost lookup in `buildSegments`) |
| Children placed off-center from parents | B-K averaging skew; `centerUnderParents` not correcting | `passes/place.ts` (`centerUnderParents`, `parentListOf` build) |
| Path highlight skips a segment | `segmentsForPath` matching predicate wrong | `pathHighlight.ts` |

## Don't do this

- **Don't fix symptoms.** A spurious vertical in one place often points to
  a coordinate computation that's wrong in many places. Find the root —
  the four-pass IR makes this tractable: confirm correct output at each pass
  boundary before moving to the next.
- **Don't add `console.log` in `route()`.** It runs inside the layout worker
  on every tree change; the console will flood. Use `dumpSegment` after the
  fact against the already-computed segments.
- **Don't trust filter counts at face value.** A filter like
  `|x2 - x1| < 0.5` catches both legitimately vertical segments AND degenerate
  horizontals. Always cross-check with kind + id.
- **Don't conflate "short" with "zero-length."** A same-column single-parent
  drop is `0.8` units (GUTTER_H) by construction. A "degenerate" filter like
  `|y2-y1| < 0.5` will sweep up legitimate drops. If you want truly-zero, use
  `=== 0` or `< 1e-6`, and sample 10 segments to verify before extrapolating
  from a count. `route()` already filters strictly-zero segments at its return
  boundary, so a non-trivial count there points at a real bug.
- **Don't widen the debug overlay's scope without good reason.** It's a
  diagnostic tool; new layers cost render time when enabled. Add a toggle,
  not "always-on" rendering.
- **Don't assume `layout.components` is populated.** The `layout` shim is
  produced by `placedGraphToHvLayout()`, which returns `components: []` — the
  new pipeline doesn't compute components. Use `orderedGraph` or `placedGraph`
  for per-node structural queries.
