# Pre-mortem — wiki-editor-ui-chrome

**Bottom line:** proceed with revisions — one blocking type gap, two EditorView reference gaps that need a threading decision before phases 1 and 3.

---

### Risks

- [high] dependency — `MenuConfig.items` is `MenuEntry = MenuItem | "divider"`; there is no subgroup-header entry type. The Insert menu needs bold section labels ("Headings & blocks", "Links", "Templates", etc.) that cannot be expressed in the current type. Phase 0 either extends `MenuConfig` with a `{ header: string }` variant or silently degrades Insert to divider-only grouping, losing the visual hierarchy from `ui-outline.md`. · probe: before phase 0 starts, decide whether to add a `header` variant to `MenuConfig` in `@attu/ui` and update `MenuBar.svelte`/`Menu.svelte` to render it; or accept flat dividers and update `ui-outline.md` to match.

- [medium] integration — `SelectionBar.svelte` needs `view.coordsAtPos()` to position itself above the selection, but it renders in Shell's `tools` snippet outside the editor DOM. There is no specified path for the `EditorView` reference to reach `SelectionBar`. Implicit assumption: `App.svelte` holds the editor binding and threads it to `SelectionBar` as a prop — but then `SelectionBar` is inside `Toolbar.svelte` which is inside the `tools` snippet, three layers removed from the editor. · probe: before phase 1, sketch the component tree and confirm `EditorView` can reach `SelectionBar` via a reactive `$state` in `App.svelte` or a Svelte context; prototype the position calculation with a hardcoded pos to confirm `coordsAtPos` returns useful viewport coords from inside a `position: relative` container.

- [medium] premise — phase 3 routes contextmenu events to 7 different menus using "regex over the line text at the cursor position", but a contextmenu `MouseEvent` gives viewport `(x, y)` — not a CodeMirror document position. Converting requires `view.posAtCoords({ x, y })` which needs a live `EditorView` reference wherever the contextmenu listener lives. The plan doesn't say where that listener is registered. · probe: before phase 3, confirm `Editor.svelte` exposes a public `getView()` getter or that `App.svelte` has the view reference; prototype `contextmenu → posAtCoords → regex` for the wikilink case as the probe.

- [low] dependency — `ShortcutsOverlay.svelte` in `@attu/ui` is built for tree-editor's SHORTCUTS registry format, not the flat table in `ui-outline.md` section 6. Reuse is unlikely without parameterization. · probe: read `ShortcutsOverlay.svelte` before phase 4; if it cannot accept an arbitrary table, plan to write `WikiShortcutsOverlay.svelte` in `apps/wiki-editor/src/lib/`.

- [low] scope — the overflow `…` button for the toolbar on narrow viewports requires a breakpoint-based show/hide mechanism. This is fiddly CSS/JS but bounded in scope. The plan does not specify the breakpoint width or whether it uses ResizeObserver vs media query. · probe: none required; accept it as implementation detail but note it in phase 1 DoD so it isn't forgotten.

---

### Walking-skeleton check

Phase 0 (menu bar that opens, shows items, and closes) is a valid walking skeleton for this plan. It touches the core dependency (MenuConfig type) early. **One revision needed**: phase 0's DoD must include a resolution to the `MenuConfig` header-entry decision — the Insert menu's structure cannot be deferred.

---

### Phase-order revisions

| original | proposed | reason |
|---|---|---|
| phase 2 (pills) after phase 1 (toolbar) | swap: pills before toolbar | pills have zero CodeMirror dependency; toolbar has the `SelectionBar` EditorView threading complexity. landing pills first gives a visible deliverable while the harder coordination problem is solved |

---

### Definition-of-done additions

- phase 0 — add: `MenuConfig` header-entry decision documented and landed (either extended type or accepted flat-divider fallback recorded in `ui-outline.md`); Insert menu visually distinguishable between at least three subgroups
- phase 1 — add: `SelectionBar` positions correctly when the selection is at the top edge of the editor (does not clip above the viewport); EditorView reference path documented in a comment in `App.svelte`
- phase 3 — add: `view.posAtCoords()` call verified against a live CodeMirror instance (not mocked); wikilink detection tested with a line containing `[[Page|Display text]]`
