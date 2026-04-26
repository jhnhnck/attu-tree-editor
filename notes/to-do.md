# FamilyTreeEditor to-do list

_see the [meta](#meta) section at the end of this file for format reference._

---

## tasks

### phase 1 - domain core + dates

_phase 1 complete; see the completed section below_

### phase 2 - import/export

_phase 2 complete; see the completed section below_

- ⭕ `medium priority` `low effort` OBJE block emission for portraits in the GEDCOM serializer (currently dropped with a finding; needs the portrait bundle linker from phase 4)
- ⭕ `medium priority` `low effort` MARR / `_PRIMARY` / `_CURRENT` round-trip on CoupleRecord (currently dropped with a finding)

### phase 3 - render + edit

_phase 3 complete; see the completed section below_

- ⭕ `medium priority` `low effort` editor cannot clear optional fields (title, occupation, location, birth, death) - `Partial<Person>` plus `exactOptionalPropertyTypes` forbids passing `undefined` through; needs an explicit "clear" sentinel or a refactored `updatePerson` signature
- ⭕ `low priority` `low effort` person count of relatives-tree layout for ~1800 nodes hasn't been profiled; canvas may need a virtualization pass before phase 6 mobile work

### phase 4 - persistence + portraits + wiki

- ⭕ `high priority` `medium effort` dexie schema (trees, blobs, settings); debounced autosave
- ⭕ `high priority` `medium effort` `CropperDialog.svelte` lazy-imports cropperjs; blobs in dexie
- ⭕ `medium priority` `low effort` `wiki/linkResolver.ts` opens `wikiTitle` in a new tab using configurable base url
- ⭕ `medium priority` `low effort` recent-trees list on the shell

### phase 5 - backend + auth + sync

- ⭕ `high priority` `medium effort` server `db.py` aiosqlite pool + initial migration
- ⭕ `high priority` `medium effort` discord magic-code flow with hmac verification of doom-bot callbacks
- ⭕ `high priority` `medium effort` session cookie middleware
- ⭕ `high priority` `high effort` trees crud + per-user share grants
- ⭕ `high priority` `high effort` revision-checked autosave with field-level merge
- ⭕ `high priority` `medium effort` openapi -> ts client into `packages/api-client/`
- ⭕ `medium priority` `medium effort` doom-bot `/link account` slash command (separate pr in that repo)

### phase 6 - polish + a11y + mobile + gadget

- ⭕ `high priority` `medium effort` keyboard navigation across nodes (roving tabindex)
- ⭕ `high priority` `medium effort` aria roles for tree (`role="tree"`, `treeitem`)
- ⭕ `high priority` `medium effort` mobile bottom-sheet variant of the editor panel
- ⭕ `medium priority` `low effort` minimap + search-by-name popover
- ⭕ `high priority` `medium effort` second vite build target producing iife + css string for mediawiki gadget
- ⭕ `medium priority` `medium effort` `wiki/gadget.ts` exporting `init(mountEl, options)` for resourceloader

### tooling / infra

- ⭕ `low priority` `low effort` revisit prettier-plugin-tailwindcss once upstream supports svelte 5
- ⭕ `low priority` `low effort` add `pnpm verify` to a github actions workflow
- ⭕ `future idea` `medium effort` real-time multi-user collaboration via websocket

### schema evolution (gates a schema version bump each)

- ⭕ `future idea` `high effort` replace `motherId` / `fatherId` with `parentIds: PersonId[]` (each entry carries optional `role: 'mother' | 'father' | 'parent' | 'progenitor'` and `pedi: 'birth' | 'adopted' | 'foster'`); supports asexual / multi-parent / non-binary single parents; ships with a v1 -> v2 migration in `domain/schema.ts`
- ⭕ `future idea` `medium effort` add generic `relationships: { kind: 'transformed-from' | 'alias-of' | 'sworn-bond' | 'master-apprentice' | ...; targetId; notes? }[]` for transmutation, alias, adoption-not-yet-mapped, and other fictional bonds; ships with a v2 -> v3 migration
- ⭕ `future idea` `low effort` add `birthOrder?: number` on `Person` for twin / triplet / cohort ordering inside a sibship (currently lost — sibship is derived from shared parents only); ships with a v3 -> v4 migration

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
last_updated: 25 April 2026
total_completed: 40
```
