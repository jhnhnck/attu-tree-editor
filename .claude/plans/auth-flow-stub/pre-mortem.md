# pre-mortem: auth-flow-stub

single-phase plan; brief note per minimum-viable adoption.

**what could go wrong:**

1. **circular dep introduced** — `auth-stub.ts` imports from `client.ts` or `auth.svelte.ts`. mitigation: stub reads localStorage directly; imports only from `@attu/api-client` types.
2. **stale-session after toggle-off** — stub session (`user` state in `authStore`) not cleared when chip flips to false. mitigation: `setDryRun(false)` explicitly nulls `user`.
3. **test breakage on `DRY_RUN_USER` import** — `auth.test.ts` imports from `auth.svelte.ts`; if we move the constant without re-exporting, it breaks. mitigation: re-export from `auth.svelte.ts` via `export { DRY_RUN_USER } from "$lib/api/auth-stub"`.
4. **`App.svelte` comment drift** — comment says "immediately see the synthetic session" after the short-circuit is gone. mitigation: update comment in same commit.
