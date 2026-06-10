# canvas window manager — unified floating-window primitive

**status:** shipped 2026-05-27 (merge pending) · phases 0-5 closed; phase 5 closing commit `8517e45` · slug `canvas-window-manager` · drafted 2026-05-26 · revised 2026-05-27

## context

three plans into the canvas-chrome system, the abstraction still doesn't deliver what it promised. the dock unified pill positioning and panel collapse, but **every floating ui surface still invents its own chrome**:

- debug menu: registered dock panel with `data-canvas-chrome` and a custom titlebar (`Debug · Ctrl+Shift+D ×`), padding `px-3 py-2`, width `w-72` ([App.svelte:2392-2395](../../../apps/web/src/App.svelte#L2392-L2395))
- stats popover: inline `absolute bottom-full left-0 z-...` div, no titlebar, padding `px-3 py-2`, width `w-56` ([App.svelte:2283-2330](../../../apps/web/src/App.svelte#L2283-L2330))
- save-status popover: inline `absolute bottom-full left-0 z-40 p-3 w-64` div with its own outside-click handler ([SaveStatusPill.svelte:154-180](../../../apps/web/src/lib/components/shell/SaveStatusPill.svelte#L154-L180))
- zoom-widget popover: `absolute top-full ... z-40 w-72` ([ZoomWidget.svelte:155](../../../apps/web/src/lib/components/canvas/ZoomWidget.svelte#L155))
- family-view debug panels: use `CanvasChromePill` (uniform!), but with no titlebar contract — each panel chooses its own header treatment

the user's 12 reported issues trace back to **seven root-cause gaps**:

1. **no Window primitive.** every surface invents chrome — inconsistent padding, missing close affordance, no shared titlebar
2. **no window-manager runtime.** z-order is ad-hoc `z-30 / z-40`; no focus-to-front, no anti-collision
3. **no minimize-into-pill contract for popovers.** `CanvasChromePill` covers `kind: "panel"` dock items; stats/save/zoom popovers don't register
4. **conflated `debugOpen` vs debug-effects-on.** one flag drives menu visibility AND effect rendering
5. **no configurable-pill model.** a pill's text is hardcoded; popovers can't push a chosen metric back onto the trigger pill
6. **no structured save-status semantics.** local persistence + remote sync collapse into one indicator
7. **no escape hatch from the dock stack.** heavy users can't drag a window aside to reference it while interacting with the canvas

| user issue | root-cause gap |
|---|---|
| 1 coi breakdown doesn't render | functional — investigate in phase 0 5-min repro (may already be closed by migrate-debug-menu force-collapse fix) |
| 2 editRev pill redundant, should live with save | 5 + 6 |
| 3 popups don't share `titlebar _ ×` chrome | 1 |
| 4 popups pile / different padding | 1 + 2 |
| 5 info presented poorly | content design, addressed per-window in phase 4 |
| 6 save status misleading | 6 |
| 7 debug pill/menu/effects flow | 4 |
| 8 stats pill should reflect clicked metric | 5 |
| 9 windows don't avoid each other / front-on-active | 2 + 7 |
| 10 each window needs a dock-pill minimize target | 3 |
| 11 debug menu open lag | perf — root cause captured in phase 0, fix lands phase 4 |
| 12 uniform system promised, not delivered | gaps 1-7 combined |

**the plan fixes the gaps first**, then lands the visible bug fixes once the underlying abstraction supports them.

**chosen architecture (user-confirmed):** hybrid dock-default / pop-out. windows default to dock-stacked (current behaviour). titlebar carries `title  [circle-chevron-down]  [circle-chevron-right]  [square-x]` (minimize, pop-out, close). popped-out windows free-float with drag + z-order; when popped-out, the pop-out control flips to `circle-chevron-left` (re-dock). focused window has accent titlebar treatment.

**save-status icons (user-confirmed):** lucide `laptop-minimal` / `laptop-minimal-check` for local; `cloud` / `cloud-check` / `cloud-off` / `cloud-upload` for remote. two glyphs always visible inside the save pill.

## goals

- one `<Window>` svelte component is the **only** chrome contract for every floating canvas surface: debug menu, stats popover, save popover, family-view debug panels (5 of them), future ones. titlebar is `title  [circle-chevron-down]  [circle-chevron-right]  [square-x]` docked or `title  [circle-chevron-down]  [circle-chevron-left]  [square-x]` popped-out; body is a snippet slot; no caller renders its own border / padding / titlebar
- a `windowManager.svelte.ts` runtime owns focus, pop-out, drag, z-order, bbox clamp
- `dockRegistry` extends to host `kind: "window"` (alongside `pill` and `panel`); every Window has a paired pill; minimize/close returns to the pill
- pop-out / re-dock works; focused window's titlebar has visible accent state; clicking a popped-out window's titlebar brings it to z-front
- popped-out windows clamp inside the canvas-host bbox, re-clamp on sheet-inspector open and window resize
- debug-mode separates from debug-menu-open. `debugMode` is a localStorage-persisted boolean; help menu toggle controls it; debug pill visibility derives from it; closing the menu does NOT clear it
- stats pill is configurable; save-status pill shows two glyphs (local + remote); standalone editRev pill removes; coi breakdown works; debug menu open <50ms p50
- `pnpm verify` green at every phase boundary

## non-goals

- inspector, command palette, shortcuts overlay, toasts, back button, zoom widget remain out of scope (canvas-chrome-dock precedent)
- persisting popped-out window positions across sessions — transient by convention; only `debugMode` persists
- resize handles on windows (drag-to-move only; size = content + viewport-aware max-height clamp)
- a "new window" affordance for callers — system is bounded by the existing registered surfaces
- multi-corner pop-out anchoring — popped-out windows live in canvas-host coordinates, not anchored to a specific corner
- visual snapshot suite added to `pnpm verify` (still opt-in via `PLAYWRIGHT_UPDATE_SNAPSHOTS=1`)
- new windows for layered/hyperbolic engine debug overlays (out of scope; future plan)

## constraints

- project style: lowercase inline comments, no trailing periods, regular dashes, american english, spaces for indent, brief over long
- svelte 5 runes; tailwind v4 tokens; `exactOptionalPropertyTypes` ts
- the dock's force-collapse pass and the `forceCollapsible: false` opt-out (shipped 2026-05-26) must continue to work for `kind: "window"` items
- popped-out windows must NEVER escape the canvas-host bbox; the bbox itself can change (sheet inspector open/close, window resize) and the clamp must follow
- titlebar drag must coexist with the canvas's pan/zoom pipeline; no pointer event leaks; specifically, pointerup on a card after a titlebar drag must NOT register as a card selection or canvas pan
- modals (`CommandPalette`, `ShortcutsOverlay`, sheet-inspector at `z-50`) continue to z-stack above all canvas-chrome windows; the window-manager's max z is bounded at `z-49`
- existing testids (`debug-panel`, `debug-pill`, `save-status-pill`, `stats-pill`, `stats-popover`, `family-view-debug-*` including body/cell-side testids) keep resolving — phase 2 enumerates a mapping table for reviewer signoff
- `<Window>` is the consumer-facing chrome; `<DockRegistration kind="window">` is the registry shim. Window does NOT swallow registration (top-level snippets aren't addressable from `$effect`, per the DockRegistration design note)
- the localStorage key `fte.debug.mode` follows the precedent of `fte.debug.authDryRun` (plain boolean, no schema version — debug-flag precedent, documented in agents.md)

## accepted risks

pre-mortem (sibling `pre-mortem.md`) flagged four high-severity + nine medium + four low. all folded; residue:

- **`Window` prop count is the load-bearing contract claim.** plan-original spiked 8 fields; pivot criterion fires at >5. phase 0 spikes the contract against four hardest callers (debug menu, stats popover w/ trigger-pill back-channel, family-view layout-metrics w/ user-collapse, coi-breakdown w/ tabular body), records the contract verbatim BEFORE any code lands. pivot criterion rewrites to fire on prop count >5 OR need for context provider OR need for caller-side chrome rules
- **popped-out windows ARE chrome** — `measureCanvasChromeInsets` (fitMath.ts:131-184) walks `[data-canvas-chrome]` carriers. plan never decided whether `WindowOverlay`'s wrappers carry the attribute. phase 0 runs a 30-line probe with a fake popped-out box at `(host.right - 320, host.top + 60)`, recenters, captures `fitToView` numbers with and without the attribute. decision baked into `WindowOverlay.svelte` before phase 1
- **focus-z vs priority sort** — dockRegistry sorts on `priority asc, id` (dockRegistry.svelte.ts:101-104). plan-original promised "focused = top of stack" which requires either priority mutation (drifts the 0-99/100-199/200-299/300+ convention) or a separate tiebreaker. phase 0 chooses one: a `focusedAt: number` tiebreaker scoped to `kind === "window"` inside `itemsForCorner`. proof that save-status (priority 10) cannot be reordered under any focus event
- **debug menu lag root cause is unknown** but two strong candidates exist: snippet-identity churn over `treeStore.tree.editRev` / `debugTimings` closures, AND DockRegistration's second `$effect` re-running `updateItem` because its `next` object includes a fresh `render` reference per render (DockRegistration.svelte:61-66). phase 0 captures firefox profiles against trunk; names the root-cause class; phase 4 applies the targeted fix
- **`Window` body-expansion-state model.** today `CanvasChromePill` owns `expanded` + `forcedCollapse` body-suppression (CanvasChromePill.svelte:88-105). when Window replaces it, the model has to handle: (a) user-toggled collapse from caller-owned state (e.g. `collapsed.layoutMetrics`), (b) dock-managed `forceCollapse(id)`, (c) pop-out state (body shows regardless of expansion in popped-out mode). phase 0 chooses one design (caller-owns `expanded`, Window reads `forcedCollapse` from the registry directly, pop-out forces expanded) and records it
- **dock's `scheduleMeasure` reactivity.** the `$effect` at CanvasChromeDock.svelte:175-184 re-runs on `items.length` changes only. popping out a window doesn't change item count → dock doesn't re-measure → force-collapse stays stale. phase 1 adds `popOutStates` membership to the dep set or adds an explicit pop-out → schedule-measure callback
- **drag-to-edge clamp must follow host resize.** sheet inspector publishes `--inspector-sheet-height`; opening it while a window is popped near the bottom-right shrinks the host and the window now overlaps the inspector. phase 1 adds a ResizeObserver on the canvas-host that re-clamps every popped-out entry. e2e covers the case
- **phase-5 anchor clamp anti-jump.** popping out the menu subtracts ~720px of natural dock height; the existing `bottomClampPx` (CanvasChromeDock.svelte:301-324) clears and the dock snaps down. phase 1 adds a one-frame anti-jump hold or a CSS transition on the bottom anchor; e2e on Pixel 7 asserts no jump >1 pill-height
- **`CanvasChromePill` deletion** is the LAST step of phase 2 (not the first), so partial rollback stays cheap if Window's expansion model misses a case
- **modal-precedence band.** popped-out windows use `z-30..z-49`; modals stay `z-50+`. dock outer is `z-30`. recorded as a constraint above
- **engine swap + popped-out state.** family-view debug panels register only when family-view is mounted. engine swap unmounts them. `windowManager.popOutStates` must clear entries whose registry items disappear — `WindowOverlay` iterates `popOutStates ∩ registeredIds`, not just `popOutStates`
- **cascade slot policy.** popping out A, B, closing A, popping out C: C cascades at n = current popped-out count (not a monotonically-increasing index). soft cap at 8 wraps to the second-row cascade
- **pivot criterion.** if phase 0 spike requires a context provider or a registry-side `expandedIds` set analogous to `forcedCollapseIds`, OR if any of the four hardest callers can't ship without per-caller chrome rules, OR if Window prop count exceeds 5 (excluding `id` which the registration provides), stop and redesign

## phase 0 — walking skeleton: contracts, probes, hello-world demo, save-status migration

phase 0 deliberately oversized so the load-bearing decisions land where rollback is cheap (no production callers migrated until the demo proves the abstraction).

**definition of done:**

- **`Window` contract spike (paper-first).** plan log records the contract verbatim against four hardest callers: debug menu (largest sectioned body), stats popover (small body + trigger-pill back-channel via `pillId` + caller-owned `selectedMetric`), family-view layout-metrics (current `CanvasChromePill` consumer with user-toggled `collapsed.layoutMetrics`), coi-breakdown (tabular body + the bug in issue 1). final prop count ≤ 5 excluding `id`. if not, pivot before writing code
- **`data-canvas-chrome` decision for popped-out wrappers.** 30-line probe at `apps/web/src/lib/probes/popout-chrome-probe.svelte`: renders a fake popped-out box at `(host.right - 320, host.top + 60)`, toggles `data-canvas-chrome` via a button, captures `fitToView` numbers before/after via `__treeDebug` console handle. decision recorded in plan log AND baked into `WindowOverlay.svelte`'s wrapper. probe deletes at phase-0 close
- **focus-z-order spike.** `focusedAt: number` field added to `DockItem`. `itemsForCorner` sort changes from `(priority asc, id)` to `(priority asc, focusedAt desc within kind="window", id)`. unit test proves save-status (priority 10, kind="window") is never reordered under any focus event regardless of focusedAt
- **debug-menu lag firefox profile** captured against current trunk (no code changes) — produces `notes/profiles/debug-menu-open-lag-baseline.json.gz`. root-cause class named in plan log (suspect classes: snippet-identity churn / DockRegistration `next`-object churn / `debugOptions` derivation chain / other). fix lands phase 4
- **coi breakdown 5-min repro** against the Akarian fixture: with menu open + coi toggled on, is the panel force-collapsed (pill visible, body empty) OR not registered at all (pill missing)? if force-collapsed, the bug closes against migrate-debug-menu's `16rem` clamp (not this plan). if not registered, carry into phase 4. decision recorded in plan log AND `notes/bugs.md` entry
- **`Window` body-expansion-state model.** chosen: caller owns `expanded: boolean` (mirrors today's `expanded` prop on CanvasChromePill); Window reads `forcedCollapse` directly from the registry; pop-out implicitly forces `expanded=true`. recorded in plan log + `Window.svelte` header comment + a unit test that covers all three branches
- **`Window` ↔ `dockRegistry` boundary.** caller wraps `<Window>` inside `<DockRegistration kind="window" ...>`, NOT the other way around. Window component never calls `register()` internally. recorded in plan log + DockRegistration jsdoc
- **`windowManager.svelte.ts` lands** with: `focusedWindowId: $state<string | null>`; `popOutStates: SvelteMap<id, { x, y, z, focusedAt }>`; actions `focus(id) / blur() / popOut(id) / redock(id) / bringToFront(id) / moveTo(id, x, y)` with bbox clamp reading the canvas-host element via a singleton ref or context. cap z at 49
- **`WindowOverlay.svelte` lands** mounted once in `App.svelte` inside the canvas-host. iterates `popOutStates ∩ registry.idsByKind("window")` — orphan ids (registry item unmounted, e.g. engine swap) DROP from `popOutStates` automatically. carries the `data-canvas-chrome` decision from the probe verdict
- **hello-world demo Window** gated behind a `?windowDemo=1` query param (deleted at phase-0 close). proves on real Pixel 7 hardware: drag (touch + mouse), focus-to-front (between two demo windows), bbox clamp (drag to each edge), pointer-no-fallthrough (drag over a card → no selection, no pan, no `treeStore.dirty`), sheet-inspector resize re-clamp (open sheet inspector → window snaps inward)
- **save-status popover migrated** as the first production caller. inline `absolute bottom-full ... z-40` div in SaveStatusPill.svelte replaced by `<Window>` + `<DockRegistration kind="window" priority={15} forceCollapsible={false}>`. testid `save-status-pill` resolves on the trigger pill; testid `save-status-popover` (if it exists) moves to the Window's body wrapper. existing outside-click-close behaviour preserved
- existing testids `debug-panel`, `stats-pill`, `stats-popover` resolve unchanged (the surfaces still live in their pre-migration form; phase 2 touches them)
- `pnpm verify` green; targeted playwright cases for the demo (gated by `?windowDemo=1`) pass on chromium + Pixel 7

**scope:**

- new `apps/web/src/lib/components/canvas/Window.svelte` — props per contract spike; renders titlebar (title + `circle-chevron-down` minimize + `circle-chevron-right` pop-out / `circle-chevron-left` re-dock when popped-out + `square-x` close) + body snippet; reads `forcedCollapse` from registry; titlebar click triggers `windowManager.focus(id)`
- new `apps/web/src/lib/components/canvas/windowManager.svelte.ts` — state + actions described above; clamp logic uses a ResizeObserver on the canvas-host (set up at WindowOverlay mount)
- new `apps/web/src/lib/components/canvas/WindowOverlay.svelte` — mounts once in App.svelte at canvas-host root; iterates `popOutStates ∩ registry.window-kind-ids`; renders each via the registered snippet; cleans up orphans
- new `apps/web/src/lib/probes/popout-chrome-probe.svelte` — 30-line probe; deletes at phase-0 close
- `dockRegistry.svelte.ts`: extend `DockKind` to `"pill" | "panel" | "window"`; add `focusedAt?: number` to `DockItem`; update `itemsForCorner` sort to include focusedAt-desc tiebreaker scoped to `kind === "window"`; update priority-convention comment block; add `idsByKind(kind: DockKind): string[]` helper for WindowOverlay
- `CanvasChromeDock.svelte`: include `window` in the force-collapse filter (same rule as panel — collapse iff `forceCollapsible !== false`); hide items whose ids are in `windowManager.popOutStates`
- `DockRegistration.svelte`: thread `kind: "window"` parametrically (already kind-agnostic; verify the `next` object includes ALL fields including `focusedAt` and the new `forceCollapsible`)
- `SaveStatusPill.svelte`: extract popover into a snippet; pass as `body` to `<Window>` registered through `<DockRegistration>`; trigger pill stays in its own dock slot
- App.svelte: mount `<WindowOverlay />` inside the canvas-host (sibling of `<CanvasChromeDock>`)
- unit tests: `windowManager.focus(id)` sets focusedAt; `popOut(id)` adds to map with cascade offset; `bringToFront(id)` updates z; `moveTo` clamps; orphan cleanup; dockRegistry sort with focusedAt tiebreaker doesn't reorder pills
- e2e (new file `tests/e2e/canvas-window-manager.spec.ts`): save-status migration validates testid resolution; hello-world demo (gated by `?windowDemo=1`) covers drag, focus-to-front, bbox clamp, pointer-no-fallthrough on chromium + Pixel 7
- profile capture: `notes/profiles/debug-menu-open-lag-baseline.json.gz`; root cause documented in plan log

## phase 1 — pop-out lands in production: dock reactivity + bbox follow + anchor anti-jump

with the demo proving the mechanics, phase 1 wires pop-out for production callers and tightens dock + clamp reactivity.

**definition of done:**

- the pop-out button (`circle-chevron-right` when docked) is enabled on every Window (including save-status). clicking pops out; in popped-out state the same slot shows `circle-chevron-left` (re-dock); clicking re-docks
- cascade offset is `(host.right - 320 + n*24, host.top + 60 + n*24)` where n = current count of popped-out windows in `popOutStates` (NOT a monotonically increasing index). soft cap at 8 → wrap to a second row offset by 32px vertical
- `CanvasChromeDock.scheduleMeasure` re-runs on `windowManager.popOutStates` membership changes — added to the `$effect` dep set or wired via a callback at popOut/redock
- ResizeObserver on canvas-host clamps every popped-out entry on host resize (covers sheet-inspector open and window resize)
- anchor-clamp anti-jump: when a window pops out causing `bottomClampPx` to clear, hold the prior anchor for one rAF before re-measuring against the post-pop projection — visible jump bounded to ≤1 pill-height
- e2e: pop out save-status window, drag 100px right and back, bbox stays inside host
- e2e: pop out two windows; click the lower-z one's titlebar → it becomes top-z
- e2e: drag a window to each canvas-host edge; releases stay inside `host - 8px`
- e2e: pop out a window, then open sheet inspector → window re-clamps inside the post-resize host
- e2e: open dock to force-collapse state (debug menu + coi + layout-metrics expanded on cramped desktop); pop out debug menu → at least one previously force-collapsed panel unwinds within 2 rAFs
- e2e: at 412×915 with full natural dock open, pop out three windows → no popped-out window overlaps the dock's bbox
- e2e: pop out anchor anti-jump on Pixel 7 — dock's `bottom:` shifts ≤1 pill-height during the pop-out frame
- e2e: pointerdown on titlebar, pointermove over a card, pointerup over the card → selection unchanged, `treeStore.dirty` unchanged, window position equals release point
- e2e: same path on Pixel 7 touch — no pointercancel mid-drag, canvas does not pan
- unit: WindowOverlay-rendered snippet closes over caller state correctly (counter probe — increment from inside a popped-out body, assert state mutation reaches the caller)
- `pnpm verify` green

**scope:**

- `Window.svelte`: enable pop-out (`circle-chevron-right`) / re-dock (`circle-chevron-left`) control; titlebar pointerdown handler with `setPointerCapture` + `stopPropagation`; touch + mouse paths share handler
- `windowManager.svelte.ts`: ResizeObserver on canvas-host; cascade-from-current-count math; soft-cap wrap-row
- `CanvasChromeDock.svelte`: anchor anti-jump (one-rAF hold); add `popOutStates` membership to `scheduleMeasure` dep set or hook via callback
- `App.svelte`: confirm `<WindowOverlay>` mount + canvas-host ref wiring carries the resize observer correctly
- e2e file extensions per DoD above

## phase 2 — migrate remaining surfaces; CanvasChromePill retires last

**definition of done:**

- **stats popover** → `<Window>` at `kind: "window"`, priority `25`, `forceCollapsible: false`. body retains the stats list (people / clusters / rev / selected-descendants / selected-coi); rev row stays here through phase 2 but relocates in phase 4
- **debug menu** → re-registers as `kind: "window"`, priority `300`, `forceCollapsible: false`. its custom titlebar (`Debug · Ctrl+Shift+D ×`) deletes; Window's titlebar takes over with `title="Debug · Ctrl+Shift+D"`. body content unchanged
- **family-view debug panels** (off-subset, recenter-missed, coi-breakdown, focus-log, layout-metrics) migrate from `<CanvasChromePill>` to `<Window>`. each retains its current pill identity at the bottom of the dock; each `<Window>` registers via `<DockRegistration kind="window" pillId={...}>`. user-toggled `collapsed.*` state plugs into the `expanded` prop per the phase-0 model
- **testid mapping table** lands in plan log: every existing testid (`family-view-debug-coi-breakdown-toggle/-body/-focus/-raw/-sum/-displayed/-count`, `family-view-debug-layout-metrics-*`, `debug-toggle-*`, etc.) mapped to its post-migration carrier (Window titlebar / body wrapper / content cell). reviewer signoff required before merge
- **`CanvasChromePill.svelte` deletes** AT THE END of phase 2 (after every migration is green). `grep -rn "CanvasChromePill" apps/web/` returns zero matches at phase close
- assertion that `forceCollapse(id)` calls from `CanvasChromeDock.measureAndForceCollapse` still hide each migrated Window's body (the phase-0 expansion model carries this)
- `pnpm verify` green

**scope:**

- `App.svelte`: stats popover extraction (snippet + DockRegistration window-kind); debug menu wrapper conversion; preserve `data-testid="debug-panel"` on the body wrapper (not the outer Window root)
- `FamilyViewDebugOverlay.svelte`: each panel's `<CanvasChromePill>` replaced by `<Window>`; bodies migrate to body snippets; pill identity preserved via the registered `pillId`
- `CanvasChromePill.svelte`: delete (final commit of phase 2)
- `dockRegistry.test.ts`: drop CanvasChromePill-specific tests that no longer apply
- e2e: each migrated surface opens as a Window with shared chrome; testid mapping holds; force-collapse continues to hide bodies; pop-out works for each

## phase 3 — debug-mode vs debug-menu-open split

**definition of done:**

- new `debugMode: $state<boolean>` persisted in `localStorage` under `fte.debug.mode` (parallels `fte.debug.authDryRun` at App.svelte:240 — plain boolean, no schema version, debug-flag precedent documented in agents.md)
- help menu adds a "Debug mode" toggle. flipping it off auto-closes the debug menu Window if open and hides the debug pill
- debug pill render gate switches from `!debugPillHidden` → `debugMode`. the existing `debugPillHidden` $state and the "permanently hide bug pill" button in the menu body both delete
- `debugOpen` renames to `debugMenuOpen` and ONLY controls the menu Window's open state. every consumer of debug-effect rendering switches from `debugOpen ? { layers: ... } : undefined` to `debugMode ? { layers: ... } : undefined`
- **enumeration before rename** — plan log lists every direct gate (App.svelte:324, 406, 2235, 2700 at minimum) AND every indirect use via `debugOptions` / `familyViewDebugOptions`. reviewer signs off the list before the rename commit lands. zero misses
- debug menu Window body adds a "disable debug mode" button (top-right of body, distinct from the titlebar `×`) that flips `debugMode = false` and closes the menu
- e2e: with debugMode on + menu open, close the menu via titlebar `×` → debug effects (e.g. grid overlay) still render
- e2e: with debugMode on, click "disable debug mode" in menu body → effects gone, menu closed, pill removed from dock
- e2e: toggle debug-mode off from help menu while menu open → menu auto-closes, pill removes
- e2e: toggle debugMode on, reload page → pill present, menu closed (open state doesn't persist)
- agents.md updated to document the split; `fte.debug.mode` listed alongside `fte.debug.authDryRun` in the localStorage paragraph
- `pnpm verify` green

**scope:**

- App.svelte: rename `debugOpen` → `debugMenuOpen`; add `debugMode` $state + localStorage init/persist; rewire every consumer per the enumerated list; remove `debugPillHidden` state + its menu button
- find the help/menu-bar component; add the "Debug mode" toggle entry; wire to `debugMode` flag
- debug menu Window body: add the top-right "disable debug mode" button
- agents.md update

## phase 4 — content fixes: save chrome, editRev relocation, stats metric selector, coi-breakdown, debug-menu lag

**definition of done:**

- **SaveStatusPill** renders two lucide glyphs inline: local (`laptop-minimal` when dirty, `laptop-minimal-check` when persisted) + remote (`cloud` when idle, `cloud-check` when synced, `cloud-off` when unsync configured, `cloud-upload` while syncing). title/aria-label describes both states
- **save-status Window body** gets three rows: local (glyph + state text), remote (glyph + state text), runtime (editRev + `debugTimings.total.toFixed(1) ms` from the deleted debug-timings pill). the runtime row renders only when `debugMode === true`
- **standalone `debug-timings` pill deletes** from App.svelte (DockRegistration at priority 40 + its snippet). its two pieces of data (`editRev` + `debugTimings.total`) BOTH relocate to the save-status Window's runtime row. no data is silently dropped
- **stats Window** rows become buttons. clicking sets `selectedMetric: $state<"people" | "clusters" | "rev" | "descendants" | "coi">` (default `"people"`); the stats pill snippet branches on `selectedMetric` to render the chosen value. `rev` is removed from the stats Window (it's in save-status now)
- **coi breakdown fix** applied per the phase-0 5-min repro verdict. if force-collapse symptom: closes against migrate-debug-menu (no work here). if registration gate: targeted fix + e2e
- **debug menu lag fix** applied against the phase-0-named root cause. profile captured post-fix at `notes/profiles/debug-menu-open-lag-after.json.gz`. benchmark assertion lands in code: a unit/integration test that opens the menu and asserts open latency <50ms p50 on chromium (test marked as `.slow` if it adds >1s to ci)
- **info-density pass:** each migrated Window's body reviewed for "is this the most useful presentation?" — fold any clear wins; record decisions in log
- **visual snapshot scope** enumerated in plan log: every `visual-*.spec.ts` golden that captures bl-corner pixels (today: `visual-canvas-chrome-dock`, `visual-akarians-family-view` (already stale on trunk per migrate-debug-menu retro), family-view-debug-phase5 visuals). decide per-spec: regen in this plan's commit with note explaining the diff, OR out-of-scope to a follow-up `audit-visuals` task on trunk. no spec stays accidentally stale
- e2e: save pill renders two glyphs; both update independently on simulated dirty / sync events
- e2e: click `clusters` row in stats Window → stats pill text reads `13 clusters`; click `people` row → pill reverts
- e2e: toggle coi-breakdown → panel renders content (whatever the phase-0 verdict required)
- e2e: open save-status Window with `debugMode === true` → runtime row visible; toggle `debugMode = false` → runtime row hides
- `notes/bugs.md` items 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 close with this plan's merge commit referenced
- `notes/agents.md` canvas-chrome paragraph updated with: Window contract, pop-out semantics, debug-mode split, save-status dual indicators, configurable stats pill
- `pnpm verify` green

**scope:**

- `SaveStatusPill.svelte`: dual-glyph rendering; Window body with three rows; runtime row gated by `debugMode`
- `App.svelte`: delete debug-timings DockRegistration + snippet; add `selectedMetric` $state; stats pill snippet branches; stats Window rows become buttons
- diagnose + fix coi breakdown per phase-0 verdict
- diagnose + fix debug-menu lag per phase-0 root-cause class
- benchmark instrumentation (open-menu latency unit test)
- info-density review of each Window's body content
- visual snapshot regen / out-of-scope per the enumerated list
- notes/bugs.md closes + notes/agents.md update

## phase 5 — trunk integration: reconcile with ui-invariant-tests

<!-- inserted 2026-05-27 after phase 4 ship: ui-invariant-tests landed on trunk in parallel and rebased onto a branch that hadn't been monitoring it. the divergence is real (deleted e2e specs, new jsdom component tests over canvas-window-manager surfaces, broader setup.ts) and needs explicit work, not a "resolve in flight" rebase. -->

context: `ui-invariant-tests` (trunk commits `23fbae0..8972d27`, 18 commits) deleted every playwright e2e spec for family-view-debug / family-view-* / shell / import-edit / inspector-more-actions-smoke / visual-* and migrated their assertions into jsdom component tests under `apps/web/tests/component/`. it also broadened `apps/web/tests/setup.ts` with IntersectionObserver + matchMedia shims and a strategy reference. canvas-window-manager's branch (`phase/canvas-window-manager/0`) modified 6 of those now-deleted specs (debugMode beforeEach injection, coi tweaks) and added a narrower setup.ts. the rebase pauses at commit 16/55 (`b4ad9a8 test(canvas-window-manager): pin snippet-closure semantics through WindowOverlay`) with a real conflict — the file is gone on trunk, the canvas-window-manager change targets a file the migration replaced.

beyond the rebase conflict itself, the new component tests on trunk assert against canvas-window-manager production surfaces that phases 2/3/4 reshaped (SaveStatusPill text content, family-view-debug-coi via dockRegistry, stats-pill harness, chrome-geometry-popover). some of those assertions will still hold post-merge; others will not. this phase audits each, decides per-case whether to update the test or fix production, lands the rebase clean.

**definition of done:**

- rebase of `phase/canvas-window-manager/0` onto trunk (`8972d27`) completes with the following conflict-resolution policy applied verbatim:
  - **setup.ts**: take trunk's version unconditionally. trunk's three-shim version (ResizeObserver + IntersectionObserver + matchMedia) is a strict superset of canvas-window-manager's single-shim ResizeObserver addition. drop the branch's setup.ts hunk
  - **deleted e2e specs**: take trunk's deletion unconditionally. the branch's `fte.debug.mode = true` beforeEach hooks become moot because the new component tests bypass the App-level debugMode gate by passing `debugOptions` directly to `FamilyViewCanvas`. specs covered: `family-view-debug.spec.ts`, `family-view-debug-coi.spec.ts`, `family-view-debug-multi-union.spec.ts`, `family-view-debug-navigation.spec.ts`, `family-view-debug-phase5.spec.ts`, `visual-canvas-chrome-dock.spec.ts`
  - **new files added on the branch** (Window.test.ts, WindowOverlay.test.ts, windowManager.test.ts, popoutChromeInsets.test.ts, the fixtures): apply unchanged
  - any other conflict pauses the rebase and surfaces here for explicit decision; do not auto-resolve
- audit the six new trunk component tests that touch canvas-window-manager surfaces. for each, record verdict + action in the log:
  1. `apps/web/tests/component/SaveStatusPill.test.ts` — asserts text content ("Saved", "Saving", "Synced", "Save failed", "Conflict") via `getByLabelText(/save status/i)`. canvas-window-manager rewrote the pill to dual lucide glyphs + Window body. verdict expected: text still present in the pill's accessible name or aria-label even when glyphs render; if not, update the test to assert on the glyph testid / aria contract that canvas-window-manager actually ships
  2. `apps/web/tests/component/family-view-debug-coi.test.ts` — calls `clearRegistry` + `itemsForCorner` from dockRegistry; canvas-window-manager added `kind: "window"` and `idsByKind` but `itemsForCorner` signature is unchanged. verdict expected: passes as-is; only verify the dock-item assertion shape (priority / id / kind) accepts the new `"window"` kind without filtering it out
  3. `apps/web/tests/component/parity-matrix-stats-pill.test.ts` — asserts the stats-pill testid renders inside CanvasChromeDock's bl corner. canvas-window-manager kept the `stats-pill` testid; the harness reimplements an inline pill rather than importing the production code. verdict expected: passes as-is
  4. `apps/web/tests/component/_harness/StatsPillHarness.svelte` — companion harness; same verdict path as 3
  5. `apps/web/tests/component/chrome-geometry-popover.test.ts` — generic popover-geometry invariants; canvas-window-manager replaced inline popovers with `<Window>` (no longer absolute-positioned div in the same way for save-status / stats). verdict expected: either the test targets a surface canvas-window-manager refactored (in which case retarget at the Window primitive) or it targets a surface still in popover form (in which case unchanged)
  6. `apps/web/tests/component/parity-matrix-extended.test.ts` — engine parity extension; check whether any matrix cell touches surfaces canvas-window-manager refactored
- `pnpm verify` (typecheck + lint + unit) green on the post-rebase branch. e2e: only the 8 specs that survived trunk's deletion plus canvas-window-manager's `canvas-window-manager.spec.ts` need to pass; the 13 deleted-on-trunk specs do not run by definition
- per-test verdict table appended to `log.md` under a `## phase 5 verification` heading; reviewer signoff before merge
- if any audit cell flips to "production needs change, not the test", that fix lands in this phase as a targeted commit referencing the failing test; canvas-window-manager's UI contract does not regress to accommodate a stale assertion
- pre-merge skill re-invoked after phase 5 close; rebase + cross-ref steps run cleanly without further conflicts

**scope:**

- rebase resolution per the conflict-policy table above, one commit per logical chunk (no squash-fest)
- 6-cell audit of new trunk component tests; per-cell commit with either test update, production fix, or "no change" + verdict comment
- `pnpm verify` run + log
- no new tests added in phase 5; integration only

**non-goals:**

- migrating canvas-window-manager's added e2e (`canvas-window-manager.spec.ts`) into jsdom component form. that's a future plan if `ui-invariant-tests` consumes the rest of the e2e suite — for now the spec stays as a playwright e2e under the 8 that survive
- regenerating visual goldens that ui-invariant-tests deleted — those goldens are gone by design, not a canvas-window-manager concern
- expanding the parity matrix or harness suite — canvas-window-manager surfaces get audit-and-adapt only, not new coverage

## verification

- `pnpm verify` at each phase close (lint + typecheck + unit + e2e)
- per-phase manual smoke at 1440×900 + Pixel 7 (412×915): every migrated surface opens, minimizes, closes, pops out, drags, re-docks
- focus-to-front: open three docked windows; click the bottom one's titlebar; topmost slot of stack with focused accent
- drag bbox clamp at each canvas-host edge; resize host with windows popped → clamp follows
- canvas non-interference: pop out a window over a card, drag titlebar; card not selected; canvas not panned
- debug-mode persistence: toggle on, reload, debug pill present without re-toggling
- benchmark: open debug menu cold; p50 <50ms (assertion in code, not manual)

## critical files

- [apps/web/src/lib/components/canvas/Window.svelte](../../../apps/web/src/lib/components/canvas/Window.svelte) — new in phase 0
- [apps/web/src/lib/components/canvas/windowManager.svelte.ts](../../../apps/web/src/lib/components/canvas/windowManager.svelte.ts) — new in phase 0, extended phase 1
- [apps/web/src/lib/components/canvas/WindowOverlay.svelte](../../../apps/web/src/lib/components/canvas/WindowOverlay.svelte) — new in phase 0
- [apps/web/src/lib/components/canvas/CanvasChromeDock.svelte](../../../apps/web/src/lib/components/canvas/CanvasChromeDock.svelte) — kind filter (phase 0); pop-out reactivity + anchor anti-jump (phase 1)
- [apps/web/src/lib/components/canvas/dockRegistry.svelte.ts](../../../apps/web/src/lib/components/canvas/dockRegistry.svelte.ts) — `kind: "window"` + `focusedAt` + `idsByKind` helper (phase 0)
- [apps/web/src/lib/components/canvas/DockRegistration.svelte](../../../apps/web/src/lib/components/canvas/DockRegistration.svelte) — thread new fields (phase 0)
- [apps/web/src/lib/components/canvas/CanvasChromePill.svelte](../../../apps/web/src/lib/components/canvas/CanvasChromePill.svelte) — deletes in phase 2 (last commit of phase)
- [apps/web/src/lib/components/shell/SaveStatusPill.svelte](../../../apps/web/src/lib/components/shell/SaveStatusPill.svelte) — popover → Window (phase 0); dual indicators + Window body (phase 4)
- [apps/web/src/App.svelte](../../../apps/web/src/App.svelte) — WindowOverlay mount (phase 0); stats + debug menu migrations (phase 2); debug-mode split (phase 3); editRev relocate + stats selector + debug-timings delete (phase 4)
- [apps/web/src/lib/components/tree/FamilyViewDebugOverlay.svelte](../../../apps/web/src/lib/components/tree/FamilyViewDebugOverlay.svelte) — panel migrations (phase 2); coi fix per phase-0 verdict (phase 4)
- [apps/web/src/lib/components/canvas/fitMath.ts](../../../apps/web/src/lib/components/canvas/fitMath.ts) — read-only; `data-canvas-chrome` carrier semantics validated by phase-0 probe
- [apps/web/tests/e2e/canvas-window-manager.spec.ts](../../../apps/web/tests/e2e/canvas-window-manager.spec.ts) — new in phase 0, extended through phases 1–4
- [notes/profiles/debug-menu-open-lag-baseline.json.gz](../../../notes/profiles/debug-menu-open-lag-baseline.json.gz) + [-after.json.gz](../../../notes/profiles/debug-menu-open-lag-after.json.gz) — phase 0 + phase 4
- [notes/agents.md](../../../notes/agents.md), [notes/bugs.md](../../../notes/bugs.md) — phase 3 + phase 4 docs sweep

## notes / followups

- modals (`CommandPalette`, `ShortcutsOverlay`) stay z-50+ separate. if a future plan wants them in the Window system, the contract supports it via a `modal: true` flag (out of scope here)
- popped-out window position persistence is intentionally transient; if a future plan wants per-user layouts saved, `windowManager.popOutStates` is the natural seam
- the soft cap of 8 popped-out windows wraps to a second cascade row; if a power-user hits both rows, revisit with a stacking strategy
- if the firefox profile in phase 0 points the debug-menu lag at DockRegistration's `next`-object churn, the fix is to memo the object in `untrack` boundary or split it across two effects (one per logical concern); record in log
- the `data-canvas-chrome` decision for popped-out windows likely is "no, they don't carry it" — popped-out is the user's explicit "drag aside to reference" gesture; `fitToView` should pan content beneath. but the probe is what decides, not the plan
