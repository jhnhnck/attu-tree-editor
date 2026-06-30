# testing

two test layers across two stacks. each layer has a clear purpose and a single command to run it.

the e2e (playwright) layer was removed (`chore(test): remove e2e suite pending app maturity`, 18 June 2026) - no `tests/e2e/`, no `playwright.config.ts`, no playwright dependency. coverage that used to live there now needs to be carried by component tests, or revisited if e2e is reintroduced.

---

## layout

```text
apps/tree-editor/tests/
├── unit/          # vitest, jsdom; pure ts logic and svelte runes modules
├── component/     # vitest + jsdom + @testing-library/svelte; _harness/ for shared mount helpers
├── spikes/        # one-off measurement scripts (e.g. layered-metrics.spike.test.ts)
├── fixtures/      # ged/.txt symlinks into ../../../notes/examples/, plus
│                  # golden/ (GEDCOM round-trip golden used by serialize.test.ts)
│                  # and a handful of small repro fixtures (layered-bug-repros.ts,
│                  # multi-union.ged, head-schma-probe.ged, exif-orientation-6.jpg, etc.)
└── setup.ts       # registers jest-dom matchers and per-test cleanup

apps/server/tests/
└── test_*.py      # pytest; httpx asgi for in-process api, respx for outbound mocks
```

---

## what goes where

| concern | layer | example |
| :--- | :--- | :--- |
| date math, parsers, tree ops, id gen | unit (vitest) | `HaracalndeDate.compare` round trips |
| svelte component rendering, props, events | component (vitest + jsdom) | `PersonNode` renders portrait + name |
| keyboard navigation, focus order | component | arrow keys move selection |
| import file -> render -> edit -> export | component | round trip `Akarians-1-Jun-2025.txt` via `ImportEditHarness` |
| api request/response shapes, auth | unit (pytest) | `/health`, `/auth/discord/init` |
| sync conflict resolution | unit (pytest) | revision merge with concurrent edits |
| wiki client http behavior | unit (pytest, respx) | mocks the mediawiki api |

if a test needs a real db or network, put it under an integration marker and skip in default ci.

---

## running

```bash
# everything
pnpm verify

# web only
pnpm test:unit                                           # vitest (unit + component, the only web test layer)
pnpm -F tree-editor test:unit:watch                      # watch mode (web only)
pnpm -F tree-editor exec vitest run tests/unit/date/      # subset

# server only
cd apps/server
uv run pytest                                            # all
uv run pytest tests/test_health.py -k ok                 # subset
uv run pytest -m unit                                    # marker
uv run pytest --cov=attu_tree --cov-report=term-missing  # coverage
```

---

## fixtures

the example exports live at `notes/examples/` and are symlinked into the fixtures tree by name (`Akarians.ged`, `Akarians.txt`). small purpose-built fixtures (`tiny.ged`, `multi-union.ged`, `head-schma-probe.ged`, `layered-bug-repros.ts`) sit alongside them, and binary visual + image fixtures (`portrait-blue.png`, `exif-orientation-6.jpg`, `hyperbolic-demo.svg`) live in the same directory.

gedcom round-trip goldens live under `apps/tree-editor/tests/fixtures/golden/`. update with `pnpm test:unit -u` (vitest `--update-snapshots`). no playwright visual goldens remain (deleted by the `ui-invariant-tests` plan, and the e2e layer itself is now gone too).

---

## conventions

- one `describe` per module, one `it` per behavior
- prefer arrange/act/assert with blank lines between sections
- never share mutable state across tests; reset dexie via `indexedDB.deleteDatabase` in afterEach when used
- pytest fixtures live in `conftest.py` next to the tests that use them, not in a global pile

---

## ci expectations

- `pnpm verify` must pass before any pr merges
- coverage targets: 80% statements on `apps/tree-editor/src/lib/**` and `apps/server/attu_tree/**` once those modules exist

---

## metadata

```yaml
last_updated: 30 June 2026
```
