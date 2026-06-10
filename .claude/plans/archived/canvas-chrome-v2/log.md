# canvas-chrome-v2 log

*append-only. phase-retro and plan-revise write here.*

## starting phase 0 — 2026-05-28

worktree: `.claude/worktrees/canvas-chrome-v2`, branch `phase/canvas-chrome-v2/0`

**confirmed DoD:**

- `windowManager.svelte.ts`: `openedWindows SvelteSet`, `openWindow`, `closeWindow`, `isOpen`, `pillClick`, `NON_CLOSING_IDS`
- `Window.svelte`: `closeable` prop; prototype `ChevronUp` minimize icon
- `CanvasChromeDock.svelte`: `tl` anchor flip + `flex-col`; remove `measureAndForceCollapse`; `overflow-y: clip`; `tl`-only guard replaces `bl`-only
- `App.svelte`: all `corner="bl"` → `corner="tl"`; gate stats + save-status on `windowManager.isOpen`; wire pill clicks to `windowManager.pillClick`; minimal Panels section in View menu
- tests: unit round-trips for open/close/isOpen/pillClick; dock direction on mock items; one walking-skeleton e2e for stats window full lifecycle
- retire `canvas-chrome-dock.spec.ts` tests n/o/p/q (force-collapse); replace with clip assertion
- `pnpm verify` green

## phase 0 retro — 2026-05-28

### spec delta

- delivered: tl dock flip + open/close/persist state machine + force-collapse removal; walking skeleton green end-to-end; `pnpm verify` + full e2e green
- missed / deferred: none. "Panels section" landed as the minimal single `stats window` toggle the DoD allowed (full Panels list is phase 3)
- extra (opportunistic, beyond DoD): debug-menu titlebar-× now actually closes the menu (new optional `onClose` hook on `Window.svelte`, wired to `debugMenuOpen`); menu-bar dropdown hoisted to `z-[55]` so it stays clickable over the inspector sheet on narrow viewports; retired `:307` and scoped `:167` to chromium; revised dock cases `c/f/l/s/t` for the tl layout (the DoD only named the force-collapse cases `n/o/p/q`)

### surprises

- walking-skeleton persistence e2e was self-defeating → its describe's `beforeEach` cleared localStorage via `addInitScript`, which re-runs on every reload and wiped the open-state the test just wrote → the app's persistence was never broken; the test was relocated to a non-clearing describe
- the tl dock container is full-height by design (`top-3` to `bottom-3`, for overflow-clip) → several bl-era tests measured that container's bbox for overlap → structurally unsatisfiable under tl; they had to measure docked *content* (`f`) or be retired (`c`, `:307`)
- moving the dock to tl collided with other top-area UI on narrow viewports → add-relative's "outside click" target and the menu dropdown both landed on/under the relocated chrome → the "accepted risks" foresaw e2e seeding + force-collapse fallout but not this tl-collides-with-top-UI class
- the first z-order fix (hoist the whole header to z-60) regressed modal stacking (menu bar clickable over an open modal) → caught by integration-check spot-check → narrowed to a dropdown-only `z-[55]` hoist

### residual debt

- mobile menu z-order only partially addressed: just the menu-bar dropdown clears the inspector sheet. the broader logged bug (top chrome / title strip above cards/toasts/modals) is still open · route to bugs.md
- pop-out windows on a narrow viewport unavoidably overlap the tl dock controls (geometry); handled by retiring `:307` + scoping `:167` to chromium rather than solving · route to bugs.md
- `Window.svelte` gained `onClose` as a one-off for the debug menu; phase 2's planned "merge `debugMenuOpen` with `isOpen`" should reconcile with it rather than add a parallel path · route to bugs.md

### implications for downstream phases

- phase 2 (gate all 8 windows on `isOpen`, migrate pills to `pillClick`): reuse the non-clearing-reload test pattern from the walking-skeleton relocation; reconcile the new `Window.onClose` hook with the `debugMenuOpen`↔`isOpen` merge instead of duplicating close logic
- phase 3 (corner config, un-tl to all 4 corners): do not reintroduce full-height-container bbox-overlap assertions; revive content-based checks only

## revision after phase 0 — 2026-05-28

- phase 1 (chrome sweep): unchanged — valid
- phase 2 (state model rollout + pill behavior): revise — DoD now folds the phase-0 `Window.onClose` hook into the `debugMenuOpen`↔`isOpen` merge (one close path, cc0-3), and warns that a localStorage-clearing `beforeEach` re-runs on reload (use a non-clearing setup for persistence cases)
- phase 3 (dock corner config): revise — added a note that corner containers are full-height (anchor-to-opposite-edge for overflow-clip), so overlap / no-escape assertions must measure docked content, not the container bbox
- phase 4 (drag-to-reorder): unchanged — valid
- phase 5 (content + cleanup): revise — DoD now points at the §shell menu z-order entry in `notes/bugs.md` as partially addressed (dropdown `z-[55]`), to update or close (cc0-1)
- non-goals: added — robust pop-out placement on narrow / mobile viewports is out of scope; pop-out behavior verified on chromium only (cc0-2)
- ordering: unchanged — risk-first order still holds; no reorder/insert/delete

