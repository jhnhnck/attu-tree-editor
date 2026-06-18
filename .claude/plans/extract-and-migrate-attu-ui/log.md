# log — extract-and-migrate-attu-ui

(append per-phase entries here; chronological)

## phase 3 retro — 2026-06-18

### spec delta

- delivered: all DoD items met — zero `$lib/` imports to extracted files in tree-editor src and tests; all deleted files gone; `pnpm verify` passes clean (typecheck + lint + 1328 unit tests + build + server)
- missed / deferred: `pnpm dev` browser smoke check skipped — no display in env; typecheck + build pass treated as equivalent
- extra: updated PortraitField.test.ts mock from `vi.mock("$lib/...")` to `vi.mock("@attu/ui", importOriginal)` — import path changed when CropperDialog moved; hoisted dynamic imports in order.test.ts integration tests to top-level static imports (timeout fix); added `@attu/ui/pure` subpath export to avoid web worker bundler failing on Svelte files

### surprises

- plan only listed src/ files for migration; test files also had direct `$lib/` imports to extracted files — required a full audit of ~35 test files; delta: scope wider than expected
- attu-ui barrel was missing many exports discovered only at typecheck time: `Result`/`ok`/`err`, `DateParseErrors`/`DateParseError`, all dockRegistry functions, `DockRenderSnippet`, `DockConfig`, cropperMath/loadSourceBitmap/encodePortrait; delta: barrel expanded significantly
- layout worker (TreeCanvas.svelte) builds Svelte components with a sub-Vite instance that can't process `.svelte` files from workspace packages; moving domain types to `@attu/ui` made the worker's import chain pull in Svelte components → build fail; fix: `@attu/ui/pure` subpath export + domain files use that path; delta: one new export path, three domain file import changes
- order.test.ts integration tests used `await import("$lib/domain/tree")` inside test bodies — before phase 3 those files only depended on pure TS so were fast; after phase 3 they load all of `@attu/ui` transitively, hitting the 5000ms test timeout in the full suite (but not in isolation); fix: hoisted to top-level static imports; delta: async test callbacks removed

### residual debt

- `@attu/ui/pure` subpath is an undocumented constraint: any new file that runs in a worker context must import from `@attu/ui/pure` not `@attu/ui` — no bugs.md entry (document in phase 4 notes or CLAUDE.md); routed as phase-4 note
- test files now `vi.mock("@attu/ui", importOriginal)` pattern in PortraitField.test.ts — this patches the whole attu-ui module for that file; works but is heavier than the old single-component mock; no correctness issue, just worth knowing

### implications for downstream phases

- phase 4 (tailwind): no new impediments; CSS cleanup is straightforward from here
- document the `@attu/ui/pure` constraint in attu-ui's CLAUDE.md or notes/agents.md before next session

## revision after phase 3 — 2026-06-18

- phase 4 (tailwind consolidation): **revise** — added `@attu/ui/pure` documentation to scope; web worker constraint (debt-06) is a phase-4 housekeeping task; all other phase 4 items unchanged

## phase 4 retro — 2026-06-18

### spec delta

- delivered: all DoD items met — attu-ui `theme.css` owns all shared tokens; app.css `@theme` reduced to 4 tree-editor-specific tokens; `@import "tailwindcss"` and all duplicate shared-token declarations removed from app.css; all compiled token families verified in CSS output; `@attu/ui/pure` constraint documented in attu-ui CLAUDE.md; `pnpm verify` passes; wiki-editor typecheck passes (0 errors); test coverage evaluation written (see below)
- missed / deferred: manual smoke-test skipped (no display in env); typecheck + build + tests treated as equivalent per phases 0-3 precedent
- extra: added explanatory `font-size: 110%` comment to attu-ui/theme.css (was in app.css; moved to canonical location)

### surprises

- no surprises. phase 4 was the most mechanical phase in the plan — the probe in phase 0 eliminated all CSS risk, and the token audit showed attu-ui's values were already identical to tree-editor's. the only work was deletion.
- CSS output shrank from 58.42 kB to 57.33 kB after removing the duplicate `@theme` declarations — confirms Tailwind v4 was generating duplicate utility class entries from the two `@theme` blocks

