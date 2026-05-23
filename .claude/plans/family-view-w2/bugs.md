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
- collapse-badge e2e skipped on akarians → **phase 1**.
- multi-union renderer commits to one-union-at-a-time → **phase 4
  (secondary-union expansion; RV phase 3b shipped in `aba7de0`)**
  (rev 1: was "commits to N=2; blocked on RV 3b" — renamed for
  terminology disambiguation, dep updated).
- family-view zoom not centered + "100%" not a stable reference →
  **phase 0b** (carried over from wave-1's open bug log; rev 1
  added the design-note gate. phase 0 [2026-05-23] tripped the gate
  — sketch recorded in `plan.md` phase-0 work item, formal phase 0b
  to be created by this revision).
- shared visual-golden mask helper for akarians goldens → **phase 1**.

## open (carried in from visual fix-up plan residual debt — 2026-05-22)

these closed-with-defer items in the visual fix-up plan's bug log are
relevant to wave-2 phases. routed here so the visual fix-up plan can
stay closed and wave-2's phase-loop sees them at the next triage.

- **B5** zoom-matrix verification for the #6 integer-pixel-rounding
  fix never ran at 0.5× / 2.0× zoom (the rounded coords land on
  half-pixel grid offsets at non-1 scales). `shape-rendering:
  crispEdges` fallback is documented in
  `engines/family-view/edgePath.ts` but not applied. → **phase 0b**
  (folds with the zoom-anchor + stable-100% work; once zoom is
  fixed, re-run the matrix and decide whether to apply the
  crispEdges fallback). re-routed from phase 0 by phase 0's
  plan-revise (the umbrella work moved out of phase 0).
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
  pass will need to assert "leftmost-at-rank-N is X". → **phase 2**
  (phase 0 [2026-05-23] did not pre-empt — none of phase 0's work
  touched left/right tie-breaks, and the helper is best introduced
  alongside the first asserter that needs it).
- **B12** `.is-portrait-pending` slot background transition is
  unguarded — the slot snaps from neutral grey to the resolved
  portrait the instant the blob URL resolves. sub-perception on
  cached blobs (<100 ms typical). → **phase 1** (phase 0 [2026-05-23]
  did not touch PersonNode portrait-slot rules; defer to phase 1's
  fixture / e2e work where PersonNode is exercised again).

## open (phase 0 finding — 2026-05-23)

- **B13** `tests/e2e/visual-path-highlight.spec.ts` golden mismatch
  on a fresh worktree: the committed snapshot is 920×806, the local
  capture comes back 920×1241 (canvas region growing by 435 px while
  card content stays in the same upper region). 4344 pixels diff
  out of >1.1M (ratio 0.01) on the overlapping portion — the visible
  content is identical, only the captured region is taller. confirmed
  on a `.family-view-onpath` noop diagnostic so phase 0's on-path
  token swap is not the cause; the same regression reproduces against
  the pre-phase-0 source files inside the worktree. likely an
  environment / viewport / DPR delta between whatever rendered
  `f00d718`'s rebaseline and a fresh `vite build` + `vite preview`
  run on this host. → **phase 1** (the dense-tree fixture +
  `maskUnstableUI` helper is the natural place to also audit
  region-bounds determinism). complicating factor: this worktree's
  `pnpm install` picked up `@playwright/test ^1.60.0` (chromium-1223),
  but the local browser cache only ships chromium-1217 — auto-mode
  classifier (correctly) blocked `playwright install`, so the
  remainder of the visual-golden suite couldn't be re-verified in
  the same worktree after the cache mismatch surfaced. integration
  check ran from a previous warm install instead, and the other
  family-view goldens (visual-akarians-family-view,
  visual-multi-union, visual-add-relative, visual-akarians) all
  passed at 920×684. the regression is specific to path-highlight's
  taller canvas-region capture.

## owned elsewhere (handed off, not duplicated here)

- `emitFinding` lacks server-side persistence → RV workstream's
  schema-rejection path.
- server-side `multi-parent-unsupported` finding deferred → RV
  workstream.

## triaged & deferred

(empty.)

## closed

- **vite-preview e2e workflow requires `pnpm build` before each run**
  → closed in phase 0 (2026-05-23). `playwright.config.ts`'s
  webServer command now chains `npx vite build && npx vite preview`;
  timeout raised 60s → 180s to accommodate the build. preference
  per plan was "chain it (less documentation drift)".
