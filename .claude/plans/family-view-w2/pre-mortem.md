# pre-mortem — family view wave 2 (14 May 2026)

**bottom line:** proceed with revisions. plan is structurally sound
(risk-first ordering claimed; spike gates on phases 2 + 3; per-phase
rollback criteria; phase 4 gets its own pre-mortem). but three premise
issues need fixing before phase 0 starts, and one phase-order revision
is worth considering.

context shift since plan was written: RV phase 3b shipped today in
commit `aba7de0` — `domain/tree.ts` always-on `unions: []`, plus
family-view's N>2-*partner* union renderer (bus-primitive connector,
`partnersInMultiUnionsOf`, `multi-union` rank slot). RV `couples.ts`
reader migration was *deliberately deferred* — current 2-partner paths
are bit-identical against `tree.couples` so the sweep was judged
no-gain. RV phase 3c (GEDCOM `_TREES_UNION` extension) is in-flight in
the working tree right now. this changes phase 4's dependency text but
not the plan's structure.

## risks

- [high] premise — "multi-union" is now overloaded: aba7de0 ships
  *N partners per union* (polycule, single anchor, bus connector);
  wave-2 phase 4 plans *N unions per person* (serial monogamy, focus
  in two distinct 2-partner unions, both rendered). both use the
  word "multi-union" + the same `RankSlot.kind` namespace + the same
  `subset.ts` entry point. high risk that phase 4 either accidentally
  re-uses aba7de0's `multi-union` slot kind for a different semantic
  shape, or duplicates `partnersInMultiUnionsOf` with a near-identical
  name. **probe:** before phase 4 starts, rename phase 4's concept
  in this plan (e.g. "co-resident unions" or "per-person union fan")
  and audit aba7de0's symbol names that overlap.

- [high] scope — phase 0 item "family-view zoom anchor + stable 100%"
  is not janitorial. "anchor zoom about the viewport center (or
  pointer position, consistently across wheel + pinch + widget-button
  paths)" + "define 100% as 'one standard card / label at its design
  size'" is a UX redesign of the zoom contract. user mental model of
  "100% = canvas-transform=1" changes. risk: lands silently inside a
  polish phase and surprises users; or balloons phase 0 from ~1 day
  to 2-3 when the design questions surface. **probe:** decide upfront
  whether stable-100% is in-scope for phase 0 or moves to its own
  phase 0b. if in-scope, write a one-paragraph design note in the
  plan before phase 0 starts (anchor mode = center vs pointer;
  whether the widget label changes; rollback path if users hate it).

- [medium] integration — phase 0 item "mobile inspector-overlay e2e
  flakiness" is framed as a test fix ("just teach the tests about
  [the overlay]"). but if the inspector overlay intercepts canvas
  clicks on Pixel 7 in tests, real Pixel 7 *users* also can't click
  the canvas through the overlay. the plan explicitly says "don't
  change the inspector behaviour" — that's a deferral of a possible
  UX bug, not a fix. **probe:** before applying the test workaround,
  reproduce manually on a Pixel 7 emulator and confirm the overlay
  is intentional UX (dismissible by tap-elsewhere?) vs an unintended
  click-blocker. if the latter, file a bug-log entry routed to a
  later phase.

- [medium] premise — phase 0 "delete
  `tests/spikes/layered-metrics.spike.test.ts`" removes the
  *generator* for `notes/profiles/layered-baseline.md` and
  `layered-metrics.json`. after deletion, those files become
  un-regeneratable snapshots — any future layered-engine work that
  shifts ghost-count or crossings has no automated baseline-update
  path. (the working tree right now already shows those files
  modified; ghosts 167→129, crossings 2852→1934, no spike test to
  explain it.) **probe:** before deletion, decide whether the
  layered metrics file is still load-bearing for future layered
  work. if yes, fix the unused-locals warning instead. if no, delete
  the metrics + baseline files too in the same commit, not just the
  generator.

- [medium] premise — phase 0 "commit
  `visual-akarians.spec.ts-snapshots/`" includes
  `akarians-layered-chromium-linux.png` (the only file in the
  untracked dir). that's the *layered* engine's akarians render, not
  family-view. and the layered metrics in `notes/profiles/` just
  shifted in the working tree (167 → 129 ghosts), meaning the layered
  output *changed* recently. committing the snapshot now bakes in
  whatever caused that change without explaining it. **probe:**
  before commit, `git log --diff-filter=M apps/web/src/lib/layout/`
  to find the layered change that moved the metrics, document it in
  the phase 0 commit message, and confirm the snapshot diffs against
  CI before commit (not after).

- [medium] premise — phase 3 references the "four-pass IR contract
  (see `tree-layout-ir` skill if it exists)" and says the crossing-min
  pass goes "between `passes/order.ts` and `passes/place.ts`". those
  files are the *layered* engine's pipeline; family-view has its own
  engine module at `engines/family-view/` with its own pipeline that
  does *not* share files with `passes/`. risk: phase 3 starts and
  burns 0.5 day before discovering the IR contract doesn't apply
  here. **probe:** before phase 3 pre-spike, read
  `engines/family-view/layout.ts` end-to-end and identify the
  *actual* hook point for an ordering pass in family-view's
  pipeline. update the plan with the correct file path.

- [medium] scope — phase 3 budget "75 ms for 3-expand on akarians"
  reuses the phase-0-loosened budget. but phase 0 loosened the budget
  to absorb CPU-contention *flake*, not to give a new pass room to
  spend. treating it as engineering headroom for a layout pass eats
  the flake-absorption pad. **probe:** measure pre-pass and post-pass
  expand times on an idle machine. if pre-pass is at 12-22 ms (the
  phase-6 retro number) and post-pass moves to 50-65 ms, that's
  fine — flake budget remains. if post-pass is at 70-75 ms idle, the
  pass is too expensive and rollback fires.

