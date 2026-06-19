# log — fix-test-placement

## starting phase 0 — 2026-06-18

**DoD:** revert staged; tree-editor shows exactly 37 failing files; broken imports in all "audit" stay-files are enumerated

worktree: opted out (no worktrees constraint in plan)

## phase 0 retro — 2026-06-18

DoD satisfied: revert staged, failures captured, broken imports enumerated, phase 4 scope updated.

findings:
- "37 failing files" in DoD was imprecise — 37 files reverted but only 30 test files fail (8 .svelte fixtures/harnesses not counted as test files; order.test.ts passes because dynamic imports still resolve)
- grep "zero matches" expectation wrong — 2 pre-existing `import type { PaletteItem } from "@attu/ui"` lines pre-dated d7cefc4 and are legitimate (B2)
- 3 tests misclassified as "stay in tree-editor": toggle-indicator-sweep, toggle-indicator-visible-state, keyboard-reachability-dateinput — all test pure attu-ui components; route to phase 3 (B1)
- StatsPillHarness broken imports were CanvasChromeDock + DockRegistration (not SaveStatusPill as the plan stated); phase 4 scope corrected

no downstream phase ordering changes. phase 3 gains 3 more files. phase 4 drops toggle-indicator-sweep and has explicit fix list.

## revision after phase 0 — 2026-06-18

plan changes (2):
- classification table: added toggle-indicator-sweep, toggle-indicator-visible-state, keyboard-reachability-dateinput to phase 3 move list; removed toggle-indicator-sweep from "stay in tree-editor"
- phase 3 DoD: +3 files (10 total), +PaletteItem type import fix for CommandPalette.test.ts
- phase 4 scope: removed toggle-indicator-sweep (now phase 3); corrected StatsPillHarness broken imports (CanvasChromeDock + DockRegistration, not SaveStatusPill); explicit fix per stay-file
- "stay in tree-editor" table: updated selection-context-menu and selection-palette-pick rows from "audit" to explicit fix instructions; removed toggle-indicator-sweep row

bugs.md: B1 (3 misclassifications) → closed-by-plan-revision; B2 (PaletteItem) → closed-by-plan-revision

next: phase 1 — expand @attu/ui test infrastructure

## starting phase 1 — 2026-06-18

**DoD:** `pnpm -F attu-ui test:unit` passes including canary gregorian.test.ts; component glob + setupFiles wired

worktree: opted out

## phase 2 retro — 2026-06-18

DoD satisfied: 12 test files + 4 fixtures moved to attu-ui; 13 attu-ui unit test files pass (180 tests); tree-editor down to 17 failures (107 passing stable).

findings:
- bulk move clean; zero @attu/ui imports in moved files confirmed
- HaracalndeDate merge: superset detected → replaced haracalende-date.test.ts with HaracalndeDate.test.ts; no manual merge
- imagePipeline.test.ts shim risk didn't materialize (setup.ts shims sufficient)
- plan's "16 remaining unit test files" was a counting error (12 test files + 4 fixtures = 16 items, not 16 test files); no impact

no plan revisions needed.

## revision after phase 2 — 2026-06-18

no plan changes. phase 3 unchanged.

next: phase 3 — move component tests to @attu/ui

## starting phase 3 — 2026-06-19

**DoD:** 10 component test files + 3 harnesses pass in attu-ui; deleted from tree-editor; PaletteItem import fixed

worktree: opted out

## phase 3 retro — 2026-06-19

DoD satisfied: 23 attu-ui test files pass (254 tests); tree-editor down to 7 failures (107 passing stable).

findings:
- only one import fix needed: PaletteItem in CommandPalette.test.ts → $lib/palette
- cascade failures from broken harnesses eliminated by moving MenuHarness, TabOrderHarness, ToggleMenuHarness
- 7 tree-editor failures remain; matches phase 4 scope
- no plan revisions needed

## revision after phase 3 — 2026-06-19

no plan changes. phase 4 unchanged.

next: phase 4 — fix remaining tree-editor tests

## starting phase 4 — 2026-06-19

**DoD:** `pnpm -F tree-editor test:unit` passes with no failures

worktree: opted out

## phase 4 retro — 2026-06-19

DoD satisfied: 114 tree-editor test files pass (1074 tests, 16 skipped); 0 failures. attu-ui still 23 files, 254 tests.

findings:
- plan classified `OpenDialog.test.ts` and `family-view-debug-navigation.test.ts` as "no changes" but both had broken $lib imports after the revert (`$lib/utils/result` and `$lib/components/canvas/dockRegistry.svelte` respectively) — fixed with `@attu/ui` imports
- PortraitField mock changed from `vi.mock("$lib/components/editor/CropperDialog.svelte", ...)` to `vi.mock("@attu/ui", async (importOriginal) => { ...orig, CropperDialog: stub })` — the `importOriginal` spread was required since `@attu/ui` exports many symbols used by other components
- static import hoisting in order.test.ts worked cleanly; all 3 integration tests converted from async+dynamic to sync+static
- 6 parallel Edit calls in this session failed with "File has not been read yet" when only grepped (not Read); fixed by re-reading before editing

no plan revisions needed.

## revision after phase 4 — 2026-06-19

no plan changes. phase 5 unchanged.

next: phase 5 — commit

## starting phase 1 — 2026-06-18 — 2026-06-18

DoD satisfied: 2 test files pass in attu-ui (haracalende-date + gregorian canary); component glob + setupFiles wired; tree-editor 107 passing stable.

findings:
- pnpm filter is `--filter "@attu/ui"` not `-F attu-ui`; plan examples use -F but actual invocation uses full scoped name
- createImageBitmap / OffscreenCanvas shim risk didn't materialize — setup.ts had none; copied cleanly
- no plan revisions needed

## revision after phase 1 — 2026-06-18

no plan changes. phase 2 unchanged.

next: phase 2 — move unit tests to @attu/ui

## starting phase 2 — 2026-06-18

**DoD:** 12 unit test files + 4 fixture Svelte files pass in attu-ui; deleted from tree-editor

worktree: opted out
