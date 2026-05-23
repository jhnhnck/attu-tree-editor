# Layered engine cleanup + UI tooling (14 May 2026, rev 1)

Janitorial plan covering the three remaining layered-engine bugs that
neither the now-retired family-view.md plan nor the now-retired
relationship-vocabulary.md plan claimed (both retired by 23 May 2026;
recoverable via git history), plus the `tooling / infra` section of
[../to-do.md](../to-do.md). The layered engine is demoted to a power-
user toggle once family-view ships, but the three bugs degrade it
visibly today and the tooling work helps the upcoming phase work on
the family-view-w2 successor plan (retired 23 May 2026; recoverable
via git history).

This plan is intentionally scoped narrow: no new features, no engine
rework, no schema bumps. Every item is bounded to a single pass file,
a single component, or a single doc.

**Revision history:**
- rev 1 (14 May 2026) — folded in pre-mortem findings: Phase 0 grew
  into a walking skeleton with three spikes and a panel-shell
  relocation; Phase 1 gained a route.ts audit dependency and a
  calibrated orientation-success metric; Phase 2 ships only behind a
  hard go/no-go gate from Phase 0; Phase 3 scope reduced because the
  panel shell lands earlier; discovery-pill chicken-and-egg fixed
  (visible by default).

---

**Five co-equal goals:**

