# FamilyTreeEditor to-do list

*features, polish, deployment plumbing, and "could be nicer" work. defects with observable wrong behavior are tracked in [bugs.md](bugs.md). see the [meta](#meta) section at the end of this file for format reference.*

---

## tasks

### family-view

- :o: `medium priority` `medium effort` family-view crossing-min algorithm upgrade - the barycentric slot-index pass landed with a monotone gate but is a measured no-op on every production fixture (akarians root=1/dense=4/leaf=0, dense-tree=9, multi-union=0; all delta=0) including the secondary-union-expanded configuration. root cause is structural, not fixture-dependent: edges sharing a person (couple-bus + parent-stem + sibling-bus + per-kid stubs all share the partner pair) are filtered out of the strict-cross definition, so the heuristic improvements don't translate to fewer geometric crossings. options: median barycentric, alternating inward sweep, or per-swap geometric-crossing transposition. monotone gate guarantees no harm in the meantime. baseline measurement lives in `apps/web/tests/unit/engines/family-view/crossings-baseline.test.ts`.
- :o: `low priority` `low effort` family-view smooth-diff edges jump-cut while cards slide - position tweens use CSS-transition-on-transform (250ms cubic-bezier), but the SVG `<path>` `d` attribute doesn't compose with CSS transitions, so the polylines connecting cards snap to their new shape instantly while cards translate over 250ms. not flicker, just motion mismatch. resolution options: (a) tween `d` via `requestAnimationFrame` path interpolation (~50 lines; some perf cost on dense layouts); (b) ship a small lib (e.g. motion's SVG plugin, ~5 KB) — engages the reactive cycle though; (c) extract endpoints from card positions and route edges through `<line>` primitives instead of `<path>` so CSS-transition handles them — most invasive.
- :o: `low priority` `low effort` family-view `parentsOfPerson` / `childrenOfPerson` in `engines/family-view/layout.ts` walk `tree.couples` and `getUnions(tree)` linearly per call - acceptable at the bounded ≤30 visible cards (the barycentric pass calls these O(MAX_ITERS × ranks × slots × persons) times = ~few hundred ops total on akarians). would matter if a future change lifts the bounded-window cap, at which point a per-tree precomputed `childrenIndex: Map<PersonId, PersonId[]>` would amortise.
- :o: `medium priority` `medium effort` family-view needs its own debug toggles - the 24 May 2026 fix marks the layered-IR debug entries as `(layered-only) disabled` under family-view, but family-view has no analogue toggles to take their place. candidates: focus + expanded-source set highlight, planRank slot indices, secondary-union slot annotations, collapse-victim trace, couple-bus midline. scoped per-engine because the layered tooling doesn't translate. **partially addressed 24 May 2026**: the family-view-debug plan landed ~16 toggles across 5 phases (connectivity, multi-union geometry, navigation, COI inspector, polish + metrics); remaining follow-ups tracked as individual items below.
- :o: `low priority` `low effort` family-view debug off-subset side panel caps each reason at 20 names + "+N more"; no drill-down or scroll-into-list yet. acceptable for diagnostic use; revisit if a real tree pushes any single reason past 50. (family-view-debug plan phase 1.)
- :o: `low priority` `low effort` family-view debug `subset.ts:classifyRejections` rank-cutoff fallback is O(P²) - inner loop scans every visible person for "is this a parent of someone visible". fine for diagnostic-overlay tree sizes; invert into a per-person parent set built during the initial BFS if `rationale` ever moves to the hot path. (family-view-debug plan phase 1.)
- :o: `low priority` `low effort` family-view debug `recordFocusEvent` linear scan could mis-attribute `didTriggerCenterOn` if two recenters for the same person interleave before either records. family-view's `recenterOn` is synchronous so the actual window is microseconds; key by `(personId, seq)` only if an async recenter path lands. (family-view-debug plan phase 3.)
- :o: `low priority` `low effort` family-view debug phase-3 viewport rect recomputes on every pan / wheel frame (4 divisions); cheap, but a candidate for a `requestIdleCallback`-style throttle if a future profile shows overlay work on the hot path. (family-view-debug plan phase 3.)
- :o: `low priority` `low effort` family-view debug `_coiWarnedFor` is per-component-instance; rapid mount/unmount cycles (dev hot-reload, engine swap) re-emit `console.warn`. acceptable for a diagnostic warning; revisit only if a user reports console spam. (family-view-debug plan phase 4.)
- :o: `low priority` `low effort` family-view debug `getCoiCacheStats()` returns module-cumulative counters; not reset across tree swaps. a `__treeDebug.coi.reset()` affordance would make per-tree memoisation effectiveness easier to read; defer until a real diagnostic case appears. (family-view-debug plan phase 4.)
- :o: `low priority` `medium effort` family-view debug fixed-position panels (off-subset, focus-log, off-subset-warning, recenter-missed badge, coi-breakdown, layout-metrics) each carry a collapsible header but still own their own fixed coordinates and can overlap at narrow viewports. long-term fix is a single draggable / docked debug container with tabs. take on only if a user reports the crowding is actually painful. (family-view-debug plan phase 5.)
- :o: `low priority` `low effort` family-view debug `showLayoutMetrics` reports `duration` for the last layout pass only; an idle canvas shows whatever the last value was, not a rolling average. histogram or P95 / max over a sliding window would be more useful for spotting periodic re-layout spikes. defer until a real perf bug surfaces. (family-view-debug plan phase 5.)
- :o: `low priority` `low effort` View > Advanced submenu surfacing the family-view flags-without-UI - 4 flags currently live in localStorage with `null → on` defaults: `fte.zoom.semantic100`, `fte.layout.familyViewCrossingMin`, `fte.overlays.smoothDiff`, `fte.layout.familyViewSecondaryUnion`. power-users have rollback via `localStorage.setItem(key, "false")` but most users will never discover them. surface all four (plus crispEdges opt-out per next item) as a single View > Advanced submenu rather than dripping individual toggles.
- :o: `medium priority` `medium effort` family-view cards should rescale / change level-of-detail on zoom like the layered engine does - tree-view uses `levelFromScale` thresholds in `TreeCanvas` (full → level-3 compact → level-4 initials → level-5 dot) so cards stay legible across the zoom range; family-view holds a single card geometry at all zoom levels, so the smooth wheel-zoom from [reports/completed-items-report.md](reports/completed-items-report.md#todo-03-family-view-wheel-zoom-curve) bottoms out at unreadably-small cards at low zoom. port the full `levelFromScale` ladder (level-3 compact is the most-load-bearing one) into family-view's PersonNode wrapper. pairs with the zoom-static-during-gesture fix tracked under [reports/completed-items-report.md](reports/completed-items-report.md#bug-03-edge-stroke-low-zoom).
- :o: `low priority` `no effort` `.family-view-edge { shape-rendering: crispEdges }` applies at every zoom level - fine for the family-view geometry today (predominantly axis-aligned strokes; integer-pixel `edgePath` coords) but would need an opt-out if a future family-view feature introduces diagonals (relationship-vocabulary decorators e.g. sloped sworn-bond strokes already exist as `.family-view-overlay` siblings, not `.family-view-edge`, so they're unaffected today). flag for review when work touches family-view diagonals.

### tree-view (layered engine)

- :o: `medium priority` `high effort` virtualisation / tiling for very large trees - at zoom-out with ~1800 nodes the SVG edge layer renders all segments in one `<path>` per role (no per-tick re-render thanks to `vector-effect: non-scaling-stroke`), and 1800 absolutely-positioned PersonNode hosts is the dominant cost. Options: (a) tile the canvas spatially and only mount card hosts whose tile intersects the viewport; (b) at level 4 / 5, render cards as a single `<canvas>` overlay (one draw call) instead of N divs; (c) HTML5 `<canvas>` for edges if the SVG path approach hits its ceiling. Currently usable but laggy on a 1.8K-node tree at low zoom
- :o: `medium priority` `high effort` orthogonal edge routing with obstacle avoidance - even after spouse-duplication, some long bonds + sibling-bus segments still pass through other cards. The multi-spouse and negative-drop defects in [bugs.md](bugs.md) are concrete instances; the same issue shows up for sibling-bus segments that span past intervening cards above/below the row. Implement A* over a sparse routing graph (corners of card AABBs + row-gutter alignment lines) so edges bend around any card they would otherwise visually cross. Polish layer; the targeted bug fixes are higher-ROI prerequisites
- :o: `medium priority` `medium effort` zoom-aware label sizing - shrink card padding and grow text size as zoom decreases so the next-level-up card stays readable as long as possible (PersonNode + the `levelFromScale` thresholds in TreeCanvas)
- :o: `low priority` `medium effort` edge lines should grow thicker / darker as the canvas zooms out so the topology stays readable when individual cards become unreadable. Tried inline `stroke-width = basePx / scale` on the bucket paths (Layer 3) but it forced the browser to re-stroke the entire path geometry on every wheel tick and added visible lag; reverted to `vector-effect: non-scaling-stroke`. Right approach: precompute per-zoom-level CSS classes (e.g. `.zoom-far`, `.zoom-mid`) and toggle one class on the host element instead of inline-styling the path
- :o: `low priority` `low effort` clicking the "N people" stats pill (layered engine) should show a small stats popover (people, couples, generations, etc.) in-place rather than toggle the inspector - inspector toggle is already covered by View > Show inspector and the right-side aside affordance
- :o: `medium priority` `high effort` tree-view (layered) PersonNode should support the doubled-height portrait card variant that family-view ships - todo-01 in [reports/completed-items-report.md](reports/completed-items-report.md#todo-01-personnode-portrait-card-taller) only landed in family-view; layered still uses the single-height card with no dedicated portrait slot. likely harder because the layered engine's rank-spacing + ghost geometry is calibrated to the single-height card; bumping height ripples through `passes/place.ts` gap math, drop heights, and the ghost-near adjacency cases tracked in bugs.md. revisit slot ratio in tandem with the 1:1 vs 3:4 portrait-aspect work in bugs.md.

### inspector

- :o: `high priority` `medium effort` mobile bottom-sheet variant of the editor panel
- :o: `medium priority` `medium effort` inspector should open in view-mode by default, with an explicit "edit" button to enter edit-mode - today every field is always editable, so casual browsing feels heavy and accidental edits autosave. switch to display-only rendering with an edit toggle per tab (or per section)
- :o: `medium priority` `medium effort` inspector tab + section ordering needs a fresh pass - current ordering (personal, connections, bonds, groups, sibship, details, bio) splits related concerns across tabs and buries common edits. propose a consolidated layout with collapsible sections per tab
- :o: `medium priority` `medium effort` move Bonds, Sibship, and Groups tabs into collapsible sections inside the Connections tab - all three are variants of "relationships to other people"; splitting them across tabs hides them. drops inspector tab count from 7 to ~4 (personal, connections, details, bio)
- :o: `medium priority` `medium effort` Connections-tab parent-type and marriage-date controls are inconsistent in shape - some inline, some expand-on-click. unify under a collapsed-by-default details summary per relationship, expanding on the edit affordance
- :o: `medium priority` `medium effort` gender field should be a dropdown (with type-to-filter and "add new gender…" at the bottom) by default rather than a free-text autocomplete - same pattern for species, kind, origin kind. raises the floor for new users while preserving "anything goes" via the add-new option. pairs with the tree-level customization menu in shell + UI
- :o: `low priority` `low effort` wiki title field should autocomplete from the wiki - query `/w/api.php?action=opensearch&search=...` and offer suggestions in the person editor / inspector Details tab
- :o: `medium priority` `medium effort` reimplement Connections-tab "trace path to..." as a target-picker popup menu - click action opens a person-picker (palette-style fuzzy search over `tree.people`), and on commit highlights the resulting chain on the canvas via the existing `pathHighlight.ts` `bundlesForPath`. supersedes the no-op removal in [reports/completed-items-report.md](reports/completed-items-report.md#bug-16-trace-path-noop).
- :o: `future idea` `medium effort` `needs more info` revisit the inspector open / focus behavior - feels off after the F2 drop in [reports/completed-items-report.md](reports/completed-items-report.md#todo-12-drop-f2-shortcut). audit every entry-point that opens or focuses the inspector (Enter on a selected person, double-click on a card, palette pick, set-as-root, add-relative, context-menu actions, mobile sheet) and reconcile them into one consistent open/focus/scroll-to-field flow. needs concrete reporter notes on which path feels weird before committing scope.

### canvas

- :o: `medium priority` `high effort` hide unrelated branches based on the selected person - needs a "related-to" rule (default: ancestors + descendants + spouses); expose as a View menu toggle so users can flip between full tree and focused view
- :o: `medium priority` `medium effort` selectable lineage trace - clicking an edge (or a person + an "trace" action) highlights a chain through the graph in a unique color so the user can see where a relationship goes; pairs naturally with the "hide unrelated branches" toggle. **Partially addressed**: selection→focus path highlight ships (on by default, toggleable via View > Overlays > Path highlight). True any-to-any "trace" action remains open.
- :o: `medium priority` `low effort` minimap + search-by-name popover

### shell + UI

- :o: `medium priority` `high effort` tree-level customization menu for genders, species, bond kinds, etc. - let the tree owner define the canonical dropdown options once, then the dropdowns in PersonalTab / Connections / Bonds consume that tree-scoped list. pairs with the gender-dropdown change in inspector
- :o: `medium priority` `medium effort` user-settings dialog (localStorage-backed) - theme override (light / dark / auto; today the app follows `prefers-color-scheme` only), inspector side (left / right), and any other ergonomic toggles that don't need server persistence; replaces the stubbed `app.settings` shortcut and Edit > Settings menu item
- :o: `medium priority` `medium effort` initial tree load flashes the default sample tree for ~1s before the real tree paints - block rendering until the loaded tree resolves, or paint a generic spinner over an empty canvas. natural pairing with the unified loading-bar item below
- :o: `medium priority` `low effort` unified loading-bar / progress indicator - generic UI for long operations (import, autosave flush, server push, layout recompute on big trees); replaces the scattered `reading file…` toast pattern with a top-of-canvas progress strip
- :o: `medium priority` `low effort` destructive actions (Delete person, Delete tree, Set as root) should require a confirmation step - currently single-click and they happen. add either a native `confirm()` (cheap) or a small in-app confirm dialog (consistent with the rest of the shell)
- :o: `medium priority` `low effort` View > Overlays should be a submenu rather than ~7 toggle items in the View menu root - bundles naturally with the View > Advanced submenu item under family-view; combine into one View-menu reorg. pairs with the tri-state indicator landed in [reports/completed-items-report.md](reports/completed-items-report.md#todo-14-tristate-toggle-indicator).
- :o: `low priority` `low effort` menu items need re-sorting and better dividers - current order is mostly insertion-order; group conceptually (e.g. zoom controls together, overlays together) with dividers between groups
- :o: `low priority` `low effort` auto-fit (fit-to-window) is only reachable via the small fit button inside the zoom widget popover - surface it as a top-level pill in the canvas chrome alongside the zoom percent, so it's one click instead of two
- :o: `medium priority` `low effort` debug pill is shown by default on every fresh load - it sits in the bottom-left chrome bar from first paint until the user dismisses it. casual users see the wrench icon without context. flip the default of `debugPillHidden` to `true` (or gate the pill on a `fte.debug.pillVisible` localStorage key); keep Ctrl+Shift+D as the discoverability path for power users. pairs with a Help > Debug menu entry for mouse-only discovery.
- :o: `future idea` `medium effort` in-app "send feedback / report bug / suggest a feature" form - small Help-menu entry opens a modal with category (bug / suggestion / other), free-text body, optional contact, and an auto-attached client snapshot (app version, engine, viewport, recent action trail). POSTs to a thin server endpoint (`/api/feedback` on the fastapi service) which forwards to a configurable webhook URL (e.g. a Discord / Slack / linear-issue webhook) sourced from `data/trees-config.toml` `[secrets]`. server is just a relay - never stores user reports. include throttle + size cap.
- :o: `medium priority` `medium effort` View > Overlays needs a "Generation highlight" toggle, default off - the row/generation hover-highlight ships always-on with no off-switch in the View menu. expectation: a tri-state View > Overlays > Generation highlight item (matching the other overlay toggles) that defaults off; users who want it on opt in. pairs naturally with the View > Overlays submenu reorg item.
- :o: `low priority` `no effort` menu bar titles + entries should render lowercase to match the rest of the app's microcopy convention ("lowercase microcopy" per the `design-and-ui-changer` skill) - File / Edit / View / Insert / Tree / Help and their entries ("New tree", "Save", "Open tree…", "Fit to window", etc.) currently render in Title Case. cheapest fix is a css `text-transform: lowercase` on the menu-bar button + menu-item label spans in `Menu.svelte`, leaving the underlying `label` strings in `commands.ts` / `App.svelte` untouched so command-palette searches, tests asserting `getByRole("button", { name: "View" })`, and the SHORTCUTS table all keep working as-is. avoid rewriting the label strings - that ripples through ~40 entries plus every e2e/component test that asserts a menu name.
- :o: `medium priority` `low effort` menu-bar dropdowns (File / Edit / View / Insert / Tree) should stay open after clicking a toggle item, so users can flip several overlay / engine / inspector toggles in one pass instead of reopening the menu each time - today every `onclick` closes the menu. expected: items that carry a `checked` state (the toggles, e.g. View > Overlays > *, Show inspector, the engine picks, Help > Debug mode) keep the menu open and update their tri-state indicator in place; plain action items (Save, Open…, Add child, etc.) still close on click as before. fix in `Menu.svelte`: gate the auto-close on whether the clicked item is a toggle (item has `checked !== undefined`); keep Escape / outside-click / blur as the close paths. matches the menu pattern in Figma / VS Code where checkbox menu items are sticky.
- :o: `medium priority` `medium effort` canvas-chrome-v2 taskbar follow-up: manual visual smoke + remaining polish - the dock taskbar redesign (one pill per open menu; minimized = pill only; pill-drag reorder; anchor-aware control icons; all four corners) shipped with full e2e coverage but was never eyeballed (no visual goldens in repo). owed: a human smoke at 1440x900 + Pixel 7 - chip colours/geometry/focus-flash, single titlebar/body divider, lowercase titles, uniform width, wide bodies scroll-not-clip, and minimize/reorder/pop-out at each of the four corners. plus deferred nits: corner-picker + Panels are flat menu items with no section header (needs a `MenuConfig` header/submenu type); no e2e for the floating→minimize + lastState-restore branches; Panels rows for family-view panels are inert when family-view isn't the active engine. full deferred list in `.claude/plans/archived/canvas-chrome-v2/ship.md`. 🎯 carried in from plan: canvas-chrome-v2 (2026-05-29).

### portrait cropper

- :o: `medium priority` `medium effort` portrait cropper e2e baseline + dark/light visual goldens - `apps/web/tests/e2e/portrait-crop.spec.ts` currently `test.skip`s on a fresh shell because the spec can't reach the portrait field. lift the skip (drive the inspector to the portrait field via fixture import + person select), then run `pnpm -F web exec playwright test portrait-crop --update-snapshots` to capture the dialog baseline. unblocks the dark/light visual goldens and the axe-core wiring below.
- :o: `low priority` `low effort` axe-core wiring for the portrait cropper dialog - manual a11y rules in place (`role="application"` + aria-label + `tabindex="0"` + focus-visible + aria-live zoom % + focus-stability test); axe is incremental. gated on the e2e baseline lift above.
- :o: `low priority` `high effort` portrait cropper outside-the-frame context view (instagram-style dim mask) - requires changing canvas == frame geometry to canvas > frame, with frame-rect plumbing through `clampTransform`, `extractSourceRect`, and every pointer handler in `apps/web/src/lib/components/editor/CropperCanvas.svelte`. scoped down originally because the rewrite cost outweighed polish value. current cover-fit + grid + accent outline + spinner + error retry is a functional cropper without it; revisit if product signal shows users want the outside-frame context view.

### backend + sync + security

- :o: `high priority` `high effort` field-level merge on autosave conflict (currently last-write-wins via revision check; needs per-field diff + merge for concurrent edits to different people)
- :o: `low priority` `low effort` document the deployment-time invariant that `cors_origins` must be an explicit allowlist (never wildcard) when `allow_credentials=True`; add a startup assertion in `main.py` if we want it enforced
- :o: `future idea` `medium effort` real-time multi-user collaboration via websocket

### wiki integration

- :o: `future idea` `medium effort` decide and prototype a wiki integration story (mechanism tbd; the original mediawiki-gadget approach is shelved)

### schema evolution (gates a schema version bump each)

- :o: `future idea` `medium effort` add generic `relationships: { kind: 'transformed-from' | 'alias-of' | 'sworn-bond' | 'master-apprentice' | ...; targetId; notes? }[]` for transmutation, alias, adoption-not-yet-mapped, and other fictional bonds; ships with a v2 -> v3 migration
- :o: `future idea` `low effort` add `birthOrder?: number` on `Person` for twin / triplet / cohort ordering inside a sibship (currently lost - sibship is derived from shared parents only); ships with a v3 -> v4 migration
- :o: `future idea` `low effort` add optional `name?: string` to `CoupleRecord` so families can be referenced by a chosen surname / household name (currently no way to rename families); ships with a v? -> v? migration and an Inspector Connections-tab UI to set it

### family echo / familyscript coverage

tracked gaps in the FamilyScript spec the parser does not yet model. each line item is a single tag family the parser silently drops (or stores as a round-trip extra). add a domain slot before wiring; many require a schema bump.

- :o: `low priority` `low effort` contact tags (`e w B P t k u a C`): email, website, blog url, photo site, home/work/mobile phone, address (multiline), other contact. no domain slot. add a `contact?: { email?: string; web?: string; phone?: { home?, work?, mobile? }; address?: string; }` block on `Person`.
- :o: `low priority` `low effort` pet metadata (`R`): pet type (dog, cat, etc.). no slot. file alongside species when species/kind picker grows a "pet" path.
- :o: `low priority` `low effort` bio narrative (`o`): free-form notes. consider mapping to `wikiTitle`-adjacent slot or a new `notes?: string`.
- :o: `low priority` `low effort` color label (`G`): per-person hex or named color. consider a `colorLabel?: string` slot used by the inspector tint.
- :o: `low priority` `low effort` custom fields (`1`-`9`) + their `f l<label>` declarations: user-defined key-value pairs. no slot; would need a `custom?: Record<string, string>` and a UI to surface them.
- :o: `low priority` `low effort` couple lifecycle dates beyond marriage (`r b w t n y s d a f z` on `p<id1 id2>` records): engagement, start, marriage location, restart, remarriage date+location, separation, divorce, annulment, first-end, final-end. `CoupleRecord` / `UnionRecord` has `marriageDate` only. would need a small lifecycle-events sub-record on the union.
- :o: `low priority` `low effort` couple `g` type code (`m e r f d s a n c o`): married / engaged / relationship / friendship / divorced / separated / annulled / remarried / reconciled / other. partly captured by `UnionRecord.kind`, but the FS values don't line up 1:1; needs a mapping table.
- :o: `low priority` `low effort` cause of death (`Z`) and burial details (`U` place + `F` date): no slots. consider a `death?: { date?, place?, cause?, burial?: { place?, date? } }` consolidation.
- :o: `low priority` `low effort` extended FS date forms (`B`-prefixed BCE works today, plus partials and `~` approx). still unsupported: ranges (`20030428-20040115`), before/after suffixes (`<` / `>`), 4-9 digit years (parser hard-requires 4). would extend `HaracalndeDate.parseFamilyScript`.

### tooling + docs

- :o: `medium priority` `medium effort` symbols and icons used across the UI need a reference key - users see Crown / Star / Heart / Crosshair / Link2 / etc. without a legend. add either a Help > Icons & symbols dialog or an entry in `notes/features/`
- :o: `medium priority` `low effort` update `notes/features/keyboard-shortcuts.md` to reflect what actually shipped: drop Mod+N (browser new-window), Mod+Shift+N (browser private-window) and Mod+1 (browser tab-1) from the canonical spec; document the soft-conflict pattern where Mod+S/O/P/D/I/E/0 work via `preventDefault` like Figma/VS Code; add a "browser-safe" rule of thumb for future bindings
- :o: `low priority` `low effort` debug toolbox residual - shipped in `916078f` + `d3243c4`: anchor (bottom-left unified bar), discovery pill, chip toggles, 4 sections, layout-timing readout, cycle-nodes, bond/centroid-delta, orphan badge, rank-gutter labels, last-edit halo, copy-snapshot, dump/load-tree-json, force-conflict. two sub-bullets remain open:
  - `topology hash` corner readout - current `editRev` + content hash from `layout.worker.ts`; verifies the worker-cache key
  - `engine quick-switch` row - one-click toggle between layered / hyperbolic without going through View menu
- :o: `low priority` `low effort` revisit prettier-plugin-tailwindcss once upstream supports svelte 5
- :o: `low priority` `low effort` `.claude/skills/layout-worker/` skill - capture the IR worker-boundary discipline once the Web Worker layout refactor lands: wire types vs. live types (`hydrateLayered/Ordered/Placed`), no functions / no `Map` instances across `postMessage`, `layoutSeq` race-handling for stale responses, the four-pass purity contract. defer until the refactor stabilises; one-off architectural skill, only worthwhile if a second worker gets added later
- :o: `low priority` `low effort` `.claude/skills/schema-evolution/` skill - capture the migration pattern for the queued schema bumps (parents 1.0.0→2.0.0, unions 2.0.0→3.0.0, relationships 3.0.0→3.1.0, identity 3.1.0→3.2.0, groups 3.2.0→3.3.0, sibship 3.3.0→3.4.0): semver registry shape in `domain/schema.ts`, GEDZIP `manifest.json` stamping, semver-aware refusal-of-major-newer-than-build / accept-minor-newer-with-finding on read, the v(N-1) round-trip test convention.
- :o: `low priority` `low effort` family-view debug `showCardCollisions` has no positive-case e2e because no existing fixture reliably overlaps cards. negative-case (clean fixture, zero collisions) is covered; mint a collision fixture only if a real bug is observed. (family-view-debug plan phase 2.)
- :o: `low priority` `low effort` family-view debug `showPendingRecenter` watchdog red-badge has no positive-case e2e - every UI path that changes selection and requests a recenter currently also fires `onrecenter`, so the missed-recenter case isn't reproducible without injecting a bug. the happy-path e2e exercises the timer + state via `data-triggered`. revisit when a real palette-jump silent-no-op repro surfaces. (family-view-debug plan phase 3.)
- :o: `low priority` `low effort` family-view debug `showLastEditHalo` has no positive-case e2e (toggle on → edit a card → halo appears); reproducing requires double-clicking through to the inspector, which the bottom-left debug-panel chrome intercepts at narrow viewports. underlying `debugLastEditedId` is exercised by `redraw-on-edit.spec.ts` already; the overlay just re-renders the halo from the same prop. (family-view-debug plan phase 5.)
- :o: `low priority` `low effort` document the `[data-person-id]` overlay-vs-card locator trap in `notes/agents.md` next time the §test-fixtures section is touched - overlay layers that emit `data-person-id` attrs can grab e2e locators waiting for the canvas after a toggle is on. workaround in phase-5 tests was `button[data-person-id]`. (family-view-debug plan phase 5.)
- :o: `low priority` `low effort` regenerate the 6 visual-regression e2e goldens (`visual-add-relative`, `visual-akarians-family-view`, `visual-dense-tree`, `visual-multi-union`, `visual-path-highlight`, `visual-secondary-union`) via `PLAYWRIGHT_UPDATE_SNAPSHOTS=1 pnpm exec playwright test --update-snapshots`. they're currently `test.skip`-gated so don't fail `pnpm verify`, but the baselines drifted on trunk (`2a394ee fix(tree): bump family-view edge stroke widths`). housekeeping commit.

### housekeeping

- `high priority` `low effort` assign any to-dos without an effort or category; update priorities; move completed and sort all

---

## completed

### family-view

- :red_circle: `29 May 2026` family-view debug lastEditHalo replays on same-person edits - `editSeq` counter keyed on `lastEditedId` changes; halo key is now `${id}-${editSeq}` so consecutive edits to the same card force a DOM remount and the CSS fade replays. closed in bfd2471.
- :red_circle: `29 May 2026` family-view sibling-bus role derived from children's pedi - bus emits `role:"half"` when every child is a half-sibling; mixed or all-blood sibships keep `"blood"`. closed in 4ddd95c.
- :red_circle: `29 May 2026` COI debug panel raw and sum cells use toFixed(6) - eliminates float drift like `0.06250000000000001` in the diagnostic display. closed in 89291dc.
- :red_circle: `29 May 2026` dark-theme --color-danger bumped for legibility - `hsl(0 75% 55%)` → `hsl(0 80% 65%)`; light-theme overrides unchanged. closed in 819f0ce.
- :red_circle: `29 May 2026` family-view union-fan focus centred between both partners - `planRank` fan-detection pre-scan forces focus to sit between primary and secondary partner when 2+ couples are expanded; secondary partner inserted immediately after the primary couple slot. closed in 0fb79a0.
- :red_circle: `29 May 2026` family-view cards and badges fade in on expansion - `transition:fade={{ duration: fadeDuration }}` on card wrapper and badge button; duration gates on `smoothDiff && !prefersReducedMotion`. closed in 049e859.
- :red_circle: `29 May 2026` family-view `.is-portrait-pending` slot background now fades out - added `transition: background-color 80ms ease-out` to the `.is-portrait-pending` rule in `PersonNode.svelte` so the neutral grey placeholder blends out as the resolved portrait mounts. closed in 3e9ee13.

### canvas

- :red_circle: `24 May 2026` arrow keys now pan the canvas (up / down / left / right) when focus is on the canvas host and no person is selected - 60 css px per press, shift+arrow for 5x. tree-view keeps arrow-key selection-move when a person is selected; family-view pans unconditionally. hyperbolic engine uses Möbius transforms and stays out of scope.
- :red_circle: `26 May 2026` roving-tabindex keyboard navigation across person cards in tree-view + family-view canvases - exactly one visible card carries `tabindex=0` (the selected one, or the first visible card when nothing is selected); the rest carry `tabindex=-1`. canvas hosts switch to `tabindex=-1` so Tab from outside lands on the active card rather than a wrapping focus stop, with a background-pointerdown focus-forward keeping arrow-key pan working after the user clicks empty canvas. arrow-key selection-move in tree-view now imperatively focuses the new card so focus tracks selection. shared `PersonNode` accepts an `isFirstFocusable` prop the canvases set on their chosen anchor card.
- :red_circle: `26 May 2026` aria roles for the tree canvases - `TreeCanvas` already carried `role="tree"`; `FamilyViewCanvas` promoted from `role="region"` to `role="tree"` (with a header comment recording why a strict-tree role still reads more accurately than `role="group"` despite the underlying pedigree DAG). shared `PersonNode` already carried `role="treeitem"` + `aria-selected` reflecting selection.
- :red_circle: `29 May 2026` "tree center" / center-on-root action targets `tree.rootId` - `viewCenterRoot` in `App.svelte` now reads `treeStore.tree.rootId` first and calls `canvasController.centerOnPerson(rid)` directly instead of the engine-agnostic `centerOnRoot()` stub; the selection step that follows is unchanged. closed in 82466e6.

### inspector

- :red_circle: `29 May 2026` fresh tree open centres on rootId - initial viewport re-arms on tree switch and centres on `tree.rootId` instead of bbox centre; falls back to fit-to-window when rootId absent. closed in 27c650c.
- :red_circle: `29 May 2026` Details tab folded into Personal tab - occupation/location/wiki title/display dropdown moved under a "more details" disclosure in PersonalTab; DetailsTab.svelte deleted; inspector tab count reduced from 7 to 6. closed in 2511260.
- :red_circle: `29 May 2026` Connections tab uses a single parent loop - replaced separate mother/father/extra-parents blocks with one `{#each parentRefs}` row carrying role + pedi selects inline; 142 lines removed. closed in 0e66ff3.
- :red_circle: `29 May 2026` collapse-badge hover label shows real names - `badgeTitle()` helper looks up first 2 member given names from `tree.people` and produces "expand hidden: Alice, Bob, +3 more". closed in c815760.
- :red_circle: `29 May 2026` "add relative" pre-fills surname from anchor person - `blankPerson()` accepts an optional `surname?` param; `addParent`, `addPartner`, and `addChild` pass the anchor's surname. closed in c02edf5.
- :red_circle: `29 May 2026` person id chip removed from inspector header - deleted the `idRevealed` state, the chip button, and its `$effect.pre` reset; copy-id in more-actions covers the use case. closed in ecf8351.
- :red_circle: `29 May 2026` "set as tree root" no longer shows a toast - removed the `displayName` lookup and `toasts.push` from `setRootAction` in `App.svelte`; the inspector crown badge is sufficient. closed in 032bc5f.
- :red_circle: `29 May 2026` pronouns, AGAB, and fluid-identity collapse under gender - wrapped the three fields in a native `<details><summary>more identity fields</summary>` element in `PersonalTab.svelte`; gender identity stays always visible; closed by default. closed in ba15e56.
- :red_circle: `29 May 2026` inspector header icon buttons have native title tooltips - added `title="more actions"` to the `…` button and `title="close inspector"` to the close button; the crosshair/focus button already had both. closed in afb19c7.
- :red_circle: `24 May 2026` person id chip is hidden by default in the inspector header - the `id <person-id>` line now sits at `opacity-0` and reveals on header hover via `group-hover:opacity-100` (desktop), or by clicking the chip itself which toggles an `idRevealed` state (covers touch devices without hover). reveal state resets whenever the selected person changes. copy-id in the more-actions menu still works without revealing the chip first; the crown root badge is untouched.

### backend + sync + security

- :red_circle: `29 May 2026` sliding-window rate limiter on auth and tree routes - `/api/auth/start` limited to 10 req/min per IP; tree routes limited to 60 req/min; no new dependencies; 429 on excess. closed in fa4c802.

### schema evolution

- :red_circle: `14 May 2026` replaced `motherId` / `fatherId` with `parentIds: ParentRef[]` (each entry carries optional `role` and `pedi`); supports asexual / multi-parent / non-binary single parents; shipped with the v1 -> v2 migration in `domain/schema.ts`. Inspector + GEDCOM round-trip lands at commit `c6845dc`.

### tooling + docs

- :red_circle: `26 May 2026` worktree fixture-symlink trap closed by a `.githooks/post-checkout` hook plus `pnpm install`'s `postinstall` setting `core.hooksPath=.githooks`. `git worktree add` now fires the hook (gated on null-SHA $1 + branch-flag $3==1 so regular checkouts skip), which delegates to the pre-existing `scripts/setup-worktree.sh` to symlink `notes/examples` into the new worktree. agents.md §setting up a worktree updated.
- :red_circle: `24 May 2026` debug panel now exposes an `auth dry-run` chip (new `shell` section) that flips `authStore` into a client-side synthetic session - `DRY_RUN_USER` (id `dry-run-user`, role admin) is surfaced via `authStore.user` when the toggle is on and no real session is signed in. persisted in `localStorage["fte.debug.authDryRun"]`; backend calls are not faked, only UI gating. `AuthBar` sign-out short-circuits when only the synthetic session is active.
- :red_circle: `28 May 2026` debug-mode auth flow stub - `fte.debug.authDryRun` now routes `/api/auth/start`, `/api/auth/check`, `/api/auth/me`, `/api/auth/logout` through `auth-stub.ts` so the full LinkCodeDialog UX (code display, polling, ok/expired/not_found) is exercisable without the backend. synthetic-user short-circuit removed from `authStore`; clicking "sign in" is now required to get a session under dry-run. error-branch opt-in via `localStorage["fte.debug.authDryRunOutcome"]`.

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
last_updated: 26 May 2026
total_completed: 23
```