## starting phase 1 — 2026-05-28

worktree: `.claude/worktrees/canvas-chrome-v2` (reused), branch `phase/canvas-chrome-v2/1` stacked on the phase-0 tip `7eb26a4` (phase 0 not yet merged to trunk — rebase deferred at user request)

**confirmed DoD (chrome sweep, all 8 windows):**

- control order `[pop/dock] [minimize] [close]`; icons `ArrowUpRight`/`ArrowDownLeft`, `ChevronUp`, `X` (lucide, `strokeWidth=2.5`)
- each control wrapped in a 14×14 circle: pop/dock `bg-neutral-600/40`, minimize `bg-amber-600/40`, close `bg-red-700/40`; hover darkens ~20%
- titlebar↔body: single `border-top: 1px solid var(--color-line)`; `gap: 0` on `.fte-window-stack`; body loses its own border
- `text-transform: lowercase` on `.fte-window-title`
- `.fte-window-stack` width: `width: var(--fte-window-width)` docked / `min-width` floating; `--fte-window-width: 18rem` in `app.css`
- 110% scale audit: titlebar/pill font-size + dock container all in rem, no px overriding root
- active highlight: `flashFocused` $state + 300ms `setTimeout`; `.fte-window-titlebar-focused` moves from persistent to flash; `data-focused` attr stays (e2e assertions remain valid)
- `pnpm verify` green; visual goldens diff + regen for the chrome changes

note: plan/log/bugs live at the main-repo path (untracked), not in the worktree checkout — code edits target the worktree, doc edits target the main repo

## phase 1 retro — 2026-05-28

### spec delta

- delivered: all 8 windows share the new chrome via `Window.svelte` — control order `[pop/dock] [minimize] [close]`; `ArrowUpRight`/`ArrowDownLeft` + `ChevronUp` + `X` at size 10 / stroke 2.5; circular semantic-fill chips (neutral/amber/red, hover darkens 20%); single `border-top` divider with `gap: 0`; lowercase titles; uniform `--fte-window-width` 18rem docked / min-width floating; 300ms focus flash (keyframe). typecheck/lint/unit (1287 pass) / build green; full e2e 107 passed / 3 skipped / 0 failed (no regressions vs phase-0 baseline)
- missed / deferred: none functionally. the DoD line "visual goldens diff + regen" is unsatisfiable — this repo has NO screenshot/visual-golden infrastructure (behavioral assertions only). recorded here as a spec delta, not a miss
- extra (beyond the phase-1 scope list): `WindowOverlay.svelte` edited — the surface restructure required stripping the now-redundant box from `.fte-window-popout` to stop popped-out windows double-boxing. the 110% scale audit needed no change (`html { font-size: 110% }` already present, all chrome rem-based)

### surprises

- docked windows painted NO background before this phase → `.fte-window-popout` was the only surface, so docked expanded bodies floated directly over the canvas → moving the surface onto `.fte-window-stack` both satisfies the "cohesive surface + single divider" DoD and fixes that readability gap, but forced the out-of-scope `WindowOverlay` edit to avoid a double-box
- the DoD assumed "visual goldens" exist → they don't; visual correctness (chip color/size, divider, flash) is unverifiable by automation in this repo
- e2e WebServer logged repeated `/api/auth/me ECONNREFUSED :8000` → benign (optional backend not running; auth dry-run stub handles offline); all 107 tests passed

### residual debt

- visual appearance unverified by a human: chip geometry (14px chip / 10px icon), semantic colours, divider, 300ms flash — implemented to spec but not eyeballed in a browser · routed to bugs.md as cc1-1
- fixed 18rem docked width + stack `overflow: hidden` could clip wide bodies (layout-metrics / coi-breakdown tables); mitigated with body `overflow: auto` but not visually confirmed · routed to bugs.md as cc1-2
- re-focusing an already-focused window does not re-flash (the `focused` derived doesn't change, so the `$effect` doesn't re-run); acceptable since the flash marks state-change · routed to bugs.md as cc1-3

### implications for downstream phases

- phase 2 (state model + pill behaviour): the flash keys off the `focused` derived; when pill-click adds restore/focus branches, consider a focus-tick/counter so re-focus + restore also flash (fold cc1-3 here)
- phase 5 (content UI consistency): body padding (0.5rem) + the border-top divider now live on `.fte-window-body`; the planned `.fte-window-section`/`-list`/`-row`/`-button` classes should assume that padding context and not double-pad

## revision after phase 1 — 2026-05-28

