---
name: write-tests
description: Write meaningful test cases for FamilyTreeEditor or WikiEditor. Reads the source first, determines correct intended behavior (not just current behavior), fixes bugs found in the source before cementing them in tests, then writes the test. Trigger on "write a test", "add tests for", "test this", "add coverage to", "write tests for", "cover this with a test"; when asked to verify correct behavior; before writing a migration or domain change that requires a round-trip test. Not for integration-check (whole-product sweep), not for code-review (qualitative pass).
when_to_use: |
  When the user asks you to write or add test cases for any module in apps/tree-editor/, apps/wiki-editor/, or apps/server/. Applies to unit (vitest), component (@testing-library/svelte), spike (vitest/node), and server (pytest) tests.
---

# write-tests

## step 0: read before writing

Always read the source module in full before writing a single `it`. Read the types it imports from `$lib/domain/types.ts` if relevant. The goal is to understand what the module is *supposed* to do — from its name, its exported API, its comments, and how callers use it — not just what the current implementation does.

If you spot a discrepancy between the intended behavior (the contract implied by types and names) and the current implementation, that is a bug. Fix the bug first, then write the test for the correct behavior. Do not write a test that validates broken behavior.

## step 1: choose the right layer

Based on `notes/dev/testing.md`:

| concern | app | layer | runner |
| :--- | :--- | :--- | :--- |
| date math, parsers, tree ops, id gen, domain logic | tree-editor | `tests/unit/` | vitest + jsdom |
| svelte component rendering, events, keyboard | tree-editor | `tests/component/` | vitest + @testing-library/svelte |
| long-running perf / WASM / worker probes | tree-editor | `tests/spikes/` | vitest + node (separate config) |
| CodeMirror language extensions, editor commands | wiki-editor | `tests/unit/` | vitest + jsdom |
| api routes, auth flows, revision merge | server | `tests/` | pytest |

**No e2e layer.** Playwright was removed (2026-06-18). Component tests carry that coverage.

File locations:
- tree-editor unit: `apps/tree-editor/tests/unit/<domain-subdirectory>/<module>.test.ts`
- tree-editor component: `apps/tree-editor/tests/component/<ComponentName>.test.ts`
- tree-editor spike: `apps/tree-editor/tests/spikes/<name>.spike.test.ts`
- wiki-editor unit: `apps/wiki-editor/tests/unit/<module>.test.ts`
- server: `apps/server/tests/test_<router>.py`

## step 2: identify meaningful behaviors to test

For each function or component, enumerate the *behaviors* (not lines of code):

- the happy path with typical inputs
- boundary conditions (empty collection, single element, min/max values)
- behaviors that are non-obvious from the name alone
- error paths that callers actually depend on (e.g. `Result.err` shape)
- domain invariants explicitly called out in `notes/agents.md` (permissive schema, no cycle rejection, etc.)

Skip trivial getter/setter tests that add coverage but test no real logic. Prefer fewer, more meaningful cases over exhaustive line coverage.

## step 3: write the test

### globals: false

Both `apps/tree-editor` and `apps/wiki-editor` set `globals: false` in vitest. Every test file must import explicitly:

```ts
import { describe, expect, it, vi } from "vitest";
```

Never assume `describe`/`it`/`expect` are global — they are not.

### structure

```
one `describe` per module under test
one `it` per distinct behavior
arrange / act / assert — blank lines between each section
```

### placeholder names

Use Akarian-style placeholders when a test needs a generic person (from `notes/agents.md §5`):

- male: `Korak Nokar`
- female: `Marai Nokar`
- unknown: `Banchar Nokar`

### Result<T, E>

Domain operations return `Result<T, E>`. Always unwrap explicitly:

```ts
const result = linkParent(tree, childId, parentId);
if (!result.ok) throw new Error(`fixture: ${result.error}`);
tree = result.value;
```

Never just `expect(result.value).toEqual(...)` without checking `.ok` first — the value field is undefined on error.

### HaracalndeDate

Domain dates are `HaracalndeDate`. Never use `Date` in domain tests. Date literals take the form `{ era: "PC", year: 1700, month: 3, day: 5 }` (all fields optional except `era` + `year`).

### permissive schema

The schema does not reject self-couples, ancestral cycles, same-sex couples, or polygamy. Tests that exercise these paths should *expect them to succeed* and verify that `validate.ts` emits a finding, not an error. Do not write tests asserting that `linkSpouse(t, x, x)` fails.

