# canvas chrome v2 — dock/window redesign

**status:** SHIPPED (merge pending) — phases 0-6 complete (0 in 7eb26a4, 1 in 03b904e, 2 in efed0b8, 3 in 5614e9a, 4 in 90c2181, 5 in 56b254f, 6 taskbar model thru 5209722). ship-readiness verdict: `ship` (see ship.md; manual visual smoke deferred to a follow-up plan by user decision). pre-merge done: deferred items migrated to notes/bugs.md + notes/to-do.md, plan archived. awaiting no-ff merge of `phase/canvas-chrome-v2/6` into trunk

## context

the canvas-window-manager plan (shipped 2026-05-27) delivered a working Window/dock primitive but against a narrower visual and behavioral spec than intended. `issues.md` in the archived plan dir catalogs 15 specific gaps across three categories:

**visual chrome** — wrong icon set (currently `CircleChevronDown / CircleChevronRight / SquareX`), wrong button order (should be pop/dock → minimize → close), no colored circles behind controls, titles not lowercase, dock/window chrome not uniformly scaled at 110%, titlebar/body separated by a gap-and-border instead of a single thin divider, window widths inconsistent

**behavioral** — no "closed" state: closing a window today only collapses the body (the pill stays); non-closing windows (save-status) still show a close button; pill click doesn't adapt to window state (minimized vs docked vs floating); active window highlight is a persistent accent instead of a brief flash on state-change

**structural** — dock hardcoded to bottom-left and expanding upward; new spec: configurable corner, direction per corner, overflow clips; docked windows not drag-reorderable

## goals

1. **control order + icons**: `[pop/dock] [minimize] [close]` left-to-right; `ArrowUpRight` / `ArrowDownLeft` for pop/re-dock; `ChevronUp` for minimize; `X` for close — all from `@lucide/svelte`
2. **button decoration**: each control wrapped in a circle with semantic fill color (neutral=pop/dock, orange=minimize, red=close); thick SVG stroke; hover darkens/lightens per theme
3. **titlebar/body divider**: single `border-top` line between titlebar and body; no gap, no outer border-box wrapping the body; no extra padding/margin between the two
4. **title case**: `text-transform: lowercase` on all window title text
5. **scale**: 110% root font scale applied consistently throughout dock + window chrome (no px overrides that bypass root)
6. **uniform width**: all docked windows share a `--fte-window-width` CSS var (18rem default); floating windows use that as `min-width`
7. **state machine**: `closed` (pill + body hidden) → `opened` → `{minimized, docked, floating}`; closing a window removes its pill from the dock
8. **non-closing windows**: save-status has no close button; always in opened state (pill always visible); can only minimize
9. **pill click behavior per state**: adapts to current window state (opens if closed, restores if minimized, focuses if docked, focuses/minimizes-if-already-focused if floating)
10. **dock direction per corner**: tl/tr corners expand downward; bl/br corners expand upward; overflow clips off page (no force-collapse)
11. **configurable corner**: corner selection persisted to `fte.dock.corner` localStorage key; default `"tl"` (top-left, changed from current `"bl"`)
12. **open/closed state persistence**: `fte.dock.openedWindows` localStorage key (JSON array of opened window ids); all windows start closed on first launch; open/close writes the key; reload restores it
13. **entry point for closed windows**: a "Panels" section in the View menu lists all registered windows with open/close toggles
14. **drag-to-reorder**: dragging a docked window's titlebar collapses all docked windows to titlebar-only, shows a drop-indicator line, drops to the new order position
15. **active highlight**: brief ~300ms flash on state-change only (drag, dock, minimize, click-into); no persistent accent on the focused window
16. **content UI consistency**: all window bodies use shared `fte-window-section`, `fte-window-list`, `fte-window-button` CSS classes

## non-goals

- new windows beyond the existing 8 registered surfaces
- persist popped-out window positions across sessions (only open/closed state + corner config persist)
- resize handles on floating windows
- drag-to-move for docked windows (only floating windows drag to move)
- robust pop-out placement on narrow / mobile viewports — at phone widths a pop-out is wider than the gap beside the tl dock and will overlap it; pop-out drag / z-order behavior is verified on chromium only (see bugs.md cc0-2)

