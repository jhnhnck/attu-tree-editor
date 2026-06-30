# @attu/ui - component library reference

`@attu/ui` is a **component library**. it exports design tokens, typed primitives, and shell-level chrome pieces. `Shell` is the canonical root component every attu app uses; the rest are composed inside it.

---

## imports

```ts
// in main.ts — always import the theme first
import "@attu/ui/theme.css";

// components and types
import { Shell, AuthBar, Button } from "@attu/ui";
import type { MenuConfig, MenuItem } from "@attu/ui";

// worker-safe (no Svelte, no DOM) — use inside layout.worker.ts
import { HaracalndeDate, ok, err } from "@attu/ui/pure";
```

never import from sub-paths like `@attu/ui/components/...` — always go through the barrel or `@attu/ui/pure`.

---

## design tokens

defined in `packages/attu-ui/src/lib/theme.css` under `@theme`. tailwind v4 generates utility classes from them; they're also available as CSS variables for raw CSS (e.g., inside CodeMirror themes).

| token | tailwind class | CSS variable | purpose |
| --- | --- | --- | --- |
| canvas | `bg-canvas` / `text-canvas` | `--color-canvas` | page background — the base surface |
| canvas-elev | `bg-canvas-elev` | `--color-canvas-elev` | elevated surfaces — header bar, dropdown menus, panels |
| fg | `text-fg` | `--color-fg` | primary text and icons |
| fg-muted | `text-fg-muted` | `--color-fg-muted` | secondary text, placeholder text, shortcut labels |
| line | `border-line` | `--color-line` | borders and dividers |
| accent | `text-accent` / `bg-accent` | `--color-accent` | active/selected state, primary buttons |
| accent-strong | `text-accent-strong` | `--color-accent-strong` | hover on accent, focus rings |
| danger | `text-danger` | `--color-danger` | destructive actions, error text |

supports dark/light via `prefers-color-scheme` and `data-theme="dark"|"light"` on `<html>`. the `@theme` defaults are dark; light overrides live in `@media (prefers-color-scheme: light)` and `[data-theme="light"]`.

---

## component inventory

### shell

| component | use it for |
| --- | --- |
| `Shell` | **the root of every attu app** — full-viewport layout with header bar, content area, and overlay slot. accepts `title`, `menus` props; `logo?`, `tools?`, `auth?`, `overlays?`, `children` snippets; optional `onTitleChange` and `readOnly` props |
| `MenuBar` | used internally by Shell — only import directly if you need a standalone dropdown outside the Shell |
| `Menu` | used internally by MenuBar — don't use directly |
| `AuthBar` | sign in / sign out strip; pass as the `auth` snippet to Shell |
| `ProgressStrip` | thin loading bar below the header |
| `SaveStatusPill` | saving / saved / error indicator pill |
| `AboutDialog` | standard about dialog |
| `SettingsDialog` | user settings modal |
| `ShareDialog` | share-link modal |
| `AdminPanel` | admin-only panel |
| `LinkCodeDialog` | discord link-code step in the auth flow |

### ui primitives

| component | variants | use it for |
| --- | --- | --- |
| `Button` | `primary`, `ghost`, `danger` | **text buttons only** — has `px-3 py-1.5` padding. not for icon-only toolbar buttons |
| `ContextMenu` | — | right-click context menu |
| `Toasts` | — | toast notification host |

**do not use `Button` for icon-only toolbar buttons.** its text-button padding (`px-3 py-1.5`, `rounded-md`) makes icon buttons too wide. use raw `<button>` elements (see shell pattern below).

### form

| component | use it for |
| --- | --- |
| `Field` | labeled form field wrapper |
| `DateInput` | text input that parses on blur via `HaracalndeDate.parseNarrative` |

### canvas chrome

| component | use it for |
| --- | --- |
| `ZoomWidget` | scale display + zoom controls for a canvas view |
| `BackButton` | canonical "go back" button for canvas overlays |
| `DockSurface` | mounts floating (popped-out) panels and the active dialog |
| `DockCorner` | renders the pill row + panels for one corner |
| `DockEntry` | registration bridge - declares an item into `dockStore` via props |
| `DockPanel` | floating chrome: titlebar, corner-aware controls, drag-to-move |
| `DockDialog` | fixed centered dialog with blurred backdrop |

see `notes/features/dock-kit.md` for the full dock/window system (states, store API, registration pattern).

### help + palette

| component | use it for |
| --- | --- |
| `ShortcutsOverlay` | the `?` keyboard shortcut reference sheet |
| `CommandPalette` | Ctrl+P / Ctrl+Shift+P command palette |

### state stores

| export | use it for |
| --- | --- |
| `authStore` | reactive auth state (`authStore.user`, `.realUser`) |
| `createToastsStore()` | per-app toast queue |
| `createProgressStore()` | per-app progress bar state |
| `installShortcuts()` | registers a `ShortcutBinding[]` against the window |
| `formatCombo()` | formats a shortcut combo string for display |

---

## MenuConfig types

