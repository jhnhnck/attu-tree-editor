# attu wiki - context + integration

*context snapshot of the parent mediawiki project and the contract by which this editor lives under its domain. canonical wiki context lives in `attu-wiki-dev/notes/agents.md`; this is the editor-facing summary plus the routing / cookie / link wiring that ships on both sides.*

editor-side touch points:

- url builder: [`apps/tree-editor/src/lib/wiki/linkResolver.ts`](../../apps/tree-editor/src/lib/wiki/linkResolver.ts) (`wikiUrlFor(title, baseUrl?)`)
- compose unit: [`docker-compose.yml`](../../docker-compose.yml) (service `family-tree`, container `attu-tree`, joins network `attu_dev` / `attu_prod`)
- inspector ui: [`apps/tree-editor/src/lib/components/inspector/PersonalTab.svelte`](../../apps/tree-editor/src/lib/components/inspector/PersonalTab.svelte) (`wikiTitle` field + "view" link)

---

## what attu wiki is

self-hosted MediaWiki 1.44 wiki for the [Attu Project](https://attuproject.org). runs on Docker via FrankenPHP (Caddy + PHP 8.4). the repository lives at `/srv/services/attu-wiki-dev/` with a production copy at `/srv/services/attu-wiki-prod/`.

---

## container stack

| service | role |
| :--- | :--- |
| `mediawiki` | FrankenPHP app server (Caddy + PHP 8.4) on port 8080 |
| `database` | MariaDB 12; dev is ephemeral (loaded from SQL dump), prod uses persistent volume |
| `redis` | object cache, session store, parser cache, job queue backend |
| `scheduler` | Supercronic cron runner; dispatches background tasks via `attu_tasks.zsh` |
| `job-update` | init container; runs DB migrations before mediawiki and scheduler start |
| `yourls` | URL shortener at `links.attuproject.org` (prod only) |

web jobs are decoupled from page loads (`$wgJobRunRate = 0`). the scheduler drains the redis-backed job queue every 2 minutes. all containers log to journald.

---

## dev vs prod

|  | dev | prod |
| :--- | :--- | :--- |
| wiki port | `127.0.0.1:6008` | `127.0.0.1:6010` |
| server URL | `dev.attuproject.org` | `attuproject.org` |
| database | ephemeral (loaded from backup SQL) | persistent volume |
| redis | ephemeral | persistent volume |
| NovaDiscord | bind-mounted from `./devel/` for live editing | cloned at build time |
| scheduled tasks | simulated (printed, not run) | active |

`BUILD_TYPE` (set in `.env`) controls the active compose file and toggles dev behavior in `LocalSettings.php` via `$attuDevMode`.

---

## devel/ directory

projects under `attu-wiki-dev/devel/` are standalone git repos for local development of extensions and tools. the parent repo gitignores `devel/` entirely.

| directory | description |
| :--- | :--- |
| `NovaDiscord/` | custom MediaWiki extension; posts wiki activity to Discord via webhooks; bind-mounted :ro into containers in dev |
| `MediaWiki/` | local MediaWiki source |
| `StopForumSpam/` | spam filtering |
| `FamilyTreeEditor/` | this project |

---

## wiki specifics

- **custom namespaces**: Story (100/101), Record (102/103), Dict (104/105); Talk namespace renamed to "Meta"
- **skin**: Citizen (from StarCitizenTools)
- **CAPTCHA**: Cloudflare Turnstile
- **SMTP**: ProtonMail
- **config**: `config/LocalSettings.php` reads secrets from `$_ENV`; `config/Caddyfile` for web server; `config/wiki.crontab` for scheduled tasks

---

## key operational patterns

- all secrets live in `.env` (gitignored); loaded by Docker Compose via `env_file`
- patches applied at build time to upstream code (`patches/` directory)
- `discord.sh` binary used for webhook alerts; SHA256-verified at build time
- certbot renewal runs in the scheduler container; uses mounted config from `/srv/services/certbot/`
- mediawiki maintenance scripts run as `www-data` via `sudo --preserve-env -u www-data`

---

## routing - caddy + compose

the editor is reachable at `attuproject.org/trees/` (prod) and `dev.attuproject.org/trees/` (dev) because the mediawiki container's caddy strips `/trees/*` and forwards to `attu-tree:8000` on the shared docker network. no host-level caddy change is involved; everything happens inside `config/Caddyfile` of the wiki:

```caddyfile
:8080 {
    import max-body-100mb
    import root
    import logging

    handle_path /trees/* {
        reverse_proxy attu-tree:8000
    }

    ; ...rest of mediawiki config unchanged...
}
```

`handle_path` strips the `/trees` prefix before forwarding, so the tree service sees `/` and `/api/` as expected. no host port binding is needed on the editor side.

both `attu-wiki-dev/docker-compose.dev.yml` and `attu-wiki-dev/docker-compose.prod.yml` pull in the editor via `include:`:

```yaml
include:
  - path: ./devel/FamilyTreeEditor/docker-compose.yml
    project_directory: ./devel/FamilyTreeEditor
```

`ATTU_NETWORK` switches per environment in the wiki's `.env`:

| var | dev | prod |
| :--- | :--- | :--- |
| `ATTU_NETWORK` | `attu_dev` | `attu_prod` |

both networks are `attachable: true` on the wiki side; the family-tree service joins them as `external: true`. it does not need the database, redis, or the mediawiki container - only the network so caddy can resolve `attu-tree:8000`.

both services log to `journald`.

---

## cookies, cors, csp

### cookies

the editor's session cookie is `path=/trees/`, `samesite=strict`, `httponly`. since the editor lives under the same registrable domain as the wiki, no cross-site cookie hops happen - the user authenticates on `/trees/` and that session never travels to `/wiki/...`. the wiki and the editor have separate identity stories; nothing on the wiki side knows about `attu_session`.

### cors (editor -> wiki)

the editor autocompletes page titles via `https://attuproject.org/w/api.php?action=opensearch&search=...` from the browser. mediawiki's `api.php` returns `Access-Control-Allow-Origin: *` for anonymous `GET` when called with `&origin=*`, so no `LocalSettings.php` change is required. cross-origin `POST` would need `$wgCrossSiteAJAXdomains` but the editor doesn't issue any.

since the editor is served from the same origin as the wiki (the whole point of the `/trees/` prefix), the autocomplete fetch is same-origin anyway - cors only matters if someone runs the editor from a different host.

### csp / iframe embedding

neither side sets `Content-Security-Policy` / `X-Frame-Options` today. same-origin embeds (e.g. `/trees/view/<id>` inside `/wiki/Foo`) work without headers. cross-origin embeds (some external tool) would require a `frame-ancestors` allowlist on the editor's response and are out of scope.

---

## linking conventions

### editor -> wiki

`Person.wikiTitle` is a free-form string; `wikiUrlFor()` percent-encodes spaces -> underscores and prepends the configured base. the inspector "details" tab shows a "view ↗" anchor when the field is non-empty. if the wiki page exists the link works; if it doesn't, mediawiki's "create this page" flow handles it gracefully.

the base url is **runtime-injected**. fastapi templates a `<script>window.__TREES_CONFIG__ = {...}</script>` block into `index.html` on serve, populated from `[wiki].base_url` in `data/trees-config.toml`. one image works for any deployment by swapping the toml; no rebuild required. the linkResolver falls back to `VITE_WIKI_BASE_URL` for tests and to `https://attuproject.org` if neither is set. see [`agents.md`](../agents.md) §4 for the full configuration tier breakdown.

### wiki -> editor

humans paste an external link:

```text
[https://attuproject.org/trees/view/<uuid> Akarian royal house tree]
```

the bot api's `view-link` endpoint (see [`doom-bot.md`](doom-bot.md) §server endpoints) returns the canonical url programmatically. there is no cleaner shortcut.

a richer mechanism (`{{FamilyTree|<tree-id>}}` template that renders an inline preview card, links to the canonical view url, optionally embeds a small read-only canvas) is **shelved** as of 26 April 2026 - the original mediawiki-gadget plan is dropped, and a replacement is a future-idea entry in [`notes/to-do.md`](../to-do.md). candidate mechanisms when the work picks up:

1. **server-side parser function** in a small wiki extension (`Extension:AttuFamilyTree`)
   - registers `{{#familytree:tree_id}}` and `{{FamilyTree|...}}` templates
   - calls the editor's summary endpoint server-side, caches in mediawiki's parser cache
   - works for unauthenticated wiki readers; cached output; no js required for the basic preview
   - needs a php extension to live in `attu-wiki-dev/repos/` and a build-time clone
2. **gadget** (the original plan) - pure js, fetched from the editor at render time
   - no wiki rebuild needed for changes; no parser-cache invalidation pain
   - javascript-only, breaks for noscript readers; csp gymnastics if/when we tighten it
3. **iframe transclusion** - dumb wiki template that just emits an `<iframe src="/trees/embed/<id>">`
   - simplest possible; nothing to ship on the wiki side
   - cls/seo ugly; no inline preview text; needs a public embed endpoint anyway

both (1) and (3) need either a public `GET /api/trees/<id>/summary` endpoint or a per-tree "publish" toggle. both are deferred.

---

## operational notes

### backups

the editor's `./data/` directory (bind-mounted to `/app/data` in the container) holds `attu_tree.db` (sqlite + WAL) plus `trees-config.toml`. it lives outside `attu-wiki-backup.sql` and outside the wiki's dump cycle. the wiki's `/srv/services/attu-wiki-dev/scripts/` backup scripts do not touch it - the family-tree service ships its own snapshot story.

### logs

```bash
journalctl CONTAINER_NAME=attu-tree -f          # editor + api
journalctl CONTAINER_NAME=mediawiki -f          # wiki
```

### environment toggles

`BUILD_TYPE` (the wiki-side dev/prod toggle) does not propagate into the family-tree container; the family-tree service uses its own `[app].environment = "dev"|"prod"` field in `data/trees-config.toml` (see [`apps/server/attu_tree/settings.py`](../../apps/server/attu_tree/settings.py)). they are independent: a dev wiki can run against a prod family-tree backend, though usually wouldn't.

### ingestion (future)

if/when doom-bot's RAG ingestor (`attubot/wiki/`) starts pulling family-tree summaries into qdrant, that is a doom-bot config change, not a wiki change. the wiki itself never needs to know about the editor for ingestion to work.

---

## see also

- [doom-bot.md](doom-bot.md) - sibling discord bot context + `/trees` slash-command contract
- [`agents.md`](../agents.md) §4 - configuration tier breakdown (toml + Dockerfile + compose + parent .env)
- [`dev/dev_setup.md`](../dev/dev_setup.md) - local docker run + bind-mount layout

---

## metadata

```yaml
last_updated: 30 June 2026
```
