# canvas-chrome-v2 bug log

*defects found during implementation. bug-triage operates on this file.*

## open

- **[important] cc0-1 mobile menu z-order — broader top-chrome layering** → defer · phase 0 hoisted only the open menu-bar dropdown to `z-[55]` so it clears the inspector sheet (z-50) on narrow viewports. the broader requirement — title strip + menu bar + dropdowns as the highest non-modal layer, above cards (incl. `translate3d` stacking contexts), toasts, and overlay panels — is unsolved. canonical home is `notes/bugs.md` §shell ("title bar + menu bar do not render above all other UI", medium/low). not in any phase 1-5 DoD; revisit there or fold into the notes/bugs.md item. blocked the naive fix (whole-header `z-60`) because it then sat above modals (z-50) — see log.md phase 0 retro.
- **[important] cc0-2 pop-out windows overlap the tl dock controls on narrow viewports** → defer · with the dock at tl and a ~301px popout on a ~412px screen, a popped-out window covers the remaining dock pop-out controls; the bl-era "no overlap with dock" invariant is unsatisfiable. handled for now by retiring `canvas-window-manager.spec.ts:307` and scoping `:167` to chromium. real fix is a product decision (disable pop-out on narrow viewports, or make the cascade dock-aware) — candidate for phase 3 (corner config) or an explicit non-goal.
- **[important] cc1-1 phase-1 chrome visual appearance unverified by a human** → defer · the chrome sweep (circular chips at ~14px with 10px icons, neutral/amber/red semantic fills, single border-top divider, lowercase titles, 300ms focus flash) was implemented to the DoD and passes all behavioral tests, but this repo has NO visual-golden / screenshot infrastructure, so colours, geometry, and the flash were never eyeballed. unblocked by the plan's existing manual-smoke gate (1440×900 + Pixel 7); must be exercised before ship. blocker-adjacent only in that "looks wrong on first contact" is a ship risk — kept as important/defer until the manual smoke runs.
- **[nit] cc1-2 fixed 18rem docked width + `overflow: hidden` may clip wide window bodies** → defer · `.fte-window-stack` is now a fixed `var(--fte-window-width)` (18rem) docked with `overflow: hidden` for corner-radius clipping. wide bodies (layout-metrics / coi-breakdown tables) previously grew to content width; now mitigated with `.fte-window-body { overflow: auto }` so they scroll instead of clip, but not visually confirmed. revisit with cc1-1 at manual smoke.
- **[nit] cc2-2 floating→minimize and lastState floating-restore branches are unit-only** → defer · `pillClick` floating→minimize-if-already-focused and the closed→reopen-restores-to-floating path are covered by windowManager unit tests but not exercised end-to-end (the pop-out/drag e2e doesn't click the pill in those states). low risk; add an e2e if the behavior ever regresses.
- **[nit] cc2-3 `expandedWindows` is dead state for family-view panels** → defer · auto-open calls `openWindow` for the 5 panel ids, which adds them to `expandedWindows`, but those panels render from their own local `expanded` prop (auto-expand-on-appear), so windowManager's expanded-state for them is never read. harmless; tidy up if the family-view panels ever migrate their expanded-state into windowManager.
- **[nit] cc3-1 corner picker + Panels are flat menu items with no section header** → defer · `MenuConfig` (shell/menu.ts) has only `MenuItem | "divider"` — no header or submenu type — so the View menu's corner picker and Panels rows rely on self-describing labels ("dock corner: …") separated by dividers rather than a labelled section. harmless; revisit only if a header/submenu entry type is added to the menu model.
- **[nit] cc3-2 Panels rows for family-view panels are inert when family-view is not the active engine** → defer · the 5 family-view panel rows always render in the Panels section, but toggling one while a non-family-view engine is active only flips the in-memory open-state — nothing paints until the overlay remounts (family-view re-selected). slightly confusing but harmless; could grey out the 5 rows when `FamilyViewDebugOverlay` is unmounted if it ever bites.
- **[nit] cc6-1 pill drag while another window's popover is open can minimize that other window** → defer · App.svelte's outside-click-close listener (stats-window has one; debug-menu does not) fires during a taskbar pill drag, so dragging a pill while another popover is expanded can collapse it mid-gesture. arguably correct (click-elsewhere closes the popover) but a sharp edge; revisit if it ever feels wrong in use.

cc4-1, cc4-2, cc4-3 closed/obsoleted by phase 6 (taskbar model): reorder moved off the panel titlebars onto the taskbar pills (cc4-2 titlebar-flicker is moot; the pill drag has a 4px threshold + click-swallow), pill reorder now has e2e coverage carrying the same off-by-one correction (cc4-1), and family-view panels' expand-state is windowManager-backed with real pills (cc4-3). git log -G '<id>' is the trace.

## fixed

*(gc'd at phase-5 close — cc0-3 + cc1-3 closed efed0b8, cc2-1 closed 5614e9a; all in git history via `git log -G '<id>'`)*

## ship triage (all phases closed 2026-05-29)

no hard CODE blockers remain. the one ship GATE is the owed manual visual smoke:

- **cc1-1 + cc1-2 → fix-now-at-ship** · the phase-1 chrome + phase-5 body refactor were never eyeballed (no visual goldens in repo); run the plan's manual smoke at 1440x900 + Pixel 7 (chip colours/geometry/flash, single divider, lowercase titles, uniform width, wide bodies scroll-not-clip) as part of `ship-readiness` before merge
- **cc4-1 → defer** · the downward-reorder off-by-one FIX is in code (56b254f's parent 90c2181); only the e2e is missing. low risk
- **cc0-1 → defer** · partially addressed (menu dropdown z-[55]); remainder tracked in `notes/bugs.md` §shell, out of this plan's scope
- **cc0-2 → defer** · documented non-goal (pop-out overlap unsatisfiable at phone widths)
- **cc2-2, cc2-3, cc3-1, cc3-2, cc4-2, cc4-3 → defer** · all nits, none ship-blocking
