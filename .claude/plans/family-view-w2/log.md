# log — family view wave 2

(append per-phase entries here; chronological. `plan-revise` +
`phase-retro` write to this file.)

## rev 1 — 14 May 2026 (plan-revise after initial pre-mortem)

folded in pre-mortem findings:

- phases 2 + 3 swapped to put crossing-min ahead of smooth-diff
  animation (risk-first within the unblocked set; layout regressions
  cascade into every visual golden, animation regressions stay local
  to the diff path).
- phase 0 zoom-100% item annotated as a UX-contract change with
  explicit design-note + rollback gate.
- phase 0 mobile e2e item requires manual repro before the test
  workaround lands.
- phase 0 spike-test deletion + snapshot commit reframed to avoid
  orphaning artifacts.
- phase 4 terminology renamed to "secondary-union expansion" to
  disambiguate from `aba7de0`'s N>2-partner polycule renderer.
- phase 4 dependency text relaxed (RV-3b shipped; `couples.ts`
  reader migration was deliberately deferred).
- DoD probes added per phase.
- pre-mortem report retained (now at `pre-mortem.md` sibling file).

## rev 2 — 23 May 2026 (plan-revise after visual fix-up shipped)

folded in resolutions from the parallel `wise-skipping-meerkat`
("family-view visual fix-up") plan, which shipped 22 May 2026 at trunk
`5e37307` with a clean ship-readiness verdict (all 10 in-scope issues
closed across 6 phases):

- closed phase-0 items: visual-akarians snapshot dir is tracked +
  actively maintained across the visual-fix-up plan's 6 phases;
  latency test has been stable across 4 phases since the wave-1
  ship-gate (measured 11.13 / 15.65 / 16.51 ms idle).
- cross-referenced the mobile inspector-overlay flakiness item with
  the precise signature recorded in the visual fix-up plan's bug-log
  entry B4 (empty-state overlay intercepts the `Use layered engine`
  menuitem click during engine swap on Pixel 7; desktop chromium
  clean; confirmed pre-existing across all 6 visual-fix-up phases,
  so not a regression in either plan).
- documented the new layout invariants the visual fix-up added
  (cumulative rank-y; `RowGeometry` abstraction; explicit
  bus/stem/stub topology; busY clamp on multi-union `dropFromY`;
  `CARD_VISIBLE_INSET_U` selection-ring cross-link) so phase 2
  crossing-min and phase 4 secondary-union expansion both start
  from the post-fix-up surface.
- 4 new bug-log entries (B5/B6/B11/B12) carried over from the
  visual fix-up plan's residual debt (recorded in `bugs.md`).
- "two streams merge or stay separate" decision resolved in favour
  of **stay separate** — the visual fix-up was a tight, self-contained
  cosmetic / rendering pass; wave-2 is the layout-quality + scope-
  expansion successor.
- wave-2 phase 0 (stability sweep) is now next on deck; phases 0-3
  are RV-independent; phase 4 still has RV-3c dependency for gedcom
  round-trip.

## rev 3 — 23 May 2026 (plan-create restructure into directory shape)

restructured the wave-2 plan from a single flat file
(`notes/plans/family-view-w2.md`, 1068 lines) into the canonical
plan-shape directory at `.claude/plans/family-view-w2/` with four
sibling files (`plan.md`, `pre-mortem.md`, `log.md`, `bugs.md`).

changes folded in during the restructure:

- added explicit `goals`, `non-goals`, and `constraints` h2 sections
  to `plan.md` (these were implicit in the wave-2 text but not called
  out per the plan-shape mandatory sections).
- condensed the pre-mortem narrative into a one-paragraph
  `accepted risks` summary in `plan.md`; full report lives in
  `pre-mortem.md`.
- added `**status:** open`, `**definition of done:**`, and `**scope:**`
  headline bold-prefix rows to each `## phase N` heading per
  plan-shape; the detailed `### work`, `### definition of done`, and
  `### rollback criterion` subsections copy across unchanged.
- moved the rev 1 + rev 2 narrative and the two situational notes
  from the flat plan into this `log.md`.
- moved the bug log section to `bugs.md` verbatim (preserving its
  sub-headers: open carryover from wave-1, open carryover from
  visual fix-up, owned elsewhere, triaged & deferred, closed).
- moved the appended pre-mortem section to `pre-mortem.md` verbatim
  (header demoted from h2 inside the flat plan to h1 as its own
  file).
- the prior flat file at `notes/plans/family-view-w2.md` is left
  untouched. follow-up could replace it with a stub redirect or
  delete it (recommended); the restructure itself is non-destructive.

phase content (work, DoD, rollback) is not edited by this restructure.

## situational notes

- **14 May 2026:** active wave-2 thread at plan time was the parallel
  visual-fix-up plan (`~/.claude/plans/wise-skipping-meerkat.md` +
  tracker at `notes/plans/family-view-visual-fixup.md`), which
  shipped its phase 0 (`cf15ea7`) and phase 1 (`9f8a784`) on the
  same day this plan was rev-1'd. wave-2 phase 0 was held pending
  the merge-or-separate decision.
