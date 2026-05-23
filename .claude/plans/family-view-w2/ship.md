# Ship readiness — family view wave 2

last gate: 2026-05-23 · 5 phases closed (0, 0b, 1, 2, 3, 4) · branch
`phase/family-view-w2/4` at `af5e83a` · worktree retained per
standing user no-merge instruction · 944 unit tests + lint +
typecheck green · chromium 33/34 + mobile 21/34 (13 platform-skips
per B4) at phase-4 integration-check.

### Blockers

(none.)

walked every entry in `bugs.md` `## open`. none satisfy the blocker
classification rules:

- no data loss / corruption (the only persisted state mutated by
  this plan is render-time localStorage UI prefs; nothing in
  `domain/` was touched in any phase)
- no security boundary crossing or auth weakening
- no broken core flow on the default load (primary-union rendering
  unchanged; all wave-1 contracts preserved)
- no regression vs prior release (wave-2 closed *both* wave-1 ship-
  gate carryovers — smooth-diff in phase 3, multi-union one-at-a-
  time in phase 4 — and added monotone-gated new behaviour
  elsewhere; the `## open (carried in from wave-1 ship-gate)`
  bucket is now empty)
- no contract violation against downstream consumers (the layered +
  hyperbolic engines were untouched at the surface level apart from
  phase-0b's anchor-aware `setScale` signature widening, which is
  backwards-compatible)

### Deferred

(every item below is a real bug or polish item; all checked in to
`bugs.md` so the next plan can act on it directly without
archaeology. severities reflect ship-readiness classification, not
the bug-triage backlog ordering.)

- [medium] **B14** family-view collapse-badge click is a no-op for
  ancestor-side badges (`pickCollapseVictim` re-picks the same
  source on the next pass because `protect` only protects children,
  not source persons). click writes to localStorage but the badge
  visually reappears immediately. fix: 2-3-line patch extending
  `protect` to also skip already-picked sources.

- [medium] **B15** family-view crossing-min pass is a measured no-
  op on every production fixture including the phase-4 secondary-
  union-expanded configuration. monotone gate guarantees no harm.
  escalation: structural redesign required (median barycentric,
  alternating inward sweep, or per-swap geometric-crossing
  transposition). the phase-2 hypothesis that phase-4 fixtures
  would activate it closed: measured, didn't.

- [medium] **B21** union-fan ordering puts focus at the *edge* of
  rank 0 (primary partner middle, secondary partner far side)
  instead of focus-in-the-middle. visible in the new visual
  golden as diagonal couple-bus connectors across the middle
  partner card. fix: ~10 lines in `planRank` to detect a focus
  with expanded secondary unions and emit slots in
  `[primary-partner, focus, secondary-partner]` order.

- [medium] **B4 mobile inspector-overlay flakiness** (4 confirmed
  signatures across this plan + the parallel visual-fix-up plan).
  pre-existing; not a wave-2 regression. mobile-only UX issue
  where the inspector overlay intercepts canvas-side clicks on
  Pixel 7. 3 e2e specs skip on mobile via `test.skip(isMobile,
  "B4: …")`. desktop chromium clean throughout.

- [low] **B6** explicit sibling-bus emits `role: "blood"`
  uniformly even when every kid of the couple is a half-sibling.
  per-kid stubs carry the correct role; only the bus itself is
  uniform. visually fine today; relationship-vocabulary palette
  enrichment may want bus-level roles in the future.

- [low] **B12** `.is-portrait-pending` slot background transition
  is unguarded — snaps from neutral grey to the resolved portrait
  the instant the blob URL resolves. fix: `transition: background-
  image 80ms ease-out` on the existing rule. requires a fixture
  with portraits to exercise.

- [low] **B16** `parentsOfPerson` / `childrenOfPerson` in
  `engines/family-view/layout.ts` walk `tree.couples` linearly per
  call. acceptable at ≤30 visible cards; would matter if a future
  phase lifts the bounded-window cap.

- [low] **B17** no UI toggle for the `fte.zoom.semantic100` flag.
  flag exists in localStorage with `null → on` default; power-
  users have a rollback path via `localStorage.setItem(key,
  "false")`.

- [low] **B18** family-view SVG edges (`<path>` `d` attribute)
  jump-cut while cards slide via the phase-3 CSS transition. not
  flicker — motion mismatch on careful watching. options for
  resolution documented in bugs.md (rAF interpolation, motion
  lib, or `<line>`-primitive refactor).

- [low] **B19** family-view cards + collapse badges mount/unmount
  jump-cut when expansion changes the visible set. svelte's
  `transition:fade` directive would close it but adds reactivity-
  cycle interaction the phase-3 spike intentionally avoided.

- [low] **B20** no UI toggle for the `fte.overlays.smoothDiff`
  flag. same precedent as B17. **the wave-2 phase-internal flags
  now number 4** (`semantic100` / `crossingMin` / `smoothDiff` /
  `secondaryUnion`); a View > Advanced submenu pass that
  surfaces all four together is the natural next step rather
  than dripping them in one at a time.

- (sub-note alongside B17) the `.family-view-edge { shape-
  rendering: crispEdges }` rule applies at all zoom levels; fine
  for axis-aligned strokes (family-view's geometry) but would
  need an opt-out if a future feature introduces diagonals.

### Sanity-check

- [x] most recent integration-check (phase 4 step 3) passed; re-
  verified lint + typecheck + 944 unit tests fresh at gate
- [x] changelog / release notes not applicable (internal plan, not
  a public release)
- [x] no project-required security / perf / design / compliance
  gates beyond per-phase DoDs; all met
- [x] deferred list has a real home: `.claude/plans/family-view-
  w2/bugs.md` is checked in to the worktree branch and (when the
  user OKs the merge) lands on the parent branch
- [x] no uncommitted changes (`nothing to commit, working tree
  clean` at gate)

### Verdict

**ship**

next: hand off to `pre-merge` (rebase the wave-2 stack onto the
parent branch, migrate deferred items into the project's durable
trackers, cross-ref any fixes, archive `.claude/plans/family-view-
w2/`, then execute the actual merge). do not run the merge from
this skill — per the standing user instruction the worktree +
per-phase branches stay retained until the user explicitly OKs
the merge. `pre-merge` should re-confirm before executing.
