# wiki integration - what the attu wiki needs to change to host the trees

contract document for the wiki side of the family tree editor. the editor is a self-contained spa + fastapi service that lives **under the wiki's domain** (`attuproject.org/trees/` in prod, `dev.attuproject.org/trees/` in dev). this note enumerates the changes that need to land in the parent `attu-wiki-dev` repo and on the host so the editor is reachable, links flow both directions, and the editor can autocomplete page titles. read alongside [`attu-wiki.md`](attu-wiki.md) for parent-project context.

editor-side touch points:

- url builder: [`apps/web/src/lib/wiki/linkResolver.ts`](../../apps/web/src/lib/wiki/linkResolver.ts) (`wikiUrlFor(title, baseUrl?)`)
- compose unit: [`docker-compose.yml`](../../docker-compose.yml) (the family-tree service, container name `attu-tree`, joins network `attu_dev` / `attu_prod`)
- inspector ui: [`apps/web/src/lib/components/inspector/DetailsTab.svelte`](../../apps/web/src/lib/components/inspector/DetailsTab.svelte) (`wikiTitle` field + "view ↗")

---

## 1. summary

the wiki is the **identity surface** for people in trees: a `Person.wikiTitle` on the editor side resolves to `https://attuproject.org/wiki/<Title_With_Underscores>` via `wikiUrlFor()`. the reverse direction (which trees mention this person) is currently **not** wired - the original mediawiki-gadget plan is shelved, and a replacement mechanism is a future-idea entry in `notes/to-do.md`. so today the integration is asymmetric:

