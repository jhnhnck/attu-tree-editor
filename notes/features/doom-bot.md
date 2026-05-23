# doom-bot - context + integration

*context snapshot of the sibling discord bot and the contract for its `/trees` slash-command group. canonical doom-bot context lives in `/srv/services/doom-bot-dev/notes/agents.md`; this is the editor-facing summary plus the wire contract that ships on both sides.*

server side lives in [`apps/server/attu_tree/routers/bot.py`](../../apps/server/attu_tree/routers/). bot-side code lives in `attubot/commands/trees.py` in the doom-bot repo.

---

## what doom-bot is

internally named **AttuBot**; a Discord bot for the [Attu Project](https://attuproject.org) that automates in-universe timekeeping, year-transition announcements, wiki management, the egg collection mini-game, and a RAG-backed lore assistant. written in Python 3.13 and shipped as a Docker container.

two runnable modes, both launched from `attu-bot.py`:

- `bot` - the Discord client (pycord)
- `web` - a Quart-based admin web interface

---

## tech stack

| layer | tool |
| :--- | :--- |
| discord client | pycord |
| web admin | Quart (async Flask) |
| database | MongoDB-compatible; runs on FerretDB in this deployment |
| vector store | Qdrant (for `/ask`) |
| embeddings | sentence-transformers (`all-MiniLM-L6-v2`) |
| reranker | CrossEncoder |
| llm backend | llama.cpp via OpenAI-compatible HTTP |
| linting | ruff (python), eslint (js), basedpyright |

---

## dev vs prod

|  | dev | prod |
| :--- | :--- | :--- |
| worktree | `/srv/services/doom-bot-dev` | `/srv/services/doom-bot` |
| branch | `dev` (local-only, never pushed) | `trunk` |
| deploy | `git checkout trunk && git merge --ff-only dev && git push origin trunk` | pulled and rebuilt on the prod box |

---

## integration touch points relevant to FamilyTreeEditor

- **family trees** - `/trees` slash group lives in `attubot/commands/trees.py` (see contract below). a legacy `/link family` group in `attubot/commands/link.py` still wraps FamilyEcho links and uploads.
- **haracalnde calendar** - shared in-universe calendar (12 months of 30 days, eras PC and TT). pure calendar math is in `attubot/client/calendar.py` (`get_year_status()`, `get_year_span()`, `get_next_year()`); behavior spec is in doom-bot's `notes/features/timekeeping.md`.
- **wiki client** - `attubot/wiki/` is the MediaWiki API consumer used by `/wiki` and the RAG ingestor; it consumes the same wiki the editor publishes to.
- **in-universe reminders** - `/remind` schedules messages for haracalnde dates; firing logic in `attubot/tasks/reminder.py`. relevant if the editor exposes per-person date events.
- **rag context** - the chat ingestor pulls wiki pages into Qdrant; any new editor-generated wiki content is surfaced via `/ask` once ingested.

---

## bot configuration tiers

three tiers; nothing new belongs in `.env`:

1. **`.env`** - only `ATTU_CONFIG_FILE`
2. **`assets/attu-bot.toml`** - secrets and static config (tokens, db url, wiki credentials, webauthn, authorized guilds, plus the editor base urls and shared hmac secret described under "bot-side configuration" below)
3. **MongoDB** - runtime guild-level settings (epoch, channels, roles, users, theme)

two version constants in `attubot/__init__.py`: `__schema__` (db migration version) and `__config_version__` (minimum compatible toml format).

---

## the /trees slash command group

the bot owns discord identity **and discord-side roles**. the editor mirrors `{discord_id, discord_username, display_name, role}` per linked user but never authenticates against discord directly and never elects admins itself. role authority is bot/discord side: the bot ships the user's discord-side role list on every link, and the server picks the highest-precedence value it recognises (today: `admin` > `user`) and silently drops the rest.

all bot-to-server calls share a single hmac-signed channel.

four top-level user-facing commands:

| command | purpose |
| :--- | :--- |
| `/trees link code:<code>` | redeem a code shown by the web editor (shape: `AB-123456`) to link the discord user to a family-tree-editor account |
| `/trees show` | list the user's owned + shared trees with a "view" button per tree |
| `/trees share tree:<...> user:<...> role:<viewer\|editor>` | grant another discord user access to a tree the caller owns |
| `/trees unshare tree:<...> user:<...>` | revoke a grant |

a single bot deployment talks to both the dev and prod family-tree backends. routing is encoded in the link code itself (see [link code shape + routing](#link-code-shape--routing)) so the user never has to know which environment they're on.

every reply is **ephemeral** - codes, tree names, and grant lists must never leak into shared channels. use `interaction.response.send_message(..., ephemeral=True)` (or pycord's equivalent).

---

## hmac contract

shared secret env var (both sides): `DISCORD_BOT_HMAC_SECRET`. set to the same value in the bot's config and the family-tree server's `data/trees-config.toml` `[secrets]`. rotate by deploying both at once.

every bot-to-server request carries two headers:

```text
X-Attu-Timestamp: <unix-seconds-utc>
X-Attu-Signature: sha256=<hex>
```

signature payload is the literal byte string `"<X-Attu-Timestamp>.<raw_body>"` keyed by the hmac secret. the server rejects:

- missing or malformed headers (400)
- timestamp outside ±300s of server clock (401, replay protection)
- timestamp implausibly out of range (`ts < 0` or `ts > 10_000_000_000`, i.e. year 2286) (400)
- signature mismatch (401)

bot side: build the signature before sending; never log either header value.

---

## server endpoints

base url: read from `ATTU_TREES_API_BASE_URL` (or the dev/prod variants below). default to the in-network docker dns name `http://attu-tree:8000` when running inside the shared compose stack; fall back to `https://attuproject.org/trees` for cross-network calls.

all bodies are json. all responses are json with `application/problem+json` for errors.

### redeem a link code

```http
POST /api/bot/auth/link
Content-Type: application/json

{
  "code": "AB-123456",
  "discord_id": "123456789012345678",
  "discord_username": "haradar",
  "roles": ["admin"]
}
```

`code` is what the user typed into discord. the server normalises it (uppercases and strips non-alphanumerics) before comparing against the stored canonical form, so `ab-123456`, `AB123456`, `ab 123456` all match. pass it through verbatim or normalise on the bot side; both work.

`roles` semantics:

- the bot supplies the user's discord-side role names (whatever shape makes sense to the bot - guild role names, slugs, etc.).
- the server keeps only entries it recognises. as of today the recognised set is `{"admin", "user"}`; any other string is silently dropped, so the bot can ship new role names ahead of the server adopting them.
- precedence is by the server's known-roles ordering: if `"admin"` appears anywhere in the list, the user is admin; otherwise `user`.
- empty list (or field omitted) -> `user`. **nobody is auto-promoted; if no admin role ever links, the system has no admins.**
- the role is **re-applied on every link**, not just on first sign-in. a user demoted on the discord side loses admin the next time they re-run `/trees link` (and likewise gains it). there is no other path for changing a user's role.

success (200):

```json
{ "display_name": "Haradar Karn" }
```

errors (all return `422 Unprocessable Entity` with a `detail` field):

- `code_not_found` - never issued or already cleaned up
- `code_expired` - past 10-minute window
- `code_already_used` - someone redeemed it (possibly the same user from another channel)

bot uses `display_name` in the ephemeral confirmation text.

### link code shape + routing

a code looks like `AB-123456`:

| position | charset | meaning |
| :--- | :--- | :--- |
| `[0]` | one of 24 letters (A-Z minus I, O) | random, no meaning |
| `[1]` | dev: `X` or `Z`; prod: any of the other 22 letters | environment marker |
| `[2]` | literal `-` | display-only separator (servers strip it on input) |
| `[3..]` | 6 digits (0-9) | random |

a single bot deployment serves both the dev and prod editor instances. when a code arrives via `/trees link`, the bot inspects the second alpha character to choose which backend to call:

```python
# pseudo-code
def route_for(code: str) -> str:
    norm = ''.join(ch for ch in code.upper() if ch.isalnum())
    if len(norm) < 2:
        return PROD_BASE_URL  # malformed; let prod give the canonical 422
    return DEV_BASE_URL if norm[1] in {'X', 'Z'} else PROD_BASE_URL
```

then sign + post to that backend's `/api/bot/auth/link`. the user-visible flow is identical between environments - they paste whatever code the editor showed them, no `--env` flag, no separate command.

partition rationale:

- only two letters (`X`, `Z`) are reserved for dev. dev sees less traffic; prod gets the larger search space (22 of 24 second-char letters). prod ≈ 528M codes, dev ≈ 48M codes.
- the alphabet is otherwise the standard ambiguity-stripped set (no `I` / `O`).
- a third environment (staging?) would pick another letter or two and require lockstep updates to `auth/link.py` server-side and the bot config.

### recommended bot-side role mapping

the bot is free to model its own role taxonomy; the wire only cares about strings. a simple, shippable approach:

- on link, walk `member.roles` for the calling user in the relevant guild.
- map each guild role name (or id) through a bot-side config (e.g. `attu_role_mapping = { "Family Tree Admin": "admin" }`); pass the mapped values through.
- include `"user"` as a base entry only if you want to be explicit; the server defaults to `user` either way.

if multiple guilds carry conflicting roles, the bot decides whose verdict wins before sending. the server takes the request as authoritative.

### list a user's trees

```http
GET /api/bot/users/123456789012345678/trees
```

success (200):

```json
{
  "trees": [
    {
      "id": "0192e3d8-7c1c-7e80-aabb-ccddeeff0011",
      "name": "Akarian Royal House",
      "role": "owner",
      "updated_at": "2026-04-26T18:30:42Z"
    }
  ]
}
```

`role` is one of `owner`, `editor`, `viewer`. id is a uuid v7. errors:

- 404 `user_not_linked` - the discord user has never run `/trees link`; bot prompts them to do so

### share a tree

```http
POST /api/bot/trees/{tree_id}/grants
Content-Type: application/json

{
  "actor_discord_id": "111...",
  "target_discord_id": "222...",
  "target_discord_username": "yarakn",
  "role": "editor"
}
```

success (200):

```json
{ "user_id": "0192e3d8-...", "role": "editor" }
```

server checks the actor owns the tree (or is admin). errors:

- 403 `not_owner` - actor doesn't own it and isn't admin
- 404 `tree_not_found`
- 400 `invalid_role` - role must be `viewer` or `editor`

if `target_discord_id` has no user row yet, the server creates a stub user (the grant becomes active the first time that target runs `/trees link`). the bot does not need to special-case this.

### revoke a grant

```http
DELETE /api/bot/trees/{tree_id}/grants
Content-Type: application/json

{
  "actor_discord_id": "111...",
  "target_discord_id": "222..."
}
```

success (204). same authorization rules as share.

### generate a view link

```http
POST /api/bot/trees/{tree_id}/view-link
Content-Type: application/json

{ "actor_discord_id": "111..." }
```

success (200):

```json
{ "url": "https://attuproject.org/trees/view/0192e3d8-..." }
```

returns the canonical read-only spa route. the user must be signed in to actually view it; if they are not, the spa shows the link-code dialog. **no signed bearer tokens flow through discord** - the access model stays simple.

errors:

- 403 `no_access` - actor isn't owner / grantee / admin

---

## interaction capture

at minimum the bot must capture and forward:

| field | source (pycord) | used for |
| :--- | :--- | :--- |
| `discord_id` | `interaction.user.id` (snowflake, send as string) | identity matching |
| `discord_username` | `interaction.user.global_name` (fall back to `interaction.user.name`) | mirrored for display until next link |
| `roles` | derived from `interaction.user.roles` in the relevant guild, mapped through the bot's config | mirrored to the user's role on every link |

for share/unshare, also capture the target user via discord's native user-picker option (so we get id + global_name cleanly without name-resolution races):

| field | source | used for |
| :--- | :--- | :--- |
| `target_discord_id` | the user-option's `.id` | grant target |
| `target_discord_username` | the user-option's `.global_name` (fallback `.name`) | mirrored for the stub user row |

---

## slash command shapes

register the group at the application level (not guild-scoped) so every server gets it.

### `/trees link`

| option | type | required | notes |
| :--- | :--- | :--- | :--- |
| `code` | string | yes | shape: `AB-123456` (8 alphanumeric chars + dash); case-insensitive; the server normalises whatever the user typed |

the bot also captures the caller's discord roles (no user-supplied option) and forwards them as `roles: list[str]`. char[1] of the code (after stripping the dash) decides which backend to hit.

ephemeral replies:

- success: `linked as **{display_name}**. return to the editor to start syncing.`
- expired: `that code expired. open the editor and click "sign in" to get a new one.`
- already used: `that code was already redeemed. if it wasn't you, generate a fresh one in the editor.`
- not found: `i don't recognize that code. double-check it in the editor.`

### `/trees show`

no options. ephemeral reply renders an embed listing trees with a row of buttons (one "view" per tree, max 5 shown; if more, a "show all" button paginates). each "view" button is a link button with the url from the view-link endpoint.

reply when not linked:

```text
you haven't linked your account yet. run /trees link with a code from the editor first.
```

reply when linked but no trees:

```text
no trees yet. open the editor to create one.
```

### `/trees share`

| option | type | required | notes |
| :--- | :--- | :--- | :--- |
| `tree` | string (autocomplete) | yes | autocomplete from the list-trees endpoint, value is the uuid, label is the name |
| `user` | user-picker | yes | discord-native picker |
| `role` | string-choice | yes | `viewer` or `editor` |

autocomplete: when the user starts typing, call list-trees with the actor's discord id and filter client-side by substring. avoids users typing uuids by hand.

replies:

- success: `shared **{tree_name}** with **{target_display}** as a {role}.`
- not owner: `you can only share trees you own.`
- not found: `that tree doesn't exist anymore.`

### `/trees unshare`

| option | type | required | notes |
| :--- | :--- | :--- | :--- |
| `tree` | string (autocomplete) | yes | as above |
| `user` | user-picker | yes |  |

reply on success: `removed **{target_display}**'s access to **{tree_name}**.`

---

## bot-side configuration

| var | purpose | example |
| :--- | :--- | :--- |
| `DISCORD_BOT_HMAC_SECRET` | shared with **both** family-tree backends; signs every bot->server request. dev and prod use the same secret today (rotate together) | `<32-byte hex>` |
| `ATTU_TREES_DEV_BASE_URL` | dev backend base url; trailing slash optional | `http://attu-tree-dev:8000` or `https://attuproject.org/trees-dev` |
| `ATTU_TREES_PROD_BASE_URL` | prod backend base url | `http://attu-tree:8000` or `https://attuproject.org/trees` |

these live in `assets/attu-bot.toml` (the bot's tier-2 config), not `.env`, matching the configuration-tier rules above. the public docker-compose service names `attu-tree` / `attu-tree-dev` resolve inside the shared `attu_dev` / `attu_prod` networks; cross-host setups should use the public urls instead.

the bot picks between the two urls per request, based on the code's char[1] for `/trees link`. for the other commands (`/trees show`, `/trees share`, `/trees unshare`) the bot needs another route signal, since those don't carry a code. current cut: pin those commands to **prod only** until the editor exposes a cross-backend user-trees search. dev users can do everything *except* re-share / re-list through the bot until they re-link in prod.

---

## error-handling conventions

- network/timeout to the server: `the family tree service isn't reachable right now. try again in a moment.`
- 401 (hmac failure): never expose to the user; log + alert. user message: `something went wrong on our end.`
- unexpected 5xx: `something went wrong on our end. an admin has been notified.` + log to the bot's standard error channel.

never echo raw server error bodies into discord.

---

## see also

- [attu-wiki.md](attu-wiki.md) - parent mediawiki project context + editor routing / cors / link wiring
- doom-bot's own canonical specs (in `/srv/services/doom-bot-dev/notes/features/`): `timekeeping.md` (most relevant - calendar math + rollover), `eggs.md`, `starboard.md`, `markers.md`, `reminders.md`, `tasks.md`, `web.md`, `attu_chat.md`

---

## metadata

```yaml
last_updated: 23 May 2026
```
