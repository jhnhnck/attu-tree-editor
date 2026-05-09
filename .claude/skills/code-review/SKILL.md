---
name: code-review
description: FamilyTreeEditor multi-pass code review of uncommitted changes, a branch vs main, or a specific file/PR. trigger when the user asks to "review", "audit", "check this code", "look for bugs", "is this any good", "anything wrong", "second pass"; before opening a PR; before merging; after a large refactor lands; when asked for a security audit on the editor's threat model. complements `feature-completion` (mechanical checklist) by adding qualitative judgment - logic correctness, design quality, bugs, gaps in test coverage, doc drift, and project-specific security review. defers to existing style skills (`commit-style`, `comment-style`, `file-header`, `pydantic`, `design-and-ui-changer`) rather than restating their rules.
---

# code review

scope: a structured, multi-pass review producing a written report. not a checklist — judgment work. invoke the listed style skills as needed; do not re-derive their rules here.

## how to run a review

### 1. establish scope

ask, or infer from context, **what** is being reviewed:

- **uncommitted changes** — `git diff HEAD` and `git status` give the picture. fastest, most common.
- **branch vs main** — `git diff main...HEAD` and `git log --oneline main..HEAD`. use for end-of-feature reviews.
- **specific files / directories** — `git log -p <path>` for history; `Read` the current state.
- **a github PR** — `gh pr view <num>` and `gh pr diff <num>`.

if scope is ambiguous, ask once. don't review the wrong tree.

### 2. read before judging

