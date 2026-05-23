# testing

three test layers across two stacks. each layer has a clear purpose and a single command to run it.

---

## layout

```text
apps/web/tests/
├── unit/          # vitest, jsdom; pure ts logic and svelte runes modules
├── component/     # vitest + jsdom + @testing-library/svelte
├── e2e/           # playwright (chromium + mobile); full app, real persistence
├── spikes/        # one-off measurement scripts (e.g. layered-metrics.spike.test.ts)
├── fixtures/      # ged/.txt symlinks into ../../../notes/examples/, plus
│                  # the golden/ snapshot directory and a handful of small
│                  # repro fixtures (layered-bug-repros.ts, multi-union.ged,
│                  # head-schma-probe.ged, exif-orientation-6.jpg, etc.)
└── setup.ts       # registers jest-dom matchers and per-test cleanup

apps/server/tests/
└── test_*.py      # pytest; httpx asgi for in-process api, respx for outbound mocks
```

---

## what goes where

| concern | layer | example |
| :--- | :--- | :--- |
| date math, parsers, tree ops, id gen | unit (vitest) | `HaracalndeDate.compare` round trips |
| svelte component rendering, props, events | component (vitest browser) | `PersonNode` renders portrait + name |
| keyboard navigation, focus order | component | arrow keys move selection |
| import file -> render -> edit -> export | e2e (playwright) | round trip `Akarians-1-Jun-2025.txt` |
| autosave + multi-device sync | e2e | second browser context sees changes |
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
pnpm test:unit                                           # vitest (unit + component)
pnpm -F web test:unit:watch                              # watch mode (web only)
pnpm -F web exec vitest run tests/unit/date/             # subset
pnpm test:e2e                                            # playwright, all projects
pnpm test:e2e --project=chromium                         # single project
pnpm test:e2e --grep "import"                            # by test name

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

golden outputs live under `apps/web/tests/fixtures/golden/`. update with `UPDATE_GOLDEN=1 pnpm test:unit` for vitest snapshots; playwright visual snapshots update via `pnpm test:e2e --update-snapshots`.

---

## conventions

- one `describe` per module, one `it` per behavior
- prefer arrange/act/assert with blank lines between sections
- never share mutable state across tests; reset dexie via `indexedDB.deleteDatabase` in afterEach when used
- playwright tests use `page.getByRole` over selectors; avoid xpath
- pytest fixtures live in `conftest.py` next to the tests that use them, not in a global pile

---

## ci expectations

- `pnpm verify` must pass before any pr merges
- coverage targets: 80% statements on `apps/web/src/lib/**` and `apps/server/attu_tree/**` once those modules exist
- e2e flake budget: zero retries on chromium project; mobile project allowed one retry

---

## metadata

```yaml
last_updated: 23 May 2026
```
