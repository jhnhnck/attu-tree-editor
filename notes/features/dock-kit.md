# dock kit

the canvas-chrome dock system shared by both SPAs. lives in `packages/attu-ui/src/lib/components/dock/`. exported from `@attu/ui`.

---

## components

| component | role |
|---|---|
| `store.svelte.ts` | `DockStore` class - singleton; all state lives here |
| `DockCorner.svelte` | renders the pill row + panels for one corner; pill drag-to-reorder |
| `DockPanel.svelte` | floating chrome: titlebar, corner-aware controls, drag-to-move |
| `DockDialog.svelte` | fixed centered dialog with blurred backdrop; Escape + backdrop-click close |
| `DockSurface.svelte` | mounts floating panels (z-30+) and the active dialog (z-50+) |
| `DockEntry.svelte` | registration bridge - declares an item into `DockStore` via props |
| `SaveStatusPill.svelte` | shared pill+panel pair for save status (both apps) |
| `StatsPill.svelte` | shared pill+panel pair for stats display (both apps) |

---

## DockStore API

`dockStore` is a singleton imported from `@attu/ui`. apps do not create it.

### registration

`DockEntry` props (use markup, not direct calls):

```svelte
<DockEntry
  id="my-panel"
  kind="panel"            <!-- "pill" | "panel" | "dialog" -->
  corner="bl"
  priority={100}
  {render}                <!-- DockRenderSnippet: () => Snippet -->
  windowId?="my-panel"   <!-- pairs a pill to its panel -->
  closeable?={true}
  persistent?={false}     <!-- stays registered when unmounted -->
  title?="my panel"
  order?={0}
/>
```

### panel state machine

a panel goes through four states:

| state | description |
|---|---|
| `closed` | no entry in store - no pill, no surface |
| `docked-minimized` | open, collapsed - pill only, no surface rendered |
| `docked-expanded` | open, expanded - pill + surface in the corner stack |
| `floating` | popped out - free-floats in `DockSurface` at (x, y) |

`dockStore.pillClick(id)` is the single pill entry-point: opens closed, expands minimized, minimizes expanded, re-docks floating.

### store methods (key ones)

```ts
dockStore.openWindow(id)        // add to open set
dockStore.closeWindow(id)       // remove from open set
dockStore.toggleExpanded(id)    // minimized <-> expanded
dockStore.isOpen(id)            // boolean
dockStore.isExpanded(id)        // boolean
dockStore.windowState(id)       // "closed" | "docked-minimized" | "docked-expanded" | "floating"
dockStore.pillClick(id)         // canonical pill tap handler
dockStore.popOut(id, x, y)     // move to overlay at (x, y)
dockStore.redock(id)            // move from overlay back to corner
dockStore.openModal(id)         // show dialog; closes any prior dialog
dockStore.closeModal()
dockStore.floatingItems         // array of floating DockItemDef
dockStore.activeModal           // id of current dialog or null
```

### localStorage keys (no schema version; client-only)

- `fte.dock.corner` - active corner (`"bl" | "tl" | "tr" | "br"`); default `"bl"`
- `fte.dock.openedWindows` - JSON array of open panel ids; debug ids never written

---

## DockPanel chrome

`DockPanel` props: `id`, `title`, `body` (Snippet), `closeable?` (default true).

titlebar controls left-to-right: `[pop/re-dock] [minimize] [close]`. icons are corner-aware:

| corner | pop-out icon | re-dock icon | minimize icon |
|---|---|---|---|
| tl | ArrowDownRight | ArrowUpLeft | ChevronUp |
| tr | ArrowDownLeft | ArrowUpRight | ChevronUp |
| bl | ArrowUpRight | ArrowDownLeft | ChevronDown |
| br | ArrowUpLeft | ArrowDownRight | ChevronDown |

minimize on a floating panel re-docks then collapses (lands as pill-only). pop-out cascades: `x = host.right - 320 + n*24`, `y = host.top + 60 + n*24` (wraps every 8).

---

## DockDialog

```svelte
<DockDialog id="settings" title="settings" size="lg" onopen={() => ...}>
  {#snippet children()}...{/snippet}
</DockDialog>
```

sizes: `"md"` (448px) or `"lg"` (768px). always fullscreen on mobile. close via Escape, backdrop click, or `dockStore.closeModal()`. only one dialog active at a time - opening a second closes the first.

---

## panel body CSS classes

global classes from `theme.css` (cross the svelte scoping boundary without imports):

| class | renders |
|---|---|
| `fte-window-section` | small uppercase muted section header |
| `fte-window-divider` | thin `<hr>` separator between sections |
| `fte-window-row` | key/value flex row - muted label left, value right |
| `fte-window-row[aria-pressed]` | selectable row with hover/selected states |
| `fte-window-list` | compact vertical stack |
| `fte-window-button` | full-width accent action button |
| `fte-window-chip` | small rounded toggle chip (state via `aria-pressed`) |
| `fte-window-chip-group` | `flex flex-wrap gap-1` container for chips |
| `fte-window-muted-action` | small muted text button |
| `fte-window-danger` | rose-400 tinted text for error rows |

do NOT add border / padding / background inside the body snippet - `DockPanel` already provides the frosted box and `0.5rem` padding. nesting another bordered box is the double-pad trap.

## pill CSS classes

| class | renders |
|---|---|
| `fte-pill` | base pill (text or icon+text) |
| `fte-pill fte-pill-icon` | square icon-only pill |
| `fte-pill gap-1.5` | icon + compact text pill |

icon-first rule: single icon = `fte-pill-icon`; icon + value = `fte-pill gap-1.5`; text-only pills only when no icon conveys the meaning.

---

## priority-space convention

items sort by `order` (asc) then `priority` (asc) then `focusedAt` (desc, panels only). `order` defaults to 0; priority is the stable rank within the 0-order tier. `order` is session-only - not persisted.

| range | use |
|---|---|
| 0-99 | always-visible status pills (save-status 10, stats 20, debug-toggle 30) |
| 100-199 | tools |
| 200-299 | debug panels (family-view debug panels: 200-230) |
| 300+ | primary control surfaces (debug-menu 300) |

`persistent: true` items (save-status, stats) are always open - `openWindow`/`closeWindow` no-op; close button hidden.

---

## registering a new panel

```svelte
<!-- in App.svelte -->
<DockEntry
  id="my-panel"
  kind="panel"
  corner="bl"
  priority={120}
  render={pillSnippet}
  windowId="my-panel"
/>
<DockPanel id="my-panel" title="my panel" body={bodySnippet} />
```

`DockCorner` picks it up automatically via reactive `dockStore.itemsForCorner(corner)`.

---

## see also

- `notes/features/attu-ui.md` - design tokens, shell pattern
- `notes/features/wiki-editor.md` - wiki-editor component structure
- `packages/attu-ui/src/lib/components/dock/` - source of truth
