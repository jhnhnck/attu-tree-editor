# bugs — ui-invariant-tests

scratchpad for bugs surfaced *during* this plan's work. anything that turns out to be a pre-existing bug in `notes/bugs.md` territory gets migrated there at `pre-merge` time.

format: one bullet per bug. severity tag `[blocker | important | nit]` up front. phase of discovery in parens.

## open

- [important] (phase 4) `FamilyViewCanvas.onPickerShowAlongside` and `onPickerHideAlongside` do not set `suppressNextFit = true`. expanding or hiding a secondary union shifts the layout bbox; the fit-effect re-runs and yanks the user's zoom/pan. matches the 32c6606 contract for `+`/badge but never landed for the picker actions. covered by `it.fails` rows in `auto-fit-suppression-handlers.test.ts` (rows `show-alongside`, `hide-alongside`, `secondary-union collapse`). one-line fix in each handler; deferred per "no unrelated bug fixes during phase 4".
- [important] (phase 4) `FamilyViewCanvas.onPickerSelect` (primary union swap) does not set `suppressNextFit`. today the test passes because `multi-union.ged`'s F1/F2 are shape-symmetric (1 partner + 1 child each) so the bbox is invariant; an asymmetric fixture would expose the same yank. logged for fix alongside the show/hide-alongside bug.
- [important] (phase 4) `FamilyViewCanvas`'s fit-effect key (`tree.id:focus:bbox.w:bbox.h`) omits hostW/hostH, so a host resize that leaves the layout bbox unchanged never triggers a refit. covered by `it.fails` row `host resize` in `auto-fit-suppression-handlers.test.ts`. fix is either to include host dims in the fit-key or to add a separate $effect that refits when hostW/hostH change.
- [important] (phase 0 → reduced in phase 1b, full close after phase 5) HyperbolicCanvas's `ResizeObserver` blocker is cleared by the phase 1b global shim. broader item — "HyperbolicCanvas mounts end-to-end in jsdom and contributes live cells to the parity matrix" — remains open and is phase 5's call once the matrix re-evaluation runs.
- [nit] (phase 0 → fix-in-phase-7) 2 remaining `_probes/` files (`chrome-geometry-approach-a`, `chrome-geometry-approach-b`) are documentation of phase-0 decisions, not assertions. Phase 7 should decide: fold their lessons into `notes/dev/test-strategy.md` and delete, or keep as living examples. Tests currently pass; no cleanup pressure.
- [nit] (phase 1 → defer to phase 7 docs) "smoke" e2e specs accumulate when unit tests feel insufficient (e.g. `inspector-more-actions-smoke` duplicated `Inspector.test.ts`). meta-observation, not a bug; surface as a guideline in phase 7 docs.

## closed (phases 0-2)

- [important] (phase 0 → done in phase 1) engine-picker.spec.ts cannot migrate to jsdom — phase 1 classification confirmed `keep (browser-only)`. disposition was the work.
- [important] (phase 1 → done in phase 1c) 3 `delete (covered)` specs (`family-view-debug-phase5.spec.ts`, `inspector-more-actions-smoke.spec.ts`, `shell.spec.ts`) all removed in phase 1c alongside the migrated counterparts.
- [important] (phase 2) wave-A subagent's chrome-geometry-menu + chrome-geometry-toast specs had transient errors observed by wave-B mid-write; final state verified clean (typecheck 0 errors, both specs green) before phase 2 commit.
- [important] (phase 1 → done in phase 1b) programmatic gedcom-fixture loader extracted as `tests/component/_harness/loadGedcomFixture.ts` (supports `.ged` and `.gdz`); paired `mountWithHostRect.ts` helper extracts the host-rect stub pattern. smoke test green; phase 1c unblocked.
- [nit] (phase 0) prettier drift on `ToggleMenuHarness.svelte` + `hyperbolic-mount.probe.test.ts` + `auto-fit-suppression.test.ts` — fixed inline at end of phase 0 build wave.

## won't-fix

- [nit] (phase 0, out-of-scope) 3 pre-existing failures in `apps/web/tests/unit/io/familyecho-html/parse.test.ts` (`parseFamilyEchoHtml`). Fail identically on trunk @ `069d281` and on worktree. Last touched in `5857a6a` (well before phase 0 started). Reason for won't-fix-in-this-plan: not introduced by `ui-invariant-tests`; doesn't block its success measure. Action item for the user: file in project-level `notes/bugs.md` if not already tracked there.
