# FamilyTreeEditor - Agent Guide

## 1. Project Overview

client-side typescript spa (svelte 5, vite, tailwind v4) for viewing and editing family trees in the [Attu Project](https://attuproject.org) wiki universe. backed by a thin fastapi+sqlite service for autosave, sharing, and discord-bridged auth via doom-bot. lives at `devel/FamilyTreeEditor/` inside the attu-wiki-dev deployment. see [`notes/features/attu-wiki.md`](features/attu-wiki.md) for parent project context and [`notes/features/doom-bot.md`](features/doom-bot.md) for the bot.

---

## 2. Rules

1. do not edit the rules.
1. do not create commits without being explicitly asked to.
1. do not commit secrets - `.env` is gitignored; all credentials live there.
1. check the current time at the start of each conversation. if it is past 12:30 AM ET, suggest a natural stopping point before continuing any task.
1. all in-universe dates must use `HaracalndeDate`; never use `Date` in domain code.
1. round-trip exports must list dropped fields when the target format cannot carry them; do not silently lose data.
1. do not impose traditional family-structure constraints (gender pairings, monogamy, no cycles, two-parent, "must be human", etc.) - this is a fictional-world editor and the schema is permissive on purpose. validate-as-finding instead of reject-with-error. see Section 8.
1. only one user-facing export format: GEDZIP `.gdz` (and a future native JSON). plain `.ged` and FamilyScript `.txt` are import-only. see Section 8.
1. every persisted artifact (currently GEDZIP `manifest.json`; future native JSON) must carry `schemaVersion` so the migration runner in `domain/schema.ts` can convert older shapes forward. bumping `CURRENT_SCHEMA_VERSION` requires shipping a `Migration` in the registry.

---

## 3. Architecture

### top level

| Module | Role |
| :--- | :--- |
| `apps/web/` | client-side svelte 5 spa; bundled by vite |
| `apps/server/` | fastapi + aiosqlite backend; single docker container |
| `packages/` | shared workspace packages (api-client lands in phase 5) |
| `examples/` | sample `.txt`, `.ged`, and family echo `.html` exports |
| `notes/` | agent guidance and feature specs |

### apps/web internals

| Module | Role |
| :--- | :--- |
| `src/lib/domain/` | typed person/tree model (`types.ts`), in-memory ops (`tree.ts`), id generator (`ids.ts`), validation (`validate.ts`), schema-version registry + migration runner (`schema.ts`) |
| `src/lib/date/` | `HaracalndeDate` class, gregorian conversion (cosmetic) |
| `src/lib/io/familyscript/` | import-only parser for family echo `.txt` (serializer retired - see Section 8) |
| `src/lib/io/gedcom/` | parser wraps `read-gedcom`'s low-level tree; serializer is hand-rolled, called only by `bundle/write.ts` |
| `src/lib/io/bundle/` | GEDZIP `.gdz` reader / writer using `fflate`; ships `manifest.json` with `schemaVersion` |
| `src/lib/io/merge/` | dual-import merge: pair persons by name+year, union spouses + couples, configurable conflict resolution |
| `src/lib/io/detect.ts` | filename + magic-byte format sniffer |
| `src/lib/io/warnings.ts` | per-target `fieldsDroppedFor()` helper |
| `src/lib/utils/result.ts` | `Result<T, E>` discriminated union for parser / validator returns |
| `src/lib/persistence/` | dexie schema (`db.ts`), trees + blobs + settings CRUD; autosave coordinator lives in `state/autosave.ts` |
| `src/lib/layout/` | `relativesTreeAdapter.ts` translates a `Tree` into `relatives-tree` input + runs layout |
| `src/lib/state/` | runes-based stores: `tree.svelte.ts` (snapshot undo/redo + dirty flag), `selection.svelte.ts`, `viewport.svelte.ts`, `toasts.svelte.ts`, `portraitUrls.svelte.ts` (blob → object-URL cache); `autosave.ts` debounces tree changes into Dexie writes |
| `src/lib/components/tree/` | `TreeCanvas.svelte` (svg + panzoom), `PersonNode.svelte` (foreignObject card), `EdgeLayer.svelte` (svg connectors) |
| `src/lib/components/editor/` | `PersonEditor.svelte` (`<dialog>` form, set-or-delete patches), `PortraitField.svelte` (upload + thumb), `CropperDialog.svelte` (lazy `cropperjs` import; outputs webp) |
| `src/lib/components/shell/` | `RecentTrees.svelte` (top-bar dropdown of recently-saved trees, new/delete actions) |
| `src/lib/components/form/` | `DateInput.svelte` (parses on blur via `HaracalndeDate.parseNarrative`), `Field.svelte` |
| `src/lib/components/ui/` | `Button.svelte` and other primitives |
| `src/lib/wiki/` | `linkResolver.ts` builds `<base>/wiki/<title>` URLs (default base `https://attuproject.org`, override via `VITE_WIKI_BASE_URL`) |

### apps/server internals

| Module | Role |
| :--- | :--- |
| `attu_tree/main.py` | fastapi app + middleware + routes |
| `attu_tree/db.py` | aiosqlite pool + migrations |
| `attu_tree/models.py` | pydantic schemas for the wire |
| `attu_tree/auth/` | discord magic-code flow + session cookies |
| `attu_tree/trees/` | crud + share grants |
| `attu_tree/sync/` | revision-checked autosave merge |
| `attu_tree/calendar.py` | mirror of doom-bot's haracalnde math |
| `attu_tree/wiki.py` | mediawiki client for link previews |

---

## 4. Configuration System

### web

- `apps/web/vite.config.ts` - dev port 5173, proxies `/api` to `:8000`
- `apps/web/tailwind.config.ts` - tailwind v4 lives mostly in `src/app.css` via `@theme`
- `.env.development` and `.env.production` (gitignored) - `VITE_API_BASE_URL`, `VITE_WIKI_BASE_URL`

### server

- `apps/server/pyproject.toml` - dependencies, ruff, basedpyright, pytest config
- `.env` (gitignored) - `DATABASE_URL`, `DISCORD_BOT_HMAC_SECRET`, `WIKI_BASE_URL`, `SESSION_SECRET`, `CORS_ORIGINS`
- `pydantic-settings` loads from `.env` at import time via `attu_tree/settings.py` (phase 5)

precedence: env vars > `.env` > defaults in `Settings`.

---

## 5. Coding Conventions

### typescript

- strict tsconfig with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- prettier: 4 spaces, double quotes, trailing commas, 100-col, semicolons
- eslint: `typescript-eslint` recommended-type-checked + `eslint-plugin-svelte`
- prefer svelte 5 runes (`$state`, `$derived`, `$effect`); no stores
- io boundaries return `Result<T, E>` rather than throwing
- file naming: `kebab-case.ts` for modules, `PascalCase.svelte` for components, `*.svelte.ts` for runes-only modules

### python

- ruff + basedpyright matching doom-bot's strictness (see `apps/server/pyproject.toml`)
- single-quoted strings; 4-space indent; line length capped by ruff (320 budget, formatter enforces flow)
- `async`/`await` everywhere; sync code only at startup
- pydantic models for all wire types

### shared style

- lowercase inline comments; no trailing periods
- regular dashes (-); never em-dashes
- american english spelling
- spaces for indentation everywhere
- prefer brief statements over long explanations
- error messages are lowercase, no terminal punctuation

### placeholder names

when a test, fixture, doc, or example needs a generic person, use these akarian-style placeholders (the `john doe` of this project). modeled on patterns from [`notes/examples/Akarians-1-Jun-2025-150206898.txt`](examples/Akarians-1-Jun-2025-150206898.txt); `nokar` is an invented kadrike that does not collide with any in the source.

- male: `Korak Nokar`
- female: `Marai Nokar`
- unknown: `Banchar Nokar`

---

## 6. Testing

### web

- **unit**: `apps/web/tests/unit/**/*.test.ts` - vitest, jsdom, no browser deps
- **component**: `apps/web/tests/component/**/*.test.ts` - vitest + jsdom + `@testing-library/svelte`; `tests/setup.ts` registers jest-dom matchers and per-test cleanup. `vitest.config.ts` sets `resolve.conditions: ['browser']` so the svelte plugin returns the client build, not the SSR one
- **e2e**: `apps/web/tests/e2e/**/*.spec.ts` - playwright with `chromium` + `mobile` projects
- `pnpm test:unit` runs vitest (unit + component), `pnpm test:e2e` runs playwright
- fixtures symlinked from top-level `examples/` into `apps/web/tests/fixtures/` (added in phase 2); a `tiny.ged` lives there for fast import-flow e2es

### server

- pytest with `asyncio_mode = "auto"`
- `apps/server/tests/test_*.py` discovered automatically
- markers: `unit`, `integration`
- httpx `AsyncClient` + `ASGITransport` for in-process api tests; respx for outbound mocks

see [`notes/dev/testing.md`](dev/testing.md) for layout details, fixtures, and how to run subsets.

---

## 7. Running Locally

see [`notes/dev/dev_setup.md`](dev/dev_setup.md) for prerequisites and one-time setup. once ready:

```bash
pnpm dev           # web on :5173, proxies /api -> :8000
pnpm server:dev    # uvicorn --reload on :8000
pnpm verify        # full ci sweep
```

for a docker preview of the backend:

```bash
cd apps/server && docker compose up --build
```

---

## 8. Design Decisions

context for why pieces of the codebase look the way they do. the rules in Section 2 are the short form; this is the why.

### 8.1 Permissive schema for fictional families

the editor targets an in-universe wiki where the fiction includes time travel, transmutation, multi-parent magical conception, asexual reproduction, and people marrying their horses. so the schema does **not** enforce any of the assumptions a real-world genealogy tool would:

- `linkSpouse` accepts self-couples (a `CoupleRecord` with `leftId === rightId`). validate.ts emits a non-blocking `self-couple` finding.
- `linkParent` accepts ancestral cycles. validate.ts emits a `cycle` finding via iterative DFS but never rejects.
- `Person.spouseIds: PersonId[]` is an array; polygamy is first-class.
- `Person.gender: 'm' | 'f' | 'u'` accepts `'u'` for non-binary, non-applicable, or unknown. there is no "must be human" check.
- the GEDCOM serializer emits **duplicate `1 HUSB`** for two-male couples and **duplicate `1 WIFE`** for two-female couples (rather than coercing one into the wrong role). modern parsers tolerate it; ours does too.

**direction for future work**: prefer "validate emits a finding" over "operation returns err". the editor surfaces findings as warnings the user can ignore; rejecting the operation closes a door we may want to reopen for an unfamiliar lore case. fields where the bi-parent schema currently leaks (e.g. only one HUSB makes it into a kid's `fatherId`) are tracked in [`notes/to-do.md`](to-do.md) under "schema evolution" and gated behind the parentIds[] migration.

### 8.2 GEDZIP as the only export format

users can **import** FamilyScript `.txt`, plain GEDCOM `.ged`, GEDZIP `.gdz`, or two-file dual imports of the first two. the editor only **exports** GEDZIP `.gdz` (and a future native JSON for full fidelity). reasons:

- the wiki is the only consumer that matters; no need to maintain byte-stable round-trips into FamilyEcho or other genealogy tools.
- one export path = one set of golden snapshots, one set of warnings, one mental model.
- GEDZIP is a real spec (`gedcom.io` chapter 4) so the bundle layout (`gedcom.ged` + `media/<personId>.<ext>`) interops with anything that does happen to read it.
- the GEDCOM serializer in `io/gedcom/serialize.ts` is still alive but only as the implementation detail of `bundle/write.ts` - never call it from a UI surface.
- `io/familyscript/serialize.ts` was deleted entirely; do not resurrect it. `io/familyscript/tokens.ts` retains only the import-side enum maps.

`io/warnings.ts`'s `ExportTarget` is `'gedzip' | 'json'` only. don't add `'gedcom'` or `'familyscript'` back unless that decision reverses.

### 8.3 Schema versioning + forward migration

every persisted artifact carries `schemaVersion`. the migration runner ([`apps/web/src/lib/domain/schema.ts`](../apps/web/src/lib/domain/schema.ts)) walks a registered chain of `Migration { from, to, migrate }` entries to bring older shapes up to `CURRENT_SCHEMA_VERSION`. this lets us evolve the domain (e.g. replace `motherId`/`fatherId` with `parentIds: PersonId[]`) without invalidating any existing user file.

invariants:

- **stamping** is the writer's job. GEDZIP `bundle/write.ts` ships `manifest.json` at archive root with `{schemaVersion, createdBy, createdAt}`; native JSON (when it lands) puts `schemaVersion` at the top level.
- **migrating** is the reader's job. `bundle/read.ts` reads the manifest (treats absent as v1, the original shape) and calls `migrateToCurrent` before handing data to the parser.
- **bumping** the version requires a `Migration` in `migrations[]` for the previous version. don't bump and forget.
- a file stamped with a version **newer** than `CURRENT_SCHEMA_VERSION` is rejected with a clear error. we never silently downgrade.
- migrations are **pure data transformations** (`(unknown) => unknown`) and must not throw; if input is malformed, return a shape the parser will fail to validate so the failure surfaces with normal find-ings, not a crash mid-migration.

when adding a schema-breaking domain change: bump `CURRENT_SCHEMA_VERSION`, push the corresponding `Migration` into `migrations[]`, write a unit test in `tests/unit/domain/schema.test.ts` that round-trips a v(N-1) sample through the migration, and only then change `domain/types.ts`.

---

## 9. Patterns & Pitfalls

1. **playwright webserver**: `playwright.config.ts` invokes `npx vite preview --host 127.0.0.1` rather than `pnpm preview`; subprocesses spawned by `playwright test` get a minimal `PATH` and can't always find pnpm. keep that line as `npx ...`.
2. **vitest <-> vite version coupling**: vitest 3 pairs with vite 6+. if you bump vite, bump vitest in lockstep, or types will conflict across two parallel installs.
3. **prettier-plugin-tailwindcss**: disabled in phase 0 because it crashes on svelte 5 syntax (`getVisitorKeys is not a function`). re-enable once upstream ships a fix; class sorting is not currently enforced.
4. **pnpm allowBuilds**: esbuild's postinstall must be allowed in `pnpm-workspace.yaml`'s `allowBuilds`; otherwise vitest's transform fails silently with "missing platform binary" at runtime.
5. **eslint and config files**: `eslint.config.js` and `svelte.config.js` are excluded from typescript-eslint's project service (see the `disableTypeChecked` block in `apps/web/eslint.config.js`); without it, lint errors with "not found by the project service".
6. **fflate's instanceof check**: `fflate` checks `value instanceof Uint8Array` internally and the jsdom realm has its own `Uint8Array` prototype that doesn't match node's. tests that drive `bundle/{read,write}.ts` use `// @vitest-environment node` at the top of the file. do not switch the bundle tests back to jsdom.
7. **stable serializer ordering**: domain person ids are randomly allocated by the parser, so any output sort that uses them changes every round-trip. the GEDCOM serializer sorts by **xref** instead (which is preserved through round-trip), and uses `~` as a placeholder for missing HUSB / WIFE slots so single-parent FAMs sort the same way mixed-pair FAMs do. preserve that pattern when adding new sortable output.
8. **`relatives-tree` const enums**: `Gender` and `RelType` are TS const enums; with `isolatedModules` we can't reference their members. The runtime values are plain strings, so `relativesTreeAdapter.ts` casts string literals via `as unknown as RelType` etc. Don't try to `import { RelType }` and use `RelType.blood` - it won't compile.
9. **svelte component tests on jsdom**: vitest `resolve.conditions: ['browser']` is required, otherwise `mount()` calls into the SSR build and crashes with `lifecycle_function_unavailable`. Also, jsdom doesn't implement `HTMLDialogElement.showModal/close`; component tests for anything using `<dialog>` need a `beforeAll` shim (see `PersonEditor.test.ts` for the pattern).
10. **inline callback typing in svelte templates**: typescript-eslint can't infer prop types across `.svelte` boundaries, so an inline arrow like `onselect={(id) => ...}` lints as `id: any`. Annotate explicitly: `onselect={(id: string) => ...}`.
11. **set-or-delete for optional fields**: `exactOptionalPropertyTypes` forbids `target.field = undefined` for `field?: T`. Use the `setOptional(target, key, value)` helper pattern (see `merge.ts` and `PersonEditor.svelte`); it `delete`s when value is undefined and assigns otherwise. Note this means clearing a field via patch isn't currently supported through `updatePerson` - tracked in to-do.md.
12. **dexie + svelte 5 $state proxies**: anything written to IndexedDB via Dexie goes through structured-clone, which throws `DataCloneError` when given a Svelte 5 `$state` proxy. `persistence/trees.ts:saveTree` round-trips the `Tree` through `JSON.parse(JSON.stringify(...))` to drop the reactivity wrappers. Domain types are JSON-safe (no `Date`, `Map`, functions) so this is lossless. Apply the same pattern when writing other reactive runes to Dexie.
13. **storing blobs in dexie**: store image bytes as `Uint8Array`, never as `Blob`. fake-indexeddb (used in tests) mangles Blob round-trips, and even real IndexedDB has subtle differences across browsers. `persistence/blobs.ts:putBlob` requires `Uint8Array`; the cropper output (a `Blob` from `canvas.toBlob`) is converted via `new Uint8Array(await blob.arrayBuffer())` at the call site. Read sites wrap back in `new Blob([bytes.slice()], { type: mime })` to create object URLs.
14. **autosave + first-load semantics**: `treeStore.dirty` distinguishes user mutations from initial-load hydration. App.svelte's autosave `$effect` only schedules a save when `firstLoadComplete && treeStore.dirty`. `treeStore.hydrate(tree)` resets state without flipping dirty (used to restore from Dexie); `treeStore.reset(tree)` does flip dirty (used by import). Don't conflate the two - hydrate-then-save would just rewrite what we read.

---

## 10. Reference Notes

**`notes/style/`**
- [`notes/style/commit_style.md`](style/commit_style.md) - commit message format, types, and tone

**`notes/features/`**
- [`notes/features/attu-wiki.md`](features/attu-wiki.md) - parent project context (containers, services, architecture)
- [`notes/features/doom-bot.md`](features/doom-bot.md) - sibling discord bot; family-tree integration touch points

**`notes/dev/`**
- [`notes/dev/dev_setup.md`](dev/dev_setup.md) - one-time install steps (node, pnpm, python, uv, playwright)
- [`notes/dev/testing.md`](dev/testing.md) - test layout, fixtures, how to run subsets

**`notes/`**
- [`notes/.meta.md`](.meta.md) - guide to this documentation system
- [`notes/to-do.md`](to-do.md) - open items
- `notes/plans/` - gitignored implementation plans; ask the user before publishing

---

## 11. File & Directory Layout

```txt
FamilyTreeEditor/
├── apps/
│   ├── web/
│   │   ├── eslint.config.js
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── playwright.config.ts
│   │   ├── .prettierrc.json
│   │   ├── src/
│   │   │   ├── App.svelte
│   │   │   ├── app.css
│   │   │   ├── main.ts
│   │   │   ├── vite-env.d.ts
│   │   │   └── lib/                 ← grows phase 1+
│   │   ├── svelte.config.js
│   │   ├── tests/{unit,e2e}/
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── vitest.config.ts
│   └── server/
│       ├── attu_tree/
│       │   ├── __init__.py
│       │   └── main.py
│       ├── docker-compose.yml
│       ├── Dockerfile
│       ├── pyproject.toml
│       ├── tests/test_health.py
│       └── uv.lock
├── examples/                        ← reference .ged, .txt, .html exports
├── notes/
│   ├── agents.md                    ← this file
│   ├── .meta.md                     ← documentation system guide
│   ├── .template.to-do.md
│   ├── to-do.md
│   ├── style/
│   │   └── commit_style.md
│   ├── features/
│   │   ├── attu-wiki.md
│   │   └── doom-bot.md
│   └── dev/
│       ├── dev_setup.md
│       └── testing.md
├── package.json                     ← pnpm workspace root
├── packages/                        ← shared workspace packages (phase 5)
├── pnpm-workspace.yaml
├── .editorconfig
├── .gitignore
├── LICENSE.md
└── README.md
```

---

## 12. Personality / Style

- lowercase inline comments; no trailing periods
- use semicolons or regular dashes (-); never em-dashes
- do not include any extraneous punctuation
- use american english spelling and grammar
- use spaces for indentation always; avoid formats that require tabs
- prefer brief statements over long explanations

---

## metadata

```yaml
last_updated: 26 April 2026 (phase 4)
```