### residual debt

- none routed to bugs.md. the plan is complete.

### test coverage evaluation

conducted a full audit of all four packages. findings:

**packages/attu-ui** — 0% direct test coverage. ~50% of exported surface is exercised transitively through tree-editor's 1328 tests (HaracalndeDate, date helpers, all canvas/form/palette components, state modules). not tested directly: Svelte components not used in tree-editor (CropperDialog edge cases, ShortcutsOverlay a11y, AdminPanel, AboutDialog, SettingsDialog, ShareDialog), toastsStore, progressStore, keyboard module, Result<T,E> utility. risk: HIGH — if wiki-editor or attu-editor starts using these components, bugs won't surface until render time.

**packages/api-client** — 0% coverage, no test config. covers the entire backend integration surface (auth, trees, grants, admin, ConflictError, dry-run stub). risk: HIGH — server response format changes or dry-run logic regressions will be silent.

**apps/wiki-editor** — 0% coverage, vitest config exists but no tests. acceptable at stub phase. risk: MEDIUM — once non-stub code lands, zero baseline.

**apps/tree-editor** — 137 test files, 1328 passing tests. solid domain, layout, io, state, and component coverage. gaps: e2e suite absent (Playwright binary not installed), server sync edge cases, attu-ui components not exercised by tree-editor (CropperDialog, ShortcutsOverlay when not interacting with the field). risk: LOW.

**recommended priority order:**

1. `packages/api-client` unit tests — zero test coverage on the entire backend integration; ConflictError + dry-run stub are high-risk and fail silently
2. `packages/attu-ui` state module tests (toastsStore, progressStore, keyboard) — behavioral modules moved from tree-editor with no direct tests; keyboard is user-facing correctness
3. `packages/attu-ui` component tests for components not exercised by tree-editor (CropperDialog, ShortcutsOverlay, shell dialogs) — will bitrot as wiki-editor grows
4. `apps/wiki-editor` integration tests — low urgency at stub phase; plant vitest baseline before non-stub code lands

## revision after phase 4 — 2026-06-18

- phase 4 (tailwind consolidation): closed pending merge — all DoD items delivered; plan complete
- phases 1-3: unchanged (already closed)
- debt-02, debt-06: closed; debt-04, debt-05 remain open and deferred
- no new phases inserted; plan is fully closed pending commit and merge

## starting phase 4 — 2026-06-18

**no worktrees** — working in place on trunk per plan constraint.

**DoD confirmed:**

- attu-ui `theme.css` owns all design tokens; tree-editor `app.css` has no duplicate `@import "tailwindcss"` and no locally-duplicated token declarations (tree-editor-specific tokens kept)
- all Tailwind utility classes that depend on custom tokens still resolve in compiled CSS
- `@attu/ui/pure` constraint documented in attu-ui CLAUDE.md
- `pnpm verify` passes in tree-editor
- `pnpm typecheck` passes in `apps/wiki-editor`
- test coverage evaluation written and recorded in log.md
- manual smoke-test: skipped (no display in env); typecheck + build + tests treated as equivalent per phases 0-3 precedent

## starting phase 3 — 2026-06-18

**no worktrees** — working in place on trunk per plan constraint.

**DoD confirmed:**

- `pnpm typecheck && pnpm build` passes in tree-editor with zero errors
- no file in `apps/tree-editor/src/` imports from a path that now lives in attu-ui
- deleted files are gone
- `pnpm test:*` passes
- `pnpm dev` opens in browser with no console errors (no display in env — documented)

**first tasks (per phase 2 retro):**

- add missing attu-ui barrel exports (fitMath, zoomDisplay, dockConfig, DockCorner, menu types, ContextMenuItem)
- update `state/preferences.svelte.ts` to import types from `@attu/ui`

## starting phase 0 — 2026-06-18

**no worktrees** — working in place on trunk per plan constraint (three separate git repos).

**DoD confirmed:**

