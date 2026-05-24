# bugs — import wizard + family echo coverage

Phase-local bug log. Items found outside the current phase's scope land here, get a severity + disposition via `bug-triage`, and either get fixed in a later phase, deferred to `notes/bugs.md`, or won't-fix at ship gate.

## open

- **nit / pre-existing.** `tests/e2e/inspector-more-actions-smoke.spec.ts:59` asserts `getByText("root updated")` but `App.svelte:1015` toasts `"${name} is now the tree root"`. Mismatch present on trunk before this plan; the spec has never passed against the current toast text. Disposition: **defer** to `notes/bugs.md`; not a phase-5 regression. Either align the toast to "root updated" or rewrite the assertion to match the displayName-suffixed format.
- **flake / visual goldens.** 5 visual snapshot specs fail in the fresh worktree on first run: `visual-add-relative`, `visual-dense-tree`, `visual-multi-union`, `visual-path-highlight`, `visual-secondary-union`. Visual golden flakiness in worktrees is a known pattern (different chromium build / antialias output). Disposition: **defer** to `notes/bugs.md` with the suggestion that the goldens be re-baselined post-merge on the same CI environment they were captured on.

## closed