- phase 2 (state model + pill behaviour): revise — DoD adds a focus-tick/counter so re-focus + restore re-play the flash, not just first-focus (cc1-3); the existing debug-menu/onClose fold (cc0-3) stands
- phase 3 (dock corner config): unchanged — the 18rem width + surface restructure don't touch corner logic; the phase-0 full-height-container caveat still holds
- phase 4 (drag-to-reorder): unchanged
- phase 5 (content UI consistency): revise — new content classes must respect the phase-1 `.fte-window-body` padding + divider (no double-pad)
- verification: revise — manual-smoke gate now explicitly names the phase-1 visual checks (chip colours/geometry, divider, lowercase, width) and wide-body table overflow (cc1-1 + cc1-2), since the repo has no visual goldens to catch these automatically
- ordering: unchanged — risk-first order holds; no reorder/insert/delete
- triage: cc0-1, cc0-2, cc1-1, cc1-2 → defer; cc0-3, cc1-3 → fix-in-phase-2. no closures this phase (gc no-op). pattern: cc1-1 + cc1-2 + the missing-goldens fact form a visual-verification gap routed to the manual-smoke gate

## starting phase 2 — 2026-05-29

worktree: `.claude/worktrees/canvas-chrome-v2` (reused), branch `phase/canvas-chrome-v2/2` stacked on the phase-1 tip `03b904e` (phases 0+1 still pending merge to trunk)

**recon delta vs the DoD's accepted risks:** phase 0 already wired save-status + stats pills through `windowManager.pillClick` AND already gates both on `windowManager.isOpen(...)`. the e2e suite is already written defensively for closed-by-default — NO existing test assumes a *closeable* window is visible on load without seeding or an explicit open step. so the DoD's feared "15+ assertions break" did not materialize; phase-2 e2e work is mostly additive.

**design decisions (confirmed DoD):**

- expanded-state centralizes into `windowManager`: new `expandedWindows: SvelteSet` + `isExpanded`/`setExpanded`/`toggleExpanded`. `savePopoverOpen`/`statsPopoverOpen` in App.svelte become `$derived(windowManager.isExpanded(id))`; their writes (`= false`) become `setExpanded(id, false)`. removes the split open-vs-expanded ownership
- `lastState: SvelteMap<id, "docked-minimized"|"docked-expanded"|"floating">` updated on focus/popOut/redock/toggleExpanded; powers the restore branch
- 4-branch `pillClick(id)` in windowManager: closed→open(+expand), docked-minimized→restore(expand), docked-expanded→focus, floating→focus (or minimize if already focused)
- focus-flash tick (cc1-3): add a reactive `focusGen` counter incremented on every `focus()`; `Window.svelte` flashes when `focusGen` changes and the window is focused, so re-focus + restore re-play the flash
- debug-menu merge (cc0-3): windowManager owns the open-state via a new `NON_PERSISTED_IDS = {debug-menu, family-view-debug-*}` — `isOpen`/`openWindow`/`closeWindow` work but these ids are excluded from the `fte.dock.openedWindows` localStorage read/write, so "menu open does not persist across reload" (existing e2e) still holds. `debugMenuOpen` $state is removed; gate becomes `isOpen("debug-menu")`. debug pill + Ctrl+Shift+D become explicit open/close toggles (NOT pillClick — preserves the menu-trigger toggle UX); the titlebar × already routes through `windowManager.closeWindow` internally, so the parallel `onClose` hook is removed
- family-view 5 panels: gate becomes `isOpen(id) && <existing layer+data conditions>`; all 5 auto-open on family-view mount; non-persisted. preserves today's visibility (layer+data driven) while adding the close affordance + phase-3 Panels listing

**e2e enumeration (canonical "tests to touch"):**

- already-correct (no change): `canvas-window-manager.spec.ts:600` walking skeleton (asserts stats-pill absent on load, opens via menu); `:509` stats-row metric (seeds `fte.dock.openedWindows=["stats-window"]`); `:167` bring-to-top (seeds stats-window); all save-status tests (non-closing → always visible); all debug tests (seed `fte.debug.mode`, open via pill/keyboard); all `canvas-chrome-dock.spec.ts` family-view tests (toggle layers explicitly)
- to add: pillClick per-state (closed→open / minimized→restore / docked→focus / floating→focus-or-minimize); close-removes-pill + reopen-via-pill; debug-menu open/close cycle via the merged path; reload with seeded `openedWindows` → open, reload without → closed; family-view panel close-via-× then layer-toggle behavior

## phase 2 retro — 2026-05-29

### spec delta

- delivered: all 8 windows gated on `isOpen`; windowManager owns docked expanded/minimized state (`expandedWindows` + `isExpanded`/`setExpanded`/`toggleExpanded`); four-branch `pillClick`; `lastState`; `focusGen` re-flash (cc1-3); debug-menu merged into windowManager via `NON_PERSISTED_IDS`, `debugMenuOpen` + the parallel `onClose` hook removed (cc0-3); the 5 family-view panels gated on `isOpen` + auto-open on mount. unit 1295 pass (8 new), full e2e 111 pass (4 new) / 3 skip / 0 fail; typecheck / lint / build green
- missed / deferred: none from the DoD
- extra (beyond the phase-2 scope list): expanded-state was centralized into windowManager (scope said "migrate pill onclick handlers", but the four-branch pillClick needs windowManager to own expanded, so `savePopoverOpen`/`statsPopoverOpen` became derived views). the Window flash rework to `focusGen` (cc1-3) was folded in here as the plan's phase-1 revision scheduled

