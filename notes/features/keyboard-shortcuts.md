# keyboard shortcuts

planning notes - figure out the right bindings before wiring any of this up.
not all of these are implemented or even decided on; the goal here is to pick
defaults that match what our audience already has muscle memory for.

**status (30 June 2026)**: most of this shipped. `apps/tree-editor/src/lib/shortcuts.ts` is the runtime single-source-of-truth for bindings and cites this doc as its spec; the `?` help overlay recommended in "what to build first" below shipped as `ShortcutsOverlay.svelte` (now in `packages/attu-ui/src/lib/components/help/`), wired through `packages/attu-ui/src/lib/keyboard.ts`. treat this file as the design rationale behind the shipped bindings, not an open proposal - check `shortcuts.ts` for the current authoritative combo list.

## prior art surveyed

- **family tree maker** - F2 person index, F3 spouses, F4/F5 jump to wife/husband parents, F6 first child, F8/Alt+F8 next/prev sibling. relative-direction navigation, but f-keys are awful muscle memory and we're not on windows.
- **gramps** - Ctrl+N/P next/prev category (view-level, not graph-level). most nav happens via list views, not a graph. weak model for us.
- **ancestry "add keyboard shortcuts to family tree"** (third-party extension) - single-character hotkeys when hovering. nice for power users but discovery is bad.
- **family echo** - almost no shortcuts; click-driven. we want to do better.
- **figma / figjam** - space+drag to pan, H = hand tool, Ctrl+scroll zoom, Ctrl+0 fit, Ctrl+1 = 100%, Shift+1 = fit selection, Ctrl+/ shortcut help.
- **tldraw** - same family as figma: space-pan, hand tool, V for select. shows shortcuts behind a `?` menu.
- **onshape** - F = zoom to fit, W = zoom to window, Z / Shift+Z = zoom out/in, Shift+arrows = pan. CAD-flavored but the F-for-fit is universal.
- **obsidian canvas (mindmap plugin)** - Tab = create child, Enter = create sibling, Alt+arrows = navigate between connected nodes. closest analog to what we're building.
- **vs code** - Ctrl+P quick-jump, Ctrl+Shift+P command palette, F2 rename, Esc dismiss. excellent model for "search for any person" since vs code's ctrl+p is the gold standard.
- **excel** - arrow keys move selection, F2 edits the selected cell, Enter commits. our cards are the "cells".
- **vim** - `/` search, `gg`/`G` jump to top/bottom, hjkl directional nav. nerd-friendly bonus bindings.

## conventions worth adopting

three buckets, in priority order: things our users already know from other apps, things specific to graph editing, and bonus power-user bindings.

### canvas navigation (steal from figma/tldraw)

| binding | action | source |
|---|---|---|
| Space + drag | pan canvas (temporary hand tool) | figma, tldraw, photoshop |
| middle-mouse drag | pan canvas | universal |
| Ctrl + scroll | zoom at cursor | figma, vs code |
| +, = | zoom in | universal |
| -, _ | zoom out | universal |
| Ctrl + 0 | fit whole tree to view | figma |
| Ctrl + 1 | zoom to 100% | figma |
| Shift + 1 | fit current selection | figma |
| F | focus selection (center + comfortable zoom) | onshape |
| H | hand tool (toggle pan-only mode) | figma, tldraw |
| V | select tool (return from hand) | figma, tldraw |

space-deselects (an earlier idea) **conflicts with the universal space-pan convention** - drop it. use Esc for deselect.

### selection + editing (steal from excel/vs code)

| binding | action | source |
|---|---|---|
| click | select person | - |
| Esc | deselect / close dialog / dismiss menu | universal |
| Enter | open editor for selected | excel-ish |
| double-click | open editor | already wired |
| Delete, Backspace | delete selected person (with confirm) | universal |
| Ctrl + D | duplicate selected | figma |
| Ctrl + click | multi-select (future) | universal |

per the open design issues, "clicking blank space deletes" is dangerous - change that to "clicking blank space deselects" and use Delete/Backspace for actual removal.

### relative-direction navigation (graph-specific)

arrow keys move selection to the *visually nearest* relative in that direction. this is the model from obsidian canvas mindmap plugin and, less directly, family tree maker's f-keys.

| binding | action |
|---|---|
| ↑ | move selection up (to a parent) |
| ↓ | move selection down (to first child) |
| ← / → | move to sibling / partner on that side |
| Alt + ← / → | swap with adjacent sibling (reorder) |
| Home | center on root |
| Shift + Home | center on selected person's lineage root |

Tab and Shift+Tab are reserved for **accessibility focus traversal**, not graph nav. don't override them.

### add new relative (steal from obsidian canvas mindmap)

| binding | action |
|---|---|
| Insert | add child of selected (or Ctrl + Enter) |
| Shift + Insert | add partner |
| Ctrl + Insert | add parent |
| Ctrl + Shift + N | new person, unattached |

obsidian canvas uses Tab=child / Enter=sibling but those clash with focus-traversal and editor-commit respectively, so we use Insert as the "add" prefix.

### search + command palette (steal from vs code)

| binding | action |
|---|---|
| Ctrl + P | quick-jump to person by name (vs code's go-to-file) |
| `/` | focus search box (vim, gmail, github) |
| Ctrl + Shift + P | command palette (rename tree, change root, export, ...) |

an earlier idea was "tab opens search" - drop that. Tab must remain focus traversal for keyboard accessibility. use Ctrl+P (canonical) and `/` (bonus).

### app-level (universal)

| binding | action |
|---|---|
| Ctrl + Z | undo (already wired) |
| Ctrl + Shift + Z, Ctrl + Y | redo (already wired) |
| Ctrl + S | force flush autosave |
| Ctrl + O | open / switch tree |
| Ctrl + N | new tree |
| Ctrl + I | import file |
| Ctrl + E | export .gdz |
| Ctrl + , | settings |
| ? | show shortcuts help overlay (gmail, github, figma) |

## platform notes

- everywhere `Ctrl` is listed, use `Cmd` on macOS. detect once at boot, render labels in help overlay accordingly.
- on linux/windows, Insert is a real key. on macOS laptops it's not - provide Ctrl+Enter (add child) / Ctrl+Shift+Enter (add parent) as the mac alternates.
- avoid binding F1–F12. real laptops bury function keys behind `fn`, and the Excel-style F2-edits-selected binding we considered was dropped because Enter / double-click already cover open-editor.

## what to drop from earlier guesses

- ~~space deselects~~ - collides with universal space-pan. use Esc.
- ~~tab opens search~~ - Tab must stay as focus-traversal for accessibility. use Ctrl+P or `/`.

## what to build first

a `?` help overlay listing all bindings with the active platform's modifiers - most of the fight in shortcut design is discoverability, not the bindings themselves. once that exists, audit-time pain is much smaller.