- **editor → wiki**: every person can carry a wiki title; the inspector exposes a "view ↗" button. no wiki-side change needed for this except making sure pages exist.
- **wiki → editor**: humans drop a `[https://attuproject.org/trees/view/<id> ...]` external link, or eventually a `{{FamilyTree}}` template (see [§5](#5-future-template--gadget-shape)).

the integration is mostly about **plumbing** at the moment: caddy routing, compose-include wiring, and a couple of header/cors verifications. the conceptual / template work is phase-6+.

---

## 2. routing - caddy + compose

### 2.1 mediawiki container caddyfile (`config/Caddyfile`)

all external traffic already flows through the mediawiki container's caddy (the host-level reverse proxy passes everything to `:6010` / `:6008`). the right place to peel off `/trees/*` is therefore inside `config/Caddyfile`, where it can forward to `attu-tree:8000` on the shared docker network - no host-level caddy change needed.

add a `handle_path /trees/*` block as the **first handler** inside the `:8080` site block:

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

`handle_path` strips the `/trees` prefix before forwarding, so the tree service sees `/` and `/api/` as expected. the service is addressed by docker container name (`attu-tree`) on the shared `attu_dev` / `attu_prod` network - no host port binding is needed.

**editor-side note:** the `ports:` mapping in `FamilyTreeEditor/docker-compose.yml` (`127.0.0.1:${FAMILY_TREE_PORT:-6024}:8000`) is not required for this routing path. the editor team should remove it; all traffic reaches the container via `attu-tree:8000` on the docker network. `FAMILY_TREE_PORT` and the `ports:` key can be dropped from `docker-compose.yml`.

### 2.2 parent compose include

both `attu-wiki-dev/docker-compose.dev.yml` and `attu-wiki-dev/docker-compose.prod.yml` need an `include:` directive so the family-tree service comes up alongside the wiki:

```yaml
include:
  - path: ./devel/FamilyTreeEditor/docker-compose.yml
    project_directory: ./devel/FamilyTreeEditor
```

set `ATTU_NETWORK` per environment in the wiki's `.env` (same file, different machine per env):

| Var | Dev | Prod |
| :--- | :--- | :--- |
| `ATTU_NETWORK` | `attu_dev` | `attu_prod` |

the `attu_dev` / `attu_prod` networks are both declared `attachable: true` in the wiki's compose, so the family-tree service can join them as `external: true`. it does not need the database, redis, or the mediawiki container itself - it only needs the network so the mediawiki caddy can resolve `attu-tree:8000` and so future server-side calls (autocomplete proxy, ingestion, etc.) can reach `mediawiki:8080` without leaving the docker network.

both services already log to `journald`, so no logging plumbing changes.

---

## 3. cookies, cors, csp

### 3.1 cookies

the editor's session cookie is set with `path=/trees/`, `samesite=strict`, `httponly`. since the editor lives under the same registrable domain as the wiki, **no cross-site cookie hops happen** - the user authenticates on `/trees/` and that session never travels to `/wiki/...`. this is intentional: the wiki and the editor have separate identity stories. nothing on the wiki side has to know about `attu_session`.

### 3.2 cors (editor → wiki)

the editor wants to autocomplete page titles via `https://attuproject.org/w/api.php?action=opensearch&search=...` from the browser (open to-do; see `notes/to-do.md` phase 4). mediawiki's `api.php` defaults to `Access-Control-Allow-Origin: *` for `GET` only when called with `&origin=*` (or with an explicit `$wgCrossSiteAJAXdomains`).

simplest cut: use `&origin=*` on the editor request and rely on mediawiki's anonymous-cross-site-get default. that needs no `LocalSettings.php` change. document this on the editor side when the autocomplete lands.

if we ever need `POST` cross-origin (we don't yet), add to `LocalSettings.php`:

```php
$wgCrossSiteAJAXdomains = [ 'attuproject.org', 'dev.attuproject.org' ];
```

but as long as the editor is served from the **same origin** as the wiki (which is the whole point of the `/trees/` prefix), there is no cors involved at all - the autocomplete fetch is same-origin. cors only matters if someone runs the editor from a different host.

### 3.3 csp / iframe embedding

if the wiki ever wants to embed an editor view inline (e.g. a tree card on a dynasty page), it has to send `Content-Security-Policy` or `X-Frame-Options` headers that allow the editor origin. today neither side sets either - mediawiki's default is unset, and the family-tree container does not emit a frame-ancestors directive. before shipping any embed, decide:

1. **same-origin embed (`/trees/view/<id>` inside `/wiki/Foo`)** - works today, no header changes needed; both share the registrable domain *and* the host.
2. **cross-origin embed (some external tool, e.g. obsidian or a doc site)** - would require a `Content-Security-Policy: frame-ancestors` allowlist on the editor's response and is out of scope for v1.

flag this when an actual embed lands; don't pre-emptively configure csp.

---

## 4. linking conventions

### 4.1 editor → wiki (today)

`Person.wikiTitle` is a free-form string; `wikiUrlFor()` percent-encodes spaces → underscores and prepends the configured base. the inspector "Details" tab shows a "view ↗" anchor when the field is non-empty. no wiki-side action required - if the page exists, the link works; if it doesn't, mediawiki's "create this page" flow handles it gracefully.

the base url is **runtime-injected**. the fastapi server templates a `<script>window.__TREES_CONFIG__ = {...}</script>` block into `index.html` on serve, populated from `[wiki].base_url` in `data/trees-config.toml`. one image works for any deployment by swapping the toml; no rebuild required. the linkResolver falls back to `VITE_WIKI_BASE_URL` for tests and to `https://attuproject.org` if neither is set. see `notes/agents.md` §4.

### 4.2 wiki → editor (today)

humans paste an external link:

```text
[https://attuproject.org/trees/view/<uuid> Akarian royal house tree]
```

`{tree_id}/view-link` from the bot api (see `bot-integration.md` §3.5) returns the canonical url. there is no cleaner shortcut yet.

### 4.3 wiki → editor (planned)

once the wiki integration mechanism is decided (see §5), we want a `{{FamilyTree|<tree-id-or-slug>}}` template that:

- renders an inline preview card (name, owner, last-updated, member count)
- links to the canonical view url
- optionally embeds a small read-only canvas via iframe

this requires either a public, unauthenticated `GET /api/trees/<id>/summary` endpoint (does not exist today; trees are auth-gated) or a per-tree "publish" toggle that flips a tree to public-readable. both are deferred.

---

## 5. future template / gadget shape

the original plan was a mediawiki gadget bundle (gadget-FamilyTree.js) injected via `MediaWiki:Common.js`. that is **shelved** as of 26 April 2026 (see `notes/to-do.md` future-idea entry "decide and prototype a wiki integration story"). when we revisit, candidate mechanisms in rough preference order:

1. **server-side parser function in a small wiki extension** (`Extension:AttuFamilyTree`)
   - registers `{{#familytree:tree_id}}` and `{{FamilyTree|...}}` templates
   - calls the editor's summary endpoint server-side, caches in mediawiki's parser cache
   - pros: works for unauthenticated wiki readers; cached output; no js required for the basic preview
   - cons: needs a php extension to live in `attu-wiki-dev/repos/` and a build-time clone; ties the wiki release cycle to the editor's
2. **gadget (originally planned)** - pure-js, fetched from the editor at render time
   - pros: no wiki rebuild needed for changes; no parser-cache invalidation pain
   - cons: javascript-only, breaks for noscript readers; CSP gymnastics if/when we tighten it
3. **transclusion via iframe template** - dumb wiki template that just emits an `<iframe src="/trees/embed/<id>">`
   - pros: simplest possible; nothing to ship on the wiki side
   - cons: cls/seo ugly; no inline preview text; needs a public embed endpoint anyway

option 1 is most likely to win. spec belongs in this file when the work picks up.

---

## 6. operational notes

### 6.1 dev-vs-prod sanity

the family-tree service is **not** automatically loaded by `docker compose up` until the parent compose file gets the `include:` block (see §2.2). until then, run it standalone via `cd devel/FamilyTreeEditor && docker compose up -d` - it joins the wiki's network because of `external: true`, so wiki tools can still talk to `attu-tree:8000` if needed.

`BUILD_TYPE` (the wiki-side dev/prod toggle) does **not** propagate into the family-tree container; the family-tree service uses its own `[app].environment = "dev"|"prod"` field in `data/trees-config.toml` (see `apps/server/attu_tree/settings.py`). they're independent: you could run a dev wiki against a prod family-tree backend, though you usually wouldn't want to.

### 6.2 backups

the editor's `./data/` directory (bind-mounted to `/app/data` in the container) holds `attu_tree.db` (sqlite + WAL) plus `trees-config.toml`. it lives outside `attu-wiki-backup.sql` and outside the wiki's dump cycle. the wiki's `/srv/services/attu-wiki-dev/scripts/` backup scripts do not touch it - the family-tree service ships its own snapshot story (or will; not yet implemented). flag this in any backup doc updates.

### 6.3 logs

both services log to `journald`. filter via:

```bash
journalctl CONTAINER_NAME=attu-tree -f          # editor + api
journalctl CONTAINER_NAME=mediawiki -f          # wiki
```

### 6.4 ingestion (future)

if/when doom-bot's RAG ingestor (`attubot/wiki/`) starts pulling family-tree summaries into qdrant, that's a doom-bot config change, not a wiki change. the wiki itself never needs to know about the editor for ingestion to work.

---

## 7. open items for the wiki team

these are the concrete tasks blocking go-live; mirrored in `notes/to-do.md` phase 5:

| Task | Where | Effort |
| :--- | :--- | :--- |
| add `handle_path /trees/*` block | `attu-wiki-dev/config/Caddyfile` | low |
| add `include:` directive for the family-tree compose | `attu-wiki-dev/docker-compose.{dev,prod}.yml` + `docker-compose.yml` | low |
| set `ATTU_NETWORK` per env | `attu-wiki-dev/.env` | trivial |
| remove `ports:` + `FAMILY_TREE_PORT` from editor compose | `FamilyTreeEditor/docker-compose.yml` | trivial |
| (optional) add `$wgCrossSiteAJAXdomains` for non-`origin=*` autocomplete | `config/LocalSettings.php` | low; only if needed |

deferred / future:

- decide template-vs-gadget-vs-extension for `{{FamilyTree}}` rendering
- spec a `GET /api/trees/<id>/summary` (or a "publish" flag) once we know the rendering mechanism
- backup script for the editor's `./data/` bind mount to slot into the existing wiki dump rotation

---

## metadata

```yaml
last_updated: 26 April 2026
status: contract-draft (routing + compose plumbing done; editor-side ports cleanup pending; template/gadget mechanism shelved pending §5 decision)
```
