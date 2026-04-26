# bot integration - contract for doom-bot

contract document for the `/trees` slash-command group in doom-bot. the family tree editor server is the source of truth for tree storage, sharing, and identity-linking; the bot is the discord-side surface that drives those flows. read alongside `doom-bot.md` for the sibling-project context.

server side lives in [`apps/server/attu_tree/routers/bot.py`](../../apps/server/attu_tree/routers/) (phase 5). bot-side code goes in `attubot/commands/trees.py` in the doom-bot repo.

---

## 1. summary

the bot owns discord identity **and discord-side roles**. the family tree editor mirrors `{discord_id, discord_username, display_name, role}` per linked user but never authenticates against discord directly and never elects admins itself. role authority is bot/discord side: the bot ships the user's discord-side role list on every link, and the server picks the highest-precedence value it recognises (today: `admin` > `user`) and silently drops the rest.

all bot-to-server calls share a single hmac-signed channel.

three top-level user-facing commands plus admin variants:

| Command | Purpose |
| :--- | :--- |
| `/trees link code:<code>` | redeem a code shown by the web editor (shape: `AB-123456`) to link the discord user to a family-tree-editor account |
| `/trees show` | list the user's owned + shared trees with a "view" button per tree |
| `/trees share tree:<...> user:<...> role:<viewer\|editor>` | grant another discord user access to a tree the caller owns |
| `/trees unshare tree:<...> user:<...>` | revoke a grant |

