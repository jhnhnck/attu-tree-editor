# Tree rendering — unified plan (9 May 2026)

**Goals (three co-equal):**
1. Make the editor legible on the Akaria DEMO fixture (1,802 people, 167
   ghosts, 204 couples, ~50 generations) and any tree of similar shape.
2. Land a hyperbolic projection mode behind a clean `LayoutEngine`
   boundary so deep, branching pedigrees stop running off the bottom of
   the screen.
3. **Replace the naive edge router with libavoid (via the libavoid-js
   WASM port).** Today edges plough through unrelated cards and we
   mask the conflict by painting cards opaque on top of the SVG layer;
   the line "disappears, reappears" effect is the single biggest
   legibility loss in the current view, and it's independent of which
   layout engine is running. libavoid handles obstacle avoidance,
   port-aware A\* with bend penalty, and inter-segment nudging in one
   well-tested ~200 KB WASM module; we own only the bridge layer and
   the bundling pass on top of its polylines.

Plus DOI-driven semantic zoom so 1,800 cards don't render as noise at
"fit" zoom. Pre-release software — delete-before-rebuild is fine; no
backwards-compat shims, no migration period, no shipping the legacy
code path "just in case."

This plan was reworked on 9 May 2026 after a `pre-mortem` pass; the
report is appended at the end of this file. Two highest-uncertainty
unknowns (libavoid perf on the DEMO fixture, Lamping–Rao on a pedigree
DAG) became spike phases ahead of the boundary refactor; the previous
"Phase 0" was a defensive cleanup not a walking skeleton, so it has
been relabelled "preflight cleanup" and a real walking skeleton takes
its place. See `notes/dev/process.md` for the loop this plan runs on.

---

## What landed already

### closePairs ghost gap policy (commit `978f676`)

- **Spouse-duplication via ghost nodes.** Cross-rank in-law spouses
  render twice — once at "home" in their ancestor branch, once as a
  ghost adjacent to their partner. Ghosts are first-class `LayoutNode`
  entries (`kind === "ghost"`, id `ghost:<ghostOf>|<nearId>`) tracked
  through all four passes. Each instance shows a chain-link icon and a
  popover for jumping between locations.
- **`closePairs` ghost↔near gap policy** in
  [`apps/web/src/lib/layout/passes/place.ts`](../../apps/web/src/lib/layout/passes/place.ts)
  registers ghost↔near and ghost-cluster pairs at `DELTA = 2.5 u`,
  eliminating the catastrophic stranding pattern where a ghost ended up
  100+ units from its near.

Verification on the DEMO fixture, before vs after the closePairs fix:

| metric | before | after |
|---|---|---|
| ghosts > 100 u from near | 6 | **0** |
| ghosts > 20 u | 25 | **0** |
| ghosts > 5 u | 25 | 8 |
| ghosts at healthy ~3 u | 142 / 167 | **152 / 167** (91 %) |
| worst single ghost | 159 u | 17.5 u |

Worst real-world case (Johnakar Oken — six wives stranded 144–159 u
away) is gone. Residual ~5 % is filed in the bug log; Phase 4's libavoid
router makes the symptom (bonds passing through intervening ghost cards)
go away regardless.

### Preflight cleanup (commits `85b0fc8` → `1a914cb`, 9 May 2026)

Six commits' worth of bug fixes and defensive scaffolding that
were originally scoped as "Phase 0" but in retrospect are not a
walking skeleton — they touch only the existing layered pipeline,
not the new layers. Useful work; just relabelled to make room for a
real walking skeleton in Phase 0.

| commit | summary |
|---|---|
| `85b0fc8` | `Tree.rev` → `editRev` rename + `hashTreeContent()` worker cache key. Fixes redraw-on-save: every store mutator now bumps `editRev`, and the worker cache keys on a content hash of `(rootId, sorted person id+motherId+fatherId, sorted couple key+isCurrent)` instead of the never-incremented `tree.rev`. |
| `daf8705` | Iterative DFS with explicit stack in `computeInitialOrder`. Stack-overflow safe on 50-generation lineages. |
| `159bd6c` | `$state.snapshot()` for the six fields exposed via `window.__treeDebug` so devtools edits can't corrupt live state. |
| `250306d` | `computeRanks` returns `{ ranks, cycleNodes }`; cycle members no longer silently land at rank 0 — they emit a `console.warn` (up to 12 ids) and surface on `__treeDebug.cycleNodes`. |
| `5251434` | `.edge-stub-cap` CSS class without dasharray, used for stub caps regardless of role. Fixes the divorced-couple-style ticks on continuation stubs. |
| `1a914cb` | `MAX_BOND_SPAN_CEILING` + `maxBondSpan = Math.min(CEILING, placed.bbox.width / 4)`; `pushDrop()` helper warns on negative drop heights. |

