# family-view debug overlay & diagnostics

*reference card for the family-view debug machinery shipped 24 May 2026. focuses on the three durable contracts the overlay relies on; the toggle list itself lives in `FamilyViewDebugOverlay.svelte` and `debugTypes.ts` and changes more often.*

panel access: ctrl+shift+d, then the family-view section (auto-hidden when another engine is active). console handle: `window.__treeDebug` with `engine === "family-view"`.

---

## 1. palette-pick → recenter call path

a non-obvious 4-hop path; spent a phase tracing it. when the command palette or find-person search picks a person, the recenter happens via:

| Hop | Site | What it does |
|---|---|---|
| 1 | palette item `action` (`App.svelte`, around line 1872, inside the `paletteItems` derived) | calls `focusPerson(p.id, "personal", "palette")`, then `armPaletteRecenterWatchdog(p.id)`, then `canvasController?.centerOnPerson(p.id)` |
| 2 | `focusPerson` → `selection.select(id)` | writes to `selectedPersonId` runed store |
| 3 | `canvasController.centerOnPerson(id)` | delegates to whichever engine owns the canvas (family-view / layered / hyperbolic) |
| 4 (family-view) | `FamilyViewCanvas.centerOnPerson` → `recenterOn(id)` | synchronous; pans the SVG transform to centre on the target card |

**why the trace matters**: `centerOnPerson` is exposed as a controller method but `focusSelection` is the *intent* - "centre on the current selection". the two paths used to be split palette-vs-programmatic; that's flipped: palette-jump now calls `centerOnPerson(p.id)` directly ("order matters: focusPerson first ... centerOnPerson uses the id directly to avoid racing the prop update on the same tick" - inline comment at the call site), while the `viewFocus` command (the `F` shortcut / "focus selection" action) calls `withCanvas((c) => c.focusSelection())`. `viewCenterRoot` ("Tree > center on root") also calls `centerOnPerson(id)` directly. on `FamilyViewCanvas` both controller methods bottom out in the same `recenterOn(id)`, so the distinction is about *call site intent*, not differing engine behavior.

**watchdog**: phase 3's `showPendingRecenter` flashes the canvas border green when `centerOnPerson` is invoked. if a selection change happens but no recenter fires within ~200ms, a red corner badge shows the missing recenter. covers the silent-no-op bug class.

---

## 2. `RankedSubset.rationale` 5-reason taxonomy

`selectBoundedSubset` in `apps/tree-editor/src/lib/layout/engines/family-view/subset.ts` returns a `RankedSubset` whose `rationale: ReadonlyMap<PersonId, RejectionReason>` partitions every non-visible person into exactly one of these reasons:

| Reason | Meaning |
|---|---|
| `rank-cutoff` | beyond the visible ancestor / descendant depth (ancestors past depth 3, descendants past depth 2 by default) |
| `non-primary-partner` | extra spouse of a visible person where the primary union was not picked; the person reaches the BFS but the slot is owned by the primary partner |
| `secondary-union-not-expanded` | reachable through a visible person's secondary union, but that union is currently collapsed (user hasn't clicked "also show alongside") |
| `auto-collapsed` | removed by the post-BFS auto-collapse pass that fires when the visible count would exceed the 50-card cap |
| `unreachable` | not connected to the focus through any visible BFS edge (orphan or disconnected component) |

invariant: `visible ∩ rationale = ∅` and `visible ∪ rationale = tree.people`. every person ends up in exactly one set.

**why the taxonomy matters**: phase 1's `showOffSubsetPeople` debug panel groups off-subset persons by reason, which is how the "floating people" bug class is observable. extending or renaming a reason requires updating: `classifyRejections()`, the `RejectionReason` union, the side-panel grouping in `FamilyViewDebugOverlay.svelte`, and the rationale coverage in `family-view-debug.test.ts` (the e2e suite this used to live in was removed wholesale - 18 June 2026 - so this is component-test-only now).

**performance note**: `classifyRejections`'s `rank-cutoff` fallback has an O(P²) inner loop scanning every visible person for "is this a parent of someone visible". fine for diagnostic-overlay tree sizes (< 200 visible); if rationale ever moves to the hot path, invert into a per-person parent set built during the initial BFS.

---

## 3. `AncestorOverlap.breakdown` widen-return pattern

`computeAncestorOverlap` in `apps/tree-editor/src/lib/domain/consanguinity.ts` was historically a "computes, returns COI, discards intermediate state" function. phase 4 widened its return type so debugging COI rounding bugs doesn't require re-walking the lineage.

return shape:

```ts
interface CoiBreakdownRow {
  readonly ancestorId: PersonId;  // the common ancestor this row is for
  readonly di: number;            // shortest path from proband's parent A
  readonly dj: number;            // shortest path from proband's parent B
  readonly contribution: number;  // (0.5) ^ (di + dj + 1)
}

interface AncestorOverlap {
  readonly duplicates: readonly PersonId[]; // persons appearing in both lineages
  readonly coi: number | undefined;         // undefined if no consanguinity detected
  readonly breakdown?: readonly CoiBreakdownRow[]; // present only when coi is defined
}
```

each row is one common ancestor reached via both parents (not a pair of two different ancestors) - `di`/`dj` are that ancestor's shortest-path depth from each parent. `cacheHits`/`cacheMisses` are not part of the return type; they're module-level counters read via the separate `getCoiCacheStats()` export.

**invariant**: `sum(contribution for row in breakdown) === coi` (within float epsilon). the debug overlay's `showCoiBreakdown` table displays each row and a sum-of-rows cell so any drift is directly visible.

**when this pattern is appropriate**: widen a return type (rather than duplicate the walk in the overlay) when (a) the producer already computes the intermediate state internally and (b) the cost of carrying it back is bounded (here, `breakdown.length ≤ ancestors_per_side² ≤ ~few dozen rows on real pedigrees`). when either condition fails - the producer doesn't compute it, or the cost is unbounded - duplicate the walk in the overlay instead. the phase-0 probe (probe 2) scoped this as a near-free widen and phase 4 carried it out; the plan log itself now lives under the gitignored `.claude/plans/archived/` tree rather than tracked `notes/`, so treat the plan as a pointer, not a guaranteed-present file.

---

## metadata

```yaml
last_updated: 30 June 2026
```
