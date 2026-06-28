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
  {render}                <!-- DockRenderSnippet: Snippet<[{ forcedCollapse: boolean }]> -->
  panelId?="my-panel"    <!-- pairs a pill to its panel -->
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
| `closed` | no entry in store - no pill rendered, no surface |
| `minimized` | open, collapsed - pill only, no surface rendered |
| `expanded` | open, expanded - pill + surface in the corner stack |
| `floating` | popped out - free-floats in `DockSurface` at (x, y) |

`dockStore.togglePanel(id)` is the canonical pill tap handler: closed→expanded, minimized→expanded, expanded→minimized, floating→bring to front.

### store methods (key ones)

```ts
dockStore.openPanel(id)           // add to open set (→ minimized)
dockStore.closePanel(id)          // remove from open set
dockStore.toggleExpanded(id)      // minimized <-> expanded
dockStore.setExpanded(id, bool)   // set expanded state explicitly
dockStore.togglePanel(id)         // 4-branch pill tap machine (canonical)
dockStore.isOpen(id)              // boolean
dockStore.isExpanded(id)          // boolean — false when floating (known bug)
dockStore.panelState(id)          // "closed" | "minimized" | "expanded" | "floating"
dockStore.floatPanel(id, x, y)   // move to overlay at (x, y)
dockStore.dockPanel(id)           // move from overlay → minimized
dockStore.dockPanelExpanded(id)  // move from overlay → expanded
dockStore.movePanel(id, x, y)    // update floating position (drag)
dockStore.focusPanel(id)          // flash titlebar + bring to front
dockStore.reorderPills(corner, ids) // drag-to-reorder pill list
dockStore.openDialog(id)          // show dialog; closes any prior dialog
dockStore.closeDialog()
dockStore.activeDialog            // id of current dialog or undefined
dockStore.floatingPanels          // array of { item: DockItemDef; pos: { x, y, z } }
```

> **known bug:** `isExpanded(id)` returns false when a panel is floating, so pill `aria-pressed` is wrong in floating state. fix: `isExpanded` should return true for both `"expanded"` and `"floating"`. deferred.

### localStorage keys (no schema version; client-only)

- `fte.dock.corner` - active corner (`"bl" | "tl" | "tr" | "br"`); default `"bl"`
- `fte.dock.openedPanels` - JSON array of open panel ids; non-persistent ids never written

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

control buttons use `.fte-window-control` CSS classes (global in `theme.css`): 14px colored circles at 40% alpha. neutral/amber/red for pop-dock/minimize/close.

---

## DockDialog

```svelte
<DockDialog id="settings" title="settings" size="lg" onopen={() => ...}>
  {#snippet children()}...{/snippet}
</DockDialog>
```

sizes: `"md"` (max 36rem) or `"lg"` (max 48rem). max-height `calc(100vh - 4rem)`; body scrolls when content overflows. close via Escape, backdrop click, or `dockStore.closeDialog()`. only one dialog active at a time - opening a second closes the first.

titlebar chrome matches `DockPanel`: lowercase muted title, red circle close button with Lucide X icon.

---

## panel body CSS classes

global classes from `theme.css` (cross the svelte scoping boundary without imports):

| class | renders |
|---|---|
| `fte-window-section` | small muted section header |
| `fte-window-divider` | thin `<hr>` separator between sections |
| `fte-window-row` | key/value flex row - muted label left, value right |
| `fte-window-row[aria-pressed]` | selectable row with hover/selected states; selected shows left-border accent |
| `fte-window-list` | compact vertical stack |
| `fte-window-button` | full-width muted outline action button |
| `fte-window-chip` | small rounded toggle chip (state via `aria-pressed`) |
| `fte-window-chip-group` | `flex flex-wrap gap-1` container for chips |
| `fte-window-muted-action` | small muted text button |
| `fte-window-danger` | danger-tinted text for error rows |

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

`persistent: false` items (debug panels, per-session tools) are removed from localStorage on close. `closeable: false` items (save-status) always auto-open and cannot be closed.

---

## registering a new panel

```svelte
<!-- in App.svelte — snippet binds to DockEntry via render prop -->
{#snippet pillRender(ctx: { forcedCollapse: boolean })}
    <button class="fte-pill fte-pill-icon" aria-pressed={dockStore.isExpanded("my-panel")}
        onclick={() => dockStore.togglePanel("my-panel")}><MyIcon size={12} /></button>
{/snippet}

{#snippet panelRender(_ctx: { forcedCollapse: boolean })}
    <DockPanel id="my-panel" title="my panel" body={bodySnippet} />
{/snippet}

{#snippet bodySnippet()}
    <div class="fte-window-row"><span>label</span><span>value</span></div>
{/snippet}

<DockEntry id="my-pill" kind="pill" corner="bl" priority={120} panelId="my-panel" render={pillRender} />
<DockEntry id="my-panel" kind="panel" corner="bl" priority={125} render={panelRender} />
```

`DockCorner` picks it up automatically via reactive `dockStore.itemsForCorner(corner)`.

---

## see also

- `notes/features/attu-ui.md` - design tokens, shell pattern
- `notes/features/wiki-editor.md` - wiki-editor component structure
- `packages/attu-ui/src/lib/components/dock/` - source of truth
