# extract-and-migrate-attu-ui

## goals

- tree-editor is the pnpm monorepo root; `packages/attu-ui` and `apps/editor` live inside it; git histories from the three original repos merged via `git subtree add --squash`
- `@attu/ui` is a standalone Svelte 5 + Tailwind v4 package at `packages/attu-ui`, containing all generic UI components, state modules, and `HaracalndeDate`, importable from `apps/web` and `apps/editor` via `workspace:*`
- tree-editor imports all generic UI from `@attu/ui`; local duplicate files are deleted; `pnpm typecheck && pnpm build` passes with zero errors
- `CommandPalette` has zero imports from `domain/` or `layout/`; it accepts `PaletteItem[]` and a `resolveKinship` prop
- `LinkCodeDialog`, `AboutDialog`, and `ShortcutsOverlay` use native `<dialog>` with `showModal()`
- attu-editor (`apps/editor`) resolves `@attu/ui` via pnpm workspace and can import components successfully

## non-goals

- publishing `@attu/ui` to npm registry
- adding new features or components to attu-ui beyond what's extracted
- migrating attu-editor's own UI to use attu-ui components (setup only)
- changes to tree-specific code: `domain/`, `io/`, `layout/`, `api/`, `components/tree/`, `components/inspector/`, `components/editor/PersonEditor*`, `components/editor/PortraitField`
- changes to the FastAPI backend
- extracting `@attu/api-client` into its own publishable package (out of scope for this plan)

## constraints

- no worktrees; all changes land directly on trunk
- tree-editor is the single pnpm monorepo root; the original attu-ui and attu-editor repos are retired after their histories are merged in
- attu-ui merges into `packages/attu-ui`; attu-editor's Svelte app merges into `apps/editor`; attu-editor's MediaWiki PHP extension merges into `extension/`
- packages reference each other via `workspace:*` — no `pnpm link` required
- pnpm@10.33.2, Svelte 5.55.9, Tailwind v4.3.0, TypeScript 6.0.3 enforced at workspace root
- git history preserved via `git subtree add --squash` for each incoming repo

## accepted risks

Two residual risks remain. (1) ~~Tailwind v4 utility class propagation~~ — **resolved by phase 0 probe**: `@import "@attu/ui/theme.css"` propagates both CSS custom properties and utility class generation; no `@theme inline {}` wrapper needed in the consumer. (2) AuthBar, LinkCodeDialog, ShareDialog, AdminPanel, and `state/auth.svelte.ts` all import from `$lib/api/client`; before they can move to attu-ui, those imports must be replaced with `@attu/api-client` (a peer dep) — this is budgeted into phase 2. (3) Native `<dialog>` stacking in Svelte portals may differ from the current fixed-position overlay; each dialog conversion gets a manual focus/escape/backdrop smoke-test in phase 2.

<!-- risks #1 and #2 from the original pre-mortem (pnpm link + Vite symlinks; multiple Svelte instances) are eliminated by the monorepo — workspace:* hoisting deduplicates svelte and removes symlink resolution entirely -->

## phase 0 — walking skeleton

**status:** closed in d0c0938
**definition of done:** monorepo fully assembled (`packages/attu-ui` and `apps/editor` present, `workspace:*` wired, `pnpm install` clean); `pnpm dev` starts in `apps/web` without console errors; Button from `@attu/ui` renders in the browser with correct Tailwind styles (not just typecheck-clean); at least one design-token utility class from `@attu/ui/theme.css` renders correctly; `pnpm typecheck` passes in `apps/editor` with `@attu/ui` resolved; domain-clean audit result documented.

**already done:**

- `packages/attu-ui` scaffolded at `/home/jhn/Projects/attu-ui` with `Button.svelte` in `src/lib/components/ui/`, `HaracalndeDate` re-exported in barrel, component directory structure created (`canvas`, `form`, `help`, `palette`, `shell`, `ui`)
- `apps/web/package.json` references `@attu/ui` (currently via `link:../../../attu-ui` — to be replaced in remaining scope below)
- `apps/editor` resolves `@attu/ui` via symlink in `packages/` — to be replaced by workspace ref

**remaining scope:**

