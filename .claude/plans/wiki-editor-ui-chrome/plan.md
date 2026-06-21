# wiki-editor-ui-chrome

> **plan-create gate:** plan-mode review (step 5) was skipped during creation. review and approve this plan before the first `phase-loop` run.

## goals

- all 8 menu bar entries from `ui-outline.md` are fully populated and openable; selecting any item closes the menu; no actions fire
- primary toolbar shows all icon groups with dividers; selection formatting bar appears on text selection; all buttons are clickable stubs
- 4 pills visible in the bottom-left dock; clicking any pill opens a "work in progress" popover
- all 7 right-click context menus appear on their target elements with the correct item list; selecting any item closes the menu
- settings modal opens from Tools → Preferences…; all 5 tabs render with visible (but inert) fields; keyboard shortcuts overlay opens from Help → Keyboard shortcuts

## non-goals

- any action that modifies editor text or application state
- keyboard shortcut bindings that actually fire
- api calls, authentication, or network requests
- real values in pills (save status is "saved", word count is "--", preview is "off")
- functional form controls in the settings modal (toggles display but save nothing)
- functional preview panel or diff view (panels open but display placeholder text)

## constraints

- all labels and item groupings must match `ui-outline.md` exactly; any divergence is a bug
- menus close on item click, backdrop click, or Escape
- right-click menus close on item selection, backdrop click, or Escape
- modals close on the × button, backdrop click, or Escape
- `MenuItem.submenu?: readonly MenuEntry[]` was added to `@attu/ui/menu.ts` — Insert menu uses 8 flyout submenu items instead of disabled section headers; flyout panels use `position:fixed` to escape parent overflow-x clipping
- `SelectionBar.svelte` requires a live `EditorView` reference; the approach (public method on `Editor.svelte` or direct prop) must be specified in phase 1
- right-click detection uses `view.posAtCoords(event)` to map click coordinates to a cursor position before regex classification
- this plan is independent of wiki-editor-text-editor and may land before or after it
- no worktrees; all changes land on trunk

## accepted risks

See `pre-mortem.md` for the full analysis. Folded into this plan: (1) Insert menu section headers require a custom approach since `MenuConfig` has no subgroup-header type — phase 0 must decide and document the approach before writing code; (2) `SelectionBar.svelte` EditorView reference threading is now specified in phase 1 scope; (3) right-click listener placement and `posAtCoords()` usage are now specified in phase 3 scope; (4) `ShortcutsOverlay.svelte` is a new component, not sourced from `@attu/ui`.

---

## phase 0 — menu bar

**status:** closed pending merge
**definition of done:** all 8 top-level menus (File, Edit, Insert, Format, View, Page, Tools, Help) open on click; all items from `ui-outline.md` are present with correct labels, dividers, and groupings; selecting any item closes the menu; Insert menu section grouping approach is documented in a comment; `pnpm typecheck` clean
**scope:**
- **before writing any code:** decide the Insert menu subgroup approach — either (a) disabled, visually distinct `MenuItem` items used as section headers (requires CSS styling), or (b) a custom `InsertMenu.svelte` that bypasses `MenuConfig` entirely; document the choice in a comment at the top of the Insert menu config
- expand the `menus` config in `App.svelte` from the current stub (File only) to all 8 menus
- Insert menu sections (Headings & blocks, Links, Lists, Tables, References, Templates, Media, Other) use dividers between groups; section header items are `disabled` and visually distinct
- items with icons in the outline (Undo, Redo, Find, etc.) use the same lucide icons as tree-editor where available
- dividers between item groups match the outline's `─────` markers
- items flagged admin-only (Protect…, Delete…) are visible but `disabled`

---

## phase 1 — primary toolbar + selection bar

**status:** open
**definition of done:** primary toolbar renders all icon groups from `ui-outline.md` with correct grouping and dividers; overflow `…` button collapses low-priority items on narrow viewports; selection formatting bar appears when text is selected inside the editor and dismisses when selection is cleared; all buttons are clickable stubs; `pnpm typecheck` clean
**scope:**
- primary toolbar as a new `Toolbar.svelte` component in `apps/wiki-editor/src/lib/`; rendered via Shell's `tools` snippet
- icon groups and dividers match the outline table exactly
- paragraph-style dropdown renders all 8 options (Paragraph / Heading 2–6 / Preformatted / Block quote) but selecting one does nothing
- overflow: items past a breakpoint collapse into a `…` button that opens a mini-menu
- selection formatting bar: a `SelectionBar.svelte` that positions itself above the active CodeMirror selection
  - requires a live `EditorView` reference; exposed via a `getCursorCoords(): { x: number, y: number } | null` public method on `Editor.svelte`; `SelectionBar` calls this method to position itself
  - uses a CodeMirror state field (or the `EditorView.updateListener` already in place) to detect non-empty selection; hides when selection collapses
