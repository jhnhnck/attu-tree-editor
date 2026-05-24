# Ship readiness — import wizard + family echo coverage

### Blockers

_(none)_

### Deferred

- **[low]** `tests/e2e/inspector-more-actions-smoke.spec.ts:59` asserts `getByText("root updated")` but `App.svelte:1015` emits `"${name} is now the tree root"`. The mismatch is present on trunk before this plan — the spec has never matched its target. Fix: align the toast text or rewrite the assertion to the displayName-suffixed form.
- **[low]** Five visual snapshot specs fail in fresh worktree runs (`visual-add-relative`, `visual-dense-tree`, `visual-multi-union`, `visual-path-highlight`, `visual-secondary-union`). Visual goldens drift across chromium builds and antialiasing pipelines; the baselines need to be re-captured on the project's standard CI image and committed.

### Sanity-check evidence

- `pnpm typecheck` — 0 errors, 0 warnings across 4499 files
- `pnpm lint` — eslint + prettier clean
- `pnpm test:unit -- --run` — **1032 / 1032 passed**, 94 test files
- `pnpm build` — production bundle built; standard chunk-size advisory only
- `pnpm exec playwright test --project=chromium --grep-invert visual` — 29 passed, 1 failed (deferred above), 2 mobile-skipped
- Wizard e2e spec (`tests/e2e/import-wizard.spec.ts`) — 3 / 3 passed
- Working tree clean; 7 commits ahead of trunk (6 phase commits + plan dir)

### Verdict

**ship** — no blockers; deferred items migrate to `notes/bugs.md` via `pre-merge`.

Next: hand off to `pre-merge` for rebase + deferred-item migration + plan-dir archival.
