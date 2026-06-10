# migrate debug menu into canvas-chrome dock

**status:** shipped (merge pending) · slug `migrate-debug-menu-into-dock` · drafted 2026-05-26 · closed 2026-05-26 · closing commit `9e6113d` (pre-rebase) / `6efc2db` (post-rebase)

## context

the canvas-chrome-dock plan (shipped 2026-05-26, archived at `.claude/plans/archived/canvas-chrome-dock/`) consolidated every bottom-bar pill and every family-view debug panel into one priority-sorted dock at the `bl` corner. one item was intentionally deferred: the debug menu itself ([App.svelte:2381-2690](../../../apps/web/src/App.svelte#L2381-L2690)). it still lives as a `position: absolute; bottom-14 left-3 z-40` sibling with its own `data-canvas-chrome`, and the dock anchors above it via a temporary css-var bridge (`--debug-menu-bottom`, `--debug-menu-height`) flagged at [CanvasChromeDock.svelte:96](../../../apps/web/src/lib/components/canvas/CanvasChromeDock.svelte#L96) as scaffolding.

the trailing symptom is filed in [notes/bugs.md:52](../../../notes/bugs.md#L52): on Pixel 7 mobile (412×915) the sheet-mode inspector overlaps the menu's toggle buttons, blocking interaction. three e2e specs are wedged at exactly that point (`family-view-debug-coi.spec.ts:74-75` ×2, `family-view-debug-navigation.spec.ts:55-56` ×1, all waiting on `getByTestId("debug-panel")` toggle clicks). once the menu lives inside the dock, the dock's existing `--inspector-sheet-height` bridge plus the phase-5 anchor clamp resolve the overlap — the menu becomes part of the dock's measured natural height.

this plan completes the migration: register the menu as a `kind: "panel"` dock item at priority `300` (above family-view debug panels at 200-230), drop the menu's own positioning rules, and delete the css-var bridge that goes dead the moment the registration lands. pre-mortem (sibling `pre-mortem.md`) confirmed phase 1's bridge deletion has zero external consumers in `apps/web/src/`, `apps/web/tests/`, and `apps/server/`, so it merges into a single phase.

## goals

- the debug menu mounts inside `CanvasChromeDock` as a registered item at corner `bl`, priority `300`, `kind: "panel"`, opting out of the dock's force-collapse pass via a new `forceCollapsible: false` flag on `DockItem`
- the menu's div retains its existing `data-testid="debug-panel"`, `role="dialog"`, `aria-label`, and close-x affordance; pre-existing e2e queries continue to resolve
- on Pixel 7 (412×915) with the sheet inspector open, every `debug-toggle-fv-*` button inside `debug-panel` is reachable; the three currently-wedged e2e specs pass
- the css-var bridge in [App.svelte:266-292](../../../apps/web/src/App.svelte#L266-L292), the `debugMenuEl` `$state` at App.svelte:228, and the `--debug-menu-bottom` / `--debug-menu-height` arms of the dock's `bottom:` calc all delete in the same change — they go dead-code the moment the menu becomes a registered item
- `pnpm verify` green; no visual or interaction regression on desktop (1440×900), narrow (600×900), or mobile (Pixel 7)
- left-inset shift from consolidating the menu's bbox into the dock's bbox stays within ±5px of the pre-change `measureCanvasChromeInsets` reading

## non-goals

- redesigning the menu's internal sections, toggles, or visual contract
- changing the debug-toggle pill's behaviour (it still flips `debugOpen`; the menu's mount/unmount is still gated on `debugOpen`)
- moving other floating chrome (modals, toasts, inspector, zoom widget, back button) — same exclusions as the parent plan
- introducing a `kind: "menu"` enum value — the surgical `forceCollapsible` opt-out is preferred over expanding the kind taxonomy. notes/followups records this as the one-line migration path if a future plan needs it
- persisting menu open/close across sessions

## constraints

- project style: lowercase inline comments, no trailing periods, regular dashes, american english, spaces for indent, brief over long
- svelte 5 runes; tailwind v4 tokens; `exactOptionalPropertyTypes` ts
- the dock's force-collapse pass currently filters by `kind === "panel"` at [CanvasChromeDock.svelte:261-263](../../../apps/web/src/lib/components/canvas/CanvasChromeDock.svelte#L261-L263) — the new opt-out must integrate without breaking the existing four panels that DO want force-collapse (off-subset 200, recenter-missed 210, coi 220, focus 225, layout-metrics 230)
- `measureCanvasChromeInsets` already reads `data-canvas-chrome` on the dock outer container; the menu's own `data-canvas-chrome` attribute must be deleted so we don't double-count
- the menu's `w-72 max-h-[80vh] overflow-y-auto` styling must adapt: on small viewports `80vh` plus the rest of the bl stack exceeds `cap`, and the dock's all-pills-still-overflows fallback at [CanvasChromeDock.svelte:282-283](../../../apps/web/src/lib/components/canvas/CanvasChromeDock.svelte#L282-L283) flips to `overflow-y: auto` on the corner. plan clamps menu height with a viewport-aware variant (final form chosen during implementation; default candidate `max-h-[min(80vh,calc(100vh-12rem))]`) so menu shrinks with viewport
- pre-mortem flagged that with menu inside the dock at priority 300 + `forceCollapsible: false`, on Pixel 7 the menu's natural height alone consumes most of the cap and the dock force-collapses every family-view debug panel to its pill form whenever the menu is open. this is **expected and documented behaviour** — primary control surface beats glance-and-go status — but must be called out so the next debugger doesn't treat the auto-collapse as a regression

## accepted risks

pre-mortem (sibling `pre-mortem.md`) raised six findings — three high, two medium, one low. residue after fold:

- **menu always counts at natural height (high).** at priority 300 with `forceCollapsible: false` the dock projects the menu at its full measured height every frame. on small viewports this force-collapses every other debug panel to pill. **accepted behaviour** — the menu is the primary control surface for debug. DoD asserts this via e2e: on Pixel 7 with menu open + all family-view debug toggles on, the four pre-existing debug panels (off-subset/recenter-missed/coi/focus/layout-metrics) all carry `data-forced-collapse="true"`, AND the menu itself is fully visible (no `overflow-y: auto` engagement on the corner). the viewport-aware menu max-height keeps this true on Pixel 7
- **inert bridge is one refactor mistake from double-counting (high).** the bridge `$effect` early-returns when `debugMenuEl` is undefined, but a future author rebinding the ref accidentally would re-engage it. eliminated by deleting bridge + ref + css-var arms in the same change, not staged across two phases
- **viewport-aware menu height clamp (high).** `max-h-[80vh]` (~732px at Pixel 7) ate the cap. switching to `max-h-[min(80vh,calc(100vh-12rem))]` (or equivalent — measured during phase 0) keeps the menu under the dock cap on mobile while preserving its desktop max. choose final value during phase 0 from the measured Pixel-7 cap; record the decision in the closing log
- **left-inset shift from chrome-bbox consolidation (medium).** `measureCanvasChromeInsets` at [fitMath.ts](../../../apps/web/src/lib/components/canvas/fitMath.ts) reads each `[data-canvas-chrome]` bbox and reduces it to per-edge insets via `Math.min(vertical, horizontal)`. pre-migration the menu bbox (~290×732) charged ~290 to left inset; post-migration the dock's combined bbox (~290 wide × full menu+stack height) still charges ~290 to left inset — same width budget. `fitToView`'s recenter should match within ±5px. DoD: measure before and after on the same fixture
- **snippet rapid-toggle race (medium).** `register()` throws on duplicate id. the parent plan's phase-0 fix (`untrack` + `updateItem`) handles depth-exceeded but the rapid-debugOpen-toggle path was never asserted. add a flushSync rapid-toggle unit test that opens / closes the menu 10× in a tight loop and asserts the registry never throws and ends in the closed state
- **`forceCollapsible` thread completeness (low).** [DockRegistration.svelte:56](../../../apps/web/src/lib/components/canvas/DockRegistration.svelte#L56) builds a `next = { corner, priority, kind, render }` patch for `updateItem`; the new field must be added. trivial in code, easy to miss in review; the unit test for round-tripping `forceCollapsible: false` catches it

pivot criterion: if registering the menu in the dock causes any of (a) the menu to render outside the canvas-host on Pixel 7, (b) `fitToView` to centre off by more than 5px on the same fixture, (c) any of the three currently-wedged e2e specs to remain red after the migration, stop and run `plan-revise` — the consolidation has failed its premise.

## phase 0 — register the menu in the dock and dismantle the bridge

single-phase plan. walking skeleton + cleanup happen together because the css-var bridge becomes dead code the moment the menu is no longer a `position: absolute` sibling; grep confirmed zero external consumers, so staging the bridge deletion adds no safety margin.

**definition of done:**

- `forceCollapsible?: boolean` field exists on `DockItem` (default `true`); the dock's force-collapse pass at `CanvasChromeDock.svelte:261-263` skips items with `forceCollapsible === false`; `DockRegistration` threads the prop through both the mount-time `register` call and the `updateItem` patch object
- the debug menu registers at `id: "debug-menu"`, `corner: "bl"`, `priority: 300`, `kind: "panel"`, `forceCollapsible: false`, gated on `{#if debugOpen}`
- the menu's outer div drops `position: absolute`, `bottom-14`, `left-3`, `z-40`, and the `data-canvas-chrome` attribute. menu height clamp switches from `max-h-[80vh]` to a viewport-aware variant (final value chosen during phase 0 — must keep menu fully visible on Pixel 7 with sheet inspector open). every other attribute on the menu div (testid `debug-panel`, role, aria-label, w-72, overflow-y, bg/border tokens, inner content) stays
- the css-var bridge `$effect` at App.svelte:266-292, the `debugMenuEl` `$state` at App.svelte:228, the canvas-host element ref comment block at App.svelte:223-228 (kept only insofar as it still applies to `canvasHostEl` for the inspector bridge), and the `--debug-menu-bottom` / `--debug-menu-height` arms of `cornerStyle` at CanvasChromeDock.svelte:96 all delete. dock's `bottom:` calc collapses to `calc(var(--inspector-sheet-height, 0px) + 0.75rem)`. `grep -r 'debug-menu-bottom\|debug-menu-height\|debugMenuEl' apps/web/` returns zero hits
- unit test: `forceCollapsible: false` round-trips through `register` / `itemsForCorner` and is propagated by `updateItem`; rapid `register`/`unregister` cycle (10× via flushSync) doesn't throw and ends in the expected state
- e2e: `family-view-debug-coi.spec.ts` and `family-view-debug-navigation.spec.ts` (the three currently-wedged cases) pass on Pixel 7. new case in `canvas-chrome-dock.spec.ts` at 412×915 with sheet inspector open: every `debug-toggle-fv-*` button inside `debug-panel` is `toBeVisible()` and accepts a click without intercept; the four debug panels (off-subset / recenter-missed / coi / focus / layout-metrics — whichever are toggled on) carry `data-forced-collapse="true"` while menu is open; menu's own body is fully visible (no `.fte-dock-overflow-scroll` class on the corner)
- e2e: at 1440×900, recenter the canvas with menu open + one expanded debug panel; `fitToView` lands within ±5px of the pre-migration recenter on the same fixture (captured as a numeric assertion, not a screenshot)
- regenerate any `visual-canvas-chrome-dock.spec.ts` snapshots that capture the bl corner with menu open; audit the diff to confirm only the bl chrome changed
- `pnpm verify` green

**scope:**

- [dockRegistry.svelte.ts](../../../apps/web/src/lib/components/canvas/dockRegistry.svelte.ts): add `forceCollapsible?: boolean` to `DockItem`; treat as `true` when undefined at consumer sites. extend the priority-convention comment block at lines 13-16 with one line: `300+   menus / primary control surfaces (set forceCollapsible: false)`
- [CanvasChromeDock.svelte](../../../apps/web/src/lib/components/canvas/CanvasChromeDock.svelte): in `measureAndForceCollapse`, change the collapsibles filter from `it.kind === "panel"` to `it.kind === "panel" && it.forceCollapsible !== false`. projection arithmetic (`project(...)` at lines 212-224) unchanged — menu still counts at its measured height, dock force-collapses everything else around it. also delete the `--debug-menu-bottom` / `--debug-menu-height` arms of the `cornerStyle` calc at lines 93-97 and update the comment header at lines 86-92 to reflect the post-migration anchor (`--inspector-sheet-height` only)
- [DockRegistration.svelte](../../../apps/web/src/lib/components/canvas/DockRegistration.svelte): thread `forceCollapsible?: boolean` through `Props`, the mount-time `register({ id, corner, priority, kind, render, forceCollapsible })` call at line 44, and the `next = { corner, priority, kind, render, forceCollapsible }` patch at line 56. preserve `untrack` discipline at both sites — the field follows the same pattern as the other props
- [App.svelte](../../../apps/web/src/App.svelte):
   - wrap the menu's content (lines 2381-2689) in a `{#snippet debugMenuPanel(_ctx)}` template. the snippet's outer wrapper is the menu's own div; testid and role stay on the same element
   - strip from the menu div: `bind:this={debugMenuEl}`, `pointer-events-auto absolute bottom-14 left-3 z-40`, and `data-canvas-chrome`. switch `max-h-[80vh]` to the viewport-aware clamp (final form chosen during implementation; recorded in log)
   - register: `<DockRegistration id="debug-menu" corner="bl" priority={300} kind="panel" forceCollapsible={false} render={debugMenuPanel} />` gated on `{#if debugOpen}`
   - delete: `debugMenuEl` `$state` at line 228; the entire bridge `$effect` block at lines 266-292; trim the comment block at lines 223-228 to keep only the part about `canvasHostEl` (which the inspector-sheet bridge still uses)
- unit test backfill in [dockRegistry.test.ts](../../../apps/web/tests/unit/components/canvas/dockRegistry.test.ts):
   - `forceCollapsible: false` registers and is readable via `itemsForCorner`; default (omitted) round-trips as `undefined`; `updateItem` mutates the field in place
   - rapid register/unregister cycle (10× tight loop, flushSync between each) ends with item absent and no throw — mirrors the menu's `{#if debugOpen}` toggle path
- e2e:
   - re-run the three currently-wedged specs on Pixel 7 (`family-view-debug-coi.spec.ts`, `family-view-debug-navigation.spec.ts`); they should pass without test changes
   - extend `canvas-chrome-dock.spec.ts` with one new mobile case at 412×915: open inspector to sheet mode, open debug menu, assert every `debug-toggle-fv-*` button is visible + clickable without intercept; assert that with menu open the four toggled-on debug panels carry `data-forced-collapse="true"`; assert the `bl` corner does NOT carry `.fte-dock-overflow-scroll`
   - extend `canvas-chrome-dock.spec.ts` with a desktop recenter case at 1440×900: capture `fitToView` pan delta on a known fixture with menu open + layout-metrics expanded, assert the value is within ±5px of a baseline captured against trunk pre-migration (baseline value committed as a constant in the spec, calculated during phase 0)
- documentation:
   - update the canvas-chrome paragraph in [notes/agents.md](../../../notes/agents.md) (added by parent plan's phase 5): one line noting the menu is now a dock item, one line documenting the `forceCollapsible: false` opt-out for primary control surfaces
   - close `migrate-debug-menu-into-dock` in [notes/bugs.md:52](../../../notes/bugs.md#L52) with a one-line fix note linking to the closing commit, on phase completion
- `pnpm verify` green

## verification

- `pnpm verify` at phase close (lint + typecheck + unit + e2e)
- manual smoke on chromium at 1440×900: open menu, toggle a debug layer, scroll the menu body, close via the x. dock stack reads pills (bottom) → debug panels → menu (top) top-down
- mobile smoke on Pixel 7 (412×915): open inspector to sheet mode, open debug menu, click every toggle button — none intercepted by the sheet
- canvas-chrome contract: with menu open + layout-metrics expanded, recenter the canvas; the tree centres above the dock stack (`measureCanvasChromeInsets` returns a value that includes the menu's height)
- e2e: `pnpm -F web exec playwright test canvas-chrome-dock family-view-debug-coi family-view-debug-navigation`
- regression: `pnpm -F web exec playwright test family-view-debug-phase5` (force-collapse + anchor-clamp specs from the parent plan must still pass)

## critical files

- [apps/web/src/lib/components/canvas/dockRegistry.svelte.ts](../../../apps/web/src/lib/components/canvas/dockRegistry.svelte.ts) — new `forceCollapsible?` field, updated priority-convention doc
- [apps/web/src/lib/components/canvas/CanvasChromeDock.svelte](../../../apps/web/src/lib/components/canvas/CanvasChromeDock.svelte) — collapsibles filter change; calc simplification
- [apps/web/src/lib/components/canvas/DockRegistration.svelte](../../../apps/web/src/lib/components/canvas/DockRegistration.svelte) — thread `forceCollapsible?` prop through register + updateItem patch
- [apps/web/src/App.svelte](../../../apps/web/src/App.svelte) — menu wrapped in snippet + registered; bridge `$effect` + `debugMenuEl` + chrome-attribute deleted
- [apps/web/tests/unit/components/canvas/dockRegistry.test.ts](../../../apps/web/tests/unit/components/canvas/dockRegistry.test.ts) — new tests for `forceCollapsible` round-trip + rapid register/unregister
- [apps/web/tests/e2e/canvas-chrome-dock.spec.ts](../../../apps/web/tests/e2e/canvas-chrome-dock.spec.ts) — new mobile-sheet case at 412×915 + desktop recenter ±5px case at 1440×900
- [notes/bugs.md](../../../notes/bugs.md) — close `migrate-debug-menu-into-dock` entry on completion
- [notes/agents.md](../../../notes/agents.md) — one-line update + `forceCollapsible` opt-out documented in the canvas-chrome paragraph

## notes / followups

- `forceCollapsible: false` is now available for any future dock item that's a primary control surface rather than glance-and-go chrome. document the convention in the dock paragraph of `notes/agents.md` so the next author doesn't reinvent it
- if a future plan introduces a dedicated `kind: "menu"` enum (rejected here as too wide), the `forceCollapsible` field becomes a compatibility shim and the per-callsite migration is one line
- the parent plan's phase-5 anchor clamp at [CanvasChromeDock.svelte:301-324](../../../apps/web/src/lib/components/canvas/CanvasChromeDock.svelte#L301-L324) is now load-bearing for the menu's mobile presentation. if anchor-clamp logic changes in a future plan, regression-test against the Pixel-7 menu+sheet-inspector scenario
