# log — attu-packages-test-coverage

(append per-phase entries here; chronological)

## starting phase 0 — 2026-06-18

no worktree (plan constraint: all changes land on trunk)

**DoD:** playwright.config.ts and App.svelte (+ canvas z-0 fixes) committed; `pnpm test:e2e` all 9 specs green under firefox; `packages/attu-ui/tests/unit/haracalende-date.test.ts` created and discovered by `pnpm test:unit`; `packages/api-client/vitest.config.ts` (env: jsdom) + `tests/unit/errors.test.ts` (1 ConflictError test) added and passing