`Read` every changed file in full, not just the diff. context outside the hunk often determines correctness (a function might be called from somewhere the diff doesn't show; a removed branch might still have callers). budget for this — half the value of a review is catching what the author looked at and dismissed.

for large diffs, partition: layout + canvas, server + auth, persistence + sync, ui + components, tests + docs. review one partition at a time.

### 3. produce a report

structure findings under fixed headings (skip a heading if empty):

- **Correctness & logic** — bugs, off-by-one, null handling, async sequencing, races
- **Design** — abstractions, naming, scope creep, dead code
- **Tests** — gaps in coverage; specific cases to add
- **Documentation** — drift between code and notes/agents.md / notes/features / README / to-do.md
- **Security** — see "security pass" below; project-specific
- **Style** — only when a style skill rule is violated; cite the skill, don't restate

each finding: `- file:line — one-sentence problem · one-sentence fix`. severity tags `[blocker] / [important] / [nit]` go in front when more than ~5 findings exist. blockers stop a merge; nits are polish.

end the report with a one-line **bottom line**: "ship it", "ship after blockers", "rework needed".

## the six passes

run each pass over the scoped changes. they're orthogonal — a finding usually slots cleanly into one.

### pass 1 — correctness & logic

ask of every changed function:

- **inputs**: what types are accepted? are nullables actually checked? does `noUncheckedIndexedAccess` apply (`arr[i]` is `T | undefined` here)?
- **paths**: every branch reachable? early returns leave invariants intact?
- **async ordering**: an `await` between read and write opens a TOCTOU window. is the read still valid? (autosave's revision check is the canonical example; new sync logic must follow the same pattern.)
- **mutation vs. immutability**: domain code (`apps/web/src/lib/domain/`) returns new objects. does this respect that? svelte 5 `$state` proxies leak across `JSON.parse(JSON.stringify(...))` boundaries — has dexie persistence been kept clean?
- **time / dates**: any `new Date()` in domain code? in-universe dates must use `HaracalndeDate` (rule 5). gregorian helpers are tooltip-only.
- **errors**: throws vs. result types. validate-as-finding (per rule 7) for permissive domain checks; `Result` discriminated union for parser/validator boundaries.

repo-specific gotchas:

- **layout pass purity**: `apps/web/src/lib/layout/` runs in a Web Worker. no DOM, no `window`, no closures over `$state`. wire types must round-trip through `postMessage` (no functions, no `Map` instances unless serialized).
- **`exactOptionalPropertyTypes`**: `target.field = undefined` is a type error when `field?:` is declared. use `setOptional(target, key, value)` (helper exists; see `domain/types`).
- **HMAC time skew**: ±300s; clock resync issues cause silent rejection. timestamp upper-bound clamp matters.
- **link-code race**: `UPDATE … WHERE consumed_at IS NULL` + `INSERT … ON CONFLICT(discord_id) DO UPDATE` is the correct shape. never read-then-write across `await`.
- **dexie writes**: round-trip through `JSON.parse(JSON.stringify(...))` to drop svelte 5 proxies. images must be `Uint8Array`, not `Blob` (fake-indexeddb mangles Blob).
- **Discord snowflakes**: always `str` on the wire. losing precision above 2^53 is a real bug, not a hypothetical.

### pass 2 — design

read each new module / component as if you'd never seen it. judge:

- **single responsibility** — does the file do one thing the name describes? a 600-line component named after a tiny feature is a smell.
- **abstraction shape** — three similar lines is fine; a generic `withRetry<T>` for one caller is premature. flag and suggest inlining.
- **naming** — does the identifier read as the thing it is? `data`, `info`, `helper`, `util` are nearly always wrong.
- **state placement** — is store state where stores live (`apps/web/src/lib/state/`)? local component state where it belongs (component `$state`)? cross-component state via prop drilling vs. store?
- **dead code** — removed callers but kept the function? unused imports? half-finished branches? delete; don't leave breadcrumbs.
- **hard-coded constants** — three uses of `42` is a constant. one use of `42` with a comment is fine.
- **action registry vs ad-hoc handlers** — every UI action goes through `commands.ts`. an inline keybinding handler bypassing the registry is a regression.

ask: "if i had to maintain this in six months, would the diff make sense?" if no, say what would.

### pass 3 — bugs commonly seen here

cross-check the change against these high-volume past bug patterns:

- **`transition-colors` on hot paths** — causes `CSSTransition` markers and GPU-non-composited repaints. tree canvas + zoom-affected components must use `transition-opacity` or no transition. (`PersonNode` learned this twice.)
- **per-frame `setProperty`** — inline `style:foo={bar}` on N nodes during zoom forces N×frame style flushes. hoist to a CSS custom property on the canvas-stage host. (the `--node-border-width` fix.)
- **`getBoundingClientRect` in event handlers** — synchronous layout. cache `hostW`/`hostH` from a `ResizeObserver`.
- **undo-history shape** — store snapshots ⟹ heap pressure ⟹ GCMajor pauses. delta diffs (`domain/treeDiff.ts`) is the right shape.
- **`{#each}` reconciliation churn** — lists keyed by index in a viewport-culled scroll cause Svelte to detach/reattach. always key by stable id.
- **`window.__treeDebug` always-on** — exposing the full IR to a global is a memory leak. gate behind the debug toggle.
- **f-string column lists in sql** — readable but a dynamic-sql audit finding even when the input is hard-coded. use parameterized queries.
- **CORS allowlist with `allow_credentials=True`** — never wildcard. a startup assertion is on the to-do list; flag if absent.
- **session cookie `samesite`** — must be `strict`. caddy's `/trees/` proxy makes the cookie path fixed.
- **blob-size enforcement** — both the request body and the merge path must enforce `settings.server.max_tree_blob_bytes`. a 413 response is the contract.

### pass 4 — tests

**defer to `feature-completion`** for the canonical "did you add tests" checklist. this pass does the qualitative work the checklist can't:

- **coverage shape** — a test that exercises only the happy path passes the checkbox but doesn't catch the bug. ask: which inputs would break this? does any test cover them?
- **edge cases worth adding** — empty tree, single-node tree, self-couple, cycle, same-sex pairing (rule 7), multi-component graphs, schema migration round-trip, unicode in names, stress (N=1800 nodes for layout perf).
- **mocks** — server: outbound http via `respx`. database: real aiosqlite, not a mock (the audit says: integration over mock).
- **e2e gaps** — any user-visible flow crossing module boundaries deserves a playwright test. drag-drop import, autosave conflict toast, view-link copy, link-code redemption (server side).
- **flakiness sources** — `await tick()` after dom mutation; `vi.useFakeTimers()` with autosave debounce; race between `treeStore.hydrate()` and an in-flight save (the `loadFromRecents` race-fix is the canonical example).

cite specific test files to add or extend; "more tests" alone is not a finding.

### pass 5 — documentation

check that the change is reflected wherever it should be:

- **`notes/agents.md`** — sections 4 (config), 8 (design decisions), 9 (schema). if a tier was changed, agents.md §4 must agree (or this skill must, per its own canonical-source claim).
- **`notes/features/`** — every stable feature gets a spec doc. did behavior or storage change? did the spec follow?
- **`notes/to-do.md`** — completed items moved to the completed section with a date stamp; new items added with priority + effort. items in to-do that are now done = drift.
- **`README.md`** — stack list, common commands. usually stable; flag only if the commands actually changed.
- **inline docs** — comment-style skill governs format; this pass asks whether the comment is *true* and *non-obvious*. if the code reads cleanly without a comment, suggest deletion.

flag drift; suggest specific edits. "update the docs" is not a finding.

### pass 6 — security

project-specific threat model. complements (does not replace) the built-in `/security-review` slash command — that one is generic OWASP-style; this one is FamilyTreeEditor-specific.

| area | what to check |
|---|---|
| **HMAC (bot ↔ server)** | `X-Attu-Timestamp` ±300s skew + upper-bound clamp; signature comparison via constant-time compare; signing key from `settings.secrets.discord_bot_hmac_secret`, never logged, never echoed |
| **link codes** | dev/prod partition (char[1]: dev = X/Z, prod = the other 22); race-safe atomic redeem (`UPDATE WHERE consumed_at IS NULL`); upsert on `(discord_id)` for the bind step; rate-limit on `/api/auth/start` is on the to-do list — flag if mutated |
| **session cookies** | `httponly=True`, `secure=True` (prod), `samesite='strict'`, `path=/trees/` from `SESSION_COOKIE_PATH` constant |
| **CORS** | explicit allowlist in `settings.server.cors_origins`; never wildcard with `allow_credentials=True`; new origin = an audit-log finding |
| **blob size** | `settings.server.max_tree_blob_bytes` enforced on `TreeCreateRequest.blob` and in `apply_save`; 413 on overflow |
| **role mutation** | only via discord roles fed through `/api/bot/auth/link`. server code that writes `users.role` from any other path is an audit finding (the bootstrap-admin rework removed every other write). |
| **secrets exposure** | `[secrets]` toml table never logged, never reflected in `_templated_index` injection, never echoed in error responses. f-string a secret into a log line = bug. |
| **spa runtime injection** | `window.__TREES_CONFIG__` carries only public values. `wikiBaseUrl`, `environment` — yes. anything from `[secrets]` — no, ever. |
| **sql injection / dynamic sql** | parameterized queries everywhere. f-string column lists are an audit finding even with hard-coded inputs. |
| **path traversal** | `apps/server/attu_tree/main.py` `spa()` already guards `..` traversal via `candidate.resolve().relative_to(_STATIC_DIR.resolve())`; new file-serving paths must do the same. |
| **xss in spa** | tree titles, person names, wiki titles are user-controlled. svelte's default escaping is your friend; `{@html …}` requires an audit-grade justification. |
| **hmac body coverage** | the canonical hmac string covers `(method, path, timestamp, body_sha256)`. partial coverage = replay vector. |

every finding here gets `[blocker]` unless impact is genuinely low.

### pass 7 — style

**don't restate the style skills.** invoke them and cite:

- file headers → **`file-header`**
- comments → **`comment-style`**
- commit message → **`commit-style`**
- ui / svelte 5 conventions → **`design-and-ui-changer`**
- pydantic v2 patterns → **`pydantic`**

flag only when a rule from those skills is broken. format: `- file:line — violates comment-style §<section>`. if a rule needs to change, that's a separate conversation; don't relitigate it inline.

## interaction with other skills

| skill | relation |
|---|---|
| `feature-completion` | mechanical "did i ship this right" checklist; this skill is the qualitative companion. run feature-completion first; it usually catches the easy stuff. |
| `commit-style` | once findings are addressed, the commit message is governed there. |
| `tree-debugger` | if a finding is "this layout pass produces wrong segments", switch to that skill for the IR-level diagnosis. |
| `firefox-profiling-analyzer` | if a finding is "this looks slow", capture a profile and use that skill. don't speculate on perf in code review. |
| `pydantic` | server validation patterns; cite when reviewing `models.py`, `settings.py`, routers. |
| `design-and-ui-changer` | svelte 5 / inspector / canvas conventions; cite for ui findings. |
| `config-tiers` | if a config field was added, this skill names the tier and the plumbing required. cite, don't restate. |

## report shape

a typical review for a medium-sized branch:

```
## Code review — <short scope>

**Bottom line:** ship after blockers (3 blockers, 6 important, 4 nits).

### Correctness & logic
- [blocker] apps/web/src/lib/sync/sync.svelte.ts:84 — read of `revision` then `await fetch(...)` then write; new revision can land in between, overwriting. Fix: capture revision into the request body, server already revision-checks via `apply_save`.
- [important] …

### Design
- …

### Tests
- …

### Documentation
- notes/features/wiki-integration.md §2.1 still says editor-side ports map; the compose change removed that.

### Security
- [blocker] …

### Style
- comment-style §inline-case: 4 violations in `edgeRouter.ts` (uppercase first letter)
```

stay strict on the bottom line — "ship it" means you'd merge it as-is.

## things this skill does not do

- it doesn't run tests or commit anything. it produces a written report.
- it doesn't auto-apply fixes. each finding is a suggestion the user accepts or rejects.
- it doesn't replace `/security-review` (built-in, generic OWASP) — those passes complement each other; run both for high-risk surfaces (auth, persistence, http boundaries).
- it doesn't replace the user's review judgment. when in doubt, flag and explain rather than overrule silently.