## constraints

- existing testids keep resolving
- `pnpm verify` green at every phase boundary
- svelte 5 runes; tailwind v4; `exactOptionalPropertyTypes`
- icons from `@lucide/svelte` only (already a dep)
- popped-out z-band z-30..z-49 unchanged; modals z-50+ stay above all windows
- `data-canvas-chrome` semantics unchanged (popped-out wrappers do NOT carry the attribute per phase-0 probe verdict from canvas-window-manager)
- pill testids (`save-status-pill`, `stats-pill`, `debug-pill`, `family-view-debug-*`) keep resolving

## accepted risks

- **force-collapse test retirement**: `canvas-chrome-dock.spec.ts` tests `n, o, p, q` pin force-collapse behavior. phase 0 retires all four atomically alongside the `measureAndForceCollapse` removal — they may not be deferred to a later phase or left as skipped
- **`overflow-y: clip` + absolute children**: `clip` does not establish a BFC, so absolutely-positioned children that escape the dock's stacking context may not be clipped. phase 0 includes a browser probe: mount a tall docked stack on a cramped viewport and confirm the clip actually hides the overflow. if it fails, `overflow: hidden` is the fallback (but disrupts `position: absolute` tooltips inside the dock)
- **dock direction flip + cornerStyle**: `cornerStyle` in CanvasChromeDock currently handles only `bl` (inspector-sheet-height CSS var lift). for `tl`, the `cornerClass["tl"] = "top-3 left-3 ..."` provides the anchor via Tailwind; `cornerStyle` returns `""` for non-`bl` corners. confirm tl renders at the correct top offset and that the inspector-sheet-height var has no effect on tl (correct — the sheet lifts from the bottom, not the top)
- **state machine e2e test seeding**: 15+ e2e assertions reference pill testids (`save-status-pill`, `stats-pill`, `debug-pill`) and expect them visible unconditionally on page load. once phase 2 gates all windows on `isOpen`, these break unless a test fixture seeds `fte.dock.openedWindows` in `beforeEach` via `page.addInitScript`. phase 2 DoD explicitly enumerates and updates every affected assertion
- **stats-window registration race**: `fte.dock.openedWindows` may include `"stats-window"` but the stats DockRegistration only mounts after layout worker completes (~100ms post-mount). resolution: gate is at DockRegistration mount time — `isOpen(id)` is checked when the `{#if}` fires, so the window simply waits for the registration condition to also be true. no special handling needed; document as intentional in phase 2
- **persistent focus badge migration**: `fte-window-titlebar-focused` is a persistent CSS class today; e2e asserts `data-focused="true"` persists after click. the flash behavior changes the CSS but the `data-focused` attribute stays on the element. phase 1 keeps `data-focused` and switches the CSS from a persistent border-color to a `@keyframes` flash — existing assertions on the attribute keep passing
- **drag coexistence in phase 4**: `Window.svelte` attaches `document.addEventListener("pointermove", ..., true)` in capture phase for floating-window drag. the dock-reorder drag in phase 4 is a distinct gesture on docked windows (`poppedOut = false` guard returns early). single-pointer devices are safe. phase 4 adds a `pointerId` discriminator on the document-level handlers to guard against multi-touch edge cases
- **drag-to-reorder order field**: dockRegistry sorts on `priority asc, focusedAt desc, id`. phase 4 adds `order: number` (default 0) as a final tiebreaker so reorder within a priority bucket works without mutating priorities

## phase 0 — walking skeleton: state machine + dock direction

the two load-bearing unknowns are: (1) does the closed/opened/minimized state machine graft onto `windowManager` + `dockRegistry` without an architectural rewrite? (2) does the per-corner dock direction change break the existing layout math?

**definition of done**:

