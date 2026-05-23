# dev setup

one-time install steps for new contributors. expect ~5 minutes start to finish on a warm machine.

---

## prerequisites

| tool | min version | notes |
| :--- | :--- | :--- |
| node | 22 | use nvm or fedora's `dnf install nodejs22` |
| pnpm | 10 | install once; see below |
| python | 3.13 | matches doom-bot; pyenv recommended |
| uv | 0.11+ | astral installer or `pip install --user uv` |
| docker | 24+ | optional; only for the backend container |

---

## installing pnpm without root

`npm i -g pnpm` fails on most boxes because `/usr/local` is root-owned. install into a user prefix instead:

```bash
mkdir -p $HOME/.local/npm-global
npm config set prefix "$HOME/.local/npm-global"
npm install -g pnpm
ln -s $HOME/.local/npm-global/bin/pnpm $HOME/.local/bin/pnpm
```

`$HOME/.local/bin` is already on the default `PATH` from `.zshenv`. a fresh shell should now find `pnpm`.

---

## one-time bootstrap

```bash
cd /srv/services/attu-wiki-dev/devel/FamilyTreeEditor

# javascript side
pnpm install
pnpm exec playwright install chromium

# python side
cd apps/server
uv sync
cd ../..

# sanity
pnpm verify
```

`pnpm verify` runs typecheck + lint + the no-hyperbolic-imports gate + unit tests + build + server setup + server lint + server tests in order. expect green on a clean checkout.

---

## daily workflow

| command | what it does |
| :--- | :--- |
| `pnpm dev` | vite dev server on :5173 with hmr; proxies `/api` -> `:8000` |
| `pnpm server:dev` | uvicorn with `--reload` on :8000 |
| `pnpm test:unit` | vitest run (web only) |
| `pnpm test:unit:watch` | vitest watch mode |
| `pnpm test:e2e` | playwright (chromium + mobile) |
| `pnpm server:test` | pytest |
| `pnpm format` | prettier write |
| `pnpm verify` | the ci sweep |

run web and server in two terminals; the vite proxy handles cors during development. for production previews use `pnpm build && pnpm exec vite preview`.

---

## docker

```bash
docker compose up --build
# http://127.0.0.1:8000/health  (or via the wiki caddy at https://dev.attuproject.org/trees/)
```

the dockerfile is multi-stage (uv builder + slim runtime) and runs as a non-root user. the image bakes `VITE_BASE=/trees/` and serves both the spa and the api from a single container; the wiki's caddy strips `/trees/` before proxying. the same image works in the attu-wiki-dev compose stack via the include directive in [`notes/features/attu-wiki.md`](../features/attu-wiki.md).

---

## configuration

four sources, no `.env` at runtime. see [`notes/agents.md`](../agents.md) §4 for the full tier breakdown.

**deployment hosts** copy [`trees-config.example.toml`](../../trees-config.example.toml) to `data/trees-config.toml`, fill in the secrets, and `chmod 600` the live file. the docker-compose `./data:/app/data` bind mount makes it visible to the container.

**dev outside docker** can either:

```bash
# 1) point pydantic-settings at a local toml
TREES_CONFIG_PATH=./trees-config.toml pnpm server:dev
```

or skip the toml entirely; defaults are dev-friendly (sqlite at `/app/data/attu_tree.db` won't exist, so set `database_url` in a local toml, or override via `TREES_CONFIG_PATH`). when running the spa via `pnpm dev`, vite serves at `/` (no `/trees/` prefix); the linkResolver falls back to the build-time `VITE_WIKI_BASE_URL` env var or the default `https://attuproject.org`.

never commit `data/trees-config.toml` - it carries `[secrets]`. ask the operator for live values.

---

## metadata

```yaml
last_updated: 23 May 2026
```