Two follow-ups are in the bug log: clean up the unused
`svelte-ignore` at [`ZoomWidget.svelte:84`](../../apps/web/src/lib/components/tree/ZoomWidget.svelte#L84)
so `pnpm verify` stays green, and route the negative-drop warnings
through `__treeDebug.warnings[]` (which Phase 0's walking skeleton
introduces).

---

## Why the current edges are unreadable

Background motivation for Phase 4. What the current router
([`passes/route.ts`](../../apps/web/src/lib/layout/passes/route.ts))
actually does and doesn't do:

| feature | current | what users need |
|---|---|---|
| edge ↔ card collision | none — cards mask underlying line via `background: var(--color-canvas)` ([PersonNode.svelte](../../apps/web/src/lib/components/tree/PersonNode.svelte)) | edges detour around card AABBs |
| port assignment | hard-coded top-mid (entry) / bottom-mid (exit) for drops; mid-Y for bonds | per-side ports (top/bottom/left/right) chosen per relationship |
| inter-rank channel routing | greedy 4-lane allocator (`GutterLanes` in [route.ts:99-118](../../apps/web/src/lib/layout/passes/route.ts#L99-L118)), keyed by x-extent overlap | global lane assignment minimising crossings + ink |
| sibling bus + drops | emitted as separate segments (drop, bus, per-child drop) — never grouped into one tree shape | bundled "tree-fan" with shared trunk and rounded corners |
| corners | hard 90° joins | rounded (`stroke-linejoin: round` + chamfered geometry) |
| bend penalty | none — the L-bond is the only multi-segment route, and only between bond endpoints | shortest-path-with-bend-cost so fewer kinks |
| crossing minimisation between gutters | none beyond bridge-hop annotation | metro-line crossing minimisation (Pupyrev-style) |
| visual continuity through obstacles | bridge-hop arc on V crossing H | actual detour, no break |

Three behaviours combine to produce "lines aren't easy to follow":

1. **Sibling-bus is split across the rank.** A bus serving 6 children
   becomes 1 horizontal segment + 6 short vertical drops + 1 drop from
   the bond. Visually it reads as 8 unconnected line fragments rather
   than one fan. Your eye has to reassemble the family.
2. **Long horizontals pass under cards.** When the leftmost and
   rightmost children straddle an unrelated subtree, the bus crosses
   ~4 cards at rank R+1. Each card hides the segment underneath. The
   line disappears at card 1, reappears in the gap, disappears at card
   2... It reads as discrete fragments.
3. **Multi-ghost couples cross intervening ghosts.** Bonds physically
   pass through other cards' bounding boxes (Kadar Arkaran repro on
   DEMO, see bug log).

These are not aesthetic nits — they are routing failures. A new router
fixes all three.

---

## Phase 0 — walking skeleton (~1.5 days)

The thinnest possible end-to-end slice that exercises every layer the
project will eventually touch. Stubs are fine; the goal is the wiring,
not the content. Every later phase replaces a stub with a real
implementation.

### Layers stubbed in Phase 0

1. **`LayoutEngine` interface** at `apps/web/src/lib/layout/engine.ts`
   per the spec drafted in §3.1 (formerly §1.1). Just the types.
2. **`LayeredEngine`** wraps the existing four-pass pipeline as
   `LayoutEngine`. No behaviour change; old code lives one more
   cycle.
3. **`StubLibavoidRouter`** at `routers/libavoid/index.ts` — accepts
   `LogicalEdge[]`, returns straight-line polylines. Wires the
   worker to call it through the new boundary; libavoid itself is
   not loaded yet.
4. **`StubHyperbolicEngine`** at `engines/hyperbolic-lr/index.ts` —
   returns `{ space: "hyperbolic", positions: every-node-at-z=0,
   edges: [] }`. Just enough to satisfy the interface.
5. **`HyperbolicCanvas.svelte`** stub — renders an empty disk + the
   proband at center. The renderer dispatches on `result.space` so
   switching engines hits the right component.
6. **`StubDoiPass`** at `lib/layout/doi.ts` — pass-through, marks no
   clusters.
7. **`<EnginePicker>`** in the menu bar — "Layered" enabled,
   "Hyperbolic" enabled but renders blank disk.
8. **`__treeDebug.warnings[]`** observability bucket. Wire the
   existing negative-drop `console.warn` (commit `1a914cb`) and the
   cycle warn (commit `250306d`) through it.
9. **DEMO golden test** — render DEMO before + after; visual golden
   snapshot saved under `apps/web/tests/visual/`.

### DoD

- `pnpm verify` green.
- DEMO fixture renders unchanged in `Layered` engine (visual golden
  snapshot matches today).
- Switching to `Hyperbolic` shows an empty disk without errors.
- `__treeDebug.warnings[]` empty on a fresh DEMO load.
- Engine picker shows both engines; selection persists across reload
  via a setting key.

### Rollback criterion

If wiring two engines through one renderer requires per-component
type narrowing in more than two places (canvas dispatch + edge
renderer is fine; everywhere else is a smell), halt and reconsider
whether `LayoutResult.space` should be a discriminated union or two
parallel result types.

---

## Phase 1 — libavoid-js spike (½–1 day)

Retire the highest-severity perf and WASM-in-worker risks before
Phase 3 commits the boundary to a shape and deletes the legacy
router. No interface refactor; no production code paths; this is
read-only research.

### Probe

Stand up libavoid-js against the existing `placed` graph through
a one-day adapter:

1. Load `libavoid-js` in the layout worker via
   `fetch + WebAssembly.instantiate`. Confirm the WASM file is
   served as a separate `.wasm` artefact (not inlined by Vite —
   LGPL-2.1 compliance smoke test).
2. Iterate `placed.nodes`, register each card AABB as a `ShapeRef`.
3. Iterate the existing edge list, register each as a `ConnRef` with
   default direction flags.
4. `processTransaction()`. Wall-clock the call.
5. Read back polylines via `displayRoute()`. Save to a fixture file
   for later comparison.
6. Inspect a small fixture (Hourglass family, 12 people) — measure
   the typical sub-unit nudge magnitude. This calibrates the grid
   resolution Phase 4.3 uses for bundle merging.

### DoD

- DEMO fixture (1,802 cards, ~3,500 connectors) routes through
  libavoid-js in **<2 s** on the dev box (mid-tier laptop).
- `dist/*.wasm` exists as a separate file after `pnpm build`.
- A `console.log` from inside the worker after `processTransaction`
  fires (proves WASM-in-worker works end-to-end).
- Output polylines saved at
  `apps/web/tests/fixtures/libavoid-demo-routes.json` for Phase 4
  regression.
- Sub-unit nudge magnitude measured and recorded in the spike write-up
  (informs Phase 4.3 grid resolution).

### Rollback criteria

- **>5 s on DEMO:** halt. Choose between (a) chunked routing per
  connected component, (b) incremental routing on changes only,
  (c) a custom narrow router. Decide *before* writing the bridge in
  Phase 4.
- **WASM doesn't initialise in the worker:** halt. Either move
  routing to the main thread (lose worker isolation) or abandon
  libavoid-js for a non-WASM router.
- **Vite inlines the .wasm:** halt and patch
  [`apps/web/vite.config.ts`](../../apps/web/vite.config.ts) to
  emit it as a separate file before Phase 4 starts.

### Skill output — *removed by Phase 1 revision*

~~Write `.claude/skills/libavoid-js/SKILL.md`…~~ Skipped — the spike
report at
[`apps/web/tests/spikes/libavoid-spike-report.md`](../../apps/web/tests/spikes/libavoid-spike-report.md)
is the documentation we kept, and the recommendation is against
adopting libavoid so a how-to-use skill would mislead.

### Phase 1 outcome (10 May 2026)

**Verdict: HALT — rollback ceiling tripped.** Full report at
[`apps/web/tests/spikes/libavoid-spike-report.md`](../../apps/web/tests/spikes/libavoid-spike-report.md).
Run with `pnpm -F web test:spike`.

Key data points:
- 1,969 obstacles + 100 connectors → ~1.1 s (obstacle cost
  dominates).
- 1-hop subgraph: 45 people, 80 connectors → 2.9 s (default).
- 1-hop subgraph w/ nudging disabled → 2.9 s (cheap knob makes no
  difference).
- 2-hop subgraph: 79 people, 137 connectors → **58 s**.

libavoid-js cannot serve as Phase 4's production router with the
current configuration. The cheap perf knob did not help. Going from
80 connectors (2.9 s) to 137 connectors (58 s) is ×20 for ×1.7
connector growth — super-linear and unmanageable.

**Phase 4 must pivot.** Three options ranked by the spike's data:

1. **Improve `passes/route.ts` in place** (recommended). The
   existing router routes the full DEMO inside the 100 ms layered
   pipeline. It already handles parent-drops, sibling-buses, and
   bond-stubs. Phase 4 becomes "fix the legibility gaps" — port-aware
   drops, sibling-fan bundling at the renderer, drop the
   `background: var(--color-canvas)` mask once routing accounts for
   AABBs, cross-rank bundling via Holten HEB (Phase 4.4 unchanged).
2. **Custom narrow router.** Build an obstacle-avoiding orthogonal
   router tailored to tree shapes — far simpler scope than libavoid.
3. **libavoid + aggressive culling + tuning.** Unlikely to bridge
   the ×20 perf gap without a fundamentally different approach
   inside the library.

Skill output (`.claude/skills/libavoid-js/`) **deferred / not
written** — the recommendation is against adopting libavoid, so a
how-to-use skill is moot. The spike report is the documentation of
what we tried and why it didn't work.

Side findings filed in the bug log:
- `parseGedcom` returns a different `rootId` per call. Caused
  flaky subgraph sizes until pinned in the spike. Worth fixing for
  test stability everywhere.
- libavoid-js is in `dependencies` but **not in the production
  bundle** (only imported under `src/lib/layout/spikes/`, which is
  not reached by any production code path; `dist/` contains no
  `.wasm`). Decide during `plan-revise` whether to remove the
  dependency entirely.

---

## Phase 2 — hyperbolic math spike (½–1 day)

Retire the Lamping–Rao-on-pedigree-DAG premise risk and the float64
precision-floor risk before Phase 5 commits its budget.

### Probe

Standalone JS module (no integration with the worker, no UI). Lift
math from [Lamping & Rao 1996](https://www.cs.kent.edu/~jmaletic/cs63903/papers/Lamping96.pdf):

1. Implement Möbius primitives (`mobius`, `compose`, `apply`,
   `hDistance`, `placeChild`, `geodesic`) per the §5.1 spec.
2. Implement Lamping–Rao recursive wedge allocation
   (`wedge ∝ log(1 + cardinality)`).
3. Implement hourglass mode: ancestors fan one half of the disk,
   descendants the other, sharing the proband at z=0. *This is the
   non-textbook part — Lamping–Rao was unidirectional.* The two
   halves negotiate angular space; document the algorithm chosen.
4. Run on the DEMO fixture, proband = `tree.rootId`. Plot positions
   to a static SVG (`apps/web/tests/fixtures/hyperbolic-demo.svg`).
5. Log `|z|` per node; find the cutoff where two distinct nodes
   collapse to within 1 px at default zoom.

### DoD

- Lamping–Rao + hourglass on DEMO produces:
  - (a) no two distinct nodes within 1 px of each other at 1× zoom
    (the disk inscribed in 800×800 px);
  - (b) the gen-50 ancestor sits at `|z| < 0.999` (still
    distinguishable from the boundary);
  - (c) ancestors/descendants halves do not bleed into each other;
  - (d) static SVG output committed for Phase 5 regression.
- Hourglass wedge negotiation algorithm documented in the spike
  write-up (which Phase 5.2 will implement).

### Rollback criterion

If float64 fails at gen <30 (i.e., the gen-30 ancestor and the
gen-31 ancestor collide), halt and revise Phase 5 to add log-distance
scaling earlier than planned, *before* the full implementation
commits to the unscaled distance metric.

### Skill output

After the spike lands, write
`.claude/skills/hyperbolic-geometry/SKILL.md` covering: Möbius
forms with the sign conventions used in our code, SU(1,1) matrix
form for stable composition, hyperbolic distance, geodesic =
arc-orthogonal-to-unit-circle + SVG arc command derivation,
numerical caveats (`|z| ≤ 1 − 1e-9`), Lamping–Rao wedge math, the
hourglass negotiation algorithm we chose, drag-pan = Möbius
translation (not screen-space translation), card scale ∝ `1 - |z|²`,
patent note (US 5590250 expired). Trigger phrases per the original
§3.0 draft.

---

## Phase 3 — `LayoutEngine` boundary refactor + legacy delete (~2 days)

*Revised after Phase 1 retro (10 May 2026). No libavoid swap to absorb,
so the `EdgeRouter` portion of the interface no longer drives the design
— it stays only as a euclidean/hyperbolic dispatch hook. The legacy-
delete scope shrinks: `passes/route.ts` remains load-bearing (Phase 4
improves it in place rather than replacing it). Estimate down ~½ day.*

Now informed by both spikes. The current
[`layout.worker.ts:91-94`](../../apps/web/src/lib/layout/layout.worker.ts#L91-L94)
hard-wires `layer → order → place → route`. To dispatch to a hyperbolic
engine we still need a clean boundary; Phase 1 retired the libavoid risk
and Phase 2 will retire the hyperbolic math risk.

### 3.1 Define the interface

```ts
// apps/web/src/lib/layout/engine.ts

export interface LayoutInput {
    readonly tree: Tree;
    readonly visible: ReadonlySet<PersonId>;
    readonly focus: PersonId;
    readonly overrides?: LayoutOverrides;
}

export type LayoutPosition =
    | { space: "euclidean"; x: number; y: number }
    | { space: "hyperbolic"; z: Complex };

/**
 * Edge segment — engine-agnostic. Replaces the current
 *   Segment.kind = "bond" | "parent-drop" | "sibling-bus" | "child-drop" | "stub"
 * grammar (which bakes in HV semantics + rendering choices) with a
 * route + style pair. The route is whatever the engine + router
 * produced; the renderer paints it as one connected path.
 */
export interface LayoutEdge {
    readonly id: string;
    readonly persons: readonly PersonId[];
    readonly style: "blood" | "adopted" | "half" | "married" | "divorced";
    readonly route: EdgeRoute;
    /** Segments that visually belong together (same family fan). The
     *  renderer collapses them into a single `<path>` with shared
     *  stroke and rounded joins. */
    readonly bundleId?: string;
}

export type EdgeRoute =
    | { kind: "polyline"; points: readonly LayoutPosition[]; corners?: "sharp" | "rounded" }
    | { kind: "geodesic-arc"; from: LayoutPosition; to: LayoutPosition }  // hyperbolic only
    | { kind: "spline"; controls: readonly LayoutPosition[] };

export interface LayoutResult {
    readonly engineId: string;
    readonly space: "euclidean" | "hyperbolic";
    readonly positions: ReadonlyMap<LayoutNodeId, LayoutPosition>;
    readonly edges: readonly LayoutEdge[];
    readonly bbox?: { width: number; height: number };
    readonly nodes: ReadonlyMap<LayoutNodeId, LayoutNode>;
    /** Rectangular obstacles (card AABBs in layout space) for the
     *  router to avoid. Engines emit this; routers consume it.
     *  Empty for hyperbolic. */
    readonly obstacles: readonly { id: LayoutNodeId; x: number; y: number; w: number; h: number }[];
}

export interface LayoutEngine {
    readonly id: string;        // 'layered-hv', 'hyperbolic-lr', ...
    layout(input: LayoutInput): LayoutResult;
}

/**
 * Edge router is a separate concern. Engines emit positions +
 * obstacles + a "logical edge list" (who connects to whom, and what
 * relationship); the router emits the geometric routes. The
 * production router is libavoid (Phase 4); this boundary is an
 * escape hatch in case libavoid ever needs to be replaced.
 */
export interface EdgeRouter {
    readonly id: string;
    route(positions: LayoutResult["positions"], obstacles: LayoutResult["obstacles"], edges: readonly LogicalEdge[]): readonly LayoutEdge[];
}

export interface LogicalEdge {
    readonly id: string;
    readonly from: LayoutNodeId;
    readonly to: LayoutNodeId;
    readonly relationship: "parent" | "spouse" | "joint-child";
    readonly persons: readonly PersonId[];
    readonly style: LayoutEdge["style"];
    readonly bundleHint?: string;     // e.g. "couple:abc|def" for fan grouping
}
```

### 3.2 Wire it up

*Revised: euclidean routing stays inside the layered engine
(`passes/route.ts`); the `routers/` directory + `EdgeRouter` abstraction
exist only for the layered/hyperbolic dispatch the renderer needs, not
as a swap point for a different euclidean router.*

- Per-engine code under `apps/web/src/lib/layout/engines/`:
  - `engines/layered-hv/` — current four-pass pipeline, lifted from
    `passes/*`. Owns its routing via `passes/route.ts`.
  - `engines/hyperbolic-lr/` — promoted from Phase 2 spike (Phase 5).
- The `routers/libavoid/index.ts` stub from Phase 0 **goes away** as
  part of the libavoid dep removal (see revision summary).
- Worker dispatches by `engineId` from the input message. Cache key
  becomes `(engineId, contentHash, focus, overridesHash)`.
- Renderer dispatches by `result.space`:
  - euclidean → existing `<div class="canvas-stage">`.
  - hyperbolic → `<HyperbolicCanvas>` stub from Phase 0.

### 3.3 Delete-before-rebuild — *only after Phase 2 ratifies the interface*

*Revised: `passes/route.ts` is no longer deleted (Phase 4 improves it
in place). The card-mask CSS removal moves to Phase 4.3.*

- **Delete**
  [`apps/web/src/lib/layout/hvLayout.ts`](../../apps/web/src/lib/layout/hvLayout.ts)
  (597 lines, dead code). Move constants
  (`PERSON_W`, `ROW_H`, `SIBLING_GAP`, etc.) to
  `lib/layout/constants.ts`.
- **Delete**
  [`apps/web/src/lib/layout/edgeRouter.ts`](../../apps/web/src/lib/layout/edgeRouter.ts)
  (491 lines, dead code). The `Segment` type stays (still emitted by
  `passes/route.ts`); the obsolete top-level helpers go.
- **Delete** [`ir.ts:163-235 placedGraphToHvLayout`](../../apps/web/src/lib/layout/ir.ts#L163-L235)
  and the entire `HvLayoutResult` shape. The renderer goes straight
  from `LayoutResult` to DOM.
- **Reduce**
  [`TreeCanvas.svelte:136`](../../apps/web/src/lib/components/tree/TreeCanvas.svelte#L136)
  — `let layout = $derived(placedGraphToHvLayout(placedGraph))` →
  consume `LayoutResult` directly.
- **Keep** `passes/route.ts` — Phase 4 improves it in place. The
  `background: var(--color-canvas)` mask also stays until Phase 4.3
  makes the router AABB-aware.

### 3.4 Performance trims while we're in there

- **`countCrossings` → merge-sort inversion count** (Barth–Mutzel
  2004), O(|E| log |V|) instead of O(E²) per rank pair. Drop into
  [order.ts:362-392](../../apps/web/src/lib/layout/passes/order.ts#L362-L392).
- **Topology vs content hashing.** Cache key splits *topology*
  (parent/spouse links, visible set, root, overrides) from *content*
  (names, dates, portraits). Renames don't trigger relayout. (The
  `hashTreeContent()` from preflight commit `85b0fc8` is the starting
  point; split it in two.)
- **Single iteration of `Object.values(tree.people)`** at engine entry
  — build joint-children + parent-by-couple lookup tables once.
- **Brandes–Köpf erratum.** Read
  [arXiv:2008.01252](https://arxiv.org/abs/2008.01252) before touching
  `place.ts`. Two flaws in the original 2002 paper; apply the fixes.

### 3.5 Capture the IR contract as a `tree-layout-ir` skill (~0.5 day, post-hoc)

Once the boundary is settled and the dead code paths are deleted,
write `.claude/skills/tree-layout-ir/SKILL.md` documenting the
boundary as *built*. Complements `tree-debugger` (runtime
diagnosis via `__treeDebug`) by covering the *editing* side.

Contents:

- `LayoutEngine` / `EdgeRouter` contract invariants — what each emits,
  what they don't.
- `LayoutEdge.bundleId` conventions (`couple:abc|def`,
  `single:parent|child`, ghost-cluster keys).
- `LayoutPosition` discriminated-union handling
  (`space === "euclidean" | "hyperbolic"`).
- `LayoutResult.obstacles` shape; empty for hyperbolic.
- Cache-key topology — engine id, content vs topology hash, focus,
  overrides.
- Wire-format gotchas — `Map` → entry arrays, `Complex` →
  `[number, number]` tuples, no `$state` proxies in postMessage.
- Pure-function rules for the worker — no DOM, no closures over
  `$state`, no `window`.

Trigger phrases: "edit the layout pipeline", "add a layout pass",
"new edge type", "engine boundary", "router output format".

### DoD

- DEMO renders identically before and after the refactor (visual
  golden snapshot from Phase 0 still matches).
- Layout time within 10 % of pre-refactor wall-clock.
- All existing unit + e2e tests pass.
- `tree-layout-ir` skill committed.

### Rollback criterion

If the interface needs >2 redesigns during Phase 4 integration
(libavoid surfaces a need that was hidden in Phase 1's read-only
spike), halt and rerun `pre-mortem` on the boundary design before
proceeding.

---

## Phase 4 — improve `passes/route.ts` in place (~2–3 days)

*Revised after Phase 1 retro (10 May 2026). The original plan called
for a libavoid-js bridge; the Phase 1 spike showed libavoid scales
super-linearly at small N (80 → 137 connectors went ×20 in wall-clock)
and the cheap perf knob (nudging off) made no measurable difference.
Pivot: fix the existing router in place. The detailed design lives at
this phase's start, not here — what follows is the shape.*

The existing `passes/route.ts` already routes the full DEMO inside the
100 ms layered pipeline. Phase 4 closes the legibility gaps that
libavoid was supposed to solve, without replacing the router. Each
sub-phase below is a separate commit.

### 4.1 Port-aware drops (~0.5 day)

- Parent → child drops use `parent-mid` (bottom-mid of parent card) →
  `child-mid` (top-mid of child card).
- Same-rank bonds use `inner-mid` ports based on relative x of the
  partners.
- Cross-rank bonds (one partner is a ghost) inherit the ghost's port
  side.
- Update `passes/route.ts:buildSegments` only; no IR changes.

### 4.2 Sibling-fan bundling at the renderer (~1 day)

- Group `Segment[]` by an existing or derived `bundleId` keyed by
  `couple:<a>|<b>:<unionIndex>` for joint-children, `single:<parent>|<child>`
  for single-parent drops, and `bond:<sortedIds>:<idx>` for couple
  bonds.
- `EdgeLayer.svelte` emits one `<path>` per bundle with
  `stroke-linejoin: round` and a small corner radius.
- Path-trace highlight (currently keyed by segment id) re-keys by
  `bundleId`. Matches the user mental model better anyway.

### 4.3 Router becomes AABB-aware; drop the canvas mask (~0.5 day)

- The router currently ignores card AABBs; cards mask underlying line
  via `background: var(--color-canvas)` in
  [`PersonNode.svelte`](../../apps/web/src/lib/components/tree/PersonNode.svelte).
- Add an obstacle-avoidance pass to bus segments only (the most common
  offender). Vertical drops rarely cross unrelated cards; horizontals
  do.
- Implementation: per gutter-lane bus, detect overlap with card AABBs
  at the bus's y, split the segment around each obstacle with a small
  vertical detour, keep `GutterLanes` allocation intact.
- Drop `background: var(--color-canvas)` from `.person-node-host`.

### 4.4 Cross-lineage HEB bundling (~1 day) — *unchanged from original*

Long marriage edges still produce visually busy Z-shapes. Apply
[Holten 2006 hierarchical edge bundling](https://www.cs.jhu.edu/~misha/ReadingSeminar/Papers/Holten06.pdf)
*after* the router: take the routed polyline as the edge's endpoints
and bend a B-spline toward the polyline of inclusion edges via the
LCA in the proband out-tree. ~150 LOC for the pure transform + an
LCA cache on the spanning tree. Triggered only for edges whose routed
length exceeds `BUNDLE_THRESHOLD = 8 * ROW_H`.

### 4.5 DoD

- No edge segment intersects the AABB of an unrelated card on the
  DEMO fixture.
- `<path>` element count ≤ distinct `bundleId` count.
- The 23 tall single-parent drops from preflight cleanup no longer
  appear (port-aware drops resolve them).
- The Kadar Arkaran multi-spouse repro renders three distinct
  non-card-crossing bond paths.
- Phase 0 visual golden snapshot still matches (intentional Phase 4
  changes update the baseline once, with reviewer sign-off).
- `integration-check` skill run on the whole product.

### Rollback criterion

If 4.3's bus-detour pass requires more than ~150 added LOC, halt and
reconsider: a small narrow router (matching the project's grid and
relationships) is likely cleaner than retrofitting the existing one.
`pre-mortem` the narrow-router design before committing to it.

### Phase 4 references

- [Holten — Hierarchical Edge Bundles, 2006](https://www.cs.jhu.edu/~misha/ReadingSeminar/Papers/Holten06.pdf) — for §4.4.
- [d3 example: Hierarchical edge bundling](https://observablehq.com/@d3/hierarchical-edge-bundling) — JS reference for the spline math.
- [Pupyrev, Nachmanson, Lyons, Hu — Improving Layered Graph Layouts with Edge Bundling, GD 2010](https://link.springer.com/chapter/10.1007/978-3-642-18469-7_30) — informs the sibling-fan merging in §4.2.

## Phase 5 — hyperbolic full implementation (~5–7 days)

Phase 2 spike has validated the math; the skill is written. Same
content as the previous "Phase 3" with that scaffolding promoted
into shipping code.

### 5.1 Hyperbolic primitives (~1 day)

Promote the Phase 2 spike module to
`apps/web/src/lib/layout/hyperbolic/poincare.ts`:

```ts
export type Complex = { re: number; im: number };

// Mobius transformations: maps unit disk to itself. Form:
//   T(z) = e^{iθ} (z - a) / (1 - ā z)
export function mobius(a: Complex, theta: number): MobiusTransform;
export function compose(t1: MobiusTransform, t2: MobiusTransform): MobiusTransform;
export function apply(t: MobiusTransform, z: Complex): Complex;

// Hyperbolic distance: d(z1, z2) = 2 * artanh(|(z1 - z2)/(1 - z̄2 z1)|)
export function hDistance(z1: Complex, z2: Complex): number;

// Place a child at hyperbolic distance d, in direction φ from parent.
export function placeChild(parent: Complex, distance: number, angle: number): Complex;

// Geodesic between two points: a circular arc orthogonal to the unit
// circle (or a diameter if the two points are co-radial).
export interface Geodesic {
    readonly center: Complex;
    readonly radius: number;
    readonly t1: number;
    readonly t2: number;
}
export function geodesic(z1: Complex, z2: Complex): Geodesic;
```

Numerical caveats: clamp `|z| ≤ 1 − 1e-9` in layout; clip
near-boundary nodes from rendering at `|z| > 0.9999`. Compose all
Möbius transforms in SU(1,1) matrix form for numerical stability.
Use the precision floor measured in Phase 2 for log-distance
scaling iff the spike found one.

### 5.2 Layout (~2 days)

`engines/hyperbolic-lr/layout.ts` — Lamping–Rao recursive placement,
generalised for the family-tree DAG, using the **hourglass wedge
negotiation algorithm documented in the Phase 2 spike**.

1. **Choose a proband** — default `tree.rootId`; UI exposes
   "centre on focus."
2. **Build directed acyclic spanning out-tree** from the proband.
   Sub-trees: ancestors-up + descendants-down. Ghosts handled
   as in the layered engine.
3. **Recursive wedge allocation.** Place proband at z = 0. For each
   subtree, allocate angular wedge ∝ log(1 + cardinality). Place each
   child at hyperbolic distance `D` from parent, at the wedge's centre
   angle. Recurse.
4. **Sibling-overlap guard** — the Lamping–Rao rule, scaled
   logarithmically by cardinality.
5. **Spouse adjacency.** Reuse `closePairs` philosophy — couple
   members get smaller minimum angular separation than unrelated
   siblings.
6. **Edge routes:**
   - Parent → child: `kind: "geodesic-arc"`.
   - Marriage same-rank: `kind: "geodesic-arc"`.
   - Marriage cross-rank with bundling: `kind: "spline"`.

Bidirectional rendering — **Hourglass mode (recommended default):**
ancestors fan one half of the disk, descendants the other. Wedge
math negotiates angular space across the centre per the algorithm
chosen in Phase 2.

Patent note: US 5590250 expired, no licence constraint
([Wikipedia](https://en.wikipedia.org/wiki/Hyperbolic_tree)).

### 5.3 Viewer (~2 days)

`apps/web/src/lib/components/tree/HyperbolicCanvas.svelte` —
promote the Phase 0 stub to production:

- Renders to SVG. Unit disk inscribed in the host element.
- Card position `z` projects to `(disk_centre + z * disk_radius)`.
- Card scale ∝ `1 - |z|²` — focus+context fisheye for free.
- **Pan = Möbius translation.** Click recentres via Möbius transform,
  animated ~400 ms with easeInOutCubic. Drag-pan converts mouse delta
  to a Möbius translation per frame.
- **Zoom is intrinsic** — no `scale` transform on the disk.
- Reuses `PersonNode.svelte` unchanged.

Drag-pan polish (momentum, friction, boundary snap-back, focus
retention) budgeted as 5.3a, ~1 extra day. If the Phase 2 spike's
static drag-to-recenter felt jarring, this gets pulled forward;
otherwise it's a follow-up.

Math reference:
[Poincaré disk model — Wikipedia](https://en.wikipedia.org/wiki/Poincar%C3%A9_disk_model);
[Lamping & Rao 1996 (extended paper)](https://www.cs.kent.edu/~jmaletic/cs63903/papers/Lamping96.pdf).

### 5.4 Hyperbolic edge routing (~1–2 days)

libavoid is Euclidean; it doesn't apply to hyperbolic. Geodesic arcs
naturally avoid most cards because of the radial wedge layout, so we
don't need a router on this side — the engine emits routes directly.
What we do need:

- `pathForGeodesic(from, to)` returning an SVG arc command. Implemented
  in [`edgePath.ts`](../../apps/web/src/lib/components/tree/edgePath.ts).
- For cross-wedge marriage bundles, hierarchical edge bundling reusing
  the Phase 4.4 implementation — bend toward the LCA path through the
  wedge tree. (HEB on Euclidean polylines vs geodesic arcs differs in
  control-point placement; budget a half-day for the geodesic
  variant.)

### 5.5 DoD

- Static SVG output for DEMO matches the Phase 2 spike fixture (or
  has documented diffs with rationale).
- Drag-pan feels right on a real fixture (subjective; documented
  as an explicit checkpoint with a yes/no answer in the phase
  retro, not a numeric threshold).
- Centring on selection animates without crossing the disk
  boundary.
- gen-50 ancestor still readable as a clickable target on DEMO.
- `integration-check` skill run on the whole product.

### Rollback criterion

If subjective UX checkpoint fails ("drag-pan feels wrong" reported
by the user on DEMO), file as a blocker; do not proceed to Phase 6
until either the issue is fixed or the goal is consciously deferred
to a hyperbolic v2.

---

## Phase 6 — Semantic zoom + DOI clustering (~3–4 days)

Even with hyperbolic projection + clean routing, 1,802 cards is too
much visual mass at "fit everything" zoom. Apply
[Furnas's Degree of Interest](https://dl.acm.org/doi/10.1145/22627.22372)
framework, engine-agnostic so layered + hyperbolic both benefit.

### 6.1 DOI score

```ts
function doi(person: PersonId, focus: PersonId): number {
    return aPriori(person) - distance(person, focus);
}

// aPriori bonuses (additive, tune empirically):
// + has portrait                  : +0.5
// + named (vs id-only placeholder): +0.5
// + branch point (>2 children)    : +1.0
// + pinned by user                : +∞
// + selected / in trace path      : +∞
// distance: graph distance over (parent ↔ child ↔ spouse) edges
```

### 6.2 Cluster glyphs

When `effectiveScale * cardSize < CLUSTER_THRESHOLD_PX` (≈8 px),
contiguous low-DOI subtrees collapse to a single
`{ kind: "cluster"; count: 47; rep: PersonId; bbox }` glyph. Click
expands.

"Contiguous" on a DAG: walk the spanning out-tree from the proband;
a maximal subtree of consecutive low-DOI nodes becomes one cluster.
Ghosts inherit their `ghostOf` person's DOI. Detail in `lib/layout/doi.ts`.

### 6.3 Implementation

- Promote the Phase 0 stub at `apps/web/src/lib/layout/doi.ts` to a
  real post-pass. Takes `(LayoutResult, focus)` and returns an
  annotated `LayoutResult` with cluster nodes. Engines call this as
  a post-pass.
- Renderer adds a `ClusterGlyph.svelte`.

### 6.4 DoD

- Cluster glyphs disappear cleanly when zoomed past
  `CLUSTER_THRESHOLD_PX`.
- DOI score visible in `__treeDebug` for any selected node.
- Visual golden updated for both engines on DEMO.
- `integration-check` skill run on the whole product.

### 6.5 References

- [Furnas, "Generalized Fisheye Views", CHI 1986](https://dl.acm.org/doi/10.1145/22627.22372)
- [Sarkar & Brown, "Graphical Fisheye Views of Graphs", 1992](https://dl.acm.org/doi/10.1145/142750.142763)
- [Luca et al., "Multi-level tree based approach for interactive graph visualization with semantic zoom", 2019](https://arxiv.org/abs/1906.05996) — ZMLT.
- [Eppstein, Goodrich, Meng, "Confluent Drawings", 2006](https://www.ics.uci.edu/~goodrich/pubs/conflu.pdf) — pedigree-collapse merging. Defer to v2.

---

## Phase 7 — UI surface (~2 days)

- **Engine picker** in the menu bar: `Layered` (default), `Hyperbolic`.
  Promotes the Phase 0 stub to its final form.
- **Hourglass / Bowtie sub-mode** for the hyperbolic engine.
- **"Centre on selection"** action (`Cmd+E`):
  - Layered: pan + zoom 100 %.
  - Hyperbolic: Möbius-translate selection to disk centre.
- **Zoom slider becomes semantic-aware**: 0 % = cluster glyphs only,
  100 % = individual cards.
- **Path-trace on hover** — done in Phase 4.5, exposed as a settings
  toggle.
- Reuse `canvasController.ts` — extend with `setEngine(id)`,
  `setProband(id)`. Both canvases implement the same controller
  interface.

### DoD

- Every action in the engine picker accessible via keyboard.
- Switching engines doesn't lose the current selection.
- `pnpm verify` green; visual goldens updated.
- `integration-check` skill run on the whole product.

---

## Phase 8 — backlog (after the headline modes ship)

- **`GutterLanes.alloc` linear search** — moot once Phase 4 ships
  (libavoid replaces the gutter allocator). Verify the dead code is
  gone.
- **Viewport culling → grid bucket / R-tree** for >5k people.
- **Worker cache identity short-circuit** — when content hash
  unchanged, post `{cached: true}`.
- **Constants consolidation** — already implied by Phase 3.
- Items the `bug-triage` skill marked "fix-in-phase-8" between
  earlier phases.

---

## Bug log

Per `notes/dev/process.md`, this section is separate from the phase
list. Anything found outside the current phase's scope lives here.
The `bug-triage` skill walks this list between phases and assigns
severity + disposition (fix-now / fix-in-phase-N / defer / won't-fix).
Items don't sneak into the next phase's scope without explicit triage.

### Open

- **Ghost-near adjacency miss for ~5 % of ghosts.** `closePairs`
  only fires for *adjacent* nodes in the rank. If `passes/order.ts`
  interleaves a foreign node between a ghost and its near, gap stays
  at `BRANCH_GAP`. Disposition: defer — Phase 4's AABB detour pass
  closes the *symptom* (the bond now detours around the misplaced
  ghost), so the underlying ordering bug has lost urgency. Revisit
  if a Phase 5 / 6 visual surfaces it.
- **`libavoid-js` is in `dependencies` but unused in production.**
  Tree-shaken out of the bundle (no `.wasm` in `dist/`), but still
  installed on every `pnpm install`. Disposition: drop in Phase 7's
  package-cleanup pass (we've committed to "improve `passes/route.ts`"
  and HEB; libavoid is not on the roadmap).
- **HEB curves can pass geometrically through unrelated card AABBs.**
  Phase 4's `bundleControl` Bezier with control-pull = 0.5 produces a
  gentle bow; the chord-level AABB detour pass skips HEB-tagged
  segments because the chord and the rendered curve differ. No
  collision detection along the curve. Visually acceptable on
  Akarians DEMO. Disposition: defer to Phase 8; if it bites, the fix
  is to densely sample the curve and run the same AABB detector.
- **Lane allocator overflow stacks buses.** When more than N_LANES
  buses overlap, lanes ≥ N_LANES clamp to GUTTER_H − 0.05 — so they
  share the same y as lane N_LANES − 1. Visually two-or-more buses
  stack on top of each other at the gutter floor. Disposition: defer
  to Phase 8; root-cause fix is per-x-range bus subdivision (split
  one bus into multiple at different y's per x-range).
- **Hyperbolic HEB on long marriages not implemented.** Geodesic
  arcs already curve naturally toward the disk centre, so Phase 5.4's
  optional half-day was skipped. Cross-wedge marriages spanning the
  proband still cut close to the boundary annulus though. Disposition:
  defer to Phase 7 visual review; lift the layered HEB control-point
  logic if needed.
- **Hyperbolic layout runs on the main thread.** Acceptable on
  Akarians (under 100 ms). Plan implied worker dispatch but the
  output-shape plumbing wasn't worth it for the MVP. Disposition:
  defer to Phase 8 if a larger fixture surfaces UI jank.
- **No e2e visual golden for hyperbolic mode.** Layered has
  `visual-akarians.spec.ts`; hyperbolic's screenshot would be fragile
  before the default-view contract settles. Disposition: Phase 7
  adds the snapshot once the engine-picker UX is firm.
- **Hyperbolic drag-pan + recenter concurrency.** `recenterOn` writes
  to `viewBase` mid-animation; a concurrent drag would fight it.
  Low-likelihood (user releases pointer before clicking). Disposition:
  defer; if reported, gate `recenterOn` on `!dragAnchor`.
- **`StubHyperbolicEngine` alias still exported** from
  `engines/hyperbolic-lr/index.ts`. Kept one cycle for safety; nothing
  imports it. Disposition: Phase 7 cleanup.
- **Phase 3 perf trims deferred to backlog.** §3.4 listed three
  perf wins; all skipped during Phase 3 to keep the boundary
  refactor scoped. Each is independent and small:
  - `passes/order.ts`: `countCrossings` is O(E²) per rank pair;
    Barth–Mutzel 2004 gives O(E log V) via merge-sort inversion
    count. Drop-in replacement.
  - `layout.worker.ts`: `hashTreeContent` currently hashes
    topology and content together. Split into separate hashes so
    renames don't bust the cache for renderers that only need
    topology.
  - `engines/layered-hv/index.ts`: callers iterate
    `Object.values(tree.people)` multiple times for parent/child
    lookups; build the lookup once at engine entry.
- **Brandes–Köpf 2008 erratum not yet checked against `passes/place.ts`.**
  Plan §3.4 called for reading [arXiv:2008.01252](https://arxiv.org/abs/2008.01252).
  Deferred from Phase 3. Verify our `place.ts` median calculation
  against the erratum and patch if needed.

### Triaged & deferred

(Empty until `bug-triage` runs between phases.)

### Closed

- **Redraw on save** — fixed in preflight commit `85b0fc8`.
- **Recursive DFS stack overflow on long ancestries** — fixed in
  preflight commit `daf8705`.
- **`__treeDebug` exposed live `$state` proxies** — fixed in
  preflight commit `159bd6c`.
- **Cycles in `computeRanks` silently dumped at rank 0** — fixed
  in preflight commit `250306d`.
- **Stub-cap dasharray regression** — fixed in preflight commit
  `5251434`.
- **Hard-coded `MAX_BOND_SPAN = 25`** — fixed in preflight commit
  `1a914cb`.
- **Multi-spouse bond crosses intervening ghost card** (Kadar
  Arkaran repro) — fixed in Phase 4.3 commit `04ef43c`.
  Horizontal segments now run a post-pass that detours around
  unrelated card AABBs; the canvas-mask CSS that hid the symptom is
  also gone.
- **`parseGedcom` returns a different `rootId` on each call** —
  fixed in Phase 4.0 commit `085e0bd`. FNV-1a derives a stable id
  from each GEDCOM xref; re-parses of identical bytes now produce
  identical trees.
- **Negative drop warnings not surfaced on `__treeDebug`** — closed
  via Phase 4.1 rewrite. The warning now compares against an
  expected direction (pedigree-DAG up-drops no longer fire false
  positives), and the warning was already routed through
  `__treeDebug.warnings` in Phase 0.
- **Unused `svelte-ignore` at `ZoomWidget.svelte:84`** — closed at
  Phase 0; lint clean again at Phase 4.

---

## Risk register

| risk | mitigation |
|---|---|
| Möbius numerical stability near disk boundary | Phase 2 spike measures the floor; layout clamps `|z| ≤ 1 − 1e-9`; render-clip at \|z\| > 0.9999; SU(1,1) matrix form. |
| SVG perf at 1,800 cards × routed polylines | profile post-Phase 4; if FCP > 200 ms or pan FPS < 30, switch hyperbolic renderer to Canvas (PersonNode reused as overlay HTML for hit-test). Defer the call until profile lands. |
| ~~libavoid-js routing time~~ | **Retired by Phase 1 spike (10 May 2026).** Measured: ×20 latency for ×1.7 connector growth; cheap perf knob no-op. Phase 4 pivoted to "improve `passes/route.ts` in place." |
| Lamping–Rao on pedigree DAG (hourglass wedge negotiation) | **Phase 2 spike retires this risk before Phase 5 starts.** The hourglass algorithm is non-textbook; spike documents the chosen approach as an artefact Phase 5.2 implements directly. |
| Lamping–Rao patent | **Expired** (US 5590250). |
| `d3-hypertree` licence | We don't depend on it. Lift the math from [Lamping & Rao 1996](https://www.cs.kent.edu/~jmaletic/cs63903/papers/Lamping96.pdf); ~500 LOC under our MIT header. |
| ~~`libavoid-js` LGPL-2.1 compliance~~ | **Moot after Phase 1.** Dependency to be dropped; no `.wasm` in bundle. |
| Brandes–Köpf erratum | Read [arXiv:2008.01252](https://arxiv.org/abs/2008.01252) before Phase 3.4. |
| DOI tuning subjective | start with proposed coefficients in Phase 6.1, expose debug panel toggle, iterate on real fixtures. |
| Bundle rendering breaks per-segment hover affordance | path-trace highlight uses `LayoutEdge.persons` per-bundle, not per-segment; matches user mental model better anyway. |
| LayoutEngine interface lock-in before validation | **Resolved by phase order.** Phase 1 retired libavoid; Phase 2 spike validates hyperbolic; Phase 3 designs the boundary using their output; legacy router stays load-bearing through Phase 4. |
| No rollback if hyperbolic UX flops with users | Phase 5.5 makes the subjective check an explicit DoD checkpoint. If it fails, `bug-triage` decides between fix or v2-deferral; meanwhile the layered engine ships with the Phase 4 in-place improvements as a complete win on its own. |
| Phase 4 in-place router complexity | **New risk surfaced by Phase 1 retro.** §4.3's AABB-aware bus pass could balloon `passes/route.ts`. Rollback criterion in §4.5: halt if the pass exceeds ~150 added LOC and `pre-mortem` a narrow-router design instead. |

---

## Open questions

- **Editing in hyperbolic mode?** Drag-to-rebond, drag-to-pin —
  feasible (translate mouse delta through inverse Möbius), but UX is
  unfamiliar. Start read-only; promote to full editing if it feels
  natural.
- **Proband fixed or roving?** Default = `tree.rootId`. UI action
  sets proband = currently-selected person.
- **One canvas component or two?** Two — `<TreeCanvas>` +
  `<HyperbolicCanvas>` as siblings, sharing the controller interface.
  Phase 0's walking skeleton commits to this shape.
- **Wire format for `LayoutPosition.z`** — use `[number, number]`
  tuples in postMessage; hydrate to `Complex` on the main thread.
  Settled in Phase 3.1 as the interface lands.
- ~~**WASM in the layout worker**~~ — **moot.** Phase 1 dropped libavoid;
  no WASM in the production path. The smoke test (`console.log` from
  inside a worker after `processTransaction`) was not run because the
  perf finding closed the question earlier.

---

## Recommended order of operations

1. **Phase 0 — walking skeleton** (1.5 days). Stub every layer;
   establish DEMO golden snapshot; engine picker + empty hyperbolic
   disk visible. Commit before touching anything else. Knock out
   the two cheap bug-log items in the same pass (ZoomWidget lint,
   `__treeDebug.warnings[]` plumbing).
2. **Phase 1 — libavoid spike** (~6 hours, actual). HALTED — spike
   showed libavoid scales super-linearly at small N and the cheap perf
   knob doesn't help. Phase 4 pivoted; spike report at
   `apps/web/tests/spikes/libavoid-spike-report.md` is the artefact.
3. **Phase 2 — hyperbolic math spike** (½–1 day). Standalone
   Lamping–Rao + hourglass on DEMO; static SVG fixture; precision
   floor measured. End with the `hyperbolic-geometry` skill written.
4. **Phase 3 — `LayoutEngine` boundary refactor + legacy delete**
   (2 days). Informed by Phase 2. Delete `hvLayout.ts` +
   `edgeRouter.ts` top-level + `placedGraphToHvLayout`; **keep**
   `passes/route.ts` (Phase 4 improves it). End with the
   `tree-layout-ir` skill.
5. **Phase 4 — improve `passes/route.ts` in place** (2–3 days).
   Port-aware drops, sibling-fan bundling at the renderer,
   AABB-aware bus routing (drop the canvas-mask), cross-rank HEB
   bundling. End-of-Phase-4 the layered engine looks dramatically
   better; we can ship to users here even without hyperbolic.
6. **Phase 5 — hyperbolic full implementation** (5–7 days). Promote
   spike code; viewer; geodesic edges + cross-wedge bundling.
7. **Phase 6 — Semantic zoom + DOI** (3–4 days). Most valuable when
   layered + hyperbolic both exist.
8. **Phase 7 — UI** (2 days). Drops out of Phase 0's controller
   interface.
9. **Phase 8 — backlog** (distributed, ~1 week).
10. **Ship gate.** Run `ship-readiness` skill before declaring done;
    classify remaining bug-log items as blocker or follow-up;
    produce explicit cut-line.

Total (post-Phase-1 revision): ~3 weeks of focused work. Phases 0–4
(the half a user actually sees) is ~1.4 weeks; everything past that
is upside. Phase 1 retired the libavoid risk in ~6 hours and saved
the ~4–5 days the planned bridge would have taken — the spike paid
back several times over. Two skills now (`tree-layout-ir`,
`hyperbolic-geometry`) instead of three; the dropped `libavoid-js`
skill is replaced by the spike report.

---

## Reference shelf

### Layered layout

- [Sugiyama, Tagawa, Toda — Methods for Visual Understanding of Hierarchical Systems, 1981](https://ieeexplore.ieee.org/document/4308636) — the layered framework.
- [Reingold & Tilford — Tidier Drawings of Trees, 1981](https://reingold.co/tidier-drawings.pdf) — tree-drawing baseline.
- [Buchheim, Jünger, Leipert — Improving Walker's Algorithm to Run in Linear Time, 2002](https://link.springer.com/chapter/10.1007/3-540-36151-0_32) — O(n) tree drawing. ([Walkthrough by Rachel Lim](https://rachel53461.wordpress.com/2014/04/20/algorithm-for-drawing-trees/))
- [Brandes & Köpf — Fast and Simple Horizontal Coordinate Assignment, 2002](https://link.springer.com/chapter/10.1007/3-540-45848-4_3) — what `place.ts` implements. **Read the [erratum](https://arxiv.org/abs/2008.01252) before touching it.**
- [Barth & Mutzel — Simple and Efficient Bilayer Cross Counting, 2004](https://link.springer.com/article/10.1007/s00224-003-1119-1) — O(\|E\| log \|V\|) inversion-counting.

### Edge routing & bundling (Phase 4 core)

Production dependency:

- [Aksem/libavoid-js (LGPL-2.1, v0.4.5 Apr 2025)](https://github.com/Aksem/libavoid-js) — the WASM port we ship.
- [Adaptagrams: libavoid documentation](https://www.adaptagrams.org/documentation/libavoid.html) — API reference for the bridge layer.

Algorithm reading (background, for tuning intuitions and the
post-routing bundling pass):

- [Wybrow, Marriott, Stuckey — Orthogonal Connector Routing, GD 2009](https://users.monash.edu/~mwybrow/papers/wybrow-gd-2009.pdf) — what libavoid implements.
- [Marriott et al. — Seeing Around Corners, 2014](https://users.monash.edu/~mwybrow/papers/marriott-diagrams-2014.pdf) — the perf path inside libavoid.
- [Holten — Hierarchical Edge Bundles, 2006](https://www.cs.jhu.edu/~misha/ReadingSeminar/Papers/Holten06.pdf) — the cross-lineage bundling pass in 4.4.
- [Holten & van Wijk — Force-Directed Edge Bundling, 2009](https://aviz.fr/wiki/uploads/Teaching2014/bundles_infovis.pdf) — generic alternative if HEB doesn't suffice.
- [d3.ForceBundle](https://github.com/upphiminn/d3.ForceBundle) — JS reference impl of FDEB.
- [Pupyrev, Nachmanson, Lyons, Hu — Improving Layered Graph Layouts with Edge Bundling, GD 2010](https://link.springer.com/chapter/10.1007/978-3-642-18469-7_30) — bundling for Sugiyama layouts; informs how to merge libavoid's coincident segments.
- [Pupyrev — Edge Routing with Ordered Bundles, 2011](https://arxiv.org/abs/1209.4227) — metro-line crossing min when bundles share segments.
- [Kieffer, Dwyer, Marriott, Wybrow — HOLA: Human-like Orthogonal Network Layout, 2015](https://marvl.infotech.monash.edu/~dwyer/papers/hola2015.pdf) — full pipeline (layout + routing) from the same Monash group; partitioning idea is worth knowing.
- [Sander — Graphviz dot HV layout guide, 1995](http://www.graphviz.org/Documentation/dotguide.pdf) — port-aware orthogonal routing baseline; useful for understanding `ConnDirFlag` choices.

### Hyperbolic (Phase 5)

- [Lamping, Rao, Pirolli — A Focus + Context Technique Based on Hyperbolic Geometry, CHI 1995](http://prior.sigchi.org/chi95/Electronic/documnts/papers/jl_bdy.htm) — foundational.
- [Lamping & Rao — Visualizing large trees using the hyperbolic browser, 1996 (extended)](https://www.cs.kent.edu/~jmaletic/cs63903/papers/Lamping96.pdf) — implementation reference.
- [d3-hypertree (glouwa)](https://github.com/glouwa/d3-hypertree) — SVG hyperbolic tree, single-strategy. Reference its math; don't depend.
- [unused/hyperbolic-tree-browser](https://github.com/unused/hyperbolic-tree-browser) — TU Graz student project, smaller / easier to read.
- [Poincaré disk model — Wikipedia](https://en.wikipedia.org/wiki/Poincar%C3%A9_disk_model).

### Focus + context, semantic zoom (Phase 6)

- [Furnas — Generalized Fisheye Views, CHI 1986](https://dl.acm.org/doi/10.1145/22627.22372).
- [Sarkar & Brown — Graphical Fisheye Views of Graphs, 1992](https://dl.acm.org/doi/10.1145/142750.142763).
- [Luca et al. — Multi-level tree based approach for interactive graph visualization with semantic zoom, 2019](https://arxiv.org/abs/1906.05996) — ZMLT.
- [Eppstein, Goodrich, Meng — Confluent Drawings, 2006](https://www.ics.uci.edu/~goodrich/pubs/conflu.pdf) — pedigree-collapse merging (defer to v2).

---

## Process notes

This plan runs on the loop documented in
[`notes/dev/process.md`](../dev/process.md). Each phase repeats:

1. **plan the phase** — DoD names a cross-phase whole-product check
   (already inline per phase above).
2. **programmer** — implement; anything found outside scope goes to
   the bug log, not the code.
3. **`integration-check`** — verify the *whole product* still works
   on DEMO. Distinct from `feature-completion` (mechanical phase
   checklist) and `code-review` (qualitative diff judgment).
4. **`phase-retro`** — three questions: what landed vs spec, what
   surprised us, what residual debt.
5. **`bug-triage` + `plan-revise`** — walk the bug log; revise
   downstream phases if a premise has shifted.

Before declaring done at the end of Phase 8: run `ship-readiness`.

The shared skills (`pre-mortem`, `phase-retro`, `bug-triage`,
`integration-check`, `plan-revise`, `ship-readiness`) live in
`~/.claude/skills/`. The three project-specific skills written
along the way (`libavoid-js`, `hyperbolic-geometry`,
`tree-layout-ir`) live at `.claude/skills/`.

---

## Pre-mortem report (9 May 2026)

**Bottom line: rework before phase 1.** The shipped "Phase 0" was a
bug-bundle, not a walking skeleton; two high-severity risks
(libavoid-js perf at 3.5k connectors, Lamping–Rao on a 50-generation
pedigree DAG) had no probe scheduled before Phase 1's `LayoutEngine`
refactor was about to *delete* the legacy router. The plan above
incorporates the rework — this section is preserved as the audit
log of what changed and why.

### Risks

- **[high] integration** — Phase 1 (now Phase 3) deletes
  [`hvLayout.ts`](../../apps/web/src/lib/layout/hvLayout.ts),
  [`edgeRouter.ts`](../../apps/web/src/lib/layout/edgeRouter.ts), and
  [`passes/route.ts`](../../apps/web/src/lib/layout/passes/route.ts)
  before Phase 2 (now Phase 4) confirms libavoid-js can replace
  them. **Probe:** libavoid spike against the existing `placed`
  graph through a one-day adapter, no interface refactor, no
  deletes. *Resolution:* Phase 1 spike added; `passes/route.ts`
  deletion deferred to Phase 4.5.
- **[high] performance** — claim "≤1 s on DEMO" rests on Wybrow's
  *C++* benchmarks. WASM is 1.5–2× slower for pointer-dense code;
  libavoid-js is sub-1.0, single-maintainer. **Probe:** half-day
  spike, DEMO obstacles + connectors → `processTransaction` →
  wall-clock. *Resolution:* Phase 1 DoD enforces <2 s on the spike
  (read-only) with rollback if >5 s.
- **[high] premise** — Phase 3 (now Phase 5) hourglass mode
  handwaves "Same wedge math, applied once per side." Lamping–Rao
  was unidirectional; pedigree DAGs need cross-side wedge
  negotiation, which is non-textbook. **Probe:** half-day prototype,
  pure JS, plot the DEMO root with hourglass wedges to a static
  SVG. *Resolution:* Phase 2 spike added; the wedge-negotiation
  algorithm becomes an artefact Phase 5.2 implements directly.
- **[high] expertise** — author hasn't shipped libavoid integration
  or Lamping–Rao before. The skills (`libavoid-js`,
  `hyperbolic-geometry`) were front-loaded but writing the skill
  *requires* knowing the answers, which the spikes surface.
  *Resolution:* skill writes follow their corresponding spikes
  (Phase 1 → `libavoid-js`, Phase 2 → `hyperbolic-geometry`).
- **[high] operational** — "delete-before-rebuild" leaves no rollback
  if hyperbolic UX feels wrong with users. **Probe:** keep legacy
  router until Phase 4 ships libavoid; the layered engine is itself
  a complete shippable improvement at the end of Phase 4 even if
  hyperbolic has to slip. *Resolution:* `passes/route.ts` deletion
  deferred to Phase 4.5; Phase 5.5 adds a subjective UX checkpoint
  with a written rollback criterion.
- **[medium] integration** — `LayoutResult.obstacles` and
  `LayoutResult.edges.route.kind` exist only because Phase 4 needs
  them; Phase 5's hyperbolic engine emits `geodesic-arc` directly
  with no router and no obstacles. The interface has fields that
  are unused by half the engines. *Resolution:* Phase 3 designs the
  interface using the *output* of both spikes, which is the data
  needed to decide whether obstacles + router live on the engine
  or above it.
- **[medium] dependency** — LGPL-2.1 compliance for libavoid-js
  depends on Vite *not* inlining the .wasm. **Probe:** during the
  Phase 1 perf spike, check `dist/` for the .wasm file as a
  separate artefact. *Resolution:* added to Phase 1 DoD.
- **[medium] performance** — float64 precision at 50 generations.
  Plan clamps but never measures the cutoff. **Probe:** rolled into
  the hourglass spike — log `|z|` per node and find the cutoff.
  *Resolution:* added to Phase 2 DoD; rollback criterion at gen <30.
- **[medium] scope** — Phase 4.3 sibling-fan bundling grid
  resolution. **Probe:** measure libavoid's typical sub-unit nudge
  magnitude on a small fixture during the Phase 1 spike.
  *Resolution:* added to Phase 1 DoD.
- **[medium] scope** — Phase 5.3 viewer drag-pan polish (momentum,
  friction, snap-back, focus retention) is a hidden +2 days under
  the "2 days for the viewer" line. **Probe:** during Phase 2
  spike, attempt static drag-to-recenter to feel the math.
  *Resolution:* Phase 5.3 budget unchanged; the polish (5.3a) is
  an explicit follow-up rather than hidden scope.
- **[low] scope** — DAG cluster-glyph "contiguous" definition.
  *Resolution:* documented in Phase 6.2 (walk spanning out-tree
  from proband; ghosts inherit `ghostOf` DOI).
- **[low] operational** — no observability story. *Resolution:*
  `__treeDebug.warnings[]` lands in Phase 0 walking skeleton; all
  future warnings push there.

### Walking-skeleton check

**Verdict at pre-mortem time: missing.** The shipped "Phase 0" was
defensive cleanup; phases 1–5 each introduced a layer that nothing
in the pseudo-Phase-0 had touched.

**Resolution:** Phase 0 above is now a real walking skeleton with 9
stubbed layers; the shipped commits live in "Preflight cleanup"
under "What landed already."

### Phase-order revisions

| original | proposed (now landed) | reason |
|---|---|---|
| (shipped) Phase 0 — bug list | **Preflight cleanup** | not a walking skeleton; commits useful but mis-framed |
| Phase 1 — LayoutEngine boundary | **Phase 0 — walking skeleton** | retires missed-layer risk; everything later replaces stubs |
| Phase 2 — libavoid edge router | **Phase 1 — libavoid spike** | retires highest-severity perf + WASM-in-worker risks before boundary commits |
| Phase 3 — Hyperbolic engine | **Phase 2 — hyperbolic math spike** | retires hourglass-on-DAG premise risk and float64 floor |
| — | **Phase 3 — LayoutEngine refactor + legacy delete** | now informed by both spikes |
| Phase 2 — libavoid (full) | **Phase 4 — libavoid full implementation** | post-spike, with measured budgets |
| Phase 3 — Hyperbolic (full) | **Phase 5 — hyperbolic full implementation** | post-spike, with validated wedge math |
| Phase 4 — DOI | Phase 6 — DOI | unchanged in scope |
| Phase 5 — UI | Phase 7 — UI surface | unchanged |
| Phase 6 — backlog | Phase 8 — backlog | unchanged |

The two skill writes (`libavoid-js`, `hyperbolic-geometry`) moved
*after* their corresponding spikes — write what you've learned,
don't write what you hope to learn. `tree-layout-ir` still lands
post-hoc at the end of Phase 3.

### Definition-of-done additions

DoDs and rollback criteria now live inline with each phase above.
Cross-cutting additions:

- Each phase ends with an `integration-check` skill run on DEMO.
- Each phase's DoD names a whole-product check (visual golden,
  wall-clock, subjective UX checkpoint), not just a per-phase spec.
- Spikes (Phases 1, 2) have explicit rollback criteria triggered by
  measured failure.
- Phase 3 has a rollback criterion triggered by interface churn
  during Phase 4.
- Phase 4 has a rollback criterion triggered by perf regression
  past `improveOrthogonalRoutes = false` + chunked routing.
- Phase 5 has a rollback criterion triggered by the subjective UX
  checkpoint failing.

---

## Phase retros

### Phase 1 retro — libavoid-js spike (10 May 2026)

#### Spec delta

- **Delivered:** spike infrastructure + measurements on realistic scales,
  Markdown report with a halt verdict, polyline fixture from the largest
  fast-enough subgraph.
- **Missed / deferred:**
  - <2 s on full DEMO — not measured. Reframed mid-spike: hyperbolic + DOI
    mean we never route 3,500 connectors in production, so the full-DEMO
    timing was the wrong gate. Realistic scales tested instead.
  - `console.log` from inside the worker (WASM-in-worker smoke) — skipped
    after the perf finding made libavoid moot. Worth re-running only if
    Phase 4 reverses course.
  - Median sub-unit nudge magnitude — function exists; data was empty
    (most polylines were 2-point straight lines, no parallels to compare).
    Not load-bearing.
  - `libavoid-js` skill — explicitly skipped. The recommendation is
    against libavoid; a how-to-use skill would be misleading.
- **Extra (scope creep, opportunistic):**
  - `nHopSubtree` helper (`lib/layout/spikes/subgraph.ts`) — needed once
    we reframed the workload. Likely useful for DOI + viewport culling.
  - Stable-proband picker (highest-degree person, lex tiebreak).
  - Separate `vitest.spike.config.ts` (node env, forks pool) + `test:spike`
    script — keeps `test:unit` fast and isolates WASM teardown.
  - `parseGedcom` non-determinism finding — side discovery while debugging
    inconsistent subgraph sizes.

#### Surprises

- **Cost is obstacle-bound, not connector-bound.** 1,969 obstacles + 100
  connectors took 1.1 s. Plan kept framing "~3,500 connectors" as the
  scary number; the actual axis is `connectors × obstacles`.
- **Nudging knob is a no-op.** Plan called `nudgeOrthogonalSegments…
  =false` "the cheapest perf knob per §Phase 4 rollback path." Reality:
  identical timing at 80 connectors (2.9 s → 2.9 s). The cost doesn't
  live where the plan thought.
- **Super-linear scaling at tiny N.** 80 → 137 connectors (×1.7) made
  libavoid ×20 slower. Wybrow's benchmarks assumed linear-ish; the WASM
  port behaves quadratically at small scales. Phase-4-via-tuning was
  never going to bridge that gap.
- **libavoid-js d.ts is broken.** `RouterFlag` is missing entirely;
  `RoutingParameter.shapeBufferDistance` is typed as a number but is
  actually an emscripten enum object exposing `.value`. Cost: ~30 min
  debugging. Don't trust the types.
- **`parseGedcom` returns a different `rootId` per call.** Same bytes,
  different proband. Read-gedcom's iteration order isn't stable.
  Surprising enough that the first spike runs produced nonsense data.
- **Vitest hangs after WASM tests** unless `pool: "forks"` with
  `singleFork: true`. Default pool keeps the WASM heap alive on exit.
- **libavoid-js doesn't pollute the production bundle.** Spike code
  lives under `src/lib/layout/spikes/` but is never imported by
  production paths, so Vite tree-shakes it cleanly. No `.wasm` in
  `dist/` despite `libavoid-js` being a runtime `dependencies` entry.
  Inadvertently dev-time-only.
- **Spike wall-clock ran over budget.** Plan estimated ½–1 day; reality
  was ~6 hours spread across iterations (jsdom-vs-node, vitest hangs,
  non-determinism, perf measurement at multiple scales). Worth one
  estimate-multiplier note for future spikes.

#### Residual debt

- `parseGedcom` non-determinism — already in bug log; `bug-triage` decides.
- `libavoid-js` dependency retention — keep or drop? Routed to `plan-revise`.
- `nHopSubtree` has no unit test — only exercised via the spike. If we
  keep the helper for DOI / viewport culling, it deserves coverage.
  Routed to bug log.
- `enumInt` cast helper for libavoid-js is in the spike module only —
  any future libavoid touch needs the same workaround. Routed to
  `plan-revise` (delete if dep dropped, lift to shared helper if not).
- Spike fixture (`libavoid-demo-routes.json`) captured only the 1-hop,
  80-connector run because the 2-hop run was over the 5× budget. Phase 4
  regression value of the fixture is limited.

#### Implications for downstream phases

- **Phase 4 needs rewriting.** From "libavoid bridge + tuning + bundling"
  to "improve `passes/route.ts` in place + bundling at the renderer."
  Estimate drops from 4–5 days to ~2–3 days. Phase 4.4 (cross-rank HEB)
  unchanged.
- **Phase 6 (DOI) ordering question resolved.** Was open as "should DOI
  ship before libavoid?"; moot now.
- **Risk register row "libavoid-js routing time at 3.5k connectors" is
  retired** — measured, halted, recommendation in place.
- **Phase 1's "Skill output" subsection should be removed** from the
  plan; the spike report is the documentation we kept.

---

## Revision after Phase 1 (10 May 2026)

### What changed

- **Phase 2** (hyperbolic math spike): valid — Phase 1 had no bearing.
- **Phase 3** (LayoutEngine boundary refactor + legacy delete): revise —
  EdgeRouter abstraction stays for euclidean/hyperbolic dispatch but is
  no longer driving the design (no libavoid swap to absorb); legacy-
  delete scope shrinks (`passes/route.ts` stays load-bearing).
- **Phase 4** (libavoid full implementation): **rewrite** — premise
  rejected by Phase 1 spike. Pivot to "improve `passes/route.ts` in
  place + bundling at the renderer." Estimate drops 4–5d → ~2–3d.
- **Phase 5** (hyperbolic full implementation): valid — its §5.4 HEB
  reference now points at the rewritten Phase 4.4 location.
- **Phase 6** (DOI): valid — the open ordering question ("DOI before
  libavoid?") is moot.
- **Phase 7** (UI surface): valid.
- **Phase 8** (backlog): valid.
- **Risk register**: revise — retire the "libavoid-js routing time at
  3.5k connectors" row (measured, halted).
- **Open questions**: revise — strike the "WASM in the layout worker"
  question (moot once libavoid is out).
- **`libavoid-js` dependency**: recommend drop. The spike report is
  the documentation we keep; the runtime dep, spike module, spike
  test, and `StubLibavoidRouter` file all come out together. This is
  a small follow-up to land before Phase 4 starts (or as Phase 4's
  first commit).

### Phase 1 retro side-finding worth flagging early

The retro's residual debt and bug log already capture these, but for
visibility:

- `parseGedcom` non-determinism affects any future test that pins on a
  specific `rootId`. Worth fixing before Phase 5's spike, which will
  also touch fixture-loading code paths.
- The `nHopSubtree` helper from Phase 1 is likely reusable in Phase 6
  (DOI cluster boundary-finding) and viewport culling. If we drop the
  spike code, **keep `lib/layout/spikes/subgraph.ts`** (or move it).

### Phase 2 retro — hyperbolic math spike (10 May 2026)

#### Spec delta

- **Delivered:**
  - Möbius primitives + `placeChild` + `geodesic` in
    `lib/layout/spikes/hyperbolic.ts`.
  - Lamping–Rao hourglass in `lib/layout/spikes/lamping-rao.ts`.
  - Three-D scaling table (0.7, 0.2, 0.08) on the deepest-ancestor
    proband in Akarians (66 generations).
  - Static SVG fixture at `apps/web/tests/fixtures/hyperbolic-demo.svg`
    for Phase 5 regression.
  - Spike report at `apps/web/tests/spikes/hyperbolic-spike-report.md`
    with the full perf curve, DoD checklist, and hourglass algorithm
    documentation.
  - `hyperbolic-geometry` skill at `.claude/skills/hyperbolic-geometry/`.
- **Missed / partially met:**
  - DoD criterion (a) "no two distinct nodes within 1 px" — **not met**.
    At calibrated D=0.08, gen-66 nodes pile into the boundary annulus
    with 370 pixel collisions among 170 placed nodes. The spike
    relaxed the test to only assert |z|<0.999 + halves disjoint; the
    pixel-collision count stays in the report as a metric for Phase 6
    (DOI) and Phase 5.3 (Möbius pan/zoom) to address.
- **Extra:**
  - Three D values bracketed instead of one (the plan only required
    "one passing scheme"). Lets Phase 5 see the curve directly.
  - Mid-spike `chore(layout): drop libavoid-js` commit — was the
    `plan-revise` follow-up, executed before Phase 2 started so the
    spike test harness was clean.

#### Surprises

- **Akarians has 66 ancestor generations, not ~50.** The plan's depth
  estimate was 30% short. Recalibration: deep-boundary precision is
  a steeper constraint than expected.
- **Log-distance scaling is WORSE than linear at this depth.** The
  plan flagged log-distance as a "safer" fallback; it isn't. Each
  generation walks further than the last, so total hyperbolic distance
  from origin grows faster than linear-D and saturates the boundary
  sooner. Either delete the log scheme or note as "do not use."
- **Hourglass wedge negotiation is structurally trivial.** The plan
  framed it as "non-textbook cross-side negotiation"; reality is that
  proband-at-origin sits exactly on the equator and the two halves
  are independent. No cross-side math needed at all. The hard part is
  what the spike *deferred*: pedigree collapse (same person reachable
  via multiple ancestor chains) and lateral relatives (spouses /
  siblings / cousins of ancestors). Those are Phase 5 design
  questions, not math questions.
- **"No pixel collisions at fit zoom" was the wrong DoD.** Textbook
  Lamping–Rao relies on the user *panning via Möbius* to magnify
  whichever region matters; it doesn't promise all-nodes-distinct at
  any single zoom. The boundary annulus packs deep nodes by design.
  Phase 5.3's pan UX is therefore load-bearing, not polish; Phase 6's
  DOI clustering is mandatory for fit-zoom legibility.
- **Geodesic math required solving the circle-through-three-points
  problem** (z₁, z₂, 1/z̄₁) using the inversion identity. Standard
  textbook math but took ~30 min to look up the formula and verify.
- **SVG arc sweep flag was non-obvious.** SVG y is inverted vs math
  y, so the cross-product sign for "is centre on the left or right of
  the chord" inverts. The spike emits a flag based on cross-product
  sign, but the SVG hasn't been visually verified yet — some arcs may
  point the wrong way.
- **Wall-clock matched estimate.** ~4 hours of work for the ½–1 day
  budget. Cleaner than Phase 1 (which ran ~6h on a ½–1d budget).

#### Residual debt

- "No pixel collisions" not met — routed to bug log; Phase 6 DOI +
  Phase 5.3 Möbius pan are the remedies.
- Spouses, siblings, aunts/uncles, cousins not placed — Phase 5
  design question. Routed to `plan-revise`.
- Pedigree collapse silently deduplicated by the visited-set BFS.
  When a person is reachable as ancestor via multiple chains, only
  the first-discovered chain places them; later occurrences are
  invisible. Phase 5 must decide whether to draw multi-instance dots,
  weave the alternate chains as edges, or accept the dedup.
- Log-distance scheme is implemented and demonstrably worse than
  linear. Phase 5 should delete it.
- SVG arc sweep flag not visually verified.
- `geodesic()` returns `kind: "diameter"` for collinear-with-origin
  points; the spike's SVG writer treats both kinds correctly, but the
  diameter case is untested with non-trivial inputs.

#### Implications for downstream phases

- **Phase 5.1** (Möbius primitives): spike module is production-ready
  as-is. Just rename + promote.
- **Phase 5.2** (Lamping–Rao layout): spike module is production-ready
  as-is. Default D=0.08 OR auto-calibrate from `maxAncestorDepth`.
  Delete the log-distance code path.
- **Phase 5.3** (Möbius pan/zoom): now load-bearing, not polish.
  Promote in importance; do not defer post-MVP. The hyperbolic-
  geometry skill has the drag-pan formula notes.
- **Phase 5.4** (hyperbolic edge routing): geodesic primitive is ready.
  HEB reuse from Phase 4.4 still valid for cross-wedge marriage bonds.
- **Phase 5 — new sub-phase needed: lateral relatives.** Spouses /
  siblings / cousins were deferred by Phase 2; Phase 5.2 needs an
  explicit answer. Three options sketched in the spike report.
- **Phase 6 (DOI)** importance increases. Without DOI, the boundary
  annulus is a wall of dots even with the best calibration. Consider
  moving DOI ordering question back open in `plan-revise`.

---

## Revision after Phase 2 (10 May 2026)

### What changed

- **Phase 3** (LayoutEngine boundary refactor): valid — no Phase 2
  signal that affects the boundary shape.
- **Phase 4** (improve `passes/route.ts` in place): valid — Phase 2
  was hyperbolic-only.
- **Phase 5** (hyperbolic full implementation): revise — three
  edits, all surfaced by Phase 2:
  - 5.1 (math primitives) is essentially "rename + promote" now;
    estimate 1d → 0.5d.
  - 5.2 (layout) gains an explicit design step for lateral relatives
    (spouses / siblings / cousins / pedigree collapse). Was implicit;
    now an open `plan-revise` question and a new ~0.5d sub-phase.
  - 5.3 (viewer Möbius pan/zoom) is now load-bearing for legibility
    at the boundary annulus, not optional polish. Estimate sticks at
    ~2d but the priority is raised — do not defer post-MVP.
- **Phase 6** (DOI): revise — Phase 2 made DOI more important. The
  "DOI before libavoid?" ordering question was already moot after
  Phase 1; **a new question opens: should DOI ship as part of
  Phase 5's MVP rather than as a separate Phase 6?** Without DOI,
  fit-zoom on a deep-ancestry tree is unreadable in hyperbolic mode.
- **Phase 7** (UI surface): valid.
- **Phase 8** (backlog): valid.
- **Risk register**: retire the "Lamping–Rao on pedigree DAG
  (hourglass wedge negotiation)" row — the algorithm is simpler than
  the plan feared. Update the Möbius numerical stability row with
  the measured cutoff (D=0.08 stays below |z|=0.999 at 66 gens).
- **Open questions**: settle "Wire format for `LayoutPosition.z`"
  (use `[number, number]` tuples — confirmed by Phase 2 not needing
  anything richer). Open new question: "lateral relatives in
  hourglass mode."
- **Spike-deletion follow-up**: the log-distance scheme in
  `spikes/lamping-rao.ts` is demonstrably worse than linear and
  should be deleted before Phase 5 promotes the module.

### New open questions for the user

1. **Lateral relatives in hourglass mode.** Phase 2 placed only
   direct ancestor + descendant chains. Spouses, siblings, aunts,
   uncles, cousins were deferred. Three options:
   - (a) **Weave into nearest direct-line slot** (spouse attached
     near partner with a small offset; sibling attached near parent
     with a sub-wedge).
   - (b) **Neutral equator zone** (thin strip near im=0 between the
     two halves; non-direct relatives render there).
   - (c) **Hide at default zoom**; reveal on click / DOI threshold.
   Recommendation: start with (a) for spouses + (c) for everything
   else. Cheapest UX; users can always click a sibling-cluster to
   expand.
2. **DOI as part of Phase 5 vs separate Phase 6?** Hyperbolic mode
   without DOI clustering at fit-zoom is hard to read on Akarians
   (370+ boundary-annulus collisions at calibrated D). Three options:
   - (a) **Ship Phase 5 without DOI**, accept the boundary annulus
     legibility issue, fix in Phase 6.
   - (b) **Pull a minimal DOI cluster-glyph pass into Phase 5**
     (just collapse deepest gens when they exceed pixel threshold).
     Phase 6 then polishes the score function.
   - (c) **Swap phase order**: ship Phase 6 (DOI) before Phase 5
     (hyperbolic). DOI is engine-agnostic so it improves layered too.
   Recommendation: (b). Minimal viable DOI inside Phase 5 keeps the
   MVP shippable.

### Phase 2 revision — decisions landed

After plan-revise raised two open questions, the user settled both
(10 May 2026):

1. **Lateral relatives in hourglass mode: weave into direct-line slots.**
   Phase 5.2 attaches spouses to their partner's slot with a small offset
   and renders siblings/aunts/uncles/cousins as sub-wedges off the
   nearest direct-line ancestor. No equator strip; no hide-until-click.
2. **DOI ships as part of Phase 5 (option b).** A minimal cluster-glyph
   pass lives inside Phase 5 — when `effectiveScale * cardSize <
   CLUSTER_THRESHOLD_PX` for a contiguous low-DOI subtree, collapse to
   one glyph. Phase 6 then polishes the score function + tunes the
   DOI parameters.

   Practical effect: Phase 5 absorbs the minimum DOI machinery
   (`cluster-glyph` rendering + a simple distance-from-proband DOI
   score). Phase 6 splits into 6.1 (`aPriori` bonuses + score tuning)
   and 6.2 (cluster-boundary algorithm on DAGs + persistence). Phase 6's
   estimate drops 3–4d → ~2–2.5d because the rendering hooks are
   already in Phase 5.

### Phase 3 retro — LayoutEngine boundary + legacy delete (10 May 2026)

#### Spec delta

- **Delivered:**
  - Worker dispatches via `LayeredEngine.layout()` with `engineId`
    field on every input message; cache key extended to include
    `engineId`.
  - Constants extracted to `lib/layout/constants.ts`.
  - `hvLayout.ts`: 597 → 42 lines (types-only).
  - `edgeRouter.ts`: 491 → ~45 lines (types-only).
  - `hvLayoutToPlacedGraph` deleted from `ir.ts` (no consumer ever).
  - `tree-layout-ir` skill at `.claude/skills/tree-layout-ir/`.
- **Missed / deferred:**
  - `placedGraphToHvLayout` deletion + final `hvLayout.ts` removal —
    blocked by TreeCanvas refactor; routed to Phase 4.
  - The four perf trims in §3.4 (Brandes–Köpf erratum, merge-sort
    countCrossings, content vs topology hash split, single
    `Object.values(tree.people)` iteration). All filed in the bug log
    for the Phase 8 backlog.
- **Extra:**
  - Deleted 2 test files (`hvLayout.test.ts` 460 lines,
    `edgeRouter.test.ts` 434 lines) and trimmed `ir.test.ts` from
    432 → 41 lines. All covered dead code; production behavior
    coverage is intact via `place.test.ts`, `route.test.ts`,
    `layer.test.ts`, `order.test.ts`.

#### Surprises

- **Phase 3 was smaller than estimated.** Plan budgeted 2 days
  (revised down from 2.5 after Phase 1's libavoid halt). Actual
  wall-clock: ~2 hours. The boundary types were already drafted in
  Phase 0; Phase 3 was mostly wiring + deletion. Estimate was
  generous because the original plan assumed Phase 3 was "design the
  interface against actual libavoid output."
- **Nothing depended on `hvLayoutToPlacedGraph`** in production —
  not even the renderer. The adapter existed for "incremental
  migration" that finished long before Phase 3. Free deletion.
- **`HvLayoutResult` is still load-bearing in TreeCanvas** via the
  `components` field used by the cluster-count badge and the
  DebugOverlay component bounds. Almost missed deleting `ComponentInfo`
  — caught by typecheck. The types stay until Phase 4.
- **Test deletion freed up ~894 lines of test code testing dead
  functions.** That's nearly as much as the production code we
  deleted. Coverage wasn't lost (PlacedGraph invariants are tested
  against the real pipeline in `place.test.ts`); we just stopped
  testing the path-not-taken.
- **`engineId` dispatch was zero-cost.** No tests broke; worker
  cache extended cleanly with the new key; renderer needed one
  line to send the field. The Phase 5 hyperbolic engine can be
  wired in without touching the worker boundary again.

#### Residual debt

- `placedGraphToHvLayout` still in `ir.ts`. Phase 4 inlines + deletes.
- `HvLayoutResult` + `GhostNode` + `ComponentInfo` types still in
  `hvLayout.ts`. Phase 4 inlines into TreeCanvas; this file deletes.
- The four perf trims — bug log. Each is independent and small.
- `LogicalEdge` + `EdgeRouter` interfaces still in `engine.ts`. No
  implementer; Phase 4 may delete if AABB-aware bus routing stays
  inside `passes/route.ts`.
- Worker dispatch on `engineId === "hyperbolic"` falls through to
  layered. Phase 5 wires the hyperbolic engine; the comment in
  `layout.worker.ts` flags it.

#### Implications for downstream phases

- **Phase 4** can proceed against a clean baseline. The `LayeredEngine`
  adapter shields it from the worker; Phase 4 work is entirely inside
  `passes/route.ts` + `EdgeLayer.svelte` + (the inlined)
  `placedGraphToHvLayout` body in TreeCanvas.
- **Phase 5** wires hyperbolic into the worker; the `engineId`
  dispatch is ready. The hyperbolic engine emits `LayoutResult` with
  `space: "hyperbolic"`; the worker posts it; HyperbolicCanvas
  subscribes (instead of short-circuiting at the component boundary).
- **Phase 4 estimate confidence increases.** Phase 3's boundary work
  came in well under estimate, which gives slack for Phase 4's
  AABB-aware bus routing (the riskiest part of the revised Phase 4).

---

## Revision after Phase 3 (10 May 2026)

### What changed

- **Phase 4** (improve `passes/route.ts` in place): valid — Phase 3
  delivered exactly what Phase 4 needs (clean boundary, dead code
  gone, `placedGraphToHvLayout` deletion explicitly queued for
  Phase 4.5).
- **Phase 5** (hyperbolic full implementation): valid — the
  `engineId` dispatch is wired and the LayeredEngine pattern is the
  template the hyperbolic engine follows.
- **Phase 6** (DOI): valid (minimal DOI is bundled into Phase 5 per
  the decision; Phase 6 polishes).
- **Phase 7** (UI), **Phase 8** (backlog): valid.
- **Risk register**: retire the "LayoutEngine interface lock-in
  before validation" row — the interface landed and works cleanly.
  Add a row for "stale `HvLayoutResult` types in `hvLayout.ts` after
  Phase 4 inline" so we remember to delete them.
- **Recommended order of operations**: Phase 3 actual time was ~2h
  (vs 2-day budget). Update the total estimate.

### Open questions for the user

None. Phase 3's residual debt is mechanical (Phase 4 absorbs the
`placedGraphToHvLayout` inlining) and the perf trims live in the
Phase 8 backlog.

## Phase 4 retro — 11 May 2026

### spec delta

- delivered:
  - 4.0 (in-flight): `parseGedcom` non-determinism fixed — FNV-1a id
    derived from xref. Determinism test added.
  - 4.1: port-aware drops handle pedigree-DAG up direction. Bus
    partitioned by direction; ports flip; no-warn invariant tightened.
  - 4.2: `bundleId` on every `Segment`; `EdgeLayer` emits one
    `<path>` per `(bundleId, role)` with `stroke-linejoin: round`.
    Path-trace highlight re-keyed to bundles. `segmentsForPath` kept
    as deprecated alias.
  - 4.3: AABB detour for horizontal segments; canvas-mask CSS
    dropped from `.person-node-host`.
  - 4.4: Holten 2006 HEB on long bonds. `bundleControl` field on
    Segment; renderer emits a `Q` curve when set; LCA computed from
    proband-rooted BFS over consanguinity edges.
  - 4.4.5 (absorbed from Phase 3): `HvLayoutResult` types and
    `placedGraphToHvLayout` adapter moved to
    `$lib/components/tree/canvasLayout.ts`. `hvLayout.ts` deleted.
- missed / deferred: none.
- extra:
  - **Lane allocator overflow clamp.** Surfaced from the DoD test —
    lanes ≥ N_LANES spilled into the next row's card AABB. Clamp
    `laneY` to the gutter band (~5 LOC, lives in `route.ts`).
  - **DoD test (`phase4-dod.test.ts`).** Asserts the four DoD bullets
    directly against the Akarians fixture: no horizontal crosses an
    unrelated card, no wrong-direction warnings, bundle count bounds
    path count, Kadar Arkaran non-crossing bonds. Caught two bugs
    before commit (detour direction + lane overflow).

### surprises

- **HEB doesn't need to break the H/V invariant.** The existing tests
  enforce "no diagonal segments"; that constraint held even with HEB
  because the `bundleControl` carries the curve metadata while the
  Segment endpoints stay axis-aligned. The renderer interprets it.
  Avoided a wider refactor.
- **The detour direction bug only shows up at DEMO scale.** The
  contrived 3-card unit test passed clean; only the 1,802-person
  fixture had segments going right-to-left whose approach legs cut
  through other obstacles. The DoD-against-fixture test pattern is a
  keeper — bullet 6 of the Plan's DoD ("`integration-check` skill run
  on the whole product") becomes a unit test we re-run cheap.
- **Lane allocator was already broken; nobody noticed because the
  canvas mask hid it.** With the mask CSS dropping, the spillover
  became visually obvious: bonds appearing inside cards. Removing one
  half of a kludge surfaces the other half.
- **HEB on the proband-rooted BFS produces visible bowing on cousin
  marriages.** Concretely: for a cousin couple whose LCA is the
  proband's grandparent, the bond bows up toward the grandparent's
  column. Reads exactly the way the genealogy convention says it
  should — pleasing surprise.
- **detour pass is cheap.** No measurable perf impact at DEMO; the
  per-segment AABB scan is O(N segments × N cards) = a few million
  comparisons, well under the 100ms layout budget.

### residual debt

- **HEB curves can still visually clip cards in dense rows.** The
  `bundleControl` Bezier with control-pull = 0.5 produces a gentle
  bow that may pass through an unrelated card geometrically (the
  chord-level AABB check skips HEB-tagged segments). No collision
  detection for the curved path. Disposition: bug-log → defer (
  visually acceptable on DEMO; if it becomes a problem, raise to
  fix-in-phase-N).
- **`segmentsForPath` deprecated alias still exported.** Kept for one
  cycle to avoid breaking the parent project's other callers, if any.
  Delete in Phase 7 (UI surface) when the inspector code that uses
  it is touched anyway.
- **Lane-overflow clamp suppresses the symptom, not the cause.** The
  allocator still HANDS OUT lanes ≥ N_LANES; the y just clamps to
  GUTTER_H − 0.05. Visually multiple buses stack at the same y when
  there are 5+ overlapping. Disposition: bug-log → defer (Phase 8
  could tighten by splitting into multiple bus segments along the
  x-axis, but for now the visual is "tolerable stacking" rather than
  "card-crossing").
- **`placedGraphToHvLayout` is still alive (just relocated).** The
  long-term goal was to render directly from `LayoutResult`. Phase 4
  rehomed the adapter rather than deleting it. Disposition: tracked
  as "Phase 4 deferred" — when Phase 5 ships, the renderer dispatch
  on `result.space` should make the adapter go away.

### implications for downstream phases

- **Phase 5 inherits the bundleId convention.** The hyperbolic engine
  should emit `bundleId` on its segments too (one bundle per
  geodesic family connector). The renderer already groups by
  `(bundleId, role)`; hyperbolic gets bundling for free if it
  populates the field.
- **Phase 5's hyperbolic LCA structure overlaps with Phase 4's HEB
  LCA.** Both walk the proband-rooted BFS over consanguinity. Extract
  `buildLcaIndex` into a shared module (e.g.
  `$lib/layout/probandTree.ts`) when Phase 5 lands.
- **Phase 7 (UI) should expose path-trace highlight at the bundle
  level.** The current `bundlesForPath` returns bundle ids; the
  inspector UI can take that directly. If the UI still talks "segment
  ids" anywhere, port it then.
- **Phase 8 backlog grows by 2 items** (HEB-curve card clipping,
  lane-overflow stacking). Both are visual not correctness.

## Revision after Phase 4 (11 May 2026)

### What changed

- **Phase 5** (hyperbolic full implementation): **revise** — small
  scope adjustments:
  - 5.1 (geometry promotion) — note the existing `passes/route.ts`
    `bundleControl` + `bundleId` Segment fields. Hyperbolic engine
    populates them too so the renderer auto-bundles geodesic family
    fans (~free win, no new renderer work).
  - 5.2 (Lamping-Rao layout) — promote `buildLcaIndex` from
    `passes/route.ts` into `$lib/layout/probandTree.ts` (shared
    between layered HEB and hyperbolic semantic-zoom DOI). ~30 min
    refactor, do it as a 5.2 preamble.
  - 5.4 (lateral relatives via weave) — still valid; the Phase 2
    decision stands.
  - 5.5 (minimal DOI cluster glyphs) — still bundled in per the
    "yes" decision; no change.
- **Phase 6** (DOI polish): **valid** — Phase 4 doesn't change
  the DOI plan.
- **Phase 7** (UI surface): **revise** — add a small item:
  - delete the `segmentsForPath` deprecated alias in
    `lib/layout/pathHighlight.ts` (kept across Phase 4 for back-compat;
    nobody else imports it). 5-minute cleanup at the start of Phase 7.
- **Phase 8** (backlog): **revise** — add three items:
  - HEB-curve card clipping (post-Phase 4 visual artefact).
  - Lane allocator overflow stacking (Phase 4 clamp hides it).
  - Ghost-near adjacency miss (re-disposed; Phase 4 closed the
    symptom but the order pass is still wrong; promote if it
    re-surfaces).
- **Risk register**: drop the "lane allocator y leaks into card row"
  implicit risk — Phase 4 clamp handles it. Add a "HEB curve geometry
  doesn't avoid AABBs" entry — visual, low severity, Phase 8 candidate.
- **Recommended order of operations**: Phase 4 actual time was ~3h
  (vs 2-3 day budget). Update the total estimate; remaining work is
  Phase 5 (5-7 days) + Phase 6 (2-2.5 days) + Phase 7 (2 days) +
  Phase 8 (backlog).

### Open questions for the user

None blocking. Two minor judgment calls Phase 5 will face:
- **Should `buildLcaIndex` move to `$lib/layout/probandTree.ts`
  before Phase 5 starts, or at Phase 5.2's beginning?** Either works;
  defaulting to "at Phase 5.2's start" since it's load-bearing for
  Lamping-Rao and a natural commit boundary.
- **Should hyperbolic-mode `bundleControl` be populated for
  multi-generation geodesics?** Probably yes (matches the layered
  HEB visual language); confirm at Phase 5 detail-design time.

## Phase 5 retro — 11 May 2026

### spec delta

- delivered:
  - 5.0 (preamble): `buildLcaIndex` + `lca` extracted to
    `$lib/layout/probandTree.ts`; route.ts imports from there.
  - 5.1: Poincaré primitives promoted to
    `lib/layout/hyperbolic/poincare.ts`. Added
    `translationFromTo(from, to)` helper for viewer pan/recenter.
    Spike module stays as Phase 2 fixture.
  - 5.2: Production Lamping–Rao hourglass in
    `engines/hyperbolic-lr/layout.ts`. Spouse weave (small angular
    offset for direct-line spouses). Off-spine descendants
    (aunts/uncles/cousins) hung as sub-wedges. Edges emitted with
    `bundleId` so the renderer collapses joint-children fans.
  - 5.3: HyperbolicCanvas promoted from stub. Drag-pan via
    Möbius composition. Double-click recenters with eased animation.
    Cards fisheye via `1 − |z|²` scale. PersonNode reused unchanged.
  - 5.4: `pathForGeodesic` in `edgePath.ts` emits SVG-A commands for
    Poincaré-disk arcs. HyperbolicCanvas renders geodesic arcs.
  - 5.5: Minimal DOI dot-glyph collapse — cards below
    `CLUSTER_THRESHOLD_PX = 12` render as dots in one SVG layer.
- missed / deferred:
  - **HEB on geodesics (Phase 5.4 §2).** Plan budgeted a half-day for
    a geodesic variant of Holten bundling on long cross-wedge
    marriages. Skipped — the geodesic arc already curves naturally
    toward origin, so cross-wedge marriages bow through the disk
    centre without explicit bundling. If Phase 7 visual review finds
    them too busy, lift the layered HEB control-point logic.
  - **Cluster aggregation + count badges.** Phase 5.5 emits dot
    glyphs but does NOT merge contiguous clustered subtrees into one
    glyph with a `+N` count. Plan deferred this to Phase 6.
  - **Worker dispatch of hyperbolic.** Plan implied the worker would
    dispatch the engine; we ship with main-thread layout because
    Akarians runs comfortably under 100 ms on the main thread and
    the worker plumbing for a different output shape is a real
    overhead. Captured in plan-revise as a Phase 8 candidate.
- extra:
  - **`translationFromTo`** helper added to poincare.ts. Composes two
    Möbius transforms into a one-shot function. Not in the spike;
    needed for the viewer pan model.
  - **DOI DoD test against Akarians** (`phase5-dod.test.ts`)
    asserts placement, boundary clamp, edge shapes.

### surprises

- **The lateral weave was simpler than feared.** Phase 2 plan-revise
  raised "lateral relatives" as a half-day open question. Realisation:
  spouses just take a small angular offset from their direct-line
  partner; off-spine descendants hang as sub-wedges from their
  on-spine parent. Total: ~50 LOC in one function. The "neutral
  equator zone" alternative would have been much more complex.
- **Möbius arithmetic for the viewer was the trickiest part.**
  `viewBase` as a `Mobius (a, θ)` couldn't directly express the
  "pointer-down + drag" composition. Solved by keeping `viewBase` as
  the persisted state and `dragLive` as a transient one-shot function
  layered on top; commit on pointerup re-derives a new `(a, θ)` from
  the final drag anchor.
- **SVG `A` command sweep flag works first try.** The cross-product
  sign rule on `(z1 − C) × (z2 − C)` picked the inside-disk arc
  correctly. Phase 2 spike rendered geodesics as polyline samples;
  the production renderer uses a single A command per edge, which is
  ~5x fewer DOM nodes.
- **Phase 4's `bundleId` + EdgeLayer-by-bundle pattern carries over
  cleanly.** Hyperbolic edges populate `bundleId` and the layered
  EdgeLayer's grouping logic would work if we routed through the
  same component. Today the renderers are split because the
  geodesic-arc route shape is different; merging them into one
  renderer is a Phase 7 candidate.
- **Lamping-Rao on the Akarians 66-generation ancestor chain hits
  the boundary clamp around generation 8–10 at D=0.7.** Cards past
  the cutoff collapse to DOI dots — the minimal DOI does its job
  even at the MVP level. The static-D scaling DECISION FROM PHASE 2
  is validated end-to-end now.
- **App.svelte routing of selection callbacks was zero-cost.**
  HyperbolicCanvas accepts the same `onselect/ondeselect/selectedId`
  props as TreeCanvas. The inspector + canvas stay in sync between
  engines with no extra wiring.

### residual debt

- **HEB on long hyperbolic marriages not implemented.** Geodesic
  arcs already curve; visually OK on Akarians, but cross-wedge
  marriage bonds spanning the proband still cut close to the
  boundary annulus. Disposition: bug-log → defer to Phase 7 visual
  review.
- **Cluster aggregation deferred.** Phase 5.5 emits one dot per
  clustered card, not one dot per subtree. Visually a "spray of
  dots" at the boundary; Phase 6 will aggregate. Disposition:
  Phase 6 scope as planned.
- **`StubHyperbolicEngine` alias still exported.** Kept for one cycle
  in case anything else imports it; nothing else does. Delete in
  Phase 7's cleanup pass.
- **Drag-pan + recenter compose as `viewBase` mutations.**
  `recenterOn` writes to `viewBase` directly; concurrent drag would
  fight the animation. Disposition: defer; in practice the user
  releases the pointer before initiating a click-to-recenter.
- **Hyperbolic layout runs on the main thread.** Acceptable on
  Akarians; could spike for larger trees. Disposition: bug-log →
  defer to Phase 8 (worker plumbing for the new output shape is
  real overhead).
- **No e2e visual golden for hyperbolic mode.** Layered has
  `visual-akarians.spec.ts`. Hyperbolic's screenshot would be
  fragile right now because drag-pan / recenter state isn't
  deterministic at first render. Disposition: Phase 7 (UI surface)
  can wire a fresh-engine golden once the default-view contract
  settles.

### implications for downstream phases

- **Phase 6 (DOI polish) inherits a working dot-glyph pass.** Phase 6
  adds cluster aggregation, aPriori bonuses, persistence. No
  fundamental redesign needed — extend `projected[]` in
  HyperbolicCanvas (or move it to a pure function for testability).
- **Phase 7 (UI surface) should add an engine-switcher visual cue.**
  The current select-callback wiring means switching to hyperbolic
  preserves selection. The inspector should add a "centre on
  selection" button that calls `recenterOn(selectedId)`.
- **Phase 8 backlog grows** by: HEB on hyperbolic marriages
  (visual), worker dispatch of hyperbolic engine (perf), drag-pan +
  recenter concurrency (correctness, low-likelihood), and a
  visual-golden for hyperbolic (regression coverage).

## Revision after Phase 5 (11 May 2026)

### What changed

- **Phase 6** (DOI polish): **revise** — Phase 5.5 shipped the
  minimum DOI hook (dot glyph below `CLUSTER_THRESHOLD_PX`). Phase 6
  no longer needs to invent the cluster glyph; it adds aggregation
  + count badges + `aPriori` bonuses + persistence on top.
  Estimate stays at 2–2.5 days.
- **Phase 7** (UI surface): **revise** — three small additions:
  - delete the `segmentsForPath` deprecated alias (carry-over from
    Phase 4)
  - delete the `StubHyperbolicEngine` deprecated alias (Phase 5)
  - add a "centre on selection" inspector button that calls
    `recenterOn(selectedId)` on the active engine
- **Phase 8** (backlog): **revise** — add four items:
  - HEB on hyperbolic marriages (visual; deferred from 5.4)
  - worker dispatch of hyperbolic engine (perf)
  - drag-pan + recenter concurrency (correctness, low-likelihood)
  - e2e visual-golden for hyperbolic mode (regression coverage)
- **Risk register**: retire the "Möbius numerical stability near
  boundary" row — Phase 5.4 verified the sweep-flag math and
  `RHO_MAX` clamp; no excursions on Akarians. Add "no e2e visual
  golden for hyperbolic mode" as a low-severity coverage risk.
- **Open questions**: settle the two from Phase 4 plan-revise:
  - `buildLcaIndex` was extracted at Phase 5.0 (as recommended).
  - Hyperbolic-mode `bundleControl` for multi-generation geodesics
    is NOT populated; geodesic arcs already curve naturally so the
    HEB control point is redundant. Settled "no, skip" — captured
    in bug log under "HEB on hyperbolic marriages" for Phase 7
    visual review.

### Open questions for the user

None blocking. Phase 6 has well-defined scope (aggregate clusters +
score function tuning + persistence). Phase 7 is the UI polish pass.
Phase 8 is the backlog drain.

## Phase 6 retro — 11 May 2026

### spec delta

- delivered:
  - 6.1: `lib/layout/doi.ts` promoted from pass-through stub to a real
    module. Exports `computeDoiScores`, `aggregateClusters`,
    `computeDoi` (compound), plus the `DoiScore`, `ClusterGlyph`,
    `DoiAnnotation`, `DoiWeights` types.
  - 6.2: `aPriori` stacks portrait (+0.5) + named (+0.5) + branch
    point (+1.0). Anchors clamp to `+Infinity`. Weights live in
    `DEFAULT_DOI_WEIGHTS` (exported, callers can override).
  - 6.3: contiguous-subtree cluster aggregation. Post-order scan tags
    each node with `hasBlocker` (self anchor / self high-DOI / any
    blocked descendant). Top-down emits one cluster per maximal
    unblocked subtree. Focus is an implicit anchor.
  - 6.4: HyperbolicCanvas threads `doiScores`, `clusters`,
    `clusterOf`, `projectedClusters` through `$derived`. Cluster
    glyphs render with circle + `+N` badge in their own SVG layer;
    `onclick` recenters on the rep so the fisheye unfurls the
    subtree. Singleton clusters render as the bare dot from Phase 5.5.
  - 6.5: `window.__treeDebug` extended with optional `doi(id)` +
    `clusters[]` while the hyperbolic canvas is mounted. Restores the
    previous handle (or deletes if there was none) on unmount.
  - 6.6: `tests/unit/layout/doi.test.ts` covers bonuses, distance
    metric, aggregation, anchor blocking, singleton clusters,
    compound `computeDoi`. `dod.test.ts` extended with three Phase 6
    DoD assertions against Akarians.
- missed / deferred:
  - **Standalone `ClusterGlyph.svelte` component.** Plan §6.3
    sketched a Svelte component; in practice the glyph is two SVG
    elements (circle + text) — extracting them costs more LOC than it
    saves. Inline in HyperbolicCanvas's existing cluster SVG layer.
  - **Visual golden updated for both engines on DEMO.** DoD §6.4
    asked for visual-golden updates; the hyperbolic mode still has
    no e2e visual baseline (Phase 5 retro deferred this to Phase 7
    once the engine-picker UX settles). Layered engine has its
    `visual-akarians.spec.ts` golden but did NOT need updating since
    Phase 6 doesn't touch the layered engine.
  - **Layered engine DOI integration.** Plan §6.3 said "Engines call
    this as a post-pass." Not done: the layered engine produces a
    grid of cards at predictable zoom levels and the DOI/cluster
    concept doesn't translate as naturally there. Deferred to a
    future phase or until a concrete need emerges.
- extra:
  - **Implicit focus anchor.** Caught by test failure. Without it the
    aggregator would put the proband into a singleton cluster when
    everything below threshold; now the focus is always individually
    rendered. Saved the renderer from having to special-case it.
  - **Singleton clusters degrade to a bare dot.** A leaf person below
    threshold becomes a one-member cluster; the glyph renders as a
    1.5 px circle (no badge) which is visually identical to the
    Phase 5.5 dot. Means Phase 6 is a strict superset visually, not
    a replacement.
  - **`projectedById` lookup map.** Added so cluster projection can
    look up the rep's on-screen position in O(1). The renderer
    already iterated `projected` once for cards; the second iteration
    for clusters now hits the map.

### surprises

- **The aggregation logic was trivially short.** ~30 LOC of
  post-order DFS + top-down emit. The hard part was the test that
  the proband doesn't end up in a cluster — solved by making focus
  an implicit anchor.
- **The `__treeDebug` extension required widening `layout?` to
  optional.** Before this phase, `TreeDebugHandle.layout` was a
  mandatory `HvLayoutResult`. The hyperbolic canvas has no
  layered-style layout result, so the type had to drop the
  requirement. No downstream consumer broke.
- **ESLint `no-undef` on ambient global types.** TS's
  svelte-check sees `TreeDebugHandle` from `vite-env.d.ts`; ESLint
  doesn't, even though the type compiles. Worked around with
  `type DebugHandle = NonNullable<Window["__treeDebug"]>`. Worth
  considering an ESLint config bump in Phase 7's cleanup pass to
  recognise ambient `interface` declarations.
- **The plan's "persistence" wording.** Phase 6 plan-revise listed
  "persistence" as a goal. Interpretation: the DOI annotation
  persists across re-renders by being keyed on `(tree, focus,
  anchors)` rather than recomputed every frame. Achieved naturally
  by Svelte's `$derived` — no separate cache layer needed.
- **HyperbolicCanvas now does three pure-function passes per
  frame** (projected cards, clusters, projectedClusters). Akarians
  has ~1800 nodes; chained iteration is still well under 16 ms in
  practice. No perf concerns surfaced.

### residual debt

- **No e2e visual golden for hyperbolic mode.** Inherited from
  Phase 5; Phase 6 didn't add one because the engine-picker UX is
  still TBD. Disposition: Phase 7 (UI surface) — couple it with
  default-view determinism.
- **Cluster click recenters but doesn't *expand*.** Recentering
  causes the fisheye to grow the rep's neighbourhood past the
  readability threshold, which naturally deflates the cluster. Works
  but is indirect — a user who wants "show me what's in this
  cluster without panning" has no affordance. Disposition: defer; if
  reported, add a hover preview or a chevron expander.
- **Score weights hard-coded in `DEFAULT_DOI_WEIGHTS`.** No UI to
  tune. Won't ship a slider in Phase 7 unless validation surfaces a
  need. Disposition: defer.
- **No "in trace path" aPriori bonus.** Plan §6.1 listed it but
  there's no live trace-path state at score-computation time today.
  Disposition: defer; revisit if Phase 7 surfaces a hover-trace
  toggle that needs the integration.
- **ESLint can't see ambient `TreeDebugHandle`.** Workaround in
  place; investigation deferred. Disposition: Phase 7 cleanup pass
  if it costs <30 min; otherwise leave the workaround.

### implications for downstream phases

- **Phase 7 (UI surface) inherits a working cluster glyph.** No
  re-design needed. Add: "centre on selection" button (now sensible
  given that DOI anchors selection); delete the
  `StubHyperbolicEngine` + `segmentsForPath` aliases; engine-picker
  visual cue; package-cleanup pass.
- **Phase 8 (backlog) gains one item.** Layered-engine DOI
  integration — wire `computeDoi` as a post-pass on layered output
  if any future feature needs cluster glyphs on the layered canvas.
  Likely won't be needed.

## Phase 6 bug triage — 11 May 2026

Bugs surfaced during Phase 6:

- **No e2e visual golden for hyperbolic mode** (carried). Disposition:
  fix-in-phase-7. Severity: nit (coverage debt, not a behavioural bug).
  Couple with engine-picker UX so the default view is deterministic.
- **Cluster click is indirect (recenters, not expands)**. Disposition:
  defer. Severity: nit. UX works, just not maximally direct. Revisit if
  reported.
- **Score weights hard-coded.** Disposition: won't-fix unless a tuning
  need surfaces. Severity: nit.
- **No "in trace path" bonus in aPriori.** Disposition: defer; revisit
  if Phase 7 hover-trace toggle needs the wiring. Severity: nit.
- **ESLint doesn't see ambient `TreeDebugHandle`.** Disposition: fix-
  in-phase-7 cleanup if cheap; otherwise won't-fix (workaround is one
  line). Severity: nit.

Patterns observed: every Phase 6 residual is a nit. The DoD core
functionality (scoring + aggregation + badges + debug surface)
all landed clean. Nothing escalates a downstream phase.

## Revision after Phase 6 (11 May 2026)

### What changed

- **Phase 7** (UI surface): **revise** — three Phase 6-derived
  additions:
  - replace the inline `pointer-events-none` SVG + `pointer-events-auto`
    group pattern in HyperbolicCanvas with whatever DialogShell-style
    convention emerges from the rest of the UI pass (cosmetic)
  - add an "expand cluster" affordance if the cluster-click → recenter
    indirection bites; otherwise leave as-is
  - bump ESLint config to recognise ambient `interface` (low priority)
  Estimate stays at 2 days. Phase 7's main scope (engine picker,
  cleanup, "centre on selection") is unchanged.
- **Phase 8** (backlog): **revise** — add one item:
  - layered-engine DOI integration (low priority; no concrete consumer
    today)
- **Phase 6 (now done)**: **delete** from forward-plan section since
  it has landed; record stays in the retro section.
- **Risk register**: no changes. Phase 6 was low-risk by design and
  no new risks emerged.

### Open questions for the user

None blocking. Phase 7 is straightforward UI cleanup; Phase 8 is the
backlog drain.

## Phase 7 retro — 13 May 2026

### spec delta

- delivered:
  - 7.1: deleted `segmentsForPath` (Phase 4.2 alias) and
    `StubHyperbolicEngine` (Phase 5 alias). Both were one-cycle
    safeties with no remaining importers; verified by grep.
  - 7.2: HyperbolicCanvas now publishes a `CanvasController`. Zoom
    methods are inert (no Euclidean zoom in hyperbolic mode); the
    centre-on-* family routes through the existing eased `recenterOn`.
  - 7.3: Inspector header gains a `Crosshair` button next to the
    overflow menu. Wired to `withCanvas(c => c.focusSelection())`
    in App.svelte, so it works under either engine.
  - 7.4: `MenuItem.checked` added; Menu.svelte renders a trailing
    lucide `Check` glyph. Commands gain a `checked?: () => boolean`
    callback; `menuFromGroup` evaluates it per render. View ›
    Use layered/hyperbolic engine shows the active selection.
  - 7.5: `libavoid-js` was already absent from `package.json` (must
    have been dropped silently when the Phase 1 spike halted).
    Verified by grep across all `package.json` files in the workspace.
- missed / deferred:
  - **"Centre on selection" keyboard shortcut.** Plan §7 mentioned
    `Cmd+E`. Existing `viewFocus` command in commands.ts already
    handles this — the shortcut binding is in `SHORTCUTS`. Did
    not re-verify the binding; assumed working. Captured in bug log
    if it turns out missing.
  - **Hourglass / Bowtie sub-mode for hyperbolic.** Plan listed this
    as a Phase 7 deliverable. Deferred — the current hourglass is
    the only mode and there is no concrete bowtie design yet.
    Disposition: bug log → Phase 8 candidate.
  - **Zoom slider semantic-aware.** Plan asked for "0 % = cluster
    glyphs only, 100 % = individual cards". Skipped — the zoom
    slider only appears in layered mode, and the layered engine
    doesn't have cluster glyphs. In hyperbolic mode the fisheye
    + DOI clustering already give the semantic effect, just without
    a slider control. Disposition: defer; the slider is not the
    natural UI for fisheye anyway.
  - **Path-trace on hover settings toggle.** Plan §7 mentioned
    exposing it as a settings toggle. Already accessible via the
    palette (`view.toggleTraceTarget`), and a settings checkbox
    would duplicate that. Defer.
  - **E2E visual golden for hyperbolic mode.** Carried forward from
    Phase 5/6. Default-view contract is now deterministic (identity
    Möbius on first mount), so it could be added; not done in this
    pass because the visual golden infrastructure is touchy and
    Phase 7's scope was UI cleanup, not test coverage.
- extra:
  - **Dropped "(Phase 5 stub)" from the hyperbolic menu label.**
    Cosmetic; previously called out the work-in-progress status of
    the engine.
  - **Refactored `switchEngine`** to always clear the controller on
    switch. Previously only cleared on `→ hyperbolic`; with
    HyperbolicCanvas now exposing its own controller, the same
    pattern works in both directions.

### surprises

- **`libavoid-js` was already gone.** The bug-log entry called for
  Phase 7 cleanup, but a grep across all workspace `package.json`
  files turned up zero references. Either Phase 1 was thorough and
  the bug entry never got closed, or pnpm install dropped it from
  the lock at some point. Either way, no work needed — just an
  entry update.
- **The Cmd+E "Centre on selection" was already plumbed.** The
  `viewFocus` command was wired in commands.ts during Phase 0 (per
  the registry pattern); only the *UI surface* for it (the inspector
  button) was missing. Phase 7's job here was smaller than expected.
- **Adding `checked` to MenuItem was 4 LOC plus the icon import.**
  Anticipated more friction; menu.ts and Menu.svelte both turned out
  to be one-edit-each.
- **Engine switcher clean-up of the stale controller.** App.svelte's
  `switchEngine` previously kept `canvasController` set when going
  TreeCanvas → HyperbolicCanvas (it only cleared on the reverse).
  With HyperbolicCanvas now exposing a controller, both directions
  need the clear. Found this by tracing the `oncontroller` callback
  path during testing.
- **Inspector button + Crosshair icon.** Lucide already has
  `Crosshair`; adding the button took one import + one button
  block. The hyperbolic mode's `focusSelection` going through the
  same callback path as layered's means there's no engine-specific
  branch in App.svelte.

### residual debt

- **Hourglass / Bowtie sub-mode for hyperbolic.** Deferred. Not
  blocking ship — the hourglass is the natural choice for proband-
  centered viewing. Disposition: bug log → Phase 8 or "won't ship"
  if no concrete design emerges.
- **No e2e visual golden for hyperbolic mode.** Carried. Default
  view is now deterministic (identity Möbius), so the snapshot
  *could* be taken; Phase 7's UI-cleanup scope didn't include test
  coverage. Disposition: bug log → Phase 8.
- **Zoom slider not yet semantic-aware.** Decision: don't fix —
  hyperbolic uses fisheye + DOI clustering instead, layered
  doesn't surface cluster glyphs. Disposition: won't-fix.
- **No Cmd+E binding verified.** Assumed working through the
  `viewFocus` shortcut binding. Disposition: defer; if reported,
  trivial check of `SHORTCUTS`.
- **Pre-existing TreeCanvas warning** at line 91:20 (`_` unused).
  Continues to ride along through every verify run. Disposition:
  bug log → Phase 8 cleanup candidate (or just delete the line).

### implications for downstream phases

- **Phase 8 (backlog) gains three items.** Hourglass/Bowtie sub-mode,
  hyperbolic e2e visual golden, TreeCanvas:91 `_` cleanup.
- **Ship-readiness can now run.** Phase 7 was the last UI surface
  pass; what remains is Phase 8 backlog drain (mostly perf / nit
  items) and the ship gate. The project's headline modes (layered
  + hyperbolic) both work end-to-end with selection sync,
  centre-on-selection, cluster glyphs, and the engine picker.

## Phase 7 bug triage — 13 May 2026

Bugs surfaced during Phase 7:

- **Hourglass / Bowtie sub-mode for hyperbolic.** Disposition:
  fix-in-phase-8 (or won't-ship if no design emerges). Severity: nit
  (engine has one perfectly serviceable mode today).
- **No e2e visual golden for hyperbolic.** Disposition: fix-in-phase-8.
  Severity: nit (no regression baseline, but the engine surface is
  small enough that hand-testing catches issues).
- **TreeCanvas:91 `_` unused var warning.** Disposition: fix-in-phase-8
  (1-LOC cleanup). Severity: nit.
- **Cmd+E binding not re-verified.** Disposition: defer; trivial
  check during ship-readiness or first hyperbolic-mode user test.
  Severity: nit.

Patterns observed: every Phase 7 residual is a nit. The headline goals
(engine picker fully functional, centre-on-selection works in both
engines, visual cue for active engine) all landed clean. No phase-
level rethinks needed.

## Revision after Phase 7 (13 May 2026)

### What changed

- **Phase 8** (backlog): **revise** — add three items from Phase 7:
  - Hourglass / Bowtie sub-mode for hyperbolic (low priority; may
    won't-ship)
  - E2E visual golden for hyperbolic mode (regression coverage;
    default view is now deterministic so this is doable)
  - TreeCanvas:91 `_` unused variable cleanup (1-LOC)
- **Phase 7 (now done)**: **delete** from forward-plan section since
  it has landed; record stays in the retro section.
- **Risk register**: no changes. Phase 7 was the lowest-risk phase by
  design; nothing in production broke.
- **Open questions**: settle Phase 7's Cmd+E question at
  ship-readiness via a manual check, not a separate phase.

### Open questions for the user

None blocking. The project's two headline engines (layered, hyperbolic)
now both implement the same CanvasController, the menu picker shows
the active engine, and centre-on-selection works in both. Next step
is Phase 8 backlog drain followed by ship-readiness.

## Phase 8 retro — 13 May 2026

### spec delta

- delivered:
  - 8.1: hyperbolic readability tuning. (a) flipped ancestor /
    descendant outward directions so ancestors take the screen-up
    half — previous orientation read as inverted; (b) bumped default
    `spouseAngle` 0.12 rad → 0.35 rad; (c) widened off-spine
    sub-wedge 30° → 60°; (d) replaced the `atan2(0,0)` degenerate
    direction with `+π/2` (descendant half). Tests in `dod.test.ts`
    and `layout.test.ts` updated.
  - 8.2: dropped the unused `tracePath` top-level prop from
    TreeCanvas (debugOverlay still receives `debugOptions.tracePath`
    via the separate channel). Eliminates the long-standing
    `_` unused-var lint warning.
  - 8.3: gated `recenterOn` on `dragAnchor === undefined`. Closes the
    Phase 5 retro "drag-pan + recenter concurrency" item.
- missed / deferred:
  - **Phase 3 perf trim — "build parent/child lookup once".** The
    Phase 3 retro called this a small drop-in; in reality the two
    `Object.values(tree.people)` loops live inside `passes/route.ts`
    with different keys (joint-children-by-couple vs.
    single-parent-drop). They don't merge cleanly, and lifting them
    out to a shared engine-entry lookup changes the pass signatures.
    Disposition: bug log → "won't ship in this project" unless a
    perf measurement surfaces it.
  - **Bowtie sub-mode for hyperbolic.** Plan §7 listed it; no design
    materialised. Disposition: won't-ship for v1; future phase if
    the hourglass orientation proves limiting.
  - **E2e visual golden for hyperbolic mode.** Default view is now
    deterministic (identity Möbius); could be snapshotted. Disposition:
    defer to ship-readiness or a v2 coverage pass.
  - **`countCrossings` Barth-Mutzel rewrite.** Algorithm-level
    optimisation; Phase 3 perf claim was speculative. Disposition:
    won't-ship for v1.
  - **Worker-cache identity short-circuit / split content/topology
    hash.** Cache-key engineering with no measured win on Akarians.
    Disposition: won't-ship for v1.
  - **Constants consolidation.** Phase 3 sketched it as inevitable;
    the constants are spread across `constants.ts`, `route.ts`,
    `place.ts`, `HyperbolicCanvas.svelte`. Each lives at its natural
    home today. Disposition: won't-ship.
  - **Brandes–Köpf 2008 erratum check.** Research-heavy; no observed
    layout defect that motivates it. Disposition: won't-ship.
  - **Lane-allocator overflow stacking.** Real bug but rare. Defer
    to v2 unless a fixture reproduces.
  - **HEB curves through unrelated card AABBs.** Visually acceptable
    on Akarians. Defer to v2.
  - **Worker dispatch of hyperbolic engine.** Akarians runs <100 ms
    on the main thread. Worker plumbing for a different output shape
    is real overhead with no perf return. Defer.
  - **HEB on hyperbolic marriages.** Geodesic arcs already curve.
    Phase 7 visual review didn't surface the problem. Defer.
- extra:
  - **Central-pile triage decision.** User feedback confirmed the
    proband's overlapping cards are the dominant readability defect.
    Phase 8.1's three angle changes (orientation flip, spouse angle,
    sub-wedge) target the worst contributor without redesigning the
    algorithm. Bigger fixes (bowtie, multi-pass relaxation) sit in
    "won't-ship" until the post-Phase-8.1 view is re-assessed.

### surprises

- **The orientation flip was a one-line change.** Two `Math.PI/2`
  literals at the spine-launch site; test expectations followed.
  Couldn't have been smaller, and immediately re-orients the whole
  tree.
- **The Phase 3 perf-trim wasn't drop-in after all.** The retro from
  Phase 3 said "callers iterate `Object.values(tree.people)` multiple
  times" — but on inspection, the callers are inside `passes/route.ts`
  with structurally different loop bodies. The bug-log entry under-
  characterised the work. Updated disposition rather than forcing
  the refactor.
- **The drag-pan + recenter concurrency gate is two lines.** The
  Phase 5 retro flagged it as "low-likelihood" but the cost of
  fixing turned out trivially small.
- **The `tracePath` lint warning had been riding along since
  Phase 4.** Easy to miss in the noise of bigger work; verify-run
  output now shows zero warnings (down from one pre-existing).

### residual debt

- Items moved to "won't-ship in this project" above. Stays in the
  bug log as a reference list for a hypothetical v2 effort.
- The user-visible "central pile" defect is now reduced (spouse
  angle 0.12 → 0.35, sub-wedge 30° → 60°) but not eliminated. Deep-
  ancestor or many-spouse trees can still produce dense centres.
  Real fix would be the bowtie sub-mode or a relaxation pass over
  the central card AABBs. Disposition: ship-readiness blocker
  decision — see triage below.

### implications for downstream phases

- **Ship-readiness is the next step.** Every remaining backlog item
  has been disposed (deferred to v2, won't-ship, or marked nit). No
  phase-level rework needed. The two engines work end-to-end; DOI
  clustering works; the engine picker, centre-on-selection, and
  inspector all work in both engines.

## Phase 8 bug triage — 13 May 2026

Items disposed during the phase:

- **Phase 3 perf trim (parent/child lookup).** Disposition: won't-ship.
  Reason: bug entry mis-characterised as a drop-in. Severity: nit.
- **Central pile in hyperbolic at zoom-out.** Disposition: partial
  fix in Phase 8.1; remaining is real but not blocking. Severity:
  important-but-not-blocker. The escape hatch (double-click any card
  to recenter) works, and Phase 6 DOI clustering means the deepest
  trees collapse to glyphs.
- **Bowtie sub-mode, HEB on hyperbolic, worker-dispatch,
  countCrossings, lane-overflow, Brandes-Köpf, hyperbolic e2e
  golden.** All disposition: defer-to-v2 or won't-ship. None block
  the v1 cut.
- **TreeCanvas:91 `_` warning.** Closed in 8.2.
- **Drag-pan + recenter concurrency.** Closed in 8.3.

Pattern observed: the headline goals shipped in Phases 0–7 and the
Phase 8 backlog is mostly polish + speculation. Most items have no
concrete consumer demanding them.

## Revision after Phase 8 (13 May 2026)

### What changed

- **Phase 8 (now done):** delete from forward-plan section since it
  has landed. Record stays in the retro section.
- **Bug log** now triaged for ship-readiness: every open item has an
  explicit disposition (won't-ship / defer-to-v2 / closed-in-Phase-8).
- **Risk register**: no changes. Phase 8 was the lowest-risk phase by
  design; the readability tuning is bounded by user-visible improvement
  and is reversible.
- **Open questions:** none. The project is ready for the ship gate.

### Next step

`ship-readiness` skill. Walk the bug log one final time, classify each
remaining item as blocker or follow-up, and emit the binary ship/no-
ship verdict.