### surprises

- the DoD's biggest accepted risk did not materialize → phase 0 had ALREADY wired save/stats `pillClick` + `isOpen` gating and the e2e suite was ALREADY closed-by-default-defensive, so the feared "15+ assertions break, seed every beforeEach" was zero edits. phase-0 foresight paid the phase-2 test debt forward
- debug-menu persistence conflict → merging it into `openedWindows` would persist it across reload and break the existing "menu open state does not persist" e2e → resolved with `NON_PERSISTED_IDS` (in-memory open-state, excluded from the localStorage write) instead of a parallel flag
- flash premature-clear → a single `$effect` with cleanup kills an in-flight flash when a sibling window steals focus (cleanup runs on every `focusGen` tick) → split into a trigger effect + a destroy-only cleanup effect

### residual debt

- family-view debug panels have no pill (window-only, pillId===id), so once closed via × there is no way to reopen them until phase 3's full Panels menu or a remount · routed to bugs.md as cc2-1
- `pillClick` floating→minimize-if-focused and the `lastState` floating-restore branch are unit-covered but not e2e-covered · routed to bugs.md as cc2-2
- `expandedWindows` gets populated for family-view panel ids by auto-open, but those panels read their own local expanded prop, so that windowManager state is dead for them (harmless, slightly confusing) · routed to bugs.md as cc2-3

### implications for downstream phases

- phase 3 (corner config + full Panels menu): the Panels menu must list all 8 windows incl. the 5 family-view panels (resolves cc2-1); reuse `windowManager.windowState(id)` to render each row's open/closed + minimized/floating state
- phase 5 (content consistency): unaffected by phase 2

## revision after phase 2 — 2026-05-29

- phase 3 (corner config + Panels menu): revise — the full Panels section must list all 8 windows incl. the 5 family-view debug panels and render each row from `windowManager.windowState(id)`; it is the only reopen path for a closed family-view panel (cc2-1)
- phase 4 (drag-to-reorder): unchanged — windowManager now exposes `windowState`/`lastState` which the reorder gesture can lean on, but no spec change needed
- phase 5 (content consistency): unchanged
- ordering: unchanged — risk-first holds; no reorder/insert/delete
- triage: cc0-1, cc0-2, cc1-1, cc1-2, cc2-2, cc2-3 → defer; cc2-1 → fix-in-phase-3; cc0-3 + cc1-3 → CLOSED in efed0b8 (moved to bugs.md ## fixed). no new cluster — cc2-1 is cleanly absorbed by phase 3's already-planned Panels menu

## starting phase 3 — 2026-05-29

worktree: `.claude/worktrees/canvas-chrome-v2` (reused) · branch `phase/canvas-chrome-v2/3` stacked on `efed0b8` (phase 2 tip). merge to trunk pre-deferred by user ("don't rebase yet"). phases 0+1+2 still pending merge.

**confirmed DoD (cross-phase check in bold):**

- `CanvasChromeDock.svelte`: drop the `tl`-only guard; all 4 corners render — tl/tr expand downward (flex-col), bl/br upward (flex-col-reverse, no force-collapse); overflow clips in both directions
- `App.svelte`: `dockCorner: $state<DockCorner>` reads `localStorage.getItem("fte.dock.corner") ?? "tl"`, persists on change; passes corner to DockRegistration + CanvasChromeDock
- corner picker in the View menu: four buttons (tl/tr/bl/br); selecting updates `dockCorner` + the `fte.dock.corner` key
- full Panels section in the View menu (replaces phase-0 minimal version): lists all 8 windows — save-status, stats, debug-menu, AND the 5 family-view debug panels — each row rendered from `windowManager.windowState(id)`; clicking toggles via `openWindow`/`closeWindow`. **this is the ONLY reopen path for a closed family-view debug panel (cc2-1)**, so the 5 panels must appear even though non-persisted
- **dock re-positions without visual escape from canvas-host bbox at ALL 4 corners** (measure data-dock-pills / data-dock-panels CONTENT, never the full-height container bbox — see phase-0 retro :307/c)/f) trap)
- `notes/agents.md`: document `fte.dock.corner` + `fte.dock.openedWindows` localStorage keys
- `pnpm verify` green; e2e: corner change persists across reload at all 4 corners; Panels menu lists all 8 + reopens a closed family-view panel (cc2-1)

## phase 3 retro — 2026-05-29

closed in 5614e9a (pending merge).

### spec delta