- the `⋮ more` button in the selection bar opens a small overflow popover
- **constraint (from phase 0):** `App.svelte`'s `let editor: { ... }` interface must be updated to include `getCursorCoords`; pattern established in phase 0 — add to the same interface type, do not change the bind:this declaration approach

---

## phase 2 — pills dock

**status:** open
**definition of done:** 4 pills (Save status, Stats, Preview, Editor mode) visible in the bottom-left dock via Shell's `dock` slot; clicking each pill opens an in-place popover with a "work in progress" notice and a × to close; `pnpm typecheck` clean
**scope:**
- `WikiEditorPills.svelte` in `apps/wiki-editor/src/lib/`; rendered via Shell's `dock` snippet
- save status pill: label "saved"; popover shows timestamp placeholder "—" and a disabled Save button
- stats pill: label "— words"; popover shows rows for words, characters, sections, wikilinks, external links, templates, references — all "—"
- preview pill: label "preview off"; popover shows "work in progress"
- editor mode pill: label "source"; popover shows "work in progress"
- all popovers use the existing `fte-pill` / `fte-window-*` CSS classes from `@attu/ui/theme.css`
- popovers close on Escape or outside click

---

## phase 3 — right-click context menus

**status:** open
**definition of done:** all 7 context menus from `ui-outline.md` appear on their target elements; items are present with correct labels and dividers; selecting any item closes the menu; `pnpm typecheck` clean
**scope:**
- use `@attu/ui`'s existing `ContextMenu.svelte` if it covers the required API; otherwise create `WikiContextMenu.svelte`
- **constraint (from phase 0):** `view.posAtCoords()` requires the internal `EditorView` reference which lives inside `Editor.svelte`; the `contextmenu` listener must therefore be registered inside `Editor.svelte` via `onMount` on `view.dom`, not via a DOM query in `App.svelte`; the detected context type and click coordinates are passed out to `App.svelte` via an `oncontextmenu` prop callback — `Editor.svelte` handles `event.preventDefault()` and calls the prop with `{ type, x, y, pos }` where `type` is the classification result
- use `view.posAtCoords({ x: event.clientX, y: event.clientY })` to convert the click position to a document offset, then read the line text at that position for regex classification:
  - plain text selection → selection context menu
  - cursor inside `[[…]]` → wikilink menu
  - cursor inside `[https://…]` → external link menu
  - cursor inside `{{…}}` → template menu
  - cursor inside `<ref>…</ref>` → reference menu
  - cursor inside a table block → table menu
  - cursor inside `[[File:…]]` → image menu
- detection uses regex over the line text; must not use a full wikitext parser in this phase
- menu items that operate on a selection (Cut, Copy, etc.) are enabled only when a selection exists; admin items (Protect, Delete) always disabled

---

## phase 4 — settings modal + shortcuts overlay

**status:** open
**definition of done:** Tools → Preferences… opens a modal with 5 tabs (Editor, Autosave, Preview, Keyboard Shortcuts, Account); all fields are visible with correct labels and control types; no value persists on close; Help → Keyboard shortcuts opens a full overlay table matching section 6 of `ui-outline.md`; `pnpm typecheck` clean
**scope:**
- `SettingsModal.svelte` in `apps/wiki-editor/src/lib/`; opened via a `showSettings` boolean in App state
- Editor tab: font-family select, font-size select, line wrap toggle, line numbers toggle, minimap toggle, bracket matching toggle, syntax theme select, tab size select, trim trailing whitespace toggle
- Autosave tab: enable toggle, interval select, storage select, disabled "View/restore drafts…" button
- Preview tab: default mode select, update trigger select, preview theme select
- Keyboard Shortcuts tab: read-only table of all shortcuts from `ui-outline.md` section 6, grouped by category; disabled "Customize…" and "Reset to defaults" buttons
- Account tab: shows "not signed in" with a disabled Sign in button
- `ShortcutsOverlay.svelte` — new component in `apps/wiki-editor/src/lib/`; full-screen overlay opened by Help → Keyboard shortcuts or Ctrl+?; same content as the Keyboard Shortcuts tab; closes on Escape or ×; not sourced from `@attu/ui`
- modal uses the dialog/overlay pattern already established in tree-editor (backdrop blur, focus trap)
