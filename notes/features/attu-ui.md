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
| `Shell` | **the root of every attu app** — full-viewport layout with header bar, content area, and overlay slot. accepts `menus`, `logo?`, `title?`, `tools?`, `auth?`, `overlays?`, `children` snippets |
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
| `CanvasChromeDock` | floating chrome dock for canvas tools |
| `Window` / `WindowOverlay` | dockable/floating panel system |
| `DockRegistration` | registers a panel into the dock system |

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

use `Shell` from `@attu/ui` as the root of every attu app. it handles the full-viewport layout, header CSS, dividers, and overlay host so apps only supply the variable parts via snippets.

```svelte
<!-- App.svelte -->
<script lang="ts">
    import { Shell, AuthBar } from "@attu/ui";
    import type { MenuConfig } from "@attu/ui";
    import { Undo2, Redo2 } from "@lucide/svelte";

    // icon toolbar buttons use raw <button> NOT @attu/ui Button
    // AuthBar is optional — only in apps backed by the attu server
    // rename props that clash with snippet names: let { title: pageTitle } = $props()
</script>

<Shell {menus}>
    {#snippet logo()}
        <!-- optional: inline SVG or img for the app identity mark -->
    {/snippet}

    {#snippet title()}
        <span class="truncate px-1.5 py-0.5 text-sm font-semibold">{pageTitle || "untitled"}</span>
    {/snippet}

    {#snippet tools()}
        <!-- icon toolbar buttons: h-7 w-7, rounded, hover:bg-canvas -->
        <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded text-fg hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={!canUndo}
            onclick={handleUndo}
        >
            <Undo2 size={17} strokeWidth={2.5} />
        </button>
    {/snippet}

    {#snippet auth()}
        <!-- Shell wraps this in ml-auto automatically -->
        <AuthBar
            onSignedIn={() => void authStore.fetch()}
            onerror={(msg) => toasts.push(msg, "error")}
        />
    {/snippet}

    {#snippet overlays()}
        <!-- dialogs, toasts, context menus — anything position:fixed -->
        <Toasts store={toasts} />
        {#if showAbout}<AboutDialog onClose={() => (showAbout = false)} />{/if}
    {/snippet}

    <!-- children: main content area, fills remaining height -->
    <!-- use h-full on the outermost child to fill Shell's flex-1 container -->
    <main class="flex h-full">
        <!-- canvas, editor, or other content -->
    </main>
</Shell>
```

### Shell snippet rules

1. **`logo` and `title`** are separated from `MenuBar` by an auto-inserted divider. if neither is present, no divider is inserted.
2. **`tools`** is separated from `MenuBar` by an auto-inserted divider. omit the snippet entirely if there are no tool buttons.
3. **`auth`** is wrapped in `ml-auto` by Shell — don't add it yourself.
4. **`overlays`** renders after the content area div (outside `overflow-clip`) — use for `position:fixed` overlays that must not be clipped.
5. **`children`** go inside Shell's `<div class="relative min-h-0 flex-1 overflow-clip">`. use `h-full` on the outermost child.
6. **prop/snippet name clash** — if a component prop shares a name with a snippet (e.g., a `title` prop and a `{#snippet title()}`), rename the prop via destructuring: `let { title: pageTitle } = $props()`.
7. **icon buttons are `h-7 w-7`** — 28px square, `flex items-center justify-center`, `rounded`, `hover:bg-canvas`. use `size={17} strokeWidth={2.5}` for lucide icons.

---

## what not to do

- **don't import from `@attu/ui` inside a web worker** — the barrel re-exports Svelte components; use `@attu/ui/pure` instead.
- **don't build the shell manually** — use `Shell`. hand-rolling the header risks using the wrong tokens (`bg-canvas` vs `bg-canvas-elev`), missing `shrink-0`, or adding a second toolbar row with its own border.
- **don't use `Button` for icon-only toolbar buttons** — `px-3 py-1.5` padding makes them oversized; use raw `<button>` elements.
- **don't use `action:` on `MenuItem`** — the field is `onclick`. `action` does not exist on the type.
- **don't try to import components from `@attu/ui/components/...`** — always go through the barrel.

---

## metadata

```yaml
last_updated: 19 June 2026
```
