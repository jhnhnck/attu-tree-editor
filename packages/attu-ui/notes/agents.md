# AttuUI - agent guide

## 1. project overview

shared Svelte 5 + Tailwind v4 component library for the Attu Project. extracted from tree-editor. includes generic UI primitives (Button, Field, ContextMenu), app shell components (MenuBar, CommandPalette, dialogs), and the HaracalndeDate calendar type. consumed by tree-editor and attu-editor as a pnpm workspace package.

---

## 2. rules

1. do not edit the rules.
1. do not use git push or deploy any changes to prod without being explicitly asked to.
1. do not commit secrets.
1. no `git commit` without explicit instruction in the current turn.
1. no tree-editor domain logic here — components must be generic and accept data via props/slots.
1. HaracalndeDate is the canonical home for the Haracalnde calendar type; do not duplicate it in consumers.
1. all dialogs use native `<dialog>` with `showModal()` — no custom fixed-position overlay pattern.

---

## 3. architecture

*(stub — fill in after extraction from tree-editor)*

| Module | Role |
| :--- | :--- |
| `src/lib/components/ui/` | Button, ContextMenu, Toasts — generic primitives |
| `src/lib/components/form/` | Field, DateInput (HaracalndeDate-aware) |
| `src/lib/components/shell/` | MenuBar, Menu, SaveStatusPill, ProgressStrip, dialogs, AuthBar |
| `src/lib/components/canvas/` | Window, WindowOverlay, CanvasChromeDock, ZoomWidget |
| `src/lib/components/palette/` | CommandPalette (generic, data via props) |
| `src/lib/components/help/` | ShortcutsOverlay |
| `src/lib/date/` | HaracalndeDate class and gregorian conversion |
| `src/lib/state/` | generic stores: toasts, progress, preferences, auth |

---

## 4. configuration system

*(stub)*

---

## 5. coding conventions

*(stub — follow tree-editor conventions; see `.claude/skills/comment-style`, `.claude/skills/commit-style`)*

---

## 6. testing

*(stub)*

---

## 7. running locally

*(stub)*

---

## 8. patterns & pitfalls

*(stub — populate reactively as issues surface)*

---

## metadata

```yaml
last_updated: 10 June 2026
```