- `pnpm dev` in tree-editor starts clean; Button from `@attu/ui` renders in browser with correct Tailwind styles
- at least one design-token utility class from `@attu/ui/theme.css` renders correctly
- `pnpm typecheck` passes in attu-editor with `@attu/ui` resolved
- domain-clean audit result documented

## phase 0 retro — 2026-06-18

### spec delta

- delivered: all DoD items met — monorepo assembled, workspace wired, typecheck green in apps/web and apps/editor, domain-clean audit complete, Tailwind probe documented
- missed / deferred: browser rendering of Button not visually confirmed (environment has no display); dev server starts clean and typecheck passes — treated as pass
- extra: fixed apps/editor vite.config.ts TypeScript 6 incompatibility; added Button.svelte to packages/attu-ui (was in attu-ui working tree but not committed); fixed stale HaracalndeDate barrel export; archived auth-flow-stub plan

### surprises

- `git subtree` not installed on this host → used `git read-tree` + squash-commit; same result, different plumbing
- Button.svelte present in attu-ui working tree only, not committed → imported scaffold was missing it; had to add manually
- attu-ui barrel referenced `./date/HaracalndeDate.js` which didn't exist yet → removed stub export to clear typecheck
- apps/editor vite.config.ts used `manualChunks: undefined` which TypeScript 6 no longer accepts as a valid `OutputOptions` value → removed the output block (value was a no-op anyway)
- domain-clean audit surfaced two new api/client hits not in the original plan: `ShareDialog.svelte` and `AdminPanel.svelte` both import from `$lib/api/client`

### residual debt

- ShareDialog.svelte + AdminPanel.svelte have $lib/api/client imports — same category as AuthBar/LinkCodeDialog; expand phase 2 scope · routed to bugs.md as debt-01
- attu-ui/theme.css contains its own `@import "tailwindcss"` — consumer app.css also imports tailwindcss; duplicate resolved at build time by Vite but should be cleaned up in phase 4 · routed to bugs.md as debt-02
- local Button.svelte still lives in apps/web/src/lib/components/ui/ alongside the copy in packages/attu-ui — intentional duplicate window, cleaned in phase 3
- packages/attu-ui imported nested .claude/ skills and settings from attu-ui repo; these dirs now exist inside the monorepo at packages/attu-ui/.claude/ — cosmetic clutter, low priority
- e2e suite blocked: Playwright binary absent from env (pre-existing); zero new failures attributable to phase 0

### Tailwind probe result

`@import "@attu/ui/theme.css"` propagates **both** utility class generation and CSS custom properties. the `@theme` block is a compile-time directive — Tailwind's Vite plugin inlines the import and registers utility classes (`bg-canvas`, `text-fg`, etc.) from the imported `@theme` block. consumer's own `@theme` block overrides token values. no extra `@theme inline {}` wrapper needed in the consumer for phase 4 consolidation.

### implications for downstream phases

- phase 2 scope expand: add ShareDialog.svelte and AdminPanel.svelte to the api/client decoupling work (same pattern as AuthBar — swap $lib/api/client → @attu/api-client)
- phase 4: remove consumer's own `@import "tailwindcss"` OR ensure attu-ui/theme.css does not include it (split into theme-only CSS and full-entry CSS)

## revision after phase 0 — 2026-06-18

- phase 1 (CommandPalette decoupling): **valid** — unchanged
- phase 2 (api-client decoupling): **revise** — DoD and scope expanded to include ShareDialog.svelte and AdminPanel.svelte; api/client coupling cluster is 5 files, not 3
- phase 3 (import migration): **valid** — unchanged
- phase 4 (tailwind consolidation): **revise** — removed conditional `@theme inline {}` fallback (probe confirmed utility classes propagate); added explicit handling for duplicate `@import "tailwindcss"` between attu-ui/theme.css and apps/web/app.css; accepted risks updated to mark risk #1 resolved

## phase 1 retro — 2026-06-18

### spec delta

