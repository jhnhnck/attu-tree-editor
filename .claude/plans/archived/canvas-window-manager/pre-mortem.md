# Pre-mortem — canvas-window-manager (lively-sniffing-hanrahan)

**Bottom line:** rework before phase 1.

four high-severity risks have no concrete probe scheduled (pop-out chrome-inset semantics, dock z-order vs priority sort, `Window` API surface area vs the plan's own pivot criterion, debug menu lag root-cause). the phase-0 walking skeleton picks save-status as its proof point but never touches drag, focus-z, the canvas-host bbox, pointer fallthrough, or the data-canvas-chrome carrier question — so the load-bearing decisions all land in phase 1+ with no cheap-rollback escape. recommend reshaping phase 0 to spike the four hardest contract questions before any production migration lands.

## Risks

### high

- [high] **scope / premise** — `Window` props at phase-0 DoD already enumerate 8 fields (`id, title, body, controls?, pillId, focused?, forceCollapsible?, popOutDisabled?`), the plan's own pivot criterion fires at >1 optional beyond `{ title, body, pillId, forceCollapsible?, popOutDisabled? }`. as written the pivot fires on day 1. plan line 93 vs lines 99-100. · **probe:** before writing `Window.svelte`, spike the contract against the four hardest callers (debug menu, stats popover w/ trigger-pill back-channel, family-view layout-metrics w/ user-collapse-state, family-view coi-breakdown w/ tabular body) and write the agreed prop list verbatim into the plan; if it's >5 props, redesign before any caller migrates.

- [high] **integration / premise** — popped-out windows ARE chrome inside the canvas-host that `measureCanvasChromeInsets` reads (fitMath.ts:131-184 walks every `[data-canvas-chrome]`). plan never decides whether `WindowOverlay`'s positioned wrappers carry the attribute. if yes, every drag-step thrashes `fitToView`'s inset readings and the canvas re-centers under the moving pointer; if no, the canvas pans content under a popped-out window and the user's "drag aside to reference" use-case breaks immediately because their cards slide under the window they popped out to see. · **probe:** in phase 0 add a 30-line probe: render a fake popped-out box at `(host.right - 320, host.top + 60)` carrying `data-canvas-chrome`, recenter, log `fitToView` numbers; then strip the attribute, repeat. record which behavior matches the stated intent and bake the decision into `Window.svelte` before phase 1. without this answer, the phase-1 drag e2e ("canvas does not pan") is meaningless — drag handling won't pan, but the inset reader will, on every mouseup.

- [high] **integration** — dockRegistry sort is `priority asc, then id` (dockRegistry.svelte.ts:101-104). plan promises "focused window = top of dock stack" (line 18) and "clicking a non-top docked window's titlebar brings it to z-front of the stack" (line 87). the dock's actual stack is `flex-col-reverse` with rendered-order = priority order; there is no z-order — items don't overlap, they tile. either the plan means the stack visually reorders (mutating priority on focus = priority drift over time + leaks into the priority-space convention documented in dockRegistry.svelte.ts:13-17 and agents.md:187) or it means a focus-only sort key (new field) that this risk says must NOT bleed into pills/non-windows. neither interpretation is named. · **probe:** day-1 spike — pick one of: (a) `focusedAt: number` tiebreaker scoped to `kind === "window"` inside `itemsForCorner`, or (b) keep priority as the single sort key and document "focus only changes z when popped-out". prove the choice doesn't reorder save-status (priority 10) under any debug-window's focus event. record verdict in plan. as written phase 1 will discover this on its own and pick one in an ad-hoc way.

- [high] **expertise / scope** — phase 4 schedules "debug menu open lag fixed" as a deliverable but the root cause is unknown. the migrate-debug-menu retro names two strong candidates: snippet-identity churn (closing over `treeStore.tree.editRev` and `debugTimings`, both high-frequency-mutating state) and `DockRegistration`'s second `$effect` re-running `updateItem` on every render of the snippet closure (DockRegistration.svelte:61-66 — the `next` object includes `render` which is a fresh reference every parent re-render). neither is verified. scheduling "fixed" without a known cause invites the symptom to walk: a profiling pass might find the lag is unrelated to snippet identity and instead lives in App.svelte's `debugOptions` derivation (line 324) cascading through `FamilyViewCanvas:401-404`. · **probe:** schedule the firefox profile capture in phase 0 (before any Window migration), not phase 4. capture two profiles — current trunk and a stripped repro that disables `editRev`/`debugTimings` reactivity to the menu. record cause-of-lag in plan before phase 2 (where the menu re-registers as `kind: "window"`).

### medium

- [medium] **integration** — `CanvasChromeDock.scheduleMeasure` only re-runs on `items.length` changes (CanvasChromeDock.svelte:175-184). a popped-out window is hidden from the dock but its registry item still exists — items.length unchanged, no remeasure. plan phase 1 line 143 says "hide items whose `windowManager.popOutStates` includes their id". if hidden via `display:none` on the wrapper, the wrapper's `getBoundingClientRect()` returns zero (CanvasChromeDock:253), and the dock's force-collapse cap projection treats the window as height-zero — that's actually correct for cap math BUT the `$effect` deps don't include `popOutStates`. user pops a window → dock doesn't re-measure → force-collapse stays applied even though the window's height went to zero → coi-breakdown and friends stay pill-form. plan never lists this reactivity edge. · **probe:** phase 1 e2e: open layout-metrics + coi + focus-log + debug-menu so cap forces three to pill, pop out the debug menu, assert one of the previously-force-collapsed panels unwinds within 2 rAFs. drives the fix.

- [medium] **integration** — drag pointer-capture inside the canvas-host has to coexist with the canvas pan handler at the same DOM level. plan lines 86, 135-136 cite the "drag over card → no selection, no pan" e2e but the canvas's pan handler is on the canvas-host itself; `stopPropagation` from the titlebar only protects when pointerdown LANDS on the titlebar. the e2e in line 135 covers titlebar drag; nothing covers drag that releases over a card. pointerup-on-card with a button-not-pressed state can still re-fire selection if the canvas handler is `click`-based, not `pointerdown`-based. on touch (Pixel 7, mentioned line 223) the path is worse — pointercancel can fire mid-drag if the OS gesture system claims it. · **probe:** phase 0, before drag code lands, write a 1-screen html scratch with a draggable box + a sibling click-target and confirm what touch does on a real Pixel 7. record verdict in plan. **also** add a phase-1 e2e: pointerdown on titlebar, pointermove over a card, pointerup over the card → assert (a) selection unchanged, (b) `treeStore.dirty` unchanged, (c) the released window's position equals the pointer-release point.

- [medium] **integration** — the canvas-host bbox clamp at line 128 is "static" — it reads `canvasHost.getBoundingClientRect()` at drag-start. but the sheet inspector publishes `--inspector-sheet-height` (Inspector.svelte:344); opening the inspector while a window is popped out near the bottom-right edge resizes the canvas-host and the window now overlaps the inspector. phase 1 DoD lines 127-128 only clamp during `moveTo`. resize events have to call clamp-in-place on every popped-out window. plan never enumerates this. · **probe:** phase 1 DoD addition — drag a window to the bottom-right corner, then trigger sheet-mode inspector open; assert the window's bbox is still inside `canvas-host - 8px` after the host resizes. fix is a resize-observer on the canvas-host that re-clamps every entry in `windowManager.popOutStates`.

- [medium] **scope** — phase 2 says "delete `CanvasChromePill.svelte`". but `CanvasChromePill` is also what handles `expanded` + `forcedCollapse` body-suppress logic (CanvasChromePill.svelte:88-105). the family-view panels migrate to `<Window>` whose body is shown/hidden by what — a separate `expanded` prop on Window? today's `forceCollapse(id)` is a dock-managed flag; the `Window` body has to read it and the user-toggled state separately. plan never spells out the Window expanded-state model. line 144 says "windowManager hides items whose popOutStates includes their id" — that's pop-out, not user collapse. how does layout-metrics' `collapsed.layoutMetrics` toggle from FamilyViewDebugOverlay.svelte:1476 plug into the Window? if Window has an `expanded` prop the caller drives, then Window also needs a `forcedCollapse` prop (dup of today's pill). if Window owns expansion itself, you've moved per-caller state into a shared component that has to thread through eight different toggle handlers. · **probe:** phase 0 contract spike must enumerate the expansion-state shape for layout-metrics specifically (CanvasChromePill's body+pill story) and record the chosen shape before any migration.

