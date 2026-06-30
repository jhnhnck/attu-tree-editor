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
