# extract-attu-ui — overview

extract the generic UI components from tree-editor into a new standalone pnpm package at `~/Projects/attu-ui`, to be shared with attu-editor and future Attu Project apps.

---

## what moves

**components (no changes needed before move):**

- `components/ui/` — Button, ContextMenu, Toasts
- `components/form/Field.svelte`
- `components/canvas/` — Window, WindowOverlay, CanvasChromeDock, DockRegistration, ZoomWidget, BackButton
- `components/shell/` — MenuBar, Menu, SaveStatusPill, ProgressStrip, AboutDialog, SettingsDialog, ShortcutsOverlay, AuthBar, LinkCodeDialog
- `components/editor/CropperDialog.svelte`, `CropperCanvas.svelte` (pure image utilities, no tree deps)
- `state/toasts.svelte.ts`, `state/progress.svelte.ts`, `state/preferences.svelte.ts`, `state/auth.svelte.ts`

**needs refactoring before move:**

- `components/palette/CommandPalette.svelte` — currently imports `domain/types` and `layout/kinship` directly; needs to accept items and kinship resolver via props/slots instead so it has no tree knowledge

**moves with the calendar:**

- `lib/date/` — `HaracalndeDate` class and gregorian conversion; attu-editor will need this too

**stays in tree-editor:**

- all `components/inspector/`, `components/tree/`, `components/editor/PersonEditor*`, `components/editor/PortraitField`
- `state/tree.svelte.ts`, `state/selection.svelte.ts`, `state/viewport.svelte.ts`, `state/sync.svelte.ts`
- `domain/`, `io/`, `layout/`, `api/`

---

## dialog standardization

the extraction is the right moment to kill the split dialog pattern. **all dialogs in attu-ui use native `<dialog>` with `showModal()`** — no custom fixed-position overlay divs. the following need to be converted:

- LinkCodeDialog
- AboutDialog
- ShortcutsOverlay
- (SettingsDialog and CropperDialog are already native `<dialog>` — leave them)

native `<dialog>` gives focus management, escape handling, and `::backdrop` for free. the custom overlay pattern is legacy from before the migration was finished.

---

## attu-ui repo setup

- pnpm workspace package: `packages/attu-ui` in `~/Projects/attu-ui` (or linked via `pnpm link` during development)
- `package.json` name: `@attu/ui`
- Svelte 5 + Tailwind v4 — same versions as tree-editor
- exports: re-export all components and `HaracalndeDate` from a single `src/lib/index.ts`
- the Tailwind config (design tokens, color palette, typography scale) lives here and is re-exported so consumers get identical styling

---

## phases

1. **refactor CommandPalette** — detach tree domain imports; define a generic `PaletteItem` type and a `resolveKinship` prop
2. **convert remaining dialogs** to native `<dialog>`
3. **set up attu-ui repo** — pnpm workspace, Tailwind config, Svelte lib scaffold
4. **move files** — copy components + state + date into attu-ui; add barrel exports
5. **smoke test** — import a few components from `@attu/ui` in a scratch file and verify they compile

the full tree-editor migration (removing the now-duplicated files and updating all imports) is a separate plan: `migrate-to-attu-ui.md`.

---

## metadata

```yaml
last_updated: 10 June 2026
```
