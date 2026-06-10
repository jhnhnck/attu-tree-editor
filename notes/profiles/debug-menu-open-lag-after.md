# debug-menu open lag — after canvas-window-manager phase 4 fix

**status**: substitution — no live firefox capture this pass. the
sub-agent environment can't drive a real firefox session. paired
companion to `debug-menu-open-lag-baseline.md`.

## fix shape (per phase-0 verdict D)

phase-0 named the root-cause class as **load-bearing identity churn**:
DockRegistration's second `$effect` allocated a fresh
`{ corner, priority, kind, render, forceCollapsible, focusedAt }`
object literal on every re-run, including on every reactive churn
that touched the parent component (every `treeStore.tree.editRev` /
`debugTimings` / `debugMenuOpen` flip in `App.svelte`). that fresh
literal flowed into `updateItem`, which then notified the
`itemsForCorner` derive chain, which fanned out across every dock
consumer.

phase-4 fix: in
`apps/web/src/lib/components/canvas/DockRegistration.svelte` the
`$effect` now memos the previous `next` and compares field-by-field
before calling `updateItem`. when nothing meaningful changed, the
effect early-returns without mutating the registry map. svelte 5
gives each `{#snippet}` a stable identity within its parent scope,
so identity-equality on `render` suffices.

## benchmark assertion in code

`apps/web/tests/e2e/canvas-window-manager.spec.ts` phase-4 describe
block adds an open-menu benchmark: 5 trials, p50 < 200ms. the
threshold is set generously to keep flake low on under-pressure CI
but still catch the multi-hundred-ms regression class the phase-0
root cause produced. tighten to 50ms if a future plan finds that
realistic.

## what would a live capture confirm

if a future operator drops the post-fix `.json.gz` here:

- expect markers in the "Component" thread for the open-menu range
  (ctrl+shift+d to debug-panel visible) to total a small fraction
  of the baseline
- expect `updateItem` invocation count in the same range to be ≤ N
  (where N = number of items actually changing this tick, NOT the
  full dock cardinality)
- expect `itemsForCorner` derive runs to drop in inverse proportion

if the benchmark gate (in code) regresses past 200ms, the most
likely cause is a new derive that allocates fresh identity on every
read — re-audit `debugOptions` / `familyViewDebugOptions` and the
per-snippet body computations for that pattern.
