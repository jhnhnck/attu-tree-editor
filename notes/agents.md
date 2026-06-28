# FamilyTreeEditor - agent guide

## 1. project overview

client-side typescript spa (svelte 5, vite, tailwind v4) for viewing and editing family trees in the [Attu Project](https://attuproject.org) wiki universe. backed by a thin fastapi+sqlite service for autosave, sharing, and discord-bridged auth via doom-bot. lives at `devel/FamilyTreeEditor/` inside the attu-wiki-dev deployment. see [`notes/features/attu-wiki.md`](features/attu-wiki.md) for parent project context and [`notes/features/doom-bot.md`](features/doom-bot.md) for the bot.

---

## 2. rules

1. do not edit the rules.
1. do not use git push or deploy any changes to prod without being explicitly asked to.
1. do not commit secrets - `data/` is gitignored; secrets live in `data/trees-config.toml` `[secrets]`.
1. all in-universe dates must use `HaracalndeDate`; never use `Date` in domain code.
1. round-trip exports must list dropped fields when the target format cannot carry them; do not silently lose data.
1. do not impose traditional family-structure constraints (gender pairings, monogamy, no cycles, two-parent, "must be human", etc.) - this is a fictional-world editor and the schema is permissive on purpose. validate-as-finding instead of reject-with-error. see section 8.
1. only one user-facing export format: GEDZIP `.gdz` (and a future native JSON). plain `.ged` and FamilyScript `.txt` are import-only. see section 8.
1. every persisted artifact (currently GEDZIP `manifest.json`; future native JSON) must carry `schemaVersion` so the migration runner in `domain/schema.ts` can convert older shapes forward. bumping `CURRENT_SCHEMA_VERSION` requires shipping a `Migration` in the registry.

---

## 3. architecture

### top level

| Module         | Role                                                    |
| :------------- | :------------------------------------------------------ |
| `apps/tree-editor/` | family-tree editor svelte 5 spa; bundled by vite        |
| `apps/wiki-editor/` | attu wiki editor svelte 5 spa; bundled by vite          |
| `apps/server/`      | fastapi + aiosqlite backend; single docker container    |
| `packages/attu-ui/` | shared svelte component library + design tokens         |
| `packages/api-client/` | typed http client for the fastapi backend (`pnpm gen:api`) |
| `examples/`    | sample `.txt`, `.ged`, and family echo `.html` exports  |
| `notes/`       | agent guidance and feature specs                        |

### apps/tree-editor internals

| Module                          | Role                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| :------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/domain/`               | typed person/tree model (`types.ts`), in-memory ops (`tree.ts`), id generator (`ids.ts`), validation (`validate.ts`), schema-version registry + migration runner (`schema.ts`), consanguinity (`consanguinity.ts`), findings (`findings.ts`), instance identity (`personIdentity.ts`), structural diff (`treeDiff.ts`)                                                                                                               |
| `src/lib/date/`                 | `HaracalndeDate` class, gregorian conversion (cosmetic)                                                                                                                                                                                                                                                                                                                                                                              |
| `src/lib/io/familyscript/`      | import-only parser for family echo `.txt` (serializer retired - see section 8)                                                                                                                                                                                                                                                                                                                                                       |
| `src/lib/io/gedcom/`            | parser wraps `read-gedcom`'s low-level tree; serializer is hand-rolled, called only by `bundle/write.ts`; `extensions.ts` registers the `_TREES_*` extension tag namespace (see §8.4)                                                                                                                                                                                                                                                |
| `src/lib/io/bundle/`            | GEDZIP `.gdz` reader / writer using `fflate`; ships `manifest.json` with `schemaVersion`                                                                                                                                                                                                                                                                                                                                             |
| `src/lib/io/merge/`             | dual-import merge: pair persons by name+year, union spouses + couples, configurable conflict resolution                                                                                                                                                                                                                                                                                                                              |
| `src/lib/io/detect.ts`          | filename + magic-byte format sniffer                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/lib/io/warnings.ts`        | per-target `fieldsDroppedFor()` helper                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/lib/utils/result.ts`       | `Result<T, E>` discriminated union for parser / validator returns                                                                                                                                                                                                                                                                                                                                                                    |
| `src/lib/persistence/`          | dexie schema (`db.ts`), trees + blobs + settings CRUD; autosave coordinator lives in `state/autosave.ts`                                                                                                                                                                                                                                                                                                                             |
| `src/lib/layout/`               | four-pass IR pipeline (`ir.ts`, `passes/{layer,order,place,route}.ts`) plus the engine boundary (`engine.ts`) and the three engines under `engines/{layered-hv,family-view,hyperbolic-lr}/`. `layout.worker.ts` runs the pipeline off the main thread. shared utilities: `edgeRouter.ts`, `kinship.ts`, `pathHighlight.ts`, `probandTree.ts`. see the `tree-layout-ir` and `tree-debugger` skills                                    |
| `src/lib/layout/hyperbolic/`    | hyperbolic-disk math + lamping-rao implementation used by the hyperbolic-lr engine. see the `hyperbolic-geometry` skill                                                                                                                                                                                                                                                                                                              |
| `src/lib/state/`                | runes-based stores: `tree.svelte.ts` (snapshot undo/redo + dirty flag), `selection.svelte.ts`, `viewport.svelte.ts`, `toasts.svelte.ts`, `progress.svelte.ts`, `portraitUrls.svelte.ts` (blob -> object-URL cache), `auth.svelte.ts`, `sync.svelte.ts` (server revision tracking), `preferences.svelte.ts`, `engine.ts` (active layout engine), `preferredUnionMigration.ts`; `autosave.ts` debounces tree changes into Dexie writes |
| `src/lib/api/`                  | thin wrapper around `@api-client` for the fastapi backend (`client.ts`); prefer importing from `packages/api-client/` directly for new code                                                                                                                                                                                                                                                                                          |
| `src/lib/components/tree/`      | `TreeCanvas.svelte`, `FamilyViewCanvas.svelte`, `HyperbolicCanvas.svelte` (per-engine renderers), `PersonNode.svelte` (foreignObject card), `EdgeLayer.svelte` + `edgePath.ts` (svg connectors), `canvasController.ts` (pan/zoom/focus), `DebugOverlay.svelte` (Ctrl+Shift+D), `InstancePopover.svelte`                                                                                                                              |
| `src/lib/components/editor/`    | `PersonEditor.svelte` (`<dialog>` form, set-or-delete patches), `PortraitField.svelte` (upload + thumb), `CropperDialog.svelte` + `CropperCanvas.svelte` (canvas-based portrait cropper; cropperjs removed), `cropperMath.ts` / `loadSourceBitmap.ts` / `encodePortrait.ts` (pure helpers; output webp via OffscreenCanvas)                                                                                                          |
| `src/lib/components/inspector/` | tabbed inspector sidebar: `Inspector.svelte` + `PersonalTab.svelte` / `ConnectionsTab.svelte` / `DetailsTab.svelte` / `RelationshipsTab.svelte` / `GroupsTab.svelte` / `SibshipTab.svelte` + `PersonChooser.svelte`                                                                                                                                                                                                                  |
| `src/lib/components/shell/`     | top-bar chrome: `MenuBar.svelte` + `Menu.svelte` + `menu.ts` (action registry), `AuthBar.svelte`, `AdminPanel.svelte`, `ProgressStrip.svelte`, dialogs (`OpenDialog`, `ShareDialog`, `SettingsDialog`, `LinkCodeDialog`); save-status + stats pills now live in `@attu/ui` dock                                                                                                                                                      |
| `src/lib/components/canvas/`    | canvas chrome: `ZoomWidget.svelte`, `BackButton.svelte`; dock + window/modal system lives in `@attu/ui` - see `notes/features/dock-kit.md`                                                                                                                                                                                                                                                                                          |
| `src/lib/components/palette/`   | `CommandPalette.svelte` + `commands.ts` (Ctrl+P quick-jump + Ctrl+Shift+P command palette)                                                                                                                                                                                                                                                                                                                                           |
| `src/lib/components/help/`      | `ShortcutsOverlay.svelte` (the `?` overlay)                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/lib/components/form/`      | `DateInput.svelte` (parses on blur via `HaracalndeDate.parseNarrative`), `Field.svelte`                                                                                                                                                                                                                                                                                                                                              |
| `src/lib/components/ui/`        | `Button.svelte` and other primitives                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/lib/wiki/`                 | `linkResolver.ts` builds `<base>/wiki/<title>` URLs; reads `window.__TREES_CONFIG__?.wikiBaseUrl` (server-injected from `data/trees-config.toml`), falls back to `VITE_WIKI_BASE_URL` for tests, then `https://attuproject.org`                                                                                                                                                                                                      |

### apps/server internals

| Module                  | Role                                                                                                                                           |
| :---------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| `attu_tree/main.py`     | fastapi app + middleware + routes; templates `window.__TREES_CONFIG__` into the served `index.html`                                            |
| `attu_tree/settings.py` | pydantic-settings + `TomlConfigSettingsSource` loader for `data/trees-config.toml`                                                             |
| `attu_tree/db.py`       | aiosqlite pool + connection helpers                                                                                                            |
| `attu_tree/migrations/` | numbered `.sql` schema migrations applied on startup                                                                                           |
| `attu_tree/models.py`   | pydantic schemas for the wire                                                                                                                  |
| `attu_tree/auth/`       | discord magic-code flow (`link.py`), session cookies (`session.py`), hmac verification (`hmac.py`), and the asgi middleware (`middleware.py`)  |
| `attu_tree/routers/`    | http routers: `auth.py`, `trees.py`, `admin.py`, `bot.py` (the `/api/bot/*` surface; see [`notes/features/doom-bot.md`](features/doom-bot.md)) |
| `attu_tree/trees/`      | tree crud + share grants (`access.py`)                                                                                                         |
| `attu_tree/sync/`       | revision-checked autosave merge (`autosave.py`)                                                                                                |

---

## 4. configuration system

four sources, no `.env` at runtime. each value lives in exactly one tier.

### tier A: `data/trees-config.toml` (bind-mounted)

all per-deployment values: `[app] environment`, `[server] cors_origins / max_tree_blob_bytes / public_base_url / database_url`, `[secrets] discord_bot_hmac_secret / session_secret`, `[wiki] base_url`. file lives at `./data/trees-config.toml` on the host (gitignored), mounted into the container at `/app/data/trees-config.toml`. ship `trees-config.example.toml` for reference; `chmod 600` the live file because `[secrets]` carries credentials.

`apps/server/attu_tree/settings.py` loads via `pydantic-settings`'s `TomlConfigSettingsSource`. nested `BaseModel` sub-fields map to toml tables. dev-outside-docker can override the path via `TREES_CONFIG_PATH=...`. missing file → defaults.

### tier B: `Dockerfile` (baked into image)

deployment invariants: `VITE_BASE=/trees/` (hard-coded in the spa build step), `mkdir -p /app/data && chown app:app /app/data` so the non-root user can write to the bind mount, python runtime envs.

### tier C: `docker-compose.yml` `environment:`

just `PYTHONUNBUFFERED=1`. no secrets, no `env_file:`. session cookie path is fixed to `/trees/` via a class constant in `Settings`, not a knob.

### tier D: parent wiki `.env` via `env_file:` on the include

`ATTU_NETWORK` only (already present at `/srv/services/attu-wiki-dev/.env`). no editor-specific values flow through here.

### web

`apps/tree-editor/vite.config.ts` keeps `base: process.env["VITE_BASE"] ?? "/"` (vite dev needs `/`; the production build is locked to `/trees/` by the Dockerfile). the spa wiki base url is **runtime-injected**: fastapi templates `<script>window.__TREES_CONFIG__ = {...}</script>` into `index.html` on serve, populated from tier A. `lib/wiki/linkResolver.ts` reads `window.__TREES_CONFIG__?.wikiBaseUrl` first, then `import.meta.env.VITE_WIKI_BASE_URL` (test fallback), then the default. one image works for any environment by swapping the toml.

precedence: `init_settings` > `TomlConfigSettingsSource` > `env_settings` > `file_secret_settings`. env vars only matter for dev-outside-docker (`TREES_CONFIG_PATH`).

---

## 5. coding conventions

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

## 6. testing

### web

- **unit**: `apps/tree-editor/tests/unit/**/*.test.ts` - vitest, jsdom, no browser deps
- **component**: `apps/tree-editor/tests/component/**/*.test.ts` - vitest + jsdom + `@testing-library/svelte`; ~45 spec files post-`ui-invariant-tests` plan (was 12 before). includes 6 structural-invariant suites (chrome-geometry, auto-fit-suppression, toggle-indicator, parity-matrix, selection-state-machine, keyboard-reachability) that replaced the deleted visual-snapshot floor - see [`notes/features/test-invariants.md`](features/test-invariants.md). `tests/setup.ts` registers jest-dom matchers, per-test cleanup, and no-op global shims for `ResizeObserver` / `IntersectionObserver` / `window.matchMedia` (jsdom 29.1.1 omits all three). `vitest.config.ts` sets `resolve.conditions: ['browser']` so the svelte plugin returns the client build, not the SSR one
- **e2e**: `apps/tree-editor/tests/e2e/**/*.spec.ts` - playwright with `chromium` + `mobile` projects. 8 specs post-plan (was 28); the residual set is browser-only by design (real file picker, real `BrowserContext` cross-tab, real Worker cache-key, real CSS calc, etc.). 0 visual-golden specs remain
- **harnesses**: `tests/component/_harness/` collects reusable mount sandwiches and helpers - `loadGedcomFixture`, `mountWithHostRect`, `stackingContextHitTest`, `MenuHarness`, `TabOrderHarness`, `ToggleMenuHarness`, `StatsPillHarness`, `ImportEditHarness`, `GenderFieldHarness`, `AgabFieldHarness`, `ParentPickerHarness`, `PortraitFieldHarness`. extract a new harness when a second spec needs the same scaffold
- `pnpm test:unit` runs vitest (unit + component, canonical fast loop), `pnpm test:e2e` runs playwright (residual browser-only set)
- fixtures live in `apps/tree-editor/tests/fixtures/` (purpose-built; `tiny.ged`, `multi-union.ged`, repro tables) and `notes/examples/` (akarian-style gedcom exports). the worktree post-checkout hook auto-symlinks `notes/examples` into each new worktree

### server

- pytest with `asyncio_mode = "auto"`
- `apps/server/tests/test_*.py` discovered automatically
- markers: `unit`, `integration`
- httpx `AsyncClient` + `ASGITransport` for in-process api tests; respx for outbound mocks

see [`notes/dev/testing.md`](dev/testing.md) for layout details, fixtures, and how to run subsets.

---

## 7. running locally

see [`notes/dev/dev_setup.md`](dev/dev_setup.md) for prerequisites and one-time setup. once ready:

```bash
pnpm dev           # web on :5173, proxies /api -> :8000
pnpm server:dev    # uvicorn --reload on :8000
pnpm verify        # full ci sweep
```

### setting up a worktree

`notes/examples/` is gitignored - the gedcom/familyscript fixtures referenced by tests are local-only. the `.githooks/post-checkout` hook (wired via `core.hooksPath=.githooks`, set automatically by `pnpm install`'s postinstall) symlinks `notes/examples` into every newly-created worktree, so `git worktree add ...` is enough - no manual setup step. the underlying `./scripts/setup-worktree.sh <worktree-path>` script remains available for manual invocation from the main repo if the hook ever doesn't fire (e.g. after a stale clone where postinstall hasn't run). the symlink itself is gitignored so it won't pollute the worktree's branch.

`pnpm dev` may conflict with a long-running container instance - if you see EADDRINUSE, stop the container before launching the worktree's dev server.

### canvas-chrome dock

the dock lives in `packages/attu-ui/src/lib/components/dock/` and is shared by both SPAs. see [`notes/features/dock-kit.md`](features/dock-kit.md) for the full API, state machine, CSS primitives, registration pattern, and priority-space convention. the key components are: `DockStore` (singleton in `store.svelte.ts`), `DockCorner` (renders the pill row + stacked panels), `DockWindow` (floating chrome with titlebar), `DockModal` (fixed centered dialog with backdrop), `DockSurface` (mounts floating windows and active modal), `DockItem` (registration bridge), `SaveStatusPill` + `StatsPill` (shared pill+window pairs). apps mount `<DockCorner corner="bl" {dockStore} />` plus `<DockSurface {dockStore} />` and register items via `<DockItem>`.

---

## 8. design decisions

context for why pieces of the codebase look the way they do. the rules in section 2 are the short form; this is the why.

### 8.1 permissive schema for fictional families

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

### 8.3 schema versioning + forward migration

every persisted artifact carries `schemaVersion`. the migration runner ([`apps/tree-editor/src/lib/domain/schema.ts`](../apps/tree-editor/src/lib/domain/schema.ts)) walks a registered chain of `Migration { from, to, migrate }` entries to bring older shapes up to `CURRENT_SCHEMA_VERSION`. this lets us evolve the domain (e.g. replace `motherId`/`fatherId` with `parentIds: PersonId[]`) without invalidating any existing user file.

invariants:

- **stamping** is the writer's job. GEDZIP `bundle/write.ts` ships `manifest.json` at archive root with `{schemaVersion, createdBy, createdAt}`; native JSON (when it lands) puts `schemaVersion` at the top level.
- **migrating** is the reader's job. `bundle/read.ts` reads the manifest (treats absent as v1, the original shape) and calls `migrateToCurrent` before handing data to the parser.
- **bumping** the version requires a `Migration` in `migrations[]` for the previous version. don't bump and forget.
- a file stamped with a version **newer** than `CURRENT_SCHEMA_VERSION` is rejected with a clear error. we never silently downgrade.
- migrations are **pure data transformations** (`(unknown) => unknown`) and must not throw; if input is malformed, return a shape the parser will fail to validate so the failure surfaces with normal find-ings, not a crash mid-migration.

when adding a schema-breaking domain change: bump `CURRENT_SCHEMA_VERSION`, push the corresponding `Migration` into `migrations[]`, write a unit test in `tests/unit/domain/schema.test.ts` that round-trips a v(N-1) sample through the migration, and only then change `domain/types.ts`.

### 8.4 GEDCOM `_TREES_*` extension namespace + HEAD.SCHMA

the relationship-vocabulary phases (3 through 6b) introduced a family of leading-underscore GEDCOM tags so the serializer can round-trip data the standard 5.5.1 schema can't express:

- **`_TREES_PARENT_REF`** (phase 2): one-line-per-parent with role + pedi, paired with FAMC/PEDI fallback for legacy tools.
- **`_TREES_UNION`** (phase 3): top-level N-partner union records carrying kind + closed flag.
- **`_TREES_REL`** (phase 4): top-level relationship records for the overlay layer (sworn bonds, transformations, severances, alias-of, etc.).
- **`_TREES_GENDER_IDENTITY` / `_TREES_PRONOUNS` / `_TREES_ASSIGNED_SEX` / `_TREES_GENDER_FLUID`** (phase 5): identity struct fields without coercing to binary SEX.
- **`_TREES_SPECIES` / `_TREES_PERSON_KIND` / `_TREES_ORIGIN_*`** (phase 5): species / kind / origin extensions.
- **`_TREES_GROUP`** (phase 6a): top-level group records (dynasty, house, clan, household, faction, order, covenant).
- **`_TREES_SIBSHIP` / `_TREES_BIRTH_ORDER`** (phase 6b): sibship decorators + birth-order metadata.

source of truth: [`apps/tree-editor/src/lib/io/gedcom/extensions.ts`](../apps/tree-editor/src/lib/io/gedcom/extensions.ts) (`TREES_EXTENSION_TAGS`). adding a new extension is a one-line change there, plus the actual emit / parse code.

the serializer registers the namespace via `HEAD.SCHMA` so the file declares its own dialect:

```text
1 SCHMA
2 TAG _TREES_UNION https://attuproject.org/trees/schema/v1#union
2 TAG _TREES_GROUP https://attuproject.org/trees/schema/v1#group
...
```

tools that don't understand SCHMA skip it; FamilyTree Editor's own permissive parser ignores SCHMA on read and re-emits a fresh block on write. the URI is stable across schema bumps - the schema version applies to the _tree data_ (`manifest.json`), not the tag vocabulary.

### 8.5 pronouns drive kinship terms before SEX

`apps/tree-editor/src/lib/layout/kinship.ts:kinshipGender(person)` consults `getPronouns(person)` first and falls back to `legacyGenderCode(person)`. so a person with `gender = { identity: "agender", pronouns: "he/him" }` reads as "brother / father / son" in path captions, and a person with `gender = "m"` whose pronouns are `they/them` reads as the neutral "sibling / parent / child". the same is not true of the GEDCOM SEX line (which has to be one of `M / F / U / X` because that's what the standard says); the SEX-derived legacy code is the _fallback_ for kinship rendering, not the source of truth.

---

## 9. patterns & pitfalls

1. **playwright webserver**: `playwright.config.ts` invokes `npx vite preview --host 127.0.0.1` rather than `pnpm preview`; subprocesses spawned by `playwright test` get a minimal `PATH` and can't always find pnpm. keep that line as `npx ...`.
2. **vitest <-> vite version coupling**: vitest 3 pairs with vite 6+. if you bump vite, bump vitest in lockstep, or types will conflict across two parallel installs.
3. **prettier-plugin-tailwindcss**: disabled in phase 0 because it crashes on svelte 5 syntax (`getVisitorKeys is not a function`). re-enable once upstream ships a fix; class sorting is not currently enforced.
4. **pnpm allowBuilds**: esbuild's postinstall must be allowed in `pnpm-workspace.yaml`'s `allowBuilds`; otherwise vitest's transform fails silently with "missing platform binary" at runtime.
5. **eslint and config files**: `eslint.config.js` and `svelte.config.js` are excluded from typescript-eslint's project service (see the `disableTypeChecked` block in `apps/tree-editor/eslint.config.js`); without it, lint errors with "not found by the project service".
6. **fflate's instanceof check**: `fflate` checks `value instanceof Uint8Array` internally and the jsdom realm has its own `Uint8Array` prototype that doesn't match node's. tests that drive `bundle/{read,write}.ts` use `// @vitest-environment node` at the top of the file. do not switch the bundle tests back to jsdom.
7. **stable serializer ordering**: domain person ids are randomly allocated by the parser, so any output sort that uses them changes every round-trip. the GEDCOM serializer sorts by **xref** instead (which is preserved through round-trip), and uses `~` as a placeholder for missing HUSB / WIFE slots so single-parent FAMs sort the same way mixed-pair FAMs do. preserve that pattern when adding new sortable output.
8. **`relatives-tree` const enums**: `Gender` and `RelType` are TS const enums; with `isolatedModules` we can't reference their members. The runtime values are plain strings, so `relativesTreeAdapter.ts` casts string literals via `as unknown as RelType` etc. Don't try to `import { RelType }` and use `RelType.blood` - it won't compile.
9. **svelte component tests on jsdom**: vitest `resolve.conditions: ['browser']` is required, otherwise `mount()` calls into the SSR build and crashes with `lifecycle_function_unavailable`. Also, jsdom doesn't implement `HTMLDialogElement.showModal/close`; component tests for anything using `<dialog>` need a `beforeAll` shim (see `PersonEditor.test.ts` for the pattern).
10. **inline callback typing in svelte templates**: typescript-eslint can't infer prop types across `.svelte` boundaries, so an inline arrow like `onselect={(id) => ...}` lints as `id: any`. Annotate explicitly: `onselect={(id: string) => ...}`.
11. **set-or-delete for optional fields**: `exactOptionalPropertyTypes` forbids `target.field = undefined` for `field?: T`. Use the `setOptional(target, key, value)` helper pattern (see `merge.ts` and `PersonEditor.svelte`); it `delete`s when value is undefined and assigns otherwise. Note this means clearing a field via patch isn't currently supported through `updatePerson` - tracked in to-do.md.
12. **dexie + svelte 5 $state proxies**: anything written to IndexedDB via Dexie goes through structured-clone, which throws `DataCloneError` when given a Svelte 5 `$state` proxy. `persistence/trees.ts:saveTree` round-trips the `Tree` through `JSON.parse(JSON.stringify(...))` to drop the reactivity wrappers. Domain types are JSON-safe (no `Date` / `Map` / functions) so this is lossless. Apply the same pattern when writing other reactive runes to Dexie.
13. **storing blobs in dexie**: store image bytes as `Uint8Array`, never as `Blob`. fake-indexeddb (used in tests) mangles Blob round-trips, and even real IndexedDB has subtle differences across browsers. `persistence/blobs.ts:putBlob` requires `Uint8Array`; the cropper output (a `Blob` from `canvas.toBlob`) is converted via `new Uint8Array(await blob.arrayBuffer())` at the call site. Read sites wrap back in `new Blob([bytes.slice()], { type: mime })` to create object URLs.
14. **autosave + first-load semantics**: `treeStore.dirty` distinguishes user mutations from initial-load hydration. App.svelte's autosave `$effect` only schedules a save when `firstLoadComplete && treeStore.dirty`. `treeStore.hydrate(tree)` resets state without flipping dirty (used to restore from Dexie); `treeStore.reset(tree)` does flip dirty (used by import). Don't conflate the two - hydrate-then-save would just rewrite what we read.
15. **family-view card-affordance slots are reserved**: the focus card and every visible card in the family-view engine has four corner slots + two centred-edge slots that are spoken for. New affordances must pick a free slot or share via a menu, not overlap. The current allocation:
    - **top-left**: `+ person` (add-relative, focus card only - phase 4) / `g+N` generation badge (non-focus cards - phase 5)
    - **top-right**: `−` collapse (when the branch was expanded - phase 1)
    - **top-centre**: `+` expand parents (ancestors with un-shown parents - phase 1)
    - **bottom-centre**: `+` expand children (descendants with un-shown children - phase 1)
    - **bottom-right**: `˅` union picker (multi-union persons - phase 2)
    - **bottom edge (1-px strip)**: era underline (HSL hue by birth-year century - phase 5)
      The focus card has rank 0 so the generation badge never collides with the `+ person` slot. A future seventh affordance should consider modifier-click, long-press, or an existing-menu entry rather than reaching for a new corner.

16. **wrapper-attribute selectors for e2e**: family-view affordances live on the _absolutely-positioned wrapper_ around `PersonNode`, not on `[data-person-id]` itself. e2e selectors target the wrapper-attribute and (if needed) filter by hasText. Established attributes:
    - `data-expand-toggle="expand" | "collapse"` (`+` / `−` buttons - phase 1)
    - `data-union-picker="toggle" | "menu"` (`˅` and its dropdown - phase 2)
    - `data-on-path="true"` (when on the selection→focus BFS path - phase 3)
    - `data-add-toggle="open" | "menu"` (`+ person` and its dropdown - phase 4)
    - `data-add-kind="parent" | "partner" | "child"` (add-relative menu items - phase 4)
    - `data-generation-badge="g±N"` (non-focus generation pill - phase 5)
    - `data-silhouette="true"` (User-icon fallback when no portraitUrl - phase 5)
    - `data-era-underline="true"` (1-px century-banded strip at card bottom - phase 5)
      Aria-label substrings are _also_ selector surface (phase 2 hit a collision when `˅`'s aria-label contained "view-time" and lit up the existing `getByRole("button", { name: "View" })` selector). When adding an affordance, scan existing aria-label / role selectors before settling on copy.

17. **auth dry-run debug toggle**: the debug panel's `shell > auth dry-run` chip flips `authStore` into a client-side-only synthetic session (`DRY_RUN_USER` in `state/auth.svelte.ts`, role `admin`). useful for exercising protected-action UI paths without discord linking. persisted in `localStorage["fte.debug.authDryRun"]`; only client-side gating is faked, so any real backend call still 401s. `authStore.realUser` distinguishes from the effective `user`; `AuthBar`'s sign-out short-circuits when only the synthetic session is active.

18. **debug mode vs debug menu open**: two pieces of state drive the debug surface, not one. `debugMode` is the master switch - persisted in `localStorage["fte.debug.mode"]` (plain boolean). it gates the debug pill's registration and both `debugOptions` / `familyViewDebugOptions` derivations (so layered + family-view overlays only render when debug mode is on). the debug menu's open-state is separate - `dockStore.isOpen("debug-menu")` (non-persisted; the `debug-menu` id never round-trips to `fte.dock.openedWindows`). `Ctrl+Shift+D` toggles it. closing the menu via `×` leaves overlays running. flipping `debugMode` off closes the menu as a side effect; the "disable debug mode" button in the menu body does the same. closing the menu does NOT clear overlays.
19. **dock placement keys**: the dock persists two localStorage keys (no schema version; client-only ui state). `localStorage["fte.dock.corner"]` holds the active corner (`"tl" | "tr" | "bl" | "br"`); `localStorage["fte.dock.openedWindows"]` is a JSON array of open window ids - non-persisted ids (debug-menu + every family-view-debug-* panel) are filtered out on write. drag-to-reorder pill `order` is in-memory only - not persisted.

---

## 10. reference notes

commit conventions, comment style, file headers, the feature-completion checklist, the four-pass IR contract, the hyperbolic-disk math, the tree debugger workflow, the config-tier topology, and the pydantic v2 reference card live as skills under `.claude/skills/`; load via the skill name. they are canonical when they diverge from this guide.

**`notes/features/`**

- [`notes/features/attu-ui.md`](features/attu-ui.md) - `@attu/ui` component library: design tokens, component inventory, canonical shell pattern, what not to do
- [`notes/features/dock-kit.md`](features/dock-kit.md) - dock/window/modal system: DockStore API, state machine, CSS primitives, registration pattern, priority-space convention
- [`notes/features/wiki-editor.md`](features/wiki-editor.md) - wiki-editor SPA architecture, component structure, how it differs from tree-editor
- [`notes/features/attu-wiki.md`](features/attu-wiki.md) - parent mediawiki project context + routing / cors / link wiring
- [`notes/features/doom-bot.md`](features/doom-bot.md) - sibling discord bot context + `/trees` slash-command contract
- [`notes/features/family-view-debug.md`](features/family-view-debug.md) - debug-overlay contracts (palette-pick call path, `RankedSubset.rationale` taxonomy, `AncestorOverlap.breakdown` widen-return)
- [`notes/features/keyboard-shortcuts.md`](features/keyboard-shortcuts.md) - planning notes for the canonical shortcut set
- [`notes/features/relationship-vocabulary.md`](features/relationship-vocabulary.md) - design study for first-class non-traditional family shapes
- [`notes/features/ui-inventory.md`](features/ui-inventory.md) - complete map of every user-facing surface, option, and control in the SPA

**`notes/dev/`**

- [`notes/dev/dev_setup.md`](dev/dev_setup.md) - one-time install steps (node, pnpm, python, uv, playwright)
- [`notes/dev/testing.md`](dev/testing.md) - test layout, fixtures, how to run subsets
- [`notes/dev/process.md`](dev/process.md) - the phased-plan / phase-loop / ship-gate development process; lists the shared skills (`pre-mortem`, `phase-retro`, `bug-triage`, `integration-check`, `plan-revise`, `ship-readiness`, `pre-merge`) used at each step

**`notes/profiles/`** - historic phase-0 metric snapshots from retired plans

- [`notes/profiles/layered-baseline.md`](profiles/layered-baseline.md), [`route-stub-paths.md`](profiles/route-stub-paths.md), [`ghost-contiguity-spike.md`](profiles/ghost-contiguity-spike.md) - baselines from the (retired) layered-and-tooling plan, kept as reference fixtures

**`notes/reports/`**

- [`notes/reports/state-and-audit-2026-04-26.md`](reports/state-and-audit-2026-04-26.md) - dated repo-state + multi-agent audit snapshot

**`notes/`**

- [`notes/.meta.md`](.meta.md) - guide to this documentation system
- [`notes/to-do.md`](to-do.md) - open items
- [`notes/bugs.md`](bugs.md) - known defects
- [`notes/design-issues.md`](design-issues.md) - undecided ui / ux items
- `notes/plans/` - gitignored implementation plans; ask the user before publishing

---

## 11. file & directory layout

```text
FamilyTreeEditor/
├── apps/
│   ├── tree-editor/                          # family-tree editor svelte 5 spa
│   │   ├── src/
│   │   │   ├── App.svelte
│   │   │   ├── app.css                       # tailwind v4 entry + tokens
│   │   │   ├── main.ts
│   │   │   ├── vite-env.d.ts                 # TreesRuntimeConfig surface
│   │   │   └── lib/
│   │   │       ├── components/
│   │   │       │   ├── canvas/               # ZoomWidget, BackButton
│   │   │       │   ├── editor/               # canvas-based portrait cropper
│   │   │       │   ├── import/               # import wizard
│   │   │       │   ├── inspector/            # tabbed sidebar
│   │   │       │   ├── palette/              # CommandPalette + commands
│   │   │       │   ├── shell/                # menu bar, dialogs, progress strip
│   │   │       │   └── tree/                 # per-engine canvases + edges
│   │   │       ├── date/                     # HaracalndeDate
│   │   │       ├── domain/                   # tree model + ops + validation + schema migrations
│   │   │       ├── io/
│   │   │       │   ├── bundle/               # GEDZIP read/write
│   │   │       │   ├── familyscript/         # import-only
│   │   │       │   ├── gedcom/               # parser + serializer + _TREES_* extensions
│   │   │       │   └── merge/                # dual-import merge
│   │   │       ├── layout/
│   │   │       │   ├── engines/              # family-view, hyperbolic-lr, layered-hv
│   │   │       │   ├── hyperbolic/           # poincare-disk math
│   │   │       │   ├── passes/               # layer, order, place, route
│   │   │       │   ├── spikes/               # one-off metric scripts
│   │   │       │   └── layout.worker.ts
│   │   │       ├── persistence/              # dexie (db, trees, blobs, settings)
│   │   │       ├── state/                    # runes-based stores (autosave, engine, selection, sync, tree, viewport, ...)
│   │   │       ├── utils/                    # Result<T,E>
│   │   │       └── wiki/                     # linkResolver
│   │   ├── tests/{unit,component,e2e,fixtures,spikes}/
│   │   ├── public/probes/                    # ios touch / exif standalone probes
│   │   ├── eslint.config.js
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── playwright.config.ts
│   │   ├── svelte.config.js
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── vitest.config.ts
│   ├── wiki-editor/                          # attu wiki editor svelte 5 spa
│   │   ├── src/
│   │   │   ├── App.svelte
│   │   │   ├── app.css
│   │   │   ├── main.ts
│   │   │   └── lib/                          # Editor, Toolbar, SelectionBar, SettingsModal, ShortcutsOverlay
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── svelte.config.js
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   └── server/                               # fastapi + aiosqlite
│       ├── attu_tree/
│       │   ├── __init__.py
│       │   ├── main.py                       # app + middleware + index.html templating
│       │   ├── settings.py                   # pydantic-settings + toml loader
│       │   ├── db.py                         # aiosqlite pool
│       │   ├── models.py                     # pydantic wire schemas
│       │   ├── auth/                         # hmac, link codes, session, middleware
│       │   ├── migrations/                   # numbered .sql
│       │   ├── routers/                      # auth, trees, admin, bot
│       │   ├── sync/                         # autosave merge
│       │   └── trees/                        # crud + access (share grants)
│       ├── tests/test_*.py
│       ├── docker-compose.yml
│       ├── Dockerfile
│       ├── pyproject.toml
│       └── uv.lock
├── packages/
│   ├── attu-ui/                              # shared svelte component library + design tokens
│   │   └── src/lib/
│   │       ├── components/{dock,shell,canvas,editor,form,help,palette,ui}/
│   │       ├── state/                        # toasts, preferences, auth, progress
│   │       ├── date/                         # HaracalndeDate + gregorian
│   │       ├── utils/                        # Result<T,E>
│   │       ├── keyboard.ts                   # keyboard shortcut helpers
│   │       ├── palette.ts                    # command palette helpers
│   │       ├── theme.css                     # design tokens + fte-* CSS classes
│   │       └── index.ts                      # public exports
│   └── api-client/                           # typed fetch client (`pnpm gen:api`)
│       └── src/index.ts                      # auth + trees + admin API + error classes
├── data/                                     # gitignored runtime: trees-config.toml, attu_tree.db
├── notes/
│   ├── agents.md                             # this file
│   ├── bugs.md                               # known defects
│   ├── to-do.md                              # features + polish
│   ├── design-issues.md                      # undecided ui / ux (gitignored)
│   ├── .meta.md                              # documentation system guide
│   ├── .template.to-do.md
│   ├── features/                             # attu-wiki, doom-bot, keyboard-shortcuts, relationship-vocabulary, ui-inventory
│   ├── dev/                                  # dev_setup, testing, process
│   ├── profiles/                             # historic metric snapshots
│   ├── reports/                              # dated repo-state snapshots
│   ├── examples/                             # reference .ged / .txt / .html / .gdz
│   └── plans/                                # gitignored implementation plans
├── .claude/
│   ├── plans/                                # gitignored active plan dirs
│   └── skills/                               # project-specific skills
├── trees-config.example.toml                 # template for data/trees-config.toml
├── docker-compose.yml                        # joins parent wiki via include
├── package.json                              # pnpm workspace root
├── pnpm-workspace.yaml
├── .markdownlint.jsonc
├── .editorconfig
├── .gitignore
├── LICENSE.md
└── README.md
```

---

## 12. personality / style

- lowercase inline comments; no trailing periods
- use semicolons or regular dashes (-); never em-dashes
- do not include any extraneous punctuation
- use american english spelling and grammar
- use spaces for indentation always; avoid formats that require tabs
- prefer brief statements over long explanations

---

## metadata

```yaml
last_updated: 28 Jun 2026
```
