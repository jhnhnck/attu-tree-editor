# FamilyTreeEditor to-do list

_features, polish, deployment plumbing, and "could be nicer" work. defects with observable wrong behavior are tracked in [bugs.md](bugs.md). see the [meta](#meta) section at the end of this file for format reference._

---

## tasks

### canvas + layout

- ⭕ `medium priority` `high effort` virtualisation / tiling for very large trees - at zoom-out with ~1800 nodes the SVG edge layer renders all segments in one `<path>` per role (no per-tick re-render thanks to `vector-effect: non-scaling-stroke`), and 1800 absolutely-positioned PersonNode hosts is the dominant cost. Options: (a) tile the canvas spatially and only mount card hosts whose tile intersects the viewport; (b) at level 4 / 5, render cards as a single `<canvas>` overlay (one draw call) instead of N divs; (c) HTML5 `<canvas>` for edges if the SVG path approach hits its ceiling. Currently usable but laggy on a 1.8K-node tree at low zoom 🎯 *planned in [family-view.md](plans/family-view.md)*
- ⭕ `medium priority` `high effort` orthogonal edge routing with obstacle avoidance - even after spouse-duplication, some long bonds + sibling-bus segments still pass through other cards. The multi-spouse and negative-drop defects in [bugs.md](bugs.md) are concrete instances; the same issue shows up for sibling-bus segments that span past intervening cards above/below the row. Implement A* over a sparse routing graph (corners of card AABBs + row-gutter alignment lines) so edges bend around any card they would otherwise visually cross. Polish layer; the targeted bug fixes are higher-ROI prerequisites 🎯 *planned in [family-view.md](plans/family-view.md), [relationship-vocabulary.md](plans/relationship-vocabulary.md)*
- ⭕ `medium priority` `high effort` hide unrelated branches based on the selected person - needs a "related-to" rule (default: ancestors + descendants + spouses); expose as a View menu toggle so users can flip between full tree and focused view 🎯 *planned in [family-view.md](plans/family-view.md)*
- ⭕ `medium priority` `medium effort` zoom-aware label sizing - shrink card padding and grow text size as zoom decreases so the next-level-up card stays readable as long as possible (PersonNode + the `levelFromScale` thresholds in TreeCanvas) 🎯 *planned in [family-view.md](plans/family-view.md)*
- ⭕ `medium priority` `medium effort` selectable lineage trace - clicking an edge (or a person + an "trace" action) highlights a chain through the graph in a unique color so the user can see where a relationship goes; pairs naturally with the "hide unrelated branches" toggle 🎯 *planned in [family-view.md](plans/family-view.md)*
- ⭕ `medium priority` `low effort` hover tooltip at far zoom levels - PersonNode at level 4 (initials) and 5 (dot) drops the name; add a native `title` or floating tooltip showing the full name + dates so users can identify cards before zooming in
- ⭕ `medium priority` `low effort` minimap + search-by-name popover
- ⭕ `medium priority` `low effort` PersonNode portrait area is too short - the portrait crop reads as a thin band rather than a face; either grow the portrait slot vertically or rebalance card padding so the face has proportional height to the name/dates block 🎯 *planned in [family-view.md](plans/family-view.md)*
- ⭕ `low priority` `medium effort` edge lines should grow thicker / darker as the canvas zooms out so the topology stays readable when individual cards become unreadable. Tried inline `stroke-width = basePx / scale` on the bucket paths (Layer 3) but it forced the browser to re-stroke the entire path geometry on every wheel tick and added visible lag; reverted to `vector-effect: non-scaling-stroke`. Right approach: precompute per-zoom-level CSS classes (e.g. `.zoom-far`, `.zoom-mid`) and toggle one class on the host element instead of inline-styling the path

### editing

- ⭕ `medium priority` `low effort` add `add sibling` to the per-person right-click context menu; currently the menu offers add parent / partner / child but not sibling, even though the Insert menu / shortcut path supports it
- ⭕ `medium priority` `low effort` "add relative" should pre-fill the new person's surname from the anchor person (parent / partner / child / sibling all share a surname by default); user has to retype it every time 🎯 *planned in [family-view.md](plans/family-view.md)*
- ⭕ `low priority` `low effort` wiki title field should autocomplete from the wiki - query `/w/api.php?action=opensearch&search=...` and offer suggestions in the person editor / inspector Details tab

### a11y + keyboard + mobile

- ⭕ `high priority` `medium effort` keyboard navigation across nodes (roving tabindex)
- ⭕ `high priority` `low effort` arrow keys should pan the canvas (up / down / left / right) - currently they do nothing when focus is on the canvas
- ⭕ `high priority` `medium effort` aria roles for tree (`role="tree"`, `treeitem`)
- ⭕ `high priority` `medium effort` mobile bottom-sheet variant of the editor panel

### shell + UI

- ⭕ `medium priority` `medium effort` user-settings dialog (localStorage-backed) - theme override (light / dark / auto; today the app follows `prefers-color-scheme` only), inspector side (left / right), and any other ergonomic toggles that don't need server persistence; replaces the stubbed `app.settings` shortcut and Edit > Settings menu item
- ⭕ `medium priority` `low effort` unified loading-bar / progress indicator - generic UI for long operations (import, autosave flush, server push, layout recompute on big trees); replaces the scattered `reading file…` toast pattern with a top-of-canvas progress strip

### backend + sync + security

- ⭕ `high priority` `high effort` field-level merge on autosave conflict (currently last-write-wins via revision check; needs per-field diff + merge for concurrent edits to different people)
- ⭕ `low priority` `low effort` rate-limit `/api/auth/start` and tree-id-keyed routes against enumeration / abuse; deferred from the security audit because impact is low (CORS allowlist already blocks the cross-origin read path) but worth doing before opening the service to the wider public
- ⭕ `low priority` `low effort` document the deployment-time invariant that `cors_origins` must be an explicit allowlist (never wildcard) when `allow_credentials=True`; add a startup assertion in `main.py` if we want it enforced
- ⭕ `future idea` `medium effort` real-time multi-user collaboration via websocket

### wiki integration

- ⭕ `future idea` `medium effort` decide and prototype a wiki integration story (mechanism tbd; the original mediawiki-gadget approach is shelved)

### schema evolution (gates a schema version bump each)

🎯 *all items below planned in [relationship-vocabulary.md](plans/relationship-vocabulary.md).*

- 🟢 `claimed` replace `motherId` / `fatherId` with `parentIds: ParentRef[]` (each entry carries optional `role` and `pedi`); supports asexual / multi-parent / non-binary single parents; ships with a v1 -> v2 migration in `domain/schema.ts`. **Closed by relationship-vocabulary Phase 2a (data + migration) + Phase 2b.2 (caller migration + legacy field removal).**
- ⭕ `future idea` `medium effort` add generic `relationships: { kind: 'transformed-from' | 'alias-of' | 'sworn-bond' | 'master-apprentice' | ...; targetId; notes? }[]` for transmutation, alias, adoption-not-yet-mapped, and other fictional bonds; ships with a v2 -> v3 migration
- ⭕ `future idea` `low effort` add `birthOrder?: number` on `Person` for twin / triplet / cohort ordering inside a sibship (currently lost — sibship is derived from shared parents only); ships with a v3 -> v4 migration
- ⭕ `future idea` `low effort` add optional `name?: string` to `CoupleRecord` so families can be referenced by a chosen surname / household name (currently no way to rename families); ships with a v? -> v? migration and an Inspector Connections-tab UI to set it

### tooling + docs

- ⭕ `medium priority` `medium effort` debug toolbox overhaul - the Ctrl+Shift+D panel currently floats top-center with bare checkboxes (`App.svelte:1130-1182`, drives `DebugOverlay.svelte`). Wanted:
  - **anchor**: move panel to bottom-left, stacked directly above the people-count stats pill (currently bottom-left at `App.svelte` people-count pill); panel grows upward from there
  - **discovery pill**: first time Ctrl+Shift+D is pressed in a session/profile, latch a `debug.discovered` flag in `persistence/settings.ts`; show a small bug-icon pill (lucide `bug`) immediately to the right of the stats pill that toggles the panel on click. Panel has a "hide debug pill" option that clears the flag and removes the pill again (panel stays reachable via the shortcut)
  - **toggle switches** instead of checkboxes; reuse the toggle component used in the Inspector Connections tab (married / primary toggles) for visual consistency
  - **sectioned layout** with headers - candidates: `layout` (unit grid, node bounds, component bounds, segment ids), `routing` (ghost arrows, bridge hops, overlap pairs), `runtime` (expose `window.__treeDebug`), plus the new sections below
  - **proposed new "secret" options** to land alongside the rework:
    - `layout timing` corner readout - ms per pass (layer / order / place / route) + total; useful for the 1.8K-node lag investigation
    - `topology hash` corner readout - current `editRev` + content hash from `layout.worker.ts`; verifies the worker-cache key
    - `cycle nodes` highlight - draws a red ring around `LayeredGraph.cycleNodes` entries (the field already exists per the recent layer.ts cycle warning)
    - `bond / centroid delta` markers - small caret showing children-centroid x vs bond-midpoint x for each couple; would have surfaced the recent same-rank bond-stub bug visually
    - `orphan badge` - flags people with no parents, no spouse, and no children (data hygiene)
    - `rank gutter labels` - draws the rank index (0, 1, 2, …) in the left margin so the layered structure is legible at a glance
    - `last-edit halo` - 1-second yellow halo around whatever card was most recently mutated; helps verify that an edit actually re-laid-out
    - `copy layout snapshot` button - dumps the placed/routed IR to clipboard as JSON for bug reports
    - `engine quick-switch` row - one-click toggle between layered / hyperbolic without going through View menu
    - `dump tree json` / `load tree json` pair - paste a tree into the textarea for repros without going through file import
    - `force conflict` action - artificially bumps server revision so the next autosave hits the 409 path; exercises `ShareDialog` / `SaveStatusPill` conflict UI
- ⭕ `medium priority` `low effort` update `notes/features/keyboard-shortcuts.md` to reflect what actually shipped: drop Mod+N (browser new-window), Mod+Shift+N (browser private-window) and Mod+1 (browser tab-1) from the canonical spec; document the soft-conflict pattern where Mod+S/O/P/D/I/E/0 work via `preventDefault` like Figma/VS Code; add a "browser-safe" rule of thumb for future bindings
- ⭕ `low priority` `low effort` revisit prettier-plugin-tailwindcss once upstream supports svelte 5
- ⭕ `low priority` `low effort` `.claude/skills/layout-worker/` skill - capture the IR worker-boundary discipline once the Web Worker layout refactor lands: wire types vs. live types (`hydrateLayered/Ordered/Placed`), no functions / no `Map` instances across `postMessage`, `layoutSeq` race-handling for stale responses, the four-pass purity contract. defer until the refactor stabilises; one-off architectural skill, only worthwhile if a second worker gets added later
- ⭕ `low priority` `low effort` `.claude/skills/schema-evolution/` skill - capture the migration pattern for the queued schema bumps (parents 1.0.0→2.0.0, unions 2.0.0→3.0.0, relationships 3.0.0→3.1.0, identity 3.1.0→3.2.0, groups 3.2.0→3.3.0, sibship 3.3.0→3.4.0): semver registry shape in `domain/schema.ts`, GEDZIP `manifest.json` stamping, semver-aware refusal-of-major-newer-than-build / accept-minor-newer-with-finding on read, the v(N-1) round-trip test convention. 🎯 *planned in [relationship-vocabulary.md](plans/relationship-vocabulary.md)*

### housekeeping

- `high priority` `low effort` assign any to-dos without an effort or category; update priorities; move completed and sort all

---

## completed

_no entries; cleared on 14 May 2026._

---

## meta

### format

open item: `- ⭕ \`priority\` \`effort\` description`

completed item: `- 🔴 \`26 March 2026\` description`

cross-reference to a plan file: append `🎯 *planned in [<file>.md](<path>)*` to the item, or hoist it onto a section header line if every item in the section shares the same plan. keep it terse - no inline rationale.

priority levels (highest to lowest): `high priority`, `medium priority`, `low priority`, `future idea`

effort levels: `no effort`, `low effort`, `medium effort`, `high effort`, `very high effort`

items without a checkbox are recurring; they repeat each maintenance cycle rather than being tracked as one-time work. these live in the `### housekeeping` subsection.

when an item is completed, move it to the `# completed` section under the appropriate category, strip the priority/effort tags, and add a date stamp. sort completed entries chronologically within each category (oldest first). remove completed entries that are no longer relevant and not referenced by any open to-do. increment `total_completed` in the metadata each time an item is marked done.

when adding a new item, sort it into the appropriate section by topic, or add a new section if none fits. assign priority and effort tags. if the scope, priority, or effort is unclear, ask clarifying questions before adding. split larger projects into multiple entries.

defects with observable wrong behavior (a wrong line on the canvas, a focused field that swallows input, a stuck cursor) belong in [bugs.md](bugs.md), not here. missing functionality, polish, deployment plumbing, and architectural improvements stay here.

### sections

- **to-do** - active items grouped by area; sorted within each section by priority (high first)
- **completed** - done items kept for reference; sorted chronologically; pruned when no longer relevant
- **meta** - this section; describes the doc format and holds recurring maintenance tasks

### metadata

```yaml
last_updated: 14 May 2026
total_completed: 0
```
