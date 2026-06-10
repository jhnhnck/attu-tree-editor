# Ship readiness — canvas-chrome-v2 (dock/window redesign)

scope: phases 0-6 on `phase/canvas-chrome-v2/6` @ `5209722`. pending merge to trunk.

## Prerequisites

- integration-check — PASS (fresh on `a3ce445`, the last code commit; `5209722` since is notes/agents.md only — not compiled or tested): full e2e 121 pass / 3 skip / 0 fail; typecheck 0 errors; lint + `lint:no-hyperbolic-imports` clean; unit 1321 pass / 16 skip; build ok. independently re-verified this pass. `/api/auth/me ECONNREFUSED :8000` e2e lines are the known-benign auth-proxy noise
- feature-completion — PASS: phases 0-6 delivered; the taskbar model is coherent (one pill per open menu; surface renders only when docked-expanded; minimized = pill only; floating in overlay); agents.md dock section updated to match
- code-review of uncommitted — N/A: working tree clean, nothing dangling

## Blockers

none. no data loss, no security/auth boundary crossed, no broken core flow (tree edit / save / sync are untouched and green), no contract violation (testids/roles preserved, e2e green). canvas-chrome-v2 has never shipped to a release, so there is no prior-release regression to weigh.

## Deferred — to a follow-up plan (per user decision "we'll continue refinements in another plan")

the manual visual smoke was NOT run by a human; it is explicitly deferred, not passed. these carry to the follow-up plan:

- **[design gate, not run] cc1-1 / cc1-2 — manual visual smoke of the taskbar model** · the dock/window chrome has only e2e coverage (no visual goldens in this repo). the taskbar model — pill-per-menu, minimized=pill-only, pill-drag reorder, anchor-aware icons, all four corners, wide bodies scroll-not-clip — was never eyeballed. run at 1440x900 + Pixel 7 in the follow-up before relying on the visuals
- **[nit] cc6-1** pill drag while another window's popover is open can minimize it (App.svelte outside-click-close fires mid-drag; stats-window has the listener, debug-menu doesn't)
- **[medium] cc0-1** top chrome not the highest non-modal layer — partially addressed (menu dropdown `z-[55]`); remainder (chrome above translate3d card stacking contexts + tall toasts) tracked in `notes/bugs.md` §shell
- **[medium] cc0-2** pop-out windows overlap the dock at phone widths (documented non-goal; pop-out drag/z verified chromium-only)
- **[low] cc2-2** floating→minimize + lastState-restore branches are unit-only (no e2e)
- **[low] cc2-3** `expandedWindows` interplay for family-view panels — mostly resolved by the phase-6 windowManager reconciliation; re-confirm in the follow-up
- **[low] cc3-1** corner picker + Panels are flat menu items (no section header; `MenuConfig` has no header/submenu type)
- **[low] cc3-2** Panels rows for family-view panels are inert when family-view is not the active engine

## Verdict

**ship.**

automated gates are green, the working tree is clean, and there are no hard blockers. the one project-required gate that was never run — the manual visual smoke — is **deferred to the follow-up plan by explicit user decision**, recorded honestly here as deferred-not-passed. the deferred list above is the load-bearing handoff for that plan.

next: `pre-merge` — rebase `phase/canvas-chrome-v2/6` onto current trunk (`2245396`, advanced by concurrent item-branch merges during this plan), migrate this deferred list into the follow-up plan + `notes/bugs.md`, archive this plan dir — then the merge to trunk. the merge itself awaits an explicit go-ahead (it has been held throughout).
