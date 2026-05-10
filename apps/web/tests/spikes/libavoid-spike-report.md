# libavoid-js Phase 1 spike — realistic-workload characterisation

Captured: 2026-05-10T17:40:36.779Z

## Framing

The original Phase 1 plan timed full-DEMO routing (~3,500 connectors)
against a <1 s ceiling. That workload doesn't exist in production:
hyperbolic mode (Phase 5) skips libavoid entirely; DOI clustering
(Phase 6) collapses low-DOI subtrees at fit-zoom; zoomed-in layered
shows neighbourhoods. The relevant scale is _the visible subgraph_,
typically 100–1,000 connectors. The two tables below characterise
libavoid at that scale.

Realistic-workload budget: **<1 s** on subgraphs ≤1,000 connectors.

## Connector-cap scaling (full obstacle set, first N edges)

| cap | obstacles | connectors | setup ms | tx ms |
|---|---|---|---|---|
| 100 | 1969 | 100 | 20 | 1125 |

## N-hop subgraph workloads (proband neighbourhood)

| hops | people | obstacles | connectors | pipeline ms | tx ms | verdict |
|---|---|---|---|---|---|---|
| 1 | 45 | 52 | 80 | 1 | 2926 | ⚠️ slow |
| 1 | 45 | 52 | 80 | 1 | 2916 | ⚠️ slow |
| 2 | 79 | 94 | 137 | 2 | 58357 | ❌ unusable |

## Phase 1 verdict

**HALT — rollback ceiling tripped.** At least one realistic
subgraph workload exceeded 5 × the budget (5 s). The cheap perf
knob (`nudgeOrthogonalSegmentsConnectedToShapes=false`) made no
measurable difference at the 1-hop scale, and 2-hop already runs
for tens of seconds. libavoid-js cannot serve as Phase 4's
production router with the current configuration.

### Recommended pivots for Phase 4

1. **Keep + improve `passes/route.ts`.** The existing router is
   already fast (its full-DEMO routing is bundled into the 100 ms
   layered pipeline). Phase 4 becomes "fix the legibility gaps"
   rather than "replace the router":

   - port-aware drops (parent-mid → child-mid; spouse-inner → spouse-inner)
   - sibling-fan bundling at the renderer (one `<path>` per family)
   - drop the `background: var(--color-canvas)` mask once routing
     accounts for card AABBs
   - cross-rank bundling via Holten HEB (Phase 4.4 unchanged)

2. **Custom narrow router.** Build an orthogonal router tailored to
   tree shapes. Far simpler than general libavoid: most edges are
   parent-down or spouse-horizontal, obstacles are AABB-aligned to
   a rank grid, and bundles are predetermined by family structure.

3. **libavoid + aggressive culling + tuning.** Only viable if
   future tuning (port directions, idealNudgingDistance, segment
   penalty) can bring 137-connector latency from 57 s to <1 s.
   Order of magnitude unlikely without a fundamentally different
   approach inside the library.

## Side findings worth flagging in the bug log

- `parseGedcom` returns a different `rootId` on each call (read-gedcom
  iteration order is not deterministic). Affected the spike until we
  pinned the proband to the highest-degree person. Worth filing — any
  test that depends on a specific person being root will be flaky.
- Obstacle cost dominates: 1,969 obstacles + only 100 connectors ran
  in ~2 s. The `placed.nodes` set includes ghosts; adapter for Phase 4
  should consider whether ghosts need to be obstacles or not.