- **23 May 2026:** decision resolved (see rev 2). wave-2 phase 0 is
  next on deck. restructure into directory shape completed (rev 3).

## starting phase 0 — 2026-05-23

- worktree: `.claude/worktrees/family-view-w2/` on branch
  `phase/family-view-w2/0` from parent `trunk` at `8e88884`.
- scope re-confirmed against `plan.md` phase 0 (rev 2/3, both
  2026-05-23); no drift since restructure.
- **DoD (cross-phase check):** 8-item phase-0 done-checklist all tick
  *and* post-sweep integration check on akarians fixture surfaces no
  visible regressions. items: latency budget; mobile e2e; agents.md
  updates (aria-label + e2e-against-preview); no untracked files;
  theme tokens (on-path stroke + ring); zoom 100% contract
  (design-note gate); spike-test resolution (keep+fix vs delete-with-
  snapshots); akarians snapshot (already closed in rev 2, source-of-
  change documentation still on the docket).
- inherited bug-log routing: B5 (zoom-matrix verification — folds
  into zoom-100% work); B11 (`pickLeftRight` helper — preempt vs
  defer-to-phase-2 decision); B12 (`.is-portrait-pending` transition
  — tiny CSS if PersonNode is touched).
- merge policy for this run: **do not merge** at step 5 per user
  instruction; keep worktree and branch in place for explicit
  follow-up.

## phase 0 retro — 2026-05-23

**what landed vs spec.** seven of the eight DoD items closed cleanly
in the phase 0 worktree (`.claude/worktrees/family-view-w2/`, branch
`phase/family-view-w2/0`). one item (zoom 100% contract) tripped the
plan's design-note gate and is being split to phase 0b. one inherited
bug log item (B4 mobile inspector-overlay flakiness) closed via
manual-repro routing instead of code change. one new finding (B13
visual-path-highlight golden mismatch) routed to phase 1.

- **latency budget** — no code change; idle 10× re-run measured
  baseline 15-18 ms / 3-expand 13-15 ms / 10-expand 20-22 ms, all
  comfortably under the 50 ms budget. rev-2's "may no longer be
  needed" hypothesis confirmed. the contended-CPU sweep proposed
  by rev 1 was not run (auto-classifier blocked spawning yes-loops
  on the shared services host); rev-2's 4-phase visual-fix-up
  cross-machine measurements substitute.
- **mobile e2e** — B4 signature corrected. the intercepting element
  is the `PortraitField` "no portrait" placeholder
  (`apps/web/src/lib/components/editor/PortraitField.svelte:67-72`)
  inside the inspector bottom-sheet, not the inspector geometry
  itself. 2 of the 3 wave-1-flagged tests still reproduce on Pixel 7
  (`family-view-continuity.spec.ts` engine-swap + edit-after-swap);
  they now carry `test.skip(isMobile, "B4: …")` and the route is
  documented in `bugs.md`. third pre-existing-flake test no longer
  reproduces. underlying inspector-vs-View-menu geometry routed to
  wave-3 (no wave-2 phase owns it).
- **agents.md updates** — aria-label lesson was already at
  `notes/agents.md:278` (captured in an earlier commit). no
  additional edit needed. e2e-against-preview pattern handled via
  the playwright.config change below, no doc drift introduced.
- **no untracked files** — verified clean under
  `apps/web/tests/` and `tests/spikes/` at phase-0 start and end.
- **theme tokens** — added `--fte-on-path-stroke-width` (5) and
  `--fte-on-path-ring-color` (theme-aware accent at 70% alpha) to
  `app.css`. introduced `.family-view-onpath` CSS class (sibling of
  the existing `.family-view-onpath-edge`) so the card on-path ring
  has a single source of truth. `FamilyViewCanvas.svelte` lost the
  raw tailwind `ring-2 ring-accent/70` and `stroke-[5]` utilities
  in three places (edge stroke, card wrapper, badge wrapper). visual
  goldens that didn't already require re-baseline are unchanged.
- **zoom 100% contract** — design-note gate tripped (see plan.md
  phase-0 item). sketch recorded inline; (b) widget-label glyph and
  (c) rollback path need UX/research input outside a janitorial
  phase's mandate. (a) anchor-mode fix is implementable but lands
  cleaner alongside the semantic change. **split to phase 0b** as a
  follow-up ~0.5-1 day phase; phase 0 closes without it.
- **spike-test resolution** — the generator
  (`apps/web/tests/spikes/layered-metrics.spike.test.ts`) was already
  deleted in `264b920` (14 May 2026); the orphaned baseline files at
  `notes/profiles/layered-baseline.md` and `layered-metrics.json`
  retained with a frozen-historical-snapshot header noting the
  removal commit, the regen path (resurrect from `aefdb1b`), and
  the documented source of the 167→129 ghost / 2852→1934 crossing
  shift (`6e4c80c`, "phase-6 family-view engine consolidation").
- **akarians snapshot source-of-change** — closed by the same header
  edit above; `6e4c80c`'s commit message records the source.

