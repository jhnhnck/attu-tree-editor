# FamilyTreeEditor

client-side svelte 5 + vite + tailwind v4 spa for viewing and editing family trees in the [Attu Project](https://attuproject.org) wiki universe, backed by a thin fastapi + sqlite service for autosave, sharing, and discord-bridged auth via [doom-bot](https://github.com/dervot/doom-bot). lives at `devel/FamilyTreeEditor/` inside the attu-wiki-dev deployment.

## stack

| layer | tool |
| --- | :--- |
| build | vite 6 |
| ui | svelte 5 (runes) |
| styling | tailwind css v4 |
| tree layout | four-pass ir pipeline + three pluggable engines (layered-hv, family-view, hyperbolic-lr) |
| GEDCOM | `read-gedcom` parser; hand-rolled serializer |
| FamilyScript | hand-rolled parser (import-only) |
| bundles | GEDZIP `.gdz` via `fflate` |
| local store | dexie (indexeddb) |
| zoom/pan | panzoom + custom controller |
| portraits | canvas-based cropper, webp via OffscreenCanvas |
| backend | fastapi + aiosqlite (uv-managed) |
| testing | vitest + playwright + pytest |

## repository layout

```text
FamilyTreeEditor/
├── apps/
│   ├── web/                 client-side svelte spa
│   └── server/              fastapi backend
├── packages/                shared workspace packages
├── examples/                sample .ged, .txt, family echo .html exports
├── notes/                   agent guidance, feature specs, dev process
├── data/                    runtime state + secrets (gitignored)
├── Dockerfile               production image
├── docker-compose.yml
├── trees-config.example.toml
└── README.md
```

## prerequisites

| tool | min version | install |
| :--- | :--- | :--- |
| node.js | 22 | `nvm install 22` |
| pnpm | 10 | `npm i -g pnpm` (user prefix; see [notes/dev/dev_setup.md](notes/dev/dev_setup.md)) |
| python | 3.13 | pyenv or system |
| uv | 0.11+ | `pip install --user uv` or astral installer |
| docker | 24+ | optional, for production image |

## install

```bash
pnpm install
pnpm server:setup
pnpm exec playwright install chromium
```

## common commands

| command | what it does |
| :--- | :--- |
| `pnpm dev` | vite dev server on `:5173` (proxies `/api` -> `:8000`) |
| `pnpm server:dev` | uvicorn `--reload` on `:8000` |
| `pnpm build` | production bundle in `apps/web/dist` |
| `pnpm test:unit` | vitest (unit + component) |
| `pnpm test:e2e` | playwright (chromium + mobile) |
| `pnpm lint` | eslint + prettier |
| `pnpm typecheck` | svelte-check + tsc |
| `pnpm server:test` | pytest |
| `pnpm server:lint` | ruff + basedpyright |
| `pnpm verify` | full ci sweep |

## hard rules

short form; see [CLAUDE.md](CLAUDE.md) and [notes/agents.md](notes/agents.md) §2 for the why.

1. no `git push` or prod deploy without explicit ask
2. no committed secrets; `data/` is gitignored, secrets live in `data/trees-config.toml` `[secrets]`
3. in-universe dates use `HaracalndeDate`, never `Date`
4. permissive schema: validate-as-finding, never reject (fiction includes time travel, self-couples, polygamy, ancestral cycles, asexual reproduction)
5. only export format is GEDZIP `.gdz`; `.ged` and FamilyScript `.txt` are import-only
6. every persisted artifact carries `schemaVersion`; bumping `CURRENT_SCHEMA_VERSION` requires a `Migration` in `domain/schema.ts`

## haracalnde dates

in-universe calendar: 12 months of 30 days (360-day year). written `day-month year ERA`, e.g. `15-3 5 PC`.

| era | direction | notes |
| :--- | :--- | :--- |
| **PC** (post calming) | forward from the grand calming | 1, 2, 3... |
| **TT** (turbulence time) | backward before the grand calming | 1 TT directly precedes 1 PC |

canonical math lives in doom-bot at `attubot/client/calendar.py`; mirrored client-side in `apps/web/src/lib/date/HaracalndeDate.ts` and server-side in `apps/server/attu_tree/calendar.py`.

## configuration

four tiers, no `.env` at runtime. each value lives in exactly one tier. see [notes/agents.md](notes/agents.md) §4 or the `config-tiers` skill for the full topology.

| tier | source | purpose |
| :--- | :--- | :--- |
| A | `data/trees-config.toml` (bind-mounted) | per-deployment values + secrets |
| B | `Dockerfile` | image-baked invariants (`VITE_BASE=/trees/`) |
| C | `docker-compose.yml` `environment:` | container runtime envs (`PYTHONUNBUFFERED=1`) |
| D | parent wiki `.env` via `env_file:` | network attachment (`ATTU_NETWORK`) only |

spa runtime values reach the browser via `window.__TREES_CONFIG__`, templated by fastapi into `index.html` on serve. one image works for any environment by swapping the toml.

## license

MIT. see [LICENSE.md](LICENSE.md).

## see also

- [CLAUDE.md](CLAUDE.md) - hard rules and pointers for agents
- [notes/agents.md](notes/agents.md) - architecture, configuration, conventions, design decisions
- [notes/dev/process.md](notes/dev/process.md) - phased-plan / phase-loop / ship-gate workflow
- [notes/dev/dev_setup.md](notes/dev/dev_setup.md) - one-time machine setup
- [notes/dev/testing.md](notes/dev/testing.md) - test layout, fixtures, running subsets
- [notes/features/attu-wiki.md](notes/features/attu-wiki.md) - parent wiki context
- [notes/features/doom-bot.md](notes/features/doom-bot.md) - discord bridge

---

## metadata

```yaml
last_updated: 24 May 2026
```
