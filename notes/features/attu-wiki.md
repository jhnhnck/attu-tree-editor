# attu wiki - project context

summary of the parent project for agents working in FamilyTreeEditor. the canonical source is `attu-wiki-dev/notes/agents.md`; this is a stable reference snapshot.

---

## what is attu wiki

self-hosted MediaWiki 1.44 wiki for the [Attu Project](https://attuproject.org). runs on Docker via FrankenPHP (Caddy + PHP 8.4). the repository lives at `/srv/services/attu-wiki-dev/` with a production copy at `/srv/services/attu-wiki-prod/`.

---

## container stack

| Service | Role |
| :--- | :--- |
| `mediawiki` | FrankenPHP app server (Caddy + PHP 8.4) on port 8080 |
| `database` | MariaDB 12; dev is ephemeral (loaded from SQL dump), prod uses persistent volume |
| `redis` | object cache, session store, parser cache, job queue backend |
| `scheduler` | Supercronic cron runner; dispatches background tasks via `attu_tasks.zsh` |
| `job-update` | init container; runs DB migrations before mediawiki and scheduler start |
| `yourls` | URL shortener at `links.attuproject.org` (prod only) |

web jobs are decoupled from page loads (`$wgJobRunRate = 0`). the scheduler drains the Redis-backed job queue every 2 minutes. all containers log to journald.

---

## dev vs prod

| | Dev | Prod |
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

| Directory | Description |
| :--- | :--- |
| `NovaDiscord/` | custom MediaWiki extension; posts wiki activity to Discord via webhooks; bind-mounted :ro into containers in dev |
| `MediaWiki/` | local MediaWiki source |
| `StopForumSpam/` | spam filtering |
| `FamilyTreeEditor/` | this project |

---

## wiki specifics

- **custom namespaces:** Story (100/101), Record (102/103), Dict (104/105); Talk namespace renamed to "Meta"
- **skin:** Citizen (from StarCitizenTools)
- **CAPTCHA:** Cloudflare Turnstile
- **SMTP:** ProtonMail
- **config:** `config/LocalSettings.php` reads secrets from `$_ENV`; `config/Caddyfile` for web server; `config/wiki.crontab` for scheduled tasks

---

## key operational patterns

- all secrets live in `.env` (gitignored); loaded by Docker Compose via `env_file`
- patches applied at build time to upstream code (`patches/` directory)
- `discord.sh` binary used for webhook alerts; SHA256-verified at build time
- certbot renewal runs in the scheduler container; uses mounted config from `/srv/services/certbot/`
- mediawiki maintenance scripts must run as `www-data` via `sudo --preserve-env -u www-data`

---

## metadata

```yaml
last_updated: 24 April 2026
```
