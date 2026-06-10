# Ship readiness — family-view debug overlay & diagnostics

walked by `ship-readiness` on 2026-05-24. all 6 phases (0-5) closed `green`; `pnpm verify` green on `worktree-family-view-debug`; working tree clean. 17 open items in `bugs.md` § open, all tagged `[nit]`.

### Prerequisites

- integration-check: passed at end of phase 5 (`pnpm verify` green on the worktree)
- feature-completion: clean per phase-5 retro (tests, docs, plumbing, lint)
- code-review: no uncommitted changes; nothing dangling at the gate

### Blockers

none.

classification rule check against every open item: none corrupt user data, weaken auth, cross a security boundary, hit the most-used path, regress prior-release behavior caused by this plan, or violate a downstream contract. the 6 failing visual goldens are pre-existing on trunk (commit `2a394ee fix(tree): bump family-view edge stroke widths` shifted strokes without refreshing snapshots) — confirmed by re-running on the main repo. not caused by this plan; resolves naturally on rebase since the COI rounding fix is already on trunk.

### Deferred (all `nit`, follow-up only)

migration target: `notes/bugs.md` at `pre-merge` time. each entry is specific enough to act on cold.

- [low] 6 visual-regression e2e goldens stale on trunk (`visual-add-relative`, `visual-akarians-family-view`, `visual-dense-tree`, `visual-multi-union`, `visual-path-highlight`, `visual-secondary-union`); regenerate via `pnpm exec playwright test --update-snapshots` in a housekeeping commit
- [low] `notes/examples/` fixtures unresolved in fresh worktrees; document setup in `notes/agents.md` or commit the fixtures
- [low] off-subset side panel caps each reason at 20 names + "+N more"; revisit at 50+
- [low] secondary-union-state pill may overlap next-rank connectors on dense rows; toggle-gated so zero production impact
- [low] `subset.ts:classifyRejections` rank-cutoff fallback is O(P²); invert into per-person parent set if `rationale` ever moves to the hot path
- [low] `showCardCollisions` has no positive-case e2e; mint a collision fixture only if a real bug appears
- [low] `showPendingRecenter` watchdog has no positive-case e2e; needs an injectable missed-recenter repro
- [low] `recordFocusEvent` linear scan could mis-attribute `didTriggerCenterOn` on interleaved same-person recenters; key by `(personId, seq)` if async recenter ever lands
- [low] phase-3 viewport rect recomputes on every pan/wheel frame; candidate for `requestIdleCallback` throttle if a profile shows overlay work on the hot path
- [low] coi `raw` cell uses `Number.prototype.toString()`; may show float drift on real pedigrees; cosmetic
- [low] `_coiWarnedFor` is per-component-instance; rapid mount/unmount cycles re-emit `console.warn`
- [low] `getCoiCacheStats()` returns module-cumulative counters; add `__treeDebug.coi.reset()` only if a diagnostic case appears
- [low] unified collapsible debug-overlay dock not landed; per-panel collapsible header is mitigation; full draggable/docked container with tabs is the long-term fix
- [low] `showLayoutMetrics` reports last-pass duration only; histogram / P95 sliding window deferred to a perf phase
- [low] `showLastEditHalo` ring keyed on `lastEditPos.id` only; consecutive edits to same person don't replay animation; `editSeq` bump would unblock
- [low] `showLastEditHalo` has no positive-case e2e; underlying `debugLastEditedId` covered by `redraw-on-edit.spec.ts`
- [low] yellow `showLastEditHalo` stroke (~2:1 contrast vs light theme) matches layered overlay's `#fde047`; flag if user reports
- [low] document `[data-person-id]` overlay-vs-card locator trap in `notes/agents.md` next time the section is touched

### Sanity check

- [x] most recent integration-check passed (phase 5, on this worktree)
- [x] no release-notes / changelog required (diagnostics-only PR)
- [x] no security / perf / design / compliance gates beyond `pnpm verify`
- [x] deferred list has a home (`notes/bugs.md`, migrated by `pre-merge`)
- [x] no uncommitted changes; working tree clean

### Verdict

**ship**

next: `pre-merge` — rebase on trunk (the 6 visual goldens are expected to resolve, since trunk already carries the COI rounding fix and the stroke-width shift that invalidated them), migrate the deferred list into `notes/bugs.md`, archive the plan dir, then the actual `git merge --ff-only` into trunk.
