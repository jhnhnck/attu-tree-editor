# Ship readiness — canvas-window-manager (post phase 5)

59 commits on `phase/canvas-window-manager/0` (HEAD `d41008c`), rebased clean onto local `trunk` (`8972d27`). phases 0-5 closed. all 12 user-reported issues recorded as closed in `notes/bugs.md` since phase 4; phase 5 reconciled the branch with ui-invariant-tests without touching production.

prerequisites checked:
- integration-check — phase 5 sub-agent ran `pnpm verify` (typecheck + lint + build + unit): green. 3 unit failures are the pre-existing `familyecho-html` symlink item (item 1 below), confirmed pre-branch
- feature-completion — phase 5 sub-agent confirmed
- code-review — no uncommitted production diff; the only untracked path is `notes/examples` (hook-generated symlink, deliberately untracked per commit `b4de227 chore(worktree): untrack notes/examples symlink post-rebase`)

### Blockers
(none)

### Deferred

all three items are pre-existing trunk drift, not canvas-window-manager regressions. none corrupt user data, weaken auth, hit the most-used path, or violate a downstream-consumer contract. all classify as **follow-up** per the skill's rules.

- [medium] `apps/web/tests/fixtures/familyecho-sample.html` symlink target no longer exists on trunk (`notes/examples/My-Family-24-May-2026-103040590.html` was replaced by an `Apr-2026`-dated copy); three vitest cases in `tests/unit/io/familyecho-html/parse.test.ts` fail with ENOENT. trunk follow-up: rename the symlink target or re-add the missing fixture file.
- [medium] e2e suite drift — commit `b390638 feat(canvas): roving-tabindex keyboard nav, aria tree roles` flipped the family-view canvas-host from `role="region"` to `role="tree"` without updating the e2e suite. ui-invariant-tests narrowed scope to 3 surviving specs (`family-view-add-relative.spec.ts`, `family-view-continuity.spec.ts`, `collapse-badge-end-to-end.spec.ts`). trunk follow-up: rename `getByRole("region", ...)` → `getByRole("tree", ...)` across the surviving specs.
- [low] `canvas-chrome-dock.spec.ts` test `h)` pins pill height ≤ 29px (1.75rem × 16px) but root font-size is 110% (commit `abea73c`), so 1.75rem = 30.8px > 29. trunk follow-up: update the slack constant or the rem→px math in the test.

### Won't-fix (recorded for completeness)

- visual snapshot specs stale against the 110% root font-size bump — moot. ui-invariant-tests (`c357a79 test(e2e): delete all visual goldens and visual-mask helper`) deleted every visual-* spec; the staleness now has no consumer.

### Verdict
ship