- `windowManager.svelte.ts` gains `openedWindows: SvelteSet<string>` (initialized from `fte.dock.openedWindows` localStorage on construction), `openWindow(id)`, `closeWindow(id)`, `isOpen(id)`, `pillClick(id)` (handles all 4 pill-click cases); a `NON_CLOSING_IDS = new Set(["save-status-window"])` constant makes save-status always return `true` from `isOpen`; open/close write back to `fte.dock.openedWindows`
- `Window.svelte` gains `closeable?: boolean` prop (default true); omits close button when `closeable=false`
- save-status window + pill registrations in `App.svelte` gated on `windowManager.isOpen("save-status-window")` (no-op for now since it's non-closing, but proves the gating pattern); stats window + pill gated on `windowManager.isOpen("stats-window")`; closing stats removes its pill
- `CanvasChromeDock.svelte`: `cornerClass` for `tl` changes to `top:` anchor + `flex-col` (downward); `bl`/`br` keep `flex-col-reverse` (upward expansion) but also get `overflow-y: clip`; `measureAndForceCollapse` + all overflow projection machinery removes entirely; outer container gets `overflow-y: clip`; `tl`-only guard replaces the current `bl`-only guard (configurable corners live in phase 3)
- `App.svelte` default DockRegistration corner changes from `"bl"` to `"tl"` for all registrations
- save-status Window gets prototype `ChevronUp` minimize icon in place of `CircleChevronDown` to confirm the layout fits; the full chrome sweep is phase 1
- `canvas-chrome-dock.spec.ts` tests `n, o, p, q` (force-collapse behavior) retired atomically — replaced with a single assertion that overflow items are clipped rather than collapsed
- browser probe confirms `overflow-y: clip` actually clips an over-height docked stack on a cramped viewport; if the clip does not work with absolute-positioned children, `overflow: hidden` is the fallback and the DoD records the switch
- minimal "Panels" section lands in the View menu (basic implementation — just toggles `windowManager.openWindow/closeWindow` per entry; the full polish lives in phase 3); required so the walking-skeleton e2e has a UI entry point to open closed windows
- one walking-skeleton e2e using the stats window (closeable): `localStorage.clear()` → page load → no stats pill visible → open tree → stats still absent (gated on `isOpen`, not just `layoutStats`) → click View > Panels > stats toggle → pill appears → reload → pill still appears (persisted) → close via X button → pill disappears → reload → pill absent (persisted as closed)
- unit: `openWindow`/`closeWindow`/`isOpen` round-trip; non-closing always-open; `pillClick` 2-branch (closed→open, open→minimize); dock renders with correct flex direction per corner on mock items
- `pnpm verify` green

**scope**:

- `windowManager.svelte.ts`: add `openedWindows`, `openWindow`, `closeWindow`, `isOpen`, `pillClick`, `NON_CLOSING_IDS`
- `Window.svelte`: `closeable` prop; prototype minimize icon
- `CanvasChromeDock.svelte`: flip anchor + flex direction for tl; remove force-collapse path; add `overflow-y: clip`; replace `bl` guard with `tl`
- `App.svelte`: change all DockRegistration `corner="bl"` → `corner="tl"`; gate stats + save-status registrations on `windowManager.isOpen`; wire pill click handlers to `windowManager.pillClick`; add minimal "Panels" section to the View menu
- unit + component tests; update e2e gate assertions

## phase 1 — chrome sweep: all windows

**definition of done**:

- ALL 8 windows (save-status, stats, debug-menu, 5 family-view debug panels): `[pop/dock] [minimize] [close]` order; `ArrowUpRight`/`ArrowDownLeft`, `ChevronUp`, `X` icons
- each control wrapped in a `14×14` circle div with semantic fill: `bg-neutral-600/40` for pop/dock; `bg-amber-600/40` for minimize; `bg-red-700/40` for close; hover darkens by 20%
- icon stroke weight: icons rendered with `stroke-width="2.5"` (lucide default is 2; bump via the `strokeWidth` prop)
- titlebar ↔ body: `border-top: 1px solid var(--color-line)` replaces the gap; `gap: 0` on `.fte-window-stack`; body div loses its own border
- `text-transform: lowercase` on `.fte-window-title`
- `.fte-window-stack` width: `width: var(--fte-window-width)` when docked, `min-width: var(--fte-window-width)` when floating; `--fte-window-width: 18rem` in `app.css`
- 110% scale audit: check `.fte-window-titlebar` `font-size`, `.fte-pill` `font-size`, dock outer container — all in rem, none overriding root with px
- active highlight: `Window.svelte` gains `flashFocused: $state<boolean>` + a `setTimeout` that clears after 300ms; `.fte-window-titlebar-focused` class moves from persistent to the `flashFocused` boolean; `data-focused` attribute stays on the element (existing e2e assertions on the attribute remain valid); `windowManager.focus()` triggers the flash via a callback or reactive subscription
- `pnpm verify` green; visual goldens diff + regen for the chrome changes

**scope**:

- `Window.svelte`: full icon + circle swap; divider; lowercase; width; flash highlight logic
- `app.css`: `--fte-window-width`; remove any px overrides on dock/window chrome
- visual snapshot regen

## phase 2 — state model rollout + pill behavior

**definition of done**:

- all 8 window registrations in `App.svelte` and `FamilyViewDebugOverlay.svelte` gated on `windowManager.isOpen(id)`; `isOpen` reads the persisted `fte.dock.openedWindows` set, so windows that were open last session auto-restore on reload; first-ever launch: all closed
- `windowManager.pillClick(id)` wired to every pill's `onclick` handler; the four-branch logic (closed→open, minimized→restore, docked→focus, floating→focus-or-minimize) runs in windowManager
- `windowManager.svelte.ts` gains `lastState: SvelteMap<id, "docked-minimized" | "docked-expanded" | "floating">` to power the "restore" branch
- focus-flash trigger reworked off the bare `focused` derived: add a focus-tick/counter (or equivalent) so re-focusing an already-focused window and the restore branch both re-play the 300ms flash, not just first-focus (bugs.md cc1-3)
- non-closing windows (save-status): pill's `onclick` still calls `pillClick`; the non-closing branch focuses/expands rather than closing
- debug-menu: `debugMenuOpen` state merges with `windowManager.isOpen("debug-menu")` — opening the debug menu calls `openWindow("debug-menu")` and sets `debugMenuOpen=true`; closing calls `closeWindow`. the phase-0 `Window.onClose` hook (today flips `debugMenuOpen` directly so the titlebar × works) folds into this merge — one close path through `windowManager`, not a parallel one (bugs.md cc0-3)
- all e2e tests that reference `save-status-pill`, `stats-pill`, `debug-pill`, `debug-panel` testids seed `fte.dock.openedWindows` via `page.addInitScript` in their `beforeEach` (enumerated list written to `log.md` before phase start); a `beforeEach` that *clears* localStorage via `addInitScript` re-runs on every navigation including `reload()`, wiping seeded/persisted state — persistence-across-reload cases need a non-clearing setup (see the phase-0 walking-skeleton relocation in `log.md`)
- e2e: pill click in each state; close removes pill; re-open via pill click restores; debug menu open/close cycle
- e2e: reload with seeded `fte.dock.openedWindows` → specified windows appear open; reload without seed → all closed

**scope**:

- `windowManager.svelte.ts`: `lastState`; update `redock`/`popOut`/`focus` to maintain `lastState`; update `openWindow`/`closeWindow` to init/clear `lastState`
- `App.svelte`: migrate all pill `onclick` handlers to `windowManager.pillClick`; add `$effect` triggers for auto-open conditions; merge `debugMenuOpen` with `isOpen`
- `FamilyViewDebugOverlay.svelte`: add `isOpen` gates for each panel; panels auto-open when family-view first mounts
- new e2e cases

## phase 3 — dock corner config

**definition of done**:

- `CanvasChromeDock.svelte`: remove the `tl`-only guard; all 4 corners render correctly — tl/tr expand downward (flex-col); bl/br expand upward (flex-col-reverse, no force-collapse); overflow clips in both directions
- `App.svelte`: `dockCorner: $state<DockCorner>` reads from `localStorage.getItem("fte.dock.corner") ?? "tl"`; persists on change
- corner picker in the View menu: four corner buttons (tl, tr, bl, br); changing updates `dockCorner` + `fte.dock.corner` localStorage key
- full "Panels" section in the View menu (replaces phase 0 minimal version): lists all 8 registered windows — save-status, stats, debug-menu, AND the 5 family-view debug panels — with current state from `windowManager.windowState(id)` (open/closed, and minimized/floating where relevant); clicking toggles via `openWindow`/`closeWindow`. this is the ONLY way to reopen a family-view debug panel once its × closes it (bugs.md cc2-1), so the 5 panels must appear here even though they are non-persisted
- dock re-positions without visual escape from canvas-host bbox at all 4 corners
- `pnpm verify` green

<!-- phase 3: the tl/bl/tr/br containers anchor to the opposite edge (e.g. tl = top-3..bottom-3) so overflow-clip works, making the container bbox full-height/width. corner-overlap and "no escape" assertions must measure the docked CONTENT (data-dock-pills / data-dock-panels), not the container bbox — see phase 0 retro where :307 / c) / f) tripped on exactly this. -->