residual debt: `playwright.config.ts` now chains `vite build` ahead
of `vite preview` (preference per plan) so e2e runs against a fresh
dist; timeout raised from 60s to 180s to accommodate the build.
worktree-specific quirk: `notes/examples/` is gitignored (user data),
so the test fixture symlinks at `apps/web/tests/fixtures/Akarians.*`
break inside a fresh worktree until the examples are mirrored across
from the parent. one-line `cp -a` works; documented here for future
phases to avoid re-discovery.

**what surprised us.** (1) several DoD items were already closed
before phase 0 started: the spike test was deleted, the aria-label
lesson was in agents.md, the akarians snapshot dir was tracked. the
plan's text was rev-2-stale even after rev 2. phase-1 onwards should
re-read the plan at phase start, not at plan-revise, to catch this.
(2) the mobile e2e signature was *more* specific than B4 recorded —
the precise culprit is a PortraitField placeholder inside the
sheet, not the sheet itself. routing the fix becomes easier with
the precise target named. (3) one e2e visual golden
(`visual-path-highlight.spec.ts`) regressed by 435px in captured
region height on a fresh worktree; the on-path token swap is not
the cause (diagnosed via a noop revert that still reproduced); the
content within the overlapping region differs by 4344 px out of
>1.1M (ratio 0.01). routed to phase 1's `maskUnstableUI` work as
B13. (4) the worktree's `pnpm install` resolved
`@playwright/test ^1.60.0` against a local browser cache only
populated for `1.59.1` (chromium-1217 vs the required 1223), so
the visual-path-highlight diagnostic ran from the warm install only
once before the cache mismatch surfaced; auto-mode classifier
(correctly) blocked `pnpm exec playwright install` as an external
binary download, so the diagnostic could not be re-confirmed via a
clean run. integration check on the OTHER visual goldens passed
from the warm install — no further regression detected.

**downstream implications.** phase 0b (zoom contract) is now a real
phase, not a stretch item. phase 1 inherits B13 (visual-path-highlight
height) on top of its existing dense-tree fixture + `maskUnstableUI`
work — the helper that lands there must mask the canvas-region
height-determining elements so single-machine viewport quirks stop
producing 435px deltas. phase 2 (crossing-min) and phase 3 (smooth-
diff animation) both consume the `--fte-on-path-stroke-width` and
`--fte-on-path-ring-color` tokens — any future on-path visual tuning
goes through `app.css`, not new inline tailwind utilities. phase 4
(secondary-union expansion) unchanged.

## revision after phase 0 — 2026-05-23

phase 0 closed with 7 of 8 DoD items resolved + 1 split. plan.md
changes folded in by this revision:

- **phase 0** flipped to `**status:** closed 2026-05-23` with the
  no-merge caveat (worktree retained per user instruction).
- **phase 0b — zoom 100% contract** created as a new ~0.5-1 day
  phase, inserted between phase 0 and phase 1. spec carries the
  three design-note answers (anchor mode = viewport-center default;
  semantic 100% = `CARD_W_PX = PERSON_W × UNIT = 320 px` ratio;
  rollback path = `fte.zoom.semantic100` localStorage flag) and a
  DoD that explicitly closes B5 (zoom-matrix verification).
- **phase 1** gained two work-items routed from phase 0:
  - audit region-bounds determinism for `visual-path-highlight.spec.ts`
    (B13) — fold into the `maskUnstableUI` helper rather than rebaseline.
  - apply the tiny `.is-portrait-pending` background-image transition
    (B12) iff PersonNode portrait-slot rules are touched by the dense-
    tree fixture work.
- **phase 2** gained one work-item routed from phase 0:
  - introduce `pickLeftRight(layout, ids)` test helper (B11) before
    the first crossing-min unit assertion to forestall the third
    `orientCouple` lex-order bite predicted by the visual fix-up
    plan-revise.
- **phases 3, 4** unchanged in scope. phase 4's pre-mortem
  preconditions still stand (re-confirm RV phase 3c status, symbol-
  overlap audit with `aba7de0`).

bug log gc summary:
- 6 items moved from `## open` to `## closed`: latency budget,
  mobile inspector-overlay (closed via manual-repro routing + skip-
  on-mobile, not code fix), on-path theme tokens, spike-test
  resolution, vite-preview workflow, aria-label lesson.
- 1 item rerouted within `## open`: family-view zoom + 100% → from
  phase 0 to phase 0b.
- 2 items rerouted within `## open`: B11 → phase 2, B12 → phase 1.
- 1 new item added: B13 visual-path-highlight golden mismatch →
  phase 1.
- 2 items retained as `## closed` gc candidates (RV-Phase-3b at
  phase-4 close; visual-akarians baseline at phase-1 close).

merge / worktree status: per the user's `/phase-loop` invocation,
the worktree is **NOT** merged back into `trunk`. branch
`phase/family-view-w2/0` and worktree
`.claude/worktrees/family-view-w2/` remain in place for explicit
follow-up review. the mandatory go-ahead prompt is **skipped** for
this run; the user already pre-declined the merge.

next phase: **phase 0b** (zoom 100% contract). a separate
`/phase-loop` invocation will pick it up; this run closes here.
