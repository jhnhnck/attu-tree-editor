---
name: config-tiers
description: FamilyTreeEditor four-tier deployment config system (toml + Dockerfile + compose + parent .env) and the SPA runtime-injection mechanism. trigger when editing `apps/server/attu_tree/settings.py`, `apps/server/attu_tree/main.py` (the `_templated_index` injection), `Dockerfile`, `docker-compose.yml`, `apps/web/vite.config.ts`, `apps/web/src/vite-env.d.ts` (the `TreesRuntimeConfig` interface), `apps/web/src/lib/wiki/linkResolver.ts`, `data/trees-config.toml`, or `trees-config.example.toml`; when adding a new config knob, env var, secret, or deployment flag; when answering "where do I add this setting", "how does the SPA see this value", "where do secrets go", "why is there no .env"; when wiring a new SPA-visible runtime value through `window.__TREES_CONFIG__`. canonical for the config-tier topology - if it diverges from `notes/agents.md` §4, this skill wins.
---

# config tier system

scope: how every per-deployment value flows from the operator into the running container, why there is no `.env` at runtime, and where to put a new knob.

four tiers, no overlap. each value lives in **exactly one** tier.

```
tier A: data/trees-config.toml      [bind-mounted; per-deployment + secrets]
tier B: Dockerfile                  [baked into image; deployment invariants]
tier C: docker-compose.yml env:     [runtime knobs; not secrets, not per-deploy]
tier D: parent attu-wiki .env       [values inherited from the wiki host]
```

precedence inside the server: `init_settings > TomlConfigSettingsSource > env_settings > file_secret_settings`. env vars only matter for dev-outside-docker via `TREES_CONFIG_PATH=...`.

## decision tree: where does my new value go?

ask the questions in order; first yes wins.

1. **is it a credential / secret?** → tier A under `[secrets]`. file must stay `chmod 600`. never log, never expose to spa, never echo into a log line. `apps/server/attu_tree/settings.py` `SecretsConfig` model.
2. **does it differ between dev / prod / staging?** → tier A under the appropriate table (`[app]`, `[server]`, `[wiki]`, …). default in the pydantic model; sample value in `trees-config.example.toml`.
3. **is it a deployment invariant baked into the image?** (e.g. `VITE_BASE=/trees/`, `mkdir /app/data`, `chown app:app`, python runtime envs, the python version) → tier B, in `Dockerfile`.
4. **is it a runtime knob that's neither a secret nor per-deployment?** → tier C, `docker-compose.yml` `environment:`. today only `PYTHONUNBUFFERED=1` lives here.
5. **does it flow from the parent attu-wiki host?** (network names, host-level toggles) → tier D, `env_file:` on the docker-compose include. today only `ATTU_NETWORK` flows through here.
6. **is it ephemeral test/dev override?** → `TREES_CONFIG_PATH` env var pointing at a different toml; do not invent new env vars.

if none fit, you probably have an architecture question, not a config question. flag and ask.

## tier A: `data/trees-config.toml`

the canonical home of per-deployment config. `apps/server/attu_tree/settings.py` reads it via `pydantic-settings`'s `TomlConfigSettingsSource`. nested toml tables map to nested `BaseModel` sub-fields automatically.

### structure (current schema)

```toml
[app]
environment = "dev"          # "dev" | "prod"; encoded into link-code char[1]

[server]
cors_origins = [...]          # explicit allowlist; never wildcard with allow_credentials=True
max_tree_blob_bytes = 100_000_000
public_base_url = "https://dev.attuproject.org/trees"
database_url = "sqlite+aiosqlite:////app/data/attu_tree.db"

[secrets]
discord_bot_hmac_secret = "..."
session_secret = "..."

[wiki]
base_url = "https://dev.attuproject.org"
```

### adding a new field (server-only)

two steps. that's the whole dance.

1. add the field to the relevant nested `BaseModel` in `apps/server/attu_tree/settings.py` (e.g. `ServerConfig`, `WikiConfig`, `AppConfig`, `SecretsConfig`). give it a sensible default.
2. add a sample value with a comment to `trees-config.example.toml` so a fresh deploy has a working stub.

that is it. **no plumbing required**; pydantic-settings discovers the new field on next startup. (the doom-bot six-step "settings.py + env_file + compose env + dataclass + plumbing + tests" dance does **not** apply here.)

if a brand-new top-level table is needed, also add the attribute on the `Settings` class itself.

### adding a new top-level table

```python
class FeatureFlags(BaseModel):
    enable_x: bool = False


class Settings(BaseSettings):
    # … existing fields …
    feature_flags: FeatureFlags = FeatureFlags()
```

```toml
[feature_flags]
enable_x = true
```

## tier B: `Dockerfile`

deployment invariants baked into the image. read-only at runtime.

current contents:
- `VITE_BASE=/trees/` for the spa build (caddy mounts the spa under `/trees/`; the topology is fixed, so this is hard-coded)
- non-root user creation (`app:app`, uid/gid 1000)
- `mkdir -p /app/data && chown app:app` so the bind mount is writable
- `UV_COMPILE_BYTECODE=1`, `UV_LINK_MODE=copy`, `PYTHONUNBUFFERED=1`, `PYTHONDONTWRITEBYTECODE=1`
- `EXPOSE 8000`
- `HEALTHCHECK` against `/health`

never put per-deployment values here. if you find yourself wanting to `ARG ENVIRONMENT=prod` to switch behavior, that value belongs in tier A instead.