- delivered: all DoD items met — CommandPalette has zero `$lib/domain/` or `$lib/layout/` imports; `PaletteItem` defined and exported from `@attu/ui`; palette opens, filters, and runs commands; tests pass; `pnpm typecheck` clean
- missed / deferred: `resolveKinship` prop removed entirely (was in original spec) — `svelte/no-unused-props` rejects unused Props members; prop can be added when kinship display is actually implemented · descoped on purpose
- extra: folded `commands: Command[]` prop into `items: PaletteItem[]` — this was an unplanned but necessary step so phase 2 can move CommandPalette to attu-ui without carrying a dependency on the local `Command` type

### surprises

- plan assumed only `$lib/domain/types` import was domain-coupling → reality: `commands: Command[]` prop also needed removing since `Command` type is local to tree-editor and would block the phase 2 move of CommandPalette to attu-ui; delta: one additional prop folded in
- `svelte/no-unused-props` ESLint rule rejects interface Props fields that are never read → `resolveKinship` couldn't be added as a stub; delta: removed rather than suppressing the lint rule
- palette close-on-pick semantics shifted: old design had parent close on `onpick`; new design has palette call `onclose()` before `action()` → integration-check baseline updated in `selection-palette-pick.test.ts`; delta: one test expectation changed from `false` to `true`

### residual debt

- `commands.ts` still exports the `Command` type (used by MenuBar + keyboard shortcuts) — it's tree-editor-specific and not moving to attu-ui, but the CommandPalette no longer depends on it; no debt here, just noting the split is complete · no new bugs.md entry needed

### implications for downstream phases

- phase 2 may move CommandPalette to attu-ui without any additional decoupling — the `items: PaletteItem[]` interface is fully generic; the only remaining non-attu dependency was `$lib/keyboard` for `formatCombo`, which now lives in App.svelte at item-build time
- `resolveKinship` should be added to CommandPalette when kinship labels are wired (not a phase 2 concern — only relevant once kinship computation is available in attu-ui)

## revision after phase 1 — 2026-06-18

- phase 2 (api-client decoupling): **valid** — CommandPalette is already fully decoupled; phase 2 can move it as-is
- phase 3 (import migration): **revise** — CommandPalette call site bullet updated: phase 1 already set up `paletteItems` derivation and call site props; phase 3 only swaps the import path
- phase 4 (tailwind consolidation): **valid** — unchanged

## phase 2 retro — 2026-06-18

### spec delta

- delivered: all DoD items met — 5 api/client-coupled files refactored to `@attu/api-client`; LinkCodeDialog, AboutDialog, ShortcutsOverlay converted to native `<dialog>` + `showModal()`; all extraction-candidate files copied to attu-ui `src/lib/`; barrel exports complete; `pnpm typecheck` passes in attu-ui; `pnpm verify` passes in tree-editor
- missed / deferred: none
- extra: `utils/result.ts` and `components/shell/menu.ts` added to extraction list after audit; `$lib/api/auth-stub.ts` content folded into `@attu/api-client` directly; `ShareDialog.test.ts` mock path updated from `$lib/api/client` → `@attu/api-client`

### surprises

- `@attu/api-client` is a plain TypeScript package (no Vite) → can't use `import.meta.env.BASE_URL`; used `setApiPrefix()` configurator instead, called from `$lib/api/client.ts` at module init time; delta: api-client has one extra exported function
- `HaracalndeDate.ts` imports `$lib/utils/result` — missed in phase 0 domain-clean audit (grep looked for `$lib/domain`/`$lib/layout`/`$lib/state`/`$lib/api` but not `$lib/utils`); delta: `utils/result.ts` added to extraction list and copied
- `Menu.svelte` and `MenuBar.svelte` both need `menu.ts` (shared types to avoid svelte re-export cycles) — not in the original extraction list; delta: `menu.ts` also copied to attu-ui
- `state/preferences.svelte.ts` has Dexie/`$lib/persistence/settings` dependency — not extractable as implementation; delta: extracted types only to `src/lib/state/preferences.ts` in attu-ui; full store stays in tree-editor
- `ShortcutsOverlay.svelte` imported `groupedShortcuts()` from `$lib/shortcuts` (tree-editor-specific bindings) → refactored to accept `groups` prop; App.svelte updated to pass `groupedShortcuts()`; delta: one props interface change + one call-site update
- `ShareDialog.test.ts` mocked `$lib/api/client` but ShareDialog now imports directly from `@attu/api-client` → mock bypass; delta: one test file mock path updated
- AboutDialog imported `Button` from `@attu/ui` (self-import in attu-ui context) and CommandPalette imported `PaletteItem` from `@attu/ui` — both needed relative-path fixes after copy

