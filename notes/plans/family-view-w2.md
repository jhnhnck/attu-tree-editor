# family view — wave 2

successor plan to [`family-view.md`](family-view.md). picks up the trailing
work that the wave-1 ship-gate (2026-05-14) deferred or surfaced, plus the
multi-union scope expansion that wave-1 explicitly scoped to N=2.

reads alongside [`notes/agents.md`](../agents.md) and the RV workstream's
[`relationship-vocabulary.md`](relationship-vocabulary.md), which owns the
schema + reader + inspector layers that two wave-2 phases sit on top of.

**revision history:**
- rev 1 (14 May 2026) — folded in pre-mortem findings: phases 2 + 3
  swapped to put crossing-min ahead of smooth-diff animation (risk-
  first within the unblocked set); phase 0 zoom-100% item annotated as
  a UX-contract change with explicit design-note + rollback gate;
  phase 0 mobile e2e item requires manual repro before the test
  workaround lands; phase 0 spike-test deletion + snapshot commit
  reframed to avoid orphaning artifacts; phase 4 terminology renamed
  to "secondary-union expansion" to disambiguate from `aba7de0`'s
  N>2-partner polycule renderer; phase 4 dependency text relaxed to
  reflect what RV phase 3b actually shipped vs deferred; DoD probes
  added per phase. pre-mortem report retained at end of file.
