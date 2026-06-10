# family-view debug overlay & diagnostics

*reference card for the family-view debug machinery shipped 24 May 2026. focuses on the three durable contracts the overlay relies on; the toggle list itself lives in `FamilyViewDebugOverlay.svelte` and `debugTypes.ts` and changes more often.*

panel access: ctrl+shift+d, then the family-view section (auto-hidden when another engine is active). console handle: `window.__treeDebug` with `engine === "family-view"`.

---

## 1. palette-pick → recenter call path

a non-obvious 4-hop path; spent a phase tracing it. when the command palette or find-person search picks a person, the recenter happens via:

| Hop | Site | What it does |
|---|---|---|
| 1 | palette `onpick` (`App.svelte`, around line 1768) | calls `selectPerson(id)` then `canvasController?.focusSelection()` |
| 2 | `selection.select(id)` | writes to `selectedPersonId` runed store |
| 3 | `canvasController.focusSelection()` | delegates to whichever engine owns the canvas (family-view / layered / hyperbolic) |
| 4 (family-view) | `FamilyViewCanvas.focusSelection` → `recenterOn(personId, ...)` | synchronous; pans the SVG transform to centre on the target card |

**why the trace matters**: `centerOnPerson` is exposed as a controller method but `focusSelection` is the *intent* — "centre on the current selection". palette-jump uses `focusSelection`. programmatic centering (e.g. tests, the `Tree > center on root` command) uses `centerOnPerson(id)` directly. these two paths are distinct on every engine.

**watchdog**: phase 3's `showPendingRecenter` flashes the canvas border green when `centerOnPerson` is invoked. if a selection change happens but no recenter fires within ~200ms, a red corner badge shows the missing recenter. covers the silent-no-op bug class.

---

## 2. `RankedSubset.rationale` 5-reason taxonomy

`selectBoundedSubset` in `apps/web/src/lib/layout/engines/family-view/subset.ts` returns a `RankedSubset` whose `rationale: ReadonlyMap<PersonId, RejectionReason>` partitions every non-visible person into exactly one of these reasons:

| Reason | Meaning |
|---|---|
| `rank-cutoff` | beyond the visible ancestor / descendant depth (ancestors past depth 3, descendants past depth 2 by default) |
| `non-primary-partner` | extra spouse of a visible person where the primary union was not picked; the person reaches the BFS but the slot is owned by the primary partner |
| `secondary-union-not-expanded` | reachable through a visible person's secondary union, but that union is currently collapsed (user hasn't clicked "also show alongside") |
| `auto-collapsed` | removed by the post-BFS auto-collapse pass that fires when the visible count would exceed the 50-card cap |
| `unreachable` | not connected to the focus through any visible BFS edge (orphan or disconnected component) |

invariant: `visible ∩ rationale = ∅` and `visible ∪ rationale = tree.people`. every person ends up in exactly one set.

**why the taxonomy matters**: phase 1's `showOffSubsetPeople` debug panel groups off-subset persons by reason, which is how the "floating people" bug class is observable. extending or renaming a reason requires updating: `classifyRejections()`, the `RejectionReason` union, the side-panel grouping in `FamilyViewDebugOverlay.svelte`, and the e2e in `family-view-debug.spec.ts`.

**performance note**: `classifyRejections`'s `rank-cutoff` fallback has an O(P²) inner loop scanning every visible person for "is this a parent of someone visible". fine for diagnostic-overlay tree sizes (< 200 visible); if rationale ever moves to the hot path, invert into a per-person parent set built during the initial BFS.

---

## 3. `AncestorOverlap.breakdown` widen-return pattern

`computeAncestorOverlap` in `apps/web/src/lib/domain/consanguinity.ts` was historically a "computes, returns COI, discards intermediate state" function. phase 4 widened its return type so debugging COI rounding bugs doesn't require re-walking the lineage.

return shape:

```ts
type AncestorOverlap = {
  rawCoi: number;                // raw float, pre-round
  duplicates: PersonId[];        // persons appearing in both lineages
  breakdown: Array<{             // per-pair Wright-formula contribution
    ancestorI: PersonId;
    ancestorJ: PersonId;
    depthI: number;              // shortest path from focus parent A
    depthJ: number;              // shortest path from focus parent B
    contribution: number;        // (0.5) ^ (depthI + depthJ + 1)
  }>;
  cacheHits: number;
  cacheMisses: number;
};
```

**invariant**: `sum(contribution for row in breakdown) === rawCoi` (within float epsilon). the debug overlay's `showCoiBreakdown` table displays each row and a sum-of-rows cell so any drift is directly visible.

**when this pattern is appropriate**: widen a return type (rather than duplicate the walk in the overlay) when (a) the producer already computes the intermediate state internally and (b) the cost of carrying it back is bounded (here, `breakdown.length ≤ ancestors_per_side² ≤ ~few dozen rows on real pedigrees`). when either condition fails — the producer doesn't compute it, or the cost is unbounded — duplicate the walk in the overlay instead. phase 4 logged this decision in `notes/plans/archived/family-view-debug/log.md`.

---

## metadata

```yaml
last_updated: 24 May 2026
```
