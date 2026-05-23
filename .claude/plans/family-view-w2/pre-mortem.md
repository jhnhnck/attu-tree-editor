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
## phase 4 pre-mortem — 2026-05-23

**bottom line:** proceed with revisions. the original wave-2 pre-
mortem (14 May 2026) flagged phase 4's biggest risk — terminology
overlap with `aba7de0`'s already-shipped *N-partner* polycule
renderer — and the plan's rev-1 renamed the phase to "secondary-
union expansion" to fix it. that rename held; the remaining risks
below are scope / geometry / state-management, all manageable. one
new revision: ship the rollback partner (2-expanded-unions-max) as
v1 and route 3+ expanded unions to a follow-up.

### symbol-overlap audit (preconditioned at phase start)

`aba7de0` (RV phase 3b, 14 May 2026) ships:
- `RankSlot.kind === "multi-union"` (`layout.ts:134`) — N>2 partners
  in ONE union (polycule), with `unionId` + `partnerIds: readonly PersonId[]`.
- `partnersInMultiUnionsOf(tree, personId)` (`couples.ts:114`) —
  returns partners from N>2-partner unions.
- `subset.ts:99` (`for (const pid of partnersInMultiUnionsOf(...))`)
  pulls polycule members into the focus rank.
- `layout.ts:planRank` filters `getUnions(tree).filter(u => u.partnerIds.length > 2)`
  for `multi-union` slots.

phase 4 introduces (no symbol re-use):
- `RankSlot.kind === "secondary-mate"` — a secondary partner card
  placed adjacent to the focus on the same rank, distinct from
  `couple` (paired 2-partner anchor) and `multi-union` (N>2 polycule
  partners). carries the secondary partner's `personId` + the
  `coupleIndex` of the secondary 2-partner union linking them to
  the focus. the focus card itself stays in its primary `couple`
  slot; the renderer reads both for the union-fan geometry.
- `expandedSecondaryUnionsOf(tree, personId, expandedSet)` — new
  helper. takes a per-person set of `coupleIndex`es marked as
  expanded; returns the partner ids and child ids reachable through
  those unions. mirrors `partnersInMultiUnionsOf`'s shape but
  scoped to 2-partner unions (the inverse partition).
- `useSecondaryUnionState(treeId, focusId)` — new state hook,
  parallel to `usePrimaryUnionState`, storage key
  `fte.family-view.secondary-union.v1:{treeId}:{focusId}`. shape:
  `{ byPerson: { [personId]: number[] } }` (sets of expanded
  coupleIndex). distinct from the expansion-set localStorage key
  (`fte.family-view.expansion.v1:...`) which gates `+/-`/badge
  children/parents reveals — totally different semantic.

no symbol collides. `multi-union` semantics ("N partners, one
union") and `secondary-mate` semantics ("one person, N unions")
stay terminologically and structurally separated.

### risks

- [high] geometry — the union-fan layout for 2 expanded secondary
  unions adds a third card at rank 0 (focus + primary partner +
  secondary partner). the bounded ≤30-card window cap currently
  treats partner-of-focus as ONE card; expanding a secondary union
  bumps it to TWO partner cards at rank 0 plus the secondary
  union's children at rank 1. risk: a focus with 2 expanded unions
  + full ancestor spine could exceed the 30-card cap, triggering
  auto-collapse on ancestor branches. **mitigation:** auto-collapse
  is already correct here — it'll demote the lowest-DOI ancestor
  block, which is the right answer. document this in the retro.

- [high] state-management — the `˅` picker semantics change. today
  the picker has alternates that *swap* the primary; phase 4 adds
  "show alongside" / "hide secondary" options. risk: users who
  used the picker for swapping get confused by the new options
  appearing alongside. **mitigation:** keep the swap action as
  the primary action (top of menu) and add an "also show {partner}"
  affordance as a separate menu item below. the action labels stay
  unambiguous.

- [medium] scope — the plan's DoD requires "visual goldens cover 3-
  union focus + half-sibling case". 3+ expanded unions is the
  rollback partner per the plan's rollback criterion ("if union-fan
  geometry produces unavoidable card overlaps at the bounded window
  for 3+ expanded unions, ship the phase as 2-expanded-unions-max").
  shipping with the rollback partner from the start (cap at 2
  expanded secondary unions, leave 3+ as `˅`-cycling) is more
  honest than ship-then-rollback. **mitigation:** in this phase,
  ship 2-max. the cap is enforced in `useSecondaryUnionState`'s
  setter (rejects expansion if already 2 are expanded). 3+ stays
  routed to a follow-up bug-log entry.

- [medium] terminology — "primary union" vs "secondary union" in
  the UI: the `˅` button's tooltip currently says "switch primary
  union for {partner} (session-only; doesn't change record)".
  adding "show alongside" requires the tooltip to expand. risk:
  tooltip text grows past readability. **mitigation:** rename the
  picker menu's affordances to action-words ("set as primary" /
  "show alongside" / "hide alongside") and rely on the visual
  state (presence of secondary card + bus) for context rather
  than tooltip prose.

- [medium] crossing-min interaction (B15 follow-up) — the plan's
  phase-2-plan-revise note flagged that secondary-union expansion
  is "exactly the configuration where multiple parent-couple slots
  appear at rank -1" and may finally let the barycentric pass
  matter. risk: the new `secondary-mate` slot kind isn't recognised
  by `crossingMinPass`'s `barycenterOfSlot` (which knows about
  `single` / `couple` / `multi-union` only). without an entry for
  the new kind, the pass treats it as having no anchors and falls
  through to "no incentive to move" → still no-op. **mitigation:**
  extend `barycenterOfSlot` + `slotPersons` to recognise
  `secondary-mate`, then re-run `crossings-baseline.test.ts` to
  measure if the pass activates. if still no-op, document and
  route to B15's escalation path.

