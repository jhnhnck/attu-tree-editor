---
name: tree-layout-ir
description: The four-pass IR contract for the tree-layout pipeline (LayeredGraph → OrderedGraph → PlacedGraph → Segment[]) and the LayoutEngine boundary on top of it. Trigger when editing anything under `lib/layout/passes/`, `lib/layout/ir.ts`, `lib/layout/engine.ts`, `lib/layout/engines/`, `lib/layout/layout.worker.ts`; when adding a new layout pass, an engine, a router, or a renderer-side consumer of layout output; when answering questions about the engine boundary, content vs topology hashing, wire format, or why the layered engine still calls `passes/route.ts` directly. Complements `tree-debugger` (runtime diagnosis via `__treeDebug`) by covering the editing side.
---

# Tree layout IR — the contract

The layered-engine pipeline produces typed intermediate representations.
Each pass consumes one IR and produces the next. The boundary is
captured by `LayoutEngine` (`lib/layout/engine.ts`); the only production
engine is `LayeredEngine` in `lib/layout/engines/layered-hv/index.ts`.

```
Tree + LayoutOverrides
  → layer()    → LayeredGraph   (ranks assigned; ghosts inserted)
  → order()    → OrderedGraph   (within-rank ordering; crossing-min)
  → place()    → PlacedGraph    (x/y coords; Brandes-Köpf)
  → route()    → RoutedGraph    (segments + warnings)
```

`LayeredEngine.layout()` runs the four passes in sequence and adapts
the output to a `LayoutResult` (the new shape) AND a `.legacy` field
holding the four-tuple `{ layered, ordered, placed, segments,
warnings }` that the existing renderer consumes. Phase 4 starts
consuming `LayoutResult` directly; the legacy field then goes away.

Hyperbolic mode does NOT use this pipeline. The hyperbolic engine
(`engines/hyperbolic-lr/`) emits `LayoutPosition` with `space:
"hyperbolic"` directly; the renderer dispatches by `result.space` and
mounts `HyperbolicCanvas` for hyperbolic positions.

## Files that own each piece

| concern | file |
|---|---|
| IR types (LayeredGraph, OrderedGraph, PlacedGraph, RoutedGraph) | `lib/layout/ir.ts` |
| `LayoutWarning` (non-fatal anomalies from any pass) | `lib/layout/ir.ts` |
| Layout-space constants (PERSON_W, ROW_H, …) | `lib/layout/constants.ts` |
| Segment / EdgeKind / EdgeRole types | `lib/layout/edgeRouter.ts` (types-only) |
| Renderer-side HvLayoutResult + `placedGraphToHvLayout` adapter | `lib/components/tree/canvasLayout.ts` |
| `LayeredEngine` adapter | `lib/layout/engines/layered-hv/index.ts` |
| `StubHyperbolicEngine` | `lib/layout/engines/hyperbolic-lr/index.ts` |
| `LayoutEngine` / `LayoutResult` types | `lib/layout/engine.ts` |
| Worker that dispatches engines | `lib/layout/layout.worker.ts` |
| Renderer (consumes legacy four-tuple for now) | `lib/components/tree/TreeCanvas.svelte` |
| Hyperbolic-mode renderer stub | `lib/components/tree/HyperbolicCanvas.svelte` |

## What the four passes guarantee

Each pass is **pure** — input → output, no side effects, no closures
over `$state`, no DOM, no `window`. They run in a Web Worker
(`layout.worker.ts`); they MUST stay pure or the worker breaks.

