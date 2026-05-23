# family view — wave 2

## context

successor plan to the wave-1 family-view rollout (retired plan; see
git history for `notes/plans/family-view.md`). picks up the trailing
work that the wave-1 ship-gate (2026-05-14) deferred or surfaced, plus
the multi-union scope expansion that wave-1 explicitly scoped to N=2.

wave-1 shipped the family-view engine as default on 2026-05-14 (commit
`20966f1`): new engine at `apps/web/src/lib/layout/engines/family-view/`
registered alongside `layered` and `hyperbolic`; bounded ≤30-card
window centred on focus (focus + parents + grandparents + great-
grandparents + children + grandchildren + siblings at each ancestor
rank); inline expand/collapse via `+`/`−` affordances with DOI-ranked
auto-collapse above 50 cards; union-as-anchor primary union with `˅`
picker for N=2 multi-union choice; selection→focus path highlight
overlay (bfs over consanguinity + spouse edges); canvas-side `+ person`
affordance with add-parent / add-partner / add-child menu;
decorator-driven `cardDecorator.decorate(person, ctx)` (zero
`gender ===` branches in PersonNode); four-corner + two-edge
affordance slot reservation (`notes/agents.md` entries 15 + 16);
cross-engine continuity for selection / focus / edits; visual
goldens at Akarians DEMO + a 5-generation linear fixture.

between ship-gate and wave-2 start, the parallel visual-fix-up plan
shipped 2026-05-22 at trunk `5e37307` (tracker:
[`notes/plans/family-view-visual-fixup.md`](../../../notes/plans/family-view-visual-fixup.md);
driver: `~/.claude/plans/wise-skipping-meerkat.md`) closing 10 cosmetic
/ rendering issues across 6 phases. wave-2 inherits the surface
contracts that landed there: two-line names no longer clip; null-
`dateRange` cards center the name + avatar block; deterministic
`cardHeight(person)` heuristic with **cumulative rank-y** spacing
(`max(CARD_H, maxHByRank[r]) + RANK_GUTTER`); couple-bus terminates
flush at `CARD_VISIBLE_INSET_U = 3 / 80` matching the 3 px
selection-ring inset; sibling bus is now an **explicit horizontal
segment** with `stem:union:…` / `bus:union:…` / `stub:union:…|kid`
edge ids (not the legacy `drop:union:…` shape); SVG path coordinates
round to integer pixels via `Math.round`; selection ring corner
radius matches card outer radius (border-radius bumped to 0.5rem);
generation-badge toggle in View menu (default OFF, persisted via
`fte.overlays.generationBadge`); silhouette placeholder removed
(no-portrait cards render name + date only; `.is-portrait-pending`
neutral background during blob resolve); debug-pill Bug icon at
`text-fg` parity. layout invariants for phase 2 (crossing-min) +
phase 4 (secondary-union expansion) inlined into those phases below.

reads alongside [`notes/agents.md`](../../../notes/agents.md) and the
now-retired RV workstream (`relationship-vocabulary.md`; see git
history). its shipped contracts (parents, unions, identity) remain in
`domain/schema.ts` and `domain/tree.ts`. RV-3b shipped in `aba7de0`
(N>2-partner polycule renderer with bus-primitive connector,
`partnersInMultiUnionsOf`, `multi-union` `RankSlot.kind`, always-on
`tree.unions[]`); RV-3c (GEDCOM `_TREES_UNION` extension) is in-flight
at plan time; re-confirm at phase 4 start.

phase order is **risk-first**, not dependency-first. within the
unblocked set (phases 0-3), crossing-minimisation comes before
smooth-diff animation because layout regressions cascade into every
visual golden, while animation regressions stay local to the diff
path. plan rev 1 swapped these from the original 2-before-3 order.
the secondary-union expansion (phase 4) is the scariest item by far
but lands last because it also needs phases 0-1's signal-tightening
to ship cleanly.

## goals

- close the wave-1 ship-gate residue via phase 0's 8-item stability
  sweep (all 8 done-checklist items tick).
- raise e2e + visual-golden signal floor via phase 1 (dense-collapse
  fixture exercises auto-collapse end-to-end; 4+ goldens migrated
  to shared mask helper with zero or smaller diffs).
- add measured crossing-minimisation to family-view layout iff
  pre-spike count is non-zero (phase 2).
- ship smooth-diff animation iff spike achieves ≥55 fps on the
  akarians fixture and on Pixel 7 emulator with no path-highlight
  overlay flicker (phase 3).
- expand secondary-union rendering from one-at-a-time (`˅` picker)
  to N-side-by-side (phase 4); rollback partner is 2-expanded-unions-
  max if union-fan geometry overflows the bounded window.

## non-goals

- lifting the bounded ≤30-card window cap (deferred to wave-3 or
  later; crossing-min phase 2 explicitly punts this with a written
  defer note if zero crossings observed in pre-spike).
- re-running the visual fix-up plan (shipped 2026-05-22 at trunk
  `5e37307`; wave-2 inherits its surface contracts and does not
  re-litigate them).
- migrating `couples.ts` reader to `getUnions(tree)` (RV-plan
  deliberately deferred this; 2-partner paths are bit-identical
  against `tree.couples`. phase 4 only adds new `getUnions`-based
  code paths for the >1-union-per-person case).
- combined polycule × multi-union rendering (phase 4 handles N
  unions per person; a person in an N>2-partner polycule who is
  also in a separate 2-partner union is wave-3 territory).