- **monorepo merge (do first):**
  - `git subtree add --prefix packages/attu-ui /home/jhn/Projects/attu-ui main --squash` — imports attu-ui repo into the workspace
  - `git subtree add --prefix .attu-editor-import /home/jhn/Projects/attu-editor main --squash`, then `git mv .attu-editor-import/apps/editor apps/editor`, `git mv .attu-editor-import/extension extension/`, remove the leftover tmp directory in a single commit; add `apps/editor` to root `pnpm-workspace.yaml` if not already matched by `apps/*`
  - in `apps/web/package.json`: change `"@attu/ui": "link:../../../attu-ui"` → `"@attu/ui": "workspace:*"`
  - in `apps/editor/package.json`: confirm `@attu/ui` is `workspace:*` (it already declares this); remove the `packages/attu-ui` symlink and any `pnpm-workspace.yaml` entry that pointed to the external path
  - run `pnpm install` at workspace root; confirm zero errors
- verify `./theme.css` export is in `packages/attu-ui/package.json`; confirm `src/lib/theme.css` has at least one design token that `apps/web`'s current config also uses
- run `pnpm dev` in `apps/web`; confirm Button renders in browser with correct Tailwind styles; run `pnpm typecheck` in `apps/web` and `apps/editor`
- **Tailwind probe:** confirm whether `@import "@attu/ui/theme.css"` propagates utility class generation or only CSS custom properties — document result as input to phase 4
- **domain-clean audit:** grep all extraction-candidate files for imports of `$lib/domain`, `$lib/layout`, `$lib/state/tree`, `$lib/state/selection`, `$lib/state/viewport`, `$lib/state/sync`, `$lib/api`; document all hits; known results: `OpenDialog.svelte` (stays in `apps/web` — no action), `CommandPalette.svelte` (handled in phase 1), `AuthBar.svelte` + `LinkCodeDialog.svelte` + `state/auth.svelte.ts` (import `$lib/api/client` — handled in phase 2); if any NEW hits appear, expand phase 2 scope or run plan-revise

## phase 1 — CommandPalette decoupling

**status:** open
**definition of done:** `CommandPalette.svelte` has zero imports from `$lib/domain/` or `$lib/layout/`; the palette still opens, filters, and runs commands; existing tests pass; `pnpm typecheck` clean.

**scope:**
- in attu-ui `src/lib/`: define and export `PaletteItem` type: `{ id: string; label: string; detail?: string; action: () => void }`
- in tree-editor `apps/web/src/lib/`: refactor `components/palette/CommandPalette.svelte` — replace direct `domain/types` and `layout/kinship` imports with `items: PaletteItem[]` prop and optional `resolveKinship: (a: PersonId, b: PersonId) => string` prop
- update `components/palette/commands.ts` to assemble `PaletteItem[]` with tree-domain knowledge and pass it in at the call site
- pivot criterion: if CommandPalette's UX requires more than two new props to stay domain-agnostic, stop and run plan-revise — the refactor scope may have been underestimated

## phase 2 — api-client decoupling, dialog conversion, and file extraction

**status:** open
<!-- phase 2: expanded by phase 0 audit — ShareDialog + AdminPanel added to api/client decoupling -->
**definition of done:** `AuthBar`, `LinkCodeDialog`, `ShareDialog`, `AdminPanel`, `state/auth.svelte.ts` have no `$lib/api/client` imports; `LinkCodeDialog`, `AboutDialog`, `ShortcutsOverlay` use native `<dialog>` + `showModal()` with working focus trap, Escape key, and `::backdrop`; all extraction-candidate files are in attu-ui `src/lib/`; barrel exports complete; `pnpm typecheck` passes in attu-ui.

**scope:**