```ts
import type { MenuConfig, MenuEntry, MenuItem } from "@attu/ui";

interface MenuItem {
    label: string;
    onclick?: () => void;          // call this, not `action`
    shortcut?: string;             // e.g. "mod-s" — shown as "Ctrl+S" / "⌘S"
    icon?: unknown;                // lucide component (cast at render time)
    disabled?: boolean;
    danger?: boolean;
    checked?: boolean | undefined; // true = filled check, false = outlined box, omit = no indicator
    submenu?: readonly MenuEntry[]; // flyout submenu - renders a ▶ indicator, opens on hover
}

type MenuEntry = MenuItem | "divider";

interface MenuConfig {
    label: string;
    items: readonly MenuEntry[];
}
```

example:

```ts
const menus: MenuConfig[] = [
    {
        label: "File",
        items: [
            { label: "New",  shortcut: "mod-n", onclick: () => handlers.new() },
            { label: "Open", shortcut: "mod-o", onclick: () => handlers.open() },
            "divider",
            { label: "Close", danger: true, onclick: () => handlers.close() },
        ],
    },
    {
        label: "Edit",
        items: [
            { label: "Undo", shortcut: "mod-z", onclick: () => handlers.undo(), disabled: !canUndo },
            { label: "Redo", shortcut: "mod-shift-z", onclick: () => handlers.redo(), disabled: !canRedo },
        ],
    },
];
```

---

## canonical shell pattern

Shell owns all of the header chrome — title, dividers, menu bar. apps pass data via props and supply app-specific content via snippets. **do not pass `{#snippet title()}` — pass a `title` string prop instead.**

```svelte
<!-- App.svelte -->
<script lang="ts">
    import { Shell, AuthBar } from "@attu/ui";
    import type { MenuConfig } from "@attu/ui";
    import { Undo2, Redo2 } from "@lucide/svelte";

    // title is a plain string prop on Shell, not a snippet
    // pass onTitleChange to make the title editable (tree-editor pattern)
    // pass readOnly to show the "(read-only)" badge and lock editing
</script>

<!-- static title (wiki-editor, read-only views) -->
<Shell title={pageTitle || "untitled"} {menus}>
    ...
</Shell>

<!-- editable title (tree-editor pattern) -->
<Shell
    bind:this={shellRef}
    title={treeStore.tree.name || "untitled"}
    {menus}
    onTitleChange={(name) => treeStore.update((t) => ({ ...t, name }))}
    {readOnly}
>
    ...
</Shell>
```

Shell also exposes `startEdit()` via `bind:this` so command-palette / shortcut handlers can trigger inline rename programmatically:

```ts
let shellRef: { startEdit: () => void } | undefined;
// ...
treeRename: () => shellRef?.startEdit(),
```

### Shell props

| prop | type | default | purpose |
| --- | --- | --- | --- |
| `title` | `string` | required | displayed in the header |
| `menus` | `readonly MenuConfig[]` | required | drives the pill menu bar |
| `onTitleChange` | `(t: string) => void` | — | enables inline rename on click |
| `readOnly` | `boolean` | `false` | shows "(read-only)" badge; suppresses edit |
| `logo` | snippet | — | left-most identity mark (SVG) |
| `tools` | snippet | — | icon toolbar buttons after menus |
| `auth` | snippet | — | auth strip (Shell wraps it in `ml-auto`) |
| `dock` | snippet | — | corner-pinned overlay (pills, dock windows) rendered on top of content |
| `dockCorner` | `"tl" \| "tr" \| "bl" \| "br"` | `"bl"` | which corner the `dock` snippet anchors to |
| `toolbar` | snippet | — | full-width toolbar row between the header and content area |
| `overlays` | snippet | — | `position:fixed` overlays outside the content clip |
| `children` | snippet | required | main content area |

### Shell snippet rules

1. **`title`** is NOT a snippet — pass it as a string prop. Shell renders the canonical title button/span internally.
2. **`tools`** is separated from `MenuBar` by an auto-inserted divider. omit the snippet entirely if there are no tool buttons.
3. **`auth`** is wrapped in `ml-auto` by Shell — don't add it yourself.
4. **`overlays`** renders after the content area div (outside `overflow-hidden`) — use for `position:fixed` overlays that must not be clipped.
5. **`children`** go inside Shell's `<div class="relative flex flex-col min-h-0 flex-1 overflow-hidden">`. use `h-full` on the outermost child.
6. **icon buttons are `h-7 w-7`** — 28px square, `flex items-center justify-center`, `rounded`, `hover:bg-canvas`. use `size={17} strokeWidth={2.5}` for lucide icons.

---

## what not to do

- **don't import from `@attu/ui` inside a web worker** — the barrel re-exports Svelte components; use `@attu/ui/pure` instead.
- **don't build the shell manually** — use `Shell`. hand-rolling the header risks using the wrong tokens (`bg-canvas` vs `bg-canvas-elev`), missing `shrink-0`, or adding a second toolbar row with its own border.
- **don't pass `{#snippet title()}` to Shell** — pass `title` as a string prop. Shell owns the title styling, editing state, and rename input.
- **don't use `Button` for icon-only toolbar buttons** — `px-3 py-1.5` padding makes them oversized; use raw `<button>` elements.
- **don't use `action:` on `MenuItem`** — the field is `onclick`. `action` does not exist on the type.
- **don't try to import components from `@attu/ui/components/...`** — always go through the barrel.

---

## metadata

```yaml
last_updated: 30 June 2026
```