- editing workflows beyond add-relative (no conflict resolution,
  no bulk operations, no undo/redo for tree edits at scale; wave-1
  + visual fix-up already shipped what's in scope).
- server-side persistence of `emitFinding` or the
  `multi-parent-unsupported` finding (owned by RV workstream).

## constraints

- RV phase 3c (GEDCOM `_TREES_UNION` extension) is in-flight at plan
  time; phase 4's gedcom round-trip contract belongs to 3c, not this
  plan. phase 4 work itself does not block on 3c, but re-confirm 3c
  status at phase 4 start.
- svelte 5 runes interact unevenly with FLIP / view-transitions /
  motion libs (FLIP's measure-then-animate fights `$effect` ordering;
  view-transitions don't compose with svelte's per-component diff
  strategy; motion libraries add bundle cost and run outside the
  reactive cycle). phase 3 spike-gates on this.
- bounded ≤30-card window is the rollback partner for phase 4 (if
  union-fan geometry produces unavoidable card overlaps for 3+
  expanded unions, ship as 2-expanded-unions-max and leave 3+ as
  1-at-a-time + `˅` cycling).
- mobile target is Pixel 7 emulator; smoothness regressions appear
  there first (phase 3's spike validation cannot be desktop-chromium
  only).
- pre-mortem already run on this plan (14 May 2026, see `pre-mortem.md`)
  and folded into rev 1; phase 4 gets its own pre-mortem at phase
  start (it has the most open design questions of any phase).

## accepted risks

pre-mortem (14 May 2026) flagged three premise issues mitigated via
rev-1 revisions rather than blocking proceed:

1. **"multi-union" symbol overlap** between this plan's phase 4
   (N unions per person, serial monogamy) and `aba7de0`'s already-
   shipped polycule renderer (N partners per union); both use the
   same `RankSlot.kind` namespace and `subset.ts` entry point.
   mitigated by terminology rename to "secondary-union expansion"
   and a phase-4-precondition symbol-overlap audit with `aba7de0`.

2. **zoom-100% UX-contract change inside phase 0's janitorial bundle**
   — anchoring zoom about viewport-center and redefining 100% from
   "canvas-transform=1" to "one card at design size" is a redesign,
   not polish; users may rely on the old mental model. mitigated
   by a design-note gate that splits the item to phase 0b if the
   gate paragraph takes >30 min to write.

3. **phase-2's perf budget reuses phase-0's flake-absorption pad**
   as engineering headroom; the loosened 75 ms budget was meant to
   absorb CPU-contention flake, not to give a new layout pass room
   to spend. mitigated by idle-machine pre/post-pass measurement
   against the phase-6 idle baseline (12-22 ms), not the loosened
   pad.

five more medium / low risks documented in `pre-mortem.md` with
per-phase probes (mobile inspector-overlay UX bug vs test fix;
layered-metrics spike-test orphaning; layered snapshot source-of-
change gate; family-view pipeline distinct from `passes/`; svelte 5
× animation library composition; phase 0 8-item dilution; RV
reader-migration scope clarification). proceed-with-revisions
verdict. rev 2 (23 May 2026) folded the visual fix-up plan's
residual debt and closed two phase-0 items that the visual fix-up
resolved (see `log.md`).

---

## phase 0 — stability + janitorial sweep
**status:** closed 2026-05-23 (7 of 8 DoD items landed; zoom-100% split to phase 0b per design-note gate; worktree `.claude/worktrees/family-view-w2/` and branch `phase/family-view-w2/0` retained per user instruction — *not* merged into parent. integration check: chromium 14/14, mobile 8/8, 3 skips, 0 regressions.)
**definition of done:** all 8 items in the phase-0 done-checklist tick
(latency budget, mobile e2e, agents.md updates, no untracked files,
theme tokens, zoom 100% contract, spike-test resolution, akarians
snapshot); post-sweep integration check on akarians fixture surfaces
no visible regressions.
**scope:** wave-1 ship-gate residue — small items that individually
look like polish but together gate CI signal + reviewer confidence.
retires the unknown "is our test signal trustworthy enough to drive
phase 2-4 layout / animation / scope work safely?" walking-skeleton
check is n/a here (continuation plan; wave-1 already shipped a
complete vertical slice).

estimated effort: ~1 day.

### work

- **family-view latency test budget loosen + retry-once.** wave-1
  shipped with the test at the 50 ms threshold; 1/3 fail rate under CPU
  contention observed at ship-gate (3-expand at 58 ms, idle runs at
  12–22 ms). raise the budget to 75 ms and wrap the measurement in a
  retry-once-then-fail helper. the phase-6 retro recorded the real perf
  headroom as `<100 ms` for a 100-person expansion, so 75 ms is still a
  meaningful guard.
- **mobile inspector-overlay e2e flakiness.** 3 tests on Pixel 7 fail
  identically because the inspector overlay intercepts canvas clicks.
  **manual-repro gate (rev 1):** before the test workaround lands,
  open the failing flow on a Pixel 7 emulator (or actual device) and
  confirm whether the overlay is intentional UX (dismissible by tap-
  elsewhere or a close affordance) or an unintended click-blocker
  for real users. if the latter, file a bug-log entry routed to a
  follow-up phase and *do not* apply the test workaround — the test
  is correctly catching a real UX bug. if the former, proceed with
  mobile-viewport guards (skip-on-mobile + a separate mobile-only
  spec with smaller clip targets, or a `page.locator` route that
  dismisses the overlay before each canvas interaction). chromium
  stays clean either way.
- **on-path stroke + ring theme tokens.** `stroke-[2.5]` and
  `ring-accent/70` are raw tailwind today. introduce `--fte-on-path-
  stroke-width` and `--fte-on-path-ring-color` semantic tokens in the
  tailwind v4 theme layer; replace the two usages. token names follow
  the existing `notes/agents.md` convention.
- **family-view zoom anchor + stable 100%** (UX-contract change, not
  pure polish — flagged by rev 1 pre-mortem). zoom origin isn't the
  viewport center (zooming in / out drifts the focal point) and the
  "100%" label on the zoom widget tracks the raw canvas transform
  rather than a logical scale, so the same "100%" renders cards at
  wildly different on-screen sizes across displays. anchor zoom about
  the viewport center (or pointer position, consistently across
  wheel + pinch + widget-button paths); define 100% as "one standard
  card / label at its design size" and derive the displayed % from
  that ratio. **design-note gate:** before implementation begins,
  write one paragraph in this plan answering (a) anchor mode —
  viewport center vs pointer; (b) whether the widget label glyph
  changes alongside the semantic change; (c) rollback path if users
  rely on the old 100% = canvas-transform=1 mental model (revert flag
  vs keep old behaviour as a power-user toggle). if the design-note
  takes more than 30 minutes to write, this item splits into its own
  phase 0b and phase 0 closes without it. carry-over from wave-1's
  bug log; medium priority, low effort *only if* the design-note gate
  closes cleanly.
  **phase 0 (2026-05-23) — design-note gate tripped; split to phase
  0b.** partial sketch of the three questions:
  *(a) anchor mode.* the wheel + pinch paths in
  `FamilyViewCanvas.svelte:373-389` are already cursor-anchored (the
  standard `panX = px - (px - panX) * ratio` formula), and so is
  `TreeCanvas.svelte` (layered/hyperbolic share the canvas-controller
  surface). the drift is only in the widget +/- buttons + slider +
  exact-percent entry, which call `setScale(next)` on the controller
  (FamilyViewCanvas.svelte:418-419) without re-anchoring. fix:
  reshape `setScale` to take an optional anchor argument and default
  to viewport-center; the widget callers pass no anchor (so they get
  viewport-center) while wheel keeps its pointer anchor. proposed
  controller-surface change is small but cross-engine (layered +
  hyperbolic controllers expose the same `setScale`), so it crosses
  engine boundaries cleanly and needs a per-engine smoke check.
  *(b) widget label.* the displayed `Math.round(scale * 100)%` reads
  the raw transform today. moving to a "one card at design size"
  semantic means defining the design size in CSS pixels (`CARD_W_PX
  = PERSON_W × UNIT = 320 px`) and rendering the % as the ratio of
  on-screen card width to design width. for a 1× DPR display this is
  identical to today; for a 2× DPR display (retina), the user sees
  the same visual size at the same %, which is the whole point. but
  the change is invisible to most users (DPR ratios are sticky
  per-monitor); whether to update the glyph alongside the semantic
  is a UX-research question. preference: ship the semantic, leave
  the label glyph unchanged (still `%`), with the slider markings
  reading `25 / 50 / 100 / 200 / 400` like today. revisit if a user
  reports the % feels wrong.
  *(c) rollback path.* if users do rely on the 100% = transform=1
  mental model, the cleanest fallback is a `fte.zoom.semantic100`
  localStorage flag, default-true; flipping to false restores the
  raw-transform interpretation. cost is +1 flag in a settings panel
  that already has 8+ flags; benefit is users who built workflows on
  the old definition can keep them. preference: ship with the flag.
  **why this split:** (b) and (c) both need UX/research input that's
  outside a janitorial phase's mandate. (a) is implementable today
  but lands cleaner alongside the semantic change. ship phase 0b
  as a single landed PR with all three answered after research; it's
  ~0.5-1 day of focused work, not 30 min of polish.
- **˅ aria-label lesson captured in `notes/agents.md`.** phase 2
  rephrased "view-time" → "session-only" to avoid colliding with the
  existing `getByRole("button", { name: "View" })` selector. add a
  one-paragraph entry under the existing test-selector section: "ARIA
  names matter for tests too — substring collisions break selectors
  silently. avoid generic verbs (view, edit, share) in user-facing
  aria-labels."
- **vite-preview e2e workflow doc.** the playwright webserver serves
  `dist/`, not source, so `pnpm build` must run first. either chain it
  into the webserver invocation in `playwright.config.ts` or add a
  one-paragraph "running e2e against preview" entry to
  `notes/agents.md` testing section. preference: chain it (less
  documentation drift).
- **`tests/spikes/layered-metrics.spike.test.ts` deleted — *or* fixed
  in place (rev 1 decision).** wave-1's bug-log entry described it as
  untracked; it was actually committed in `aefdb1b` and modified in
  `50f258c`. the file is the *generator* for
  `notes/profiles/layered-baseline.md` + `layered-metrics.json`;
  deleting it orphans those snapshots (no regeneration path for
  future layered-engine work). rev 1 pre-mortem requires a decision
  before the `git rm`: (a) **keep + fix** the unused-locals warning
  (preferred if the layered metrics are still load-bearing for
  future layered engine work); (b) **delete the generator *and* the
  two snapshot files together** in one commit, since stale snapshots
  with no regen path are worse than no snapshots at all. record the
  choice + reasoning in the phase 0 commit message.
- **~~`visual-akarians.spec.ts-snapshots/` untracked dir~~** (rev 2:
  resolved by the visual fix-up plan's phase 0 in `cf15ea7`; the dir
  is tracked and re-baselined across the fix-up plan's 6 phases. the
  rev-1 pre-commit gate is moot now — the snapshot commit landed and
  was retroactively absorbed into 6 phases of family-view changes.
  **what's still worth doing in phase 0:** run
  `git log --diff-filter=M apps/web/src/lib/layout/ -- "*.ts"` and
  identify the layered change that moved the ghosts 167 → 129 /
  crossings 2852 → 1934 metric. it's no longer rollback-gate
  material, but documenting the source-of-change in the phase 0
  commit message is still cheap signal hygiene.)

### definition of done

8-item phase-0 done-checklist (rev 1 added explicit enumeration to
prevent silent slippage past ~1 day):

- [ ] **latency budget** — `pnpm verify` green 10 runs in a row on
  the local machine, *and* one green CI run (or one green run on a
  second local machine) to confirm CPU-contention is the only flake
  source — not machine-specific.
- [ ] **mobile e2e** — Pixel 7 + Pixel 7 mobile-safari either green
  or explicitly `test.skip()` with one-line reasons. manual-repro
  gate closed: overlay behaviour confirmed intentional OR a real-UX-
  bug entry filed in the bug log.
- [ ] **agents.md updates** — aria-label lesson recorded; (if
  chosen) e2e-against-preview note recorded.
- [ ] **no untracked files** under `apps/web/tests/` or
  `tests/spikes/` after phase 0.
- [ ] **theme tokens** — two raw-tailwind on-path usages swapped to
  `--fte-on-path-stroke-width` + `--fte-on-path-ring-color`; visual
  goldens identical or strictly tighter after the swap.
- [ ] **zoom 100% contract** — design-note gate closed (in this
  plan); zoom no longer drifts at a fixed canvas position; "100%"
  reads identically across two viewport sizes (manual check + unit
  test that displayed % derives from the design-size ratio); OR
  the item is split into phase 0b and phase 0 closes without it.
- [ ] **spike-test resolution** — choice (a) keep+fix or (b) delete-
  generator-plus-snapshots applied; phase 0 commit message records
  the choice.
- [x] ~~**akarians snapshot** — `visual-akarians.spec.ts-snapshots/`
  committed only after the source-of-change for layered metrics is
  documented and the snapshot passes CI on first run; rollback gate
  honoured if CI disagrees.~~ (rev 2: closed via the visual fix-up
  plan's phase 0 in `cf15ea7`. the source-of-change documentation
  trip is still worth taking — see phase 0 work item.)

post-sweep integration check (rev 1 added): manually open family-view
on the akarians fixture, scroll through the bounded window, expand-
collapse a branch, confirm nothing visible regressed. wave-1 retro
caught two latent bugs at this step; phase 0's 8-item sweep is the
most likely place for an inadvertent regression.

### rollback criterion

- if the retry-once wrapper masks a real perf regression elsewhere
  (e.g. a future phase's expand-collapse rewrite slows real-world
  expansion to 70 ms), revert to the strict 50 ms budget on `main`
  and gate the regressing phase on a perf-CI run.

---

## phase 0b — zoom 100% contract (split from phase 0)
**status:** open
**definition of done:** zoom widget `+` / `−` / slider / exact-percent
paths anchor on viewport-center by default (wheel + pinch keep their
pointer anchor); 100% reads as "one standard card at design size"
derived from `CARD_W_PX = PERSON_W × UNIT`; `fte.zoom.semantic100`
localStorage flag (default true) toggles back to canvas-transform=1
semantic; manual smoke on layered + family-view + hyperbolic engines
confirms the controller-surface change doesn't regress per-engine
zoom; unit test asserts displayed % == measured-card-width /
design-card-width.
**scope:** the zoom item that tripped phase 0's design-note gate
(`plan.md` phase 0 work-item; 30 min sketch in place but (b) widget-
label glyph and (c) rollback path needed UX/research input outside
a janitorial mandate). split here as its own phase so phase 0 closes
clean and phase 0b can land the semantic + the anchor fix in one PR.
distinct from phase 1's e2e-signal-tightening; both can run in
parallel if needed.

estimated effort: ~0.5-1 day.

### work

- reshape `CanvasController.setScale` (FamilyViewCanvas.svelte:418,
  TreeCanvas.svelte:603, HyperbolicCanvas's equivalent) to accept an
  optional `{ anchorPx?: {x, y} }` argument; default behaviour pans
  to keep the viewport center fixed at the new scale. widget +/- /
  slider / exact-percent paths call with no anchor argument (=>
  viewport center). wheel keeps its pointer anchor.
- introduce `--fte-design-card-width: 320px` token in `app.css` so
  the semantic-100% calculator has a single source for design size.
- compute displayed `%` in ZoomWidget as `Math.round(measured /
  design × 100)`. measured = the rendered card's `getBoundingClientRect`
  width on a sample non-portrait card; design = the token value. on
  1× DPR this is identical to today.
- add `fte.zoom.semantic100` localStorage flag (default true);
  flipping false restores the raw-transform interpretation. settings
  panel gets an unobtrusive "use semantic 100%" checkbox under the
  existing zoom section.
- visual goldens are likely unaffected (no card-on-screen-size
  change at 1× DPR), but re-baseline if any pixel shift exceeds
  `maxDiffPixels` on a fresh run.

### definition of done

- widget paths (+/-, slider, exact-percent entry) no longer drift
  the focal point at fixed canvas position; manual repro on the
  akarians fixture at viewport center, top-left, bottom-right.
- displayed % derived from card-width ratio (unit test).
- flag exists default-on; flag-off restores canvas-transform=1.
- B5 zoom-matrix verification (`bugs.md`) runs at 0.5× / 2.0× and
  the result is recorded — apply `shape-rendering: crispEdges`
  fallback iff the half-pixel grid issue reappears at non-1 scales.

### rollback criterion

- if the semantic 100% confuses more users than it helps (>1
  user-reported "why does my zoom feel wrong now" within a release
  cycle), flip the flag default to false and ship the semantic as
  opt-in. controller-surface change for the anchor fix stays as-is
  (no user-visible regression, fixes the actual drift bug).

---

## phase 1 — denser e2e coverage + visual-golden mask helper
**status:** closed 2026-05-23 (all 4 work-items + 2 routed items landed; B14 finding deferred; B12 deferred; B13 closed via golden regeneration. worktree `.claude/worktrees/family-view-w2/` and branch `phase/family-view-w2/1` retained per user instruction — *not* merged into parent. integration check: chromium 27/28, mobile 17/28 with 11 skips, 0 regressions.)
**definition of done:** dense-tree fixture exercises auto-collapse
end-to-end in `pnpm test:e2e`; 4+ wave-1 visual goldens migrated to
`maskUnstableUI` helper with zero-or-smaller diffs; helper also
exercises the novel dense-tree golden surface (rev-1 brittleness
check).
**scope:** close two known coverage gaps surfaced by wave-1's bug log
(collapse-badge e2e never exercised; visual goldens use ad-hoc
rect-masks). retires the unknown "is the auto-collapse path actually
covered, or do we just believe it is?"

estimated effort: ~1 day.

### work

- **denser collapse-badge fixture.** the wave-1 bug log notes "default
  bounded subset never exceeds the 50-card auto-collapse threshold via
  manual `+` clicks alone." add `apps/web/tests/fixtures/dense-tree.svg`
  (or `.familyscript`) generated to put >50 cards in the bounded window
  around its root. wire an e2e at `apps/web/tests/e2e/collapse-badge-
  end-to-end.spec.ts` that loads the fixture, expands until auto-
  collapse engages, asserts the collapse badge renders + accents on-
  path + survives an engine switch.
- **shared visual-golden mask helper.** every visual golden today does
  its own ad-hoc rect-masking (timestamps, focus halo animations, the
  test-only debug overlay). extract a `maskUnstableUI(page, opts?)`
  helper into `apps/web/tests/e2e/_helpers/visual-mask.ts` that masks
  the known-unstable regions and exposes a typed options object for
  golden-specific overrides. migrate the four wave-1 family-view
  goldens (`family-view-default.png`, `multi-union-family-view.png`,
  `path-highlight-multi-union.png`, `add-relative-menu-open.png`) +
  the cross-engine continuity snapshot. visual diffs should be
  identical or strictly smaller after migration.
- **(phase 0 plan-revise, 2026-05-23) audit region-bounds
  determinism for `visual-path-highlight.spec.ts` (B13).** phase 0
  found the captured region growing 920×806 → 920×1241 on a fresh
  worktree without any source change in scope. either tighten the
  golden-region selector so the captured bbox is content-bounded
  (not flex-1-driven), or pin the viewport explicitly per spec,
  or mask the variable-height region. fold the resolution into the
  `maskUnstableUI` helper work — the helper exists precisely to
  absorb this kind of environment-specific instability without
  re-baselining.
- **(phase 0 plan-revise, 2026-05-23) `.is-portrait-pending`
  background transition (B12).** phase 0 did not touch PersonNode
  portrait-slot rules; the tiny CSS guard fits naturally here when
  PersonNode is exercised by the dense-tree fixture work. add
  `transition: background-image 80ms ease-out` to the
  `.is-portrait-pending` rule iff the fixture work surfaces the
  snap.

### definition of done

- `pnpm test:e2e` exercises the auto-collapse path end-to-end against
  the dense fixture.
- four+ existing goldens migrated to `maskUnstableUI`; diffs are zero
  or smaller in `--update-snapshots` dry-run.
- new fixture committed at a stable, deterministic id (re-running the
  generator produces byte-identical svg / familyscript).
- **(rev 1)** run the new `maskUnstableUI` helper against the new
  dense-tree golden too — *not only* the four wave-1 goldens. helper
  that works on wave-1 surface but trips up on novel surface is a
  brittle helper, and the dense-tree fixture is the first novel
  surface we have.

### rollback criterion

- if the mask helper materially raises the false-negative rate (real
  visual regressions slip past the broader mask), revert to per-golden
  ad-hoc masks; the helper survives only if it tightens, not loosens,
  coverage.

---

## phase 2 — crossing-minimisation in family-view layout
**status:** open
**definition of done:** pre-spike outcome recorded with **measured**
crossing counts; if "defer", phase closes with a one-line retro +
follow-up bug-log entry; if implemented, `pnpm verify` green, all
family-view visual goldens (not just akarians) re-baselined with
per-golden notes in retro, 4+ unit cases pass, flag default applied,
idle-machine pre/post-pass perf measured against the phase-6 baseline
(not the phase-0 flake pad).
**scope:** the most architecturally interesting open layout item.
greedy left-to-right per rank is wave-1's current behaviour, plausibly
zero observed crossings at the ≤30-card bounded window today. retires
the unknown "do we have observable crossings worth fixing, and if so
does a barycentric pass land cheaply enough to be default-on?"

(rev 1: was phase 3. promoted ahead of smooth-diff animation because
layout regressions cascade into every visual golden, while animation
regressions stay local to the diff path — risk-first within the
unblocked set.)

estimated effort: ~2-3 days.

### pre-spike (first 0.5 day)

- **(rev 1) measure, don't estimate.** count actual edge crossings on
  the akarians fixture at default-scope bounded window and at a
  couple of off-default foci (a dense family near the middle of the
  pedigree; a sparse leaf branch). document the counts in the phase
  2 retro. the original plan estimated "zero or one"; replace the
  estimate with measurement before the defer-vs-implement decision.
- if zero across the sampled foci, defer phase 2 entirely with a
  written note ("crossing-min has no observed regressions to fix;
  revisit when the bounded-window cap is lifted").
- if non-zero, pick the heuristic: barycentric (sum-of-parent-x ÷
  count, iterate to fixpoint) is the standard. median is the other
  option. record the choice + reasoning.
- **(phase 0 plan-revise, 2026-05-23) introduce
  `tests/_helpers/family-view.ts` `pickLeftRight(layout, ids)`
  (B11) BEFORE the first crossing-min unit assertion.** the helper
  is ~10 lines and the new pass needs to assert "leftmost-at-rank-N
  is X"; without the helper, `orientCouple`'s lex-order swap will
  bite the third test in a row (visual fix-up phases 2 + 3
  already; phase 2 is the predicted third instance).

### implementation

- add a `crossingMin` pass to **the family-view engine pipeline**
  (`apps/web/src/lib/layout/engines/family-view/layout.ts` and its
  helpers under `engines/family-view/`). **(rev 1) correction:** the
  original plan referenced `passes/order.ts` + `passes/place.ts` and
  the "four-pass IR contract" — those files belong to the *layered*
  engine, not family-view. family-view has its own pipeline. before
  the pass design starts, read `engines/family-view/layout.ts` end-
  to-end and identify the actual hook point between rank-planning
  and placement; the `planRank` → `placeAt` flow inside `computeLayout`
  is the natural seam. **(rev 2) new contracts to respect at that
  seam** — the visual fix-up plan added: (a) a cumulative rank-y
  pass that walks ranks in sorted order accumulating
  `max(CARD_H, maxHByRank[r]) + RANK_GUTTER`; reorders within a
  rank don't change y, but reorders that pull a portrait card into
  a new rank shift the whole accumulator below it; (b) an
  `emitAnchorsAndEdges(rowGeometry)` consumer that reads `topY` /
  `bottomY` per rank rather than per-node y, so reorders don't
  invalidate edge anchoring; (c) edge ids are `stem:union:…` /
  `bus:union:…` / `stub:union:…|kid` not the legacy `drop:union:…`
  shape — any test that counts crossings or asserts about edges
  must use the new ids. see `## context` above for the full visual-
  fix-up surface inheritance.
- the pass is opt-in via a `fte.layout.familyViewCrossingMin` flag,
  on by default. (rev 1: renamed from `fte.layout.crossingMin` to
  make scope explicit; the layered + hyperbolic engines are not
  in scope.)
- visual goldens are expected to shift; re-baseline as part of the
  phase, not as a follow-up commit. document what shifted in the
  phase retro.
- unit tests: at least 4 cases (one with no crossings — pass is a
  no-op; one with a single avoidable crossing; one with an
  unavoidable crossing — pass leaves it alone; one with the akarians
  primary-focus family at default scope).

### definition of done

- pre-spike outcome recorded with **measured** crossing counts; if
  "defer", phase 2 closes with a one-line retro and the work moves
  to a follow-up note in this plan's bug log (family-view.md is
  retired; this plan is now the canonical follow-up home).
- if implemented: `pnpm verify` green; **all family-view visual
  goldens** re-baselined (rev 1: not only akarians — layout passes
  have surprising downstream effects on small fixtures where greedy
  L-R was incidentally producing the right order); per-golden notes
  in the phase 2 retro describing what shifted; the 4+ unit cases
  pass; flag default applied.
- **(rev 1) idle-machine perf measurement:** measure 3-expand on
  akarians both pre-pass and post-pass on an *idle* machine before
  declaring the pass cheap enough. the phase-0 75 ms budget includes
  CPU-contention flake absorption — that pad is not engineering
  headroom for a new pass to spend.

### rollback criterion

- if the pass increases idle-machine layout latency for 3-expand on
  akarians from the phase-6 baseline (12–22 ms) to >50 ms, fall back:
  flip `fte.layout.familyViewCrossingMin` default to off and ship
  the flag for power-users only. (rev 1: budget framed against the
  phase-6 idle baseline, not the phase-0 flake-absorption pad.) the
  heuristic survives as opt-in until it's fast enough to be default.

---

## phase 3 — smooth-diff animation spike + ship
**status:** open
**definition of done:** spike outcome recorded inline (which approach
won + which lost + why); compositional + mobile gates both closed;
if shipped, `fte.overlays.smoothDiff` flag exists default-on,
path-highlight overlay composes without flicker, e2e visual + perf
probes green on desktop *and* Pixel 7 emulator; if deferred, written
re-attempt trigger.
**scope:** deferred from wave-1 phases 1 + 5 as "v1 allows jump-cut".
the most visible UX upgrade left, but animation regressions stay
local to the diff path (unlike phase 2 which cascades into every
visual golden — phase order rev-1 demoted this to phase 3 for that
reason). retires the unknown "does any one of FLIP / view-transitions
/ motion compose with svelte 5 runes + the existing path-highlight
overlay at acceptable fps on mobile?"

(rev 1: was phase 2. demoted behind crossing-minimisation because
animation regressions stay local to the diff path while layout
regressions cascade into every visual golden.)

estimated effort: ~1-2 days.

### spike (first 0.5 day, before committing to ship)

- pick a transition approach: FLIP (manual measure-then-animate),
  CSS-only (`view-transition-name` per card), or a tiny motion library
  (`motion`, `animejs`, etc). **(rev 1) svelte 5 caveat:** the three
  approaches interact with svelte 5 runes differently — FLIP's
  measure-then-animate fights `$effect` ordering; view-transitions
  don't compose with svelte's per-component diff strategy; motion
  libraries add bundle cost and run outside the reactive cycle.
  spike the *simplest* transition (collapse-to-badge) on one approach
  first; if it doesn't compose with the existing path-highlight
  overlay's `data-on-path` swap, the approach is wrong regardless of
  fps. only after one approach proves compositional should the spike
  expand to all three transitions.
- evaluate on three transitions: expand-from-collapsed, collapse-to-
  badge, badge-toggle-switch. record perceived-smoothness, frame
  budget impact, code complexity, and whether it composes with the
  existing path-highlight overlay.
- **(rev 1) mobile spike gate:** load the chosen approach on a
  Pixel 7 emulator before committing to the ship sub-phase. mobile
  is where smoothness regressions appear first; spike validation on
  desktop chromium only is insufficient.
- success criterion for the spike: at least one approach lands all
  three transitions at ≥55 fps on the akarians fixture *and* on
  Pixel 7 emulator, with no flicker on the path-highlight overlay
  during the animation. if no approach passes, defer animation again
  with a written record and move to phase 4.

### ship (remaining 0.5–1 day, conditional on spike passing)

- implement the chosen approach behind a `fte.overlays.smoothDiff`
  localStorage flag, on by default. the existing path-highlight
  overlay's flag pattern is the template.
- add a new e2e visual golden capturing the mid-animation frame at a
  fixed timestamp (use `page.evaluate(() => performance.now())` +
  motion's pause api, or equivalent), `maxDiffPixels: 200`.
- add a perf probe: animated expand of 3 cards completes within 250 ms
  on akarians; jump-cut equivalent remains <50 ms (phase-0 budget).

### definition of done

- spike outcome recorded inline in the plan (which approach, which
  approaches lost and why). compositional-spike + mobile-spike gates
  both closed.
- if shipped: flag exists, default-on, on-path overlay composes
  without flicker, e2e visual + perf probes green on desktop *and*
  Pixel 7 emulator.
- if deferred: written record of why and a "re-attempt when X changes"
  trigger.

### rollback criterion

- if the animation causes flicker on slower devices (Pixel 7 mobile
  e2e, or self-reported on lower-end hardware) and no tuning fixes it
  within 0.25 days, flip the flag default to off and ship that.
  feature stays available; default is jump-cut.

---

## phase 4 — secondary-union expansion
**status:** open
**definition of done:** phase-start pre-mortem run; symbol-overlap
audit with `aba7de0` recorded; secondary unions render side-by-side
in family-view when both unions are expanded; primary union still
highlighted distinctly; inspector + gedcom round-trip unchanged;
visual goldens cover 3-union focus + half-sibling case; wave-1
bug-log item "multi-union renderer commits to one-union-at-a-time"
closes.
**scope:** the biggest scope expansion left. wave-1 shipped one-union-
per-person rendering with `˅` picker for cycling; this phase makes
multiple unions renderable side-by-side. distinct from `aba7de0`'s
N>2-partner polycule (terminology disambiguated in rev 1). retires
the unknown "how does the union-fan geometry handle 2+ expanded
unions per focus without overflowing the bounded window?" rollback
partner: 2-expanded-unions-max.

(rev 1: renamed from "N>2 union renderer". the original name collides
with `aba7de0`'s already-shipped *N>2-partner* polycule renderer
(single union, many partners, bus connector). this phase is about
*many unions per person* — when the focus is in two distinct 2-partner
unions, render both simultaneously rather than via the `˅` picker.
keep the two concepts terminologically separate to avoid symbol
collisions in `subset.ts` and the family-view `RankSlot` union.)

estimated effort: ~3-4 days.

### dependencies

- **RV phase 3b shipped in `aba7de0`** (14 May 2026): `domain/tree.ts`
  always-on `unions: []`; family-view `multi-union` rank slot for
  N>2 partners; `partnersInMultiUnionsOf` helper; `treeDiff` tracks
  `unions[]`. **(rev 1) dependency text relaxed:** the original plan
  said "every layout / inspector / serializer consumer has migrated
  to `getUnions(tree)`". the RV plan's 3b retro (recorded in the
  retired relationship-vocabulary.md, recoverable via git history)
  records that the `couples.ts` reader migration is *deliberately
  deferred* — today's 2-partner paths are
  bit-identical against `tree.couples`, so a wholesale sweep was
  judged no-gain. phase 4's actual dependency: `tree.unions[]` is
  reliable (it is); new phase-4 code paths use `getUnions(tree)`;
  existing 2-partner paths via `tree.couples` stay untouched until
  they need to.
- **RV phase 3c (GEDCOM `_TREES_UNION`)** is in-flight at plan time;
  re-check completion status when phase 4 starts. round-trip
  contract for N-partner unions through GEDCOM is owned by 3c, not
  this phase.
- this phase gets its own `pre-mortem` at start, not at plan time.
  the union-renderer geometry has at least three unknowns the wave-1
  retro flagged: time-axis-fan vs spatial-stack vs hybrid; whether
  primary union still gets a "primary" visual rank; how `planRank`
  resolves for second-union partners. **(rev 1) phase-4 pre-mortem
  preconditions:** before running the pre-mortem, (a) read `aba7de0`'s
  commit body end-to-end to absorb the polycule-renderer pattern;
  (b) audit the symbol overlap with `aba7de0` — `partnersInMultiUnionsOf`,
  `multi-union` `RankSlot.kind`, `subset.ts` mechanics. decide upfront
  whether phase 4 extends those symbols or introduces parallel
  symbols (e.g. `RankSlot.kind = "union-fan"`, `secondaryUnionsOf`).
- **visual-fix-up busY clamp inheritance** (rev 2): the visual fix-up
  added `dropFromY = max(midpoint, parentRowBottom + 0.05)` for the
  N>2 multi-union manifold drops. the secondary-union union-fan
  geometry inherits this clamp; partners drawn in an expanded second
  union still land in the gutter, not behind the parent card.
  similarly, `CARD_VISIBLE_INSET_U = 3 / 80` matches the 3 px
  selection-ring inset — if phase 4 changes the union-anchor visual
  edge (e.g. a thicker frame for "this is the primary union"), the
  inset constant must move in the same commit.

### work (sketch only — designed in detail when phase starts)

- `engines/family-view/subset.ts` learns to pull in **secondary-union
  partners** of the focus when those unions are marked `isExpanded`
  in the expansion state. today it pulls in primary partner only.
  (rev 1: "secondary union" = any 2-partner union the focus is in
  that isn't the currently-primary one. distinct from `aba7de0`'s
  `partnersInMultiUnionsOf`, which iterates *partners of an N>2-
  partner union*.)
- couple-box renderer becomes union-fan: each expanded secondary
  union renders as its own anchored block beside the primary union,
  with the focus card itself shared visually. preserve the existing
  `data-union-picker` slot for users who prefer one-at-a-time.
- `planRank` resolution for partners who appear in multiple unions:
  rank by the union the user is looking at, not the first one in
  insertion order. ambiguous case (user expanded both) needs a tie-
  breaker — phase pre-mortem decides.
- new visual goldens: 3-union focus on a dense fictional family;
  half-sibling rendering when partner-of-partner has their own union.
- e2e: expand a second union, verify children of that union appear
  one rank below the union-box; switch to layered, verify same
  children still render (existing layered code already handles
  multi-parent children via `parentIds[]`).

### definition of done

- pre-mortem run; risks tagged; phases revised if needed; spike
  outcome recorded; symbol-overlap audit with `aba7de0` recorded.
- secondary unions render side-by-side in family-view when both
  unions are expanded; primary union still highlighted distinctly.
- inspector + gedcom round-trip unchanged (RV phase 3b/3c own that
  contract; phase 4 only consumes it).
- visual goldens cover at least the 3-union focus case + the half-
  sibling case.
- the bug-log item "multi-union renderer commits to one-union-at-a-
  time; non-primary partner's children hidden until `˅` switch"
  closes.

### rollback criterion

- if the union-fan geometry produces unavoidable card overlaps at
  the bounded window for 3+ expanded unions, ship the phase as
  2-expanded-unions-max, leave 3+ rendering as 1-at-a-time + `˅`
  cycling (wave-1 behaviour), and document the geometric limit. the
  bounded ≤30-card window is the rollback partner here.

---

## reference shelf

- `notes/plans/family-view.md` (retired) — wave-1 plan, retros, bug
  log, ship-gate cut-line (2026-05-14). recoverable via git history.
  the relevant deliverables are summarised in `## context` above.
- `notes/plans/relationship-vocabulary.md` (retired) — RV workstream;
  owned the `UnionRecord` schema + N>2-partner renderer (3b, shipped
  in `aba7de0`), the GEDCOM `_TREES_UNION` extension (3c), and the
  server-side finding emission path. shipped contracts remain in
  `domain/schema.ts` and `domain/tree.ts`; the planning doc itself
  is retired. recoverable via git history. (rev 1: previous "reader
  sweep" framing was inaccurate — the sweep was deliberately
  deferred; only writers were flipped to unconditional sync.)
- [`notes/plans/family-view-visual-fixup.md`](../../../notes/plans/family-view-visual-fixup.md)
  — visual fix-up tracker (shipped 2026-05-22 at trunk `5e37307`).
  closed 10 cosmetic / rendering issues across 6 phases; surface
  contracts inherited by wave-2 documented in `## context` above.
- [`notes/agents.md`](../../../notes/agents.md) — affordance slot
  reservation (entries 15 + 16), ARIA-label test-selector guidance
  (to be added in phase 0).
- [`notes/dev/process.md`](../../../notes/dev/process.md) —
  phased-plan / phase-loop / ship-gate process.
- prior flat-file location: `notes/plans/family-view-w2.md` (left
  untouched by this restructure; recoverable via git history if
  removed in a follow-up).
