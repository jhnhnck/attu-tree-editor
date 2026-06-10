# bugs — canvas window manager

bug-triage operates on this file.

## open

### pre-existing trunk drift (not canvas-window-manager regressions)

- [important · defer] **familyecho-sample.html fixture symlink dangles.** `apps/web/tests/fixtures/familyecho-sample.html` → `../../../../notes/examples/My-Family-24-May-2026-103040590.html`. the symlink target no longer exists in the main checkout's `notes/examples/` (replaced by an `Apr-2026`-dated file). three vitest cases in `tests/unit/io/familyecho-html/parse.test.ts` fail with `ENOENT` as a result. confirmed present at branch base 9022ea9 — not introduced by canvas-window-manager. disposition: trunk follow-up — rename the symlink target OR re-add the missing fixture file.
- [important · defer] **e2e family-view tests look for `role="region"` but the canvas now ships `role="tree"`.** commit `b390638 feat(canvas): roving-tabindex keyboard nav, aria tree roles` flipped the family-view canvas-host role from `region` to `tree` without updating the e2e suite. ui-invariant-tests (trunk) subsequently deleted ~13 of the originally-affected specs, narrowing scope. surviving affected specs post-rebase: `family-view-add-relative.spec.ts`, `family-view-continuity.spec.ts`, `collapse-badge-end-to-end.spec.ts`. disposition: trunk follow-up — rename `getByRole("region", ...)` → `getByRole("tree", ...)` across the surviving suite.
- [important · defer] **canvas-chrome-dock test `h)` pins pill height ≤ 29px (1.75rem at 16px root), but root font-size is 110% (commit abea73c).** at 110%, 1.75rem = 30.8px > 29. `canvas-chrome-dock.spec.ts` survives the ui-invariant-tests deletion, so the failure mode remains live. trunk follow-up: update the slack constant or the rem→px math in the test.

## won't-fix

- **visual snapshot specs stale against the 110% root font-size bump** (was: `visual-akarians.spec.ts`, `visual-akarians-family-view.spec.ts`). ui-invariant-tests (trunk commit `c357a79 test(e2e): delete all visual goldens and visual-mask helper`) deleted every visual-* spec and the visual-mask helper. won't-fix reason: the offending consumers no longer exist on trunk; the staleness is moot for the e2e suite post-rebase.

## closed

(none)
