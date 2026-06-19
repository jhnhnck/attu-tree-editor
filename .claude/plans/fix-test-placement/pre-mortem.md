# Pre-mortem — fix-test-placement

**Bottom line:** proceed with revisions — two internal logic errors in the plan as written; both are quick fixes before phase 1 starts.

---

### Risks

- [high] **premise** — phases 2 and 3 instruct "rewrite `@attu/ui` imports to `$lib/…`" but after `git revert d7cefc4 --no-commit` in phase 0, those files already have their original `$lib/…` imports — the revert already undid the @attu/ui changes. An implementer following the instructions will find no `@attu/ui` imports to rewrite and conclude the plan is wrong. The files just need to be moved. · probe: run `grep -r "@attu/ui" apps/tree-editor/tests/` after the phase-0 revert and confirm zero matches.

- [medium] **scope** — phase 4's "audit" label for `parity-matrix-stats-pill.test.ts`, `selection-context-menu.test.ts`, `selection-palette-pick.test.ts`, and `toggle-indicator-sweep.test.ts` understates the work. These four files were changed in d7cefc4 (they're in the 37-file list); after the revert they will have specific broken `$lib/…` imports pointing to now-deleted files. The plan treats them as "may need" when they will need targeted fixes. · probe: after phase-0 revert, grep these four files for `$lib/components/shell` or `$lib/state/auth` and enumerate each broken import so phase 4 has an explicit fix list.

- [medium] **operational** — phase 5 proposes a "single clean commit" combining `git revert --no-commit` output with file moves and targeted fixes. `git revert --no-commit` stages an inverse patch of d7cefc4; subsequent file moves and edits layer on top. The resulting diff will be large and semantically mixed (revert + reorganize), making it hard to review or bisect later. Two commits — one for the revert, one for the reorganization — would be cleaner and still land on trunk. · probe: confirm with the user before phase 5 whether one or two commits is preferred.

- [low] **walking skeleton** — phase 1 sets up the @attu/ui test infra but doesn't move any file; the first confirmation that a moved test actually passes in attu-ui doesn't happen until phase 2. If the setup.ts copy is incomplete (e.g., a tree-editor-specific shim is missing), all of phase 2 fails at once. · probe: at the end of phase 1, move the simplest test (`gregorian.test.ts`, pure TS, zero Svelte) to attu-ui as a canary; confirm it passes before moving the remaining 25 files.

- [low] **dependency** — `imagePipeline.test.ts` calls `createImageBitmap` and `OffscreenCanvas`, which jsdom does not implement natively. tree-editor's setup.ts may shim these; if the shim is tree-editor-specific rather than generic, copying setup.ts verbatim to attu-ui won't help. · probe: grep `apps/tree-editor/tests/setup.ts` for `createImageBitmap` and `OffscreenCanvas`; if found, confirm the shim is generic before treating "copy verbatim" as sufficient.

- [low] **scope** — `HaracalndeDate.test.ts` (from tree-editor) and the existing `haracalende-date.test.ts` in attu-ui both test `HaracalndeDate`. The plan says "merge unique test cases" but doesn't define the merge target filename or what happens to the existing file's place in CI. · probe: open both files side-by-side; if tree-editor's version is a strict superset, just rename it to `haracalnde-date.test.ts` and delete the existing file — no merge needed.

---

### Walking-skeleton check

Phase 0 is a legitimate baseline (revert + confirm failures). The canary test proposed above (move `gregorian.test.ts` at end of phase 1) closes the gap between "infra exists" and "a moved test actually passes." Add that move to phase 1's DoD.

---

### Phase-order revisions

| original | proposed | reason |
|---|---|---|
| phases 2/3 describe "rewrite imports" | describe "move files; imports are already $lib after phase-0 revert" | eliminates the logic contradiction |
| phase 4 "audit" for 4 files | enumerate broken imports explicitly after phase-0 probe | converts vague audit into a known fix list |

No reordering needed — the dependency chain (revert → infra → unit moves → component moves → fix remainder → commit) is correct.

---

### Definition-of-done additions

- **phase 0** — add: after revert, run `grep -r "@attu/ui" apps/tree-editor/tests/` and confirm zero matches; enumerate broken $lib imports in the four "audit" files and record them in phase 4 scope.
- **phase 1** — add: move `gregorian.test.ts` (and only this file) to `packages/attu-ui/tests/unit/date/` and confirm `pnpm -F attu-ui test:unit` passes before proceeding to phase 2.
- **phase 2** — change "rewrite @attu/ui imports" to "move files; $lib imports are already correct after phase-0 revert; verify no @attu/ui imports remain in moved files."
- **phase 3** — same change as phase 2.
- **phase 5** — resolve commit strategy: one commit (revert + reorg together) or two commits (revert, then reorg); record choice here before committing.