- rev 2 (23 May 2026) — folded in resolutions from the parallel
  wise-skipping-meerkat ("family-view visual fix-up") plan, which
  shipped 22 May 2026. closed phase-0 items (visual-akarians snapshot
  dir is tracked + actively maintained across the visual-fix-up plan's
  6 phases; latency test has been stable across 4 phases since the
  wave-1 ship-gate). cross-referenced the mobile inspector-overlay
  flakiness item with the precise signature recorded in the visual-
  fix-up plan's bug-log entry B4 (empty-state overlay intercepts the
  `Use layered engine` menuitem click during engine swap on Pixel 7).
  documented the new layout invariants the visual-fix-up plan added
  (cumulative rank-y, `RowGeometry` abstraction, explicit
  bus/stem/stub topology, busY clamp on multi-union `dropFromY`,
  `CARD_VISIBLE_INSET_U` selection-ring cross-link) so phase 2
  crossing-min and phase 4 secondary-union expansion both start from
  the post-fix-up surface. added 4 new bug-log entries (B5/B6/B11/B12
  carried over from the visual-fix-up plan's residual debt).

---

## what wave-1 delivered

family-view shipped as the default tree engine on 2026-05-14, closing all
six planned phases. summary of the surface that's now live:

- new engine module at `apps/web/src/lib/layout/engines/family-view/`,
  registered alongside `layered` and `hyperbolic`; default on first load,
  toggleable via the View menu's engine sub-list, persisted as
  `fte.defaultEngine` in localStorage.
- bounded ≤30-card window centred on focus: focus + parents +
  grandparents + great-grandparents + children + grandchildren + siblings
  at each ancestor rank, drawn as couple-boxes.
- inline expand/collapse via `+` / `−` affordances; localStorage-backed
  expansion state per (tree, focus); DOI-ranked auto-collapse when the
  visible card count crosses 50.
- union-as-anchor primary union model with the `˅` picker for the focus's
  multi-union choice (N=2 only; non-primary partner's children hidden
  until `˅` switch).
- selection → focus path highlight overlay: `bfsPath` walks consanguinity
  + spouse edges, on-path edges thicken, off-path edges dim, on-path
  cards accent with `ring-2 ring-accent/70 + data-on-path="true"`,
  collapsed badges accent when any member is on-path. toggleable from
  the View menu's Overlays sub-list, on by default.
- canvas-side `+ person` (UserPlus) affordance on the focus card with
  add-parent / add-partner / add-child menu; right-click context menu
  surfaces the same on every card in every engine.
- visual encoding pass: decorator-driven `cardDecorator.decorate(person,
  ctx)` returns shape / frame / fillTone / cornerGlyphs / underline;
  PersonNode reads from the decorator and contains zero `gender ===`
  branches.
- four-corner + two-edge affordance slot reservation, documented in
  `notes/agents.md` entries 15 + 16.
- cross-engine continuity verified end-to-end: selection, focus, edits
  all survive engine switches in both directions.
- visual goldens at Akarians DEMO + a 5-generation linear fixture;
  `pnpm verify` green at the Phase 6 ship commit (`20966f1`).

wave-1's plan, bug log, retros, and ship-gate cut-line all live in
[`family-view.md`](family-view.md). the ship-gate verdict was `no-ship
until RV-phase-3b WIP resolved` — that blocker belongs to the RV plan,
not this one.

---

## what the visual fix-up plan delivered (parallel thread, shipped 22 May 2026)

between wave-1's ship-gate and wave-2 starting, a separate plan
[`wise-skipping-meerkat`](../../../home/jhn/.claude/plans/wise-skipping-meerkat.md)
+ tracker at [`notes/plans/family-view-visual-fixup.md`](family-view-visual-fixup.md)
drove a 6-phase visual / rendering fix-up on the family-view engine.
that plan shipped at trunk `5e37307` with a clean ship-readiness
verdict. wave-2 inherits its surface; the items below are the
deltas to keep in mind when phase 2 (crossing-min) and phase 4
(secondary-union expansion) start.

**resolved (10 issues closed):**

- **#1** two-line names no longer clipped at card bottom (phase 1).
- **#2** when `dateRange` is null, the name + avatar block centers
  vertically; the empty-band-at-top failure mode is gone. uses a new
  `data-has-date` attribute on the PersonNode button (phase 5).
- **#3** card height varies with content via a deterministic
  `cardHeight(person)` heuristic. portrait card is `CARD_H * 2 = 2.4u`,
  which exceeds `ROW_H = 2`, so the layout adopted a **cumulative
  rank-y** pass that walks ranks in sorted order accumulating
  `max(CARD_H, maxHByRank[r]) + RANK_GUTTER` where
  `RANK_GUTTER = ROW_H - CARD_H = 0.8`. default-height rows preserve
  `rank * ROW_H` spacing; portrait rows push every subsequent rank
  down by the height delta. `bbox.height` switched to the cumulative
  formula too (phase 1 + 3).
- **#4** couple-bus terminates flush at the card's visible edge via a
  new `CARD_VISIBLE_INSET_U = 3 / 80` constant that matches the 3 px
  `box-shadow: inset 0 0 0 3px` selection-ring inset in PersonNode.
  cross-cutting: any later edit to the selection-ring inset must
  move `CARD_VISIBLE_INSET_U` in the same commit (phase 2 + 5).
- **#5** sibling bus is now an **explicit horizontal segment** —
  one `stem:union:…` (parent stem), one `bus:union:…` (the bus),
  N `stub:union:…|kid` (per-child verticals). replaces the old
  N L-drops whose horizontal segments visually overlapped into an
  emergent bus. bus extent =
  `[min(anchorCenterX, kidsMinX), max(anchorCenterX, kidsMaxX)]`
  so the parent stem always lands on the bus. busY clamped to
  `max(midpoint, parentRowBottom + 0.05)` — SVG edges render behind
  cards, so a bus inside the parent card was invisible (phase 2 + 3).
- **#6** SVG path coordinates round to integer pixels via `Math.round`
  after the UNIT scale. `edgePath` extracted to a worker-safe pure
  module at `engines/family-view/edgePath.ts` (phase 2).
- **#7** selection ring corner radius matches the card's outer
  radius. fixed by bumping the card border-radius from `0.375rem`
  (6 px) to `0.5rem` (8 px); with border-width 2 px the padding-box
  inner radius becomes 6 px, giving the inset-3 px shadow's outer
  corner enough arc to render flush against the border's inner
  corner. `box-shadow: inset 0 0 0 3px` preserved (phase 5).
- **#9** generation-badge toggle in the View menu and command palette.
  default OFF (was implicitly on in wave-1). persisted via
  `fte.overlays.generationBadge` localStorage key; round-trips
  through reload AND through tab close/reopen (verified by e2e in
  `family-view-continuity.spec.ts`'s new sibling describe block).
  the badge entry is `view.overlay.generationBadge` in commands.ts
  (phase 0 + 4).
- **#11** silhouette placeholder removed entirely. no-portrait
  cards render only name + date. when `portraitBlobId` is set but
  the URL hasn't resolved, the slot still renders (no `<img>`) with
  an `.is-portrait-pending` neutral background, so the tall portrait
  card never shows an empty top band during blob load (phase 1 + 3).
- **#12** debug-pill Bug icon contrast: `text-fg-muted` → `text-fg`
  so the lucide glyph reads at parity with the "N people" pill text
  (phase 5).

**new layout invariants wave-2 phase 2 needs to know:**

- the family-view layout pipeline is **not** the shared `passes/`
  pipeline — it's its own module at `apps/web/src/lib/layout/engines/family-view/layout.ts`.
  the natural seam for an ordering pass is the `planRank` →
  `placeAt` flow inside `computeLayout` (this was already in rev 1's
  phase 2 correction; visual fix-up didn't move the seam, but it
  did add new contracts at it).
- ranks have variable y-spacing now via the **cumulative rank-y**
  pass — a crossing-min reorder within a rank doesn't change y
  (max card height in the rank stays the same), but reorders across
  rank boundaries must respect the per-rank max-height accumulator.
- `emitAnchorsAndEdges` reads from a `RowGeometry` lookup (`topY`,
  `bottomY` per rank) rather than per-node y, so reorders that
  change which sibling is leftmost are fine — kid-rank top derives
  from `rowGeometry.topY(kid.rank)`, not from the leftmost kid's
  current y.
- the **explicit bus/stem/stub** topology means crossing-min should
  count crossings against `bus:union:…` and `stub:union:…|kid`
  edge ids, not the legacy `drop:union:…` shape. earlier wave-2 rev
  text referenced `drop:` ids; those don't exist in this code path
  anymore.

**new layout invariants wave-2 phase 4 (secondary-union expansion)
needs to know:**

- the visual fix-up plan added a busY clamp for the N>2 multi-union
  manifold drops too: `dropFromY = max(midpoint, parentRowBottom + 0.05)`.
  the secondary-union union-fan geometry inherits this clamp;
  partners drawn in an expanded second union still land in the
  gutter, not behind the parent card.
- `CARD_VISIBLE_INSET_U = 3 / 80` matches the 3 px selection-ring
  inset. if phase 4 changes the union-anchor visual edge (e.g. a
  thicker frame for "this is the primary union"), the inset
  constant must move too.

---

## what wave 2 picks up

every open item from the wave-1 cut-line that isn't owned by another
workstream. items handed to RV (`emitFinding` server-side persistence,
server-side `multi-parent-unsupported` finding) stay there and aren't
duplicated here.

the items, grouped by risk:

**stability + signal — test infra, flake hygiene, theming.** these block
CI confidence and slow every future phase. cheap individually; the
combined sweep retires a class of "is the test telling me something
real?" friction.

**visibility — denser e2e coverage, mask helper.** the collapse-badge
auto-collapse path and the visual goldens have known gaps; closing them
both raises the floor for any layout-touching work that follows.

**polish — smooth-diff animation, theme tokens.** the most visible UX
upgrades that have been deferred since phase 1 and phase 5. these are
spike-then-ship — if the prototype flickers, defer again.

**layout quality — crossing-minimisation.** invisible at the bounded
window today but the most architecturally interesting layout work left.
risk: could destabilise visual goldens. needs its own rollback criterion.

**scope expansion — N>2 union renderer.** the largest single item;
explicitly deferred from wave-1 phase 2. depends on the RV workstream's
union reader sweep landing first. this phase gets a pre-mortem of its
own at its start.

phase order is risk-first, not dependency-first: scariest viable phase
next, not most "ready". the secondary-union expansion is the scariest
item by far, but it's blocked on RV phase 3b (now resolved in
`aba7de0`; see phase 4 dependency text), so it lands last in the order
anyway because it also needs phases 0-1's signal-tightening to ship
cleanly. within the unblocked set (phases 0-3), crossing-minimisation
comes *before* smooth-diff because layout regressions cascade into
every visual golden; animation regressions stay local to the diff
path. plan rev 1 swapped these from the original 2-before-3 order.

---

## phase 0 — stability + janitorial sweep (~1 day)

retire the cluster of small items that individually look like polish but
together gate CI signal and reviewer confidence.

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

## phase 1 — denser e2e coverage + visual-golden mask helper (~1 day)

phase 0 makes the existing signal trustworthy; phase 1 closes two known
coverage gaps.

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

## phase 2 — crossing-minimisation in family-view layout (~2–3 days)

(rev 1: was phase 3. promoted ahead of smooth-diff animation because
layout regressions cascade into every visual golden, while animation
regressions stay local to the diff path — risk-first within the
unblocked set.)

wave-1 shipped greedy left-to-right per rank, invisible at the ≤30-card
bounded window. the layout quality is the most architecturally
interesting open item. risk: every visual golden could shift.

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
  must use the new ids. see "## what the visual fix-up plan
  delivered" earlier in this file.
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
  to a `family-view.md` follow-up note.
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

## phase 3 — smooth-diff animation spike + ship (~1–2 days)

(rev 1: was phase 2. demoted behind crossing-minimisation because
animation regressions stay local to the diff path while layout
regressions cascade into every visual golden.)

deferred from phase 1 through phase 6 of wave-1 as "v1 allows jump-cut."
wave-2 ships it iff the spike doesn't flicker.

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

## phase 4 — secondary-union expansion (~3–4 days)

(rev 1: renamed from "N>2 union renderer". the original name collides
with `aba7de0`'s already-shipped *N>2-partner* polycule renderer
(single union, many partners, bus connector). this phase is about
*many unions per person* — when the focus is in two distinct 2-partner
unions, render both simultaneously rather than via the `˅` picker.
keep the two concepts terminologically separate to avoid symbol
collisions in `subset.ts` and the family-view `RankSlot` union.)

the biggest scope expansion left. wave-1 explicitly shipped one-union-
per-person rendering (with the `˅` picker for cycling); this phase
makes a person's multiple unions renderable side-by-side in family-
view, not one-at-a-time.

### dependencies

- **RV phase 3b shipped in `aba7de0`** (14 May 2026): `domain/tree.ts`
  always-on `unions: []`; family-view `multi-union` rank slot for
  N>2 partners; `partnersInMultiUnionsOf` helper; `treeDiff` tracks
  `unions[]`. **(rev 1) dependency text relaxed:** the original plan
  said "every layout / inspector / serializer consumer has migrated
  to `getUnions(tree)`". the RV plan's 3b retro (line 2397 of
  `relationship-vocabulary.md`) records that the `couples.ts` reader
  migration is *deliberately deferred* — today's 2-partner paths are
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

