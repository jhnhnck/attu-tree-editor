---
name: feature-completion
description: FamilyTreeEditor end-of-task mechanical checklist — tests, docs, config plumbing, linting. trigger on "ready to commit", "feature done", "ready for review", "done", "looks good"; before running `pnpm verify`, `pnpm test:*`, `pnpm lint`, `pnpm typecheck`, `uv run pytest`; before drafting any `git commit` message. canonical — wins over `notes/agents.md` if they diverge. mechanical companion to `code-review` (judgment); per-phase counterpart to `integration-check` and `phase-retro`.
---

# feature completion checklist

walk every applicable item below before reporting a task as done. answer each as a literal yes/no; if "no" and the item applies, finish that item before declaring completion.

## tests

### web (`apps/web/tests/`)

- [ ] unit tests for new logic in `apps/web/tests/unit/`? (vitest + jsdom)
- [ ] component tests for new svelte components in `apps/web/tests/component/`? (vitest browser; `@testing-library/svelte`)
- [ ] e2e test in `apps/web/tests/e2e/` for user-visible flows crossing module boundaries? (playwright; chromium + mobile)
- [ ] `pnpm test:unit` passes clean?
- [ ] `pnpm test:e2e` passes clean? (minimum: chromium project)

### server (`apps/server/tests/`)

- [ ] pytest tests for new routes, sync logic, or auth flows? (`asyncio_mode = "auto"`, httpx `AsyncClient` + `ASGITransport`)
- [ ] outbound http calls (e.g. `attu_tree/wiki.py`) mocked with `respx`?
- [ ] `pnpm server:test` (or `uv run pytest` from `apps/server/`) passes clean?

### schema migration coverage

- [ ] bumped `CURRENT_SCHEMA_VERSION` in `apps/web/src/lib/domain/schema.ts`? if yes:
  - [ ] pushed a `Migration { from, to, migrate }` entry into `migrations[]`?
  - [ ] added a unit test in `apps/web/tests/unit/domain/schema.test.ts` round-tripping a v(N-1) sample through the new migration?
  - [ ] GEDZIP `bundle/write.ts` stamps the new version on output?

### dual-stack validation

- [ ] `pnpm verify` (typecheck + lint + unit + build + server:lint + server:test) passes clean?

## documentation

- [ ] updated the relevant feature spec in `notes/features/` if behavior or storage changed?
- [ ] feature new, stable, and referenceable? if yes, added a new note file per `notes/.meta.md` guidance?
- [ ] new note file → updated reference table in `notes/agents.md` section 10?
- [ ] `notes/to-do.md` reflects completed work; finished items moved out?

## configuration (only if you added a config field)

defer to `config-tiers` skill for the canonical tier-A/B/C/D plumbing, the `window.__TREES_CONFIG__` injection path, and the `data/trees-config.toml` `[secrets]` rules. quick sanity:

- [ ] picked the right tier (A: per-deployment knob → `settings.py` + `trees-config.example.toml`; B: image baked → `Dockerfile`; C: compose env; D: parent `.env`)?
- [ ] secret-bearing? → `[secrets]` in `data/trees-config.toml`; file stays `chmod 600`; never logged; never spa-injected.
- [ ] spa-visible non-secret? runtime-injected via `window.__TREES_CONFIG__`, not baked into the build.

`pydantic` skill covers `BaseSettings` + `TomlConfigSettingsSource` patterns and wire-model validation.

## web interface (if you added or changed endpoints, pages, or persistence)

- [ ] every mutation route uses a typed `body: SomeRequest` (fastapi auto-validates; `extra='forbid'` preferred)?
- [ ] every mutation route sets `response_model=...` (openapi + serialization in sync)?
- [ ] discord snowflake ids serialized as `str` in any json crossing into js?
- [ ] new dexie table or schema bump → dexie version bumped and upgrade function provided (`apps/web/src/lib/persistence/db.ts`)?
- [ ] dexie writes round-trip through `JSON.parse(JSON.stringify(...))` to drop svelte 5 `$state` proxies?
- [ ] image bytes stored as `Uint8Array`, not `Blob`?
- [ ] new optional field on a domain type with `exactOptionalPropertyTypes` → using `setOptional(target, key, value)` helper?

## linting

- [ ] `pnpm lint` clean? (eslint + svelte plugin)
- [ ] `pnpm typecheck` clean? (`tsc --noEmit`; strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
- [ ] `pnpm server:lint` clean? (`ruff check` + `basedpyright` from `apps/server/`)
- [ ] `ruff format --check` clean on the server?
- [ ] every `# noqa`, `// eslint-disable-...`, `// @ts-expect-error`, `# pyright: ignore[...]` carries a reason explaining *why*? (see `comment-style`)
- [ ] no `// @ts-ignore` (use `@ts-expect-error` so it self-removes)?

## domain rule sanity check

`notes/agents.md` section 2 lists hard rules. for any change touching domain code:

- [ ] in-universe dates use `HaracalndeDate`, never `Date`? (rule 5)
- [ ] round-trip exports list dropped fields when the target format can't carry them? (rule 6; `apps/web/src/lib/io/warnings.ts`)
- [ ] no traditional family-structure constraints sneaked in (gender, monogamy, no cycles, two-parent, human-only)? (rule 7; validate-as-finding, never reject-with-error)
- [ ] export still GEDZIP-only on the user-facing path? `.ged` and FamilyScript `.txt` import-only. (rule 8)
- [ ] persisted artifacts carry `schemaVersion` and a `Migration` exists when bumped? (rule 9)
- [ ] no secrets staged from `data/`? (rule 3)

## final gate

- [ ] every applicable box above is checked
- [ ] `pnpm verify` was the last thing run and it passed
- [ ] no `git commit` run without explicit user instruction (rule 2; `commit-style`)
