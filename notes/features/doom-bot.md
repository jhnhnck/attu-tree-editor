# doom-bot - project context

summary of the sibling project for agents working in FamilyTreeEditor. the canonical source is `/srv/services/doom-bot-dev/notes/agents.md`; this is a stable reference snapshot.

---

## what is doom-bot

internally named **AttuBot**; a Discord bot for the [Attu Project](https://attuproject.org) that automates in-universe timekeeping, year-transition announcements, wiki management, the egg collection mini-game, and a RAG-backed lore assistant. written in Python 3.13 and shipped as a Docker container.

two runnable modes, both launched from `attu-bot.py`:

- `bot` - the Discord client (pycord)
- `web` - a Quart-based admin web interface

---

## tech stack

| Layer | Tool |
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

| | Dev | Prod |
| :--- | :--- | :--- |
| worktree | `/srv/services/doom-bot-dev` | `/srv/services/doom-bot` |
| branch | `dev` (local-only, never pushed) | `trunk` |
| deploy | `git checkout trunk && git merge --ff-only dev && git push origin trunk` | pulled and rebuilt on the prod box |

---

## integration touch points relevant to FamilyTreeEditor

- **family trees** - `/link family` slash group lives in `attubot/commands/link.py`; commands: `family list`, `family set`, `family upload`, `family remove`. currently wraps FamilyEcho links and uploads.
- **haracalnde calendar** - shared in-universe calendar (12 months of 30 days, eras PC and TT). pure calendar math is in `attubot/client/calendar.py` (`get_year_status()`, `get_year_span()`, `get_next_year()`); behavior spec is in doom-bot's `notes/features/timekeeping.md`.
- **wiki client** - `attubot/wiki/` is the MediaWiki API consumer used by `/wiki` and the RAG ingestor; it consumes the same wiki the editor will publish to.
- **in-universe reminders** - `/remind` schedules messages for haracalnde dates; firing logic in `attubot/tasks/reminder.py`. relevant if the editor exposes per-person date events.
- **rag context** - the chat ingestor pulls wiki pages into Qdrant; any new editor-generated wiki content will be surfaced via `/ask` once ingested.

---

## configuration tiers

three tiers; nothing new belongs in `.env`:

1. **`.env`** - only `ATTU_CONFIG_FILE`
2. **`assets/attu-bot.toml`** - secrets and static config (tokens, db url, wiki credentials, webauthn, authorized guilds)
3. **MongoDB** - runtime guild-level settings (epoch, channels, roles, users, theme)

two version constants in `attubot/__init__.py`: `__schema__` (db migration version) and `__config_version__` (minimum compatible toml format).

---

## canonical reference notes

deeper specs in doom-bot's `notes/features/`:

- `eggs.md` - egg game behavior, storage, setup
- `starboard.md` - starboard embeds and storage
- `markers.md` - year-marker resolution and web api
- `timekeeping.md` - calendar math, epoch, rollover (most relevant here)
- `reminders.md` - in-universe date reminder fire-time computation
- `tasks.md` - task scheduler and BaseTask lifecycle
- `web.md` - web interface routes, auth, audit logging
- `attu_chat.md` - RAG architecture and decisions

---

## metadata

```yaml
last_updated: 24 April 2026
```