- **`tests/spikes/layered-metrics.spike.test.ts` unused-locals warning**
  → closed in phase 0 (2026-05-23). the generator was already
  deleted in `264b920` (14 May 2026); the orphaned baseline files
  at `notes/profiles/layered-baseline.md` and `layered-metrics.json`
  retained with a frozen-historical-snapshot header noting the
  removal commit, the regen path (resurrect from `aefdb1b`), and
  the documented source of the 167→129 ghost / 2852→1934 crossing
  shift (`6e4c80c`, "phase-6 family-view engine consolidation").
- **`˅` aria-label lesson worth capturing in `notes/agents.md`**
  → closed in phase 0 (2026-05-23). the lesson was already at
  `notes/agents.md:278` ("Aria-label substrings are *also* selector
  surface … When adding an affordance, scan existing aria-label /
  role selectors before settling on copy.") in an earlier commit.
  no additional edit required.
- **on-path stroke / ring theme tokens still raw tailwind** → closed
  in phase 0 (2026-05-23). `--fte-on-path-stroke-width` (5) and
  `--fte-on-path-ring-color` (theme-aware accent at 70% alpha)
  added to `app.css` `@theme` plus the light / dark / preferred-
  scheme blocks. new `.family-view-onpath` CSS class consumes the
  ring token; `.family-view-onpath-edge` now reads the stroke-width
  token. `FamilyViewCanvas.svelte` lost three raw `ring-2
  ring-accent/70` / `stroke-[5]` utilities (edge stroke, card
  wrapper, badge wrapper). visual goldens that didn't already
  require re-baseline are unchanged.
- **mobile inspector-overlay e2e flakiness (3 tests on Pixel 7)**
  → closed in phase 0 (2026-05-23) via manual-repro gate. precise
  signature: the `PortraitField` "no portrait" placeholder
  (`apps/web/src/lib/components/editor/PortraitField.svelte:67-72`)
  nested inside the inspector bottom-sheet on Pixel 7 viewport
  (`isSheet === true` when ≤600 px wide; sheet absorbs 75 % of
  viewport height and a person without a portrait grows a
  `aspect-square w-full` block that pointer-events-captures the
  area where the View-menu dropdown lands). two of the three
  wave-1-flagged tests still reproduce on Pixel 7
  (`family-view-continuity.spec.ts` "family-view is the default and
  selection survives engine swaps", same file "edit made in family-
  view is visible after switching to layered"); both now carry
  `test.skip(isMobile, "B4: …")`. third pre-existing-flake test no
  longer reproduces (`engine-picker.spec.ts` passes 2/2 on Pixel 7).
  underlying inspector-vs-View-menu geometry **routed to wave-3**
  — no wave-2 phase owns canvas-side UI for it.
- **`family-view-latency.test.ts` flaky at 50 ms budget under CPU
  contention** → closed in phase 0 (2026-05-23) with no code change.
  idle 10× re-run measured baseline 15-18 ms / 3-expand 13-15 ms /
  10-expand 20-22 ms, well under the 50 ms budget. contended-CPU
  sweep proposed in rev 1 was not attempted (auto-mode classifier
  correctly blocked spawning `yes` loops on the shared services
  host); cross-machine variance signal taken from rev 2's
  measurements (11.13 / 15.65 / 16.51 ms across 4 separate visual-
  fix-up phases on different runs). no `LATENCY_BUDGET_MS` change,
  no retry-once wrapper.
- RV-Phase-3b treeDiff round-trip WIP (wave-1 ship-gate blocker)
  → shipped in `aba7de0` (14 May 2026); always-on `tree.unions[]`
  + family-view N>2-partner renderer landed together. *closed via
  RV workstream; recorded here so wave-2 phase 4 sees the resolved
  blocker.* (gc candidate after phase 4 closes.)
- **visual-akarians baseline snapshot dir untracked** (rev 2,
  23 May 2026) → resolved during the visual fix-up plan's phase 0
  (`cf15ea7`, 14 May 2026). the source-of-change documentation
  trip the rev-1 gate asked for is closed by the layered-baseline
  header edit in phase 0 (2026-05-23, `6e4c80c` cited). *gc
  candidate at phase 1 close.*
