# bugs — canvas chrome dock

## open

(none — `migrate-debug-menu-into-dock` migrated to `notes/bugs.md` during pre-merge 2026-05-26)

## closed

### phase0-e2e-coverage-gap (closed 2026-05-25, phase 1)

phase 0 deferred 4 of 7 e2e cases (b, c, e, g) because of "click-handler failures" in the worktree environment. root cause was identified in phase 1: `DockRegistration`'s `$effect` re-registered on every render cycle, which made the registry mutation re-enter the effect's own dep set once the dock's `$derived` re-ran against the SvelteMap. svelte aborted with `effect_update_depth_exceeded` on page load (1 throw per load). the runtime bailed cleanly enough that the dock + most reactive state kept working, but subsequent clicks on the `debug-pill` (and likely other downstream effects) silently dropped — explaining the phase-0 "click handlers don't fire" symptom.

**fix:** `DockRegistration` now uses `untrack(() => register(...))` for mount-only registration plus a separate `$effect(() => updateItem(id, {...}))` (also `untrack`-wrapped) for ancillary prop changes (snippet swap, priority shift, kind shift). a new `updateItem(id, patch)` helper on the registry mutates the existing entry in place instead of unregister-then-register. unit-test suite unchanged (6/6 pass). page-load `effect_update_depth_exceeded` count: 1 → 0.

**verification:**

- 7/7 cases pass on chromium (the previously-passing 3 plus all 4 previously-deferred)
- 6/7 cases pass on mobile (Pixel 7); case (c) exposes the new `dock-overshoots-host-on-small-mobile` issue, which is a different bug (off-host dock anchor at small viewport), not the original click-handler issue

### dock-overshoots-host-on-small-mobile (closed 2026-05-26, phase 5)

phase 5 anchor clamp: `CanvasChromeDock` now reactively pins its `bottom:` anchor to `host.height - dockHeight - slack` whenever the natural css-var-driven anchor would push the dock's top edge above the canvas-host. the clamp is implemented as a `$state` variable folded into the existing `cornerStyle` `$derived` so svelte's binding stays the single source of truth for the inline style (previously a direct `style.removeProperty` wiped svelte's own `style={cornerStyle}` write).

**verification:**

- new e2e case (q) in `apps/web/tests/e2e/canvas-chrome-dock.spec.ts` at 1024×720 asserts the dock's top edge stays inside the canvas-host with menu open + layout-metrics expanded
- existing mobile case (f) at 600×900 still passes
- closing commit: (pending — added during phase-5 commit chunks)

### phase5-layout-metrics-collapse-test-off-host-on-default-chromium (closed 2026-05-26, phase 5)

bumped the viewports in `apps/web/tests/e2e/family-view-debug-phase5.spec.ts` tests 107 and 148 to 1440×1200 so the dock + debug-menu + expanded layout-metrics body all fit inside the canvas-host without engaging force-collapse. the anchor clamp alone doesn't help here — force-collapse legitimately fires at default 1280×720 because the menu + panel together exceed the available stack cap, and the test was originally written before phase 4 introduced force-collapse. viewport bump matches the convention `canvas-chrome-dock.spec.ts` already settled on for the same reason.

**verification:**

- both tests pass on chromium
- closing commit: (pending)

### visual-akarians-snapshot-stale-since-phase-0 (closed 2026-05-26, phase 5)

regenerated `apps/web/tests/e2e/visual-akarians-family-view.spec.ts-snapshots/akarians-family-view-chromium-linux.png` via `pnpm -F web exec playwright test visual-akarians-family-view --update-snapshots`. snapshot now reflects the post-phase-4 dock chrome and current toast wording.

**verification:**

- spec passes without `--update-snapshots`
- closing commit: (pending)

### worktree-fixture-bootstrap-undocumented (closed 2026-05-26, phase 5)

added `scripts/setup-worktree.sh` (executable) that symlinks `notes/examples` from the main repo into a fresh worktree. paired with a "setting up a worktree" paragraph in `notes/agents.md` §7.

**verification:**

- script works against this worktree (re-runs land as "skipping" once linked)
- closing commit: (pending)

### updateItem-unit-test-backfill (closed 2026-05-26, phase 5)

added 4 unit tests to `apps/web/tests/unit/components/canvas/dockRegistry.test.ts` covering: in-place patch, partial patch preserves unchanged fields, unknown-id is a no-op (no throw), and reactive propagation to mounted readers. the `updateItem(id, patch)` helper was added in phase 1 (commit `78d012b`) but lacked coverage.

**verification:**

- vitest reports 17 dockRegistry tests passing (was 13)
- closing commit: (pending)
