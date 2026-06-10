complete map of every user-facing surface, option, and control in the FamilyTreeEditor SPA as of 2026-05-27.

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
    - [tab 6: details](#tab-6-details)
    - [tab 7: bio](#tab-7-bio)
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
│   ├── save status pill
│   └── progress strip
├── menu bar (6 dropdowns)
├── canvas
│   ├── zoom widget
│   ├── right-click menu
│   └── per-card controls (family view only)
├── inspector panel (7 tabs)
├── bottom-left
│   ├── stats pill (layered only)
│   ├── debug pill
│   └── debug panel
└── transient overlays
    ├── modals (7)
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
│   ├── set default
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
    └── keyboard shortcuts
```

---

## menu bar

source: `apps/web/src/lib/components/shell/MenuBar.svelte`
commands: `apps/web/src/lib/components/palette/commands.ts`

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
- set current engine as default
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

---

## modals / dialogs

| dialog              | source                         | controls                                                                                                                          |
| ------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| open tree           | `shell/OpenDialog.svelte`      | search field, tree list, preview pane (count / root / sample people), open from url…, delete _(danger)_, cancel, open             |
| settings            | `shell/SettingsDialog.svelte`  | theme radio (light / dark / auto), inspector side radio (left / right)                                                            |
| share tree          | `shell/ShareDialog.svelte`     | view link + copy, grants list with per-user revoke, add grant form (discord id, role dropdown editor/viewer, share button), close |
| admin panel         | `shell/AdminPanel.svelte`      | users table with delete per row _(admin only)_                                                                                    |
| sign-in (link code) | `shell/LinkCodeDialog.svelte`  | 6-char code, copy button, status display, countdown timer, cancel                                                                 |
| keyboard shortcuts  | `help/ShortcutsOverlay.svelte` | shortcuts grouped by category, macos vs windows/linux variants, close                                                             |
| portrait cropper    | `editor/CropperDialog.svelte`  | image preview, drag-to-pan, crop overlay with draggable corners, zoom slider, cancel / save                                       |

---

## command palette

source: `apps/web/src/lib/components/palette/CommandPalette.svelte`

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

source: `apps/web/src/lib/components/inspector/Inspector.svelte`

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

### tab 2: connections

source: `inspector/ConnectionsTab.svelte`

- **parents:** mother row, father row (edit / unlink per row), extra parent rows with pedi dropdown, add parent
- **unions:** per union - kind radio (romantic / civil / religious / ritual / cohabit / sworn), date, closed flag; per partner - name link, remove, preferred-star toggle; add partner
- **children:** per child - name link, birth order, remove; add child
- **trace path to:** button opens person chooser, sets `traceTargetId` for canvas highlight (action currently no-op, see bugs.md)

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

### tab 6: details

source: `inspector/DetailsTab.svelte`

- occupation, location
- wiki title with autocomplete dropdown and view link (opens wiki page in new tab)
- display dropdown: normal / faded _(faded renders dimmed on canvas)_

### tab 7: bio

placeholder, not yet implemented

---

## right-click context menu

source: `apps/web/src/App.svelte` (menuItems), `apps/web/src/lib/components/ui/ContextMenu.svelte`

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

source: `apps/web/src/lib/components/canvas/ZoomWidget.svelte`

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

source: `apps/web/src/lib/components/tree/FamilyViewCanvas.svelte`

per-card overlay affordances that appear on cards in family-view mode:

- **union picker (˅ chevron)** - opens a menu of alternate unions; items:
    - "show {partner} as primary" - swaps the visible union for this person
    - "also show {partner} alongside" - expands a secondary union at the same rank _(currently no-op, see bugs.md)_
- **expand button (+, bottom edge)** - title: "show more of this branch" - reveals hidden parents/children adjacent to this person
- **collapse button (-, top-right)** - title: "hide expanded branch" - returns to the bounded default
- **collapse badge ("+N FirstName" pill)** - title: "expand N hidden: sampleName, …" - in-row affordance for auto-collapsed cohorts; click reveals the cohort

---

## bottom-left area

source: `apps/web/src/App.svelte`

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

source: `inspector/DetailsTab.svelte`

- appears below wiki title input when typing
- list of matching wiki pages
- keyboard nav: ↑↓ highlight, enter pick, esc close

---

## top bar

| component        | source                        | function                                      |
| ---------------- | ----------------------------- | --------------------------------------------- |
| auth bar         | `shell/AuthBar.svelte`        | sign in / sign out button                     |
| save status pill | `shell/SaveStatusPill.svelte` | synced / saving / error indicator             |
| progress strip   | `shell/ProgressStrip.svelte`  | progress bar for import and export operations |

---

## transient notifications

source: `apps/web/src/lib/components/ui/Toasts.svelte`

- types: info, success, error
- auto-dismiss, stacked top-right corner

---

## surface summary

| surface           | type           | notable                              |
| ----------------- | -------------- | ------------------------------------ |
| menu bar          | 5 dropdowns    | 40+ items with radio + toggle states |
| command palette   | modal search   | 50+ commands + people, fuzzy         |
| open tree         | modal          | tree list + preview pane             |
| settings          | modal          | theme, inspector side                |
| share tree        | modal          | grants management                    |
| admin panel       | modal          | user table (admin only)              |
| sign-in           | modal          | discord link code + countdown        |
| shortcuts         | modal          | reference overlay                    |
| portrait cropper  | modal          | drag crop + zoom                     |
| inspector         | side panel     | 7 tabs, 80+ fields                   |
| context menu      | floating       | 8 person actions                     |
| zoom widget       | canvas toolbar | slider, fit, percent input           |
| stats pill        | bottom-left    | click to toggle inspector            |
| debug panel       | bottom-left    | 20+ debug toggles + json dump        |
| person chooser    | popover        | fuzzy search + create                |
| instance popover  | floating       | multi-instance picker                |
| wiki autocomplete | dropdown       | wiki page suggestions                |
| auth bar          | top            | sign in / out                        |
| save status       | top            | sync state                           |
| progress strip    | top            | operation progress                   |
| toasts            | overlay        | auto-dismiss notifications           |

---

## see also

- [../bugs.md](../bugs.md) - active bug log; UI defects cross-referenced from this inventory live there
- [../to-do.md](../to-do.md) - feature / polish / UX backlog; planned UI changes land here
- [keyboard-shortcuts.md](keyboard-shortcuts.md) - canonical shortcut list rendered into the Help > Keyboard shortcuts overlay

---

## metadata

```yaml
last_updated: 28 May 2026
top_level_surfaces: 12
inspector_tabs: 7
menu_bar_dropdowns: 6
```
