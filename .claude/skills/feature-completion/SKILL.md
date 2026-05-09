---
name: feature-completion
description: FamilyTreeEditor end-of-task checklist - tests, documentation, configuration plumbing, and linting. trigger when the user signals task wrap-up ("ready to commit", "feature done", "ready for review", "I think that's it", "done", "looks good"); when running `pnpm verify`, `pnpm test:unit`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, or `uv run pytest`; before drafting any `git commit` message; before reporting a feature, fix, or refactor as complete. canonical source for the checklist - if it diverges from `notes/agents.md`, this skill wins.
---

# feature completion checklist

Walk through every applicable item below before reporting a task as done. Answer each as a literal yes/no; if the answer is no and the item applies, finish that item before declaring completion.

This skill is canonical; if it drifts from `notes/agents.md` or `notes/dev/testing.md`, flag the divergence so those notes get updated to match.

## tests

### web (`apps/web/tests/`)

- [ ] did you add or update unit tests for new logic in `apps/web/tests/unit/`? (vitest + jsdom; pure ts and svelte runes modules)
- [ ] did you add component tests for new svelte components in `apps/web/tests/component/`? (vitest browser mode; uses `@testing-library/svelte`)
- [ ] did you add or update an e2e test in `apps/web/tests/e2e/` for any user-visible flow that crosses module boundaries? (playwright; chromium + mobile projects)
- [ ] does `pnpm test:unit` (vitest) pass clean?
- [ ] does `pnpm test:e2e` (playwright) pass clean? (run at minimum the chromium project)

### server (`apps/server/tests/`)

- [ ] did you add or update pytest tests for new routes, sync logic, or auth flows? (`pytest`, `asyncio_mode = "auto"`, httpx `AsyncClient` + `ASGITransport` for in-process api tests)
- [ ] for any outbound http calls (e.g. `attu_tree/wiki.py`), did you mock with `respx`?
- [ ] does `pnpm server:test` (or `uv run pytest` from `apps/server/`) pass clean?

### schema migration coverage

- [ ] did you bump `CURRENT_SCHEMA_VERSION` in `apps/web/src/lib/domain/schema.ts`? if yes:
  - [ ] did you push a `Migration { from, to, migrate }` entry into `migrations[]`?
  - [ ] did you add a unit test in `apps/web/tests/unit/domain/schema.test.ts` round-tripping a v(N-1) sample through the new migration?
  - [ ] does the GEDZIP `bundle/write.ts` still stamp the new version on output?

### dual-stack validation

- [ ] does `pnpm verify` (typecheck + lint + unit + build + server:lint + server:test) pass clean?

## documentation

- [ ] did you update the relevant feature spec in `notes/features/` if behavior or storage changed?
- [ ] is the feature new, stable, and referenceable? if yes, did you add a new note file following `notes/.meta.md` guidance (feature.md, library_usage.md, or domain_concept.md)?
- [ ] if you added a new note file, did you update the reference notes table in `notes/agents.md` section 10?
- [ ] did you update `notes/to-do.md` to reflect completed work, removing items that are now done?

## configuration (only if you added a config field)

`notes/agents.md` section 4 lists four tiers; pick the right one:

- [ ] is the value per-deployment and operator-adjustable? **tier A**: add it to the appropriate `BaseModel` in `apps/server/attu_tree/settings.py`, give it a default, and add a sample value to `trees-config.example.toml`. nested toml tables map automatically to nested pydantic models - **no further plumbing needed** beyond those two locations. (the doom-bot six-step plumbing dance does not apply here.)
- [ ] is the value a deployment invariant baked into the image? **tier B**: it goes in `apps/server/Dockerfile` (e.g. `VITE_BASE`, `mkdir`/`chown`, python runtime envs).
- [ ] is the value a runtime knob that's not a secret and isn't per-deployment? **tier C**: `docker-compose.yml` `environment:`. (today only `PYTHONUNBUFFERED=1` lives here.)
- [ ] does the value flow from the parent attu-wiki deployment? **tier D**: `env_file:` on the docker-compose include points at `/srv/services/attu-wiki-dev/.env`.
- [ ] is the value needed in the spa? if yes, runtime-inject it via `window.__TREES_CONFIG__` (see `apps/server/attu_tree/main.py` and `apps/web/src/lib/wiki/linkResolver.ts`); do not bake env vars into the production build (one image must serve any environment).
- [ ] does the field carry a credential? if yes, it goes under `[secrets]` in `data/trees-config.toml` and that file must stay `chmod 600`. never log it; never expose it to the spa.

See the `pydantic` skill for `BaseSettings` + `TomlConfigSettingsSource` patterns and the wire-model validation conventions.

## web interface (only if you added or changed web-facing endpoints, pages, or persistence)

- [ ] every mutation route: does it use a typed `body: SomeRequest` argument so fastapi auto-validates? (`extra='forbid'` on inbound bodies is preferred; see the `pydantic` skill)
- [ ] every mutation route: does it set `response_model=...` so outbound serialization and the openapi schema stay in sync?
- [ ] discord snowflake ids serialized as `str` in any json response that crosses into js? (precision loss above 2^53)
- [ ] new dexie table or schema bump? if yes, did you bump the dexie version and provide an upgrade function (see `apps/web/src/lib/persistence/db.ts`)?
- [ ] writes to dexie: do they round-trip through `JSON.parse(JSON.stringify(...))` to drop svelte 5 `$state` proxies? (rule from `notes/agents.md` section 9)
- [ ] storing image bytes: are you using `Uint8Array`, not `Blob`? (fake-indexeddb mangles Blob round-trips)
- [ ] new optional field on a domain type with `exactOptionalPropertyTypes`: are you using the `setOptional(target, key, value)` helper instead of `target.field = undefined`?

## linting

- [ ] is `pnpm lint` clean? (eslint + svelte plugin)
- [ ] is `pnpm typecheck` clean? (`tsc --noEmit` with strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
- [ ] is `pnpm server:lint` clean? (`ruff check` + `basedpyright` from `apps/server/`)
- [ ] is `ruff format --check` clean on the server?
- [ ] every `# noqa`, `// eslint-disable-...`, `// @ts-expect-error`, or `# pyright: ignore[...]` carries a reason explaining *why* the rule is suppressed? (see the `comment-style` skill)
- [ ] no `// @ts-ignore` (use `@ts-expect-error` so it self-removes when the error stops happening)

## domain rule sanity check

`notes/agents.md` section 2 lists the project's hard rules. for any change that touches domain code:

- [ ] in-universe dates use `HaracalndeDate`, never `Date`? (rule 5)
- [ ] round-trip exports list dropped fields when the target format can't carry them? (rule 6; see `apps/web/src/lib/io/warnings.ts`)
- [ ] no traditional family-structure constraints sneaked in (gender pairings, monogamy, no cycles, two-parent, "must be human")? (rule 7; validate-as-finding, never reject-with-error)
- [ ] export still GEDZIP-only on the user-facing path? `.ged` and FamilyScript `.txt` are import-only. (rule 8)
- [ ] persisted artifacts still carry `schemaVersion` and a corresponding `Migration` exists when bumped? (rule 9)
- [ ] no secrets staged from `data/`? (rule 3)

## final gate

- [ ] every applicable box above is checked
- [ ] `pnpm verify` was the last thing run and it passed
- [ ] you have not run `git commit` without explicit user instruction (rule 2 from `notes/agents.md`; see also the `commit-style` skill)
