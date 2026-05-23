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
