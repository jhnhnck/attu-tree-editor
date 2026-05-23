# bugs — family view wave 2

per `notes/dev/process.md`, this file accumulates findings outside the
current phase's scope. `bug-triage` walks it between phases. `## open`
items get triaged at phase boundaries; resolved items move to
`## closed` at phase close; aged closed items get gc'd after 1
boundary (git history is the trace).

## open (carried in from wave-1 ship-gate)

- multi-union renderer commits to one-union-at-a-time → **phase 4
  (secondary-union expansion; RV phase 3b shipped in `aba7de0`)**
  (rev 1: was "commits to N=2; blocked on RV 3b" — renamed for
  terminology disambiguation, dep updated).

## open (carried in from visual fix-up plan residual debt — 2026-05-22)

- **B6** the explicit sibling bus emits `role: "blood"` uniformly
  even when every kid of the couple is a half-sibling. per-kid stubs
  carry the correct role; only the bus itself is uniform. visually
  fine today but a relationship-vocabulary palette enrichment may
  want bus-level roles. → **phase 4** (secondary-union expansion is
  the natural home).
- **B12** `.is-portrait-pending` slot background transition is
  unguarded — the slot snaps from neutral grey to the resolved
  portrait the instant the blob URL resolves. → **deferred** (phase
  1 [2026-05-23] did not touch PersonNode portrait-slot rules;
  phase 2 [2026-05-23] did not touch them either; the dense-tree
  fixture has no portraits so the path wasn't exercised. low-
  priority polish; revisit when a phase is touching PersonNode for
  another reason).

## open (phase 1 findings — 2026-05-23)

- **B14** family-view collapse-badge click is a no-op for ancestor-
  side badges. `onBadgeClick` adds `sourceId` to the explicit-
  expansion set, but for ancestor sources whose adjacent generation
  is already in the bounded default, `revealChildren` /
  `revealParents` return no-op and the visible set doesn't change.
  `pickCollapseVictim` re-picks the same source on the next pass
  because its `protect` argument only protects CHILDREN from being
  hidden, not source persons from being chosen again. net effect:
  click writes to localStorage but the badge visually reappears
  immediately. a 2-3-line patch in `pickCollapseVictim` extending
  the rule to also skip sources in `protect` would close it. →
  **deferred to phase 4 or wave-3** (phase 2 [2026-05-23] did not
  touch `pickCollapseVictim` — the crossing-min pass operates on
  slot order, not the collapse-victim selector).

- **mobile inspector-overlay flakiness (4th spec found)**: phase 1
  surfaced a 4th instance in `family-view-path-highlight.spec.ts`
  closed inline via `test.skip(isMobile, "B4: …")`. underlying
  inspector-vs-canvas-click geometry stays routed to wave-3 (or to
  phase 0b if the zoom contract work surfaces the same root cause).
  no separate B-entry; this is B4's 4th confirmed signature.

## open (phase 0b findings — 2026-05-23)

- **B17** no UI toggle for the `fte.zoom.semantic100` flag. flag
  exists in localStorage with `null → on` default; rollback path is
  to flip the read fallback in App.svelte to `false`. plan-text said
  "settings panel gets an unobtrusive checkbox" but this codebase
  doesn't have a settings panel — flags are View-menu toggles, and
  no other zoom-related entry exists there to anchor it next to.
  → **deferred** (low priority polish; revisit if/when a View-menu
  Zoom submenu emerges). same-priority sub-note: the
  `.family-view-edge { shape-rendering: crispEdges }` rule applies
  even at 1× zoom, which is fine for axis-aligned strokes but would
  need an opt-out if a future family-view feature introduces
  diagonal segments.

## open (phase 2 findings — 2026-05-23)