- [medium] **integration** — phase-5 anchor clamp (CanvasChromeDock.svelte:301-324, 353-376) writes `bottomClampPx` based on the dock's height vs the canvas-host. once the menu is a Window with pop-out, popping it out subtracts ~720px of natural dock height. the dock's measurement after pop-out projects much smaller; the clamp clears; the dock snaps down toward `--inspector-sheet-height + 0.75rem`. visible jump every pop-out / re-dock. plan never mentions this. · **probe:** phase 1 e2e on Pixel 7 — open debug menu (clamp active), pop it out, assert the dock's `bottom:` doesn't shift by more than ~1 pill height. fix is either a transition on `bottomClampPx` or an explicit anti-jump pass that holds the prior anchor for one frame and re-measures with the post-pop-out projection.

- [medium] **scope** — `editRev` removal across two surfaces. plan line 56 says "standalone debug-timings pill removes; editRev moves into save-status window." but App.svelte:2230-2232 also bakes `editRev` into the debug-timings pill alongside `debugTimings.total.toFixed(1) ms`. phase 4 deletes the whole pill — does the layout-pass-time-ms (`debugTimings.total`) also relocate, or get dropped? agents.md considers debug timings a useful canary; dropping it silently is a regression. plan never decides. · **probe:** phase 4 DoD addition — name the new home of `debugTimings.total.toFixed(1) ms` (likely save-status window's row 3 alongside editRev, or a row inside the debug menu's runtime section). don't ship the deletion of the debug-timings pill until that home exists.

