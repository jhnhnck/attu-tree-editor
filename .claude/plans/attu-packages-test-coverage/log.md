# log — attu-packages-test-coverage

(append per-phase entries here; chronological)

## starting phase 0 — 2026-06-18

no worktree (plan constraint: all changes land on trunk)

**DoD (original):** playwright.config.ts and App.svelte (+ canvas z-0 fixes) committed; `pnpm test:e2e` all 9 specs green under firefox; `packages/attu-ui/tests/unit/haracalende-date.test.ts` created and discovered by `pnpm test:unit`; `packages/api-client/vitest.config.ts` (env: jsdom) + `tests/unit/errors.test.ts` (1 ConflictError test) added and passing

**session closed 2026-06-18 — partial:**

- committed: firefox overflow-clip + canvas z-0 (8f7816f), switch e2e to firefox (9f640b9)
- e2e investigation: 22/124 tests failed; tracing showed failures were pre-existing (reproducible on old chromium commit). decision: remove e2e suite entirely pending app maturity (9bf9756). this voids the e2e DoD bullet.
- vitest harness (attu-ui probe + api-client config) not started — session redirected to dev proxy / workspace script work
- side work committed: dev reverse proxy for /trees and /edit (8f4abb7), tooling renames (ceb176d)
- **remaining phase 0 DoD:** attu-ui tests/unit/ probe test + api-client vitest.config.ts — carry into next session

## phase 0 retro — 2026-06-18

clean phase; all remaining DoD items done in a single session.

- `$lib` alias in existing vitest.config.ts resolved without any changes; probe test passed on first run
- api-client jsdom env satisfied isDryRun() localStorage call with no stubbing needed
- import path `../../src/index.js` resolves to `.ts` source correctly in vitest; no module resolution issues
- pivot criterion (svelte 5 component resolution failure) never triggered — probe uses pure TS
- tree-editor 1328 tests unchanged after adding new package test configs

no residual debt. no bugs filed.

## revision after phase 0 — 2026-06-18

plan shape unchanged. phases 1-4 valid as written. harness pattern confirmed for both packages. next: phase 1 (api-client full test suite).
