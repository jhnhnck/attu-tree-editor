# FamilyTreeEditor to-do list

*features, polish, deployment plumbing, and "could be nicer" work. defects with observable wrong behavior are tracked in [bugs.md](bugs.md). see the [meta](#meta) section at the end of this file for format reference.*

---

## tasks

### family-view

- :o: `medium priority` `medium effort` family-view crossing-min algorithm upgrade - the barycentric slot-index pass landed with a monotone gate but is a measured no-op on every production fixture (akarians root=1/dense=4/leaf=0, dense-tree=9, multi-union=0; all delta=0) including the secondary-union-expanded configuration. root cause is structural, not fixture-dependent: edges sharing a person (couple-bus + parent-stem + sibling-bus + per-kid stubs all share the partner pair) are filtered out of the strict-cross definition, so the heuristic improvements don't translate to fewer geometric crossings. options: median barycentric, alternating inward sweep, or per-swap geometric-crossing transposition. monotone gate guarantees no harm in the meantime. baseline measurement lives in `apps/web/tests/unit/engines/family-view/crossings-baseline.test.ts`.
- :o: `medium priority` `low effort` family-view union-fan ordering puts focus at the *edge* of rank 0 instead of the centre - when a 2-expanded focus renders with primary + secondary, planRank iterates `tree.couples` and emits a `couple` slot for the primary union (containing focus + primary partner) followed by a `single` slot for the secondary partner. visible in `tests/e2e/visual-secondary-union.spec.ts-snapshots/` as the secondary couple-bus running diagonally across the primary-partner card. ideal: focus in the middle with both partners flanking, both buses short + non-crossing. fix: ~10 lines in `planRank` to detect a focus with expanded secondary unions and emit slots in `[primary-partner, focus, secondary-partner]` order; visual golden re-baselines on close.
- :o: `low priority` `low effort` family-view sibling-bus emits `role: "blood"` uniformly even when every kid of the couple is a half-sibling - per-kid stubs already carry the correct role; only the bus itself is uniform. visually fine today, but a relationship-vocabulary palette enrichment may want bus-level role accuracy.
- :o: `low priority` `low effort` family-view smooth-diff edges jump-cut while cards slide - position tweens use CSS-transition-on-transform (250ms cubic-bezier), but the SVG `<path>` `d` attribute doesn't compose with CSS transitions, so the polylines connecting cards snap to their new shape instantly while cards translate over 250ms. not flicker, just motion mismatch. resolution options: (a) tween `d` via `requestAnimationFrame` path interpolation (~50 lines; some perf cost on dense layouts); (b) ship a small lib (e.g. motion's SVG plugin, ~5 KB) — engages the reactive cycle though; (c) extract endpoints from card positions and route edges through `<line>` primitives instead of `<path>` so CSS-transition handles them — most invasive.
- :o: `low priority` `low effort` family-view cards + collapse badges mount/unmount jump-cut - smooth-diff stops at position tweens; new cards entering the visible set on expansion appear instantly rather than fading in. svelte's `transition:fade={{ duration: 200 }}` directive on the keyed `each` block would close it but adds reactivity-cycle interaction the spike intentionally avoided. natural bundle with the SVG edge tween above.
- :o: `low priority` `low effort` family-view `parentsOfPerson` / `childrenOfPerson` in `engines/family-view/layout.ts` walk `tree.couples` and `getUnions(tree)` linearly per call - acceptable at the bounded ≤30 visible cards (the barycentric pass calls these O(MAX_ITERS × ranks × slots × persons) times = ~few hundred ops total on akarians). would matter if a future change lifts the bounded-window cap, at which point a per-tree precomputed `childrenIndex: Map<PersonId, PersonId[]>` would amortise.
- :o: `low priority` `low effort` family-view `.is-portrait-pending` slot background transition is unguarded - the slot snaps from neutral grey to the resolved portrait the instant the blob URL resolves. fix: `transition: background-image 80ms ease-out` on the existing rule. fixture exercise requires a portrait-bearing fixture (dense-tree has none).
- :o: `low priority` `low effort` family-view collapse-badge hover label is generic ("show more of this branch") instead of describing the hidden cohort - badge already carries `members` and a `sampleName` per `FamilyViewCanvas.svelte:1192`; render e.g. "next gen: Alice, Bob, and 5 others" so the action's effect is predictable before click
- :o: `low priority` `low effort` View > Advanced submenu surfacing the family-view flags-without-UI - 4 flags currently live in localStorage with `null → on` defaults: `fte.zoom.semantic100`, `fte.layout.familyViewCrossingMin`, `fte.overlays.smoothDiff`, `fte.layout.familyViewSecondaryUnion`. power-users have rollback via `localStorage.setItem(key, "false")` but most users will never discover them. surface all four (plus crispEdges opt-out per next item) as a single View > Advanced submenu rather than dripping individual toggles.
- :o: `low priority` `no effort` `.family-view-edge { shape-rendering: crispEdges }` applies at every zoom level - fine for the family-view geometry today (predominantly axis-aligned strokes; integer-pixel `edgePath` coords) but would need an opt-out if a future family-view feature introduces diagonals (relationship-vocabulary decorators e.g. sloped sworn-bond strokes already exist as `.family-view-overlay` siblings, not `.family-view-edge`, so they're unaffected today). flag for review when work touches family-view diagonals.

### tree-view (layered engine)

- :o: `medium priority` `high effort` virtualisation / tiling for very large trees - at zoom-out with ~1800 nodes the SVG edge layer renders all segments in one `<path>` per role (no per-tick re-render thanks to `vector-effect: non-scaling-stroke`), and 1800 absolutely-positioned PersonNode hosts is the dominant cost. Options: (a) tile the canvas spatially and only mount card hosts whose tile intersects the viewport; (b) at level 4 / 5, render cards as a single `<canvas>` overlay (one draw call) instead of N divs; (c) HTML5 `<canvas>` for edges if the SVG path approach hits its ceiling. Currently usable but laggy on a 1.8K-node tree at low zoom
- :o: `medium priority` `high effort` orthogonal edge routing with obstacle avoidance - even after spouse-duplication, some long bonds + sibling-bus segments still pass through other cards. The multi-spouse and negative-drop defects in [bugs.md](bugs.md) are concrete instances; the same issue shows up for sibling-bus segments that span past intervening cards above/below the row. Implement A* over a sparse routing graph (corners of card AABBs + row-gutter alignment lines) so edges bend around any card they would otherwise visually cross. Polish layer; the targeted bug fixes are higher-ROI prerequisites
- :o: `medium priority` `medium effort` zoom-aware label sizing - shrink card padding and grow text size as zoom decreases so the next-level-up card stays readable as long as possible (PersonNode + the `levelFromScale` thresholds in TreeCanvas)
- :o: `low priority` `medium effort` edge lines should grow thicker / darker as the canvas zooms out so the topology stays readable when individual cards become unreadable. Tried inline `stroke-width = basePx / scale` on the bucket paths (Layer 3) but it forced the browser to re-stroke the entire path geometry on every wheel tick and added visible lag; reverted to `vector-effect: non-scaling-stroke`. Right approach: precompute per-zoom-level CSS classes (e.g. `.zoom-far`, `.zoom-mid`) and toggle one class on the host element instead of inline-styling the path
- :o: `low priority` `low effort` clicking the "N people" stats pill (layered engine) should show a small stats popover (people, couples, generations, etc.) in-place rather than toggle the inspector - inspector toggle is already covered by View > Show inspector and the right-side aside affordance

### inspector

- :o: `high priority` `medium effort` mobile bottom-sheet variant of the editor panel
- :o: `medium priority` `medium effort` inspector should open in view-mode by default, with an explicit "edit" button to enter edit-mode - today every field is always editable, so casual browsing feels heavy and accidental edits autosave. switch to display-only rendering with an edit toggle per tab (or per section)
- :o: `medium priority` `medium effort` inspector tab + section ordering needs a fresh pass - current ordering (personal, connections, bonds, groups, sibship, details, bio) splits related concerns across tabs and buries common edits. propose a consolidated layout with collapsible sections per tab
- :o: `medium priority` `medium effort` move Bonds, Sibship, and Groups tabs into collapsible sections inside the Connections tab - all three are variants of "relationships to other people"; splitting them across tabs hides them. drops inspector tab count from 7 to ~4 (personal, connections, details, bio)
- :o: `medium priority` `medium effort` Connections-tab parent-type and marriage-date controls are inconsistent in shape - some inline, some expand-on-click. unify under a collapsed-by-default details summary per relationship, expanding on the edit affordance
- :o: `medium priority` `medium effort` gender field should be a dropdown (with type-to-filter and "add new gender…" at the bottom) by default rather than a free-text autocomplete - same pattern for species, kind, origin kind. raises the floor for new users while preserving "anything goes" via the add-new option. pairs with the tree-level customization menu in shell + UI
- :o: `medium priority` `low effort` "add relative" should pre-fill the new person's surname from the anchor person (parent / partner / child / sibling all share a surname by default); user has to retype it every time
- :o: `medium priority` `low effort` Connections tab renders mother + father + extra-parents as three separate UI groups even though `parentIds: ParentRef[]` collapsed them into one list (schema v2, May 14 2026) - drop the mother/father rows in favour of a single parents section with role/pedi inline per entry
- :o: `medium priority` `low effort` pronouns, AGAB, and fluid-identity should collapse under gender by default - currently each is a top-level field in the Personal tab, inflating the form for the common case. collapse the other three behind a "more identity fields" disclosure
- :o: `low priority` `low effort` wiki title field should autocomplete from the wiki - query `/w/api.php?action=opensearch&search=...` and offer suggestions in the person editor / inspector Details tab
- :o: `low priority` `low effort` combine inspector Personal + Details tabs into one - Details only carries occupation, location, wiki title, and display dropdown; folding into Personal under a "more" disclosure trims a tab without losing access
- :o: `low priority` `low effort` remove the AGAB "inferred from identity" option - blank/unset already means the same thing; the extra explicit-inferred option just lengthens the dropdown
- :o: `low priority` `low effort` PersonalTab portrait field takes too much vertical space at the top of the tab - shrink the default portrait widget footprint, or move it inline with the name field
- :o: `low priority` `low effort` person ID should be hidden by default in the inspector header - show on hover / behind a "show id" toggle. shifts the casual-user view toward names and away from internal IDs
- :o: `low priority` `low effort` "set as tree root" gives no visual indicator that the action succeeded - users press the action and aren't sure whether it took effect. add a toast ("Alice is now the tree root") + an inline crown badge on the new root's inspector header

### canvas

- :o: `high priority` `medium effort` keyboard navigation across nodes (roving tabindex)
- :o: `high priority` `medium effort` aria roles for tree (`role="tree"`, `treeitem`)
- :o: `high priority` `low effort` arrow keys should pan the canvas (up / down / left / right) - currently they do nothing when focus is on the canvas
- :o: `medium priority` `high effort` hide unrelated branches based on the selected person - needs a "related-to" rule (default: ancestors + descendants + spouses); expose as a View menu toggle so users can flip between full tree and focused view
- :o: `medium priority` `medium effort` selectable lineage trace - clicking an edge (or a person + an "trace" action) highlights a chain through the graph in a unique color so the user can see where a relationship goes; pairs naturally with the "hide unrelated branches" toggle. **Partially addressed**: selection→focus path highlight ships (on by default, toggleable via View > Overlays > Path highlight). True any-to-any "trace" action remains open.
- :o: `medium priority` `low effort` hover tooltip at far zoom levels - PersonNode at level 4 (initials) and 5 (dot) drops the name; add a native `title` or floating tooltip showing the full name + dates so users can identify cards before zooming in
- :o: `medium priority` `low effort` minimap + search-by-name popover
- :o: `medium priority` `low effort` add `add sibling` to the per-person right-click context menu; currently the menu offers add parent / partner / child but not sibling, even though the Insert menu / shortcut path supports it
- :o: `low priority` `low effort` wheel-zoom sensitivity is too high - small wheel deltas produce large zoom jumps, making fine-tuning hard. tune the per-tick zoom multiplier (search `setScaleAnchored` callers in the canvas wheel handler) and/or add a momentum-decay curve
- :o: `low priority` `no effort` `gender: female` cards render in dark red instead of the intended pink-red - color token mismatch. flag for design-issues.md

### shell + UI

- :o: `medium priority` `high effort` tree-level customization menu for genders, species, bond kinds, etc. - let the tree owner define the canonical dropdown options once, then the dropdowns in PersonalTab / Connections / Bonds consume that tree-scoped list. pairs with the gender-dropdown change in inspector
- :o: `medium priority` `medium effort` user-settings dialog (localStorage-backed) - theme override (light / dark / auto; today the app follows `prefers-color-scheme` only), inspector side (left / right), and any other ergonomic toggles that don't need server persistence; replaces the stubbed `app.settings` shortcut and Edit > Settings menu item
- :o: `medium priority` `medium effort` initial tree load flashes the default sample tree for ~1s before the real tree paints - block rendering until the loaded tree resolves, or paint a generic spinner over an empty canvas. natural pairing with the unified loading-bar item below
- :o: `medium priority` `low effort` unified loading-bar / progress indicator - generic UI for long operations (import, autosave flush, server push, layout recompute on big trees); replaces the scattered `reading file…` toast pattern with a top-of-canvas progress strip
- :o: `medium priority` `low effort` destructive actions (Delete person, Delete tree, Set as root) should require a confirmation step - currently single-click and they happen. add either a native `confirm()` (cheap) or a small in-app confirm dialog (consistent with the rest of the shell)
- :o: `low priority` `low effort` bottom-left pills (stats, debug, save status) don't share a theme - colors, padding, radii drift between the three. unify under a single pill component / theme token set
- :o: `low priority` `low effort` View > Overlays should be a submenu rather than ~7 toggle items in the View menu root - bundles naturally with the View > Advanced submenu item under family-view; combine into one View-menu reorg
- :o: `low priority` `low effort` menu items need re-sorting and better dividers - current order is mostly insertion-order; group conceptually (e.g. zoom controls together, overlays together) with dividers between groups
- :o: `low priority` `low effort` View > Overlays icons are nearly invisible at default contrast (transparent fill, no outline) - add a 1px outline or raise opacity so the on/off state reads
- :o: `low priority` `low effort` auto-fit (fit-to-window) is only reachable via the small fit button inside the zoom widget popover - surface it as a top-level pill in the canvas chrome alongside the zoom percent, so it's one click instead of two
- :o: `low priority` `no effort` File > "Delete this tree…" item uses a pink danger color instead of red - either align with the standard destructive-action red, or settle on pink as the project's danger color and update other destructive actions (Delete person, etc.) to match

### portrait cropper

- :o: `medium priority` `medium effort` portrait cropper e2e baseline + dark/light visual goldens - `apps/web/tests/e2e/portrait-crop.spec.ts` currently `test.skip`s on a fresh shell because the spec can't reach the portrait field. lift the skip (drive the inspector to the portrait field via fixture import + person select), then run `pnpm -F web exec playwright test portrait-crop --update-snapshots` to capture the dialog baseline. unblocks the dark/light visual goldens and the axe-core wiring below.
- :o: `low priority` `low effort` axe-core wiring for the portrait cropper dialog - manual a11y rules in place (`role="application"` + aria-label + `tabindex="0"` + focus-visible + aria-live zoom % + focus-stability test); axe is incremental. gated on the e2e baseline lift above.
- :o: `low priority` `high effort` portrait cropper outside-the-frame context view (instagram-style dim mask) - requires changing canvas == frame geometry to canvas > frame, with frame-rect plumbing through `clampTransform`, `extractSourceRect`, and every pointer handler in `apps/web/src/lib/components/editor/CropperCanvas.svelte`. scoped down originally because the rewrite cost outweighed polish value. current cover-fit + grid + accent outline + spinner + error retry is a functional cropper without it; revisit if product signal shows users want the outside-frame context view.

### backend + sync + security

- :o: `high priority` `high effort` field-level merge on autosave conflict (currently last-write-wins via revision check; needs per-field diff + merge for concurrent edits to different people)
- :o: `low priority` `low effort` rate-limit `/api/auth/start` and tree-id-keyed routes against enumeration / abuse; deferred from the security audit because impact is low (CORS allowlist already blocks the cross-origin read path) but worth doing before opening the service to the wider public
- :o: `low priority` `low effort` document the deployment-time invariant that `cors_origins` must be an explicit allowlist (never wildcard) when `allow_credentials=True`; add a startup assertion in `main.py` if we want it enforced
- :o: `future idea` `medium effort` real-time multi-user collaboration via websocket

### wiki integration

- :o: `future idea` `medium effort` decide and prototype a wiki integration story (mechanism tbd; the original mediawiki-gadget approach is shelved)

### schema evolution (gates a schema version bump each)

- :o: `future idea` `medium effort` add generic `relationships: { kind: 'transformed-from' | 'alias-of' | 'sworn-bond' | 'master-apprentice' | ...; targetId; notes? }[]` for transmutation, alias, adoption-not-yet-mapped, and other fictional bonds; ships with a v2 -> v3 migration
- :o: `future idea` `low effort` add `birthOrder?: number` on `Person` for twin / triplet / cohort ordering inside a sibship (currently lost - sibship is derived from shared parents only); ships with a v3 -> v4 migration
- :o: `future idea` `low effort` add optional `name?: string` to `CoupleRecord` so families can be referenced by a chosen surname / household name (currently no way to rename families); ships with a v? -> v? migration and an Inspector Connections-tab UI to set it

### tooling + docs

- :o: `medium priority` `medium effort` symbols and icons used across the UI need a reference key - users see Crown / Star / Heart / Crosshair / Link2 / etc. without a legend. add either a Help > Icons & symbols dialog or an entry in `notes/features/`
- :o: `medium priority` `low effort` update `notes/features/keyboard-shortcuts.md` to reflect what actually shipped: drop Mod+N (browser new-window), Mod+Shift+N (browser private-window) and Mod+1 (browser tab-1) from the canonical spec; document the soft-conflict pattern where Mod+S/O/P/D/I/E/0 work via `preventDefault` like Figma/VS Code; add a "browser-safe" rule of thumb for future bindings
- :o: `low priority` `medium effort` debug-mode toggle to enable a "dry-run" auth mode for testing protected actions without going through Discord linking - synthesise a fake session per the `AuthBar` flow; gate behind the existing debug flag
- :o: `low priority` `low effort` debug toolbox residual - shipped in `916078f` + `d3243c4`: anchor (bottom-left unified bar), discovery pill, chip toggles, 4 sections, layout-timing readout, cycle-nodes, bond/centroid-delta, orphan badge, rank-gutter labels, last-edit halo, copy-snapshot, dump/load-tree-json, force-conflict. two sub-bullets remain open:
  - `topology hash` corner readout - current `editRev` + content hash from `layout.worker.ts`; verifies the worker-cache key
  - `engine quick-switch` row - one-click toggle between layered / hyperbolic without going through View menu
- :o: `low priority` `low effort` revisit prettier-plugin-tailwindcss once upstream supports svelte 5
- :o: `low priority` `low effort` `.claude/skills/layout-worker/` skill - capture the IR worker-boundary discipline once the Web Worker layout refactor lands: wire types vs. live types (`hydrateLayered/Ordered/Placed`), no functions / no `Map` instances across `postMessage`, `layoutSeq` race-handling for stale responses, the four-pass purity contract. defer until the refactor stabilises; one-off architectural skill, only worthwhile if a second worker gets added later
- :o: `low priority` `low effort` `.claude/skills/schema-evolution/` skill - capture the migration pattern for the queued schema bumps (parents 1.0.0→2.0.0, unions 2.0.0→3.0.0, relationships 3.0.0→3.1.0, identity 3.1.0→3.2.0, groups 3.2.0→3.3.0, sibship 3.3.0→3.4.0): semver registry shape in `domain/schema.ts`, GEDZIP `manifest.json` stamping, semver-aware refusal-of-major-newer-than-build / accept-minor-newer-with-finding on read, the v(N-1) round-trip test convention.

### housekeeping

- `high priority` `low effort` assign any to-dos without an effort or category; update priorities; move completed and sort all

---

## completed

### canvas

- :red_circle: `23 May 2026` PersonNode portrait area was too short (rendered as a thin band) - portrait card is `CARD_H * 2 = 2.4u` with a 3:4 slot; silhouette placeholder dropped.

### shell + UI

- :red_circle: `24 May 2026` removed the F2 keyboard shortcut entry from the registry - Enter (and double-click) already open the editor for the selected person, so the F2 binding was redundant noise in the shortcuts overlay.
- :red_circle: `24 May 2026` command palette now matches a typed person id directly - `#XYZ12` prefix is people-only id-lookup with a distinct empty state, and a bare id query also surfaces the person at the top of the list.

### schema evolution

- :red_circle: `14 May 2026` replaced `motherId` / `fatherId` with `parentIds: ParentRef[]` (each entry carries optional `role` and `pedi`); supports asexual / multi-parent / non-binary single parents; shipped with the v1 -> v2 migration in `domain/schema.ts`. Inspector + GEDCOM round-trip lands at commit `c6845dc`.

---

## meta

### format

open item: `- :o: \`priority\` \`effort\` description`

completed item: `- :red_circle: \`26 March 2026\` description`

cross-reference to a plan file: append `:dart: *planned in [<file>.md](<path>)*` to the item, or hoist it onto a section header line if every item in the section shares the same plan. keep it terse - no inline rationale.

priority levels (highest to lowest): `high priority`, `medium priority`, `low priority`, `future idea`

effort levels: `no effort`, `low effort`, `medium effort`, `high effort`, `very high effort`

items without a checkbox are recurring; they repeat each maintenance cycle rather than being tracked as one-time work. these live in the `### housekeeping` subsection.

when an item is completed, move it to the `# completed` section under the appropriate category, strip the priority/effort tags, and add a date stamp. sort completed entries chronologically within each category (oldest first). remove completed entries that are no longer relevant and not referenced by any open to-do. increment `total_completed` in the metadata each time an item is marked done.

when adding a new item, sort it into the appropriate section by view (family-view, tree-view, hyperbolic) if specific to one, or by component (inspector, canvas, shell, portrait cropper, etc.) if not. assign priority and effort tags. if the scope, priority, or effort is unclear, ask clarifying questions before adding. split larger projects into multiple entries.

defects with observable wrong behavior (a wrong line on the canvas, a focused field that swallows input, a stuck cursor) belong in [bugs.md](bugs.md), not here. missing functionality, polish, deployment plumbing, and architectural improvements stay here.

### sections

items are grouped first by view if specific to one, then by component. within each section, open items sort by priority (high first); completed items sort by date.

- **to-do** - active items
- **completed** - done items kept for reference; pruned when no longer relevant
- **meta** - this section; describes the doc format and holds recurring maintenance tasks

### metadata

```yaml
last_updated: 24 May 2026
total_completed: 3
```
