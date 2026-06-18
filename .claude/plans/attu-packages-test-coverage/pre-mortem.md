# pre-mortem — attu-packages-test-coverage

**Bottom line:** proceed with revisions (all folded into plan.md)

### Risks

- [high] scope — plan originally said "write test files in `packages/attu-ui/src/`" but vitest.config.ts matches `tests/unit/**/*.test.ts`; tests in `src/` would never be discovered · resolved: corrected to `tests/unit/` throughout; phase 0 creates the directory and runs a trivial test to confirm discovery
- [high] dependency — `isDryRun()` calls `localStorage.getItem()` at runtime; in a Node/vitest env without jsdom this throws ReferenceError; entire api-client module fails to import · resolved: api-client vitest.config.ts sets environment: "jsdom"; localStorage available
- [medium] dependency — CropperDialog uses HTMLCanvasElement APIs (getContext, drawImage, toBlob); jsdom canvas is a no-op stub; encode/crop pixel assertions are not feasible · accepted: phase 3 scope limits CropperDialog tests to DOM presence only
- [medium] scope — ShareDialog and AdminPanel tests require mocking @attu/api-client from within attu-ui tests; no established pattern yet · mitigated: `vi.mock("@attu/api-client")` as primary; `vi.stubGlobal("fetch", ...)` as ESM-hoisting fallback; documented in phase 3 scope
- [medium] integration — 9 e2e specs validated on chromium; firefox may have additional layout/timing differences beyond overflow-clip · mitigated: phase 0 gate — all 9 must pass before phase 1 starts; pivot criterion added
- [low] walking-skeleton — original phase 0 had no attu-ui test layer; phases 2-3 depend on `tests/unit/` existing and vitest discovering it · resolved: trivial HaracalndeDate test added to phase 0 scope

### Walking-skeleton check

Original phase 0 touched only e2e and api-client. Phases 2 and 3 introduce a new layer (attu-ui/tests/unit/) with unknown Svelte 5 + jsdom compatibility. Revised: added trivial HaracalndeDate test to phase 0 — this stubs the attu-ui vitest layer before phase 2 depends on it.

### Phase-order revisions

| original | proposed | reason |
|---|---|---|
| phase 0: e2e only + api-client stub | phase 0: e2e + api-client stub + attu-ui vitest probe | attu-ui test infrastructure is untested; phases 2-3 fail silently if `tests/unit/` isn't discovered |

### Definition-of-done additions

- phase 0 — added: "attu-ui vitest discovers and runs the HaracalndeDate test in `tests/unit/`"; "api-client import succeeds in jsdom env"; pivot criterion for e2e failures
- phase 2 — corrected: test files go in `packages/attu-ui/tests/unit/` (not `src/`)
- phase 3 — added: mocking strategy for @attu/api-client; pivot criterion for unexpected Dexie/IDB imports
