# bugs — family view wave 2

per `notes/dev/process.md`, this file accumulates findings outside the
current phase's scope. `bug-triage` walks it between phases. `## open`
items get triaged at phase boundaries; resolved items move to
`## closed` at phase close.

## open (carried in from wave-1 ship-gate)

- family-view layout has no crossing-minimisation → **phase 2 (or
  defer)** (rev 1: was phase 3, swapped to phase 2; rev 2: hook
  point and edge-id contracts updated to match the post-visual-
  fix-up layout pipeline — see `plan.md` phase 2 implementation
  context).
- no smooth-diff animation → **phase 3 (spike-gated)** (rev 1: was
  phase 2, swapped to phase 3).
- vite-preview e2e workflow requires `pnpm build` before each run →
  **phase 0**.
- collapse-badge e2e skipped on akarians → **phase 1**.
- multi-union renderer commits to one-union-at-a-time → **phase 4
  (secondary-union expansion; RV phase 3b shipped in `aba7de0`)**
  (rev 1: was "commits to N=2; blocked on RV 3b" — renamed for
  terminology disambiguation, dep updated).
- `tests/spikes/layered-metrics.spike.test.ts` unused-locals warning
  → **phase 0** (rev 1: previously marked deleted-pending; rev 1
  reopened the decision — keep+fix or delete-with-snapshots-
  together. see `plan.md` phase 0 entry).
- `˅` aria-label lesson worth capturing in `notes/agents.md` →
  **phase 0**.
- on-path stroke / ring theme tokens still raw tailwind → **phase 0**.
- family-view zoom not centered + "100%" not a stable reference →
  **phase 0** (carried over from wave-1's open bug log; rev 1: now
  has a design-note gate — may split to phase 0b).
- shared visual-golden mask helper for akarians goldens → **phase 1**.
- mobile inspector-overlay e2e flakiness (3 tests on Pixel 7) →
  **phase 0** (rev 2: precise signature recorded by the visual fix-
  up plan's B4 — 2 of the 3 tests fail because the empty-state
  placeholder overlay intercepts the `Use layered engine` menuitem
  click during engine swap. desktop chromium is clean. confirmed
  pre-existing across all 6 phases of the visual fix-up plan, so
  not a regression in either plan. the third test, which the wave-1
  ship-gate noted, may be unrelated; verify at phase 0 start).
- `family-view-latency.test.ts` flaky at 50 ms budget under CPU
  contention → **phase 0** (rev 2: re-tested across 4 phases of the
  visual fix-up plan with measured times 11.13 / 15.65 / 16.51 ms
  for 3-expand and 10-expand on idle. no flake observed since the
  wave-1 ship-gate. **the loosen-to-75ms-plus-retry-once item may
  no longer be needed** — start phase 0 by re-running the test 10×
  on a contended CPU; if it stays under 50 ms, close this item
  without code change. if it flakes, the rev-1 plan still applies).

## open (carried in from visual fix-up plan residual debt — 2026-05-22)

these closed-with-defer items in the visual fix-up plan's bug log are
relevant to wave-2 phases. routed here so the visual fix-up plan can
stay closed and wave-2's phase-loop sees them at the next triage.

- **B5** zoom-matrix verification for the #6 integer-pixel-rounding
  fix never ran at 0.5× / 2.0× zoom (the rounded coords land on
  half-pixel grid offsets at non-1 scales). `shape-rendering:
  crispEdges` fallback is documented in
  `engines/family-view/edgePath.ts` but not applied. → **phase 0**
  (folds naturally into the zoom-anchor + stable-100% work; once
  zoom is fixed, re-run the matrix and decide whether to apply the
  crispEdges fallback).
- **B6** the explicit sibling bus emits `role: "blood"` uniformly
  even when every kid of the couple is a half-sibling. per-kid stubs
  carry the correct role; only the bus itself is uniform. visually
  fine today (bus = shared-children-line; stubs = per-kid role) but
  a relationship-vocabulary palette enrichment may want bus-level
  roles. → **phase 4** (secondary-union expansion is the natural
  home; if union-fan geometry exposes per-bus role distinctions,
  fold this in then).
- **B11** `orientCouple` swaps left/right by personId lex order; the
  pattern has bitten family-view test assertions twice (visual fix-
  up phases 2 and 3). visual fix-up's plan-revise deferred the
  `tests/_helpers/family-view.ts` `pickLeftRight(layout, ids)`
  proposal to "if a third phase trips on it" — wave-2 phase 2
  (crossing-min) is the most likely third instance because the new
  pass will need to assert "leftmost-at-rank-N is X". → **phase 0
  or phase 2** (introduce the helper preemptively in phase 0's
  test-hygiene cluster, or defer until phase 2 actually trips on
  it; preference: preempt, the helper is ~10 lines).
- **B12** `.is-portrait-pending` slot background transition is
  unguarded — the slot snaps from neutral grey to the resolved
  portrait the instant the blob URL resolves. sub-perception on
  cached blobs (<100 ms typical). → **phase 0** (tiny CSS
  `transition: background-image 80ms ease-out` if phase 0 touches
  PersonNode's portrait-slot rules at all; otherwise defer).

## owned elsewhere (handed off, not duplicated here)

- `emitFinding` lacks server-side persistence → RV workstream's
  schema-rejection path.
- server-side `multi-parent-unsupported` finding deferred → RV
  workstream.

## triaged & deferred

(empty.)

## closed

- RV-Phase-3b treeDiff round-trip WIP (wave-1 ship-gate blocker)
  → shipped in `aba7de0` (14 May 2026); always-on `tree.unions[]`
  + family-view N>2-partner renderer landed together. *closed via
  RV workstream; recorded here so wave-2 phase 4 sees the resolved
  blocker.*
- **visual-akarians baseline snapshot dir untracked** (rev 2,
  23 May 2026) → resolved during the visual fix-up plan's phase 0
  (`cf15ea7`, 14 May 2026). the dir is tracked and the snapshot
  has been actively re-baselined across phases 1–5 of that plan
  as the family-view rendering evolved (portrait slot, cumulative
  rank-y, explicit sibling bus, generation-badge default flip,
  border-radius bump). the rev-1 "source-of-change for layered
  metrics" pre-commit gate from phase 0 is **NOT** retroactively
  satisfied — the layered metrics shifted (ghosts 167 → 129,
  crossings 2852 → 1934) without an explained source — but the
  shift is now embedded in 6 phases of subsequent visual-fix-up
  commits, so the rollback path that gate protected no longer
  exists. *the gate's investigation is still worth doing in phase
  0 (just `git log --diff-filter=M apps/web/src/lib/layout/` and
  document what moved the layered metrics), but the snapshot
  commit itself is no longer pending.*