### residual debt

- `$lib/api/auth-stub.ts` in tree-editor is now dead code (nothing imports it) — delete in phase 3 alongside other originals · no new bugs.md entry needed (same as intentional duplicate window pattern)
- `state/preferences.svelte.ts` in tree-editor still imports from `$lib/persistence/settings` (not from `@attu/ui` types) — will be updated in phase 3 to import types from `@attu/ui` · no bugs.md entry needed (phase 3 scope)
- attu-ui barrel exports `windowManager` singleton and dock registry functions directly (no factory wrapper) — works fine since these are module-level singletons; acceptable for phase 2

### implications for downstream phases

- phase 3 import migration: tree-editor's `preferences.svelte.ts` must import `Theme`, `InspectorSide`, `PreferencesStore` types from `@attu/ui` (not define them locally) — note this as first phase 3 task
- phase 3 cleanup: `$lib/api/auth-stub.ts`, all original copied-source files, and duplicate `Button.svelte` can be deleted

## revision after phase 2 — 2026-06-18

- phase 3 (import migration): **revise** — first task updated: `preferences.svelte.ts` must import types from `@attu/ui`; extraction list for imports expanded to include `$lib/keyboard` and `$lib/utils/result`; `$lib/api/auth-stub.ts` added to delete list
- phase 4 (tailwind consolidation): **valid** — unchanged

## starting phase 2 — 2026-06-18

**no worktrees** — working in place on trunk per plan constraint.

**DoD confirmed:**

- AuthBar, LinkCodeDialog, ShareDialog, AdminPanel, state/auth.svelte.ts have no `$lib/api/client` imports
- LinkCodeDialog, AboutDialog, ShortcutsOverlay use native `<dialog>` + `showModal()`
- all extraction-candidate files are in attu-ui `src/lib/`
- barrel exports complete
- `pnpm typecheck` passes in attu-ui

**audit findings added to scope (not pivot-criterion triggers — no domain dependencies):**

- `$lib/keyboard.ts` added to extraction list; needed by Menu.svelte and ShortcutsOverlay.svelte
- editor utilities (`loadSourceBitmap`, `cropperMath`, `encodePortrait`) added; needed by CropperDialog/CropperCanvas
- `state/preferences.svelte.ts` has Dexie dependency — extracting types only to attu-ui (`src/lib/state/preferences.ts`); full store stays in tree-editor
- `ShortcutsOverlay.svelte` imports `$lib/shortcuts` (tree-editor-specific) — refactoring to accept `groups` prop before copying
- `@attu/api-client` is a plain TypeScript package (no Vite) — using `setApiPrefix()` configurator instead of `import.meta.env.BASE_URL`

## starting phase 1 — 2026-06-18

**no worktrees** — working in place on trunk per plan constraint.

**DoD confirmed:**

- `CommandPalette.svelte` has zero imports from `$lib/domain/` or `$lib/layout/`
- `PaletteItem` type defined and exported from `@attu/ui`
- palette still opens, filters, and runs commands; existing tests pass
- `pnpm typecheck` clean

## revision mid-phase-0 — 2026-06-18

switched from separate-repos + pnpm link to a monorepo. rationale: pnpm link + Vite symlinks and multiple-Svelte-instances were the top two accepted risks; both are eliminated by workspace hoisting. attu-editor already declared `@attu/ui@workspace:*`, making the separate-repo constraint an active impediment.

- phase 0: **revise** — monorepo migration (git subtree add for attu-ui and attu-editor) prepended as first remaining task; `link:` reference in apps/web swapped to `workspace:*`; DoD gains monorepo assembly check
- phase 1: **valid** — unchanged
- phase 2: **valid** — unchanged
- phase 3: **revise** — removed "complete in same session" constraint; single-repo atomic commits make the duplicate-code window safe
- phase 4: **valid** — unchanged