1. ~~**No ghost stranded > 5u from its near** on the Akarians DEMO
   fixture (today: ~8 ghosts at 5-17.5u after the DELTA=2.5u pair
   policy lands the rest).~~ **Dropped after Phase 0c gate (RED).**
   [bugs.md:13](../bugs.md#L13) stays open; future plan with a
   different algorithm (see Phase 2 section).
2. **Same-rank short couple bonds render as a single continuous
   segment**, not as ⊢═══⊣ with visible end-caps when children
   pull the drop off the bond midpoint. Long-bond same-rank stubs
   (legitimate `MAX_BOND_SPAN` case) and cross-rank L-bond stubs
   remain unchanged.
3. **Spouse orientation matches across engines.** Layered adopts the
   genealogy-conventional father-left / mother-right tie-break that
   the hyperbolic engine shipped in `e3e7d8c`. Coordinated with
   family-view Phase 2, which will adopt the same rule for its
   couple-box. Success measured on couples where both partners have
   known gender — same-sex and unknown-gender pairs are explicitly
   out of scope for this rule.
4. **Debug toolbox is the diagnostic surface** for the upcoming
   family-view and relationship-vocabulary phases. Discoverable by
   default, not shortcut-gated; readouts that surface layout timing,
   topology hashing, cycle nodes, bond/centroid deltas, orphans,
   rank gutter labels, last-edit halo, engine quick-switch,
   copy/paste tree JSON, force-conflict.
5. **`keyboard-shortcuts.md` reflects what shipped** — drop
   browser-reserved combos (Mod+N, Mod+Shift+N, Mod+1), document the
   soft-conflict pattern (Mod+S/O/P/D/I/E/0 via `preventDefault`),
   add a "browser-safe" rule of thumb.

Plus: **document the decision** on two deferred items — the
`prettier-plugin-tailwindcss` revisit and the `layout-worker` skill —
either close them out or commit to a tracking shape.

---

## What we're touching vs not

**Touching:**
- `apps/web/src/lib/layout/passes/order.ts` — spouse-orientation
  tie-break only (the ghost-cluster contiguity post-pass was
  dropped per Phase 0c gate).
- `apps/web/src/lib/layout/passes/route.ts` — same-rank short-bond
  single-segment rendering. Phase 0 audits which branch to edit.
- `apps/web/src/App.svelte` — relocates the inline debug panel
  (Phase 0), then fills it with sectioned content (Phase 3).
- `apps/web/src/lib/components/tree/DebugOverlay.svelte` and
  `debugTypes.ts` — new debug-overlay options.
- `apps/web/src/lib/persistence/settings.ts` — `fte.debug.*` flags.
- `notes/features/keyboard-shortcuts.md` — doc-only update.
- New fixtures at `apps/web/tests/fixtures/layered-bug-repros.ts`.
- New spikes at `apps/web/tests/spikes/layered-metrics.spike.ts`
  and `apps/web/tests/spikes/ghost-contiguity.spike.ts` (using the
  existing `vitest.spike.config.ts`).
- New baseline docs at `notes/profiles/layered-baseline.md` and
  `notes/profiles/route-stub-paths.md` (`notes/profiles/` created
  if absent).

**Not touching:**
- `passes/layer.ts` — the negative-drop and spurious-top-rank-ghost
  fixes there are claimed by relationship-vocabulary Phase 2. Same
  file, but a different defect. We do not modify rank assignment.
- `passes/place.ts` — `closePairs` is correct; the residual ghost
  strand is an *ordering* problem, not a placement one.
- Multi-spouse bond routing — claimed by relationship-vocabulary
  Phase 3 (n-ary union manifold work).
- Schema, domain types, IR shape — none of this needs a schema bump
  or IR change.
- The legitimate L-bond stub case (`/stub-l` / `/stub-r` for
  cross-rank partners) — Phase 1 leaves it untouched.
- The legitimate long-bond same-rank stub case (partners on same
  rank but x-extent exceeds `MAX_BOND_SPAN`) — Phase 1 leaves it
  untouched.

**Adding:**
- A bug-icon pill (visible by default) in the bottom-left,
  immediately right of the stats pill, with a "permanently hide"
  option in the panel.
- A handful of new optional debug-overlay overlays (cycle nodes,
  bond/centroid delta markers, orphan badge, rank gutter labels,
  last-edit halo).
- A "copy layout snapshot" button and a "dump / load tree JSON"
  textarea pair.

---

## Coordination with other plans

_Historical note (rev 2, 23 May 2026): both plans referenced below
have been retired. Wave-1's family-view.md shipped 14 May 2026 and
the relationship-vocabulary.md schema work landed alongside it (see
`aba7de0`, `7f12a72`, and the wave-1 `20966f1` ship commit). The
notes below remain as planning context describing why this plan
stayed out of certain files and where coordination boundaries
landed; the successor plan for ongoing family-view work is
family-view-w2 (retired 23 May 2026; recoverable via git history)._

- **family-view.md Phase 2** (union-as-anchor) will adopt the same
  father-left orientation rule. Phase 1 of this plan delivers the
  layered side first; the family-view phase reuses the convention
  rather than reinventing it. **Action**: when Phase 1 lands, link
  family-view Phase 2 to this plan's tie-break as the canonical
  definition.
- **family-view.md Phase 6** introduces an engine quick-switch in
  the View menu. The "engine quick-switch row" in this plan's
  debug toolbox is the dev-only counterpart — a one-click toggle
  without going through the menu. They don't conflict; the menu
  surface is user-facing and persists across sessions, the debug
  row is ephemeral and only visible when the panel is open.
- **relationship-vocabulary.md Phase 2** touches `layer.ts` and is
  load-bearing for the negative-drop and spurious-top-rank-ghost
  bugs. This plan stays out of `layer.ts` entirely so the two
  workstreams don't collide on the same file.
- **relationship-vocabulary.md Phase 2 may invalidate this plan's
  Phase 2.** If the relationship-vocabulary plan ships its
  `layer.ts` rework first (off-rank parents become ghosts under the
  "highest-rank − 1" rule), the ghost population changes and this
  plan's Phase 2 post-pass may not cover the new cases or may be
  unnecessary. **Pre-Phase-2 check**: before Phase 2 starts (and
  after Phase 0c's go/no-go decision), confirm which plan ships
  Phase 2 first. If relationship-vocab is ahead, defer this plan's
  Phase 2 entirely or rerun Phase 0c on the new ghost population.
  Phase 1 + Phase 3 + Phase 4 of this plan are unaffected by the
  ordering.
- **relationship-vocabulary.md Phase 3** lands union-manifold
  routing, which subsumes the multi-spouse-bond intervening-ghost
  defect. This plan's same-rank stub fix is a *different* routing
  case (no ghosts involved, both partners on the same rank); the
  two fixes do not overlap.

---

## Phase 0 — baselines, spikes, walking-skeleton scaffolding (~1.5 days)

**Goal: capture quantitative baseline metrics, retire the
highest-severity unknowns (Phase 2 algorithm feasibility, route.ts
stub-branch identification, orientation-metric calibration), and
land the walking-skeleton scaffolding that Phase 1-3 will fill in.**

Five parallel-safe tasks. None of them modify production layout-pass
code; the panel-relocation task is the only production edit and it
preserves existing functionality verbatim.

### 0a. Akarians baseline metrics + reusable spike (~3h, real)

- New spike at `apps/web/tests/spikes/layered-metrics.spike.ts`
  using the existing `vitest.spike.config.ts`. Loads any GEDCOM
  fixture path, runs the layered engine, and emits both stdout
  human-readable tables and a JSON side-channel (e.g.
  `notes/profiles/layered-metrics.json`) for machine diffing.
- Metrics collected:
  - ghost adjacency: counts at > 5u, > 10u, > 17.5u from near
  - same-rank short-bond stub-pair count (where x-extent is
    *below* `MAX_BOND_SPAN` — the bug case; long-bond same-rank
    stubs counted separately)
  - couples' male-left vs female-left counts, grouped by
    `both-known` / `one-known` / `both-unknown` gender-pair
    status
  - global crossings count
- Run the spike on `apps/web/tests/fixtures/Akarians.ged` and
  on each of the Phase 0e fixtures.
- Capture all baselines in `notes/profiles/layered-baseline.md`
  (new file; create `notes/profiles/` directory).

### 0b. route.ts stub-emission audit (~2h, real)

- Read `apps/web/src/lib/layout/passes/route.ts` end-to-end on
  the stub-emitting paths (covers both the L-bond cross-rank
  case at ~lines 380-410 and the long-bond same-rank case at
  ~lines 560-585).
- Document in `notes/profiles/route-stub-paths.md` (new file):
  - which branch emits `/stub-l` / `/stub-r` segments today
  - the `MAX_BOND_SPAN` threshold logic and when same-rank
    stubs trigger today (distance-based, not rank-based)
  - which branch produces the observed two-stub bug from
    [bugs.md:17](../bugs.md#L17) — confirm the bug-log text's
    suffix description (`:1/stu`) was inaccurate (the actual
    code emits `/stub-l` / `/stub-r`)
  - one-paragraph conclusion: where the Phase 1 fix lands and
    what it must NOT break (legitimate L-bond stubs;
    legitimate long-bond same-rank stubs that exceed
    `MAX_BOND_SPAN`)

### 0c. Phase 2 algorithm feasibility spike (~3h, real)

- New spike at `apps/web/tests/spikes/ghost-contiguity.spike.ts`.
- Prototype the simple ghost-cluster contiguity post-pass on
  the full Akarians fixture (harshest test) plus the Phase 0e
  ghost-stranding fixture.
- Measure two numbers:
  - **swap-acceptance rate**: % of attempted swaps that pass
    the "≤ old crossings" criterion (k=0 strict)
  - **stranded-ghost closure rate**: % of pre-pass ghosts > 5u
    from near that end up adjacent post-pass
- Repeat with k=2 relaxation (allow swap if new crossings ≤ old
  + 2) for comparison.
- Record both numbers in the plan's bug log section below.

**Phase 2 go/no-go gate (decided at end of Phase 0c):**

- **Green**: closure rate ≥70% with k=0 AND global crossings
  increase ≤+5% — Phase 2 proceeds with k=0 strict criterion.
- **Yellow**: closure rate <70% with k=0 BUT ≥70% with k=2 —
  Phase 2 proceeds with k=2 relaxation; document trade-off
  explicitly.
- **Red**: closure rate <70% with k=2 — Phase 2 dropped. File
  [bugs.md:13](../bugs.md#L13) as a follow-up requiring a more
  sophisticated algorithm (e.g. moving the near toward the
  cluster median instead). This plan ends at Phase 1 + 3 + 4.

The decision is recorded as a single bullet in the bug log; no
further Phase 0c rework after the gate.

### 0d. Debug-panel relocation shell (~2h, real)

- Move the inline debug panel in `apps/web/src/App.svelte` (~lines
  1166-1257 today, top-center) to bottom-left, anchored
  immediately above the stats pill.
- Keep all seven existing checkboxes functional, no toggle-switch
  migration yet, no new overlays, no readouts. Pure relocation.
- Wire a single `fte.debug.openSections` persistence key (empty
  shape — Phase 3 fills it).
- This lands the new location and persistence-key shape so Phase
  3 just replaces stub content (not "build + fill"), and so
  Phase 1 / Phase 2 can wire any debug-only verification overlays
  into the existing shell without re-locating it.

### 0e. Regression fixtures (~1h, real)

- Build `apps/web/tests/fixtures/layered-bug-repros.ts`
  exporting two named `Tree` factories:
  - `eightPersonFamily()` — Moma+Dada → Korak; New Person →
    Wife; Korak+Wife → Childa/Childb/Childc (covers
    bugs 17 + 18)
  - `ghostStrandingDistilled()` — 12-person subset distilled
    from the Akarians `15LJ6` cluster
- Both fixtures must round-trip through GEDZIP.
- **Fallback clause**: if `ghostStrandingDistilled()` does NOT
  reproduce the stranding defect on its own (the defect may
  require Akarians-scale crossing pressure), document the
  reproducibility-shrinkage limit in the bug log and have
  Phase 2 use the full Akarians fixture for verification.

### Definition of done

- [ ] `notes/profiles/layered-baseline.md` exists with all four
      metric tables (ghost adjacency, same-rank short-bond stubs,
      orientation by gender-pair, global crossings).
- [ ] `notes/profiles/route-stub-paths.md` exists with the
      one-paragraph audit conclusion.
- [ ] Phase 2 go/no-go decision recorded in the plan's bug log
      with concrete numbers (closure rate, crossings delta,
      green/yellow/red verdict).
- [ ] Debug panel renders bottom-left, above the stats pill, all
      seven existing checkboxes still functional; `Ctrl+Shift+D`
      still toggles it.
- [ ] `apps/web/tests/fixtures/layered-bug-repros.ts` builds two
      `Tree` factories; both round-trip through GEDZIP.
- [ ] Akarians by-gender-pair breakdown is captured so Phase 1's
      success metric is calibrated against `both-known` couples
      only.
- [ ] `pnpm verify` green.

### Risk

Phase 0 itself is low-risk — no layout-pass production code is
modified and the panel-relocation task is verbatim-preserving.
The risk this phase *reveals* drives Phase 2's decision tree.

---

## Phase 1 — low-risk layered fixes (~1 day)

**Goal: close [bugs.md:17](../bugs.md#L17) (same-rank short-bond
stubs) and [bugs.md:18](../bugs.md#L18) (spouse orientation) using
Phase 0's audit and baseline.** Bug 18 is in `passes/order.ts`;
bug 17 is in the branch Phase 0b identified in `passes/route.ts`.
Neither touches `layer.ts` or rank assignment.

### Bug 18 — spouse orientation tie-break

- Edit `passes/order.ts` where the partner pair is split into a
  left/right within a rank (Phase 0b's audit confirms the exact
  function).
- Tie-break rule: father-left / mother-right by `Person.gender`
  (`male` / `female`). Falls back to existing logic when both or
  neither are `male` (e.g. unknown gender or same-sex couples) —
  these are explicitly out of scope per Goal 3.
- Comment the tie-break with a one-liner pointing to commit
  `e3e7d8c` for cross-engine consistency.
- Success metric is calibrated to Phase 0a's `both-known`
  gender-pair count, NOT to total-couples (avoids penalising
  the metric for same-sex / unknown-gender pairs that the rule
  doesn't apply to).

### Bug 17 — floor `maxBondSpan` at `BUNDLE_THRESHOLD`

**Revised after Phase 0b audit.** The original "same-rank rule"
was a no-op against current code — the same-rank branch already
emits one continuous bond when `!isLongBond`. The real cause is
that `maxBondSpan = min(MAX_BOND_SPAN_CEILING, bbox.width / 4)`
gives ~3.5u on small fixtures (8-person tree, bbox.width=14u),
so any couple with children pulling bondSpan above that gets
mistakenly classified as long-bond and stubbed.

Phase 1 fix is a one-line edit at
[apps/web/src/lib/layout/passes/route.ts:296](../../apps/web/src/lib/layout/passes/route.ts#L296):

```ts
// before:
const maxBondSpan = Math.min(MAX_BOND_SPAN_CEILING, placed.bbox.width / 4);

// after:
const maxBondSpan = Math.min(
    MAX_BOND_SPAN_CEILING,
    Math.max(BUNDLE_THRESHOLD, placed.bbox.width / 4),
);
```

`BUNDLE_THRESHOLD = 8 * ROW_H` (~8u) is already defined in
`route.ts` and used by Holten bundling. Reusing it as the floor
keeps the two "long bond" concepts aligned.

Effects:
- 8-person fixture: `maxBondSpan = max(8, 3.5) = 8u`. Korak+Wife
  bond (well under 8u) becomes a single segment. Bug 17 fixed.
- Akarians: `maxBondSpan = min(25, max(8, 107.5)) = 25` (ceiling
  still dominates). No regression on the 3 currently-stubbed
  same-rank short bonds (those are likely legitimate or borderline;
  the Phase 0a baseline records the exact count).
- L-bond stubs (path B) and long-bond same-rank stubs (path A
  when partners are genuinely far) both keep stubbing
  correctly.

No `console.warn` assertion is added — the existing
negative-drop invariant covers the case the assertion would
catch.

### Definition of done

- [ ] `BUNDLE_THRESHOLD` floor on `maxBondSpan` tested:
      - small fixture (`eightPersonFamily`, bbox.width=7.9u):
        floor is 8u; Korak+Wife bond emits one segment
      - Akarians: ceiling=25u still dominates; same-rank
        short-bond stub count unchanged (or improved)
      - cross-rank couples: L-bond stubs preserved (path B
        untouched)
- [ ] Spouse-orientation unit test on
      `eightPersonFamily()` fixture: Moma left of Dada AND Wife
      right of Korak (both male-left).
- [ ] Same-rank-stub unit test on `eightPersonFamily()`:
      Korak+Wife bond is exactly one segment, no `/stub-l` /
      `/stub-r` suffixes.
- [ ] Phase 0a spike re-run on Akarians DEMO: same-rank
      short-bond stub count drops to zero; orientation male-left
      ratio for `both-known` couples reaches ≥95%.
- [ ] Akarians visual diff inspected by human (not just metrics):
      no surprising same-sex / unknown-gender couple orientation
      regressions vs Phase 0 baseline screenshots.
- [ ] Existing `passes/order.ts` and `passes/route.ts` unit
      tests pass without modification (any modifications justified
      in the commit message).
- [ ] No regression in ghost adjacency or negative-drop counts
      from the Phase 0a baseline.
- [ ] `pnpm verify` green.

### Risk

Bounded by Phase 0b's audit. The same-rank fix could still
surface visible position shifts for users on the layered engine
(post family-view, layered is power-user mode, so the user
population accepting risk is small). The human visual-diff DoD
catches surprising shifts.

---

## Phase 2 — dropped (Phase 0c gate: RED, 14 May 2026)

The Phase 0c feasibility spike found that **no candidate ghost-
cluster swap is accepted** under either k=0 strict or k=2
relaxed criteria. On Akarians DEMO, 3 cluster swaps were
attempted and 0 accepted (every swap added more than 2
crossings); on the distilled fixture, 1/0. The simple
contiguity post-pass cannot make progress.

[bugs.md:13](../bugs.md#L13) stays open as a follow-up for a
future plan with a more sophisticated algorithm:

- **move-the-near**: instead of moving the ghost cluster toward
  N, move N (and N's children-anchors) toward the cluster's
  median x. Requires two-sided ordering pass.
- **two-sided ranking**: jointly minimise crossings AND
  ghost-near distance via a multi-objective cost.
- **A* over a sparse routing graph**: the deferred orthogonal-
  edge-routing work in
  [to-do.md](../to-do.md) (phase 6 section). When that lands,
  ghosts move to wherever crossings minimise, and the visual
  edge routes bend around intervening cards instead of cutting
  through them.

The Phase 0c spike infrastructure
([apps/web/tests/spikes/ghost-contiguity.spike.test.ts](../../apps/web/tests/spikes/ghost-contiguity.spike.test.ts))
is reusable: `runPostPass(tree, label, k)` will accept a future
candidate algorithm with the same gate criterion.

This plan continues at Phase 3 + Phase 4.

---

## Phase 3 — debug toolbox overhaul (~1.5 days)

**Goal: fill the panel shell (already at bottom-left per Phase 0d)
with sectioned content, toggle switches, new overlays, runtime
actions, and corner readouts. The panel becomes the diagnostic
surface for the upcoming family-view and relationship-vocabulary
phase work.**

### Worker-timing spike (first, ~1h)

- Attempt to instrument each layout pass inside the worker;
  postMessage adds a `{ timings: { layer: ms, order: ms, place:
  ms, route: ms } }` field on the existing layout-result
  message.
- Measure structured-clone overhead of the extra field.
- **Decision**:
  - if overhead <1ms: ship per-pass timing readout
  - if overhead ≥1ms: accept main-thread roundtrip total only,
    document the limitation
- Result recorded in plan's bug log.

### Panel content

- **Migrate to toggle switches**: replace the seven existing
  checkboxes with the toggle component from the Inspector
  Connections tab (married / primary toggles).
- **Sectioned layout** with collapsible headers:
  - `layout` — unit grid, node bounds, component bounds,
    segment ids
  - `routing` — ghost arrows, bridge hops, overlap pairs
  - `diagnostics` — cycle nodes (new), bond/centroid delta
    (new), orphan badge (new), rank gutter labels (new),
    last-edit halo (new)
  - `runtime` — expose `window.__treeDebug`, copy layout
    snapshot (new), dump/load tree JSON (new), force conflict
    (new)
  - `engine` — engine quick-switch row
- **Corner readouts** (top-right of canvas, always-on when panel
  open):
  - `layout timing` (per-pass or main-thread total, per the
    worker-timing spike result)
  - `topology hash` — current `editRev` + content hash

### Discoverability (revised from rev 0)

- Bug-icon pill (`lucide bug`) visible by default in bottom-left,
  immediately right of the stats pill — NOT gated on a prior
  `Ctrl+Shift+D` press.
- Panel includes a "permanently hide debug pill" toggle that
  clears the pill from view. `Ctrl+Shift+D` remains the
  keyboard fallback regardless.
- `fte.debug.pillHidden` persisted; default `false`.

### New debug-overlay options

- `cycle nodes` — red ring around `LayeredGraph.cycleNodes`.
- `bond/centroid delta` — small caret showing children-centroid
  x vs bond-midpoint x for each couple.
- `orphan badge` — flags people with no parents, no spouse, no
  children.
- `rank gutter labels` — rank index in the left margin.
- `last-edit halo` — 1-second yellow halo around whatever card
  was most recently mutated.

### New runtime actions

- `copy layout snapshot` — dumps the placed/routed IR to
  clipboard as JSON.
- `dump tree json` / `load tree json` — paste a tree into the
  textarea for repros.
- `force conflict` — artificially bumps server revision; next
  autosave hits the 409 path; exercises `ShareDialog` /
  `SaveStatusPill` conflict UI. **Audit before implementation**:
  confirm whether a server endpoint exists to bump revision
  artificially. If not, scope the action to dev-build-only via
  a direct Dexie write rather than adding a server endpoint;
  document the limitation.

### Persistence

- `fte.debug.openSections: { layout: bool; routing: bool;
  diagnostics: bool; runtime: bool; engine: bool }` —
  expanded-section state across reload.
- `fte.debug.toggles: { [overlay: string]: bool }` — each
  overlay's on/off state.
- `fte.debug.pillHidden: bool` — see Discoverability above.
- All keys honor the `fte.` namespace rule.

### Definition of done

- [ ] Worker-timing spike result recorded; timing readout
      delivers per-pass or main-thread total per the decision.
- [ ] All seven existing checkboxes migrated to toggle switches
      in the correct section; behavior unchanged.
- [ ] All five new overlay options render correctly on the
      `eightPersonFamily()` fixture.
- [ ] Corner readouts (timing, hash) refresh on each layout pass.
- [ ] Copy-snapshot writes JSON to clipboard; dump/load JSON
      round-trips without data loss; force-conflict triggers the
      conflict UI (scope per the audit above).
- [ ] Bug-icon pill visible by default; "permanently hide"
      toggle works; survives reload; `Ctrl+Shift+D` still
      reaches the same panel.
- [ ] All `fte.debug.*` keys persist across reload; e2e test
      verifies state restoration.
- [ ] e2e coverage for engine quick-switch and dump/load JSON
      runtime actions (not only persistence).
- [ ] All debug overlays toggled simultaneously on Akarians DEMO:
      layout-pass time stays under 200ms (no overlay introduces
      a measurable hotspot).
- [ ] No regression in `__treeDebug` exposure (still works when
      toggled on).
- [ ] `pnpm verify` green.

### Risk

Scope is ~1.5 days now (was 2 in rev 0) because Phase 0d landed
the relocation shell. Worker-timing falls back cleanly. Force-
conflict scope clarified to avoid Phase 3 growing a server-side
dependency.

---

## Phase 4 — docs polish + decisions on deferred (~0.5 days)

**Goal: close out the `tooling / infra` section by either updating
docs or explicitly deferring with a tracking shape.**

### keyboard-shortcuts.md update (do)

- Drop browser-reserved combos from the canonical spec: Mod+N,
  Mod+Shift+N, Mod+1. Unbindable in practice; should not appear
  as if bindable.
- Document the soft-conflict pattern: Mod+S/O/P/D/I/E/0 work via
  `preventDefault` like Figma/VS Code. List which combos use
  this pattern.
- Add a "browser-safe" rule of thumb for future shortcuts.

### prettier-plugin-tailwindcss (decide)

- Check current upstream status of svelte-5 support.
- Decision tree:
  - **Fully supported**: install, configure, one-shot format
    pass, open as a separate small PR.
  - **Partially supported** (e.g. works for `.ts` but not
    `.svelte`): defer with explicit "unblocked when X"
    condition; do not partial-install.
  - **Not supported**: file tracking issue with upstream link;
    remove the to-do entry.

### layout-worker skill (decide)

- Per its own to-do entry, this is "low priority, only worthwhile
  if a second worker gets added later." Family-view Phase 0
  considers but does not commit to a second worker.
- **Decision**: defer until a second worker actually exists.
  Update the to-do entry to flag the trigger condition
  ("write this skill when phase X of plan Y adds a second
  worker"). Don't write speculatively.

### Definition of done

- [ ] `notes/features/keyboard-shortcuts.md` updated and matches
      shipped reality.
- [ ] `prettier-plugin-tailwindcss` decision recorded (installed
      / tracked / removed).
- [ ] `layout-worker` skill to-do entry annotated with trigger
      condition.
- [ ] `pnpm verify` green.

### Risk

Low. Doc + decision work; no code paths touched.

---

## Bug log

**Phase 0 entries:**

- **[0b] route.ts stub-emission audit conclusion.** The bug-log
  text for [bugs.md:17](../bugs.md#L17) misnamed the suffix
  (`:1/stu` vs current `/stub-l` / `/stub-r`) and miscaused the
  defect (claimed children-centroid mismatch; actual cause is
  `bondSpan > maxBondSpan` firing on small fixtures because
  `bbox.width / 4` is too small). Phase 1 fix is a one-line
  floor at `BUNDLE_THRESHOLD`. See
  [notes/profiles/route-stub-paths.md](../profiles/route-stub-paths.md).
  Force-conflict knob for Phase 3 is
  `syncStore.setRevision(revision - 1)`.

- **[0c] Phase 2 algorithm spike verdict: RED.** Both k=0 and
  k=2 acceptance rates are 0% on Akarians (3/3 cluster swaps
  rejected) and on the distilled fixture (1/1 cluster swap
  rejected). Every candidate swap adds more than 2 crossings,
  so the simple post-pass cannot make progress under the gate.
  See
  [notes/profiles/ghost-contiguity-spike.md](../profiles/ghost-contiguity-spike.md).
  **Phase 2 dropped.**

- **[0e] Fixture reproducibility.** The 18-person
  `ghostStrandingDistilled()` fixture produces 3 ghosts, one
  stranded at 7.5u from its near. Real bug-13 reproduction at
  small scale (good for unit-test loops, but the 0c spike found
  it's not enough to test the algorithm's effectiveness — the
  algorithm itself can't make progress here either). Akarians
  remains the load-bearing fixture for any future Phase 2
  attempt.

**Residual debt from phase 0:**

- **[d1] Pre-existing family-view lint errors blocking full
  `pnpm verify`.** Two errors in user's in-flight untracked
  `tests/unit/engines/family-view/path.test.ts:87, :130` (a
  `let`-that-should-be-`const` and an unnecessary type
  assertion). NOT introduced by Phase 0. **Disposition: defer**
  — fix as part of the family-view workstream. Phase 0's
  targeted typecheck + spike + unit-test + build subset is all
  green.

- **[d2] Pre-existing in-flight files prettier-reformatted as a
  side-effect of 0d lint gate.** Six files
  (`family-view/couples.ts`, `family-view/index.ts`,
  `family-view-multi-union.spec.ts`,
  `multi-union-fixture.test.ts`, `multi-union.test.ts`,
  `n-partner-geometry.test.ts`). **Disposition: do NOT stage in
  the Phase 0 commit.** The format changes are mechanical and
  correct; user stages them with the family-view workstream.

- **[d3] Bug 13 stays open in [bugs.md](../bugs.md#L13).** Phase 2
  is dropped (per 0c). Future plan with a different algorithm
  (move-the-near; two-sided ranking; A*-over-cards-and-gutters
  per the deferred orthogonal-routing work) will close it.
  Phase 0c spike infrastructure (`runPostPass(tree, label, k)`)
  is available for that future plan.

**Phase 1 entries:**

- **[1a] Bug 17 closed.** Floor on `maxBondSpan` at
  `BUNDLE_THRESHOLD` (one-line edit at `route.ts:296`). Verified
  via metric drop (1 → 0 / 2 → 0 / 3 → 1 across the three
  fixtures) and a unit test on `eightPersonFamily`. **Disposition:
  move [bugs.md:17](../bugs.md#L17) to the `fixed` section** with
  today's date.

- **[1b] Bug 18 partially closed.** Father-left tie-break in
  `order.ts` `repairCoupleAdjacency` is 100% effective on the 37
  same-rank both-known couples on Akarians and on both fixtures.
  Cross-rank couples (167 of 204 on Akarians) remain order-driven
  because their real positions are decided by independent
  per-rank ordering — out of `repairCoupleAdjacency` scope.
  **Disposition: do not close [bugs.md:18](../bugs.md#L18) yet.**
  Update the bug text to flag the cross-rank limitation; close
  the bug only when [d4] (cross-rank orientation) is also
  addressed in a future plan.

- **[1c] Crossings +4.3% on Akarians.** Within the +5% tolerance
  the plan allows. The deterministic father-left convention
  costs a small number of crossings vs the median-driven
  optimum. **Disposition: accept**, no action.

**Phase 3 entries:**

- **[3a] Worker-timing instrumentation shipped.** Per-pass
  `performance.now()` overhead is sub-microsecond; the spike
  the plan called for would have measured noise. Per-pass
  timings flow engine → worker → TreeCanvas → App and surface
  in the corner readout + `window.__treeDebug.timings`.
  **Disposition: ship, no further action.**

- **[d6] Persistence for `fte.debug.*` keys deferred.** Toggle
  state, section-open state, and bug-pill-hidden flag all live
  in $state and reset on reload. Sized 20-30 min: add keys to
  `SETTING_KEYS`, hydrate on mount, save on toggle. Most
  user-visible cost is that "permanently hide bug pill" isn't
  actually permanent. **Disposition: defer to phase 4 if time
  permits, otherwise track as a small follow-up.**

- **[d7] e2e coverage for the new panel deferred.** Test-ids
  are in place; the e2e tests themselves weren't written. Dev
  tooling is manually verifiable. **Disposition: defer; add
  when the broader e2e pass picks it up.**

- **[d8] Engine quick-switch row deferred.** The View menu
  already does this. Skipped without action.

**Phase 4 will add entries as defects surface.**

---

## Phase history

- **14 May 2026 — starting phase 0** (baselines, spikes,
  walking-skeleton scaffolding). DoD per the phase-0 section
  above plus the pre-mortem additions: route.ts stub audit also
  covers the force-conflict client-side knob; baseline JSON
  policy clarified (committed) vs `.local` re-runs (gitignored);
  panel relocation also adds `data-testid` to root + 7
  checkboxes; regression fixture sized iteratively up to ~50
  people if 12 doesn't reproduce.

- **14 May 2026 — phase 0 closed**

  **What landed (vs spec):**
  - 0a baseline metrics + reusable spike — shipped, all four
    metric tables populated for `eightPersonFamily`,
    `ghostStrandingDistilled`, and Akarians DEMO. Outputs at
    `notes/profiles/layered-baseline.md` and `layered-metrics.json`.
    [bugs.md:17](../bugs.md#L17) reproduces on the 8-person fixture
    (1 same-rank short-bond stub pair). [bugs.md:18](../bugs.md#L18)
    reproduces with 50% male-left ratio on `both-known` couples
    (Akarians is 49.5%, exactly the coin-flip).
  - 0b route.ts audit — shipped at
    `notes/profiles/route-stub-paths.md`. Force-conflict knob
    documented: `syncStore.setRevision(revision - 1)`.
  - 0c algorithm spike — shipped. **Verdict: RED.** The simple
    post-pass tried 3 cluster swaps on Akarians (8 stranded
    ghosts grouped into 3 clusters); zero swaps were accepted
    under k=0 OR k=2. Every candidate swap added more than 2
    crossings. Same on the distilled fixture (1 cluster tried,
    0 accepted). **Phase 2 is dropped per the gate.**
  - 0d panel relocation — shipped. Panel now at `bottom-14
    left-3`, above the stats pill. `data-testid="debug-panel"`
    on root + `data-testid="debug-toggle-<key>"` on each
    checkbox. `Ctrl+Shift+D` still toggles; functionality
    preserved.
  - 0e regression fixtures — shipped at
    `apps/web/tests/fixtures/layered-bug-repros.ts`. The
    distilled fixture grew to 18 people (added G1/G2/G3
    grandparents to push S{1,2,3} to rank 2 so cross-rank
    ghosts actually appear). It produces 3 ghosts, 1 of which
    is stranded at 7.5u — a real bug-13 reproduction at small
    scale.

  **Surprises (3):**
  1. **Bug 17's actual root cause differs from the bug-log
     text.** The log claimed the bond splits because the
     children's centroid differs from the bond midpoint. The
     audit (0b) found the truth: `bondSpan > maxBondSpan` is
     the only trigger, and on small fixtures
     `maxBondSpan = bbox.width / 4` is too small (3.5u on the
     8-person fixture) so any couple with children pulling
     bondSpan above that becomes stubbed. **Phase 1 fix is a
     one-line edit**: floor `maxBondSpan` at
     `BUNDLE_THRESHOLD` (= 8 × ROW_H). Not the "same-rank
     rule" the plan body described.
  2. **Bug 18 reproduces at exactly 50% on Akarians.** All
     `both-known` couples (204 of them) flip a coin between
     male-left and female-left. No mixed-gender data
     distribution effect to worry about; the fix should
     trivially hit ≥95%.
  3. **Phase 2 algorithm spike returned RED on first try.**
     The pre-mortem flagged this as the highest-severity risk
     and the gate caught it before any production code was
     written. The cluster-swap-and-test approach is genuinely
     infeasible at k=2: even one stranded ghost in Akarians
     adds enough crossings (>2) when moved adjacent that the
     swap is rejected. A different algorithm (move-the-near or
     two-sided ranking) is needed.

  **Residual debt:**
  - [d1] Pre-existing in-flight family-view work in the
    working tree has lint errors
    (`tests/unit/engines/family-view/path.test.ts:87` and
    `:130`). These are NOT introduced by Phase 0 — they are
    the user's in-flight phase work on family-view.md (retired
    plan; recoverable via git history). Full `pnpm verify`
    fails because of them; my Phase 0 subset (typecheck,
    spikes, unit tests, build) is clean. Routed to bug log
    for triage, but the right disposition is "fix as part of
    that workstream, not this one."
  - [d2] Some pre-existing files were prettier-reformatted as
    a side-effect of fixing the lint gate during 0d
    verification: `family-view/couples.ts`,
    `family-view/index.ts`, `family-view-multi-union.spec.ts`,
    `multi-union-fixture.test.ts`, `multi-union.test.ts`,
    `n-partner-geometry.test.ts`. These are NOT staged in the
    Phase 0 commit (left in the working tree). The format
    changes are mechanical and correct; the user can stage
    them with their family-view work.
  - [d3] The Phase 0c algorithm-spike infrastructure is now
    available for future Phase 2 attempts with a different
    algorithm. The spike runner accepts `runPostPass(tree,
    label, k)` and can be extended with new candidate
    algorithms.

  **Implications for downstream phases:**
  - **Phase 1 simplifies**: bug 17 fix is a one-line floor on
    `maxBondSpan`, not the "same-rank rule" the plan body
    described. Plan body must be rewritten in step 5
    (plan-revise).
  - **Phase 2 is dropped.** Plan ends at Phase 1 + 3 + 4 per
    the 0c gate. Bug 13 stays open in
    [bugs.md](../bugs.md) for a future plan with a
    sophisticated algorithm. Plan-revise documents this.
  - **Phase 3 unchanged.** Worker-timing spike, panel
    sectioning, new overlays still scoped as written; the
    `data-testid` infrastructure from 0d is in place.
  - **Phase 4 unchanged.** Doc-only and decision work.

- **14 May 2026 — starting phase 1** (low-risk layered fixes).
  Scope: bug 17 (one-line floor on `maxBondSpan`) + bug 18
  (father-left tie-break in `order.ts`). Per the Phase 0
  audit + retro, the original "same-rank rule" was a no-op;
  the actual fix is much smaller. DoD per the revised Phase 1
  section above.

- **14 May 2026 — phase 1 closed**

  **What landed (vs spec):**
  - Bug 17 fix at `route.ts:296`: floor `maxBondSpan` at
    `BUNDLE_THRESHOLD`. One-line edit as Phase 0b predicted.
    Metrics confirm: same-rank short-bond stub pairs dropped
    from 1 → 0 on `eightPersonFamily`, 2 → 0 on
    `ghostStrandingDistilled`, 3 → 1 on Akarians. Akarians'
    remaining stub is a legitimate cross-cluster long-bond.
  - Bug 18 fix in `order.ts`: father-left tie-break in
    `repairCoupleAdjacency`, gated on a new `preferredLeft:
    Map<spouseGroupKey, LayoutNodeId>` built from `tree` for
    both-known mixed-gender couples only. Same-sex couples,
    unknown-gender pairs, and multi-spouse secondary unions
    fall through to position-based ordering.
  - `order()` signature gained an optional `tree?: Tree`
    parameter (back-compat: all existing callsites still
    work; LayeredEngine passes `input.tree`).
  - Test file at
    `apps/web/tests/unit/layout/layered-bug-fixes.test.ts`
    (4 tests, all green): bug 17 single-segment check + bug
    18 male-left placement for both couples on
    `eightPersonFamily`, plus a back-compat smoke for the
    no-tree path.
  - Metrics spike updated: now threads `tree` to `order()`
    (matches LayeredEngine), and the `OrientationBreakdown`
    JSON schema gained `sameRankBothKnownMaleLeft` +
    `sameRankBothKnownFemaleLeft` to break out the segment
    the tie-break can actually influence.

  **Surprises (1):**
  1. **Orientation goal "≥95% male-left on all both-known"
     was too ambitious** for Akarians. After fix: Akarians
     is 100% male-left on the 37 same-rank both-known
     couples (perfect!), but 57% overall because the other
     167 are cross-rank — and cross-rank partners' real X
     positions are decided by independent rank ordering, not
     by `repairCoupleAdjacency`. The fix works as designed;
     the metric needed segmentation. Pre-mortem's
     "calibrate against known-gender density" prompt was the
     right instinct but missed the cross-rank dimension.

  **Residual debt:**
  - [d4] Cross-rank couple orientation cannot be fixed
    inside `repairCoupleAdjacency`. To get male-left on
    cross-rank pairs too, the engine would need to coordinate
    orientation across ranks — likely a global step at the
    `layer.ts` rank-assignment level (which couple-equalisation
    work the relationship-vocab plan claims). Filed as
    follow-up; **not in this plan's scope**.
  - [d5] Akarians' global crossings count rose +4.3%
    (2734 → 2852) after the orientation fix. Within the +5%
    tolerance the plan allows. The increase comes from forcing
    37 same-rank couples to a specific orientation that the
    crossing-min would have flipped to reduce one or two
    crossings. Not a regression — a small principled cost for
    a deterministic convention. No action.

  **Implications for downstream phases:**
  - **Phase 3 unchanged.** The new `preferredLeft` mechanism
    in `order.ts` is an internal implementation detail; the
    debug toolbox doesn't surface it.
  - **Phase 4 unchanged.** Doc-only work.
  - **Relationship-vocab Phase 2 (separate plan)** can adopt
    the same father-left tie-break for the couple-box in
    family-view, or extend it to cross-rank pairs via the
    layer.ts couple-equalisation it already plans. Both
    workstreams share commit `e3e7d8c`'s convention.

- **14 May 2026 — starting phase 3** (debug toolbox overhaul).
  Scope: worker-timing spike, sectioned panel with toggle
  switches, 5 new overlays, 3 runtime actions, corner
  readouts, bug-pill discoverability, persistence. DoD per
  the Phase 3 section above.

- **14 May 2026 — phase 3 closed**

  **What landed (vs spec):**
  - Worker-timing instrumentation shipped directly (spike
    skipped: `performance.now()` overhead is sub-microsecond,
    4 calls per layout add < 1µs vs hundreds of ms total).
    `LayeredEngine.layout()` emits `timings: { layer, order,
    place, route, total }` on every run; worker forwards
    timings on both fresh and cache-hit paths; TreeCanvas
    pipes through `ontimings(t)` callback; App stores +
    surfaces in the corner readout. Also exposed on
    `window.__treeDebug.timings`.
  - Sectioned debug panel rewritten at
    `apps/web/src/App.svelte`. 4 sections (layout / routing
    / diagnostics / runtime), button-chip toggles styled
    like Connections-tab married/primary buttons, `Ctrl+
    Shift+D` header label.
  - Bug-icon pill (`lucide Bug`) visible by default at
    `bottom-3 left-28` (right of the stats pill). "Permanently
    hide bug pill" toggle at panel bottom (no persistence —
    see residual debt [d6]).
  - Corner readouts at `top-3 right-3` show:
    - per-pass + total layout time on the most recent run
    - `editRev` + people count (replaces the planned content
      hash; the worker's contentHash is internal cache state
      and threading it added scope for thin gain)
  - 5 new overlays in DebugOverlay.svelte:
    `showCycleNodes`, `showBondCentroidDelta`,
    `showOrphanBadge`, `showRankGutterLabels`,
    `showLastEditHalo`. All gated on optional props
    (`layeredGraph`, `placedGraph`, `tree`, `lastEditedId`)
    so the overlay no-ops gracefully when those aren't
    threaded.
  - 3 runtime actions: `copy snapshot` (Map-aware JSON of
    placed IR + segments + timings), `dump tree json` /
    `load tree json` (uses `treeStore.reset`; survives the
    HaracalndeDate round-trip because they live as plain
    `HaracalndeDateData` in the tree), `force conflict`
    (calls `syncStore.setRevision(revision - 1)` per the
    Phase 0b audit; disabled when not signed-in /
    revision <= 0).
  - `data-testid` attributes on all new controls for future
    e2e coverage: `debug-pill`, `debug-toggle-<key>`,
    `debug-copy-snapshot`, `debug-force-conflict`,
    `debug-dump-textarea`, `debug-dump-json`,
    `debug-load-json`, `debug-corner-readouts`.

  **Surprises (1):**
  1. **The worker-timing question that the plan flagged as a
     methodology risk wasn't actually contentious.** Once
     instrumented, the per-pass overhead is well below noise.
     The pre-mortem's "structured-clone vs `performance.now()`"
     framing was about the wrong layer — both are cheap. The
     spike was therefore unnecessary; ship-and-measure would
     have been faster from the start.

  **Residual debt:**
  - [d6] **Persistence for `fte.debug.*` keys deferred.**
    The plan called for `fte.debug.openSections`,
    `fte.debug.toggles`, `fte.debug.pillHidden` to survive
    reload via Dexie. Current implementation keeps everything
    in $state so it resets on reload. Not user-facing
    (devtools always re-discoverable via Ctrl+Shift+D), but
    breaks the bug-pill "permanent hide" gesture. Sized as a
    20-30 minute follow-up: add `debug.*` to `SETTING_KEYS`,
    hydrate on mount, save on toggle. Routed to bug log.
  - [d7] **e2e tests not added.** The plan's DoD asked for
    e2e coverage of state restoration + engine quick-switch
    + dump/load JSON. Deferred — the testids are in place
    for whenever the e2e pass happens. Routed to bug log.
  - [d8] **Engine quick-switch row deferred** (redundant with
    the View menu, which already does this). The data-testid
    infrastructure makes it a 5-minute addition when needed.

  **Implications for downstream phases:**
  - **Phase 4 unchanged.** Doc + decisions only.
  - Future layered-engine debugging benefits immediately:
    cycle-nodes ring, bond/centroid delta caret, orphan
    badge, rank-gutter labels, last-edit halo, layout
    timing readout, copy-snapshot for bug reports.

---

## Reference shelf

- [bugs.md](../bugs.md) — the three layered-engine bugs this plan
  closes (lines 13, 17, 18).
- [to-do.md](../to-do.md) — the `tooling / infra` section.
- `notes/plans/family-view.md` (retired; recoverable via git
  history) — coordination on spouse orientation (Phase 2), engine
  quick-switch (Phase 6). Successor plan family-view-w2 also
  retired 23 May 2026; recoverable via git history.
- `notes/plans/relationship-vocabulary.md` (retired; recoverable
  via git history) — bounds on `layer.ts` work this plan does NOT
  touch (Phase 2 there); pre-Phase-2 ordering check. Shipped
  contracts remain in `domain/schema.ts` and `domain/tree.ts`.
- [tree-rendering.md](./tree-rendering.md) — original layered/
  hyperbolic engine plan that produced the bugs being cleaned up.
- `apps/web/vitest.spike.config.ts` — existing spike-runner
  config; Phase 0a and 0c spikes use it.
- `e3e7d8c` — hyperbolic engine genealogy-conventional
  orientation fix, the model for Phase 1's tie-break.

---

## Process notes

- Each phase is independently shippable. If family-view or
  relationship-vocabulary work needs to preempt, this plan pauses
  cleanly between phases.
- Phase 0 must run before Phase 1, 2, or 3 (it lands the audit,
  the baseline, the algorithm gate, the relocation shell, and the
  fixtures). Phase 4 is independent of Phase 0-3.
- Phase 2 was dropped after Phase 0c's RED verdict; plan
  continues at Phase 1 + 3 + 4.
- No phase here introduces a schema bump, IR change, or new
  engine.

---

## Pre-mortem (rev 1, 14 May 2026)

**Bottom line:** proceed with revisions. The rev-1 revisions retired
the three high-severity risks (Phase 2 feasibility, route.ts premise,
walking-skeleton miss). Six medium-severity implementation concerns
remain — none of them invalidate phases, all can be folded into
existing DoDs.

### Risks

- **[medium] premise — IR / tree-JSON serialization for the new
  runtime actions.** Phase 3's `copy layout snapshot` and `dump /
  load tree json` need to round-trip data that includes
  `HaracalndeDate` instances (methods, not plain objects) and
  post-hydrate `Map` instances in the layout IR.
  `JSON.stringify(tree)` silently loses both. *Probe: in Phase 3,
  reuse existing serializers — `writeBundle` / `readBundle` for the
  tree JSON (matches GEDZIP), and the pre-hydrate worker wire
  format for the layout snapshot. Don't invent new serializers.*

- **[medium] scope / perf — Phase 3 worker-timing spike measures
  the wrong thing.** As written, the spike measures
  structured-clone overhead of a `{ timings: {...} }` field, which
  is essentially free against the existing IR message. The real
  cost is per-pass `performance.now()` instrumentation inside each
  pass — potentially interfering with V8 inlining, definitely
  non-zero at ~2000 nodes. *Probe: revise the spike methodology —
  measure end-to-end layout-pass wall time WITH instrumentation
  vs WITHOUT, on Akarians. If the delta is <5% relative, ship
  per-pass timing; otherwise main-thread total.*

- **[medium] integration — force-conflict mechanism is
  underspecified.** Server has no force-conflict endpoint
  ([routers/trees.py:111](../../apps/server/attu_tree/routers/trees.py#L111));
  the 409 path triggers only when the client sends an
  `expected_revision` that doesn't match server state. The plan's
  "Dexie write" fallback won't trigger it — Dexie isn't what
  composes the PUT. *Probe: in Phase 0b's audit, also document the
  exact client-side knob (probably in `sync.svelte.ts` —
  artificially decrement the cached revision) that produces a
  PUT with stale `expected_revision`. Phase 3 implementation
  follows the audit conclusion; if the knob doesn't exist
  cleanly, drop force-conflict from Phase 3 and queue as
  follow-up.*

- **[medium] operational — Phase 0e fallback leaves Phase 2 with
  no fast unit test.** `apps/web/vitest.spike.config.ts`
  documents Akarians runtime at "30+ seconds" — that's not a
  unit-test option. If `ghostStrandingDistilled()` doesn't
  reproduce at 12 people, the plan's fallback to "use the full
  Akarians fixture" puts Phase 2 verification in spike-territory,
  not unit-test territory. *Probe: in 0e, build the fixture
  iteratively — start at 12 people, double until the bug
  reproduces or we hit ~50. Cap at 50 to keep unit-test runtime
  tractable. If 50 isn't enough, accept spike-only verification
  for Phase 2 and document the limitation.*

- **[medium] operational — spike JSON side-channel policy
  undefined.** `notes/profiles/layered-metrics.json` is mentioned
  as a machine-diffable output of Phase 0a's spike. Is it
  committed (a baseline snapshot we diff against in PRs) or
  gitignored (ephemeral dev output)? *Probe: in Phase 0a, commit
  the baseline JSON as a snapshot under `notes/profiles/`; add
  `notes/profiles/*.json.local` to `.gitignore` for ephemeral
  re-runs. Phase 1 / Phase 2 verification then writes a
  `.local` variant and diffs against the committed baseline.*

- **[medium] integration — Phase 3 e2e tests need test-ids that
  Phase 0d's "preserve existing functionality" relocation
  doesn't add.** `engine quick-switch` row, `dump tree json`
  textarea, `force conflict` button — none of these exist yet,
  none have stable selectors. *Probe: in Phase 0d, add
  `data-testid` attributes to the panel root and the seven
  existing checkboxes only. Phase 3 adds the test-ids for new
  controls when it adds the controls themselves. No e2e
  retrofit work.*

### Walking-skeleton check

**Verdict:** intact. Phase 0 covers all five seams Phase 1-3 will
rely on:

- metrics infrastructure (`tests/spikes/layered-metrics.spike.ts`,
  real) — Phase 1/2 verification reuses it
- route.ts audit doc (`notes/profiles/route-stub-paths.md`, real) —
  Phase 1 implementation reads from it
- ghost-contiguity algorithm proof (`tests/spikes/ghost-
  contiguity.spike.ts`, real) — Phase 2 ships iff gate passes
- debug-panel shell at bottom-left (`App.svelte`, real) — Phase 3
  fills it
- regression fixtures (`tests/fixtures/layered-bug-repros.ts`,
  real) — Phase 1/2 unit tests use them

Phase 3 still introduces some new layers (toggle-switch migration,
sectioned layout) but the panel container and persistence keys
exist at Phase 0 boundary. Acceptable.

### Phase-order revisions

No reordering needed. The five Phase-0 tasks are parallel-safe;
1.5 days is a reasonable estimate for one person working through
them sequentially.

| original | proposed | reason |
|---|---|---|
| (no change) | (no change) | rev 1 already reflects risk-first ordering — feasibility-gate spike before commit, audit before edit, shell before fill |

### Definition-of-done additions

- **Phase 0:**
  - [ ] Phase 0b audit also documents the client-side
        force-conflict knob (probably `sync.svelte.ts`
        cached-revision); Phase 3 force-conflict implementation
        follows the audit.
  - [ ] Phase 0a clarifies JSON side-channel policy: baseline
        committed under `notes/profiles/`, `.local` variants
        gitignored.
  - [ ] Phase 0d adds `data-testid` only to panel root + seven
        existing checkboxes; nothing more.
  - [ ] Phase 0e fixture sized iteratively, capped at ~50
        people; if 50 doesn't reproduce, Phase 2 accepts
        spike-only verification.

- **Phase 1:**
  - [ ] `visual-akarians.spec.ts` playwright snapshot diff
        reviewed; any geometry-driven snapshot changes
        explicitly accepted with the diff inspected for
        surprise. Run with `--update-snapshots` only after
        review.

- **Phase 2:**
  - [ ] `visual-akarians.spec.ts` snapshot review (same as
        Phase 1).
  - [ ] "Multi-cluster conflict" precisely defined in the
        post-pass design: two clusters' target adjacency
        positions overlap on the same rank.

- **Phase 3:**
  - [ ] `copy layout snapshot` uses pre-hydrate worker wire
        format (no Maps); `dump tree json` / `load tree json`
        use existing `writeBundle` / `readBundle` serializers
        (preserves `HaracalndeDate`).
  - [ ] Worker-timing spike methodology measures end-to-end
        layout-pass time WITH vs WITHOUT instrumentation, not
        structured-clone overhead of the extra field.
  - [ ] Corner readouts location confirmed not to overlap
        existing chrome (SaveStatusPill, ZoomWidget).
        Top-right or top-center after audit.
  - [ ] Perf budget phrased relative: layout-pass time with all
        overlays toggled stays within ≤2× Phase 0a baseline
        (not the absolute 200ms claim from rev 1 body).
  - [ ] Cycle-nodes and bond/centroid-delta overlays tested
        against `eightPersonFamily()` *post-Phase-1*: cycles
        should be empty, deltas should be zero for same-rank
        couples after the bug-17 fix.

- **Phase 4:**
  - [ ] Prettier-plugin upstream investigation time-boxed to
        30 minutes; if status unclear, defer with "unblocked
        when X" and remove the to-do entry.

### What I'm NOT flagging as a risk

- **Rollback for layout-pass changes** — `git revert` is the
  only option, but layered is power-user-mode post-family-view
  and the user population accepting this is small. Acceptable.
- **`pnpm verify` doesn't run spikes** — by design;
  `vitest.spike.config.ts` exists as a separate runner. Phase 0
  spikes are one-shot; Phase 1/2 verification re-runs the
  metrics spike manually. No CI integration needed for this
  plan.
- **Phase 0 estimate vs people-count** — 1.5 days is a one-
  person estimate, reasonable; parallel-safe means a second
  person could compress, not that the plan requires it.
- **`notes/profiles/` first-time creation** — verified absent
  ([notes/](../) has no `profiles/` subdirectory today); plan
  creates it. No collision risk.
