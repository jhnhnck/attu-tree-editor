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

`pnpm verify` runs typecheck + lint + unit tests + build + server lint + server tests in order. expect green on a clean checkout.

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

## docker (server only)

```bash
cd apps/server
docker compose up --build
# http://127.0.0.1:8000/health
```

the dockerfile is multi-stage (uv builder + slim runtime) and runs as a non-root user. it mirrors the doom-bot pattern; the same image works in the attu-wiki-dev compose stack via an external network override (added in phase 5).

---

## environment variables

phase 0 has no required env vars. phase 5 introduces:

```bash
# apps/server/.env (gitignored)
DATABASE_URL=sqlite+aiosqlite:///./data/attu_tree.db
DISCORD_BOT_HMAC_SECRET=<shared with doom-bot>
SESSION_SECRET=<random 32 bytes>
WIKI_BASE_URL=https://dev.attuproject.org
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

```bash
# apps/web/.env.development (gitignored)
VITE_API_BASE_URL=/api
VITE_WIKI_BASE_URL=https://dev.attuproject.org
```

never commit `.env`. ask the user for current secret values when needed.

---

## metadata

```yaml
last_updated: 25 April 2026
```