- **B15** family-view crossing-min pass is a measured no-op on every
  production fixture (akarians root=1/dense=4/leaf=0, dense-tree=9,
  multi-union=0; all delta=0). monotone gate correctly rejects
  candidate layouts that don't strictly reduce geometric crossings,
  but the slot-index barycentric heuristic's reorderings either match
  the pre-pass slot order (`planMapsDiffer` returns false) or produce
  equal-or-worse geometric counts. root cause: in family-view's
  bus-and-stub geometry, endpoint-touching pairs (vertical stem
  touching another union's horizontal bus at the same y) don't count
  as geometric crossings, so heuristic improvements on slot-inversion
  metric don't always translate to fewer geometric crossings. →
  **revisit in phase 4** (secondary-union expansion brings 2+ partners'
  children into the bounded subset side-by-side — the configuration
  where barycentric *should* activate; re-run `crossings-baseline.test.ts`
  with phase-4 fixtures and observe). if still no-op, escalate to
  algorithm upgrade (median barycentric, alternating inward sweep, or
  per-swap geometric-crossing transposition pass).

- **B16** `parentsOfPerson` / `childrenOfPerson` in `engines/family-view/layout.ts`
  walk `tree.couples` and `getUnions(tree)` linearly per call.
  acceptable today at ≤30 visible cards (the barycentric pass calls
  these O(MAX_ITERS × ranks × slots × persons) times = ~few hundred
  ops total on akarians). would matter if wave-3 lifts the bounded-
  window cap, at which point a per-tree precomputed `childrenIndex:
  Map<PersonId, PersonId[]>` would amortise. → **deferred** (perf
  nit; revisit if/when bounded cap changes).

## open (phase 3 findings — 2026-05-23)

- **B18** family-view edges (SVG `<path>` `d` attribute) jump-cut
  while cards slide via the phase-3 CSS-transition-on-transform.
  visually noticeable on a careful watch — not flicker, just motion
  mismatch (cards translate over 250ms; the polylines connecting
  them snap to their new shape instantly). resolution options if
  it bothers users: (a) tween `d` via `requestAnimationFrame` path
  interpolation (~50 lines, some perf cost on dense layouts);
  (b) ship a small lib (e.g. motion's SVG plugin, ~5 KB) — engages
  reactive cycle though, so revisits the svelte-5 composition risk
  the spike intentionally avoided; (c) extract endpoints from card
  positions and route edges through `<line>` primitives instead of
  `<path>` so CSS-transition handles them — most invasive. →
  **deferred** (low-priority polish; revisit on user feedback or
  if phase 4's secondary-union expansion makes the disconnect more
  prominent — two parent-couple slots both shifting amplifies the
  card-vs-edge motion gap).
- **B19** family-view cards and collapse badges mount/unmount jump-
  cut when expansion changes the visible set. svelte's
  `transition:fade={{ duration: 200 }}` directive on the keyed each
  would give a clean entrance/exit, but adds reactivity-cycle
  interaction that the phase-3 spike intentionally avoided to
  satisfy "simplest possible approach". → **deferred** (same
  trigger as B18; would bundle naturally with it).
- **B20** no UI toggle for the `fte.overlays.smoothDiff` flag. flag
  exists in localStorage with `null → on` default; rollback path is
  to flip the read fallback in App.svelte to `false`, or to
  individually `localStorage.setItem(key, "false")` for power-users.
  same precedent as B17 (semantic100), crossingMin — none of the
  wave-2 phase-internal flags have View-menu surface. → **deferred**
  (low-priority polish; if/when 4 flags exist together, surface
  them as a View > Advanced submenu rather than dripping individual
  toggles).

## owned elsewhere (handed off, not duplicated here)

- `emitFinding` lacks server-side persistence → RV workstream's
  schema-rejection path.
- server-side `multi-parent-unsupported` finding deferred → RV
  workstream.

## triaged & deferred

(empty.)

## closed

- **no smooth-diff animation** (wave-1 ship-gate carryover) → closed
  in phase 3 (2026-05-23). CSS-transition-on-transform (250ms
  cubic-bezier) on card + badge wrapper divs;
  `fte.overlays.smoothDiff` localStorage flag default-on;
  `.family-view-smooth-card` class + `data-smooth-diff="true"`
  attribute drive declarative wiring. global
  `prefers-reduced-motion: reduce` zeroes the transition for
  motion-sensitive users. 3 e2e cases × 2 projects = 6 green; 1
  visual golden re-baselined (add-relative), 5 byte-identical.
  edges + mount/unmount jump-cut → B18/B19; flag has no UI → B20.
- **family-view layout has no crossing-minimisation** (wave-1 ship-
  gate carryover) → closed in phase 2 (2026-05-23). barycentric
  slot-index pass with monotone geometric-crossing gate landed at
  `apps/web/src/lib/layout/engines/family-view/layout.ts`;
  `fte.layout.familyViewCrossingMin` localStorage flag default-on;
  6 unit cases + cross-fixture baseline; perf overhead 1-2ms /
  9-11% on akarians 3-expand. follow-up routed to B15.
- **B11** `orientCouple` swaps left/right by personId lex order →
  closed in phase 2 (2026-05-23) via `tests/_helpers/family-view.ts`
  `pickLeftRight(layout, ids)` + `leftmostAtRank(layout, rank)`
  helpers. routes test assertions through observed `layout.nodes[].x`
  instead of `tree.couples`-field-order assumptions. 6 helper unit
  tests at `tests/unit/_helpers/family-view.test.ts`; consumed by
  the new `crossingMin.test.ts` opt-out contract case.
- **playwright cache skew on fresh worktree** (phase 1 finding) →
  closed in phase 2 (2026-05-23, no-action). re-verified at phase
  2 start: the worktree's `pnpm-lock` actually resolved
  `@playwright/test@1.59.1` (chromium-1217), matching the warm
  cache — phase 1's recorded version skew did not reproduce. cache
  `~/.cache/ms-playwright/` carries both 1217 and 1223 builds. note
  still useful for fresh-machine onboarding; not a code finding.
- RV-Phase-3b treeDiff round-trip WIP (wave-1 ship-gate blocker)
  → shipped in `aba7de0` (14 May 2026); always-on `tree.unions[]`
  + family-view N>2-partner renderer landed together. gc candidate
  after phase 4 closes.
