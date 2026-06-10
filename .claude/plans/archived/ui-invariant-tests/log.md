# log — ui-invariant-tests

per-phase retro + decisions land here. one section per phase, appended by `phase-retro` and `plan-revise` as the loop runs.

## starting phase 0 — 2026-05-26

- worktree: `.claude/worktrees/ui-invariant-tests/` (single worktree for entire plan per user instruction; no merge planned until ship-readiness)
- branch: `phase/ui-invariant-tests/all` (single branch accumulates all phases per user instruction)
- parent: `trunk` @ `069d281`

**confirmed DoD for phase 0:**

- 7 skeleton specs land green:
  1. chrome-geometry — picker-behind-cards repro for [620ce7c](https://github.com/.../commit/620ce7c)
  2. selection-state-machine — palette pick path
  3. parity-matrix cell — stats-pill mount across layered + family-view + hyperbolic
  4. keyboard-reachability — DateInput tab-into-edit
  5. toggle-indicator — view > overlays > path-highlight on/off visible delta
  6. auto-fit-suppression — `+` expand-subtree on family-view holds zoom/pan
  7. (the migrated e2e becomes a structural spec, counts as the 7th)
- 1 visual golden + its snapshots deleted; `pnpm test:e2e` still green afterward
- 1 structural e2e migrated (candidate: `engine-picker.spec.ts`); playwright original deleted
- geometry-approach decision written to `notes/dev/test-strategy.md` (a or b)
- `HyperbolicCanvas.svelte` jsdom mount probe outcome recorded in the same doc
- historical replay: the chrome-geometry spec fails on `620ce7c~1` and passes on `620ce7c`

**scope unchanged since pre-mortem fold-in.** phase is broad-by-design (walking skeleton); not splitting.

## phase 0 retro — 2026-05-26

### spec delta

- delivered: 6 of 7 skeleton specs all green (chrome-geometry, selection-state-machine, parity-matrix, keyboard-reachability, toggle-indicator, auto-fit-suppression); geometry approach (a) decided + documented in `notes/dev/test-strategy.md`; HyperbolicCanvas mount probe recorded; 1 visual golden deleted (`visual-akarians`); historical replay against `620ce7c` proves the chrome-geometry spec fails under the buggy stacking and passes under the fixed stacking
- missed / deferred: 7th spec — `engine-picker.spec.ts` migration deferred to phase 1; turned out to be browser-dependent (file picker + ResizeObserver-backed canvas mounts + IndexedDB persistence), not structural as the plan assumed. logged in `bugs.md` as `[important] (phase 0)`
- extra: 3 _probes/ files preserved as documentation of the decision process; 3 new harnesses (`StatsPillHarness`, `TabOrderHarness`, `ToggleMenuHarness`) emerged from the build wave — none were in the DoD but all are now part of the canonical test toolbox

### surprises

- assumption: 20 non-visual e2e specs are mostly structural assertions in a browser costume → reality: at least `engine-picker.spec.ts` genuinely needs ResizeObserver + canvas2d + fake-indexeddb + import-path mock → delta: phase 1 migrate-count likely lower than estimated; "what would need to be shimmed to migrate" should be a column in the classification table
- assumption: HyperbolicCanvas would need canvas2d shims → reality: it fails earlier on missing `ResizeObserver` (jsdom 29.1.1); whether canvas2d is the next failure is unknown → delta: a small global ResizeObserver shim in `setup.ts` might unblock more mounts than expected; worth a phase-1b probe before phase 5 commits to the parity matrix
- assumption: jsdom-side stacking-context detection would be hard or impossible → reality: a custom `elementFromPoint` stub that walks the stacking-context chain (treating `transform != none` and `z-index != auto` as context creators) + per-test rect mocks catches the historical translate3d bug in ~80 lines → delta: approach (a) is more powerful than the plan assumed; approach (b) probably never needed
- assumption: `notes/examples` symlink in worktrees would be a 5-min manual step every phase → reality: user landed an auto-symlink post-checkout hook (`3874387`) mid-phase that obsoletes it → delta: future plans inherit zero-setup worktree fixtures
- assumption: parallel-orchestrating build subagents would have light coordination overhead → reality: subagents independently picked the same DateInput commit reference, one with a typo (`642946e` vs actual `642766e`); two also drifted on prettier formatting → delta: small, handled inline; suggests a one-line "verify commit refs before quoting" line in `notes/agents.md` or the file-header skill

### residual debt

- HyperbolicCanvas needs a `ResizeObserver` shim in `apps/web/tests/setup.ts` to mount; deferred to phase 5 to avoid flipping the `hyperbolic-mount.probe.test.ts` baseline assertion · routed to `bugs.md` tbd in step 5
- `engine-picker.spec.ts` cannot migrate to jsdom; phase 1 must reclassify as `keep (browser-only)` · already in `bugs.md` as `[important] (phase 0)`
- 3 `_probes/` files (chrome-geometry-approach-a, -b, hyperbolic-mount) are documentation of the decision, not assertions; phase 7 docs pass should decide whether to delete them or fold their lessons into `notes/dev/test-strategy.md` · tbd
- 3 pre-existing failing tests in `apps/web/tests/unit/io/familyecho-html/parse.test.ts` (`parseFamilyEchoHtml`); fails identically on trunk and worktree, last touched in `5857a6a` (well before phase 0). out-of-scope for this plan but unowned · route to project-level `notes/bugs.md` in step 5

### implications for downstream phases

- phase 1's e2e-classification step should add a "what would need to be shimmed" column per spec; the structural-wearing-browser-costume framing is true but the cost of unwearing rises sharply when canvas mounts or IndexedDB are in the chain. expect the `migrate` count to be smaller than the original 8-threshold and the `keep (browser-only)` count to be larger
- phase 5 hyperbolic cells are de facto `expectedSkip`; once a global `ResizeObserver` shim lands (could be phase 5's first slice), re-evaluate cell-by-cell. the parity-matrix spec already encodes the skip-with-rationale pattern
- phase 2 chrome-geometry expansion has its template in `tests/component/chrome-geometry-picker.test.ts`; phase 2 is mostly content-creation, not infra discovery

## revision after phase 0 — 2026-05-26

- phase 1 (visual goldens & playwright audit): **revise** — classification table grows a fourth column ("what would need shimming") because phase 0 showed structural-vs-browser-only isn't visible from assertion shape; golden count drops from 8 to 7 (visual-akarians already deleted)
- phase 1b (migrate eligible e2e to jsdom): **revise** — first slice is now the jsdom shim bootstrap (ResizeObserver + IntersectionObserver + matchMedia no-ops in `setup.ts`), then migration proceeds against the wider mountable surface; routes the [important] HyperbolicCanvas-mount bug
- phase 5 (parity matrix): **revise** — adds explicit "re-evaluate each hyperbolic cell after phase 1b shim lands" step; cells stay `expectedSkip` by default until the re-eval
- phase 7 (docs + ci cleanup): **revise** — adds the `_probes/` cleanup decision (delete or keep as examples)
- phases 2, 3, 4, 6: unchanged
- no inserts, reorders, rewrites, or deletes — the shim work was small enough to fold into phase 1b as a first slice rather than become its own phase

## starting phase 1 — 2026-05-26

- worktree: `.claude/worktrees/ui-invariant-tests/` (kept alive; same branch `phase/ui-invariant-tests/all`)
- parent: `phase 0 close @ c09eddb`

**confirmed DoD for phase 1:**

- 7 visual-golden spec files deleted (`visual-add-relative`, `visual-akarians-family-view`, `visual-canvas-chrome-dock`, `visual-dense-tree`, `visual-multi-union`, `visual-path-highlight`, `visual-secondary-union`); 13 .png snapshots deleted; `tests/e2e/_helpers/visual-mask.ts` deleted
- 22 non-visual e2e specs (actual count, was 19 in plan; counted again) classified with four columns: spec name, behavior under test, classification (`keep (browser-only)` / `migrate (structural)` / `delete (covered)`), and — if `migrate` — "what would need shimming"
- classification table appended to `log.md`
- if `migrate` count > 8, declare a 1b/1c split in `plan-revise`; otherwise phase 1b stays single-slice
- `pnpm test:e2e --list` still loads (config doesn't pin deleted specs); `pnpm test:unit` still green
- no new specs landed in phase 1 — that's phase 1b's work

**scope unchanged since plan-revise.** noting the spec count drift (19 → 22) in the table itself.

### phase 1 e2e classification

22 non-visual specs surveyed (technically 21 — `portrait-crop.spec.ts` was a hidden 8th visual golden and was deleted in step 2a alongside the named `visual-*` specs).

| spec | behavior under test | classification | shim needs (if migrate) |
|---|---|---|---|
| `canvas-chrome-dock.spec.ts` | 20 sub-cases: bbox containment, force-collapse on viewport shrink/grow, cross-engine `measureCanvasChromeInsets`, sheet-inspector + debug-menu pointer reachability on Pixel 7, console-error smoke across debug toggles | keep (browser-only) | n/a — depends on real CSS calc(), real ResizeObserver firing on viewport changes, real pointer-intercept, real `boundingBox()` on overflow stacks |
| `collapse-badge-end-to-end.spec.ts` | dense-tree import via wizard, badge auto-renders, click writes localStorage, engine-swap preserves badge | keep (browser-only) | n/a — drives real `importViaWizard` file-picker + live layout worker against 52-card fixture |
| `engine-picker.spec.ts` | menu offers both engines, hyperbolic mounts the disk region, layered restores, proband label paints | keep (browser-only) | n/a — confirmed phase-0 triage; fixture import via real file picker plus `HyperbolicCanvas` mount (blocked under jsdom) |
| `family-view-add-relative.spec.ts` | `+ person` menu, create-child path, outside-click closes menu | keep (browser-only) | outside-click subtest pins to real pointer routing; create-child alone is migratable — split-candidate |
| `family-view-continuity.spec.ts` | selection survives engine swap, generation-badge cross-tab persistence | keep (browser-only) | cross-tab `BrowserContext` requirement pins file; other subtests are split-candidates |
| `family-view-debug-coi.spec.ts` | coi breakdown panel rows sum to raw float, duplicate-ancestor halos point at valid ids, `__treeDebug.coi` shape | migrate (structural) | ResizeObserver, getBoundingClientRect host stub, parse `consanguinity-cousins.ged` in-process |
| `family-view-debug-multi-union.spec.ts` | `showMultiUnionManifold` mounts bus/anchor/label/partner testids, `showCardCollisions` clean, centroid/rank-gutter labels | migrate (structural) | ResizeObserver, getBoundingClientRect host stub, parse `multi-union-3.ged` in-process |
| `family-view-debug-navigation.spec.ts` | `logFocusEvents` + `showPendingRecenter` palette-source attrs, off-subset warning mounts, viewport-fit overlay rects | migrate (structural) | ResizeObserver, getBoundingClientRect host stub, parse `Akarians.ged` in-process |
| `family-view-debug-phase5.spec.ts` | grid/bounds/halo/metrics overlays, panel collapse, smoke walk of every toggle yields zero console errors | delete (covered) | per-overlay assertions redundant with the other migrated debug specs; console-error smoke implicit |
| `family-view-debug.spec.ts` | Ctrl+Shift+D opens panel, `showVisibleSubset` + `showOffSubsetPeople` + `showOrphanBadge`, edges carry `data-edge-role`/`data-edge-id` | migrate (structural) | ResizeObserver, getBoundingClientRect host stub, parse Akarians + multi-union-3 in-process |
| `family-view-expansion.spec.ts` | `+`/`−` mutates visible count, writes localStorage expansion key, engine-swap preserves, collapse-badge → re-expand | migrate (structural) | ResizeObserver, getBoundingClientRect host stub, parse Akarians in-process (localStorage works natively) |
| `family-view-multi-union.spec.ts` | union picker swap writes localStorage, swaps rendered cards | migrate (structural) | ResizeObserver, parse `multi-union.ged` in-process, getBoundingClientRect host stub |
| `family-view-path-highlight.spec.ts` | click sets `aria-selected="true"`, decorates bfs path with `data-on-path`, second click clears | migrate (structural) | ResizeObserver, parse `multi-union.ged` in-process, getBoundingClientRect host stub (mobile subtest drops on jsdom) |
| `family-view-secondary-union.spec.ts` | `show-alongside` / `hide-alongside` action writes localStorage, adds/removes cards, flag-off hides item | migrate (structural) | ResizeObserver, parse `multi-union.ged` in-process, getBoundingClientRect host stub |
| `family-view-smooth-diff.spec.ts` | cards carry `.family-view-smooth-card` + `data-smooth-diff`; flag-off drops both; dense fixture extends to `[data-badge-id]` | migrate (structural) | ResizeObserver, parse Akarians + `dense-tree.ged` in-process, getBoundingClientRect host stub |
| `import-edit.spec.ts` | post-import card count, click selects, inspector renders fields, X closes | migrate (structural) | ResizeObserver, programmatic `parseGedcom(tiny.ged)` + store hydration (bypasses wizard), getBoundingClientRect host stub |
| `import-wizard.spec.ts` | Mod+I opens wizard, `setInputFiles()` populates rows, format badges, multi-file folding, merge/replace radios | keep (browser-only) | n/a — wizard is the system under test; depends on `<input type="file">` semantics jsdom can't fake |
| `inspector-more-actions-smoke.spec.ts` | duplicate / set-as-root / copy id / delete person menu items fire handlers | delete (covered) | `Inspector.test.ts` lines 182-219 already cover all four with userEvent — pure duplication |
| `persistence.spec.ts` | tiny.ged import → 2.5s autosave → reload → cards rehydrate; File > Open lists the saved tree | keep (browser-only) | n/a — drives real `importViaWizard` + full `page.reload()` rehydrate; dexie round-trip itself already covered by unit test |
| `redraw-on-edit.spec.ts` | the worker cache-key regression — import + insert person + badge updates 3 → 4 without reload | keep (browser-only) | n/a — bug lives in real Worker cache-key; jsdom Worker stub wouldn't reproduce |
| `shell.spec.ts` | page loads, File and Help menu buttons visible | delete (covered) | `Menu.test.ts` already covers both menus; trivial smoke |

### counts + split decision

- **keep (browser-only): 8** — canvas-chrome-dock, collapse-badge-end-to-end, engine-picker, family-view-add-relative, family-view-continuity, import-wizard, persistence, redraw-on-edit
- **migrate (structural): 10** — family-view-debug-coi, family-view-debug-multi-union, family-view-debug-navigation, family-view-debug, family-view-expansion, family-view-multi-union, family-view-path-highlight, family-view-secondary-union, family-view-smooth-diff, import-edit
- **delete (covered): 3** — family-view-debug-phase5, inspector-more-actions-smoke, shell

**migrate count = 10 > 8 → declare phase 1b/1c split.** plan-revise step will reshape phase 1b's spec accordingly. natural split surface:

- **phase 1b** (shim bootstrap + debug-overlay migrations): the 5 `family-view-debug*` specs that survive (4 migrate + 1 delete), plus the shim bootstrap that unblocks them
- **phase 1c** (interaction migrations): the 6 non-debug migrations (family-view-expansion, multi-union, path-highlight, secondary-union, smooth-diff, import-edit), 3 deletes
- bootstrap belongs solely in 1b so 1c starts on a clean shim surface

### surprises

- `inspector-more-actions-smoke.spec.ts` self-described as a "real-browser regression... companion to the unit tests" but the unit test already covers all 4 handlers with the same assertions — pure duplication. The only e2e-only signal (clipboard contents) is explicitly skipped in the spec
- `redraw-on-edit.spec.ts` looked migratable on first read but the bug being protected is exclusively in the worker cache-key logic; jsdom + fake worker would silently pass the test even with the bug reintroduced
- `family-view-smooth-diff.spec.ts` reads like an animation visual test from its filename but every assertion is attribute/class presence — cleanly structural
- 9 of the 10 `migrate` specs share the same recipe: ResizeObserver shim + in-process gedcom parse + getBoundingClientRect host stub. once the shim bootstrap lands, migrations are mostly mechanical fixture-load substitutions
- `importViaWizard` is the load-bearing migration cost: every migration needs a "construct tree in-memory from a fixture file" helper. one harness extraction unlocks them all

## phase 1 retro — 2026-05-26

### spec delta

- delivered: 7 named visual-* goldens deleted, 1 hidden visual golden deleted (`portrait-crop.spec.ts`), 13 .png snapshots removed, `tests/e2e/_helpers/visual-mask.ts` removed, 21 remaining non-visual e2e specs classified into 8 keep / 10 migrate / 3 delete with shim-needs column. classification + split decision (10 > 8 → 1b/1c) written to `log.md`. lint/typecheck/tests all green
- missed / deferred: none for phase 1; the 3 `delete (covered)` specs do not get removed in phase 1 (they're deleted as part of phase 1c — after the migrations land they become redundant, but until then their `delete` classification is a directive, not a removal)
- extra: discovered `portrait-crop.spec.ts` was a visual golden in disguise (no `visual-*` prefix) — bonus deletion not in the DoD wording but obviously in scope

### surprises

- assumption: 19 non-visual e2e specs to classify → reality: 22 (or 21 after pulling out the hidden visual golden); plan note was stale → delta: cosmetic; classification scaled fine
- assumption: probably 3-5 specs will migrate, 12-15 keep, rest delete → reality: 10 migrate, 8 keep, 3 delete → delta: migration burden in phase 1b/1c is larger than originally feared but consolidates into one shared recipe; the split decision was the right call
- assumption: classification would surface a wide variety of jsdom blockers → reality: 9 of 10 migrations need the *same* shim trio (ResizeObserver + getBoundingClientRect host stub + in-process gedcom parse helper); phase 1b's shim bootstrap is a single small commit, then phase 1c is ~6 mechanical ports → delta: phase-cost estimate goes down, not up
- assumption: parallel subagents would produce inconsistent classifications → reality: classifications were internally consistent and even called out the same patterns (`importViaWizard` as load-bearing, debug specs as `data-testid`-heavy) → delta: trust the parallel-classify pattern for future audits
- assumption: `inspector-more-actions-smoke` was a needed real-browser regression test → reality: every assertion is duplicated in `Inspector.test.ts` with the same userEvent driver; the only e2e-only signal (clipboard) is explicitly skipped → delta: confirms a wider pattern — "smoke" e2e specs accumulate when the unit test exists but feels insufficient; the right fix is usually a better unit test, not a parallel e2e
- assumption: deleting 7 visual goldens would shrink e2e runtime materially → reality: not yet visible (we don't run the full e2e suite in phase 1 close; phase-loop step-3 only confirms config still loads) → delta: phase 7 cleanup is the place to surface the actual runtime delta

### residual debt

- 3 `delete (covered)` specs still exist on disk (`family-view-debug-phase5`, `inspector-more-actions-smoke`, `shell`); they get removed at the end of phase 1c once their replacements are confirmed green · routed to phase 1c
- programmatic-gedcom-parse harness needs to be extracted into `tests/component/_harness/` as part of phase 1b's bootstrap slice; absence blocks 9 of 10 migrations · routed to phase 1b first slice
- `portrait-crop` deletion removed the only e2e coverage of the cropper dialog; the open `to-do.md` item "portrait cropper e2e baseline + dark/light visual goldens" already tracks this as deferred work — no new debt
- the `_probes/` cleanup decision from phase 0 still stands; not phase 1's job · already routed to phase 7

### implications for downstream phases

- **phase 1b spec needs to grow:** beyond the shim bootstrap (ResizeObserver + IntersectionObserver + matchMedia), it must also extract a `parseGedcomFixture(path)` helper in `tests/component/_harness/` and a `getBoundingClientRect`-host-stub helper. naming candidates: `loadGedcomFixture.ts`, `mountWithHostRect.ts`. plan-revise edits phase 1b accordingly
- **phase 1c can be largely mechanical:** 9 specs all use the same recipe; budget ~30min/spec assuming the bootstrap is clean
- **phase 5 hyperbolic parity matrix:** the same shim bootstrap that unblocks phase 1b's migrations also lets the phase-5 hyperbolic cells re-evaluate. confirmation that the plan-revise revision was correctly framed
- **phase 7 docs pass:** add a "playwright is browser-only by design — the residual 8 specs all have a clearly-named real-browser reason in their top-of-file comments" note to `notes/dev/test-strategy.md`; helps future contributors avoid re-classifying them on a casual read

## revision after phase 1 — 2026-05-26

- phase 1b (jsdom test-infrastructure bootstrap): **revise** — split into 3 enumerated slices (global shim bundle, `loadGedcomFixture`, `mountWithHostRect`) instead of "shim bootstrap + migrate"; the migrations themselves are now phase 1c's job
- phase 1c (migrate eligible e2e to jsdom): **insert** (formally; was implicit in the original "phase 1b if migrate>8" rule). 10 migrations to port, ordered by recipe uniformity: 4 family-view-debug → 5 family-view-interaction → 1 import-edit. each landing also removes its `delete (covered)` siblings when applicable
- phases 0, 2, 3, 4, 5, 6, 7: unchanged
- one closed: engine-picker disposition was confirmed `keep (browser-only)` in phase 1 classification — moved from open to closed in `bugs.md`

## starting phase 1b — 2026-05-26

- worktree kept; same branch
- parent: phase 1 close @ `4c833ad`
- DoD: 3 slices — global shim bundle in `apps/web/tests/setup.ts`; `loadGedcomFixture(path) -> Tree` in `tests/component/_harness/`; `mountWithHostRect(component, props)` in `tests/component/_harness/`. smoke test mounts `FamilyViewCanvas` against a fixture loaded via the helpers, fully in jsdom, asserts ≥1 structural property. `hyperbolic-mount.probe.test.ts` baseline reframed or deleted. all tests green.

## phase 1b retro — 2026-05-26

### spec delta

- delivered: all 3 slices + smoke test landed clean. shim bundle in `setup.ts` (idempotent guards). `loadGedcomFixture(path)` supports both `.ged` and `.gdz` (more than required — bonus). `mountWithHostRect(Component, options)` extracted from auto-fit-suppression pattern. smoke test: 4 assertions against `Inbred Family.gdz` mounted through the full helper chain, all green. probe deleted (`hyperbolic-mount.probe.test.ts`) — its observation is fully captured in `test-strategy.md` and the shim invalidates its assertion
- missed / deferred: none
- extra: smoke spec is 4 tests not 1 (more comprehensive baseline coverage); `.gdz` support in the loader (was scoped as `.ged`-only with `.gdz` as future); idempotent shim guards (safer than direct assignment)

### surprises

- assumption: 3 slices = 3 separate edit sessions → reality: subagent landed all 3 + smoke in one ~10-min run; lower friction than expected → delta: phase 1c's 10 migrations may also flow faster than the 30min/spec estimate
- assumption: `mountWithHostRect` would be a thin extraction → reality: it stayed thin (auto-fit-suppression pattern was already clean enough to lift verbatim) → delta: ergonomics validate the harness pattern
- assumption: deleting `hyperbolic-mount.probe.test.ts` would lose information → reality: `test-strategy.md` already captures the observation; the probe was indeed pure baseline noise → delta: phase 7 _probes cleanup may follow the same logic — likely delete all 3 probes

### residual debt

- with shims live, `auto-fit-suppression.test.ts` no longer needs its local ResizeObserver shim — could be simplified · low-priority cleanup; not a regression, defer to phase 7
- `_probes/chrome-geometry-approach-a` + `_probes/chrome-geometry-approach-b` still exist as decision-documentation; same considerations apply as the deleted probe (test-strategy.md likely sufficient) · already routed to phase 7

### bug-triage delta

- 0 new bugs from phase 1b
- carrying forward: 5 open items routed (hyperbolic shim done in this phase but the broader hyperbolic-mounts-cleanly item stays open until phase 5 actually mounts it end-to-end; gedcom-fixture loader done; covered-specs-still-on-disk → phase 1c; _probes/ cleanup → phase 7; smoke-spec meta-observation → defer)

### plan-revise

- phase 1b: **valid** (just closed)
- phase 1c: **valid** — the helpers it depends on are now in place; spec is unchanged
- phase 5: minor implicit narrowing — the "after phase 1b shim lands, re-evaluate hyperbolic cells" hook can now fire any time after this commit
- phase 7: add to checklist — drop the now-redundant local ResizeObserver shim from `auto-fit-suppression.test.ts`

## starting phase 1c — 2026-05-26

- worktree kept; same branch
- parent: phase 1b close @ `e3fa7ad`
- DoD: migrate 10 e2e specs to jsdom using phase-1b helpers; delete each playwright original after the migrated counterpart is green; also delete `family-view-debug-phase5.spec.ts`, `inspector-more-actions-smoke.spec.ts`, `shell.spec.ts` (the 3 `delete (covered)` specs from the phase-1 classification table). `pnpm -F web exec vitest run tests/component/` green; lint + typecheck clean.

## phase 1c retro — 2026-05-26

### spec delta

- delivered: 10 of 10 migrations landed (4 debug + 5 interaction + 1 import-edit). 3 `delete (covered)` specs deleted. 13 playwright specs removed; 10 new component tests + 1 harness (`ImportEditHarness.svelte`) added. component suite: 174 + 1 skipped across 31 files (was 141 + 1 across 22 files after phase 1b)
- missed / deferred: none
- extra: import-edit migration swapped TreeCanvas → FamilyViewCanvas in its harness because TreeCanvas spawns a Web Worker that jsdom doesn't implement. structural assertions hold (engine-agnostic surface). documented in the harness header

### surprises

- assumption: 9 of 10 migrations would land mechanically with the same recipe → reality: confirmed; the only deviation was import-edit's engine swap which was a 10-line judgment call → delta: phase-1c estimate of "30min/spec" held; the parallel-orchestrate pattern with 3 subagents finished in ~15 minutes wall time
- assumption: subagents would produce lint/typecheck-clean output → reality: 4 lint errors + 5 typecheck errors slipped through (untyped arrow params + non-null narrowing gaps + stale type cast); fixed inline in ~5 min → delta: build wave should include "run lint + typecheck before reporting done" as an explicit DoD line. add to the subagent prompt template
- assumption: TreeCanvas could be mounted via the helpers → reality: Worker dependency makes it jsdom-hostile; FamilyViewCanvas remains the jsdom-friendly canvas of choice → delta: phase 5 parity-matrix layered-engine cells may need to use FamilyViewCanvas as a stand-in or mark themselves expectedSkip; flag for phase 5 plan-revise
- assumption: prettier would auto-pick up new file formatting → reality: subagents left small prettier drift in 7 files; `pnpm exec prettier --write` cleared it in one pass → delta: minor housekeeping; the existing prettier setup already catches it

### residual debt

- 5 sibling-subagent typecheck/lint cleanups (already fixed inline; no remaining work) · closed
- TreeCanvas + Worker incompatibility surfaces in phase 5 — parity matrix may need to use FamilyViewCanvas as a stand-in for layered-engine cells · routed to phase 5 in the revision below
- `_probes/` cleanup decision still open · phase 7
- the `notes/examples` symlink is being committed to the phase branch because gitignore matches `notes/examples/` (with trailing slash) but the entry is a symlink; per-commit `git rm --cached` workaround landed in `e3fa7ad` · low priority cleanup; project gitignore could be tightened in a separate change

### bug-triage delta

- 0 new bugs from phase 1c (all subagent-introduced issues were caught and fixed in-phase; not real bugs)
- carrying forward: 3 open items (HyperbolicCanvas end-to-end → phase 5; `delete (covered)` specs all done; _probes/ cleanup → phase 7; smoke-spec meta-observation → defer)

### plan-revise

- phase 1c: **valid** (just closed)
- phase 2: **valid** (chrome-geometry expansion; template is proven)
- phase 3: **valid** (selection state-machine expansion; skeleton proven)
- phase 4: **valid** (auto-fit suppression expansion; skeleton proven)
- phase 5: **revise** — TreeCanvas + Worker issue means the layered-engine column may need to substitute FamilyViewCanvas-as-stand-in or mark cells expectedSkip; matrix harness already handles `expectedSkip` rationale, so the change is in the spec wording
- phase 6: **valid** (keyboard-reachability + toggle-indicator expansion)
- phase 7: **valid** (docs + cleanup)

## revision after phase 1c — 2026-05-26

- phase 5 (parity matrix): **revise** — layered-engine column gets the same treatment as hyperbolic. TreeCanvas's Web-Worker dependency means full-engine mount under jsdom isn't possible without a Worker mock. spec wording: "for any engine that can't mount cleanly in jsdom, the matrix may either (a) substitute the closest jsdom-mountable canvas (e.g. FamilyViewCanvas as a stand-in for layered when the capability is engine-agnostic) or (b) mark the cell `expectedSkip` with a rationale referencing the Worker / canvas2d / engine-specific blocker." both modes count as covered
- phases 0-4, 6, 7: unchanged

## starting phase 2 — 2026-05-26

- worktree kept; same branch
- parent: phase 1c close @ `0a2e76d`
- DoD: chrome-geometry suite covers 6 surface classes — menu, dropdown/picker (already covered by phase-0 skeleton), popover, toast, dialog, context-menu. one assertion per surface using the same `elementFromPoint`-stub pattern from `chrome-geometry-picker.test.ts`. each suite asserts pointer dispatch at the center of every interactive child lands on the surface (or its child), not on a stacking-context-trapping sibling. green; lint + typecheck clean.

## phase 2 retro — 2026-05-26

### spec delta

- delivered: 5 new chrome-geometry specs landing 21 new test cases (menu 3 + popover 3 + toast 3 + dialog 7 + context-menu 5). The picker spec from phase 0 + these 5 = 6 surface classes covered. Wave A extracted a shared helper (`tests/component/_harness/stackingContextHitTest.ts`) with `setRect`, `makeStackingAwareElementFromPoint`, `captureElementFromPoint`; wave B reused it. component suite: 195 + 1 skipped across 36 files (was 174 + 1 across 31)
- missed / deferred: none
- extra: shared `stackingContextHitTest` helper (the in-spec inlining trade-off resolved toward extraction once 5 specs would need it)

### surprises

- assumption: wave-A subagent reports would all be reliably accurate → reality: wave A reported "all gates green" while wave B (running gates concurrently) saw wave A's specs mid-write with 2 toast failures + 3 menu typecheck errors → delta: the parallel-subagent gate-running pattern produces transient false readings; main thread should always re-verify before declaring phase done. Cost was 1 verification run; not severe
- assumption: each surface would need its own custom rect-mock + elementFromPoint setup → reality: 4 of 5 surfaces use exactly the same stacking-context-hit-test recipe; extraction was the right call → delta: phase 7 docs should call out the helper as the canonical chrome-geometry primitive
- assumption: toast assertion would be straightforward "menu wins when both visible" → reality: required modeling the `pointer-events-none` container + `pointer-events-auto` body pattern correctly in the elementFromPoint stub. landed cleanly but took the wave-A subagent the most thought of any single surface

### residual debt

- 0 net new debt from phase 2 (wave-A transient issues were self-resolved by the time main thread verified)
- carrying forward: HyperbolicCanvas end-to-end → phase 5; `_probes/` cleanup → phase 7; smoke-spec meta-guideline → phase 7

### bug-triage delta

- closed: 3 important items (engine-picker disposition; `delete (covered)` specs; wave-A transient errors)
- 0 new bugs

### plan-revise

- phases 3-7: **valid** — no spec changes triggered by phase 2's surprises
- phase 7 docs pick up a small extra: document `stackingContextHitTest.ts` as the canonical chrome-geometry primitive

## revision after phase 2 — 2026-05-26

- phase 7 (docs + ci cleanup): minor addition — document `tests/component/_harness/stackingContextHitTest.ts` as the canonical helper for chrome-geometry tests in `notes/dev/test-strategy.md` and `notes/features/test-invariants.md`
- phases 3-6: unchanged

## starting phase 3 — 2026-05-26

- worktree kept; same branch
- DoD: selection state-machine spec covers 5 more entry points beyond the phase-0 palette skeleton — canvas click, context menu, more-actions menu, deep-link (selection persisted to URL or restored from one), reload (selection persisted to localStorage and restored on hydrate). invariant per entry: `selectionStore.get() === id ∧ inspector.header text contains person(id).displayName`. real stores + jsdom-mounted shells; mocks only as last resort with documented rationale. green; lint + typecheck clean.

## phase 3 retro — 2026-05-26

### spec delta

- delivered: 5 of 5 entry-point specs landed green (canvas-click, context-menu, more-actions, deep-link, reload). 29 assertions across them. component suite: 205 + 1 skipped across 38 files (41 including harness/probes)
- missed / deferred: none
- extra: 2 reframings (context-menu was split into open-doesn't-mutate + item-click-mutates; deep-link reframed from URL-fragment to localStorage-prefill since the project has no URL-fragment selection mechanism). more-actions reframed from "drives selection" to "must NOT clear selection" — accurate complement-invariant

### surprises

- assumption: each entry point would map to one straightforward assertion → reality: 3 of 5 needed reframings because the project's actual selection wiring differs from the plan's mental model (no URL fragment; context-menu open doesn't mutate; more-actions doesn't mutate selection at all) → delta: the reframings made the tests *more* precise about what the entry-point actually contracts; no loss of coverage. plan was working from a too-uniform mental model
- assumption: the reload test would need full `App.svelte` mount → reality: subagent modelled App's `$effect` as an explicit `selectAndPersist` pair (because vitest `*.test.ts` glob excludes `.svelte.ts`); rationale documented inline → delta: hits the boundary of "test the wiring" vs "test the data contract"; acceptable for a skeleton, but phase 7 docs should note the pattern

### residual debt

- 0 new debt
- carrying forward: HyperbolicCanvas end-to-end → phase 5; `_probes/` cleanup → phase 7; smoke-spec guideline → phase 7; `selectAndPersist`-vs-`$effect` modelling note → phase 7

### plan-revise

- phases 4-7: **valid**

## starting phase 4 — 2026-05-26

- worktree kept; same branch
- DoD: auto-fit-suppression contract spec covers 8 more FamilyViewCanvas handlers beyond the phase-0 `+` expand skeleton — badge click, picker show-alongside, picker hide-alongside, picker primary swap, secondary-union collapse, focus change, palette jump, host resize. each row asserts: user-driven action → `suppressNextFit` set → on next bbox-change tick the fit-to-view path is NOT invoked; system-driven (focus change, palette jump, host resize) → fit DOES fire. table-driven structure. green; lint + typecheck clean.

## phase 4 retro — 2026-05-26

### spec delta

- delivered: 8 of 8 handler rows landed (5 user-driven + 3 system-driven). component suite: 214 tests across 42 files (209 passed + 4 expected-fail + 1 skipped)
- missed / deferred: none
- extra: 4 `it.fails` rows that lock in **real production bugs** the contract tests surfaced — these are the contract tests doing their job. Bugs routed to `bugs.md` for separate triage; fixes are out-of-scope per the plan ("fixing any open bug in notes/bugs.md (separate batch via parallel-orchestrate)")

### surprises

- assumption: 8 handlers would have 8 passes → reality: only 4 user-driven and 3 system-driven were tested; 3 of those are broken in production and 1 system-driven (host resize) is also broken. Tests use `it.fails` to lock in the broken state until someone fixes it → delta: this is exactly the success measure the plan defined — "re-running the suite against historical commits, ≥80% reproduce as failures pre-fix." Here we're catching active bugs, not just historical ones
- assumption: picker primary swap would be broken too → reality: passes today because `multi-union.ged` is shape-symmetric so the bbox stays invariant; an asymmetric fixture would expose the same yank → delta: documented inline; flagged as a latent bug in `bugs.md`
- assumption: host resize would be testable but tricky → reality: tests cleanly via direct ResizeObserver-callback invocation; the bug exposed is in the fit-effect's key (omits hostW/hostH) → delta: structural-invariant approach is more powerful than expected at surfacing the *root cause* not just symptoms

### residual debt

- 4 `it.fails` rows in `auto-fit-suppression-handlers.test.ts` will flip to passing once the 3 underlying FamilyViewCanvas bugs are fixed in a separate batch — the test changes are zero, just remove `it.fails`
- carrying forward: HyperbolicCanvas e2e → phase 5; `_probes/` cleanup → phase 7; smoke-spec guideline → phase 7

### plan-revise

- phases 5-7: **valid**

## starting phase 5 — 2026-05-26

- worktree kept; same branch
- DoD: per-engine parity matrix covers 9 capabilities × 3 engines (layered, family-view, hyperbolic), with `expectedSkip` cells carrying non-empty rationale. capabilities: stats-pill mount (done in phase 0 skeleton), debug-pill mount, debug-toggle availability, edge stroke width at low zoom, fit-respects-chrome, cursor-on-card, selection-clears-on-empty-click, arrow-key-pan, semantic-100% zoom. layered cells may substitute FamilyViewCanvas-as-stand-in for engine-agnostic capabilities (per phase-1c discovery: TreeCanvas has Worker dependency); hyperbolic cells default `expectedSkip` per phase-0 probe but re-evaluate now that shim bootstrap has landed. matrix harness asserts every `expectedSkip` cell has a non-empty rationale string. green; lint + typecheck clean.

## phase 5 retro — 2026-05-26

### spec delta

- delivered: 8 new capability rows × 3 engines = 24 cells (plus the 3 from phase-0 stats-pill = 27 total cells in the matrix). 11 live cells, 16 expectedSkip-with-rationale. 8 of 9 capabilities have ≥1 live cell. component suite: 235 + 4 expected-fail + 16 skipped = 255 tests across 45 files
- missed / deferred: none
- extra: 2 re-probe files added (`_probes/hyperbolic-mount.probe.test.ts` re-instated; `_probes/tree-canvas-mount.probe.test.ts` new). hyperbolic now mounts cleanly under the phase-1b shim — major win. one real bug logged in `notes/bugs.md` (HyperbolicCanvas duplicate-keyed-each entries; subagent went slightly outside the plan's bugs.md scope to log it in the project's canonical bug log — useful and correct)

### surprises

- assumption: hyperbolic would still fail after the shim — needed canvas2d + rAF shims → reality: it mounts cleanly with just the phase-1b shims. The blockers were ResizeObserver-only → delta: phase 5's hyperbolic cells went from "all skip" to "live where the capability is engine-agnostic, skip where the engine genuinely lacks the feature" — much more useful coverage
- assumption: layered cells could mostly substitute FamilyViewCanvas → reality: layered cells are mostly `expectedSkip` because the App-level mount (debug-pill, debug-toggle) requires the full App.svelte tree which pulls in the Worker. Substituting FamilyViewCanvas tests "the family-view's debug-pill works" which is family-view's row, not layered's → delta: the stand-in strategy works for engine-agnostic *invariants* but doesn't bypass the engine boundary for engine-*specific* mounts. plan-revise narrowing is correct
- assumption: hyperbolic cells with "no [feature]" rationale would feel like coverage gaps → reality: they document the actual engine contract differences (hyperbolic intentionally uses Möbius transforms not euclidean scale, so "semantic-100% zoom" is engine-undefined for hyperbolic). These skips are *positive* documentation of intentional engine differences, not regressions

### residual debt

- 1 real bug logged in `notes/bugs.md` (HyperbolicCanvas duplicate keyed-each on Inbred Family.gdz) — out-of-scope to fix here; project triage owns it
- 2 `_probes/` files reinstated (now 4 total in `_probes/`) — phase 7 cleanup decision becomes more urgent
- carrying forward: `_probes/` cleanup → phase 7; smoke-spec guideline → phase 7

### plan-revise

- phases 6, 7: **valid**

## starting phase 6 — 2026-05-26

- worktree kept; same branch
- DoD: (a) keyboard-reachability sweep covers `DateInput` (phase-0 skeleton), gender field, AGAB field, parent picker, portrait field — each tab-into, printable-key, escape; (b) toggle-indicator visible-state covers every `[role="menuitemcheckbox"]` and `[aria-pressed]` in mounted menus (the phase-0 skeleton covered one tri-state toggle); assert computed-style or attribute-based delta between on/off states. green; lint + typecheck clean.

## phase 6 retro — 2026-05-26

### spec delta

- delivered: 5 new specs (4 keyboard-reachability + 1 toggle-sweep), 21 new assertions, 4 new harnesses (Gender/Agab/ParentPicker/PortraitField). 10 distinct toggles enumerated and swept; all show a visible state delta (no regressions of the historical `e9ea981`/`73a9a53` bugs)
- missed / deferred: none
- extra: the sweep reframed from "every `[role="menuitemcheckbox"]` and `[aria-pressed]`" to "every entry in `commands.ts` with a `checked` callback" — the actual menu uses `role="menuitem"` with tri-state icons, not the aria semantics the plan assumed. The subagent documented this and chose the registry as the canonical source (correct choice)

### surprises

- assumption: menu items use `role="menuitemcheckbox"` → reality: project uses `role="menuitem"` with a trailing lucide tri-state icon (Check vs Square) → delta: the assertion was reframed to compare lucide-* class sets on the icon slot, which is a tighter regression-pin than the aria attribute would have been
- assumption: portrait field would need a file-picker mock → reality: portrait field's reachability invariant doesn't depend on the file picker firing; the region-level + activate-key assertions hold without it → delta: stayed within jsdom, didn't need any new infra
- assumption: 4 form-field reachability specs would need 4 different harness shapes → reality: 4 small harness components, all the same shape (one sandwich pattern repeated). Could be consolidated to a single `FieldHarness` generic in phase 7 if it ever becomes a maintenance burden; for now, separate harnesses are clearer per-field

### residual debt

- 4 new field-harness components add to the harness inventory; phase 7 may decide to consolidate if a pattern emerges
- carrying forward: `_probes/` cleanup (now 4 files) → phase 7; smoke-spec guideline → phase 7

### plan-revise

- phase 7: **valid** (the work it needs to do is now well-scoped)

## starting phase 7 — 2026-05-26

- worktree kept; same branch
- DoD: (1) `notes/agents.md` testing-layout section reflects the post-plan shape; (2) `notes/features/test-invariants.md` written as the canonical reference for the 6 invariant suites; (3) `_probes/` cleanup decision applied (fold lessons into `test-strategy.md` then delete, or keep — pick one and execute); (4) document `stackingContextHitTest.ts` as the canonical chrome-geometry primitive in `test-strategy.md`; (5) note the `selectAndPersist` vs `$effect` modelling pattern; (6) drop the redundant local ResizeObserver shim from `auto-fit-suppression.test.ts` now that the global is live; (7) update `pnpm test:e2e` script if any browser-only project becomes empty (8 e2e specs remain, all browser-only). green; lint + typecheck clean.

## phase 7 retro — 2026-05-26

### spec delta

- delivered: all 7 sub-items. agents.md §6 rewritten (~+180 words). `notes/features/test-invariants.md` written (~125 lines, 4 sections + see-also + metadata). 4 `_probes/` files deleted; observations folded into `notes/dev/test-strategy.md` under a new probes-summary section. `stackingContextHitTest.ts` documented in test-strategy. `selectAndPersist` vs `$effect` pattern documented. local ResizeObserver shim dropped from `auto-fit-suppression.test.ts`. `pnpm test:e2e` config verified unchanged-by-design
- missed / deferred: none
- extra: also corrected the stale "hyperbolic blocked" section in test-strategy to reflect the phase-5 reality (mounts cleanly under shims); added a new "tree-canvas blocked (Worker)" section paralleling it

### surprises

- assumption: docs work would shake loose more bugs → reality: clean run; the bugs were all surfaced earlier (phase 4's 3 in FamilyViewCanvas + phase 5's 1 in HyperbolicCanvas). Final state: 4 it.fails plus 1 project-level bug logged, 0 new in phase 7
- assumption: dropping the auto-fit local shim might break the test → reality: works fine; the global shim covers it. Confirmation that the phase-1b global was a clean substitute → delta: phase 1b's idempotent guards (which initially looked like over-engineering) paid off — the global and local shims composed without conflict
- assumption: `pnpm test:e2e` script might need surgery → reality: playwright config globs `./tests/e2e`, so deleting specs is transparent. No infra changes needed → delta: the e2e shrinkage from 28 → 8 specs happened entirely through file deletions; no config debt

### residual debt

- 4 `it.fails` rows in `auto-fit-suppression-handlers.test.ts` (3 FamilyViewCanvas bugs surfaced in phase 4) — out-of-scope to fix in this plan; remain locked in by the contract tests until a separate batch addresses them
- 1 bug in `notes/bugs.md` (HyperbolicCanvas duplicate keyed-each surfaced in phase 5) — already logged in the project's durable tracker
- pre-existing markdownlint MD049 warnings on unrelated agents.md lines — not introduced by phase 7

### plan-revise

- the plan is **complete**. all 7 phases (0, 1, 1b, 1c, 2, 3, 4, 5, 6, 7) closed. next step is `ship-readiness` against the full plan, then `pre-merge` if it returns `ship`
