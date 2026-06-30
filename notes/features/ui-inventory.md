complete map of every user-facing surface, option, and control in the FamilyTreeEditor SPA as of 2026-06-30.

<!-- toc -->

- [ui element structure](#ui-element-structure)
- [menu organization](#menu-organization)
- [menu bar](#menu-bar)
    - [file](#file)
    - [edit](#edit)
    - [view](#view)
    - [insert](#insert)
    - [tree](#tree)
    - [help](#help)
- [modals / dialogs](#modals--dialogs)
- [command palette](#command-palette)
- [inspector panel](#inspector-panel)
    - [tab 1: personal](#tab-1-personal)
    - [tab 2: connections](#tab-2-connections)
    - [tab 3: bonds](#tab-3-bonds)
    - [tab 4: groups](#tab-4-groups)
    - [tab 5: sibship](#tab-5-sibship)
    - [tab 6: bio](#tab-6-bio)
- [right-click context menu](#right-click-context-menu)
- [canvas controls](#canvas-controls)
- [family-view per-card controls](#family-view-per-card-controls)
- [bottom-left area](#bottom-left-area)
    - [stats pill _(layered engine only)_](#stats-pill-layered-engine-only)
    - [debug pill _(ctrl+shift+d, debug mode only)_](#debug-pill-ctrlshiftd-debug-mode-only)
    - [debug panel](#debug-panel)
- [popovers](#popovers)
    - [person chooser](#person-chooser)
    - [instance popover](#instance-popover)
    - [wiki title autocomplete](#wiki-title-autocomplete)
- [top bar](#top-bar)
- [transient notifications](#transient-notifications)
- [surface summary](#surface-summary)
- [see also](#see-also)
- [metadata](#metadata)

<!-- /toc -->

## ui element structure

how every persistent and transient surface in the SPA is organized:

```text
FamilyTreeEditor SPA
├── top bar
│   ├── auth bar
│   └── progress strip
├── menu bar (6 dropdowns)
├── canvas
│   ├── zoom widget
│   ├── right-click menu
│   └── per-card controls (family view only)
├── inspector panel (6 tabs)
├── dock corner (bottom-left by default, configurable)
│   ├── save status pill
│   ├── stats pill (layered only)
│   ├── debug pill
│   └── debug panel
└── transient overlays
    ├── modals (8)
    ├── command palette
    ├── popovers (3)
    └── toasts
```

---

## menu organization

all six dropdowns and their items, top-to-bottom in menu order:

```text
menu bar
├── file
│   ├── new tree
│   ├── open tree…
│   ├── save
│   ├── import…
│   ├── export .gdz
│   └── delete…
├── edit
│   ├── undo
│   ├── redo
│   ├── find person…
│   ├── command palette…
│   └── settings…
├── view
│   ├── fit to window
│   ├── zoom 100%
│   ├── fit selection
│   ├── focus selection
│   ├── zoom in
│   ├── zoom out
│   ├── hand tool
│   ├── select tool
│   ├── show inspector
│   ├── layout engine
│   └── overlays
├── insert
│   ├── add child
│   ├── add partner
│   ├── add parent
│   └── add unattached
├── tree
│   ├── rename…
│   ├── set as root
│   ├── statistics…
│   ├── reset layout
│   └── center on root
└── help
    ├── keyboard shortcuts
    ├── debug mode
    └── about
```

"set current engine as default" moved off the View menu into settings (layout tab) - see the settings dialog row below.

---

## menu bar

source: `packages/attu-ui/src/lib/components/shell/MenuBar.svelte` (shared with wiki-editor)
commands: `apps/tree-editor/src/lib/components/palette/commands.ts`

### file

- new tree
- open tree…
- save
- import…
- export .gdz
- delete this tree… _(danger)_

### edit

- undo _(conditional on history)_
- redo _(conditional on history)_
- find person…
- command palette…
- settings…

### view

- fit to window
- zoom to 100%
- fit selection
- focus selection
- zoom in
- zoom out
- hand tool
- select tool
- show inspector
- layout engine _(radio)_: family view / layered / hyperbolic
- overlays _(7 toggles)_: path highlight, generation badges, sworn bonds, transformations, severances, group frames, consanguinity

### insert

- add child of selected
- add partner of selected
- add parent of selected
- add unattached person

### tree

- rename tree…
- set selected as root
- statistics…
- reset layout
- center on root

### help

- keyboard shortcuts
- debug mode _(toggle)_
- about…

---

## modals / dialogs

these render as `DockDialog`s registered via `DockEntry kind="dialog"` - see [dock-kit.md](dock-kit.md). all but open tree now live in `packages/attu-ui/src/lib/components/` (shared with wiki-editor where applicable).

| dialog              | source                                          | controls                                                                                                                          |
| ------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| open tree           | `apps/tree-editor/…/shell/OpenDialog.svelte`      | search field, tree list, preview pane (count / root / sample people), open from url…, delete _(danger)_, cancel, open             |
| settings            | `packages/attu-ui/…/shell/SettingsDialog.svelte`  | 3 tabs - appearance (theme radio, dock corner radio), layout (inspector side radio, default engine radio), advanced (smooth diff / crossing minimisation / secondary union toggles) |
| share tree          | `packages/attu-ui/…/shell/ShareDialog.svelte`     | view link + copy, grants list with per-user revoke, add grant form (discord id, role dropdown editor/viewer, share button), close |
| admin panel         | `packages/attu-ui/…/shell/AdminPanel.svelte`      | users table with delete per row _(admin only)_                                                                                    |
| sign-in (link code) | `packages/attu-ui/…/shell/LinkCodeDialog.svelte`  | 6-char code, copy button, status display, countdown timer, cancel                                                                 |
| about               | `packages/attu-ui/…/shell/AboutDialog.svelte`     | app info, close                                                                                                                    |
| keyboard shortcuts  | `packages/attu-ui/…/help/ShortcutsOverlay.svelte` | shortcuts grouped by category, macos vs windows/linux variants, close                                                             |
| portrait cropper    | `packages/attu-ui/…/editor/CropperDialog.svelte`  | image preview, drag-to-pan, crop overlay with draggable corners, zoom slider, cancel / save                                       |

---

## command palette

source: `packages/attu-ui/src/lib/components/palette/CommandPalette.svelte`

two modes:

| mode          | trigger      | scope                |
| ------------- | ------------ | -------------------- |
| anything      | ctrl+p       | people then commands |
| commands only | ctrl+shift+p | commands only        |

- search input with fuzzy matching
- prefix `>` narrows to commands; `@` narrows to people
- results list (max 50): person rows (name + id) or command rows (label + group + shortcut)
- keyboard nav: ↑↓ move, enter activate, esc close

---

## inspector panel

source: `apps/tree-editor/src/lib/components/inspector/Inspector.svelte`

**empty state:** tree summary - people count, couples count, root name, last edit time

**person selected - header:** name, id, centre on selection button, more-actions menu (duplicate, set as root, copy id, delete _(danger)_), close

### tab 1: personal

source: `inspector/PersonalTab.svelte`

- portrait: upload, crop, remove
- given name, surname, title
- gender identity _(autocomplete: male, female, unknown, non-binary, agender, fluid)_
- pronouns
- assigned at birth: amab / afab / uaab _(dropdown)_
- fluid identity checkbox
- species
- kind _(autocomplete: biological, mechanical, spirit, collective, concept)_
- origin kind _(autocomplete: born, cloned, hatched, summoned, awoken, manufactured)_
- origin cause _(shown when origin kind is set)_
- birth date, death date _(haracalnde date pickers)_
- birth order number
- occupation, location
- wiki title with autocomplete dropdown and view link (opens wiki page in new tab)
- display dropdown: normal / faded _(faded renders dimmed on canvas)_

### tab 2: connections

source: `inspector/ConnectionsTab.svelte`

- **parents:** mother row, father row (edit / unlink per row), extra parent rows with pedi dropdown, add parent
- **unions:** per union - kind radio (romantic / civil / religious / ritual / cohabit / sworn), date, closed flag; per partner - name link, remove, preferred-star toggle; add partner
- **children:** per child - name link, birth order, remove; add child

### tab 3: bonds

source: `inspector/RelationshipsTab.svelte`

- relationship list involving selected person
- per row: edit controls, delete _(danger)_

### tab 4: groups

source: `inspector/GroupsTab.svelte`

- groups list - per row: name, kind badge, edit, delete _(danger)_
- create group: kind dropdown (dynasty, house, clan, household, faction, order, covenant), name input, create button

### tab 5: sibship

source: `inspector/SibshipTab.svelte`

- sibship decorator list
- create and edit controls

### tab 6: bio

placeholder, not yet implemented

---

## right-click context menu

source: `apps/tree-editor/src/App.svelte` (menuItems), `packages/attu-ui/src/lib/components/ui/ContextMenu.svelte`

- edit person _(opens personal tab)_
- edit connections _(opens connections tab)_
- _divider_
- set as tree root
- add parent
- add partner
- add child
- _divider_
- delete person _(danger)_

read-only mode shows only "edit person".

---

## canvas controls

source: `packages/attu-ui/src/lib/components/canvas/ZoomWidget.svelte`

```text
┌─────────────────────────────────────────────┐
│  [−]  [════════●══════════]  [+]  75%  [⊡]  │
└─────────────────────────────────────────────┘
  zoom   logarithmic slider      fit
  out    (0.1× - 5×)        percent  window
```

- zoom out (−)
- logarithmic range slider (0.1× to 5×)
- zoom in (+)
- percent display - click to type exact value
- fit button - fit entire tree to window

---

## family-view per-card controls

source: `apps/tree-editor/src/lib/components/tree/FamilyViewCanvas.svelte`

per-card overlay affordances that appear on cards in family-view mode:

- **union picker (˅ chevron)** - opens a menu of alternate unions; items:
    - "show {partner} as primary" - swaps the visible union for this person
    - "also show {partner} alongside" - expands a secondary union at the same rank _(currently no-op, see bugs.md)_
- **expand button (+, bottom edge)** - title: "show more of this branch" - reveals hidden parents/children adjacent to this person
- **collapse button (-, top-right)** - title: "hide expanded branch" - returns to the bounded default
- **collapse badge ("+N FirstName" pill)** - title: "expand N hidden: sampleName, …" - in-row affordance for auto-collapsed cohorts; click reveals the cohort

---

## bottom-left area

source: `apps/tree-editor/src/App.svelte`, registered into the shared dock corner stack (`packages/attu-ui/src/lib/components/dock/`) via `DockEntry` - see [dock-kit.md](dock-kit.md). despite the section name, the corner is configurable (settings > appearance > dock corner) and bottom-left is just the default.

### stats pill _(layered engine only)_

- "n people · m clusters" label
- click to toggle inspector

### debug pill _(ctrl+shift+d, debug mode only)_

- opens / closes debug panel

### debug panel

| section     | toggles                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- |
| layout      | grid, node bounds, segment ids, components                                               |
| routing     | ghost arrows, bridge hops, overlap pairs                                                 |
| diagnostics | cycle nodes, bond/centroid δ, orphans, rank labels, last-edit halo                       |
| runtime     | expose \_\_treeDebug toggle, copy snapshot, force conflict, dump/load tree JSON textarea |

---

## popovers

### person chooser

source: `inspector/PersonChooser.svelte`

- label (e.g. "choose a parent")
- fuzzy search input
- person list (max 50, sorted by match score then name) - name + dates per row
- "create new person" button
- keyboard nav: ↑↓ move, enter select, esc close

### instance popover

source: `tree/InstancePopover.svelte`

- lists every canvas placement of a person (primary + ghost instances)
- keyboard nav: ↑↓ move, enter pick, esc close
- smart positioning: drops below or above anchor

### wiki title autocomplete

source: `inspector/PersonalTab.svelte`

- appears below wiki title input when typing
- list of matching wiki pages
- keyboard nav: ↑↓ highlight, enter pick, esc close

---

## top bar

| component      | source                                          | function                                      |
| -------------- | ------------------------------------------------ | --------------------------------------------- |
| auth bar       | `packages/attu-ui/…/shell/AuthBar.svelte`         | sign in / sign out button                     |
| progress strip | `packages/attu-ui/…/shell/ProgressStrip.svelte`   | progress bar for import and export operations |

save status pill moved out of the top bar into the dock corner stack (see [bottom-left area](#bottom-left-area)) - it's now a `DockEntry` pill+panel pair, `packages/attu-ui/src/lib/components/dock/SaveStatusPill.svelte`.

---

## transient notifications

source: `packages/attu-ui/src/lib/components/ui/Toasts.svelte`

- types: info, success, error
- auto-dismiss, stacked top-right corner

---

## surface summary

| surface           | type           | notable                              |
| ----------------- | -------------- | ------------------------------------ |
| menu bar          | 6 dropdowns    | 40+ items with radio + toggle states |
| command palette   | modal search   | 50+ commands + people, fuzzy         |
| open tree         | modal          | tree list + preview pane             |
| settings          | modal          | 3 tabs: appearance, layout, advanced |
| share tree        | modal          | grants management                    |
| admin panel       | modal          | user table (admin only)              |
| sign-in           | modal          | discord link code + countdown        |
| about             | modal          | app info                             |
| shortcuts         | modal          | reference overlay                    |
| portrait cropper  | modal          | drag crop + zoom                     |
| inspector         | side panel     | 6 tabs, 80+ fields                   |
| context menu      | floating       | 8 person actions                     |
| zoom widget       | canvas toolbar | slider, fit, percent input           |
| save status pill  | dock corner    | synced / saving / error indicator    |
| stats pill        | dock corner    | click to toggle inspector            |
| debug panel       | dock corner    | 20+ debug toggles + json dump        |
| person chooser    | popover        | fuzzy search + create                |
| instance popover  | floating       | multi-instance picker                |
| wiki autocomplete | dropdown       | wiki page suggestions                |
| auth bar          | top            | sign in / out                        |
| progress strip    | top            | operation progress                   |
| toasts            | overlay        | auto-dismiss notifications           |

---

## see also

- [../bugs.md](../bugs.md) - active bug log; UI defects cross-referenced from this inventory live there
- [../to-do.md](../to-do.md) - feature / polish / UX backlog; planned UI changes land here
- [keyboard-shortcuts.md](keyboard-shortcuts.md) - canonical shortcut list rendered into the Help > Keyboard shortcuts overlay
- [dock-kit.md](dock-kit.md) - the shared dock corner/pill/panel/dialog system backing the modals, save status pill, stats pill, and debug panel

---

## metadata

```yaml
last_updated: 30 June 2026
top_level_surfaces: 12
inspector_tabs: 6
menu_bar_dropdowns: 6
```
