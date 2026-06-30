# wiki-editor

the second SPA in this monorepo. a wikitext editor for the attu mediawiki universe, built on CodeMirror 6. lives at `apps/wiki-editor/`.

shipped today: a standalone vite-built SPA with a CodeMirror editor, wikitext syntax highlighting, and a localStorage-backed preferences store. saving to the wiki, page load from the wiki, and the MediaWiki ResourceLoader extension packaging are planned but not yet built - see `.claude/plans/wiki-editor-save-flow/`, `wiki-editor-page-load/`, and `wiki-editor-build-pipeline/`.

---

## what it is vs tree-editor

| | tree-editor | wiki-editor |
|---|---|---|
| purpose | edit family trees | edit wiki articles |
| route | `/trees` | `/edit` |
| primary state | `Tree` domain object (dexie-persisted) | CodeMirror `EditorState` (in-memory) |
| domain model | `domain/` (persons, couples, layout) | none - content is wikitext |
| persistence | dexie + fastapi autosave | none yet - mediawiki API save is planned, see `.claude/plans/wiki-editor-save-flow/` |
| canvas | three layout engines + SVG | none |
| inspector | tabbed person inspector | none |

both apps share `@attu/ui` for shell chrome, dock system, design tokens, and utility modules.

---

## component structure

```text
apps/wiki-editor/src/
├── App.svelte                  # root - mounts shell + dock + editor
├── app.css                     # tailwind v4 entry + any app-specific tokens
├── main.ts                     # mounts to #attu-editor (vite-provided in dev, php-injected in prod)
└── lib/
    ├── index.ts                 # public exports (Editor, Toolbar, SelectionBar, SettingsModal, ShortcutsOverlay)
    ├── Editor.svelte             # CodeMirror 6 wikitext editor
    ├── Toolbar.svelte            # formatting toolbar above the editor
    ├── SelectionBar.svelte       # floating action bar on text selection
    ├── SettingsModal.svelte      # 4-tab preferences dialog (mounted as DockDialog)
    ├── ShortcutsOverlay.svelte   # keyboard shortcuts dialog (DockDialog)
    ├── shortcuts.ts              # shortcut list rendered by ShortcutsOverlay
    ├── lang-wikitext/
    │   └── index.ts              # CodeMirror StreamParser + HighlightStyle for wikitext
    └── state/
        └── preferences.svelte.ts # WikiPreferencesStore - localStorage-backed $state
```

(no `domain/`, no dexie persistence - content lives entirely in the CodeMirror `EditorState`)

`lib/lang-wikitext/index.ts` is a CodeMirror `StreamLanguage` parser for wikitext (headings, bold/italic, wikilinks, templates, tables, refs, nowiki/pre/math blocks) plus a `HighlightStyle` that reads the `--color-syn-*` Melange palette vars defined in `packages/attu-ui/src/lib/theme.css` (dark/light, both `prefers-color-scheme` and `data-theme` variants).

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

`App.svelte` also owns `prefs`, a `createWikiPreferencesStore()` instance (`lib/state/preferences.svelte.ts`); it's hydrated from localStorage on mount and passed to `SettingsModal`.

---

## dock items

wiki-editor uses the same `@attu/ui` dock as tree-editor. registered items:

| id | kind | role |
|---|---|---|
| `wiki-save` / `save-window` | pill / panel | save-status indicator + detail panel (`SaveStatusPill`) |
| `wiki-stats` / `stats-window` | pill / panel | word/char/section/link/template/reference counts (`StatsPill`) |
| `settings` | dialog | preferences dialog (SettingsModal) |
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

in dev, `scripts/dev.zsh` (`pnpm dev` from the workspace root) starts three processes: the wiki-editor vite dev server on `:5174`, the tree-editor vite dev server on `:5173`, and fastapi (`uvicorn`) on `:8001`. caddy (`scripts/Caddyfile.dev`) fronts all three on `:8000`, routing `/edit/*` to `:5174`, `/trees/*` to `:5173`, and everything else to `:8001`. fastapi does not serve wiki-editor directly.

there is no production deployment of wiki-editor yet. the planned production path is a built bundle (`pnpm -F wiki-editor build`) packaged as a MediaWiki ResourceLoader extension loaded via `wfLoadExtension('AttuEditor')`, mounting into a `#attu-editor` div injected by the wiki's PHP - see `.claude/plans/wiki-editor-build-pipeline/plan.md`. `apps/wiki-editor/src/main.ts` already anticipates this: it mounts to `#attu-editor`, which vite's `index.html` provides in dev and the future PHP extension would provide in prod.

---

## see also

- `notes/features/attu-ui.md` - shell pattern, design tokens
- `notes/features/dock-kit.md` - dock system used by both apps
- `notes/agents.md` §3 - top-level architecture table
- `.claude/plans/wiki-editor-save-flow/`, `wiki-editor-page-load/`, `wiki-editor-preview/`, `wiki-editor-autosave/`, `wiki-editor-build-pipeline/` - planned mediawiki-extension integration (not yet shipped)

---

## metadata

```yaml
last_updated: 30 June 2026
```
