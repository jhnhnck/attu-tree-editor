# bot integration - contract for doom-bot

contract document for the `/trees` slash-command group in doom-bot. the family tree editor server is the source of truth for tree storage, sharing, and identity-linking; the bot is the discord-side surface that drives those flows. read alongside `doom-bot.md` for the sibling-project context.

server side lives in [`apps/server/attu_tree/routers/bot.py`](../../apps/server/attu_tree/routers/) (phase 5). bot-side code goes in `attubot/commands/trees.py` in the doom-bot repo.

---

## 1. summary

the bot owns discord identity. the family tree editor mirrors `{discord_id, discord_username, display_name}` per linked user but never authenticates against discord directly. all bot-to-server calls share a single hmac-signed channel.

three top-level user-facing commands plus admin variants:

| Command | Purpose |
| :--- | :--- |
| `/trees link code:<code>` | redeem a 6-char code shown by the web editor to link the discord user to a family-tree-editor account |
| `/trees show` | list the user's owned + shared trees with a "view" button per tree |
| `/trees share tree:<...> user:<...> role:<viewer\|editor>` | grant another discord user access to a tree the caller owns |
| `/trees unshare tree:<...> user:<...>` | revoke a grant |

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
  "code": "K7M3QX",
  "discord_id": "123456789012345678",
  "discord_username": "haradar"
}
```

success (200):

```json
{ "display_name": "Haradar Karn" }
```

errors:

- 404 `code_not_found` - never issued or already cleaned up
- 410 `code_expired` - past 10-minute window
- 409 `code_already_used` - someone redeemed it (possibly the same user from another channel)

bot uses `display_name` in the ephemeral confirmation text.

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
| `code` | string | yes | 6 chars, alphanumeric, case-insensitive on the bot side; pass uppercase to the server |

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

bot-side env vars:

| Var | Purpose | Example |
| :--- | :--- | :--- |
| `DISCORD_BOT_HMAC_SECRET` | shared with the server; signs every bot→server request | `<32-byte hex>` |
| `ATTU_TREES_API_BASE_URL` | server base url; trailing slash optional | `http://attu-tree:8000` |

put these in `assets/attu-bot.toml` (the bot's tier-2 config), not `.env`, matching the configuration-tier rules in `doom-bot.md`. the public docker-compose service name `attu-tree` resolves inside the shared `attu_dev` / `attu_prod` network; cross-host setups should use the public `https://attuproject.org/trees` url.

---

## 7. error-handling conventions

- network/timeout to the server: `the family tree service isn't reachable right now. try again in a moment.`
- 401 (hmac failure): never expose this to the user; log + alert. user message: `something went wrong on our end.`
- unexpected 5xx: `something went wrong on our end. an admin has been notified.` + log to the bot's standard error channel.

never echo raw server error bodies into discord.

---

## 8. open questions for the bot team

- should `/trees show` paginate via buttons (current plan) or a select-menu? both work; pick one and stick with it.
- do we want a per-guild admin command (`/trees admin promote user:<...>`) that calls the family-tree-editor admin api? scoped to discord users with a configured admin role on the bot side. **deferred** - admin role mutations are web-only at first.

---

## metadata

```yaml
last_updated: 26 April 2026
status: contract-draft (server impl in phase 5; bot impl in a sibling pr)
```
