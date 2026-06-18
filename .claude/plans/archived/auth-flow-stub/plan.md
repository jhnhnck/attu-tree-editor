# plan: auth-flow-stub

## goals

1. the dry-run debug toggle exercises the real discord-oauth UX (sign-in dialog, polling, success/error states) without the backend running.
2. the synthetic-user short-circuit in `authStore` is removed; all client-side gating flows through the same stub-mediated `authStore.fetch()` path.

## non-goals

- UI toggle for error-branch selection (localStorage key `fte.debug.authDryRunOutcome` is sufficient).
- any backend changes.
- stubbing tree API calls (only auth endpoints: `/api/auth/start`, `/api/auth/check`, `/api/auth/me`, `/api/auth/logout`).

## constraints

- `DRY_RUN_USER` must remain exported from `auth.svelte.ts` (test import site); re-export from `auth-stub.ts` is fine.
- no circular deps: `auth-stub.ts` must not import from `auth.svelte.ts` or `client.ts`.
- `fte.debug.authDryRun` localStorage key stays as the toggle (read by both `App.svelte` and the new `isDryRun()` helper in `client.ts`).

## accepted risks

no backend round-trip means a bug in the stub's response shape (wrong field name, wrong type) would only surface when switching to a real server. the `LinkStartResponse` / `LinkCheckResponse` / `MeResponse` types from `@attu/api-client` guard this at compile time, so the risk is low.

## phase 1 — implement stub and remove short-circuit

**status:** CLOSED — 2026-05-28

**scope:**
1. new `apps/web/src/lib/api/auth-stub.ts`: state machine returning typed stubs for `start`, `check`, `me`, `logout`. outcome configurable via `localStorage["fte.debug.authDryRunOutcome"]`.
2. `client.ts`: add `isDryRun()` (reads localStorage); wrap `auth` object to route to stub when active.
3. `auth.svelte.ts`: remove `if (dryRun) return DRY_RUN_USER` from `user` getter; `setDryRun(false)` clears any stub session (`user = null`); re-export `DRY_RUN_USER` from stub.
4. `auth.test.ts`: rewrite to test new behavior (dry-run on → no immediate user; stub flow → user set).
5. `AuthBar.svelte`: remove dead dry-run sign-out guard (`dryRun && !realUser`).
6. `App.svelte`: update stale comment on `$effect` + `setDryRun`.
7. `notes/to-do.md`: close the item.

**definition of done:** dry-run on → "sign in" button shown; clicking "sign in" opens LinkCodeDialog with code "DRY-RUN"; after ~6s polling it resolves to "ok" and "Debug User (dry-run)" appears; sign-out clears the session; toggling chip off while signed in also clears the session; `pnpm verify` passes.
