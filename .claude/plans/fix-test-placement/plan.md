# fix-test-placement

## context

After the `feat(extract-attu-ui)` phases moved ~30 components and utilities from `apps/tree-editor/src/lib/` into `packages/attu-ui/src/lib/`, the corresponding tests were left behind in `apps/tree-editor/tests/`. Commit `d7cefc4` patched all 37 broken test files by changing their `$lib/…` imports to `@attu/ui` — a quick fix that kept tests running but in the wrong package. Tests for `Menu`, `Window`, `HaracalndeDate`, `fitMath`, etc. now live in `apps/tree-editor/` while the code they test lives in `packages/attu-ui/`. This plan reverts that patch and redistributes tests to their owning package.

## goals

- `git revert d7cefc4` restores the original (broken) import paths
- 26 test + fixture files move to `packages/attu-ui/tests/` and pass using `$lib` alias
- 11 files stay in `apps/tree-editor/tests/` with targeted import fixes only
- `pnpm -F attu-ui test:unit` and `pnpm -F tree-editor test:unit` both pass with zero regressions

## non-goals

- adding new test coverage beyond what d7cefc4 touched
- restoring the e2e suite (dropped separately in `9bf9756`)
- touching source code in either package

## constraints

- `packages/attu-ui` already has vitest + `$lib` alias + all `@testing-library` devdeps; no new deps needed
- attu-ui vitest config currently only globs `tests/unit/**`; needs expanding for `tests/component/**`
- attu-ui already has `tests/unit/haracalende-date.test.ts` — when `HaracalndeDate.test.ts` moves from tree-editor, open both files; if tree-editor's version is a superset, rename it and delete the existing file; otherwise merge unique cases
- `order.test.ts` in tree-editor had dynamic imports hoisted to static in d7cefc4 to fix suite timeouts; after revert the hoisting must be re-applied (all paths remain `$lib`)
- no worktrees; all changes land on trunk

## accepted risks

One residual risk: `imagePipeline.test.ts` uses `createImageBitmap` and `OffscreenCanvas`, which jsdom does not implement natively. Before treating "copy setup.ts verbatim" as sufficient, grep `apps/tree-editor/tests/setup.ts` for both names; if a shim exists, confirm it is generic rather than tree-editor-specific.

## classification

### move to `packages/attu-ui/tests/` (26 files)

**unit tests → `tests/unit/`:**
| file (under `apps/tree-editor/tests/`) | destination |
|---|---|
| `unit/date/HaracalndeDate.test.ts` | `tests/unit/date/` (see constraint above re duplication) |
| `unit/date/gregorian.test.ts` | `tests/unit/date/` |
| `unit/state/auth.test.ts` | `tests/unit/state/` |
| `unit/components/canvas/Window.test.ts` | `tests/unit/components/canvas/` |
| `unit/components/canvas/WindowOverlay.test.ts` | same |
| `unit/components/canvas/dockConfig.test.ts` | same |
| `unit/components/canvas/dockRegistry.test.ts` | same |
| `unit/components/canvas/popoutChromeInsets.test.ts` | same |
| `unit/components/canvas/windowManager.test.ts` | same |
| `unit/components/canvas/fixtures/DockProbe.svelte` | `tests/unit/components/canvas/fixtures/` |
| `unit/components/canvas/fixtures/GatedDockRegistration.svelte` | same |
| `unit/components/canvas/fixtures/WindowOverlayCounterProbe.svelte` | same |
| `unit/components/canvas/fixtures/WindowProbe.svelte` | same |
| `unit/components/cropperMath.test.ts` | `tests/unit/components/` |
| `unit/components/fitMath.test.ts` | same |
| `unit/components/imagePipeline.test.ts` | same |
| `unit/components/zoomDisplay.test.ts` | same |

**component tests → `tests/component/`:**
| file | destination |
|---|---|
| `component/CanvasChromeDock.test.ts` | `tests/component/` |
| `component/CommandPalette.test.ts` | same (also fix `PaletteItem` import from `@attu/ui` → `$lib`) |
| `component/DateInput.test.ts` | same |
| `component/Menu.test.ts` | same |
| `component/SaveStatusPill.test.ts` | same |
| `component/ShareDialog.test.ts` | same |
| `component/ZoomWidget.test.ts` | same |
| `component/toggle-indicator-sweep.test.ts` | same (reclassified from "stay in tree-editor") |
| `component/toggle-indicator-visible-state.test.ts` | same (not in d7cefc4; cascade-fails via ToggleMenuHarness) |
| `component/keyboard-reachability-dateinput.test.ts` | same (not in d7cefc4; cascade-fails via TabOrderHarness) |
| `component/_harness/MenuHarness.svelte` | `tests/component/_harness/` |
| `component/_harness/TabOrderHarness.svelte` | same |
| `component/_harness/ToggleMenuHarness.svelte` | same |

**import note:** after `git revert d7cefc4 --no-commit` (phase 0), all moved files already have `$lib/…` imports — the revert restored them. phases 2 and 3 just move the files; no import rewriting is needed. verify with `grep -r "@attu/ui" apps/tree-editor/tests/` after the revert (expect zero matches).

### stay in `apps/tree-editor/tests/` (11 files)