## bug log

per `notes/dev/process.md`, this section accumulates findings outside the
current phase's scope. `bug-triage` walks it between phases.

### open (carried in from wave-1 ship-gate)

- family-view layout has no crossing-minimisation → **phase 2 (or
  defer)** (rev 1: was phase 3, swapped to phase 2; rev 2: hook
  point and edge-id contracts updated to match the post-visual-
  fix-up layout pipeline — see "new layout invariants wave-2 phase 2
  needs to know" above)
- no smooth-diff animation → **phase 3 (spike-gated)** (rev 1: was
  phase 2, swapped to phase 3)
- vite-preview e2e workflow requires `pnpm build` before each run →
  **phase 0**
- collapse-badge e2e skipped on akarians → **phase 1**
- multi-union renderer commits to one-union-at-a-time → **phase 4
  (secondary-union expansion; RV phase 3b shipped in `aba7de0`)**
  (rev 1: was "commits to N=2; blocked on RV 3b" — renamed for
  terminology disambiguation, dep updated)
- `tests/spikes/layered-metrics.spike.test.ts` unused-locals warning
  → **phase 0** (rev 1: previously marked deleted-pending; rev 1
  reopened the decision — keep+fix or delete-with-snapshots-together.
  see phase 0 entry)
- `˅` aria-label lesson worth capturing in `notes/agents.md` →
  **phase 0**
- on-path stroke / ring theme tokens still raw tailwind → **phase 0**
- family-view zoom not centered + "100%" not a stable reference →
  **phase 0** (carried over from wave-1's open bug log; rev 1: now
  has a design-note gate — may split to phase 0b)
- shared visual-golden mask helper for akarians goldens → **phase 1**
- mobile inspector-overlay e2e flakiness (3 tests on Pixel 7) →
  **phase 0** (rev 2: precise signature recorded by the visual fix-
  up plan's B4 — 2 of the 3 tests fail because the empty-state
  placeholder overlay intercepts the `Use layered engine` menuitem
  click during engine swap. desktop chromium is clean. confirmed
  pre-existing across all 6 phases of the visual fix-up plan, so
  not a regression in either plan. the third test (which the wave-1
  ship-gate noted) may be unrelated; verify at phase 0 start.)
- `family-view-latency.test.ts` flaky at 50 ms budget under CPU
  contention → **phase 0** (rev 2: re-tested across 4 phases of the
  visual fix-up plan with measured times 11.13 / 15.65 / 16.51 ms
  for 3-expand and 10-expand on idle. no flake observed since the
  wave-1 ship-gate. **the loosen-to-75ms-plus-retry-once item may
  no longer be needed** — start phase 0 by re-running the test 10×
  on a contended CPU; if it stays under 50 ms, close this item
  without code change. if it flakes, the rev-1 plan still applies.)

### open (carried in from the visual fix-up plan's residual debt — 2026-05-22)

these closed-with-defer items in the visual fix-up plan's bug log are
relevant to wave-2 phases. routed here so the visual fix-up plan can
stay closed and wave-2's phase-loop sees them at the next triage.

- **B5** zoom-matrix verification for the #6 integer-pixel-rounding
  fix never ran at 0.5× / 2.0× zoom (the rounded coords land on
  half-pixel grid offsets at non-1 scales). `shape-rendering: crispEdges`
  fallback is documented in `engines/family-view/edgePath.ts` but
  not applied. → **phase 0** (folds naturally into the zoom-anchor
  + stable-100% work; once zoom is fixed, re-run the matrix and
  decide whether to apply the crispEdges fallback)
- **B6** the explicit sibling bus emits `role: "blood"` uniformly
  even when every kid of the couple is a half-sibling. per-kid stubs
  carry the correct role; only the bus itself is uniform. visually
  fine today (bus = shared-children-line; stubs = per-kid role) but
  a relationship-vocabulary palette enrichment may want bus-level
  roles. → **phase 4** (secondary-union expansion is the natural
  home; if union-fan geometry exposes per-bus role distinctions,
  fold this in then)
- **B11** `orientCouple` swaps left/right by personId lex order; the
  pattern has bitten family-view test assertions twice (visual fix-
  up phases 2 and 3). visual fix-up's plan-revise deferred the
  `tests/_helpers/family-view.ts` `pickLeftRight(layout, ids)`
  proposal to "if a third phase trips on it" — wave-2 phase 2
  (crossing-min) is the most likely third instance because the new
  pass will need to assert "leftmost-at-rank-N is X". → **phase 0
  or phase 2** (introduce the helper preemptively in phase 0's
  test-hygiene cluster, or defer until phase 2 actually trips on
  it; preference: preempt, the helper is ~10 lines)
- **B12** `.is-portrait-pending` slot background transition is
  unguarded — the slot snaps from neutral grey to the resolved
  portrait the instant the blob URL resolves. sub-perception on
  cached blobs (<100 ms typical). → **phase 0** (tiny CSS
  `transition: background-image 80ms ease-out` if phase 0 touches
  PersonNode's portrait-slot rules at all; otherwise defer)

### owned elsewhere (handed off, not duplicated here)

- `emitFinding` lacks server-side persistence → RV workstream's
  schema-rejection path.
- server-side `multi-parent-unsupported` finding deferred → RV
  workstream.

### triaged & deferred

(empty.)

### closed

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

---

## phase history

(empty — wave 2 has not started.)

note (14 May 2026): the active wave-2 thread is the visual fix-up
plan at [`~/.claude/plans/wise-skipping-meerkat.md`](../../../home/jhn/.claude/plans/wise-skipping-meerkat.md)
+ tracker at [`notes/plans/family-view-visual-fixup.md`](family-view-visual-fixup.md),
which shipped its own phase 0 (`cf15ea7`) and phase 1 (`9f8a784`)
on the same day this plan was rev-1'd. that plan's phase 2 is the
next thing being driven; this plan's phase 0 (stability sweep) is
on hold pending a decision on whether the two streams merge or
stay separate. revisit this plan after the visual fix-up plan
ships its remaining phases.

note (23 May 2026, rev 2): the visual fix-up plan **shipped** on
22 May 2026 at trunk `5e37307` with a clean ship-readiness verdict
— all 10 in-scope issues (#1, #2, #3, #4, #5, #6, #7, #9, #11,
#12) closed across 6 phases. wave-2 is now unblocked: the
"two streams merge or stay separate" decision can be resolved in
favour of **stay separate** (the visual fix-up was a tight,
self-contained cosmetic / rendering pass; wave-2 is the layout-
quality + scope-expansion successor). see the new
"## what the visual fix-up plan delivered" section above for the
deltas wave-2 phase 2 (crossing-min) and phase 4 (secondary-union
expansion) need to consume. wave-2 phase 0 (stability sweep) is
now next on deck; some of its items have been resolved or
descoped by the visual fix-up plan (see bug-log updates).

---

## reference shelf

- [`family-view.md`](family-view.md) — wave-1 plan, retros, bug log,
  ship-gate cut-line (2026-05-14).
- [`relationship-vocabulary.md`](relationship-vocabulary.md) — RV
  workstream; owner of `UnionRecord` schema + N>2-partner renderer
  (3b, shipped in `aba7de0`), GEDCOM `_TREES_UNION` extension (3c,
  in-flight), and server-side finding emission. (rev 1: previous
  "reader sweep" framing was inaccurate — the sweep was deliberately
  deferred; only writers were flipped to unconditional sync.)
- [`notes/agents.md`](../agents.md) — affordance slot reservation
  (entries 15 + 16), ARIA-label test-selector guidance (to be added
  in phase 0).
- `notes/dev/process.md` — phased-plan / phase-loop / ship-gate
  process.

---

## process notes

before phase 0 starts: this plan was written immediately after the wave-1
ship-gate emitted `no-ship until RV-Phase-3b WIP resolved`. **rev 1
update:** RV phase 3b shipped in `aba7de0` (14 May 2026); the ship-gate
blocker is resolved. wave-2 phases 0-3 remain RV-independent; phase 4
(secondary-union expansion) still has the RV-3c dependency for the
gedcom round-trip — non-blocking but worth confirming at phase 4 start.

before phase 4 starts: run the `pre-mortem` skill against this plan's
phase-4 section. the union-fan geometry has more open design questions
than any single wave-1 phase did; do not skip the pre-mortem. **rev 1
pre-mortem preconditions:** read `aba7de0`'s commit body end-to-end
first (the polycule-renderer pattern is the natural reference but its
slot kind + helpers are semantically *different* — see phase 4's
"phase-4 pre-mortem preconditions" note).

---

## pre-mortem — family view wave 2 (14 May 2026)

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

### risks

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

### walking-skeleton check

n/a for a continuation plan. wave-1 already shipped a complete vertical
slice (`family-view` engine end-to-end through the UI). phase 0 is
correctly framed as signal-tightening, not skeleton work.

### phase-order revisions

| original | proposed | reason |
|---|---|---|
| 0 → 1 → 2 → 3 → 4 | 0 → 1 → **3** → **2** → 4 | within the unblocked set (phases 0-3), phase 3 (crossing-min) is the scariest because layout regressions cascade into every visual golden — the plan explicitly says this in the "what wave 2 picks up" section. phase 2 (animation) is local to the diff path. risk-first ordering puts the scariest viable phase next, so 3 should come before 2. the plan's stated reason for 2-before-3 is implicit (animation is "more visible UX upgrade"?) and isn't articulated. if dependency-first is the actual intent (phase 1's mask helper makes phase 3's golden re-baselining cleaner), state that explicitly in the plan and keep the existing order. |

### definition-of-done additions

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
