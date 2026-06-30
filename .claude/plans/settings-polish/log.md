# Log — Settings UI Polish

## starting phase 0 — 2026-06-30

worktree: `.claude/worktrees/settings-polish/` · branch: `phase/settings-polish/0`

**DoD:** DockDialog save/discard chrome wired in both apps; dialog width/height stable.

## phase 0 retro — 2026-06-30

Delivered: DockDialog gains `onsave`/`ondiscard` props + green check button; `fte-window-control-confirm` CSS class added to theme.css; both settings bodies wrapped in `min-w-80` with `h-56` scroll area. Both apps snapshot all prefs on dialog open, revert on X. Commit `b701053`.

Typecheck workaround: worktree has no node_modules; used symlink approach — symlinked app node_modules from main repo, temporarily redirected `@attu/ui` in both apps' symlinks to worktree's packages/attu-ui, then restored. All 3 packages: 0 errors.

No unexpected issues. The `onopen` callback on DockDialog fires via `$effect` after mount — snapshot captures the values immediately before the user sees the dialog.

No downstream implications.

## revision after phase 0

No plan changes. Next: phase 1 (control visual redesign).

## starting phase 1 — 2026-06-30

worktree: `.claude/worktrees/settings-polish/` · branch: `phase/settings-polish/1`

**DoD:** toggle switches colored dots; selects use custom flyout; labels lowercase; every row has desc.

## phase 1 retro — 2026-06-30

Delivered: `fte-window-control-on`/`-off` CSS classes in theme.css; `toggleRow` in both settings files redesigned to colored dot with `Plus`/`Minus` icons and `desc` param; `selectRow` in `SettingsModal.svelte` replaced with custom flyout using `openSelect = $state<string | null>(null)` keyed by label; `iconRadio` gains `desc` param; all tab labels and row labels lowercase; description strings at every call site. Commit `b625b8d`.

Typecheck: same workaround as phase 0 — rm+ln -sf to redirect @attu/ui to worktree, then restore. All 3 packages: 0 errors.

No unexpected issues. The `last:border-0` Tailwind modifier on `toggleRow`/`selectRow` removes the bottom border from the last item in a group without extra markup.

## revision after phase 1

No plan changes. Next: phase 2 (wiki-editor content corrections).

## starting phase 2 — 2026-06-30

worktree: `.claude/worktrees/settings-polish/` · branch: `phase/settings-polish/2`

**DoD:** "Drafts" tab visible; no Interval row; Preview tab has no "preview theme" row; typecheck clean.

## phase 2 retro — 2026-06-30

Delivered: `type Tab` union changed `"autosave"` → `"drafts"`; TABS array label updated; "drafts" tab content: toggle label changed to "enable draft saving", "interval" select removed, "storage" select kept with updated desc; preview tab: "preview theme" select removed. `AUTOSAVE_INTERVALS` and `PREVIEW_THEMES` consts deleted (unused). Commit `3417f1c`.

Typecheck: 2 errors initially from unused consts — removed them, then 0 errors.

All plan DoD items complete. Ready for merge.
