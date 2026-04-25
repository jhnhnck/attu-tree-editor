# FamilyTreeEditor - Agent Guide

## 1. Project Overview

client-side typescript spa (svelte 5, vite, tailwind v4) for viewing and editing family trees in the [Attu Project](https://attuproject.org) wiki universe. backed by a thin fastapi+sqlite service for autosave, sharing, and discord-bridged auth via doom-bot. lives at `devel/FamilyTreeEditor/` inside the attu-wiki-dev deployment. see [`notes/features/attu-wiki.md`](features/attu-wiki.md) for parent project context and [`notes/features/doom-bot.md`](features/doom-bot.md) for the bot.

---

## 2. Rules

1. do not edit the rules.
1. do not create commits without being explicitly asked to.
1. do not commit secrets - `.env` is gitignored; all credentials live there.
1. check the current time at the start of each conversation. if it is past 12:30 AM ET, suggest a natural stopping point before continuing any task.
1. all in-universe dates must use `HaracalndeDate`; never use `Date` in domain code.
1. round-trip exports must list dropped fields when the target format cannot carry them; do not silently lose data.

---

## 3. Architecture

### top level

| Module | Role |
| :--- | :--- |
| `apps/web/` | client-side svelte 5 spa; bundled by vite |
| `apps/server/` | fastapi + aiosqlite backend; single docker container |
| `packages/` | shared workspace packages (api-client lands in phase 5) |
| `examples/` | sample `.txt`, `.ged`, and family echo `.html` exports |
| `notes/` | agent guidance and feature specs |

### apps/web internals

| Module | Role |
| :--- | :--- |
| `src/lib/domain/` | typed person/tree model, in-memory ops, validation |
| `src/lib/date/` | `HaracalndeDate` class and gregorian conversion |
| `src/lib/io/familyscript/` | parser/serializer for family echo `.txt` |
| `src/lib/io/gedcom/` | wraps read-gedcom + gedcom-io |
| `src/lib/persistence/` | dexie schema + sync coordinator |
| `src/lib/layout/` | relatives-tree adapter |
| `src/lib/state/` | `$state` runes for tree, selection, viewport, auth |
| `src/lib/components/` | canvas, panels, form, portrait, ui primitives |
| `src/lib/wiki/` | wiki link resolution + (phase 6) gadget shim |

### apps/server internals

| Module | Role |
| :--- | :--- |
| `attu_tree/main.py` | fastapi app + middleware + routes |
| `attu_tree/db.py` | aiosqlite pool + migrations |
| `attu_tree/models.py` | pydantic schemas for the wire |
| `attu_tree/auth/` | discord magic-code flow + session cookies |
| `attu_tree/trees/` | crud + share grants |
| `attu_tree/sync/` | revision-checked autosave merge |
| `attu_tree/calendar.py` | mirror of doom-bot's haracalnde math |
| `attu_tree/wiki.py` | mediawiki client for link previews |

---

## 4. Configuration System

### web

- `apps/web/vite.config.ts` - dev port 5173, proxies `/api` to `:8000`
- `apps/web/tailwind.config.ts` - tailwind v4 lives mostly in `src/app.css` via `@theme`
- `.env.development` and `.env.production` (gitignored) - `VITE_API_BASE_URL`, `VITE_WIKI_BASE_URL`

### server

- `apps/server/pyproject.toml` - dependencies, ruff, basedpyright, pytest config
- `.env` (gitignored) - `DATABASE_URL`, `DISCORD_BOT_HMAC_SECRET`, `WIKI_BASE_URL`, `SESSION_SECRET`, `CORS_ORIGINS`
- `pydantic-settings` loads from `.env` at import time via `attu_tree/settings.py` (phase 5)

precedence: env vars > `.env` > defaults in `Settings`.

---

## 5. Coding Conventions

### typescript

- strict tsconfig with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- prettier: 4 spaces, double quotes, trailing commas, 100-col, semicolons
- eslint: `typescript-eslint` recommended-type-checked + `eslint-plugin-svelte`
- prefer svelte 5 runes (`$state`, `$derived`, `$effect`); no stores
- io boundaries return `Result<T, E>` rather than throwing
- file naming: `kebab-case.ts` for modules, `PascalCase.svelte` for components, `*.svelte.ts` for runes-only modules

### python

- ruff + basedpyright matching doom-bot's strictness (see `apps/server/pyproject.toml`)
- single-quoted strings; 4-space indent; line length capped by ruff (320 budget, formatter enforces flow)
- `async`/`await` everywhere; sync code only at startup
- pydantic models for all wire types

### shared style

- lowercase inline comments; no trailing periods
- regular dashes (-); never em-dashes
- american english spelling
- spaces for indentation everywhere
- prefer brief statements over long explanations
- error messages are lowercase, no terminal punctuation

---

## 6. Testing

### web

- **unit**: `apps/web/tests/unit/**/*.test.ts` - vitest, jsdom, no browser deps
- **component**: `apps/web/tests/component/**/*.test.ts` - vitest browser mode (added in phase 3)
- **e2e**: `apps/web/tests/e2e/**/*.spec.ts` - playwright with `chromium` + `mobile` projects
- `pnpm test:unit` runs vitest, `pnpm test:e2e` runs playwright
- fixtures symlinked from top-level `examples/` into `apps/web/tests/fixtures/` (added in phase 2)

### server

- pytest with `asyncio_mode = "auto"`
- `apps/server/tests/test_*.py` discovered automatically
- markers: `unit`, `integration`
- httpx `AsyncClient` + `ASGITransport` for in-process api tests; respx for outbound mocks

see [`notes/dev/testing.md`](dev/testing.md) for layout details, fixtures, and how to run subsets.

---

## 7. Running Locally

see [`notes/dev/dev_setup.md`](dev/dev_setup.md) for prerequisites and one-time setup. once ready:

```bash
pnpm dev           # web on :5173, proxies /api -> :8000
pnpm server:dev    # uvicorn --reload on :8000
pnpm verify        # full ci sweep
```

for a docker preview of the backend:

```bash
cd apps/server && docker compose up --build
```

---

## 8. Patterns & Pitfalls

1. **playwright webserver**: `playwright.config.ts` invokes `npx vite preview --host 127.0.0.1` rather than `pnpm preview`; subprocesses spawned by `playwright test` get a minimal `PATH` and can't always find pnpm. keep that line as `npx ...`.
2. **vitest <-> vite version coupling**: vitest 3 pairs with vite 6+. if you bump vite, bump vitest in lockstep, or types will conflict across two parallel installs.
3. **prettier-plugin-tailwindcss**: disabled in phase 0 because it crashes on svelte 5 syntax (`getVisitorKeys is not a function`). re-enable once upstream ships a fix; class sorting is not currently enforced.
4. **pnpm allowBuilds**: esbuild's postinstall must be allowed in `pnpm-workspace.yaml`'s `allowBuilds`; otherwise vitest's transform fails silently with "missing platform binary" at runtime.
5. **eslint and config files**: `eslint.config.js` and `svelte.config.js` are excluded from typescript-eslint's project service (see the `disableTypeChecked` block in `apps/web/eslint.config.js`); without it, lint errors with "not found by the project service".

---

## 9. Reference Notes

**`notes/style/`**
- [`notes/style/commit_style.md`](style/commit_style.md) - commit message format, types, and tone

**`notes/features/`**
- [`notes/features/attu-wiki.md`](features/attu-wiki.md) - parent project context (containers, services, architecture)
- [`notes/features/doom-bot.md`](features/doom-bot.md) - sibling discord bot; family-tree integration touch points

**`notes/dev/`**
- [`notes/dev/dev_setup.md`](dev/dev_setup.md) - one-time install steps (node, pnpm, python, uv, playwright)
- [`notes/dev/testing.md`](dev/testing.md) - test layout, fixtures, how to run subsets

**`notes/`**
- [`notes/.meta.md`](.meta.md) - guide to this documentation system
- [`notes/to-do.md`](to-do.md) - open items
- `notes/plans/` - gitignored implementation plans; ask the user before publishing

---

## 10. File & Directory Layout

```txt
FamilyTreeEditor/
├── apps/
│   ├── web/
│   │   ├── eslint.config.js
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── playwright.config.ts
│   │   ├── .prettierrc.json
│   │   ├── src/
│   │   │   ├── App.svelte
│   │   │   ├── app.css
│   │   │   ├── main.ts
│   │   │   ├── vite-env.d.ts
│   │   │   └── lib/                 ← grows phase 1+
│   │   ├── svelte.config.js
│   │   ├── tests/{unit,e2e}/
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── vitest.config.ts
│   └── server/
│       ├── attu_tree/
│       │   ├── __init__.py
│       │   └── main.py
│       ├── docker-compose.yml
│       ├── Dockerfile
│       ├── pyproject.toml
│       ├── tests/test_health.py
│       └── uv.lock
├── examples/                        ← reference .ged, .txt, .html exports
├── notes/
│   ├── agents.md                    ← this file
│   ├── .meta.md                     ← documentation system guide
│   ├── .template.to-do.md
│   ├── to-do.md
│   ├── style/
│   │   └── commit_style.md
│   ├── features/
│   │   ├── attu-wiki.md
│   │   └── doom-bot.md
│   └── dev/
│       ├── dev_setup.md
│       └── testing.md
├── package.json                     ← pnpm workspace root
├── packages/                        ← shared workspace packages (phase 5)
├── pnpm-workspace.yaml
├── .editorconfig
├── .gitignore
├── LICENSE.md
└── README.md
```

---

## 11. Personality / Style

- lowercase inline comments; no trailing periods
- use semicolons or regular dashes (-); never em-dashes
- do not include any extraneous punctuation
- use american english spelling and grammar
- use spaces for indentation always; avoid formats that require tabs
- prefer brief statements over long explanations

---

## metadata

```yaml
last_updated: 25 April 2026
```