- [low] expertise — phase 2 picks among FLIP, view-transitions, and
  motion libraries without flagging that all three interact with
  svelte 5 runes differently. FLIP measures-then-animates which
  fights `$effect` ordering; view-transitions don't compose with
  svelte's diff strategy; motion libraries add bundle cost and run
  outside the reactive cycle. **probe:** spike on the *simplest*
  transition (collapse-to-badge) first, not all three. if it doesn't
  compose with the path-highlight overlay's `data-on-path` swap, the
  approach is wrong regardless of fps.

- [low] operational — phase 0 has 8 disparate items in "~1 day". no
  single integration check verifies all 8 land cleanly together;
  each item lands or doesn't independently. real risk: phase 0
  slips silently to 1.5-2 days while individual items get polished.
  **probe:** add a phase-0 done-checklist with the 8 items literally
  enumerated; close phase 0 only when all 8 boxes tick.

- [low] dependency — phase 4 says "RV phase 3b must land first"
  (now done) and implies a full reader migration is part of 3b.
  reality (per RV plan, line 2397): reader migration of
  `couples.ts` is *deliberately deferred*; 2-partner paths against
  `tree.couples` are bit-identical. phase 4 wording should be
  relaxed from "every layout/inspector/serializer consumer has
  migrated to `getUnions(tree)`" to "RV phase 3b shipped; consumers
  read either `tree.couples` or `getUnions(tree)`; phase 4 only
  needs to add new `getUnions`-based code paths for the >1-union-
  per-person case." **probe:** at phase 4 start, re-read the RV
  plan's 3b retro (line 2379) and update phase 4's dependency text
  with what 3b actually shipped vs what was deferred.

## walking-skeleton check

n/a for a continuation plan. wave-1 already shipped a complete vertical
slice (`family-view` engine end-to-end through the UI). phase 0 is
correctly framed as signal-tightening, not skeleton work.

## phase-order revisions

| original | proposed | reason |
|---|---|---|
| 0 → 1 → 2 → 3 → 4 | 0 → 1 → **3** → **2** → 4 | within the unblocked set (phases 0-3), phase 3 (crossing-min) is the scariest because layout regressions cascade into every visual golden — the plan explicitly says this in the "what wave 2 picks up" section. phase 2 (animation) is local to the diff path. risk-first ordering puts the scariest viable phase next, so 3 should come before 2. the plan's stated reason for 2-before-3 is implicit (animation is "more visible UX upgrade"?) and isn't articulated. if dependency-first is the actual intent (phase 1's mask helper makes phase 3's golden re-baselining cleaner), state that explicitly in the plan and keep the existing order. |

## definition-of-done additions

- **phase 0** — add: after the 10-run `pnpm verify` green check, run
  one full cycle on a second machine (CI green check or another local
  machine if CI not configured) to confirm CPU-contention is the only
  flake source. machine-specific flake would invalidate the loosened
  budget.

- **phase 0** — add: rollback gate on the akarians snapshot commit. if
  the committed `akarians-layered-chromium-linux.png` diffs against CI
  output on first run, revert the commit and re-baseline from CI
  output, not from the local dev machine.

- **phase 0** — add: integration check — after all 8 items land,
  manually open family-view on the Akarians fixture, scroll through
  the bounded window, expand-collapse a branch, and confirm nothing
  visible regressed. wave-1 retro caught two latent bugs at the phase
  retro step; phase 0's 8-item sweep is the most likely place for an
  inadvertent regression.

- **phase 1** — add: run the new `maskUnstableUI` helper against one
  in-flight golden (e.g. the dense-tree fixture from phase 1's other
  work item), not only the four wave-1 goldens. helper that works on
  wave-1 surface but fails on novel surface is a brittle helper.

- **phase 2** — add: spike outcome gate — load the chosen approach on
  a Pixel 7 emulator before committing to the ship sub-phase. mobile
  is where smoothness regressions appear first; spike validation on
  desktop chromium only is insufficient.

- **phase 3** — add: pre-spike outcome — count actual edge crossings
  on the akarians fixture at default-scope bounded window before
  deciding "defer vs implement". the plan estimates "zero or one";
  measure rather than estimate. document the count in the phase 3
  retro.

- **phase 3** — add: integration check — after the crossing-min pass
  lands, re-baseline *all* family-view visual goldens (not just
  akarians) and document what shifted per golden in the phase 3
  retro. layout passes can have surprising downstream effects on
  small fixtures where greedy L-R was incidentally producing the
  "right" order.

- **phase 4** — add (already planned, restating for completeness):
  run `pre-mortem` skill on phase 4 at phase start. additionally
  flagged here: read aba7de0's commit body before the pre-mortem
  to absorb the polycule-renderer pattern, and disambiguate
  "multi-union" terminology in this plan before the pre-mortem runs.

---

*note on plan-shape:* this pre-mortem references phase numbers 2 + 3
in two different orientations because rev 1 of plan.md folded the
phase-order revision (2 ↔ 3 swap) into the body. in the original plan
as pre-mortem'd, "phase 2" was smooth-diff and "phase 3" was crossing-
min; the revisions table above proposed swapping them, which rev 1
accepted. several risk / DoD items above use the pre-rev-1 numbering
because they describe what was reviewed; the plan body itself uses
the post-rev-1 numbering. when reading: phase-2-in-this-doc usually
means crossing-min (the layout-quality phase) post-rev-1, and
phase-3-in-this-doc usually means smooth-diff (the animation phase)
post-rev-1.