- [medium] inspector / gedcom round-trip — the DoD says "inspector
  + gedcom round-trip unchanged". secondary-union expansion is
  purely a render-time UI state (lives in localStorage, doesn't
  mutate `CoupleRecord`); inspector reads the same domain data
  it always has, gedcom serializes the same. **mitigation:** no
  domain changes needed; integration check spot-checks the inspector
  open + close on a 2-expanded-union focus and runs the gedcom
  round-trip e2e to confirm parity.

- [low] B14 fold-in (phase-2 plan-revise note) — the plan said
  "B14 patch fits cleanly into phase 4's subset.ts work, fold in
  if incidental". the patch is 2-3 lines in `pickCollapseVictim`
  extending `protect` to skip already-picked sources. subset.ts
  edits in this phase touch the *subset* selector, not the
  *collapse-victim* picker — different function in the same file.
  **mitigation:** fold-in if the diff stays small; otherwise
  leave deferred. cheap call, no need to gate.

- [low] dependency — RV phase 3c (GEDCOM `_TREES_UNION`) was
  in-flight at plan time. **mitigation:** at phase 4 start (now),
  verify by reading the current `tree.ts` writers + the
  GEDCOM importer. if 3c shipped, phase 4 is unblocked; if not,
  phase 4 still doesn't depend on it (the new secondary-union
  state is render-time, never serialised to gedcom).

### walking-skeleton check

still applies from wave-2 start: family-view engine renders end-
to-end with selection, expansion, focus shift, path-highlight, and
crossing-min. phase 4 adds **rendering geometry** + **state**
parallel to existing geometry — the walking skeleton itself stays
unchanged (focus, primary partner, primary children render
identically when no secondary union is expanded; the new code paths
only activate via the new picker action).

### scope revisions adopted

- **ship 2-expanded-unions-max as v1 (rollback partner)**. 3+
  expanded unions stays as 1-at-a-time + `˅` cycling, routed to
  bugs.md as a follow-up. closes the wave-1 bug-log item "multi-
  union renderer commits to one-union-at-a-time" — the contract is
  "secondary unions render alongside when expanded", which is true
  for the 2-max case. 3+ is the bug only if user feedback says 2-
  max is insufficient.

- **defer the 3-union focus golden**. the plan's DoD asked for a
  3-union focus visual golden; with 2-max as v1 the relevant golden
  is the 2-union focus (one primary + one expanded secondary).
  ship that golden; 3-union is part of the 3+ follow-up.

- **fold-in B14 only if incidental**. the patch is small but
  touches a different function (`pickCollapseVictim`); skip unless
  the diff is incidental.

- **fold-in B6 follow-up only if incidental**. the visual-fix-up
  residual B6 (explicit sibling bus emits role: "blood" uniformly)
  also landed near subset.ts; same fold-in-if-incidental rule.

### definition-of-done

- secondary-union expansion ships as 2-max behind a
  `fte.layout.familyViewSecondaryUnion` flag default-on; flag-off
  restores `˅`-cycling-only behaviour.
- `useSecondaryUnionState` state hook + localStorage key live, with
  the 2-max cap enforced in the setter.
- `RankSlot.kind === "secondary-mate"` lands in `layout.ts`;
  `planRank` + `emitAnchorsAndEdges` + `materialiseLayout` handle
  the new kind without breaking the existing `couple` / `single` /
  `multi-union` paths.
- subset.ts pulls in secondary partners + their children when
  expanded.
- `˅` picker gains "show alongside" / "hide alongside" actions
  beside the existing swap action.
- 2-3 unit tests for the new state + slot kind.
- 1 e2e covering the 2-expanded flow + an inspector / gedcom
  round-trip spot-check.
- visual golden for 2-expanded-union focus (half-sibling rendering
  emerges naturally if both unions have children).
- crossings-baseline.test.ts re-run on the new fixture; document
  the delta in the retro (B15 follow-up).
- inspector + gedcom round-trip unchanged.

### rollback criterion (carried from plan)

if the secondary-mate slot kind produces unavoidable card overlaps
at the bounded window for the 2-expanded case (not just 3+), revert
the wiring + ship with the flag default-off; restore wave-1's
`˅`-cycling-only behaviour. the bounded ≤30-card window remains
the geometric backstop.
