# attu-packages-test-coverage

## goals

- `packages/api-client` has vitest unit tests for all public exports; `pnpm test:unit` passes with zero errors
- `packages/attu-ui` has direct vitest tests for all state modules (toastsStore, progressStore, keyboard) and for the six components not exercised transitively by tree-editor (CropperDialog, ShortcutsOverlay, AboutDialog, SettingsDialog, ShareDialog, AdminPanel)
- `apps/wiki-editor` has a vitest.config.ts and at least one passing test (harness pattern established for future growth)
- all 9 browser-only e2e specs pass under firefox; uncommitted playwright.config.ts (chromium → firefox) and App.svelte (overflow-hidden → overflow-clip) changes are committed

## non-goals

- api-client openapi-typescript schema generation (`pnpm gen` script)
- tree-editor unit coverage beyond existing 1328 tests
- backend integration tests (hitting a live server)
- new components, features, or API endpoints in any package
- e2e tests for attu-ui or wiki-editor
- resolveKinship prop in CommandPalette (explicitly deferred pending kinship computation)

## constraints

- `packages/attu-ui` already has vitest.config.ts; testMatch is `tests/unit/**/*.test.ts` (not `src/`); `@testing-library/svelte` already in devDependencies; no `tests/unit/` directory yet
- `packages/api-client` has no vitest config; plain TS, no build step; exports via `./src/index.ts`; `isDryRun()` calls `localStorage.getItem()` — vitest env must be `jsdom` or localStorage must be stubbed
- playwright 1.61.0 installed; firefox-1532 and chromium-1228 confirmed in ~/.cache/ms-playwright/; config switching from chromium to firefox (uncommitted)
- App.svelte `overflow-hidden → overflow-clip` on `<main>` + canvas host `<div>` (uncommitted; likely required for firefox layout)
- no worktrees; all changes land on trunk
- pnpm@10.33.2, Svelte 5, Tailwind v4, TypeScript 6 enforced at workspace root

## accepted risks

Two residual risks. (1) CropperDialog uses HTMLCanvasElement APIs; jsdom's canvas is a no-op stub so encode/crop assertions are not feasible — phase 3 tests mount + assert visible state only, not pixel output. (2) Firefox may surface additional e2e failures beyond the overflow-clip fix; phase 0 is the gate and explicitly stops the plan if any spec fails for an unknown reason. The localStorage risk in api-client is eliminated by setting vitest env to `jsdom`. The attu-ui test-path mismatch (`src/` vs `tests/unit/`) is corrected in phase 0 scope.

## phase 0 — walking skeleton: e2e validation + test harness probe

**status:** in progress
**definition of done:** playwright.config.ts and App.svelte changes committed; `pnpm test:e2e` completes with all 9 specs green under firefox; `packages/attu-ui/tests/unit/` directory created with one trivial HaracalndeDate test — `pnpm test:unit` discovers and passes it; vitest.config.ts added to api-client (env: jsdom) with 1 passing ConflictError test
**scope:**

- commit playwright.config.ts (chromium → firefox) and App.svelte (overflow-hidden → overflow-clip)
- run `pnpm test:e2e`; if any spec fails for a reason beyond the overflow-clip fix, stop and file a bug before proceeding
- create `packages/attu-ui/tests/unit/haracalende-date.test.ts` — import HaracalndeDate from `$lib/date/HaracalndeDate`, assert one date round-trips; confirms vitest discovers `tests/unit/` correctly
- add `packages/api-client/vitest.config.ts` with environment: "jsdom" (localStorage available); add `packages/api-client/tests/unit/errors.test.ts` with 1 ConflictError construction test
- **pivot criterion:** if e2e fails on firefox for reasons requiring changes beyond App.svelte, run plan-revise; if attu-ui vitest fails to resolve Svelte 5 components in jsdom, run plan-revise

## phase 1 — api-client full test suite

**status:** open
**definition of done:** every public export in `packages/api-client/src/index.ts` has ≥1 test; test file count ≥3 (auth, trees, admin); `pnpm test:unit` in api-client passes with zero errors; mocked fetch is the only I/O
**scope:** mock `globalThis.fetch` with `vi.fn()` at suite level; test files in `packages/api-client/tests/unit/`: `auth.test.ts` (auth.start, auth.check, auth.me, auth.logout + authStub dry-run behavior via localStorage jsdom env), `trees.test.ts` (trees.list, trees.create, trees.get, trees.save with ConflictError path, trees.delete, trees.addGrant, trees.listGrants, trees.revokeGrant), `admin.test.ts` (admin.listUsers, admin.updateUser, admin.deleteUser), expand `errors.test.ts` (ApiError, ConflictError, onUnauthorized callback, setApiPrefix base-URL construction)

## phase 2 — attu-ui state module tests

**status:** open
**definition of done:** toastsStore, progressStore, keyboard each have tests in `packages/attu-ui/tests/unit/`; all documented behaviors covered; `pnpm test:unit` in attu-ui passes
**scope:** `tests/unit/state/toasts.test.ts` — add() creates entry, dismiss() removes, auto-expire fires (vi.useFakeTimers); `tests/unit/state/progress.test.ts` — start/finish/error state transitions; `tests/unit/keyboard.test.ts` — registerShortcut/deregisterShortcut, formatCombo output for known combos; import paths use `$lib/...` alias (configured in vitest.config.ts)

## phase 3 — attu-ui untested component tests

**status:** open
**definition of done:** CropperDialog, ShortcutsOverlay, AboutDialog, SettingsDialog, ShareDialog, AdminPanel each have ≥1 component test in `packages/attu-ui/tests/unit/components/`; mount + visible-state assertions pass; `pnpm test:unit` in attu-ui clean
**scope:** use `@testing-library/svelte` render() + jsdom (already installed); `vi.mock("@attu/api-client")` in files testing ShareDialog or AdminPanel — if ESM hoisting breaks interception, fallback is `vi.stubGlobal("fetch", ...)` at req() level; CropperDialog: assert `<canvas>` element is in the DOM (no pixel assertions — jsdom canvas is a stub); ShortcutsOverlay: pass groups prop, assert shortcut label strings appear; AboutDialog + SettingsDialog: render, assert title text visible, dispatch Escape and assert dialog closes; ShareDialog: render with treeId prop, assert api-client mock was called; AdminPanel: render with stub user list prop, assert display_names appear; **pivot criterion:** if any component imports Dexie or IndexedDB at render time, stop and run plan-revise

## phase 4 — wiki-editor vitest baseline

**status:** open
**definition of done:** `apps/wiki-editor` has vitest.config.ts; `pnpm test:unit` runs and passes ≥1 test
**scope:** copy vitest.config.ts pattern from attu-ui; write `apps/wiki-editor/tests/unit/lib.test.ts` — import Button from `@attu/ui` and assert it is defined; this canary confirms @attu/ui resolves correctly in a vitest context and establishes the harness for future SPA unit tests