**scope**:

- `CanvasChromeDock.svelte`: relax corner guard; ensure `cornerClass`, `panelStackClass`, `pillRowClass` cover all 4 corners correctly
- `App.svelte`: localStorage read/write for both corner + opened-windows; corner state; pass to DockRegistration + CanvasChromeDock; replace minimal Panels UI with full Panels section
- `notes/agents.md`: document `fte.dock.corner` + `fte.dock.openedWindows` alongside other localStorage keys

## phase 4 — drag-to-reorder docked windows

**definition of done**:

- dragging a docked Window's titlebar vertically activates reorder mode: all docked windows collapse to titlebar-only; a horizontal drop-indicator line (1px accent color) renders between items showing the insert position; dropping moves the window
- the insert-position + drop-indicator math must handle BOTH dock expansion directions now that the corner is user-configurable (phase 3): tl/tr expand downward (flex-col, visual order = sort order) while bl/br expand upward (flex-col-reverse, visual order = reversed). read `dockConfig.corner` to map a pointer-y to the correct insert index per direction
- reorder uses a new `order: number` field on `DockItem` (default `0`); `itemsForCorner` sort gains `order asc` as a tiebreaker after `priority` and `focusedAt`; `reorderItem(id, newOrder)` in `dockRegistry.svelte.ts` computes new order values so relative sequence matches user intent
- reorder persists for the session (in-memory) but not to localStorage
- drag does NOT activate when the window is in floating state (those use the existing move-drag) or minimized
- pointer-id discriminator added to the dock-reorder pointerdown handler so that if a floating window's document-level `pointermove` listener is also active, only the drag that owns the captured pointer drives each gesture
- e2e: drag debug window above stats window → order changes; drag to pill row → no reorder; release outside dock → cancel