## tier C: `docker-compose.yml` `environment:`

today: only `PYTHONUNBUFFERED=1`. **no secrets**, no `env_file:` on the service. session cookie path is fixed via the `SESSION_COOKIE_PATH = '/trees/'` class constant in `Settings`, not a knob.

if you're adding to `environment:`, double-check it doesn't fit tier A. the bar is high: tier C is for values that are runtime-affecting but neither per-deployment nor sensitive — basically just `PYTHONUNBUFFERED`-class knobs.

## tier D: parent attu-wiki `.env`

`/srv/services/attu-wiki-dev/.env` lives one level up. the docker-compose include in the parent stack reads it. today only `ATTU_NETWORK` (resolved as `attu_dev` on dev hosts, `attu_prod` on prod) flows through.

new values here are rare. they should describe the host environment, not the editor; if it's editor-specific, push it down to tier A.

## SPA-visible config: runtime injection via `window.__TREES_CONFIG__`

the spa is built once and shipped as a single image to any environment. environment-specific values are **runtime-injected** into `index.html` by fastapi:

```python
# apps/server/attu_tree/main.py
@functools.cache
def _templated_index() -> str:
    raw = _INDEX_PATH.read_text(encoding='utf-8')
    config = {
        'wikiBaseUrl': settings.wiki.base_url,
        'environment': settings.app.environment,
    }
    injection = f'<script>window.__TREES_CONFIG__ = {json.dumps(config)};</script>'
    return raw.replace('</head>', f'    {injection}\n</head>', 1)
```

caching: `@functools.cache` means the templated index is computed once per process. settings are immutable post-startup, so this is free. tests that override `settings` must call `_templated_index.cache_clear()` after the override.

### adding a new SPA-visible value (5 steps)

1. **server side**: add to the appropriate `BaseModel` in `settings.py` (tier A).
2. **toml**: add a sample value to `trees-config.example.toml` and document it.
3. **inject**: add the field to the `config` dict inside `_templated_index()` in `apps/server/attu_tree/main.py`. lowerCamelCase the key (matches the spa convention).
4. **type it**: add the field to the `TreesRuntimeConfig` interface in `apps/web/src/vite-env.d.ts`. mark it `?:` if missing-during-tests is tolerated.
5. **read it**: in the spa, `window.__TREES_CONFIG__?.yourValue` first; build-time `import.meta.env.VITE_YOUR_VALUE` is **only** for vitest fallback (so unit tests don't have to template the index). the runtime path always wins.

example: `linkResolver.ts` reads `window.__TREES_CONFIG__?.wikiBaseUrl` first, then `import.meta.env.VITE_WIKI_BASE_URL` for tests, then a hard-coded default. that ordering is the rule.

### never do this

- **don't bake env vars into the production spa build.** any `import.meta.env.X` outside test-fallback paths defeats "one image, any environment".
- **don't expose `[secrets]` to the spa.** anything that goes through `_templated_index` is visible to every user. the injection dict gets its own narrow type for a reason.
- **don't add a tier C env for an SPA value.** it would not reach the spa anyway (the build is sealed); it just adds noise. add it to tier A and inject.

## dev-outside-docker

```bash
TREES_CONFIG_PATH=apps/server/trees-config.dev.toml uv run uvicorn attu_tree.main:app --reload
```

`TREES_CONFIG_PATH` is the only env var the server checks intentionally. it points at the toml; everything else flows from there.

if `TREES_CONFIG_PATH` is unset and `/app/data/trees-config.toml` doesn't exist (the normal case for `pnpm server:dev`), pydantic falls through to the model defaults — that's why `pnpm server:dev` boots without a config file.

## tests

server tests in `apps/server/tests/conftest.py` override `settings` directly via attribute mutation; no toml touched. when a test changes `settings.wiki.base_url` after `_templated_index()` was called, it must `_templated_index.cache_clear()` to drop the stale html.

## file map

| where | what |
|---|---|
| `apps/server/attu_tree/settings.py` | `BaseSettings` + `TomlConfigSettingsSource` wiring; nested `BaseModel`s |
| `apps/server/attu_tree/main.py` | `_templated_index()` injection point; cors middleware reads `settings.server.cors_origins` |
| `data/trees-config.toml` | live deployment config (gitignored, `chmod 600`) |
| `trees-config.example.toml` | sample/template; checked in |
| `Dockerfile` | tier B baked invariants |
| `docker-compose.yml` | tier C runtime env |
| `apps/web/src/vite-env.d.ts` | `TreesRuntimeConfig` interface |
| `apps/web/src/lib/wiki/linkResolver.ts` | canonical example of the runtime-first read pattern |

## related skills

- **`pydantic`** — `BaseSettings`, `TomlConfigSettingsSource`, `extra='ignore'`, `settings_customise_sources`. every config-touching change should also obey the pydantic skill.
- **`feature-completion`** — section "configuration" walks the same ground from a checklist angle; if you've added a config field, walk both.

## why this exists (one paragraph)

before this rework, deployment values lived in three places: the server's `.env`, vite's `.env.production`, and ad-hoc compose env vars. the spa baked `VITE_API_BASE_URL` and `VITE_WIKI_BASE_URL` at build time, so we needed one image per environment. consolidating to a bind-mounted toml + runtime injection means: one image, swap toml per host. the four-tier discipline keeps secrets out of the image, out of git, and out of the spa bundle.