- [medium] **operational** — visual snapshot regen scope is undefined. plan line 216 says "regen `visual-canvas-chrome-dock.spec.ts`". but `visual-akarians-family-view.spec.ts` is already stale per migrate-debug-menu retro (log.md:46-47) — and every floating surface changing also touches it. plus family-view-debug-phase5 visuals. plus any save-pill / inspector visuals. plan says nothing about which other goldens it owns. as written phase 4 will discover stale goldens at ship time, run `PLAYWRIGHT_UPDATE_SNAPSHOTS=1`, and either over-regen (sweeping unrelated drift into this plan's commit) or under-regen (leaving the visuals red on trunk). · **probe:** phase 4 DoD must enumerate every spec that captures bl-corner pixels; either regen all in one commit with a paper-trail of why each diff is expected, or explicitly out-of-scope the unrelated drift (file an `audit-visuals` task on trunk and don't ship phase 4 until it's clean).

- [medium] **integration** — stats popover's metric-selector pattern (phase 4 line 196) — buttons inside the stats Window body call back to `selectedMetric` $state in App.svelte. plan says snippet closure carries it. it does, but the popOut path through `WindowOverlay` re-renders the same snippet through a different mount-tree (`WindowOverlay` iterates registry items at the canvas-host root, not inside the dock). same snippet reference, different DOM parent. snippet closures across re-mounts work in svelte 5 (the closure captures `selectedMetric` by reference) — but only if WindowOverlay invokes `{@render item.render(ctx)}` against the same snippet declaration. plan never describes how WindowOverlay finds the snippet — if it copies the registry entry's `render` field at popOut time and re-invokes from a different parent tree, captured-state pointer stays the same. validate this. · **probe:** phase 1 unit test — register a snippet that increments and reads a $state counter, pop out, click a button in the popped-out body, assert state mutation reaches the original caller. fail fast if WindowOverlay's render path drops closure identity.

- [medium] **operational** — "windows must stay inside canvas-host bbox" (line 75) collides with the help/menu bar at the top of the page. on Pixel 7 the canvas-host's top is ~`menu-bar-height + toolbar-height`. with sheet inspector closed, popping out two windows would cascade at `host.top + 60 + n*24` (line 129). cascade math doesn't know about the dock's own bbox at `bottom: --inspector-sheet-height + 0.75rem`. on a narrow viewport the cascade cap-n=8 could land windows inside the same pixels the dock occupies. · **probe:** phase 1 e2e — at 412×915 with the dock at full natural height (menu open, layout-metrics + coi expanded), pop out three windows and assert none overlap the dock's bbox. fix is either a dock-aware cascade-from offset or a per-window collision check at pop-out time.

### low

- [low] **integration** — testid contract preservation. plan line 78 says `debug-panel`, `debug-pill`, `save-status-pill`, `stats-pill`, `stats-popover`, `family-view-debug-*` keep resolving. but the family-view debug panels' migration moves bodies into Window snippets; today's testids include both pill-side (`family-view-debug-coi-breakdown-toggle`) AND body-side (`family-view-debug-coi-breakdown-body`) AND content-cell-side (`family-view-debug-coi-focus`, `-raw`, etc — FamilyViewDebugOverlay.svelte:1245-1271). plan doesn't enumerate which testids land where on the Window's titlebar vs body wrapper. one missed and an e2e that's been green since the migrate-debug-menu plan turns red. · **probe:** phase 2 DoD — table mapping every existing `family-view-debug-*` testid to its post-migration carrier (window-titlebar / body wrapper / inline content). low-effort review-time check.

- [low] **scope** — plan claims "every persisted artifact carries `schemaVersion`" (CLAUDE.md hard rule 6). `debugMode` localStorage at phase 3 (line 172) is `fte.debug.mode` — a plain boolean, not a schema-versioned blob. matches the precedent of `fte.debug.authDryRun` at App.svelte:240. fine, but worth a note in plan that this is consistent precedent for ephemeral debug flags (vs. genuinely persisted user data). · **probe:** none — just one sentence in agents.md's localStorage paragraph.

- [low] **scope** — `coi breakdown doesn't render` is filed in the plan (line 28) as "functional bug, phase 4". the migrate-debug-menu retro at log.md:43 already documents that the coi panel force-collapses on cramped desktop because the `12rem → 16rem` clamp tuning. is the user's "doesn't render" bug the same force-collapse symptom? if so it's already fixed and phase 4 has no work to do here. if not, it's a separate issue. · **probe:** phase 0 — load the fixture the user reported the bug against and confirm whether the panel is force-collapsed (pill visible, body suppressed) vs not registered at all. takes 5 minutes. if it's force-collapse, the bug closes against the migrate-debug-menu plan, not this one.

- [low] **operational** — pivot criterion (line 93) is binary on prop count but doesn't fire on integration failures. if phase 0's spike uncovers that Window+expansion-state requires a context provider or a registry-side `expandedIds` set (analogous to `forcedCollapseIds`), that's the actual signal to pivot — not the prop count. · **probe:** rewrite pivot criterion as "phase 0 spike must produce a contract that lets all four hardest callers ship without a context provider AND without re-introducing per-caller chrome rules; if either fails, redesign".

## Walking-skeleton check

**verdict: insufficient.**

phase 0 picks save-status as the proof point — but save-status is the *easiest* migration (already-popover, no pop-out, no drag, no focus, no z-order, no body-expansion ambiguity, no force-collapse since `forceCollapsible: false`). the walking skeleton skips every load-bearing decision the rest of the plan rests on:

| decision | phase that needs it | phase 0 touches? |
|---|---|---|
| `Window` prop contract (load-bearing per line 93) | every phase | partial — only save-status' shape |
| Drag + pointer fallthrough to canvas | phase 1 | no |
| `data-canvas-chrome` on popped-out wrappers | phase 1+ | no |
| Focus z-order vs priority sort | phase 1 | no (sets `focusedWindowId` but doesn't reorder) |
| Body-expansion state model (Window vs caller) | phase 2 | no — save-status has no user-collapse |
| WindowOverlay snippet closure identity | phase 4 | no |
| Debug menu lag root cause | phase 4 | no — deferred to phase 4 |

**proposed phase 0 reshape (walking skeleton that actually walks):**

1. spike `Window` against the four hardest callers (debug menu, stats popover w/ trigger-pill metric back-channel, family-view layout-metrics w/ user-collapse, coi-breakdown w/ tabular body) **on paper, in plan.md** — produce the contract verbatim, confirm prop count ≤ 5, record body-expansion model.
2. write a 30-line probe answering the `data-canvas-chrome` question for popped-out windows; record verdict.
3. capture the debug-menu-lag firefox profile; record root cause class.
4. land `Window.svelte` + `windowManager.svelte.ts` with focus tracking AND a working drag-aside-from-bbox demo using a single non-production caller (a hidden-behind-debug-toggle "hello world" Window registered at priority 999). prove drag, focus-to-front, bbox clamp, canvas-no-pan, pointer-no-fallthrough on real Pixel 7 hardware.
5. only after the demo is green: migrate save-status as the first production caller.

this folds the phase-1 hard work back into phase 0 where rollback is cheap (one file delete, no production callers migrated).

## Phase-order revisions

| original | proposed | reason |
|---|---|---|
| phase 0 = Window + save-status migration only | phase 0 = Window + drag/focus/bbox spike + hello-world demo, then save-status | walking skeleton has to prove the load-bearing claims, not the easy one |
| phase 1 = pop-out + z-manager + drag (all new) | phase 1 = WindowOverlay mount + per-corner registry filtering + pop-out state plumbing (drag already proven in phase 0 demo) | drag is a phase-0 risk, not a phase-1 deliverable |
| phase 4 = debug menu lag fix (root cause TBD) | phase 0 = capture profile + name root cause; phase 4 = apply the fix | scheduling "fixed" before knowing "what's broken" leaves the bug for last when there's no time to rework the abstraction it might require |
| phase 4 = coi breakdown fix (root cause TBD) | phase 0 = 5-minute repro to determine if it's force-collapse (already fixed) or a registration gate (separate bug); decide once, then schedule | risk that phase-4 work item closes against a different plan |

## Definition-of-done additions

### phase 0

- add: walking-skeleton drag/focus/pop-out demo on real Pixel 7 hardware, gated behind a debug-menu toggle, deleted at the close of phase 0
- add: `data-canvas-chrome` decision for popped-out windows, recorded in plan.md and baked into `WindowOverlay.svelte`'s wrapper
- add: focus-z-order spike — chosen mechanism (priority-mutation, separate `focusedAt`, or pop-out-only) documented; proof that save-status (priority 10) cannot be reordered under any focus event
- add: debug-menu-lag firefox profile captured against current trunk; root cause class (snippet identity / derived chain / DockRegistration effect / other) named in plan log before phase 1 starts
- add: pivot criterion rewrite — fires on prop-count >5, on need for a context provider, on need for caller-side chrome rules; not just prop count
- add: `Window` body-expansion-state model (Window-owns vs caller-owns vs registry-owns) chosen against the layout-metrics shape; coi-breakdown body-rendering pattern confirmed inside the chosen model
- add: coi-breakdown 5-min repro — record whether the bug is force-collapse (close against migrate-debug-menu) or registration gap (carry into this plan's phase 4)

### phase 1

- add: e2e — drag over card with pointerup on the card → no selection, no pan, no dirty mutation
- add: e2e — on Pixel 7 touch: pointerdown on titlebar, finger drag, lift → window follows finger, canvas does not pan, no pointercancel
- add: e2e — drag a window to bottom-right edge, open sheet inspector → window re-clamps inside the post-resize canvas-host bbox
- add: e2e — open dock to force-collapse state, pop out the highest-impact window → at least one prior force-collapsed panel unwinds within 2 rAFs
- add: e2e — anchor-clamp anti-jump: pop out the debug menu with clamp active → dock's `bottom:` doesn't shift by more than ~1 pill height in a single frame
- add: e2e — cascade vs dock-bbox: three popped-out windows at 412×915 with full natural dock → no popped-out window overlaps the dock
- add: unit — WindowOverlay-rendered snippet closes over caller state correctly (counter probe)
- add: `$effect` deps on dock `scheduleMeasure` include `popOutStates` membership (or document the alternative re-measure trigger)

### phase 2

- add: testid mapping table — every `family-view-debug-*` and `debug-*` testid mapped to its post-migration carrier (Window titlebar / body wrapper / content cell). reviewer signs off before merge
- add: `CanvasChromePill.svelte` deletion is the LAST step of phase 2; until then, both pill + Window coexist so partial rollback stays cheap
- add: assertion that `forceCollapse(id)` calls from `CanvasChromeDock.measureAndForceCollapse` still hide the Window's body (not just its dock-pill stand-in); the expanded-state model from phase 0 must make this work

### phase 3

- add: full enumeration of every `debugLayers` / `familyViewDebugLayers` / `debugOpen`-gated derived block in App.svelte before the rename lands. there are at least three direct uses (App.svelte:324, 406, 2235, 2700) plus indirect uses via `debugOptions` / `familyViewDebugOptions`. one missed → a debug layer stays off when the menu closes
- add: localStorage key `fte.debug.mode` declared in plan and documented in agents.md alongside `fte.debug.authDryRun`; no schema version (debug-flag precedent)
- add: e2e — toggle debug-mode off from help menu while menu open → menu auto-closes, pill removes from dock, effects clear

### phase 4

- add: explicit relocation home for `debugTimings.total.toFixed(1)` — name the destination before deleting the debug-timings pill
- add: enumerate every `visual-*.spec.ts` golden that captures bl-corner pixels; either regen them all in this plan's commit with a per-spec note explaining the expected diff, or out-of-scope unrelated drift to a follow-up `audit-visuals` task on trunk
- add: benchmark instrumentation pinned in code, not just measured manually — the <50ms claim at line 203 needs a regression test that re-runs in CI; otherwise the lag returns the next time someone adds a `$derived` reading `treeStore.tree.editRev`

## What's missing or under-specified

- **the `Window` ↔ `dockRegistry` boundary.** plan never decides whether `<Window>` *is* a `<DockRegistration kind="window">` (caller wraps `<Window>` in DockRegistration as today's panels wrap `<CanvasChromePill>` in DockRegistration) or whether `<Window>` internally calls `register()` (a new pattern). today's `DockRegistration` is intentionally a snippet-registration shim because top-level `{#snippet}` declarations aren't addressable from `$effect` (see DockRegistration.svelte:2-11). if `<Window>` swallows registration, callers can no longer use the same snippet pattern. record the boundary in phase 0.

- **pop-out positions are transient (non-goal line 65) — but the cascade offset is also transient.** after popping out window A, popping out B, closing A, popping out C: does C cascade at n=1 (only B is out) or n=2 (the next-cascade-slot pointer never decrements)? if n=2, two pops + one re-dock + one pop = drift, and the soft cap of 8 hits early on power-user workflows. spec the cascade-slot policy.

- **WindowOverlay's mount lifecycle across engine swap.** plan line 140 says "iterates `windowManager.popOutStates`; renders each popped-out window's Window snippet". but family-view debug panels register only when the family-view engine is mounted; switching to layered unmounts FamilyViewDebugOverlay → unregisters the panels → the dock has no item but `popOutStates` still has the id. does WindowOverlay render an orphan? or does engine-swap clear `popOutStates`? specify.

- **a focused window's titlebar accent is mentioned in two phases (line 51, 130) but never tied to `kind: "pill"`.** confirm pills cannot focus (they have no titlebar). same for non-window panels (today's family-view panels migrate to Window in phase 2, but until then they're `kind: "panel"`). focus model has to handle the mixed-kind transitional state during phase 2.

- **modal precedence boundary.** plan line 77 says modals z-stack above all canvas-chrome windows; manager's max z is below `z-50`. dock outer container is `z-30` (CanvasChromeDock.svelte:382). popped-out windows need a z-range like `z-30...z-49` to stay below modals. spec it; today's `z-40` saver-popover and stats-popover both sit inside that band.

- **drag on touch + click-to-edit cards.** if pointerdown on titlebar on touch starts a drag, then pointermove drags the window — fine. but the canvas-host's existing pan handler sees the pointermove on its descendant (the titlebar is inside the canvas-host per WindowOverlay mount). svelte event capture order + canvas's pointer pipeline must be verified. line 250 says "stopPropagation at the titlebar handler, not a global flag" — agreed, but write the e2e.
