# plan: ui-invariant-tests — shipped (merge pending)

## context

over the last ~100 commits, six bug-shapes have repeated:

1. **stacking-context / pointer interception** (6+ incidents — picker behind cards, toast over menu, popover off-screen)
2. **auto-fit / zoom / pan stealing user state** (5+ incidents — `+` expand, chrome-bar overflow, "zoom still broken")
3. **toggle / state indicators that don't reflect reality** (4+ — debug-menu active state, tri-state overlays, savestatuspill copy)
4. **per-engine inconsistency** (every family-view rollout: stats pill, debug pill, edges, fit, cursors, selection)
5. **selection / focus desync** (palette pick, off-subset blank, "center on root" no-select, reload-loses-selection)
6. **keyboard-reachability misses** (dateinput readonly trap)

current test stack catches none of these classes deterministically:

- 8 visual-golden specs (14 .png snapshots) — drift every ui change; 5 already gated behind `PLAYWRIGHT_UPDATE_SNAPSHOTS`. user has said **"ui is not currently stable"** — these are pure noise right now.
- 20 non-visual playwright specs — several are structural store/component assertions wearing a browser costume.
- 12 component tests (vitest + jsdom + svelte mount) — good shape, low coverage of the bug-classes above.

intent: replace the noisy visual-snapshot floor with a structural-invariant floor that survives ui churn, and migrate browser-driven specs to jsdom where the real browser adds nothing.

## goals

1. delete all 8 visual goldens + 14 png snapshots; no replacement (`maskUnstableUI`, `visual-mask.ts` go too)
2. audit 20 non-visual playwright specs; migrate structural-only ones to jsdom; keep playwright only for specs that need real-browser features (file picker, pointer/touch on canvas, localstorage cross-tab, true paint timing)
3. ship 5 new invariant suites in jsdom that close the six bug-classes:
   - chrome-geometry (cluster 1)
   - auto-fit suppression contract (cluster 2)
   - toggle-indicator visible-state assertion (cluster 3)
   - per-engine parity matrix across layered + family-view + hyperbolic (cluster 4)
   - selection state-machine invariants (cluster 5)
   - keyboard-reachability sweep (cluster 6)
4. `pnpm test:unit` stays the canonical fast loop; `pnpm test:e2e` shrinks to the residual browser-only set; ci budget drops.

success measure: re-running the plan's invariant suite against the historical commits of the 19+ documented incidents in `notes/bugs.md` (fixed section), at least 80% reproduce as test failures pre-fix and passes post-fix.

## scope

**in:**

- delete visual goldens + helpers
- migrate eligible e2e to jsdom
- 5 new invariant suites
- update `notes/agents.md` testing-layout section
- adjust ci config if scripts change

**out:**

- fixing any open bug in `notes/bugs.md` (separate batch via `parallel-orchestrate`)
- new ui features
- new playwright infrastructure (browser-context tests, network mocks, etc.)
- backend / sync test coverage
- changes to existing 12 component tests beyond extracting shared helpers

## load-bearing unknown