| file | action after revert |
|---|---|
| `component/OpenDialog.test.ts` | no changes — imports tree-editor $lib paths throughout |
| `component/PortraitField.test.ts` | fix mock: `vi.mock("@attu/ui", async (importOriginal) => { … CropperDialog: stub … })` since CropperDialog moved to @attu/ui |
| `component/_harness/StatsPillHarness.svelte` | update `SaveStatusPill` import from deleted `$lib/components/shell/…` to `@attu/ui` |
| `component/family-view-debug-coi.test.ts` | no changes — tests tree-editor FamilyViewCanvas with only $lib imports |
| `component/family-view-debug-navigation.test.ts` | no changes |
| `component/parity-matrix-stats-pill.test.ts` | will have broken $lib import for `SaveStatusPill`; update to `@attu/ui` |
| `component/selection-context-menu.test.ts` | fix `ContextMenu` import: `$lib/components/ui/ContextMenu.svelte` → `@attu/ui` |
| `component/selection-palette-pick.test.ts` | fix `CommandPalette` import: `$lib/components/palette/CommandPalette.svelte` → `@attu/ui`; `PaletteItem` type import stays as-is |
| `unit/layout/order.test.ts` | re-apply static import hoisting only (all paths stay as $lib; do NOT change to @attu/ui) |

## phases

### phase 0 — revert + enumerate breakage
**status:** done
**DoD:** revert staged; tree-editor shows exactly 37 failing files; broken imports in all "audit" stay-files are enumerated
**scope:**
- `git revert d7cefc4 --no-commit`
- run `grep -r "@attu/ui" apps/tree-editor/tests/` — confirm zero matches (revert already restored $lib paths)
- run `pnpm -F tree-editor test:unit` — capture the failure list; verify it matches the 37 files
- for `parity-matrix-stats-pill.test.ts`, `selection-context-menu.test.ts`, `selection-palette-pick.test.ts`, `toggle-indicator-sweep.test.ts`: grep each for any import that points to a now-deleted $lib path (e.g. `$lib/components/shell`, `$lib/state/auth`, `$lib/state/progress`) and record the specific broken imports; add them to phase 4 scope before proceeding

### phase 1 — expand @attu/ui test infrastructure
**status:** done
**DoD:** `pnpm -F attu-ui test:unit` passes including the canary moved test; component glob and setup wired
**scope:**
- `packages/attu-ui/vitest.config.ts`: add `"tests/component/**/*.test.ts"` to `include`; add `setupFiles: ["./tests/setup.ts"]`
- grep `apps/tree-editor/tests/setup.ts` for `createImageBitmap` and `OffscreenCanvas`; confirm shim is generic, then copy setup.ts to `packages/attu-ui/tests/setup.ts`
- create `packages/attu-ui/tests/component/_harness/` directory
- **canary:** move `gregorian.test.ts` only to `packages/attu-ui/tests/unit/date/`; run `pnpm -F attu-ui test:unit` and confirm it passes — this validates that the infra, $lib alias, and setup work before moving the remaining 25 files

### phase 2 — move unit tests to @attu/ui
**status:** done
**DoD:** remaining 16 unit test files + 4 fixtures pass under `pnpm -F attu-ui test:unit`; deleted from tree-editor
**scope:**
- move the 16 remaining unit test files (all but `gregorian.test.ts`, already moved) and 4 fixture Svelte files
- files arrive with correct `$lib/…` imports already (restored by phase-0 revert); confirm no `@attu/ui` imports remain in moved files
- `HaracalndeDate.test.ts`: resolve duplication with existing `haracalende-date.test.ts` per constraint above
- delete originals from tree-editor
- run `pnpm -F attu-ui test:unit`

### phase 3 — move component tests to @attu/ui
**status:** done
**DoD:** 10 component test files + 3 harnesses pass under `pnpm -F attu-ui test:unit`; deleted from tree-editor
**scope:**
- move the 10 component test files (7 original + 3 reclassified: toggle-indicator-sweep, toggle-indicator-visible-state, keyboard-reachability-dateinput) and 3 harness Svelte files
- `CommandPalette.test.ts`: after move, fix `import type { PaletteItem } from "@attu/ui"` → find correct `$lib/…` path for PaletteItem in attu-ui and update
- confirm no other `@attu/ui` imports remain in moved files
- delete originals from tree-editor
- run `pnpm -F attu-ui test:unit`

### phase 4 — fix remaining tree-editor tests
**status:** done
**DoD:** `pnpm -F tree-editor test:unit` passes with no failures
**scope:**
- `order.test.ts`: re-apply dynamic→static import hoisting (all imports stay `$lib/…`; convert `async` tests using dynamic `import()` to sync tests with top-level static imports)
- `PortraitField.test.ts`: replace `vi.mock("$lib/components/editor/CropperDialog.svelte", …)` with `vi.mock("@attu/ui", async (importOriginal) => { const orig = await importOriginal(); return { ...orig, CropperDialog: stub }; })`
- `parity-matrix-stats-pill.test.ts`: change `import { clearRegistry } from "$lib/components/canvas/dockRegistry.svelte"` → `import { clearRegistry } from "@attu/ui"`
- `StatsPillHarness.svelte`: change `import CanvasChromeDock from "$lib/components/canvas/CanvasChromeDock.svelte"` + `import DockRegistration from "$lib/components/canvas/DockRegistration.svelte"` → `import { CanvasChromeDock, DockRegistration } from "@attu/ui"`
- `selection-context-menu.test.ts`: change `import ContextMenu, { type ContextMenuItem } from "$lib/components/ui/ContextMenu.svelte"` → `import { ContextMenu } from "@attu/ui"; import type { ContextMenuItem } from "@attu/ui"`
- `selection-palette-pick.test.ts`: change `import CommandPalette from "$lib/components/palette/CommandPalette.svelte"` → `import { CommandPalette } from "@attu/ui"`
- run `pnpm -F tree-editor test:unit`; confirm full pass

### phase 5 — commit
**status:** open
**DoD:** both packages green; committed on trunk
**scope:**
- decide commit strategy: one commit (revert + reorganization together) or two commits (revert first, then reorganization); record choice and apply
- stage all changes
- run `pnpm test:unit` at workspace root to confirm both packages pass
