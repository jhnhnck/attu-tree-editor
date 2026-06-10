# test-invariants

reference card for the six structural-invariant suites shipped by the `ui-invariant-tests` plan. each suite targets one of the six bug-clusters that recurred ~100 commits worth before the plan; together they form the structural floor that replaced the deleted visual-snapshot suite. all run under `pnpm test:unit` in jsdom.

complements `notes/dev/testing.md` (test layers) and `notes/dev/test-strategy.md` (why these specs look the way they do).

---

## suites

| # | cluster | suite | files | key pattern |
|---|---|---|---|---|
| 1 | stacking-context / pointer interception | chrome-geometry | `tests/component/chrome-geometry-*.test.ts` (6 surfaces) | `stackingContextHitTest.ts` stub |
| 2 | auto-fit / zoom / pan stealing | auto-fit-suppression | `tests/component/auto-fit-suppression*.test.ts` (9 handler rows) | per-handler `suppressNextFit` assertion; 4 `it.fails` rows lock in real bugs in `bugs.md` |
| 3 | silent-toggle indicators | toggle-indicator | `tests/component/toggle-indicator-*.test.ts` | sweep every `checked`-bearing command-registry entry; assert lucide-icon class delta on/off |
| 4 | per-engine inconsistency | parity-matrix | `tests/component/parity-matrix-*.test.ts` (9 capabilities x 3 engines = 27 cells) | live cells assert behavior; `expectedSkip` cells carry a non-empty rationale string |
| 5 | selection / focus desync | selection-state-machine | `tests/component/selection-*.test.ts` (6 entry points) | real stores + jsdom-mounted shells; mocks are last-resort with documented rationale |
| 6 | keyboard-reachability misses | keyboard-reachability | `tests/component/keyboard-reachability-*.test.ts` (5 form fields) | `TabOrderHarness` sandwich (sibling-before, field, sibling-after) plus printable-key and escape |

### chrome-geometry (cluster 1)

surfaces covered: menu, dropdown/picker, popover, toast, dialog, context-menu. every spec mounts a minimal scene, paints rects with `setRect()`, installs the stacking-context-aware `elementFromPoint` stub from `stackingContextHitTest.ts`, then dispatches synthetic pointers at the surface's interactive children and asserts the hit chain ends on the surface (or its descendant), never on a stacking-context-trapping sibling. catches the `620ce7c` family of `transform: translate3d` traps where z-index appears correct but a parent stacking context confines it.

### auto-fit-suppression (cluster 2)

table-driven over `FamilyViewCanvas` handlers. user-driven actions (`+` expand, badge click, picker show/hide-alongside, picker primary swap, secondary-union collapse) set `suppressNextFit = true` so the next fit-effect tick is skipped; system-driven actions (focus change, palette jump, host resize) refit. the four `it.fails` rows are intentional — they pin real production regressions routed to `notes/bugs.md` and flip to passing when the underlying `FamilyViewCanvas` bugs are fixed in a separate batch.

### toggle-indicator-visible-state (cluster 3)

walks every entry in the command registry with a `checked: () => boolean` callback. for each entry, drives the toggle on and off, asserts the rendered menu-item icon swaps lucide class sets (`lucide-square` <-> `lucide-check` or the tri-state equivalents). the menu uses `role="menuitem"` with a trailing icon, not `role="menuitemcheckbox"` — the test reframes accordingly and treats the registry as canonical.

### per-engine parity matrix (cluster 4)

