# canvas chrome dock — unified panels + pills with priority

**status:** shipped (merge pending) · 2026-05-26 · phase 5 closed in `796171c` (pre-rebase) / `7364e75` (post-rebase) · `ship-readiness` → ship · `pre-merge` cleanup landed; awaiting user go-ahead at the merge gate.

## context

canvas chrome — anything floating over the tree canvas — has accreted into three uncoordinated mechanisms:

- a **bottom chrome flex-bar** at [App.svelte:2160-2290](../../../apps/web/src/App.svelte#L2160-L2290) hardcodes pill order: `SaveStatusPill` → stats pill → debug bug icon → debug timings/editRev readout. it carries `data-canvas-chrome` so `measureCanvasChromeInsets` ([fitMath.ts:120-160](../../../apps/web/src/lib/components/canvas/fitMath.ts#L120-L160)) accounts for it in `fitToView`.
- the **debug menu** ([App.svelte:2294-2608](../../../apps/web/src/App.svelte#L2294-L2608)) is a separate `position: absolute` panel at `bottom-14 left-3 z-40`, also carrying `data-canvas-chrome`.
- the **family-view debug panels** ([FamilyViewDebugOverlay.svelte](../../../apps/web/src/lib/components/tree/FamilyViewDebugOverlay.svelte)) are five `position: fixed` divs scattered across viewport corners with hand-picked offsets (`top: 4rem`, `top: 7rem`, `top: 11rem`, `bottom: 8rem`). none carry `data-canvas-chrome`, so they silently overlap content `fitToView` will recenter under.

three problems compound:

1. **inconsistent anchoring.** debug panels read as canvas chrome rather than chrome that belongs with the debug menu; pills in the bottom bar have no way to reorder; the debug timings readout had to be hand-inserted into App.svelte rather than registered from where it logically belongs.
2. **overflow when many open.** with debug menu open + multiple family-view debug panels expanded on a 720px-tall viewport, panels collide or scroll off-screen.
3. **minimize is just a shrink-wrapped rectangle.** the phase-5 collapse affordance ([FamilyViewDebugOverlay.svelte:153-167](../../../apps/web/src/lib/components/tree/FamilyViewDebugOverlay.svelte#L153-L167)) shrinks panels to a header-only rect (`min-width: 9rem`). the user explicitly asked for a "pill" instead — which is exactly what the bottom-bar pills already are.

the recent direction (commits `0385a9a`, `73a9a53`, `384b8ec`) is consolidation: pull canvas-overlay content into the debug menu. this plan extends that direction one level further: a single `CanvasChromeDock` owns every pill and every panel that anchors to a canvas corner. pills and collapsed-panels share the same `.fte-pill` chrome contract. each item registers with the dock under a corner + numeric priority; the dock sorts within each corner and handles overflow.

## goals

- one `CanvasChromeDock` owns positioning for every pill and every panel that today carries `data-canvas-chrome` plus every family-view debug panel that should. zero per-item hardcoded `position/top/right/bottom/left/z-index` rules remain outside the dock.
- items register with `{ id, corner: "bl"|"tl"|"tr"|"br", priority: number, kind: "pill"|"panel" }`; sort within a corner is by `priority` ascending then `id` for stability. priority is the explicit knob the user asked for; reordering a single pill is changing one number.
- with all family-view debug panels expanded on a 720px-tall viewport, the dock's stack fits within its corner's available height. when natural height exceeds the cap, lowest-priority panels in that corner force-collapse to their pill form until the stack fits.
- collapsed panel pill matches the bottom-bar `.fte-pill` shape: ≤ 1.75rem tall × ≤ 10rem wide, same `border-line` / `bg-canvas-elev` tokens. expanded form sits above (or beside) the pill row, with the pill itself acting as the always-visible handle.
- the existing four bottom-bar pills (`SaveStatusPill`, stats, debug-icon, debug-timings) render through the dock with no visual regression; existing testids (`canvas-bottom-bar`, `stats-pill`, `debug-pill`, `debug-corner-readouts`, `save-status-pill`) keep resolving.
- `pnpm verify` green at every phase boundary; no existing e2e regresses.

## non-goals

- adding new debug overlays, new pills, or new functionality.
- touching svg overlays inside the pan/zoom group (they correctly ride the canvas transform).
- touching the layered engine's `DebugOverlay.svelte` or the hyperbolic engine, except where they would supply pills/panels that already render today.
- docking the centered modals (`CommandPalette`, `ShortcutsOverlay`) — they are viewport-centered overlays, not corner-anchored chrome.
- docking `Toasts` — time-limited transient alerts with their own queueing; out of scope.
- docking the `Inspector` (sheet or side mode) — major panel with its own layout regime; out of scope.
- docking `ZoomWidget` — it is inline, not floating; out of scope.
- docking `BackButton` (top-left, transient) — out of scope this round; eligible if it later wants priority-sorting.
- persisting collapse / pill state across sessions (transient, matches existing convention).
- redesigning any pill's content; only the *registration* and *positioning* change.

## constraints

- project style: lowercase inline comments, no trailing periods, regular dashes, american english, spaces for indent, brief over long
- svelte 5 runes; tailwind v4 tokens; `exactOptionalPropertyTypes` ts
- no committed secrets, no `data/` writes
- pills and panels render only when their guard conditions hold (e.g. stats pill behind `statsPillVisible`, debug timings behind `debugOpen`); off-toggle cost stays zero
- the dock must continue to satisfy `measureCanvasChromeInsets` so `fitToView` keeps centring content above docked corners
- mobile-aware: dock must degrade sanely on viewports < 600px tall (panel bodies collapse to pills by default when the open stack would exceed the cap)

## accepted risks

pre-mortem (see sibling `pre-mortem.md`) raised five high-severity risks; all folded into phase 0 or phase 1. residue:

- **`register(...)` contract is the load-bearing shape.** phase 0 spikes it against the three hardest item shapes (rich-prop component `SaveStatusPill`, internal-state panel layout-metrics, inline div debug-timings) *before* the contract gets named in code. write the worst one first; if it doesn't fit the spike, the contract is wrong.
- **`SaveStatusPill` is user-critical chrome.** any regression to visibility/click/popover surfaces for every user. its migration sits in phase 0 alongside layout-metrics so the registry is proven on both a user-critical pill and a debug-only panel before phase 1 dismantles the bottom-bar wrapper. phase 0 also tests "rapid-toggle does not flash the pill" to catch HMR/hydration churn.
- **stats pill popover anchoring.** the popover at App.svelte:2211-2258 requires its immediate ancestor to be `position: relative`. phase 1 migrates stats pill *first* (before debug-icon and debug-timings) so the snippet-wrapper convention proves out on the trickiest case; subsequent pills follow the same pattern.
- **`Inspector` sheet-mode overlap.** sheet inspector at `bottom-0 inset-x-0` already carries `data-canvas-chrome` ([Inspector.svelte:299-302](../../../apps/web/src/lib/components/inspector/Inspector.svelte#L299-L302)) and will overlap a bottom-left dock on mobile. phase 0 adds a 600×900 e2e with sheet inspector open; resolution is either "dock anchors above sheet inspector via the same chrome-inset contract" or "dock hides when sheet inspector is open" — decision recorded.
- **debug-menu asymmetry.** the debug-toggle pill goes in the dock but the debug menu it opens stays outside. phase 0 records the decision: is the debug menu a deferred dock item (`kind: "panel"`, priority `300`) or a permanent unmanaged sibling? if deferred, the follow-up sits in `bugs.md`.
- **`measureCanvasChromeInsets` contract.** the dock replaces the existing wrapper as the `data-canvas-chrome` carrier; phase 0 e2e measures `fitToView` insets before/after — within ±2px. phase 1 e2e asserts an empty corner returns zero inset (dock unmounts or omits the attribute when all items guard-hidden).
- **css-var bridge between debug menu and dock crosses coordinate frames** (menu is `position: absolute` in canvas-host; dock corners are `position: fixed`). phase 0 wires the bridge with `ResizeObserver` + `$effect` on `debugOpen`, with a defined fallback when the menu is closed.
- **off-subset and recenter-missed badges are transient status flashes, not user-toggled panels.** demoting to pills hides salience. phase 3 records the salience decision (alert-pill variant / auto-expand-on-appear / stay-outside-dock) in plan log *before* migration code.
- **priority-space convention** (0-99 status, 100-199 tools, 200-299 debug) is documented at the registry site. enforcement (runtime warn / lint rule / waiver) decided in phase 5.
- **visual snapshot infrastructure** may or may not be part of `pnpm verify`. phase 0 confirms; if not, "visual snapshot" references downgrade to "manual screenshot review" with the waiver recorded.
- **pivot criterion across all phases:** if the resulting dock obscures more canvas pixel-area than the chrome it replaced at default-open state (measured via `measureCanvasChromeInsets`), stop and `plan-revise` — the consolidation has failed its premise.

## phase 0 — walking skeleton: dock + registry + 1 pill + 1 panel + chrome-inset contract

**status:** closed in `52625b1` (pending merge) · 2026-05-25

**definition of done:** a `CanvasChromeDock.svelte` exists; it accepts items via a small `dockRegistry` store keyed by `id` with `{ corner, priority, kind, render }` whose contract was *spiked first* against three hardest item shapes; it renders `SaveStatusPill` (user-critical pill) and layout-metrics (internal-state panel) at the bottom-left corner; outer container carries `data-canvas-chrome`. `fitToView` insets measured before and after dock land within ±2px. e2e covers sheet-inspector overlap (600×900), rapid-toggle pill continuity, debug-menu-future decision recorded. existing testids `save-status-pill` and `family-view-debug-layout-metrics` resolve unchanged.

**scope:**

- **probe / spike first** (before naming the contract in code): write `register(...)` for three item shapes — (a) `SaveStatusPill` (rich-prop component), (b) layout-metrics panel (component with internal `$state`), (c) debug-timings inline div. pick the snippet/component shape that fits the worst case; delete the losers. record the chosen contract in plan log
- new file `apps/web/src/lib/components/canvas/CanvasChromeDock.svelte` — accepts a `corner` prop, reads from `dockRegistry`, renders sorted items; only the `bl` corner mounts in this phase. fails loudly if any item registers for an unmounted corner
- new file `apps/web/src/lib/components/canvas/dockRegistry.svelte.ts` — `$state`-backed map; `register(id, item)` / `unregister(id)` helpers; documented priority-space convention (status 0-99, tools 100-199, debug 200-299) at module top. test teardown helper that asserts the registry is empty after each test (so test isolation is enforced; if it can't be enforced via module-global state, switch to a context-provided registry)
- the bottom-left dock mounts once in `App.svelte` (or in `FamilyViewCanvas`, decision recorded in phase log); outer container carries `data-canvas-chrome`; outer container is `z-30` (matches today's bottom-bar); per-item popovers manage their own stacking
- migrate `SaveStatusPill` to register at id `"save-status"`, corner `"bl"`, priority `10`, kind `"pill"`; delete the inline mount at App.svelte:2168-2181 (rest of the bottom-bar wrapper stays — dismantled in phase 1)
- migrate layout-metrics panel to register at id `"family-view-layout-metrics"`, corner `"bl"`, priority `230`, kind `"panel"`; delete its per-element `position/top/right/z-index` rules; keep inner content, collapse logic, all `data-testid`s
- css-var bridge: `App.svelte` measures debug menu's outer rect via `bind:this` + `ResizeObserver` + `$effect` on `debugOpen`; sets `--debug-menu-bottom` / `--debug-menu-height` on canvas-host. `Inspector.svelte` similarly exports `--inspector-sheet-height` on canvas-host when `isSheet === true`. when none of these vars are set, the dock's `calc(var(..., 0px) + var(..., 0px) + var(..., 0.75rem) + 0.5rem)` defaults take over
- **decisions locked 2026-05-25 (recorded in `log.md`):** (a) dock mounts in `App.svelte`; (b) `register(...)` takes a svelte snippet; (c) debug menu is a **deferred** dock item — css-var bridge is acknowledged temporary scaffolding, follow-up filed in `bugs.md`; (d) sheet-inspector resolved via `--inspector-sheet-height` css-var bridge from `Inspector.svelte`; (e) visual snapshots deferred to phase 5 — phases 0-4 use logic e2e only
- e2e (`tests/e2e/canvas-chrome-dock.spec.ts`): (a) `save-status-pill` testid resolves inside the dock; (b) toggle `showLayoutMetrics`, panel renders inside dock; (c) `fitToView` insets before/after dock — within ±2px; (d) recenter after selection — no card overlaps dock bbox; (e) toggle `debugOpen` at 1440×900 and 800×600 — dock anchor moves; falls back when menu closes; (f) 600×900 with sheet inspector open — no docked item overlaps inspector bbox; (g) rapid-toggle a layer 10× — `[data-testid=save-status-pill]` continuously present, never absent for a frame
- `pnpm verify` green

## phase 1 — migrate every existing bottom-bar pill through the registry

**status:** closed in `8237fae` (pending merge) · 2026-05-25

**entry condition** (added by plan-revise after phase 0): worktree has `notes/examples/` available (symlink from main repo is fine — the path is gitignored). without it, `pnpm test:e2e` fails at fixture read for most suites. verify with `ls notes/examples/ | head` before code lands.

**definition of done:** all three remaining bottom-bar pills register through the dock in this order — **debug-timings → stats → debug-icon** — at documented priorities. the inline bottom-bar flex wrapper at App.svelte:2160-2290 is deleted; its `data-canvas-chrome` responsibility lives only on the dock. all four pills (including SaveStatusPill from phase 0) render at the same visual positions as before; testids `stats-pill`, `debug-pill`, `debug-corner-readouts` resolve unchanged. stats popover bbox is directly above its trigger pill (e2e). when every guard is false, the corner reports zero chrome inset. the four phase-0 e2e cases that were deferred (b, c, e, g in `canvas-chrome-dock.spec.ts`) re-run and pass.

**scope:**

<!-- order changed by plan-revise after phase 0: debug-timings first to retire the third register() shape (inline div) before the other two pills depend on the contract; stats second to prove popover anchoring; icon last as the simplest -->

- **debug-timings first** (inline-div register() shape spike): register debug-timings/editRev pill (`debugOpen`) at id `"debug-timings"`, corner `"bl"`, priority `40`, kind `"pill"`. confirm the snippet wrapper handles a plain `<div>` with inline text content (no internal state, no rich props). if snippet fails, halt and run `plan-revise` — the contract needs reshape before the other two pills depend on it
- **stats pill second** (popover-anchor proof): register (`statsPillVisible && layoutStats`) at id `"stats"`, corner `"bl"`, priority `20`, kind `"pill"`. the registered render snippet must include a `position: relative` wrapper around the trigger so the popover's `absolute bottom-full left-0` anchors correctly. note: `CanvasChromeDock.svelte` already wraps each item in `<div class="pointer-events-auto relative">` — verify this is sufficient or move the relative wrapper into the snippet itself. add the popover-anchor e2e (popover bbox directly above trigger) before moving on
- **debug-icon last**: register debug-icon button (`!debugPillHidden`) at id `"debug-toggle"`, corner `"bl"`, priority `30`, kind `"pill"`
- delete the inline `<div class="...flex...">` wrapper at App.svelte:2160-2167 and 2273-2293; the dock's outer container is now the sole `data-canvas-chrome` carrier in this region
- empty-corner test: with `readOnly && !statsPillVisible && debugPillHidden`, `measureCanvasChromeInsets` for the bottom-left corner returns zero. the dock already unmounts when its items list is empty (verified in phase 0); confirm this still holds after the wrapper deletion
- assert at registration time that no item registers for corners other than `bl`; the `CanvasChromeDock` mount guard from phase 0 already throws — confirm it still fires
- re-run phase-0 e2e cases b/c/e/g now that the bottom-bar wrapper is gone. if they still fail, file a fresh blocker (`canvas-chrome-dock-e2e-click-handler`) and run `plan-revise` to add a diagnostic phase before phase 2
- manual screenshot review at 1440×900 in light + dark themes before/after — pixel diff shows no material shift (≤ 2px). per phase 0 decision (e), automated visual coverage lands in phase 5; capture the manual review in the phase-1 retro
- `pnpm verify` green; `pnpm test:e2e -- canvas-chrome-dock` green (all 7 cases)

## phase 2 — pill minimize replaces collapsed-rectangle

**status:** closed in `791bd38` (pending merge) · 2026-05-25

**definition of done:** the layout-metrics panel (migrated in phase 0) renders, when collapsed, as a pill that shares the `.fte-pill` chrome with the bottom-bar pills: ≤ 1.75rem tall × ≤ 10rem wide, glyph + label + status text. clicking the pill expands; expanding restores body content. worst-case status string enumerated per panel and confirmed within the cap or truncated.

**scope:**

<!-- plan-revise after phase 0: dropped the "30-minute pill-shape spike". the snippet contract is already proven by phase 0 + phase 1, so the natural pill is a small `CanvasChromePill.svelte` component that takes snippet children. no A/B needed -->

- new file `apps/web/src/lib/components/canvas/CanvasChromePill.svelte` — small component with props `{ id, label, glyph?, statusText?, expanded, onclick }`; renders the rounded-full chip using `.fte-pill` tokens. body content (when expanded) renders above the pill row via a snippet slot
- enumerate worst-case status string per panel (focus log: `focus events · 999+`, coi: `coi · 12.34%`, layout metrics: `LM · 12345.6ms`, off-subset: `off-subset · alice longname`, recenter-missed: `no recenter · alice`); confirm each fits within 10rem at the smallest supported font-size, or widen the cap / truncate with ellipsis (recorded)
- replace layout-metrics panel's collapsed-header rendering with the pill component; expanded form stays a full panel above the pill row. preserve `data-collapsed`, `aria-expanded`, existing toggle `data-testid` (pill carries the same testid the header button had)
- manual screenshot of the pill at desktop + mobile widths in the phase retro (automated visual coverage deferred to phase 5 per phase 0 decision (e))
- `pnpm verify` green; existing phase-5 collapse e2e (from the family-view-debug plan) still passes

## phase 3 — migrate every remaining family-view debug panel through the registry

**status:** closed in `4fbcee2` (pending merge) · 2026-05-25

**definition of done:** focus log, coi breakdown, off-subset warning badge, recenter-missed badge register with the dock at documented priorities and render as pill-when-collapsed via the phase-2 pill. no `position: fixed` rules remain in `FamilyViewDebugOverlay.svelte` outside the recenter-flash element. badge salience decision (alert-pill / auto-expand-on-appear / stay-outside-dock) recorded in plan log *before* code lands. e2e triggers each badge condition and asserts the user perceives it per the decision.

**scope:**

- decision-first: for off-subset and recenter-missed badges, pick one of (a) alert-pill variant with red/orange retained inside the dock, (b) auto-expand-on-appear pill that the user can re-collapse, (c) stay outside dock as transient status flashes (still using shared pill chrome). record decision
- register panels in priority order (top-to-bottom in the corner stack): off-subset (priority `200`), recenter-missed (`210`), coi breakdown (`220`), focus log (`225`), layout metrics already registered at `230` in phase 0
- delete all panel-local `position/top/right/left/bottom/z-index` css rules in `FamilyViewDebugOverlay.svelte`; keep colour/border/font per-panel
- update each existing e2e asserting panel position to query through the dock instead of viewport coords
- e2e: trigger off-subset and recenter-missed conditions; assert visibility per the chosen decision
- `pnpm verify` green

## phase 4 — overflow handling when a corner's stack exceeds its cap

**status:** closed in `21e27f1` (pending merge) · 2026-05-25

**definition of done:** with all panels expanded on a 720px-tall viewport, no panel's body extends below the corner's available height. when natural stack height exceeds the cap, the dock walks the corner's items lowest-priority-first and force-collapses one panel at a time until the stack fits, all in a single `requestAnimationFrame` pass. forced-collapses unwind when the viewport grows or a panel closes. e2e asserts no clipping and zero layout-thrash warnings.

**scope:**

- per-corner `naturalHeight` and `cornerMaxHeight`, measured once per measurement window via `rAF`; when `naturalHeight > cornerMaxHeight`, walk the corner's panels lowest-priority-first (pills cannot force-collapse — they have no expanded form) and force `collapsed = true` until natural-height-with-forced-collapses (computed against known pill height ~1.75rem and known expanded heights, *not* re-measured live) fits
- forced-collapse is purely visual; user-toggled collapse state is preserved separately and restored when the forced collapse unwinds
- dock container per corner is `role="region"` with `aria-label="canvas chrome · {corner}"`; forced-collapsed pills carry `aria-expanded="false"` and `data-forced-collapse="true"`
- fallback: if even the all-pills stack exceeds the cap (shouldn't happen outside mobile), enable `overflow-y: auto` on the corner container
- e2e: open all panels, force viewport to 720px tall, assert each panel's bbox is inside its corner's bbox, no panel clipped, no console warnings about layout-shift
- <!-- plan-revise after phase 3: cramped desktop is now a real risk with 5 panels -->
- additional e2e: at 1024×720 with all five panels expanded simultaneously, assert no panel is clipped — covers the cramped-desktop case phase 3 surfaced
- `pnpm verify` green

## phase 5 — polish, parity, and notes

**status:** closed in `796171c` (pending merge) · 2026-05-26

**definition of done:** dock visual matches debug-menu chrome (same border, blur, elevation tokens); contrast verified in light + dark themes; mobile fallback verified at 380×740 in the visual snapshot suite; `notes/agents.md` (or closest existing canvas-chrome section) gets a one-paragraph pointer plus the priority-space convention; no console errors when all toggles fire in sequence.

**scope:**

- consolidate dock + pill css with debug-menu chrome via the same tailwind tokens (`border-line`, `bg-canvas-elev/95`, `shadow-xl`, `backdrop-blur`)
- light/dark theme audit across all migrated pills + panels
- mobile fallback: when `window.innerHeight < 600`, dock initializes all panels (not pills) as collapsed regardless of prior user toggle; an "expand all" affordance lives in the debug menu's family-view section (one button, no per-panel control)
- **add `tests/e2e/visual-canvas-chrome-dock.spec.ts`** (deferred from phases 0-4 per phase 0 decision (e)): `toHaveScreenshot()` at 1440×900 light + dark (bl corner all open, all pill), 600×900 sheet-mode (dock anchors above inspector), 380×740 mobile (mobile fallback to pills), plus the layered + hyperbolic engines if their corners differ
- <!-- plan-revise after phase 0: bundle worktree-bootstrap docs/script with this phase's docs sweep -->
- **document worktree setup** in `notes/agents.md` (or `notes/dev/process.md`): one-paragraph "setting up a worktree for this repo" section explaining the `notes/examples/` gitignored-fixture pattern and the symlink workaround, plus a note that the dev server may conflict with a live container running on the same port. add an optional `scripts/setup-worktree.sh` that, given a worktree path, runs `ln -s <repo-root>/notes/examples <worktree>/notes/examples`. closes `worktree-fixture-bootstrap-undocumented`
- <!-- plan-revise after phase 1: fold dock-overshoots-host-on-small-mobile into the mobile-fallback pass -->
- **clamp the dock's `bottom:` anchor against canvas-host bounds.** on small mobile viewports (verified at Pixel 7 / 412×915 and 380×740) the existing `calc(var(--inspector-sheet-height, 0px) + var(--debug-menu-bottom, 0.75rem) + var(--debug-menu-height, 0px) + 0.5rem)` overshoots: the dock's top edge floats above the canvas-host, `measureCanvasChromeInsets` skips it (off-host guard), and `fitToView` centres content as if no chrome were present. fix options: (a) publish a `--debug-menu-effective-height` that already accounts for canvas-host height, or (b) compute the dock's `bottom:` as `min(natural-anchor, canvas-host.height - dock-height - 0.5rem)`. choose during phase 5. add an e2e at 412×915 and 380×740 asserting the dock's bbox stays inside the canvas-host, debug menu open. closes `dock-overshoots-host-on-small-mobile`
- backfill a unit test for the `updateItem(id, patch)` registry helper added mid-phase-1 (currently only exercised end-to-end)
- final smoke e2e: open menu, switch to family-view, toggle every debug layer in sequence, assert zero console errors and dock renders cleanly
- update `notes/agents.md` with a paragraph documenting: the dock pattern, the priority-space convention, how to register a new pill or panel, and which corners are mounted
- `pnpm verify` green

## verification

- `pnpm verify` (lint + typecheck + unit + e2e) at the end of every phase
- per-phase manual smoke: load a known tree, switch to family-view, ctrl+shift+d, toggle each affected debug layer, screenshot before/after
- visual: screenshots at 1440×900 (desktop), 1024×720 (cramped desktop), 600×900 (narrow), 380×740 (mobile). expected: each corner's items stack cleanly, no overlap, no clipping at any size
- accessibility: tab through each docked item; pills are reachable; aria-expanded reflects state; screen-reader label includes pill/panel name + status text
- canvas-chrome contract: at every phase end, manually trigger a `fitToView` (e.g. by switching engines or pressing the recenter shortcut) and confirm the tree centres above the dock — not under it

## critical files

- `apps/web/src/lib/components/canvas/CanvasChromeDock.svelte` — new in phase 0
- `apps/web/src/lib/components/canvas/dockRegistry.svelte.ts` — new in phase 0
- `apps/web/src/lib/components/canvas/fitMath.ts` — read-only; the [`measureCanvasChromeInsets`](../../../apps/web/src/lib/components/canvas/fitMath.ts#L120-L160) contract the dock must satisfy
- `apps/web/src/App.svelte` — bottom-bar pills migrated in phase 1; debug menu's rect exposed as CSS vars in phase 0
- `apps/web/src/lib/components/shell/SaveStatusPill.svelte` — registers with dock in phase 0
- `apps/web/src/lib/components/tree/FamilyViewCanvas.svelte` — debug overlay mount point at lines ~1389-1413
- `apps/web/src/lib/components/tree/FamilyViewDebugOverlay.svelte` — every fixed-position panel moves into the dock; SVG overlays untouched (lines 1086-1345 hold the DOM panels in scope)
- `apps/web/src/lib/components/canvas/CanvasChromePill.svelte` — new in phase 2 (or a snippet inside the dock; decision recorded in phase 2 log)
- `apps/web/tests/e2e/canvas-chrome-dock.spec.ts` — new in phase 0, extended through phases 1-4

## notes / followups

- the recenter-flash full-viewport border pulse stays where it is; it is a status flash, not a panel, and shouldn't be docked
- `BackButton` (top-left) is intentionally out of scope this round; if it later wants priority-sorting beside other top-left items, registering it is a one-line change
- modals (`CommandPalette`, `ShortcutsOverlay`), `Toasts`, `Inspector`, and `ZoomWidget` are explicitly out of scope (see non-goals); none is corner-anchored chrome
- if the dock proves useful, consider extending priority-sorted registration to the layered engine's `DebugOverlay.svelte` panels in a future plan — out of scope here
- App.svelte's CSS-var exposure remains the only coupling between debug menu and dock; if the menu ever becomes a separate component (likely), the var-set logic moves with it
