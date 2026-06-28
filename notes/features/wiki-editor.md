# wiki-editor

the second SPA in this monorepo. a rich-text editor for the attu mediawiki universe. lives at `apps/wiki-editor/`. served at `/edit` by the fastapi backend.

---

## what it is vs tree-editor

| | tree-editor | wiki-editor |
|---|---|---|
| purpose | edit family trees | edit wiki articles |
| route | `/trees` | `/edit` |
| primary state | `Tree` domain object (dexie-persisted) | editor content (in-memory; save via wiki API) |
| domain model | `domain/` (persons, couples, layout) | none - content is wikitext |
| persistence | dexie + fastapi autosave | mediawiki API (save on commit) |
| canvas | three layout engines + SVG | none |
| inspector | tabbed person inspector | none |

both apps share `@attu/ui` for shell chrome, dock system, design tokens, and utility modules.

---

## component structure

```text
apps/wiki-editor/src/
├── App.svelte               # root - mounts shell + dock + editor
├── app.css                  # tailwind v4 entry + any app-specific tokens
├── main.ts
└── lib/
    ├── components/
    │   ├── Editor.svelte        # core wikitext editor (contenteditable)
    │   ├── Toolbar.svelte       # formatting toolbar above the editor
    │   ├── SelectionBar.svelte  # floating action bar on text selection
    │   ├── SettingsModal.svelte # settings dialog (mounted as DockDialog)
    │   └── ShortcutsOverlay.svelte  # keyboard shortcuts dialog (DockDialog)
    └── (no state/, domain/, persistence/ - content is editor-owned)
```

---

## App.svelte wiring

imports from `@attu/ui`:
- `Shell` - wraps the full viewport; owns header chrome (title, menus, dividers)
- `dockStore` - the dock singleton; passed to `DockCorner` + `DockSurface`
- `DockCorner`, `DockEntry`, `DockSurface`, `DockDialog`
- `SaveStatusPill`, `StatsPill` - shared pill+panel pairs
- `ContextMenu` - right-click context menu primitive

reactive state in App.svelte:
- `editor` - object exposing `undoEdit()`, `redoEdit()`, `getCursorCoords()`
- `selectionCoords` - `{x, y} | null`; updated by `handleSelectionChange()`
- `hasSelection` - boolean derived from selection state

the editor instance is passed down to `Toolbar` and `SelectionBar` via props; `SelectionBar` positions itself at `selectionCoords`.

---

## dock items

wiki-editor uses the same `@attu/ui` dock as tree-editor. registered items:

| id | kind | role |
|---|---|---|
| `save-status` | pill | save-status indicator |
| `save-status-panel` | panel | save-status detail panel |
| `stats` | pill | word/char count |
| `stats-panel` | panel | stats detail panel |
| `settings` | dialog | settings dialog (SettingsModal) |
| `shortcuts` | dialog | shortcuts overlay (ShortcutsOverlay) |

`SettingsModal` and `ShortcutsOverlay` are `DockDialog` instances - fixed centered dialogs. they have no persistent pill; they're opened via menu actions or keyboard shortcuts.

---

## what's not in wiki-editor

- no family-tree domain model
- no layout engines or canvas
- no portrait cropper
- no inspector sidebar
- no import/export pipeline (no GEDZIP)
- no `HaracalndeDate` usage
- no dexie persistence

---

## dev server

the wiki-editor is served at `:8000/edit` by the fastapi backend (same server as tree-editor). in dev, `apps/wiki-editor/vite.config.ts` runs a dev server that proxies `/api` to `:8000`. the combined dev command is `pnpm dev` from the workspace root.

---

## see also

- `notes/features/attu-ui.md` - shell pattern, design tokens
- `notes/features/dock-kit.md` - dock system used by both apps
- `notes/agents.md` §3 - top-level architecture table
