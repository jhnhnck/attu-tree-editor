# FamilyTreeEditor to-do list

_see the [meta](#meta) section at the end of this file for format reference._

---

## tasks

### phase 1 - domain core + dates

_phase 1 complete; see the completed section below_

### phase 2 - import/export

_phase 2 complete; see the completed section below_

### phase 3 - render + edit

_phase 3 complete; see the completed section below_

- ⭕ `low priority` `low effort` person count of relatives-tree layout for ~1800 nodes hasn't been profiled; canvas may need a virtualization pass before phase 6 mobile work

### phase 4 - persistence + portraits + wiki

_phase 4 complete; see the completed section below_

- ⭕ `low priority` `low effort` cropperjs styles are loaded from `cdn.jsdelivr.net` for bundle slimness; switch to a local import once we have a CSP/offline story
- ⭕ `low priority` `low effort` wiki title field should autocomplete from the wiki - query `/w/api.php?action=opensearch&search=...` and offer suggestions in the person editor / inspector Details tab

### phase 5 - backend + auth + sync

_phase 5 largely complete; see the completed section below_

- ⭕ `high priority` `high effort` field-level merge on autosave conflict (currently last-write-wins via revision check; needs per-field diff + merge for concurrent edits to different people)
- ⭕ `high priority` `low effort` web shell follow-up to the auth-model rework: drop the role toggle from `AdminPanel.svelte` and remove the `role` field from the typed admin client. server side already refuses to mutate role through that endpoint, but the UI still shows the toggle. lives in the UI workstream
- ⭕ `medium priority` `medium effort` doom-bot `/trees link`, `/trees show`, `/trees share` slash commands (separate PR in that repo; see `notes/features/bot-integration.md` for the contract). bot now needs to (a) send the `roles: list[str]` field on link redemption, and (b) inspect char[1] of the user-supplied code to route between dev and prod backends per §3.1b - so bot config carries both `ATTU_TREES_DEV_BASE_URL` and `ATTU_TREES_PROD_BASE_URL`
- ⭕ `medium priority` `low effort` Caddy config: add `handle_path /trees/*` blocks to prod + dev Caddyfile (`/etc/caddy/Caddyfile.d/attuproject-org.caddyfile`)
- ⭕ `medium priority` `low effort` parent compose include: add `include:` directive to `docker-compose.dev.yml` and `docker-compose.prod.yml` in the `attu-wiki-dev` root
- ⭕ `low priority` `low effort` rate-limit `/api/auth/start` and tree-id-keyed routes against enumeration / abuse; deferred from the security audit because impact is low (CORS allowlist already blocks the cross-origin read path) but worth doing before opening the service to the wider public
- ⭕ `low priority` `low effort` document the deployment-time invariant that `cors_origins` must be an explicit allowlist (never wildcard) when `allow_credentials=True`; add a startup assertion in `main.py` if we want it enforced

### phase 6 - polish + a11y + mobile

- ⭕ `high priority` `medium effort` keyboard navigation across nodes (roving tabindex)
- ⭕ `high priority` `medium effort` aria roles for tree (`role="tree"`, `treeitem`)
- ⭕ `high priority` `medium effort` mobile bottom-sheet variant of the editor panel
- ⭕ `medium priority` `medium effort` zoom-aware label sizing - shrink card padding and grow text size as zoom decreases so the next-level-up card stays readable as long as possible (PersonNode + the `levelFromScale` thresholds in TreeCanvas)
- ⭕ `medium priority` `medium effort` compact layout tuning - tighten relatives-tree SIZE constants and add a post-layout compaction pass to remove dead space between sibships
- ⭕ `medium priority` `high effort` hide unrelated branches based on the selected person - needs a "related-to" rule (default: ancestors + descendants + spouses); expose as a View menu toggle so users can flip between full tree and focused view
- ⭕ `medium priority` `medium effort` selectable lineage trace - clicking an edge (or a person + an "trace" action) highlights a chain through the graph in a unique color so the user can see where a relationship goes; pairs naturally with the "hide unrelated branches" toggle
- ⭕ `medium priority` `low effort` hover tooltip at far zoom levels - PersonNode at level 4 (initials) and 5 (dot) drops the name; add a native `title` or floating tooltip showing the full name + dates so users can identify cards before zooming in
- ⭕ `medium priority` `low effort` unified loading-bar / progress indicator - generic UI for long operations (import, autosave flush, server push, layout recompute on big trees); replaces the scattered `reading file…` toast pattern with a top-of-canvas progress strip
- ⭕ `medium priority` `low effort` minimap + search-by-name popover
- ⭕ `low priority` `low effort` edge lines should grow thicker / darker as the canvas zooms out so the topology stays readable when individual cards become unreadable (EdgeLayer)
- ⭕ `low priority` `low effort` cursor correctness audit - the canvas root's `cursor-grab` overrides cards / buttons inside it (should show pointer over PersonNodes), and the cursor occasionally stays in `grabbing` after a pan ends outside the window. fix the grab/grabbing/default/pointer transitions so the OS cursor always matches what's under the pointer
- ⭕ `future idea` `medium effort` decide and prototype a wiki integration story (mechanism tbd; the original mediawiki-gadget approach is shelved)

### tooling / infra

- ⭕ `medium priority` `low effort` update `notes/features/keyboard-shortcuts.md` to reflect what actually shipped: drop Mod+N (browser new-window), Mod+Shift+N (browser private-window) and Mod+1 (browser tab-1) from the canonical spec; document the soft-conflict pattern where Mod+S/O/P/D/I/E/0 work via `preventDefault` like Figma/VS Code; add a "browser-safe" rule of thumb for future bindings
- ⭕ `low priority` `low effort` revisit prettier-plugin-tailwindcss once upstream supports svelte 5
- ⭕ `future idea` `low effort` add `pnpm verify` to a github actions workflow
- ⭕ `future idea` `low effort` move server-side env to a tier-2 toml config (e.g. `assets/attu-tree.toml`) instead of the current `.env` + pydantic-settings, matching doom-bot's configuration-tier convention. settings live in `attu_tree/settings.py` today; switch to `tomllib` + a small `Settings` loader, keep env-var overrides for secrets (`DISCORD_BOT_HMAC_SECRET`, `SESSION_SECRET`), update `notes/agents.md` §4 and the bot-integration.md cross-reference once shipped
- ⭕ `future idea` `medium effort` real-time multi-user collaboration via websocket

### schema evolution (gates a schema version bump each)

- ⭕ `future idea` `high effort` replace `motherId` / `fatherId` with `parentIds: PersonId[]` (each entry carries optional `role: 'mother' | 'father' | 'parent' | 'progenitor'` and `pedi: 'birth' | 'adopted' | 'foster'`); supports asexual / multi-parent / non-binary single parents; ships with a v1 -> v2 migration in `domain/schema.ts`
- ⭕ `future idea` `medium effort` add generic `relationships: { kind: 'transformed-from' | 'alias-of' | 'sworn-bond' | 'master-apprentice' | ...; targetId; notes? }[]` for transmutation, alias, adoption-not-yet-mapped, and other fictional bonds; ships with a v2 -> v3 migration
- ⭕ `future idea` `low effort` add `birthOrder?: number` on `Person` for twin / triplet / cohort ordering inside a sibship (currently lost — sibship is derived from shared parents only); ships with a v3 -> v4 migration
- ⭕ `future idea` `low effort` add optional `name?: string` to `CoupleRecord` so families can be referenced by a chosen surname / household name (currently no way to rename families); ships with a v? -> v? migration and an Inspector Connections-tab UI to set it

### meta

- `high priority` `low effort` assign any to-dos without an effort or category; update priorities; move completed and sort all

---

## completed

### bootstrap

- 🔴 `25 April 2026` pnpm 10 workspace at the repo root with `apps/*` and `packages/*`
- 🔴 `25 April 2026` apps/web bootstrapped: vite 6 + svelte 5 (runes) + tailwind v4 + typescript strict + eslint flat config + prettier
- 🔴 `25 April 2026` vitest + playwright wired; `tests/unit/sanity.test.ts` and `tests/e2e/shell.spec.ts` green
- 🔴 `25 April 2026` apps/server bootstrapped: fastapi + uvicorn + aiosqlite + pydantic-settings; pyproject mirrors doom-bot ruff/basedpyright
- 🔴 `25 April 2026` `attu_tree/main.py` exposes `/health`; pytest `tests/test_health.py` green
- 🔴 `25 April 2026` multi-stage Dockerfile (uv builder + slim runtime) and `docker-compose.yml` for the backend
- 🔴 `25 April 2026` root `pnpm verify` runs typecheck + lint + unit tests + build + server lint + server tests; full sweep green
- 🔴 `25 April 2026` `notes/agents.md`, `notes/dev/dev_setup.md`, `notes/dev/testing.md` filled out
- 🔴 `25 April 2026` `README.md` rewritten with stack, layout, and common commands

### phase 1 - domain core + dates

- 🔴 `25 April 2026` `utils/result.ts` discriminated-union helper for parser and validator boundaries
- 🔴 `25 April 2026` `HaracalndeDate` class with FamilyScript / GEDCOM / narrative parsers and serializers, era arithmetic across the TT/PC boundary, and a 360-day day-index for ordering
- 🔴 `25 April 2026` `gregorian.ts` cosmetic Haracalnde -> Gregorian-year approximation for tooltips
- 🔴 `25 April 2026` `domain/types.ts` Person, CoupleRecord, Tree types
- 🔴 `25 April 2026` `domain/ids.ts` 5-char alphanumeric id generator with rejection sampling and collision retry; `START` sentinel
- 🔴 `25 April 2026` `domain/tree.ts` immutable add / update / remove / linkParent / linkSpouse plus ancestor/descendant/sibling iterators
- 🔴 `25 April 2026` `domain/validate.ts` orphan-reference, cycle, duplicate-spouse, missing-root, invalid-id findings
- 🔴 `25 April 2026` 91 unit tests passing across the date and domain modules

### phase 2 - import / export

- 🔴 `25 April 2026` `io/familyscript/tokens.ts` tag constants and small enum maps
- 🔴 `25 April 2026` `io/familyscript/parse.ts` tab-split tokenizer covering all 15 person tags + `e<n>` couple records; preserves V-tag and other extras for round-trip
- 🔴 `25 April 2026` `io/familyscript/serialize.ts` canonical-order serializer with golden snapshot stable across two round-trips
- 🔴 `25 April 2026` `io/gedcom/parse.ts` wraps `read-gedcom` (npm) low-level tree, walks INDI / FAM, resolves _MARNM / NPFX / FAMC / FAMS, derives parent links from single-parent FAM records the way FamilyEcho exports them
- 🔴 `25 April 2026` `io/gedcom/serialize.ts` deterministic xref allocation, HEAD round-trip, FAM derived from observed (mother, father) pairings; golden snapshot stable across two round-trips
- 🔴 `25 April 2026` `io/detect.ts` filename + magic-byte format sniffer (familyscript / gedcom / gedzip)
- 🔴 `25 April 2026` `io/merge/merge.ts` dual-import merge: name+year matcher, field-conflict resolver, spouse and couple union; verified against the real-world Akarians .txt + .ged dual import
- 🔴 `25 April 2026` `io/warnings.ts` per-target export warnings (portraits dropped for FS, anchor/locationOrigin/display dropped for GEDCOM, etc.)
- 🔴 `25 April 2026` `io/bundle/{read,write}.ts` GEDZIP-style bundle (`gedcom.ged` + `media/<personId>.<ext>`) using fflate
- 🔴 `25 April 2026` 146 unit tests passing across phase 1 + phase 2

### weird-families relaxation (post-phase-2 audit)

- 🔴 `25 April 2026` `linkSpouse` accepts self-couples (single-id `CoupleRecord`); `validate` flags them with a non-blocking `self-couple` finding
- 🔴 `25 April 2026` GEDCOM emit + parse: same-sex marriages serialized as duplicate `1 HUSB` or `1 WIFE` tags; `applyFam` walks all spouse roles and emits one `CoupleRecord` per pair
- 🔴 `25 April 2026` `linkParent` no longer rejects cycles; `validate` already flags them as findings (matches the importer behavior)
- 🔴 `25 April 2026` retired `io/familyscript/serialize.ts` and the gedcom plain-export warning target; only GEDZIP and (future) JSON are export targets going forward
- 🔴 `25 April 2026` `domain/schema.ts` schema-version registry + migration runner; GEDZIP bundles ship `manifest.json` with `schemaVersion`/`createdBy`/`createdAt`; reader migrates forward and refuses bundles stamped newer than this build

### phase 3 - render + edit

- 🔴 `25 April 2026` `state/{tree,selection,viewport}.svelte.ts` runes-based stores; tree store carries snapshot-based undo/redo capped at 200 entries
- 🔴 `25 April 2026` `layout/relativesTreeAdapter.ts` adapts domain `Tree` into `relatives-tree` `Node[]` and runs `calcTree`; orphan refs and self-spouses filtered before layout
- 🔴 `25 April 2026` `components/ui/Button.svelte`, `components/form/Field.svelte`, `components/form/DateInput.svelte` (parses on blur via `HaracalndeDate.parseNarrative`)
- 🔴 `25 April 2026` `components/editor/PersonEditor.svelte` `<dialog>`-based form covering given/surname/title/gender/birth/death/occupation/location/display
- 🔴 `25 April 2026` `components/tree/{PersonNode,EdgeLayer,TreeCanvas}.svelte`; canvas uses svg with `<foreignObject>`-hosted PersonNode cards and `@panzoom/panzoom` on the inner `<g>`
- 🔴 `25 April 2026` `App.svelte` shell rewritten: top bar (undo/redo/import/export), import dispatches via `detectFormat` to `parseFamilyScript` / `parseGedcom` / `readBundle`, export emits a `.gdz` blob via `writeBundle`
- 🔴 `25 April 2026` vitest config picks up `tests/component/**/*.test.ts`, jsdom + `@testing-library/svelte`, `resolve.conditions: ['browser']` so the svelte plugin returns the client build
- 🔴 `25 April 2026` 21 component tests across `DateInput`, `PersonNode`, `PersonEditor`; e2e import-edit flow loads `tiny.ged`, opens the editor on double-click; `pnpm verify` green at 192 unit + 4 e2e

### phase 4 - persistence + portraits + wiki

- 🔴 `26 April 2026` `persistence/{db,trees,blobs,settings}.ts` Dexie schema (trees / blobs / settings); CRUD helpers parameterised on a `FamilyTreeDb` instance for testability; trees stored as JSON-cloned plain objects to side-step Svelte 5 `$state` proxies + structured-clone
- 🔴 `26 April 2026` `state/autosave.ts` debounced (1s default) sync of `treeStore.tree` into Dexie; flushes in-flight saves on demand; orphan-blob GC after each save; emits `onSaved` / `onError` callbacks for the toast layer
- 🔴 `26 April 2026` `state/portraitUrls.svelte.ts` `Map<blobId, objectURL>` rune store with on-demand fetch + revoke on tree swap or blob change
- 🔴 `26 April 2026` `wiki/linkResolver.ts` builds `wikiUrlFor(title, baseUrl?)` with default `https://attuproject.org`; PersonEditor exposes a "view ↗" button when `wikiTitle` is set; configurable via `VITE_WIKI_BASE_URL`
- 🔴 `26 April 2026` `components/editor/CropperDialog.svelte` lazy-imports cropperjs, outputs `image/webp` quality 0.85 at 600×600; CSS pulled from jsdelivr to keep the initial bundle slim
- 🔴 `26 April 2026` `components/editor/PortraitField.svelte` upload + thumbnail control; saves via `putBlob`, dispatches `portraitBlobId` patches; `TreeCanvas` resolves `portraitBlobId → URL` through the cache so cards show their portrait at zoom level 0
- 🔴 `26 April 2026` `components/shell/RecentTrees.svelte` top-bar dropdown; new/load/delete actions; updates `lastOpenedTreeId` setting
- 🔴 `26 April 2026` `state/tree.svelte.ts` adds `dirty` + `hydrate(tree)` so the autosave effect can distinguish user mutations from initial Dexie load
- 🔴 `26 April 2026` 222 unit tests (11 persistence, 6 autosave, 4 wiki); 8 e2e (4 import-edit + persistence-roundtrip on chromium + mobile); `pnpm verify` green

### phase 5 - backend + auth + sync

- 🔴 `26 April 2026` `apps/server/attu_tree/settings.py` pydantic-settings `Settings` with database_url, session/hmac secrets, cookie path, cors origins, initial admin discord id
- 🔴 `26 April 2026` `apps/server/attu_tree/db.py` aiosqlite connection lifecycle, WAL mode, migration runner (numbered `.sql` files tracked in `_meta` table)
- 🔴 `26 April 2026` `apps/server/attu_tree/migrations/001_initial.sql` schema: users (uuid pk, discord_id, role), sessions, link_codes, trees (uuid pk), tree_grants, tree_revisions
- 🔴 `26 April 2026` `apps/server/attu_tree/auth/` — hmac verification middleware (`X-Attu-Timestamp` + `sha256=` sig, ±300s skew), session helpers (create/resolve/delete), `current_user` / `optional_user` / `current_admin` FastAPI deps
- 🔴 `26 April 2026` link-code auth flow: web calls `POST /api/auth/start` → pre-issued session cookie + 6-char code; user runs `/trees link code:XXXXXX` on Discord; bot calls `POST /api/bot/auth/link` carrying `roles: list[str]` from the discord side; server filters to known roles and binds the session
- 🔴 `26 April 2026` `apps/server/attu_tree/routers/trees.py` full CRUD + per-tree grants (add/revoke by discord_id); revision-checked `PUT /api/trees/{id}` returns 200 on match, 409 `TreeConflictResponse` on mismatch
- 🔴 `26 April 2026` `apps/server/attu_tree/routers/bot.py` bot-only endpoints (HMAC-gated): link auth, list user trees, add/revoke grants, issue view-link
- 🔴 `26 April 2026` `apps/server/attu_tree/routers/admin.py` admin-only: list users (paginated), rename display_name, soft-delete + session revoke. role mutation lives on the discord side, not here
- 🔴 `26 April 2026` `packages/api-client/src/index.ts` hand-written TypeScript types matching all server pydantic models; `apps/web/src/lib/api/client.ts` typed fetch wrapper with 401/409 handling
- 🔴 `26 April 2026` `apps/web/src/lib/state/auth.svelte.ts` and `sync.svelte.ts` runes stores; `LinkCodeDialog`, `AuthBar`, `ShareDialog`, `AdminPanel` shell components; `App.svelte` wires auth, sync, conflict toast, read-only view route
- 🔴 `26 April 2026` 45 server tests (auth, trees, bot, admin, health) green; `pnpm verify` green (45 server + 231 web)
- 🔴 `26 April 2026` `Dockerfile` (root) 3-stage combined build (SPA + Python venv + runtime); `docker-compose.yml` `family-tree` service with `external: attu_dev` network, `/trees/` cookie path, `family-tree-data` volume; `apps/web/Dockerfile` standalone SPA builder
- 🔴 `26 April 2026` `notes/features/bot-integration.md` full interface contract for doom-bot team (HMAC scheme, all endpoints, slash command shapes, ephemeral message conventions)

### round 1 hardening (post-audit)

- 🔴 `26 April 2026` GEDCOM `OBJE` round-trip on portraits: bundle writer hands serializer a `personId → media/<personId>.<ext>` map; serializer emits `1 OBJE / 2 FILE` under matching INDIs; parser stops flagging OBJE as a dropped subtag
- 🔴 `26 April 2026` GEDCOM `MARR / DATE / _PRIMARY / _CURRENT` round-trip on `CoupleRecord` (new `marriageDate?`, `isPrimary?`, `isCurrent?` optional fields; no schema bump needed); parser tests + serializer golden refreshed
- 🔴 `26 April 2026` orphan-blob GC capped: now sweeps every `gcEvery` saves (default 20) instead of every save; new `gcEvery` autosaver option for tests
- 🔴 `26 April 2026` `loadFromRecents` race fix: `autosaver.cancel()` after `treeStore.hydrate()` drops any save scheduled mid-load; the previous `flush() → loadTree()` ordering left a window where an in-flight debounce could race the swap
- 🔴 `26 April 2026` auth model rework: `POST /api/bot/auth/link` accepts `roles: list[str]`; server filters to known roles (`admin`, `user`), drops unknown strings, applies on every link so discord role changes propagate; bootstrap-admin election + `INITIAL_ADMIN_DISCORD_ID` removed; in-app role mutation removed from `routers/admin.py` + `AdminUserUpdateRequest`. closes the f-string column-list audit finding
- 🔴 `26 April 2026` link-code redemption made race-safe via atomic `UPDATE … WHERE consumed_at IS NULL` + `INSERT … ON CONFLICT(discord_id) DO UPDATE` upsert; closes the link-code-race + bootstrap-admin-race audit findings without needing explicit `BEGIN IMMEDIATE`. new `test_concurrent_redeem_only_one_wins` verifies
- 🔴 `26 April 2026` admin cross-tree authority covered by tests: read / edit / delete / share / revoke on trees the admin doesn't own all green via the existing `tree_owner` bypass in `trees/access.py`
- 🔴 `26 April 2026` HMAC timestamp upper-bound clamp (rejects implausibly large epochs before the skew comparison); session cookie `samesite=strict`; `TreeCreateRequest.blob` + `apply_save` enforce `settings.max_tree_blob_bytes` (default 10 MB) with 413 on overflow
- 🔴 `26 April 2026` link code reshape + dev/prod routing partition: codes are now `AB-123456` (2 alpha, dash, 6 digits); the second alpha char encodes the environment (dev = X/Z, prod = the other 22 letters) so a single bot deployment can route `/trees link` to the correct backend just by inspecting char[1]. server normalises any input form (case, dash, whitespace). new `settings.environment: Literal['dev', 'prod']` plumbing; bot-integration.md §3.1b documents the partition for the bot team. covered by 3 new tests in `test_auth.py`

---

## meta

### format

open item: `- ⭕ \`priority\` \`effort\` description`

completed item: `- 🔴 \`26 March 2026\` description`

priority levels (highest to lowest): `high priority`, `medium priority`, `low priority`, `future idea`

effort levels: `no effort`, `low effort`, `medium effort`, `high effort`, `very high effort`

items without a checkbox are recurring; they repeat each maintenance cycle rather than being tracked as one-time work. these live in the `## meta` section.

when an item is completed, move it to the `# completed` section under the appropriate category, strip the priority/effort tags, and add a date stamp. sort completed entries chronologically within each category (oldest first). remove completed entries that are no longer relevant and not referenced by any open to-do. increment `total_completed` in the metadata each time an item is marked done.

when adding a new item, sort it into the appropriate section by topic, or add a new section if none fits. assign priority and effort tags. if the scope, priority, or effort is unclear, ask clarifying questions before adding. split larger projects into multiple entries.

### sections

- **to-do** - active items grouped by area; sorted within each section by priority (high first)
- **completed** - done items kept for reference; sorted chronologically; pruned when no longer relevant
- **meta** - this section; describes the doc format and holds recurring maintenance tasks

### metadata

```yaml
last_updated: 26 April 2026
total_completed: 71
```