- delivered: tl-only guard removed from `CanvasChromeDock` → all 4 corners render. `fte.dock.corner` persisted via a new `dockConfig` runes singleton; View menu gains a radio-style corner picker + a full Panels section listing all 8 windows (save-status / stats / debug-menu + 5 family-view panels), each row labelled from `windowManager.windowState(id)` and toggled via `openWindow`/`closeWindow`. family-view panel registrations rebound to `dockConfig.corner`. `notes/agents.md` documents both `fte.dock.corner` + `fte.dock.openedWindows`. verify green (typecheck / lint / hyperbolic-imports / unit 1304 / build); full e2e 115 pass / 3 skip / 0 fail (4 new across chromium+mobile)
- missed / deferred: none from the DoD
- extra (beyond the phase-3 scope list): (1) `dockCorner` lives in a module-scoped runes singleton (`dockConfig.svelte.ts`) rather than App.svelte `$state` as the DoD's wording implied — required so the deeply-nested family-view panels bind reactively without prop-drilling through `FamilyViewCanvas`; App still drives it via the picker. matches the `windowManager` / `dockRegistry` singleton pattern. (2) cc2-1 needed a code fix, not just a menu entry (see surprises). (3) added a 4-corner component matrix to `CanvasChromeDock.test.ts` + a `dockConfig` unit test (exported the `DockConfig` class for the storage-read path)

### surprises

- the per-corner class maps (`cornerClass` / `panelStackClass` / `pillRowClass`) ALREADY covered all 4 corners since phase 0 → removing the throw guard + binding `corner` reactively was the entire structural change. expected to author new corner geometry; found it pre-built
- cc2-1 was understated: it was logged as "no reopen path once × closes a panel", but closing never actually stuck. the phase-2 family-view auto-open `$effect` reads windowManager's reactive sets (it iterates `openedWindows` via `writeOpenedWindowsToStorage`, and reads `popOutStates`), so any `closeWindow` re-triggered the effect and immediately re-opened the panel. only surfaced now because phase 3 is the first to e2e-click a family-view panel's ×. fix: `untrack` the auto-open loop → mount-only, matching `DockRegistration`. now close AND reopen both work
- View-menu locator collision: `getByRole("button", { name: "View" })` substring-matched the debug `showViewportFitTarget` toggle ("viewport/target") once debug mode was on → needed `exact: true`. test-only
- a stale Playwright transform cache (`/tmp/playwright-transform-cache-1000`) ran a phase-0-RETIRED test ("412x915 popping out three windows", absent from source) during isolated single-spec runs, producing phantom failures. both full-suite runs were clean; clearing the cache + a fresh full run confirmed 0 failures. tooling artifact, not code — note for future isolated-spec debugging

### residual debt

- corner picker + Panels are flat menu items (no section header) — `MenuConfig` has no header/submenu type, so grouping relies on self-describing labels ("dock corner: …"). harmless · routed to bugs.md as cc3-1
- Panels rows for the 5 family-view panels toggle in-memory open-state with no visible effect when family-view is NOT the active engine (overlay unmounted). slightly confusing but harmless · routed to bugs.md as cc3-2
- cc2-1's fix is the `untrack` change; the menu listing alone would not have sufficed. cc2-1 → CLOSED in 5614e9a

### implications for downstream phases

- phase 4 (drag-to-reorder): the corner is now dynamic, so the reorder gesture + drop-indicator must behave correctly under both downward (tl/tr) and upward (bl/br) expansion — flag for phase-4 design
- phase 5 (content consistency + agents.md sweep): `agents.md` item 18 still references the removed `debugMenuOpen` flag (phase-2 stale); the phase-5 doc sweep should reconcile it. phase 3 added item 19 (dock keys)
- cc0-2 (narrow-viewport popout overlap) was floated as a phase-3 candidate but is NOT resolved — the no-overlap invariant is unsatisfiable at phone widths regardless of corner; stays deferred

## revision after phase 3 — 2026-05-29

- phase 4 (drag-to-reorder): revise — added a DoD bullet: the insert-position + drop-indicator math must handle both dock expansion directions (tl/tr downward / flex-col vs bl/br upward / flex-col-reverse) now that the corner is user-configurable; read `dockConfig.corner` to map pointer-y → insert index. position unchanged (still the scariest viable next phase)
- phase 5 (content consistency + cleanup): revise — the agents.md sweep bullet now also requires reconciling the stale item-18 `debugMenuOpen` reference (removed in phase 2); the two dock localStorage keys were already documented as item 19 during phase 3
- ordering: unchanged — risk-first holds; drag-to-reorder (novel multi-pointer gesture per corner) outranks phase 5's CSS-class consolidation. no reorder / insert / delete
- triage: cc2-1 → CLOSED in 5614e9a (the menu listing + the `untrack` auto-open fix); cc0-1, cc0-2, cc1-1, cc1-2, cc2-2, cc2-3 → defer (unchanged); cc3-1 (flat menu, no section header) + cc3-2 (family-view Panels rows inert when family-view inactive) → defer, both nits. no new cluster

## phase 4 retro — 2026-05-29

closed in 90c2181 (pending merge).

### spec delta