a single bot deployment talks to both the dev and prod family-tree backends. routing is encoded in the link code itself (see [§3.1b](#31b-link-code-shape--dev--prod-routing)) so the user never has to know which environment they're on.

every reply is **ephemeral** - codes, tree names, and grant lists must never leak into shared channels. use `interaction.response.send_message(..., ephemeral=True)` (or pycord's equivalent).

---

## 2. hmac contract

shared secret env var (both sides): `DISCORD_BOT_HMAC_SECRET`. set to the same value in the bot's `.env` and the family-tree server's `.env`. rotate by deploying both at once.

every bot-to-server request carries two headers:

```
X-Attu-Timestamp: <unix-seconds-utc>
X-Attu-Signature: sha256=<hex>
```

signature payload is the literal byte string `"<X-Attu-Timestamp>.<raw_body>"` keyed by the hmac secret. the server rejects:

- missing or malformed headers (400)
- timestamp outside ±300s of server clock (401, replay protection)
- signature mismatch (401)

bot side: build the signature before sending; never log either header value.

---

## 3. server endpoints the bot calls

base url: read from `ATTU_TREES_API_BASE_URL`. default to the in-network docker dns name `http://attu-tree:8000` when running inside the shared compose stack; fall back to `https://attuproject.org/trees` for cross-network calls.

all bodies are json. all responses are json with `application/problem+json` for errors.

### 3.1 redeem a link code

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

`code` is what the user typed into discord. The server normalises it (uppercases and strips non-alphanumerics) before comparing against the stored canonical form, so `ab-123456`, `AB123456`, `ab 123456`, etc. all match. **Pass it through verbatim** if you like; or do the same normalisation on the bot side, doesn't matter.

`roles` semantics:

- the bot supplies the user's discord-side role names (whatever shape makes sense to the bot - guild role names, slugs, etc.).
- the server keeps only entries it recognises. as of today the recognised set is `{"admin", "user"}`; any other string is silently dropped, so the bot can ship new role names ahead of the server adopting them.
- precedence is by the server's known-roles ordering: if `"admin"` appears anywhere in the list, the user is admin; otherwise they're `user`.
- empty list (or field omitted) → `user`. **nobody is auto-promoted; if no admin role ever links, the system has no admins.**
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

### 3.1b link code shape + dev / prod routing

a code looks like `AB-123456`:

| Position | Charset | Meaning |
| :--- | :--- | :--- |
| `[0]` | one of 24 letters (A-Z minus I, O) | random, no meaning |
| `[1]` | dev: `X` or `Z`; prod: any of the other 22 letters (A-Z minus I, O, X, Z) | environment marker |
| `[2]` | literal `-` | display-only separator (servers strip it on input) |
| `[3..]` | 6 digits (0-9) | random |

a single bot deployment serves both the dev and prod editor instances. when a code arrives via `/trees link`, **the bot inspects the second alpha character to choose which backend to call**:

```python
# pseudo-code
def route_for(code: str) -> str:
    norm = ''.join(ch for ch in code.upper() if ch.isalnum())
    if len(norm) < 2:
        return PROD_BASE_URL  # malformed; let prod give the canonical 422
    return DEV_BASE_URL if norm[1] in {'X', 'Z'} else PROD_BASE_URL
```

then sign + post to that backend's `/api/bot/auth/link`. this keeps the user-visible flow identical between environments — they paste whatever code the editor showed them, no `--env` flag, no separate command.

reasoning behind the partition:

- only two letters (`X`, `Z`) are reserved for dev. dev sees less traffic; prod gets the larger search space (22 of 24 second-char letters). search space: prod ≈ 528M codes, dev ≈ 48M codes.
- the alphabet is otherwise the standard ambiguity-stripped set (no `I` / `O`).
- if a third environment ever lands (staging?), pick another letter or two and update both server (`auth/link.py`) and bot in lockstep.

### 3.1a recommended bot-side role mapping

the bot is free to model its own role taxonomy; the wire only cares about strings. a simple, shippable approach:

- on link, walk `member.roles` for the calling user in the relevant guild.
- map each guild role name (or id) through a bot-side config (e.g. `attu_role_mapping = { "Family Tree Admin": "admin" }`); pass the mapped values through.
- include `"user"` as a base entry only if you want to be explicit; the server defaults to `user` either way.

if multiple guilds carry conflicting roles, the bot decides whose verdict wins before sending. the server takes the request as authoritative.

### 3.2 list a user's trees

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

### 3.3 share a tree

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

### 3.4 revoke a grant

```http
DELETE /api/bot/trees/{tree_id}/grants
Content-Type: application/json

{
  "actor_discord_id": "111...",
  "target_discord_id": "222..."
}
```

success (204). same authorization rules as 3.3.

### 3.5 generate a view link

```http
POST /api/bot/trees/{tree_id}/view-link
Content-Type: application/json

{ "actor_discord_id": "111..." }
```

success (200):

```json
{ "url": "https://attuproject.org/trees/view/0192e3d8-..." }
```

returns the canonical read-only spa route. the user must be signed in to actually view it; if they're not, the spa shows the link-code dialog. **no signed bearer tokens flow through discord** - we keep the access model simple.

errors:

- 403 `no_access` - actor isn't owner / grantee / admin

---

## 4. data we need from each interaction

at minimum the bot must capture and forward:

| Field | Source (pycord) | Used for |
| :--- | :--- | :--- |
| `discord_id` | `interaction.user.id` (snowflake, send as string) | identity matching |
| `discord_username` | `interaction.user.global_name` (fall back to `interaction.user.name`) | mirrored for display until next link |
| `roles` | derived from `interaction.user.roles` in the relevant guild, mapped through the bot's config (see 3.1a) | mirrored to the user's role on every link |

for share/unshare, also capture the target user via discord's native user-picker option (so we get id + global_name cleanly without name-resolution races):

| Field | Source | Used for |
| :--- | :--- | :--- |
| `target_discord_id` | the user-option's `.id` | grant target |
| `target_discord_username` | the user-option's `.global_name` (fallback `.name`) | mirrored for the stub user row |

---

## 5. slash command shapes

register the group at the application level (not guild-scoped) so every server gets it.

### `/trees link`

| Option | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `code` | string | yes | shape: `AB-123456` (8 alphanumeric chars + dash); case-insensitive; the server normalises whatever the user typed |

the bot also captures the caller's discord roles (no user-supplied option) and forwards them as `roles: list[str]` per 3.1. **routing**: char[1] of the code (after stripping the dash) decides which backend to hit - see 3.1b.

ephemeral replies:

- success: `linked as **{display_name}**. return to the editor to start syncing.`
- expired: `that code expired. open the editor and click "sign in" to get a new one.`
- already used: `that code was already redeemed. if it wasn't you, generate a fresh one in the editor.`
- not found: `i don't recognize that code. double-check it in the editor.`

### `/trees show`

no options. ephemeral reply renders an embed listing trees with a row of buttons (one "view" per tree, max 5 shown; if more, a "show all" button paginates). each "view" button is a link button with the url from 3.5.

reply when not linked:

```
you haven't linked your account yet. run /trees link with a code from the editor first.
```

reply when linked but no trees:

```
no trees yet. open the editor to create one.
```

### `/trees share`

| Option | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `tree` | string (autocomplete) | yes | autocomplete from 3.2 results, value is the uuid, label is the name |
| `user` | user-picker | yes | discord-native picker |
| `role` | string-choice | yes | `viewer` or `editor` |

autocomplete: when the user starts typing, call 3.2 with the actor's discord id and filter client-side by substring. this keeps the user from typing uuids by hand.

replies:

- success: `shared **{tree_name}** with **{target_display}** as a {role}.`
- not owner: `you can only share trees you own.`
- not found: `that tree doesn't exist anymore.`

### `/trees unshare`

| Option | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `tree` | string (autocomplete) | yes | as above |
| `user` | user-picker | yes | |

reply on success: `removed **{target_display}**'s access to **{tree_name}**.`

---

## 6. configuration

bot-side config:

| Var | Purpose | Example |
| :--- | :--- | :--- |
| `DISCORD_BOT_HMAC_SECRET` | shared with **both** family-tree backends; signs every bot→server request. dev and prod use the same secret today (rotate together) | `<32-byte hex>` |
| `ATTU_TREES_DEV_BASE_URL` | dev backend base url; trailing slash optional | `http://attu-tree-dev:8000` or `https://attuproject.org/trees-dev` |
| `ATTU_TREES_PROD_BASE_URL` | prod backend base url | `http://attu-tree:8000` or `https://attuproject.org/trees` |

put these in `assets/attu-bot.toml` (the bot's tier-2 config), not `.env`, matching the configuration-tier rules in `doom-bot.md`. the public docker-compose service names `attu-tree` / `attu-tree-dev` resolve inside the shared `attu_dev` / `attu_prod` networks; cross-host setups should use the public urls instead.

the bot picks between the two URLs per request, based on the code's char[1] for `/trees link` (see 3.1b). for the other commands (`/trees show`, `/trees share`, `/trees unshare`) the bot needs another route signal, since those don't carry a code. simplest cut: pin those commands to **prod only** until the editor exposes an `/api/bot/users/{discord_id}/trees` query that searches across both backends. dev users can do everything *except* re-share / re-list through the bot until they re-link in prod.

if that's too restrictive, a follow-up option is to query both backends in parallel and merge the results. we'll cross that bridge when the bot ships.

---

## 7. error-handling conventions

- network/timeout to the server: `the family tree service isn't reachable right now. try again in a moment.`
- 401 (hmac failure): never expose this to the user; log + alert. user message: `something went wrong on our end.`
- unexpected 5xx: `something went wrong on our end. an admin has been notified.` + log to the bot's standard error channel.

never echo raw server error bodies into discord.

---

## 8. open questions for the bot team

- should `/trees show` paginate via buttons (current plan) or a select-menu? both work; pick one and stick with it.
- ~~per-guild admin command for role mutation~~ - resolved: admin role flows entirely through the discord-side role list on `/trees link`. there is no `/trees admin promote` and no web-side role mutation. to promote a user, give them the configured admin role on discord and have them re-run `/trees link`.

---

## metadata

```yaml
last_updated: 26 April 2026
status: contract-draft (server impl in phase 5; bot impl in a sibling pr)
changelog:
  - 26 April 2026 (round 1 hardening) - 3.1 now requires roles[]; admin role mutation is bot/discord side only; error codes corrected (all 422 with detail)
  - 26 April 2026 (link-code partition) - link codes are now `AB-123456`-shaped; second alpha char (X / Z = dev, otherwise = prod) lets a single bot deployment route /trees link to the right backend without an env flag. bot config picks up DEV + PROD base URLs.
```