- in tree-editor: refactor `AuthBar.svelte`, `LinkCodeDialog.svelte`, `ShareDialog.svelte`, `AdminPanel.svelte`, and `state/auth.svelte.ts` to import from `@attu/api-client` instead of `$lib/api/client`; add `@attu/api-client` as a dependency to attu-ui's `package.json`
- in tree-editor: convert `LinkCodeDialog.svelte`, `AboutDialog.svelte`, `ShortcutsOverlay.svelte` from custom fixed-position overlays to native `<dialog>` with `showModal()`; smoke-test each for focus, Escape, and backdrop
- copy to attu-ui (after refactors above are complete):
  - `components/ui/` → `src/lib/components/ui/`
  - `components/form/Field.svelte` → `src/lib/components/form/`
  - `components/canvas/` → `src/lib/components/canvas/`
  - `components/shell/` (only the files in the extract list: MenuBar, Menu, SaveStatusPill, ProgressStrip, AboutDialog, SettingsDialog, ShortcutsOverlay, AuthBar, LinkCodeDialog) → `src/lib/components/shell/`
  - `components/help/ShortcutsOverlay.svelte` → `src/lib/components/help/`
  - `components/editor/CropperDialog.svelte`, `CropperCanvas.svelte` → `src/lib/components/editor/`
  - `components/palette/CommandPalette.svelte` (decoupled from phase 1) → `src/lib/components/palette/`
  - `state/toasts.svelte.ts`, `state/progress.svelte.ts`, `state/preferences.svelte.ts`, `state/auth.svelte.ts` → `src/lib/state/`
  - `lib/date/HaracalndeDate.ts`, `lib/date/gregorian.ts` → `src/lib/date/`
- fix intra-attu-ui relative import paths that changed during the copy; update barrel exports in `src/lib/index.ts`
- pivot criterion: if any component reveals additional unexpected domain dependencies during extraction (beyond those documented in phase 0 audit), stop and run plan-revise rather than patching inline

## phase 3 — tree-editor import migration

**status:** open
**definition of done:** `pnpm typecheck && pnpm build` passes in tree-editor with zero errors; no file in `apps/web/src/` imports from a path that now lives in attu-ui; deleted files are gone; `pnpm test:*` passes; `pnpm dev` opens in browser with no console errors and passes a 5-minute manual smoke-test (all main views render, chrome is intact).

**scope:**
- rewrite imports across `apps/web/src/` from local `$lib/components/ui/*`, `$lib/components/form/Field`, `$lib/components/canvas/*`, `$lib/components/shell/*`, `$lib/components/help/*`, `$lib/components/palette/CommandPalette`, `$lib/components/editor/CropperDialog`, `$lib/state/toasts*`, `$lib/state/progress*`, `$lib/state/preferences*`, `$lib/state/auth*`, `$lib/date/*` → `@attu/ui`
- update `HaracalndeDate` imports in `domain/` and `components/form/DateInput`
- at the CommandPalette call site(s): pass `items` and `resolveKinship` props using tree-domain data from `commands.ts`
- delete all now-redundant source files from tree-editor
- run typecheck, build, full test suite, and 5-minute manual smoke-test before marking phase done
- phases 2 and 3 may land in separate commits; the duplicate-code window is safe within a single repo

## phase 4 — tailwind consolidation and full validation

**status:** open
**definition of done:** attu-ui owns all design tokens; tree-editor imports them from `@attu/ui/theme.css`; all tests pass; no visual regressions in layered, family-view, or hyperbolic views confirmed by manual smoke-test; attu-editor `pnpm typecheck` still passes.

<!-- phase 4: probe confirmed utility classes propagate — conditional fallback branch removed; duplicate-tailwindcss handling added -->
**scope:**

- in attu-ui: audit `src/lib/theme.css` against tree-editor's Tailwind config; add any missing design tokens (colors, spacing, typography); confirm `./theme.css` is in attu-ui `package.json` exports
- split `attu-ui/src/lib/theme.css` if needed: the file currently contains both `@import "tailwindcss"` and `@theme { ... }` — consumers importing it already get the tailwindcss base; if that causes problems, split into `theme-tokens.css` (tokens only) and keep `theme.css` as the full entry; probe result in phase 0 log guides this decision
- in tree-editor `apps/web/`: remove the `@import "tailwindcss"` from `app.css` (attu-ui/theme.css already supplies it); remove locally-duplicated token declarations from `app.css/@theme`; keep any tree-editor-specific tokens (`--fte-*`, `--color-tree-trunk`) that attu-ui does not own
- verify all Tailwind utility classes that depend on custom tokens still resolve (compare before/after by grepping for the token names in compiled CSS)
- run `pnpm verify` in tree-editor; manual smoke-test of all three views; run `pnpm typecheck` in attu-editor