- delivered: drag-to-reorder for docked windows. new `order` field on `DockItem` + `reorderItem(id, corner, newIndex)` in `dockRegistry`; `CanvasChromeDock` owns the gesture (a `setContext` `DockReorderController`, capture-phase document pointer listeners with a pointer-id discriminator, visual-slot→sort-index math for both flex directions, force-collapse-to-titlebar during drag via the existing `forcedCollapse` render-ctx, 1px accent drop-indicator); a docked-expanded `Window` initiates from its titlebar (`getContext`, no-op when unmounted outside a dock). new `dockReorderContext.ts`. verify green (typecheck / lint / hyperbolic-imports / unit 1315 / build); full e2e 121 pass / 3 skip / 0 fail (3 new cases: reorder-up, drop-on-pills no-op, release-outside cancel — across chromium+mobile)
- missed / deferred: none from the DoD's behavioral list
- extra (beyond / against the scope wording): (1) **`order` is the PRIMARY sort key, not the "tiebreaker after priority and focusedAt" the DoD specified** — see surprises; a spec correction, implemented deliberately. (2) an off-by-one fix in the dock's pointerup (full-array drop index → reorderItem's post-removal index) found in review, not in the original programmer pass

### surprises

- **the DoD's sort spec was impossible as written.** it said `order` sorts AFTER `priority`. but every docked window has a UNIQUE priority (save-status 15, stats 25, family-view panels 200-230, debug 300), so priority always decides and an order-after-priority key is a guaranteed no-op — it could never move debug above stats, the literal required e2e. corrected to `order` PRIMARY (asc), default 0; because everything ties at 0 until a drag, default layout + focus-to-front are byte-for-byte unchanged. assumption → reality → delta: "order is a gentle tiebreaker" → "order must be primary or the feature is inert" → flipped the sort key precedence
- **off-by-one in the drop-index conversion.** `dropIndex` is computed against ALL rendered panels (the dragged item is still in the stack, just titlebar-collapsed), but `reorderItem` splices the dragged item out FIRST and interprets `newIndex` in post-removal space. for a downward drop (`target > from`) every slot past the origin has shifted down one, so the raw index overshoots by a slot. the two-item upward e2e passed by luck (clamp + small n); fixed at the pointerup call site (`target > from ? target - 1 : target`). found by reading the diff, not by a failing test
- **force-collapse-during-drag reflows the stack**, so bounding boxes measured before `mouse.down` are stale the moment the drag starts (every panel shrinks to its titlebar). the existing upward e2e is immune (it targets "above the top", still valid post-collapse); a downward drop targeted at a pre-measured full-height box lands below the now-short stack → outside the panels region → no-op. this is a test-authoring trap, not a code bug, but worth recording
- the reliably-draggable window set is thin for e2e: a reorder drag only initiates from a `windowState === "docked-expanded"` window, and the windows that are reliably present + windowManager-expanded are essentially stats + debug-menu (the 5 family-view panels are conditionally rendered on data state). constructing a *downward, middle-gap* drop needs a draggable window with >=2 items below it, which the stable set can't guarantee — so that path has no e2e (see residual debt)

### residual debt

- the off-by-one downward path is verified by reasoning + the `reorderItem` unit tests, but NOT locked by an e2e (the dock's full→post-removal index conversion is inline pointer-handler logic; a reliable downward multi-item drag can't be staged without depending on the conditionally-rendered family-view panels). a dropped attempt is documented above · routed to bugs.md as cc4-1
- a plain click on a docked-expanded titlebar now briefly enters reorder mode (beginReorder fires on pointerdown per the gesture contract); with no pointermove, dropIndex stays null and pointerup cancels, but there is a sub-frame collapse flicker. harmless in practice · routed to bugs.md as cc4-2
- family-view debug panels' draggability is unverified — they register conditionally and their `expanded` is caller-owned; whether a reorder drag initiates from one in practice is untested · routed to bugs.md as cc4-3

### implications for downstream phases

- phase 5 (content consistency + agents.md sweep): the agents.md canvas-chrome paragraph must now also document the `order` field + drag-to-reorder semantics (DoD already lists this) — note the order-PRIMARY precedence so a future reader doesn't "fix" it back to a priority tiebreaker. the stale item-18 `debugMenuOpen` reconcile is still outstanding
- no reorder/insert/delete of phase 5 implied; it remains the final cleanup pass

## revision after phase 4 — 2026-05-29

- phase 5 (content consistency + cleanup): revise — the agents.md sweep bullet now also requires documenting the `DockItem.order` field and that it is the PRIMARY `itemsForCorner` sort key (default 0), not a priority tiebreaker, so the precedence isn't "corrected" back later. the item-18 `debugMenuOpen` reconcile + the two dock localStorage keys (item 19) carry over unchanged. position unchanged — it remains the final cleanup pass
- ordering: unchanged — phase 5 is the last phase; nothing to reorder/insert/delete
- triage: cc4-1 (downward reorder has no e2e — off-by-one fix verified by reasoning + unit only) → defer/important; cc4-2 (titlebar-click flicker into reorder mode) + cc4-3 (family-view panel draggability unverified) → defer/nit. no new cluster. gc: cc0-3 + cc1-3 (closed efed0b8, aged >1 boundary) dropped from bugs.md ## fixed — `git log -G 'cc0-3'` / `'cc1-3'` is the trace; cc2-1 (closed 5614e9a) kept one more cycle

## phase 5 retro — 2026-05-29

closed in 56b254f (pending merge). final phase.

### spec delta

