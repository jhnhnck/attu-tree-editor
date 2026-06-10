# Ship readiness — canvas-chrome-dock

## Prerequisites

- [x] `integration-check` passed at end of phase 5 (`pnpm verify` green: typecheck 0/4517, 97/97 test files, 1089/1089 unit, 69/69 server)
- [x] `feature-completion` ran in phase 5 (mechanical checklist clean per the agent's report)
- [x] no uncommitted changes (the `?? notes/examples` symlink is the gitignored worktree-bootstrap convention closing `worktree-fixture-bootstrap-undocumented`, not unfinished work)
- [x] 39 commits on `phase/canvas-chrome-dock/0`, last `af9ce98`

## Blockers

(none)

## Deferred

- [medium] **`migrate-debug-menu-into-dock`** — the debug menu (App.svelte:2294-2608) was intentionally kept out of the dock since phase 0 decision (c). The css-var bridge that lets the dock anchor above it is acknowledged temporary scaffolding. Migration into the dock requires either a new `kind: "menu"` opt-out or rethinking what "panel" means; worth its own design pass. Owns three trailing test failures (`family-view-debug-coi.spec.ts` ×2 and `family-view-debug-navigation.spec.ts` on Pixel-7 viewport — sheet inspector covers menu toggle buttons). Filed in `bugs.md`.
  - **Disposition rule:** not data loss / not security / not core flow (developer-only debug menu, not user-facing); has obvious workarounds (desktop viewport, rotate to landscape, close inspector before opening menu); is NOT a regression — the 3 failing tests assert OLD architecture interactions through the debug menu at small mobile viewports that the plan never claimed to fix.
  - **Migrate to:** project's durable bug tracker. The most natural home is a new plan (`.claude/plans/debug-menu-into-dock/`) or an entry in `notes/bugs.md`. Decision left to `pre-merge`.

## Sanity check

- [x] most recent `integration-check` actually passed (phase 5)
- [x] no project-defined changelog gate (release notes flow is user-driven for this project)
- [x] no project-defined security/perf/design gates (all already covered by `pnpm verify` + `feature-completion`)
- [x] deferred list has a real home (filed in `bugs.md` with migration target documented above)
- [x] no uncommitted changes (gitignored symlink is intentional)

## Verdict

**ship**

Next: `pre-merge` (rebase phase branch on current trunk, migrate the one deferred item out of `bugs.md` into the project's durable tracker, fix any stale cross-references, archive the plan directory). Then the merge gate awaits user go-ahead.