### known jsdom quirks (tree-editor)

- `fflate` (used in `io/bundle/`) needs `// @vitest-environment node` at the top of the file — without it, `instanceof Uint8Array` checks fail in jsdom's realm.
- `<dialog>.showModal()` and `.close()` are not implemented in jsdom. Shim them in `beforeAll` for any component that uses `<dialog>`:
  ```ts
  beforeAll(() => {
      HTMLDialogElement.prototype.showModal = vi.fn();
      HTMLDialogElement.prototype.close = vi.fn();
  });
  ```
- `ResizeObserver`, `IntersectionObserver`, and `window.matchMedia` are shimmed in `tests/setup.ts` as no-ops. Component tests that need real dispatch install a synthetic observer in `beforeEach` and restore in `afterEach`.
- `Element.prototype.animate` is shimmed as a no-op in `tests/setup.ts` — svelte transitions call it.
- `Worker` is not available in jsdom. `TreeCanvas.svelte` spawns a layout worker; tests that need tree rendering substitute `FamilyViewCanvas` or skip worker-dependent paths.

### wiki-editor unit tests

wiki-editor has no `tests/setup.ts` — no global shims. Tests use `EditorState` / `ensureSyntaxTree` from `@codemirror/state` / `@codemirror/language` directly:

```ts
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { wikitext } from "$lib/lang-wikitext";

describe("wikitext language", () => {
    it("tokenizes bold markup", () => {
        const state = EditorState.create({ doc: "'''bold'''", extensions: [wikitext()] });
        const tree = ensureSyntaxTree(state, state.doc.length);
        expect(tree).not.toBeNull();
    });
});
```

For CodeMirror command tests (format toggles, etc.) use `EditorView` with a real state and dispatch, then assert on `view.state.doc.toString()`.

### immutable fixture trees

Domain ops are immutable — each operation returns a new `Tree`. Reassign `tree` after every op; never mutate in place. Build shared fixtures as factory functions that return a fresh tree, not a module-level `const`.

### avoid shared mutable state

Never share mutable state across tests. If tests use Dexie (IndexedDB), call `indexedDB.deleteDatabase("fte")` in `afterEach`.

### spike tests

Spikes live in `apps/tree-editor/tests/spikes/` and use a separate vitest config (`vitest.spike.config.ts`). They run with `environment: "node"`, no svelte plugin, `pool: "forks"`, and a 120 s timeout. Only add a spike when the test genuinely needs WASM, a Worker, or measures real wall-clock perf. Do not run with `pnpm test:unit` — use `pnpm test:spike`.

### file header

```ts
/*
 * FamilyTreeEditor - <one-line description of what the test covers>
 * licensed under the MIT license; see LICENSE.md for full text
 */
```

## server tests (pytest)

Server tests live in `apps/server/tests/test_<router>.py`. Patterns from `conftest.py`:

- `authed(client, discord_id)` — creates a user and sets the session cookie in one call. Use for any test that needs an authenticated user.
- `link_user(client, discord_id, username, roles=[])` — returns just the cookie, useful when you need two concurrent sessions.
- `hmac_headers(body)` — signs a bot webhook request.
- mark each test with `@pytest.mark.unit` or `@pytest.mark.integration` (integration = requires external state or network).
- `asyncio_mode = "auto"` is set in pyproject.toml — do not add `@pytest.mark.asyncio`; all async tests run automatically.
- httpx `AsyncClient` + `ASGITransport` is the in-process API client; never `requests`.
- do not mock the database — the conftest uses `tmp_path` + real aiosqlite. mocking hid a broken migration in the past.
- fixtures go in `conftest.py` next to the tests that use them, not in a global pile.

## step 4: after writing

Run the tests before declaring done:

```bash
# tree-editor unit + component
pnpm -F tree-editor test:unit

# tree-editor specific file
pnpm -F tree-editor exec vitest run tests/unit/domain/tree.test.ts

# tree-editor spikes (separate config)
pnpm -F tree-editor test:spike

# wiki-editor unit
pnpm -F wiki-editor test:unit

# wiki-editor specific file
pnpm -F wiki-editor exec vitest run tests/unit/commands.test.ts

# server
cd apps/server && uv run pytest tests/test_<router>.py -v

# server by marker
cd apps/server && uv run pytest -m unit -v
```

If tests fail on a golden snapshot (GEDCOM round-trip), update with `pnpm test:unit -u` only after confirming the new output is correct.