**can jsdom actually do geometry assertions?** jsdom returns zero-rects for most elements (tailwind v4 doesn't compute, `getBoundingClientRect` is a stub, `document.elementFromPoint` ignores transforms and z-index). two viable paths:

- **(a)** mock layout: per-test, set explicit rects on rendered elements via `Element.prototype.getBoundingClientRect` override or `HTMLElement.offsetTop` jsdom shim. cheap, but couples tests to known geometry.
- **(b)** ditch jsdom for these specific tests in favor of **happy-dom** or **playwright component tests** (`@playwright/experimental-ct-svelte`). real layout, in-process.

a third option — assert *intent* (z-index value, `inert` attribute, `pointer-events` style) without realized geometry — was considered and rejected during pre-mortem: it cannot catch the historical [620ce7c](620ce7c) picker-behind-cards bug, because z-index was set *correctly* and `translate3d` ate the stacking context regardless. phase 0 must pick (a) or (b) and prove the pick against that historical bug.

## accepted risks (from pre-mortem)

geometry-approach choice is the load-bearing decision and lives in phase 0 with a forced historical-replay probe. hyperbolic-canvas mount under jsdom is unknown and may force `expectedSkip` rows in the phase-5 parity matrix; probe lands in phase 0. phase-3 tests prefer real stores + shell mounts over canvas-controller mocks, since mocks would pass regardless of the bug the test exists to catch. visual-golden deletion is irreversible outside of git; user has accepted. full pre-mortem report lives in `pre-mortem.md` next to this file.

## walking skeleton — phase 0

a single end-to-end pass through every new test category, smallest possible:

- delete 1 visual golden + its snapshots; confirm `pnpm test:e2e` still passes
- migrate 1 structural e2e (candidate: `engine-picker.spec.ts`) to a jsdom component test; delete the playwright original
- ship 1 chrome-geometry spec — picker-behind-cards repro (the [620ce7c](620ce7c) bug). pick whichever of (a)/(b) is cheapest and *prove the test fails on the pre-fix commit and passes on post-fix*. this is the load-bearing experiment.
- ship 1 selection-state-machine spec — palette pick path
- ship 1 parity-matrix cell — `[layered, family-view, hyperbolic] × [stats-pill mounts in bottom-left bar]`
- ship 1 keyboard-reachability spec — `DateInput` tab-into-edit
- ship 1 toggle-indicator spec — `view > overlays > path-highlight` shows visibly-different on/off state
- ship 1 auto-fit-suppression spec — `+` expand-subtree on family-view

deliverable: 7 new specs + ~3 deletions, all green, geometry-approach picked. proves the whole-pipeline shape before scaling.

## phases (risk-first)

### phase 0 — walking skeleton + geometry-approach decision

retires: the geometry-in-jsdom unknown, the hyperbolic-mount unknown, the "does migration actually work" unknown.

output: 7 new specs (1 per category), 1 deleted golden, 1 migrated e2e, written decision in `notes/dev/test-strategy.md` on geometry approach (a or b), recorded outcome of the `mount(HyperbolicCanvas)` probe, and a historical replay against [620ce7c](620ce7c) that fails pre-fix and passes post-fix with the chosen approach.

### phase 1 — visual goldens & playwright audit

retires: "are we still leaning on goldens for anything we can't replicate." delete the 7 remaining goldens + their png snapshots + `visual-mask.ts` + `_helpers/maskUnstableUI` unconditionally (`visual-akarians` already deleted in phase 0). inventory the 19 remaining non-visual e2e specs (`engine-picker.spec.ts` already triaged as `keep (browser-only)` per phase-0 bug log); classify each with four fields: spec name, behavior under test, `keep (browser-only)` / `migrate (structural)` / `delete (covered)`, and — if `migrate` — "what would need shimming" (e.g. ResizeObserver, IntersectionObserver, fake-indexeddb, file-picker mock). produces a classification table in `log.md`; migration happens in phase 1b. if the `migrate` count exceeds 8, split phase 1b into 1b / 1c by surface.

### phase 1b — jsdom test-infrastructure bootstrap

retires: "the unblock that lets 10 e2e migrations proceed mechanically." three small slices, all in `apps/web/tests/`:

- **slice 1 — global shim bundle** in `apps/web/tests/setup.ts`: `globalThis.ResizeObserver` (no-op observe/disconnect/unobserve), `globalThis.IntersectionObserver` (same shape), and `window.matchMedia` (returns `matches: false`, no-op listeners). Flip the `_probes/hyperbolic-mount.probe.test.ts` baseline assertion from "throws ReferenceError" to "mounts without ResizeObserver throw" — or delete the probe if its observation is now fully captured by `notes/dev/test-strategy.md`.
- **slice 2 — `loadGedcomFixture` helper** in `tests/component/_harness/`: takes a path to a `.ged` fixture under `tests/fixtures/` (or `notes/examples/`), parses it in-process via `apps/web/src/lib/io/gedcom/parse.ts`, returns a `Tree`. Bypasses the wizard / file-picker entirely. 9 of 10 phase-1c migrations depend on this.
- **slice 3 — `mountWithHostRect` helper** in `tests/component/_harness/`: thin wrapper around `mount(Canvas, props)` that uniformly applies the per-test `getBoundingClientRect` host stub (the chrome-geometry pattern, but generalised) so callers don't re-invent it. 6 of 10 migrations need a host-rect stub.

success criterion: an end-to-end smoke test mounts `FamilyViewCanvas` against a fixture loaded via `loadGedcomFixture` + `mountWithHostRect` and asserts at least one structural property, fully in jsdom, no playwright. that proves the bootstrap is enough.

### phase 1c — migrate eligible e2e to jsdom

retires: "did the classification hold up against the actual code." 10 migrations from the phase-1 classification table; each ports its e2e to `tests/component/` or `tests/unit/` using the phase-1b helpers, the migrated spec passes, then the playwright original is deleted. ordering: do the 4 family-view-debug specs first (most uniform recipe), then the 5 family-view interaction specs, then `import-edit` (slightly different — needs store-hydration after parse rather than `mount(FamilyViewCanvas)`). after each migration lands, its `delete (covered)` siblings (if any) also get removed: `family-view-debug-phase5` after the 4 debug migrations, `inspector-more-actions-smoke` + `shell` as part of the closing housekeeping. update `pnpm test:e2e` script if any browser-only project becomes empty.

### phase 2 — chrome-geometry invariant suite (cluster 1)

retires: stacking-context regressions. one suite per surface class (menu, dropdown/picker, popover, toast, dialog, context-menu). assertion shape per surface: open it, dispatch a synthetic pointer at the center of every interactive child, expect the event target chain to include the surface and not a sibling. uses the geometry approach picked in phase 0.

### phase 3 — selection-state-machine invariants (cluster 5)

retires: selection desync. one parameterized test over every entry point (palette, canvas click, context menu, more-actions, deep-link, reload). invariant per call: `selection.id === id ∧ inspector.header.name === person(id).name ∧ canvas.focusedPersonId === id`. prefers real stores + jsdom-mounted shells; canvas-controller mocks are last-resort and each call site documents why a mock was needed (otherwise the test cannot catch the bug it exists to catch).

### phase 4 — auto-fit suppression contract (cluster 2)

retires: zoom/pan-stealing regressions. table-driven test over `FamilyViewCanvas` handlers: `+` expand, badge click, picker show/hide-alongside, picker primary swap, secondary-union collapse, focus change, palette jump, host resize. each row asserts `suppressNextFit === expected`.

### phase 5 — per-engine parity matrix (cluster 4)

retires: per-engine inconsistency. capability list: stats-pill mount, debug-pill mount, debug-toggle availability, edge stroke width at low zoom, fit-respects-chrome, cursor-on-card, selection-clears-on-empty-click, arrow-key-pan, semantic-100% zoom. rows = capabilities, cols = engines (layered, family-view, hyperbolic). cells either assert behavior or carry a documented `expectedSkip` with a non-empty reason string (the matrix harness asserts the rationale is present). hyperbolic-engine cells default to `expectedSkip` per the phase-0 mount probe; **after phase 1b's shim bootstrap lands, re-evaluate each hyperbolic cell** — some may flip from skip to active without further infra work; others may need a canvas2d shim added then. **layered-engine cells get parallel treatment per phase-1c discovery:** TreeCanvas spawns a Web Worker that jsdom doesn't implement, so for any capability that's engine-agnostic the matrix may substitute FamilyViewCanvas as a stand-in (e.g. cursor-on-card behaves identically across engines) — otherwise the cell is `expectedSkip` with the Worker rationale.

### phase 6 — keyboard-reachability + toggle-indicator (clusters 6 + 3)

retires: form-field focus traps and silent-toggle regressions. (a) sweep `DateInput`, gender select, AGAB, parent picker, portrait field; each rendered inside a parent with siblings, tab in / tab out, printable key, escape behavior. (b) for every `[role=menuitemcheckbox]` and `[aria-pressed]` in mounted menus, assert a computed-style or attribute-based visible delta between true and false states.

### phase 7 — docs + ci cleanup

retires: documentation drift. update `notes/agents.md` testing-layout section, `notes/dev/test-strategy.md` (added in phase 0), `package.json` scripts if needed, and add a short `notes/features/test-invariants.md` reference doc for the suite shape. decide the fate of the 3 phase-0 `_probes/` files (`chrome-geometry-approach-a`, `chrome-geometry-approach-b`, `hyperbolic-mount`): fold their lessons into `test-strategy.md` and delete, or keep as living examples — pick one, don't carry the ambiguity forward.

## verification

per-phase definition-of-done (each phase appends to this list, not replaces):

- all new specs run under `pnpm test:unit` (or `pnpm test:e2e` for the residual playwright set)
- typecheck + lint clean
- removed files don't leave dangling imports
- the historical-incident replay: pick 3 closed `bugs.md` entries from the cluster the phase covers, check out the pre-fix commit, run the new spec, assert it fails. check out the post-fix commit, assert it passes. document in `log.md`.
- `notes/agents.md` testing-layout section reflects current shape after phase 7

## critical files

- `apps/web/tests/e2e/visual-*.spec.ts` + snapshots dirs (delete)
- `apps/web/tests/e2e/_helpers/visual-mask.ts` (delete)
- `apps/web/tests/e2e/*.spec.ts` non-visual (audit + selective delete/migrate)
- `apps/web/tests/component/` (host for migrated + new specs; existing `_harness/MenuHarness.svelte` is the pattern)
- `apps/web/tests/setup.ts` (may need geometry mocks per phase-0 decision)
- `apps/web/vitest.config.ts` (no expected change unless happy-dom replaces jsdom per phase 0)
- `apps/web/package.json` test scripts
- `notes/agents.md` testing section
- `notes/dev/test-strategy.md` (new, written in phase 0)

## existing utilities to reuse

- `apps/web/tests/component/_harness/MenuHarness.svelte` — pattern for harness components wrapping units under test
- `apps/web/tests/e2e/_helpers/close-inspector.ts` — pattern; the jsdom equivalent will need a similar shared dismissal helper
- `apps/web/tests/e2e/_helpers/importViaWizard.ts` — only relevant for playwright residual; not migrated
- `apps/web/src/lib/components/canvas/fitMath.ts` (`computeFit`, `measureCanvasChromeInsets`) — exercised directly in phase 4

## next steps after plan write

`phase-loop` against phase 0. phase 0 is the only phase that can invalidate later phases (geometry-approach decision); subsequent phases parallelize naturally if desired.
