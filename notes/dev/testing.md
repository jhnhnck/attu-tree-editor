# testing

three test layers across two stacks. each layer has a clear purpose and a single command to run it.

---

## layout

```txt
apps/web/tests/
├── unit/          ← vitest, jsdom; pure ts logic and svelte runes modules
├── component/     ← vitest browser mode; svelte components in real chromium (phase 3)
├── e2e/           ← playwright; full app, real network, real persistence
└── fixtures/      ← symlinks to ../../examples; golden serializer outputs (phase 2)

apps/server/tests/
├── test_*.py      ← pytest; httpx asgi for in-process api, respx for outbound mocks
└── fixtures/      ← shared sample tree json (phase 5)
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
pnpm test:unit                                           # vitest
pnpm test:unit:watch                                     # watch mode
pnpm exec vitest run tests/unit/date/                    # subset
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

phase 2 onward, the example exports live at the repo root and are symlinked into the test tree:

```bash
ln -s ../../../../examples apps/web/tests/fixtures/examples
```

golden outputs (post-import re-serialization) live next to the test that generated them as `*.golden.txt`. update with `UPDATE_GOLDEN=1 pnpm test:unit`.

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
last_updated: 25 April 2026
```
