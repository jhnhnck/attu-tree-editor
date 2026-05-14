# code-review — FamilyTreeEditor specifics

repo-specific things to look for during the six passes. organized by pass.

## pass 1 — correctness & logic (gotchas)

- **layout pass purity**: `apps/web/src/lib/layout/` runs in a Web Worker. no DOM, no `window`, no closures over `$state`. wire types must round-trip through `postMessage` (no functions, no `Map` instances unless serialized).
- **`exactOptionalPropertyTypes`**: `target.field = undefined` is a type error when `field?:` is declared. use `setOptional(target, key, value)` (helper in `domain/types`).
- **`noUncheckedIndexedAccess`**: `arr[i]` is `T | undefined` here.
- **HMAC time skew**: ±300s; clock resync issues cause silent rejection. timestamp upper-bound clamp matters.
- **link-code race**: `UPDATE … WHERE consumed_at IS NULL` + `INSERT … ON CONFLICT(discord_id) DO UPDATE` is the correct shape. never read-then-write across `await`.
- **autosave revision race**: read of `revision` then `await fetch(...)` then write is broken — new revision can land in between, overwriting. capture revision into the request body; server revision-checks via `apply_save`.
- **dexie writes**: round-trip through `JSON.parse(JSON.stringify(...))` to drop svelte 5 proxies. images must be `Uint8Array`, not `Blob` (fake-indexeddb mangles Blob).
- **discord snowflakes**: always `str` on the wire. precision loss above 2^53 is real.
- **dates**: any `new Date()` in domain code? in-universe dates must use `HaracalndeDate` (rule 5). gregorian helpers are tooltip-only.
- **mutation vs immutability**: domain code (`apps/web/src/lib/domain/`) returns new objects. svelte 5 `$state` proxies leak across `JSON.parse(JSON.stringify(...))` — keep dexie persistence clean.
- **errors**: throws vs result types. validate-as-finding (rule 7) for permissive domain checks; `Result` discriminated union for parser/validator boundaries.

## pass 3 — bugs commonly seen here

high-volume past bug patterns to cross-check against:

- **`transition-colors` on hot paths** — causes `CSSTransition` markers and GPU-non-composited repaints. tree canvas + zoom-affected components must use `transition-opacity` or no transition. (`PersonNode` learned this twice.)
- **per-frame `setProperty`** — inline `style:foo={bar}` on N nodes during zoom forces N×frame style flushes. hoist to a CSS custom property on the canvas-stage host. (the `--node-border-width` fix.)
- **`getBoundingClientRect` in event handlers** — synchronous layout. cache `hostW`/`hostH` from a `ResizeObserver`.
- **undo-history shape** — store snapshots → heap pressure → GCMajor pauses. delta diffs (`domain/treeDiff.ts`) is the right shape.
- **`{#each}` reconciliation churn** — lists keyed by index in a viewport-culled scroll cause Svelte to detach/reattach. key by stable id.
- **`window.__treeDebug` always-on** — exposing the full IR to a global is a memory leak. gate behind the debug toggle.
- **f-string column lists in sql** — readable but a dynamic-sql audit finding even when input is hard-coded. parameterized queries.
- **CORS allowlist with `allow_credentials=True`** — never wildcard. a startup assertion is on the to-do list; flag if absent.
- **session cookie `samesite`** — must be `strict`. caddy's `/trees/` proxy makes the cookie path fixed.
- **blob-size enforcement** — both the request body and the merge path must enforce `settings.server.max_tree_blob_bytes`. a 413 response is the contract.

## pass 6 — security threat model

complements (does not replace) the built-in `/security-review` slash command — that one is generic OWASP-style; this one is FamilyTreeEditor-specific.

| area | what to check |
|---|---|
| **HMAC (bot ↔ server)** | `X-Attu-Timestamp` ±300s skew + upper-bound clamp; signature comparison via constant-time compare; signing key from `settings.secrets.discord_bot_hmac_secret`, never logged, never echoed |
| **link codes** | dev/prod partition (char[1]: dev = X/Z, prod = the other 22); race-safe atomic redeem (`UPDATE WHERE consumed_at IS NULL`); upsert on `(discord_id)` for the bind step; rate-limit on `/api/auth/start` is on the to-do list — flag if mutated |
| **session cookies** | `httponly=True`, `secure=True` (prod), `samesite='strict'`, `path=/trees/` from `SESSION_COOKIE_PATH` constant |
| **CORS** | explicit allowlist in `settings.server.cors_origins`; never wildcard with `allow_credentials=True`; new origin = an audit-log finding |
| **blob size** | `settings.server.max_tree_blob_bytes` enforced on `TreeCreateRequest.blob` and in `apply_save`; 413 on overflow |
| **role mutation** | only via discord roles fed through `/api/bot/auth/link`. server code that writes `users.role` from any other path is an audit finding. |
| **secrets exposure** | `[secrets]` toml table never logged, never reflected in `_templated_index` injection, never echoed in error responses. f-string a secret into a log line = bug. |
| **spa runtime injection** | `window.__TREES_CONFIG__` carries only public values. `wikiBaseUrl`, `environment` — yes. anything from `[secrets]` — no, ever. |
| **sql injection / dynamic sql** | parameterized queries everywhere. f-string column lists are an audit finding even with hard-coded inputs. |
| **path traversal** | `apps/server/attu_tree/main.py` `spa()` already guards `..` traversal via `candidate.resolve().relative_to(_STATIC_DIR.resolve())`; new file-serving paths must do the same. |
| **xss in spa** | tree titles, person names, wiki titles are user-controlled. svelte's default escaping is your friend; `{@html …}` requires audit-grade justification. |
| **hmac body coverage** | the canonical hmac string covers `(method, path, timestamp, body_sha256)`. partial coverage = replay vector. |

every finding here gets `[blocker]` unless impact is genuinely low.

## pass 4 — tests (cases worth adding)

specific edge cases:

- empty tree, single-node tree, self-couple, cycle, same-sex pairing (rule 7), multi-component graphs, schema migration round-trip, unicode in names, stress (N=1800 nodes for layout perf).
- **mocks** — server: outbound http via `respx`. database: real aiosqlite, not a mock.
- **e2e gaps** — any user-visible flow crossing module boundaries deserves playwright. drag-drop import, autosave conflict toast, view-link copy, link-code redemption.
- **flakiness sources** — `await tick()` after dom mutation; `vi.useFakeTimers()` with autosave debounce; race between `treeStore.hydrate()` and an in-flight save.

cite specific test files to add or extend; "more tests" alone is not a finding.

## pass 5 — documentation drift

- **`notes/agents.md`** — sections 4 (config), 8 (design decisions), 9 (schema). if a tier was changed, agents.md §4 must agree.
- **`notes/features/`** — every stable feature gets a spec doc.
- **`notes/to-do.md`** — completed items moved to the completed section with a date stamp; new items added with priority + effort.
- **`README.md`** — stack list, common commands. usually stable.

flag drift; suggest specific edits. "update the docs" is not a finding.