- **`layer(tree, visible, focus, overrides)` → `LayeredGraph`**
  - Every visible person gets a `LayoutNode` with `kind: "person"` and
    a `rank` (0 = oldest generation).
  - Cross-rank in-law spouses get a ghost `LayoutNode` (`kind: "ghost"`,
    id `ghost:<ghostOf>|<nearId>`) on the partner's rank.
  - `cycleNodes` is populated when the parent DAG has cycles (Kahn's
    BFS can't rank them — they fall back to rank 0).
- **`order(lg, overrides)` → `OrderedGraph`**
  - Adds `order: Map<LayoutNodeId, number>` — within-rank ordering.
  - Crossing-minimisation; couple + sibling-block constraints.
  - DFS is iterative (Phase 0 preflight commit `daf8705`) — must not
    re-introduce the recursive walker; long ancestries blow the stack.
- **`place(og, overrides)` → `PlacedGraph`**
  - Adds `x` + `y` maps in unit coords. `bbox` is the bounding box.
  - Brandes-Köpf horizontal coord assignment. Read
    [arXiv:2008.01252](https://arxiv.org/abs/2008.01252) before
    touching the median calculation — there's an erratum in the
    original 2002 paper.
  - `closePairs` enforces ghost↔near adjacency at `DELTA = 2.5 u`.
- **`route(pg, tree)` → `RoutedGraph`**
  - Emits `Segment[]` (typed: `bond | parent-drop | sibling-bus |
    child-drop | stub`).
  - Returns a `warnings: LayoutWarning[]` array (negative-drop and
    other invariant violations). Routed through the worker → main
    thread → `window.__treeDebug.warnings`.
  - Phase 4 will improve in place: port-aware drops, AABB-aware bus
    routing, sibling-fan bundling at the renderer.

## The `LayoutEngine` boundary

```ts
export interface LayoutInput {
    readonly tree: Tree;
    readonly visible: ReadonlySet<PersonId>;
    readonly focus: PersonId;
    readonly overrides?: LayoutOverrides;
}

export interface LayoutResult {
    readonly engineId: string;
    readonly space: "euclidean" | "hyperbolic";
    readonly positions: ReadonlyMap<LayoutNodeId, LayoutPosition>;
    readonly edges: readonly LayoutEdge[];
    readonly bbox?: { readonly width: number; readonly height: number };
    readonly nodes: ReadonlyMap<LayoutNodeId, LayoutNode>;
    readonly obstacles: readonly LayoutObstacle[];
}

export interface LayoutEngine {
    readonly id: string;
    layout(input: LayoutInput): LayoutResult;
}
```

`LayeredEngine.layout()` extends the return shape with a `legacy`
field carrying the four-tuple wire format. Phase 4 transitions the
renderer; the legacy field is removed at that point.

`LogicalEdge` + `EdgeRouter` are vestigial types-only after Phase 1
(libavoid halted). No current implementer; Phase 4's in-place router
keeps routing inside the layered engine.

## Wire format

Maps cannot be transferred via `postMessage` (well, they CAN since
structured-clone supports them, but the project chose entry-array
wire forms for explicit control). The wire forms live in `ir.ts`:

- `LayeredGraphWire`: `nodes: [LayoutNodeId, LayoutNode][]`, plus
  the other fields untouched.
- `OrderedGraphWire`: extends + adds `order: [LayoutNodeId, number][]`.
- `PlacedGraphWire`: extends + adds `x`, `y` as entry arrays.
- `LayoutOverridesWire`: `pinned: [PersonId, {x}][]`, `swap` and
  `laneHints` similar.

The worker calls `serializeLayered / Ordered / Placed` before
`postMessage`; the main thread calls `hydrateLayered / Ordered /
Placed` on receipt. Don't try to send a Map across — it works but
breaks the explicit-shape invariant the test fixtures rely on.

## Worker dispatch

`layout.worker.ts` accepts an `engineId` field on every input
(`"layered" | "hyperbolic"`). Today only `"layered"` produces real
output; hyperbolic short-circuits at the canvas component
(`HyperbolicCanvas.svelte` renders without subscribing to worker
output). Phase 5 wires the hyperbolic engine through here.

Cache key is `(treeId, engineId, contentHash, rootId, overridesHash)`.
**`contentHash`** is computed by `hashTreeContent(tree)` — a sorted
JSON of `(rootId, [personId, motherId, fatherId][], couple keys)`.
This excludes presentation fields (names, dates, portraits) so
renames don't bust the cache. **Editing topology (adding a person,
re-parenting, divorcing) always invalidates the cache** because the
content hash changes.

## `LayoutWarning`

```ts
export interface LayoutWarning {
    readonly kind: "negative-drop" | "rank-cycle" | "route-budget" | "other";
    readonly pass: "layer" | "order" | "place" | "route";
    readonly message: string;
    readonly ids?: readonly LayoutNodeId[];
    readonly data?: Readonly<Record<string, number | string>>;
}
```

When a pass detects a non-fatal anomaly (e.g. negative drop height),
push a `LayoutWarning` instead of calling `console.warn`. The pass
returns it as part of its IR; the worker collects warnings and posts
them to the main thread; the main thread surfaces them on
`window.__treeDebug.warnings[]`. **Don't `console.warn` directly from
inside a pass** — it loses the structured data and the debug-handle
visibility.

## Pure-function rules for the worker

Worker code is reached via `layout.worker.ts`, which is bundled by
Vite as a separate worker. The bundle does NOT include DOM, Svelte
runtime, or `window`. Worker-side code:

- MUST be pure. No state outside `let cache` in `layout.worker.ts`
  (the memoisation cache is the one allowed mutation, and it's a
  per-worker singleton, not a closure-over-`$state`).
- MUST NOT import from `lib/state/*` (Svelte runes), `lib/persistence/*`
  (Dexie / IndexedDB), or anything that pulls in DOM.
- CAN import from `lib/domain/*`, `lib/layout/*`, `lib/io/*` (pure).

The TS compiler doesn't enforce this; the worker just fails at
runtime with "Worker scope: document is not defined" if you break it.

## Adding a new pass

1. Define the new IR in `lib/layout/ir.ts` (extends the previous IR
   shape; adds whatever the pass produces).
2. Write the pass under `lib/layout/passes/<name>.ts`. Function-only,
   pure.
3. Wire it into `LayeredEngine.layout()` between the existing
   passes. The engine's adapter to `LayoutResult` may need updating
   if the new pass changes positions / edges.
4. If the pass needs cross-engine semantics (e.g. DOI, which runs on
   both layered + hyperbolic), define it as a free function that
   takes a `LayoutResult` and returns an annotated `LayoutResult`,
   not as a pass on the four-pass pipeline.

## Adding a new engine

1. Create `lib/layout/engines/<name>/index.ts`.
2. Implement `LayoutEngine` (`id`, `layout(input)`).
3. Decide on the `space`: if it's euclidean, the renderer dispatches
   to the existing canvas-stage; if hyperbolic, to `HyperbolicCanvas`.
   New `space` values require a new canvas component.
4. Register the engine in `layout.worker.ts`'s dispatch table.
5. Add an entry to `EngineKind` in `lib/state/engine.ts` and to the
   menu in `App.svelte`.

## What's vestigial / going away

- `edgeRouter.ts` — types-only since Phase 3 (the old `routeEdges()`
  function deleted). May merge the types into `ir.ts` later.
- `LogicalEdge` + `EdgeRouter` interfaces in `engine.ts` — no
  implementer after Phase 1. May delete in a future cleanup.

## What's stable

- The `LayoutNode` shape (`{ id, kind, personId, rank, … }`).
- The four-pass interface (`layer`, `order`, `place`, `route`).
- `LayoutWarning` (added in Phase 0; consumed via `__treeDebug.warnings`).
- The `engineId` cache-key dimension.
- The wire-format pattern (Maps → entry arrays in postMessage).
