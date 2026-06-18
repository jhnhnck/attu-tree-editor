# migrate-to-attu-ui — overview

update tree-editor to consume `@attu/ui` from `~/Projects/attu-ui` instead of its own local copies. runs after `extract-attu-ui.md` is complete and the attu-ui package is stable.

---

## prerequisite

`extract-attu-ui.md` must be finished: attu-ui is set up as a pnpm package, components compile, and barrel exports are in place.

---

## what changes in tree-editor

**add the dependency:**
- add `@attu/ui` to `apps/web/package.json` (via `pnpm link` or workspace protocol)
- add `~/Projects/attu-ui` to the pnpm workspace if using a local path reference

**update imports across `apps/web/src/`:**
- all imports that currently point to `$lib/components/ui/*`, `$lib/components/form/Field`, `$lib/components/canvas/*`, `$lib/components/shell/*`, `$lib/components/palette/CommandPalette`, `$lib/components/help/*`, `$lib/state/toasts*`, `$lib/state/progress*`, `$lib/state/preferences*`, `$lib/state/auth*`, and `$lib/date/*` change to `@attu/ui`
- `HaracalndeDate` imports in `domain/` and `components/form/DateInput` point to `@attu/ui`

**delete the now-redundant source files:**
- `components/ui/`, `components/form/Field.svelte`, `components/canvas/`, `components/shell/` (generic files only — PersonEditor, PortraitField, ImportWizard stay)
- `components/palette/CommandPalette.svelte` (replaced by attu-ui's generic version)
- `components/editor/CropperDialog.svelte`, `CropperCanvas.svelte`
- `state/toasts.svelte.ts`, `state/progress.svelte.ts`, `state/preferences.svelte.ts`, `state/auth.svelte.ts`
- `lib/date/`

**wire up CommandPalette's new API:**
- tree-editor's usage of CommandPalette now passes person search items and kinship resolver as props (the refactored API from `extract-attu-ui.md` phase 1)

---

## tailwind config

attu-ui owns the design tokens. tree-editor's `tailwind.config.*` should extend or import from `@attu/ui/tailwind` rather than defining its own palette/typography. verify that all existing color/spacing usages still resolve correctly after the switch.

---

## validation

run `pnpm typecheck && pnpm build` — must pass with zero errors. then run `pnpm test:*` and `pnpm verify` per the `feature-completion` skill. do a visual smoke-test of the main views (layered, family-view, hyperbolic) to confirm no chrome components regressed.

---

## what stays unchanged

all tree-specific code: `domain/`, `io/`, `layout/`, `api/`, `components/tree/`, `components/inspector/`, `components/editor/PersonEditor*`, `components/editor/PortraitField`, `state/tree*`, `state/selection*`, `state/viewport*`, `state/sync*`. this migration is purely a file-location change for the generic layer.

---

## metadata

```yaml
last_updated: 10 June 2026
```
