# log: auth-flow-stub

## starting phase 1 — 2026-05-28

**worktree:** none (minimum-viable adoption — single phase, work in place)
**branch:** trunk
**DoD:** dry-run on → sign-in button; dialog opens with "DRY-RUN" code; polling resolves to ok; "Debug User (dry-run)" appears; sign-out and chip-off both clear session; `pnpm verify` passes.

## phase 1 retro — 2026-05-28

**shipped:** auth stub + three pre-existing bug fixes, all under `pnpm verify` in one session.

**went well:**

- clean separation: `auth-stub.ts` (state machine) → `client.ts` (router) → `auth.svelte.ts` (store) had no circular deps.
- re-exporting `DRY_RUN_USER` from the stub kept existing test imports intact with zero churn at call sites.
- the `hasInitialFit` guard for the auto-fit initial-render failure was a one-liner and fixed both suppression test suites immediately.

**surprises:**

- the resize-refit failure had a subtle root cause: the synthetic ResizeObserver's `observe()` fires synchronously, so reads inside the callback got tracked as `$effect` dependencies. when `hostW` changed, the RO `$effect` re-ran, created a fresh observer, and the new observer's `observe()` fired with the *initial* rect (1024×768) — resetting `hostW` back to 1024 before the fit ran. fix was one `untrack(() => obs.observe(el))` call.
- three pre-existing bugs were in scope from the bug log (OpenDialog.test.ts return type, path-highlight assertion drift, auto-fit initial fit). all closed as part of this phase.

**integration check:** `pnpm verify` — 135 test files, 1276 tests pass; 0 type errors; 0 lint errors; 69 backend tests pass.

**status:** CLOSED