- delivered: four global window-body classes in `app.css` (`.fte-window-section` / `.fte-window-row` / `.fte-window-list` / `.fte-window-button`), derived from the dominant existing patterns and applied across the save-status, stats, and debug-menu bodies (App.svelte) + the family-view coi-breakdown / focus-log / layout-metrics panels. none add edge padding/border/background — `.fte-window-body` already owns the box, so the double-pad trap is avoided by construction. `notes/agents.md` canvas-chrome section rewritten (new icon set + `[pop/dock][minimize][close]` order, the closed/docked-minimized/docked-expanded/floating state machine, drag-to-reorder with the `order`-is-PRIMARY-sort note, shared body classes); item 18 + the debug-mode-split paragraph reconciled to code reality; item 19 gained an order-not-persisted clause. `notes/bugs.md`: pill-height entry closed, top-chrome z-order entry marked partially-addressed. verify green (typecheck / lint / hyperbolic-imports / unit 1315 / build); full e2e 121 pass / 3 skip / 0 fail
- missed / deferred: none from the DoD
- extra (beyond "apply classes"): the consistency task was really a **double-box cleanup** — statsBody / saveStatusBody / debugMenuBody each still wrapped their content in a vestigial popover box (border + bg + shadow + blur + fixed width + padding) left over from before the Window migration, duplicating the window chrome. stripped all three + the three family-view panel scoped boxes. also fixed a stale `debugMenuOpen` comment in Window.svelte

### surprises

- **the worktree branch was created in the WRONG repo.** the phase-5 `git checkout -b phase/canvas-chrome-v2/5` ran while bash cwd had drifted to the MAIN checkout (not the worktree), so it switched the main repo OFF `trunk` onto a stray `phase/canvas-chrome-v2/5` at trunk's tip, while the worktree stayed on `phase/4` with the edits uncommitted. caught at commit time (the programmer subagent flagged the mismatch). trunk had also legitimately advanced (a concurrent thread merged item branches), so this risked landing work on / disrupting another thread's branch. recovered non-destructively: `checkout trunk` in main (same commit → zero content change, dirty files preserved), `branch -d` the stray (no unique commits), then `checkout -b` correctly in the worktree (carries the uncommitted edits). lesson: the cwd hazard bites hardest at `checkout -b` — always `git -C <worktree>` for branch creation, never a bare `git checkout` after a doc-edit detour
- `debugMenuOpen` was ALREADY fully removed in phase 2 — only a single stale code comment + the agents.md item-18 text referenced it. item 18's premise ("reconcile the stale reference") was exactly right; the flag itself was long gone, merged into `windowManager.isOpen("debug-menu")` (non-persisted)
- no visual goldens (cc1-1) means the refactored bodies' appearance is unverifiable in CI — e2e (121 pass) confirms every testid/role/aria still resolves, but not a single pixel of the new look was eyeballed

### residual debt

- **manual visual smoke is still owed and now blocks ship** — cc1-1 (phase-1 chrome never eyeballed) + cc1-2 (wide bodies scroll-vs-clip in the 18rem stack) + the phase-5 body refactor all need a human pass at 1440x900 + Pixel 7. this is the last phase, so it rolls directly into `ship-readiness`, not a later phase · cc1-1 / cc1-2 stay open
- `.fte-window-row` colors only the label via a zero-specificity `:where(:first-child)` and lets the value cell INHERIT color — this deliberately preserves the selected stats row's accent value + the clusters row's amber value. a future "simplify" that forces `color: var(--color-fg)` on the value would regress both. documented in the app.css comment · no bug filed (the comment is the guard)

### implications for downstream phases

- no phases remain. the whole stack (phases 0-5, branches phase/canvas-chrome-v2/0..5, tip 56b254f) is pending merge to trunk, HELD at the user's standing request. next step is NOT another phase-loop pass — it is `ship-readiness` (verdict, incl. the owed manual smoke) then `pre-merge` (rebase onto current trunk — which has advanced to 2245396 — deferred-item migration, plan-dir archival) before the final merge

## revision after phase 5 — 2026-05-29

- no phases remain to classify — phase 5 was the last. plan.md status flipped to ALL PHASES CLOSED (pending merge)
- triage: bugs.md gc'd (cc2-1 dropped from ## fixed → git history); ship triage recorded in bugs.md — no hard code blockers; the single ship gate is the owed manual visual smoke (cc1-1 + cc1-2), to be run during ship-readiness. cc4-1 (downward-reorder e2e), cc0-1, cc0-2, and the six nits all defer
- next (NOT a phase-loop pass): `ship-readiness` verdict — must include the manual smoke at 1440x900 + Pixel 7 — then `pre-merge` (rebase phase/canvas-chrome-v2/5 @ 56b254f onto current trunk @ 2245396 — trunk advanced via concurrent item-branch merges during this plan — migrate any still-open deferred items into notes/bugs.md, archive this plan dir) then the final merge to trunk. all of it remains HELD at the user's standing "don't rebase yet"

## ship-readiness smoke findings → phase 6 opened — 2026-05-29