9 capabilities x 3 engines (layered, family-view, hyperbolic) = 27 cells. capabilities: stats-pill mount, debug-pill mount, debug-toggle availability, edge stroke width at low zoom, fit-respects-chrome, cursor-on-card, selection-clears-on-empty-click, arrow-key-pan, semantic-100% zoom. 11 live cells, 16 `expectedSkip` with rationale strings (`hyperbolic` lacks euclidean zoom semantics; `layered` mounts pull in the Web Worker that jsdom doesn't implement). the harness asserts every `expectedSkip` rationale is non-empty. for engine-agnostic capabilities the matrix may substitute `FamilyViewCanvas` as a layered stand-in.

### selection-state-machine (cluster 5)

one spec per entry point: palette pick, canvas click, context menu, more-actions menu, deep-link prefill (localStorage), reload (persistence). per-entry invariant: `selectionStore.get() === id` and the inspector header text contains `person(id).displayName`. prefers real stores and jsdom-mounted shells; the rare canvas-controller mock documents inline why a mock was necessary to catch the bug. reload models the `$effect`-driven persist as an explicit `selectAndPersist(id)` pair — see `notes/dev/test-strategy.md`.

### keyboard-reachability (cluster 6)

5 form-field harnesses (`DateInput`, gender select, AGAB, parent picker, portrait field), each mounted inside a `TabOrderHarness` sibling sandwich. assertions per field: tab-in lands on the field, printable-key activates edit mode (or whatever the field's contract is), escape exits cleanly, tab-out reaches the next sibling. catches the `e9ea981` / `73a9a53` readonly-attribute trap class.

---

## supporting infrastructure

- `apps/web/tests/setup.ts` — global jsdom shims: `ResizeObserver`, `IntersectionObserver`, `window.matchMedia`. all no-ops; specs that need synthetic dispatch (e.g. `auto-fit-suppression.test.ts`) install a local override over the top.
- `apps/web/tests/component/_harness/` — shared helpers and mount sandwiches:
  - **fixtures + mounting**: `loadGedcomFixture` (parses `.ged` and `.gdz` in-process), `mountWithHostRect` (uniform `getBoundingClientRect` host stub)
  - **chrome geometry**: `stackingContextHitTest.ts` (`setRect`, `makeStackingAwareElementFromPoint`, `captureElementFromPoint`)
  - **menu / palette**: `MenuHarness`, `ToggleMenuHarness`
  - **canvas chrome**: `StatsPillHarness`
  - **import flow**: `ImportEditHarness`
  - **keyboard reachability**: `TabOrderHarness`, plus per-field sandwiches: `GenderFieldHarness`, `AgabFieldHarness`, `ParentPickerHarness`, `PortraitFieldHarness`
- fixtures live in `apps/web/tests/fixtures/` (purpose-built) and `notes/examples/` (akarian-style gedcom exports). the latter is auto-symlinked into each worktree by the project's `post-checkout` hook.

---

## how to add a new invariant test

1. pick the cluster the regression belongs to. if it does not fit one of the six, that is a finding — flag in retro and the suite list grows.
2. find a sibling spec in the same suite. its imports, harness usage, and fixture loader are the recipe.
3. mount through `mountWithHostRect` (canvas surfaces) or the relevant harness (`TabOrderHarness` for form fields, `MenuHarness` for menu items). avoid mocking the canvas controller — mocked controllers pass regardless of the bug the test exists to catch.
4. for chrome-geometry specs: pre-set rects with `setRect` on every element that competes for the hit point, install `makeStackingAwareElementFromPoint(canvas)` in `beforeEach`, restore the captured original in `afterEach`.
5. for fixture-backed specs: prefer `loadGedcomFixture("notes/examples/...")` over building trees in code. the existing repro fixtures (`Inbred Family.gdz`, `Akarians.gdz`, `multi-union.ged`, `dense-tree.ged`) cover most shape needs.
6. if the spec exposes a real bug, lock it in with `it.fails` and route the bug to the project bug log. the test starts protecting the regression the day it lands.
7. don't write a standalone "smoke" e2e spec to paper over a coverage gap — if unit tests feel insufficient, extend the relevant invariant suite instead. the canonical anti-pattern: `inspector-more-actions-smoke.spec.ts` duplicated `Inspector.test.ts` assertion-for-assertion and added no structural coverage. if no existing cluster fits, that's a signal to propose a new cluster (step 1), not to bolt on a playwright-weight spec.

---

## see also

- [test-strategy.md](../dev/test-strategy.md) - why the geometry approach, probe summaries, `stackingContextHitTest` deep dive
- [testing.md](../dev/testing.md) - the three test layers and how to run subsets
- [agents.md §6](../agents.md) - canonical testing-layout overview

---

## metadata

```yaml
last_updated: 27 May 2026
```