**scope**:

- `dockRegistry.svelte.ts`: `order` field on `DockItem`; sort update; `reorderItem` helper
- `CanvasChromeDock.svelte`: reorder drag state (pointer-capture on the panels block); collapse-all-to-titlebars during drag; drop-indicator rendering
- `Window.svelte`: drag initiation for docked state (separate from the floating move-drag already implemented); calls a context fn to hand off to the dock

## phase 5 — content UI consistency + cleanup

**definition of done**:

- all window bodies use shared CSS classes: `.fte-window-section` (section headers), `.fte-window-list` (list items), `.fte-window-row` (key/value rows), `.fte-window-button` (action buttons). these assume the phase-1 `.fte-window-body` context — it already supplies 0.5rem padding + a `border-top` divider, so the new classes must not double-pad the body edge
- debug menu FAMILY-VIEW / RUNTIME / SHELL headers, stats rows, save-status rows, family-view debug bodies all apply the new classes
- `notes/agents.md` canvas-chrome paragraph updated: new icon set, state machine, and drag-to-reorder semantics — including the `DockItem.order` field and that it is the PRIMARY `itemsForCorner` sort key (asc, default 0), NOT a tiebreaker after `priority` (phase-4 retro: an order-after-priority key is inert because every window has a unique priority — document this so a future reader does not "fix" the precedence back). note: `fte.dock.corner` + `fte.dock.openedWindows` already documented as item 19 in phase 3; this sweep must also reconcile the now-stale item 18 reference to the removed `debugMenuOpen` flag (phase 2 merged it into windowManager's non-persisted open-state)
- `notes/bugs.md` entries for `canvas-chrome-dock pill height` and `family-view e2e role drift` updated/closed if this plan's changes affect them; the §shell "title bar + menu bar do not render above all other UI" entry is now partially addressed (phase 0 hoisted the open menu-bar dropdown to `z-[55]` over the inspector sheet) — update it to reflect what remains (top chrome above cards / toasts / translate3d stacking contexts), or close if this plan resolves it (bugs.md cc0-1)
- `pnpm verify` green

**scope**:

- `app.css`: `.fte-window-section`, `.fte-window-list`, `.fte-window-row`, `.fte-window-button`
- `App.svelte` debug menu + stats body snippets: apply classes
- `SaveStatusPill.svelte` window body: apply classes
- `FamilyViewDebugOverlay.svelte` panel bodies: apply classes
- `notes/agents.md` update

## phase 6 — dock-as-taskbar: state-model correction + corner geometry + anchor-aware icons

opened from ship-readiness: the 2026-05-29 visual smoke found the dock diverges from the intended **taskbar** model. the dock IS a taskbar — a single list of pills, one per OPEN menu (like an OS taskbar). the window is a detachable surface shown only when docked or floating, and **fully hidden when minimized** (only the pill remains). today's dock instead renders two parallel tracks — a pill row AND a window-titlebar stack — and not every open menu has a pill (the 5 family-view debug panels register `kind="window"` with `pillId === id` and have no taskbar pill; minimizing a docked window leaves its titlebar lingering in the stack rather than collapsing to the pill).

corrected state model (supersedes the phase-0 wording):

- **closed** — not in the taskbar at all (no pill, no window). reopen via `View > Panels`
- **opened** — exactly one pill in the taskbar, plus:
  - **minimized** — pill ONLY; the window surface (titlebar + body) is not rendered
  - **docked** — pill + window attached adjacent to the taskbar
  - **floating** — pill + window floating free (unchanged from today)

**assumptions** (flagged for confirmation; default chosen so work can proceed):
- A1: "every menu has a pill" includes the 5 family-view debug panels — they get real taskbar pills (taskbar holds up to 8), and the `pillId === id` window-only special-casing is removed
- A2: drag-to-reorder moves onto the **taskbar pills** (the persistent list), superseding the phase-4 titlebar-drag — a minimized window has no titlebar to grab. the phase-4 `order` field + `reorderItem` carry over, now keyed off pill drags
- A3: glanceable status (save sync, people count) only shows while a menu is OPEN, since closed menus have no pill. menus that must always show status stay non-closing (save-status already is); confirm whether stats should also be non-closing

**definition of done**:

- the dock renders ONE taskbar: a single list with exactly one pill per open menu (open = membership in `windowManager.openedWindows`, plus `NON_CLOSING_IDS`). no parallel window-titlebar stack acting as a second track
- minimized menus render their pill ONLY — the window surface is unmounted/hidden, no lingering titlebar (today `Window.svelte` always renders `.fte-window-stack`; that must gate on state)
- every open menu has a uniform taskbar pill, including the 5 family-view debug panels (per A1); the `pillId === id` window-only path is removed
- docked menus render the window surface attached adjacent to the taskbar; floating menus float (unchanged); `pillClick` transitions remain (closed→open, minimized→restore last, docked→front, floating→front-or-minimize)
- the taskbar sits IN the anchored corner and expands AWAY from it — the container hugs the corner rather than spanning the full edge; pills (and any attached docked windows) stack away from the corner in both axes
- pop/dock + minimize icons are anchor-aware: minimize points toward the anchored edge (`ChevronUp` for top corners, `ChevronDown` for bottom), and the pop-out / re-dock diagonal matches the corner (e.g. `tl` pops toward bottom-right, `br` pops toward top-left, re-dock points back toward the corner)
- drag-to-reorder operates on the taskbar pills (per A2); the `order` field + `reorderItem` are reused
- `pnpm verify` green; e2e reworked for the taskbar structure (many existing specs assert window titlebars living in the dock stack — those baselines move)

**scope**:

- `dockRegistry.svelte.ts` / `CanvasChromeDock.svelte`: collapse the two-track render into one taskbar; each open menu contributes exactly one pill; the docked window surface renders separately (attached), hidden when minimized; corner-hugging container geometry
- `windowManager.svelte.ts`: ensure minimized unmounts the window surface (not just body-collapse); guarantee one pill identity per open menu
- `App.svelte` / `FamilyViewDebugOverlay.svelte`: give the 5 family-view panels real taskbar pills; remove the `pillId === id` window-only path
- `Window.svelte`: anchor-aware icon directions (read `dockConfig.corner`); do not render the docked surface when minimized
- reorder: re-key drag-to-reorder onto the taskbar pills
- `notes/agents.md`: rewrite the dock model (taskbar, pill-per-open-menu, minimized=pill-only, anchor-aware icons)
- `tests/e2e/canvas-window-manager.spec.ts` + dock unit/component tests: rework for the taskbar structure

**risk note**: this inverts the phase-0..5 dock model (windows-in-dock → taskbar + detachable windows). blast radius on the e2e suite is large (many specs assert a window titlebar inside the dock stack). it is large enough that it could be split into its own plan (canvas-chrome-v3) rather than a single phase — decide at phase kickoff.

## verification

- `pnpm verify` at each phase close
- manual smoke at 1440×900 + Pixel 7: open/minimize/close each window; confirm pill appears/disappears; pop out + drag + redock; active highlight flash only on state-change. also verify the phase-1 chrome by eye (bugs.md cc1-1): circular semantic-fill chips + icon legibility, single titlebar/body divider, lowercase titles, uniform width; and that wide bodies (layout-metrics / coi-breakdown tables) scroll rather than clip inside the 18rem stack (bugs.md cc1-2)
- corner config: change corner, reload → dock at new corner; test all 4 corners
- drag-to-reorder: drag debug window above stats; release → order persists until reload
- overflow: open 8 windows in a cramped viewport → items clip, no force-collapse, no layout thrash
- non-closing: save-status has no close button; pill always visible regardless of `fte.dock.openedWindows`

## critical files

- [apps/web/src/lib/components/canvas/Window.svelte](apps/web/src/lib/components/canvas/Window.svelte) — chrome redesign (phases 0-2, 4)
- [apps/web/src/lib/components/canvas/windowManager.svelte.ts](apps/web/src/lib/components/canvas/windowManager.svelte.ts) — state machine extension (phases 0-2, 4)
- [apps/web/src/lib/components/canvas/CanvasChromeDock.svelte](apps/web/src/lib/components/canvas/CanvasChromeDock.svelte) — direction flip + force-collapse removal + corner config + drag-to-reorder (phases 0, 3, 4)
- [apps/web/src/lib/components/canvas/dockRegistry.svelte.ts](apps/web/src/lib/components/canvas/dockRegistry.svelte.ts) — `order` field + `reorderItem` (phase 4)
- [apps/web/src/App.svelte](apps/web/src/App.svelte) — gate changes + pill behavior + corner config (phases 0-3)
- [apps/web/src/lib/components/tree/FamilyViewDebugOverlay.svelte](apps/web/src/lib/components/tree/FamilyViewDebugOverlay.svelte) — state machine gates (phase 2)
- [apps/web/src/app.css](apps/web/src/app.css) — `--fte-window-width`, content classes (phases 1, 5)
- [apps/web/tests/e2e/canvas-window-manager.spec.ts](apps/web/tests/e2e/canvas-window-manager.spec.ts) — extended through all phases
- [notes/agents.md](notes/agents.md) — phase 3 + 5 doc sweep