the manual visual smoke (cc1-1) surfaced a model-level divergence, not just cosmetics. corrected understanding: the dock IS a taskbar — a single list of pills, one per OPEN menu (like an OS taskbar); the window is a detachable surface shown only when docked/floating and fully hidden when minimized (pill remains). today's dock renders two parallel tracks (pill row + window-titlebar stack) and not every open menu has a pill.

what the current build gets wrong vs the taskbar model:
- minimized keeps the window TITLEBAR in the dock stack instead of collapsing to the pill alone (Window.svelte always renders `.fte-window-stack`)
- not every open menu has a pill — the 5 family-view debug panels register `kind="window"` with `pillId === id` and have no taskbar pill
- the dock spans the full edge rather than hugging the corner + expanding away from it
- pop/dock + minimize icons are fixed, not anchor-aware

(note: the pill + docked-window coexisting is NOT a bug — that is the intended docked state. the earlier "redundant double-render" read was wrong.)

phase 6 spec written into plan.md (dock-as-taskbar) with three flagged assumptions (A1 family-view panels get real pills; A2 reorder moves onto the taskbar pills; A3 glanceable status only while open / which menus stay non-closing). ship verdict stays NO-SHIP; this reopens the plan from ship-readiness. phase 6 is large enough it may split into canvas-chrome-v3 — decided at kickoff. nothing merged; stack 0-5 (tip 56b254f) still held.

## phase 6 retro — 2026-05-29

closed (pending merge): break spike + fixes + fix cycle across 7c5108b · 8a42eb1 · cd3d386 · e1880d4 · c32730b · a3ce445.

### spec delta

- delivered: the dock is now a taskbar — one pill per OPEN menu; a window's surface renders in the dock ONLY when docked-expanded; docked-minimized = pill only; floating in the overlay. all 5 family-view panels got real taskbar pills and their expand-state was moved onto windowManager (isExpanded/toggleExpanded/setExpanded), so windowState() is accurate for all 8 menus. anchor-aware control icons; corner-hug geometry; pills always render first in DOM so they sit at the anchored edge (fixed the bl/br inversion). drag-to-reorder moved off the titlebar onto the taskbar pills (horizontal drop math, 4px threshold + click-swallow, vertical drop-indicator); new DockItem.windowId pairs a pill to its window and reorderPills mirrors order onto the paired window. pill + titlebar-control icons sized to scale with the 110% root / match text pills. floating-window minimize fixed (re-dock then collapse). verify-equivalent green: typecheck / lint / hyperbolic-imports / unit 1321 / build / full e2e 121 pass / 3 skip / 0 fail
- missed / deferred: agents.md dock section is now STALE — phase 5 rewrote it for the OLD windows-in-dock model; it needs a rewrite for the taskbar model (pill-per-open-menu, minimized=pill-only, reorder-on-pills, windowId). routed as the one open phase-6 doc to-do
- extra (beyond the phase-6 DoD): the bl/br pill-layout inversion was a pre-existing latent bug (pillsFirst=false + flex-col-reverse floated pills above the windows; the tl default masked it) — fixed here

### surprises

- the break spike's blast radius was narrow: the old "docked-minimized window shows a titlebar in the dock" invariant was funneled almost entirely through one e2e file + its seedTwoExpandedWindows helper + one component test. rework was concentrated, not diffuse
- the pill-icon complaint wasn't root-scaling — it was parity: icon-only pills read smaller than text pills next to them. fix was sizing icons to the text line-height, not just making them rem-based
- minimize was a latent no-op on floating windows (effectiveExpanded pins true while popped out); never surfaced until the taskbar model made minimize-to-pill the expected outcome
- family-view panels drove expand from caller-owned $state that diverged from windowManager — had to reconcile it for the render filter + minimize to work uniformly. this also closes the cc4-3 concern (their draggability/expand is now windowManager-backed)
- reorder pill↔window coupling: the pill/window id pairing is non-uniform (save-status↔save-status-window, debug-toggle↔debug-menu, <id>-pill↔<id>), so an explicit DockItem.windowId link was needed rather than string derivation

### residual debt

- agents.md dock section stale (above) — must update before ship · no bug id, it's a phase-6 doc to-do
- manual visual smoke STILL owed and now broader: the taskbar model (pill-per-menu, minimized=pill-only, pill reorder, anchor icons, corner layouts) has only e2e coverage, no human eyeball — re-run the smoke at 1440x900 + Pixel 7 before ship (cc1-1 / cc1-2 stay open)
- pill-drag-while-another-popover-open: App.svelte's outside-click-close can minimize a different window mid-drag (stats-window has the listener; debug-menu doesn't). arguably correct (click-elsewhere closes the popover) but a sharp edge · new nit cc6-1

### implications for downstream phases

- phase 6 is again the last phase. next is NOT another phase-loop pass: finish the agents.md doc sweep, then re-run ship-readiness (incl. the owed manual smoke), then pre-merge (rebase phase/canvas-chrome-v2/6 onto current trunk, migrate deferred items, archive plan dir) then merge. all HELD at the user's standing request
