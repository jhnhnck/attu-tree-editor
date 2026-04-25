# FamilyTreeEditor to-do list

_see the [meta](#meta) section at the end of this file for format reference._

---

## tasks

### phase 1 - domain core + dates

_phase 1 complete; see the completed section below_

### phase 2 - import/export

- ⭕ `high priority` `medium effort` FamilyScript tokenizer (`i ^ g p l q b d m f s T j z V` + `e<n>` couple records)
- ⭕ `high priority` `medium effort` FamilyScript serializer; byte-stable round-trip on the example file
- ⭕ `high priority` `medium effort` GEDCOM parse via read-gedcom; map BC -> TT, ABT preserved, OBJE -> portrait refs
- ⭕ `high priority` `medium effort` GEDCOM serialize via gedcom-io; emit OBJE blocks for portraits
- ⭕ `medium priority` `medium effort` zip bundle reader/writer for `.ged` + `portraits/` archives
- ⭕ `medium priority` `low effort` export warning ui listing fields that will be dropped per format
- ⭕ `high priority` `low effort` golden snapshot tests committed for both example files

### phase 3 - render + edit

- ⭕ `high priority` `low effort` relatives-tree adapter that takes domain tree -> layout positions
- ⭕ `high priority` `high effort` `TreeCanvas.svelte` with svg root and panzoom
- ⭕ `high priority` `medium effort` `PersonNode.svelte` with portrait, name, dates, faded `z0` styling
- ⭕ `high priority` `medium effort` `EdgeLayer.svelte` for parent/spouse lines
- ⭕ `high priority` `medium effort` `PersonEditor.svelte` panel inside `<dialog>` with `DateInput`
- ⭕ `medium priority` `medium effort` undo/redo via patches on the runes tree state
- ⭕ `medium priority` `low effort` component tests for `PersonNode`, `DateInput`

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
total_completed: 17
```
