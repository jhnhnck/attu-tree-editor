# Ship readiness — ui-invariant-tests

### Prerequisites

- [x] integration-check pass — `pnpm -F web exec vitest run tests/component/` clean (46 files / 244 passed + 4 expected-fail + 16 skipped); full unit suite has 3 pre-existing `parseFamilyEchoHtml` failures unchanged since `5857a6a` (15+ commits before plan start), documented won't-fix in this plan
- [x] feature-completion — lint clean, typecheck 0 errors, all plan-introduced tests green, prettier-clean
- [x] no uncommitted changes — only the `notes/examples` symlink which is the auto-symlink hook's artifact, intentionally untracked (commit `e3fa7ad`)

### Blockers

none

### Deferred (follow-ups for the project bug log via `pre-merge`)

- [high] **`FamilyViewCanvas.onPickerShowAlongside` and `onPickerHideAlongside` do not set `suppressNextFit = true`** — secondary-union show/hide yanks user's zoom/pan; matches the 32c6606 contract for `+`/badge but never landed for picker actions. Locked in by `it.fails` rows `show-alongside`, `hide-alongside`, `secondary-union collapse` in `tests/component/auto-fit-suppression-handlers.test.ts`. One-line fix in each handler. Surfaced by phase 4.
- [high] **`FamilyViewCanvas` fit-effect key omits `hostW/hostH`** — host resize that leaves layout bbox unchanged never triggers refit. Locked in by `it.fails` row `host resize`. Fix is either to include host dims in the fit-key or to add a separate `$effect` that refits when host dims change. Surfaced by phase 4.
- [medium] **`FamilyViewCanvas.onPickerSelect` (primary union swap) missing `suppressNextFit`** — latent; today's test passes because `multi-union.ged`'s F1/F2 are shape-symmetric so the bbox is invariant; an asymmetric fixture would expose the same yank. Surfaced by phase 4.
- [medium] **HyperbolicCanvas emits duplicate keyed-each entries on `Inbred Family.gdz`** — `bond:IC6CP|WIF9X:0` collides at indexes 4 and 5. Repro: mount under jsdom. Root cause likely in `lib/layout/engines/hyperbolic-lr/layout.ts:455-473`. Mitigated locally in `parity-matrix-extended.test.ts` by using `eightPersonFamily()` for the hyperbolic fixture. Already logged in `notes/bugs.md` canvas section by the phase-5 subagent.
- [low] **"smoke" e2e specs accumulate when unit tests feel insufficient** — meta-pattern, not a defect. The `inspector-more-actions-smoke` case (full duplication of `Inspector.test.ts`) was the canonical example. Surface as an explicit anti-pattern note in `notes/features/test-invariants.md`'s "how to add a new invariant test" section.
- [low] **3 pre-existing `parseFamilyEchoHtml` test failures** — `apps/web/tests/unit/io/familyecho-html/parse.test.ts`. Failed identically on trunk `069d281` and the worktree branch. Last touched `5857a6a` (well before plan start). Not introduced by `ui-invariant-tests`. Action: file in `notes/bugs.md` if not already tracked there.

### Closed (resolved during the plan, not yet moved to `closed`)

- HyperbolicCanvas end-to-end mount under jsdom — phase 5 confirmed it mounts cleanly under the shim bundle and contributes 2 live cells (cursor-on-card, selection-clears-on-empty-click) plus 6 engine-specific `expectedSkip` cells with rationale
- `_probes/` cleanup — phase 7 deleted all 4 probe files and folded observations into `notes/dev/test-strategy.md`

### Verdict

**ship**

13 commits on `phase/ui-invariant-tests/all` (5578fd6 → af05be9). 8-phase plan delivered against original spec:

- 6 invariant suites covering all 6 documented ui bug-clusters: 46 component test files, 244 passing + 4 expected-fail + 16 skipped + 3 helper modules + 8 harness components
- 8 visual goldens + 14 png snapshots deleted (visual-mask helper too)
- 13 e2e specs deleted (10 migrated to jsdom; 3 covered-by-existing); 8 browser-only specs remain, each with documented real-browser rationale
- `notes/agents.md` §6 rewritten; `notes/features/test-invariants.md` written; `notes/dev/test-strategy.md` fleshed out
- jsdom shim bundle (`ResizeObserver` + `IntersectionObserver` + `matchMedia`) lands in `apps/web/tests/setup.ts`

Success measure (from the plan): "≥80% of historical incidents reproduce as test failures pre-fix." Active validation came from phase 4 surfacing 3 real production bugs (locked in as `it.fails`) and phase 5 surfacing 1 more — all routed to the deferred list. The tests are doing their job.

Next: `pre-merge` to rebase, migrate deferred items into `notes/bugs.md` and `notes/to-do.md`, archive the plan directory under `.claude/plans/archived/`, then the actual merge to trunk.
