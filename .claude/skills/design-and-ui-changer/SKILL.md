---
name: design-and-ui-changer
description: Make UI / UX changes to the FamilyTreeEditor web client (apps/web/src/lib/ — Svelte 5 runes, inspector sidebar, menu bar, command palette, dialogs, tree-canvas chrome, theme tokens). Use before touching components, adding features, fixing visual issues, or wiring shortcuts. Covers stack quirks (Svelte 5 runes, exactOptionalPropertyTypes, Tailwind v4 tokens, lucide icons), conventions (auto-commit on blur, action registry as single source of truth, lowercase microcopy, two ways to reach every action, mobile-aware), architecture map, verification commands, and common reusable patterns.
---

# Profile — design + UI changer

A working profile for the next agent (or human) who picks up UI / UX work on
this codebase. Read this once before touching anything in `apps/web/src/lib/`.
It's the stuff that *isn't* in the code and that tooling won't tell you.

---

## What this app actually is

A client-side family-tree viewer + editor for a fictional setting. Trees are
small (dozens to a few hundred people), edited by one person at a time, persist
locally via Dexie / IndexedDB, and sync to a FastAPI backend when the user is
signed in. The audience is small enough that **discoverability beats density**
— prefer a clear menu item over a clever interaction.

The tree canvas is the workspace. **Editing surfaces never fully cover it.**
That's why the Inspector is a right sidebar and not a modal. If you find
yourself reaching for `<dialog>`, stop and check whether the sidebar (or a
popover on the relevant control) fits.

---

## Stack quirks that bite

- **Svelte 5 with runes** (`$state`, `$derived`, `$effect`, `$props`).
  Templates do **not** narrow types via the `in` operator reliably in
  `{:else}` branches. When you have a discriminated union, write a `function
  isFoo(x): x is Foo` type-guard helper and use it in the `{#if}`. Casting via
  `{@const x = item as Foo}` works as a fallback.
- **`exactOptionalPropertyTypes: true`** is on. Optional callback props need
  explicit `| undefined` in the `Props` interface (e.g. `onerror?: ((msg:
  string) => void) | undefined`). Just `?:` won't satisfy a parent that passes
  `undefined`.
- **`no-import-assign` from eslint** trips on type re-exports from `.svelte`
  files. If you need to share a type used in templates, put it in a plain
  `.ts` sibling (see `menu.ts` next to `Menu.svelte`).
- **`@lucide/svelte` icon types** are loose enough to leak `any` through
  `{@const Icon = entry.icon}`. Use the `IconComponent` type alias
  (`Component<Record<string, unknown>>`) and cast.
- **Tailwind v4** with theme tokens, not raw colors. Use `bg-canvas`,
  `bg-canvas-elev`, `text-fg`, `text-fg-muted`, `border-line`, `accent`,
  `accent-strong`. Never hardcode `bg-zinc-*` or `text-gray-*`.
- **`prefers-color-scheme` is the only theme switch right now.** A
  user-settings dialog with explicit light/dark/auto is in the to-do list
  under `### user preferences`. If a feature needs a per-user toggle, route it
  there instead of inventing a parallel store.
- **Prettier-plugin-tailwind is pinned off** for now (no Svelte 5 support
  upstream); class-order will look slightly different from a Tailwind v3
  codebase. Don't waste time re-ordering classes.

---

## Conventions you must keep

- **Auto-commit on blur, not Save/Cancel.** Inspector fields, inline-rename
  inputs, every editable control. The Save/Cancel pattern is a previous-era
  artifact that the Phase B inspector intentionally killed.
- **Two ways to reach every action.** Menu (mouse) + shortcut (keyboard) at
  minimum. Command palette closes the gap. If you add a new feature and only
  wire one of those, you've shipped half a feature.
- **Icons accompany text, never replace.** lucide-svelte icons are leading or
  trailing affordances; the label is the source of truth.
- **Mobile-aware from day one.** Sidebar collapses to a bottom-sheet at
  `<600px`. Don't add desktop-only UI without thinking about the narrow case.
- **Honor the spec.** [`notes/features/keyboard-shortcuts.md`](../../../notes/features/keyboard-shortcuts.md)
  is settled — wire bindings as listed; don't re-litigate. Browser-reserved
  combos (`Mod+N`, `Mod+Shift+N`, `Mod+1`) are intentionally dropped.
- **Lowercase microcopy.** Button labels, menu items, headings, placeholders
  — all lowercase ("set as tree root", "edit person", "untitled"). Title
  case is reserved for the tree's own family name.
- **Toast for transient errors.** Don't put errors inline under the bar that
  fired them — call `toasts.push(msg, "error")`. If the component doesn't
  have toast access, give it an `onerror` callback prop and wire it from
  `App.svelte`. Same pattern as `onSignedIn`.

---

## Architecture map (what lives where)

| Layer | Path | What's inside |
| :---- | :--- | :----- |
| Domain | `lib/domain/` | `types.ts`, `tree.ts` (immutable ops + `PersonPatch`), `validate.ts`, `ids.ts`, `schema.ts` |
| State | `lib/state/` | runes-based stores: `tree.svelte.ts`, `selection`, `viewport`, `auth`, `toasts`, `progress`, `portraitUrls`, `sync`, `preferences`, `engine.ts` (active layout engine) |
| IO | `lib/io/` | `familyscript/`, `gedcom/`, `bundle/`, `merge/`, `importFile.ts` |
| Layout | `lib/layout/` | four-pass IR pipeline (`ir.ts`, `passes/{layer,order,place,route}.ts`), engine boundary (`engine.ts`), three engines under `engines/{layered-hv,family-view,hyperbolic-lr}/`, `layout.worker.ts` (off-main-thread), shared utilities: `edgeRouter.ts`, `kinship.ts`, `pathHighlight.ts` |
| Canvas | `lib/components/tree/` | `TreeCanvas.svelte`, `FamilyViewCanvas.svelte`, `HyperbolicCanvas.svelte` (per-engine renderers), `PersonNode.svelte` (foreignObject card), `EdgeLayer.svelte` + `edgePath.ts` (SVG connectors), `canvasController.ts` (pan/zoom/focus), `DebugOverlay.svelte` (Ctrl+Shift+D), `InstancePopover.svelte` |
| Canvas chrome | `lib/components/canvas/` | `ZoomWidget.svelte`, `BackButton.svelte` |
| Editor | `lib/components/editor/` | `PersonEditor.svelte` (`<dialog>` form), `PortraitField.svelte`, `CropperDialog.svelte` + `CropperCanvas.svelte` (canvas portrait cropper) |
| Inspector | `lib/components/inspector/` | `Inspector`, `PersonalTab`, `ConnectionsTab`, `DetailsTab`, `RelationshipsTab`, `GroupsTab`, `SibshipTab`, `PersonChooser` |
| Shell | `lib/components/shell/` | `MenuBar`, `Menu`, `menu.ts` (action registry), `AuthBar`, `AdminPanel`, `SaveStatusPill`, `ProgressStrip`, `OpenDialog`, `ShareDialog`, `SettingsDialog`, `LinkCodeDialog` |
| Palette | `lib/components/palette/` | `CommandPalette.svelte` + `commands.ts` (Ctrl+P quick-jump + Ctrl+Shift+P command palette) |
| Help | `lib/components/help/` | `ShortcutsOverlay` |
| UI primitives | `lib/components/ui/` | `Button`, `ContextMenu`, `Toasts`, `Field`, etc. |
| Form | `lib/components/form/` | `DateInput` (Haracalnde calendar popup), `Field.svelte` |
| Keyboard | `lib/keyboard.ts`, `lib/shortcuts.ts` | global handler + binding table |

Anything new should slot into the right folder. If you find yourself adding
a new top-level folder, you're probably missing context — ask first.

---

## The action registry (don't bypass it)

`lib/components/palette/commands.ts` is the **single source of truth** for
every menu item, palette entry, and shortcut binding. The shape:

```ts
buildCommands(handlers, icons, enabledFlags) → Command[]
```

Every command appears in three surfaces (menu / palette / shortcut). When you
add a feature:

1. Add the handler in `App.svelte`.
2. Register the command in `commands.ts`.
3. The menu and palette pick it up automatically.
4. Add the shortcut entry in `shortcuts.ts` if it's keyboard-bindable.

Don't wire a button straight to a handler — that creates a surface that the
palette can't see, and discoverability rots.

---

## Multi-engine canvas architecture

Three layout engines ship, all stable:

- **layered-hv** (`engines/layered-hv/`) — HV tidy tree; the classic top-down view. Rendered by `TreeCanvas.svelte`.
- **family-view** (`engines/family-view/`) — bounded-window ego view; shows a focus person with visible ancestors, spouses, and descendants. Rendered by `FamilyViewCanvas.svelte`.
- **hyperbolic-lr** (`engines/hyperbolic-lr/`) — hyperbolic disk. Rendered by `HyperbolicCanvas.svelte`.

The active engine is set in `lib/state/engine.ts` and flows through `App.svelte`. All three share `canvasController.ts` for pan/zoom/focus.

**If you work on any engine or edge layer:**
- Coordinates are in unit space until the canvas component multiplies by `UNIT = 80`.
- Edges render as one `<path>` per role with `vector-effect: non-scaling-stroke` so pan/zoom stays GPU-composited. Don't introduce per-segment `<line>` elements — perf regresses on 1k+ edges.
- Layout runs in `layout.worker.ts` off the main thread; don't import live Svelte state into the pipeline.

**Family-view card affordance slots are reserved.** Every visible card has six fixed slots. New affordances must pick a free slot or use an existing menu — don't overlap:

| slot | current occupant |
| :--- | :--- |
| top-left | `+ person` (focus only) / generation badge (non-focus) |
| top-right | `−` collapse |
| top-centre | `+` expand parents |
| bottom-centre | `+` expand children |
| bottom-right | `˅` union picker |
| bottom edge | 1-px era underline |

**Family-view localStorage flags** (all default-on, no UI yet — tracked in to-do.md as View > Advanced):
- `fte.zoom.semantic100` — semantic 100% zoom derived from card width
- `fte.layout.familyViewCrossingMin` — barycentric crossing-min pass
- `fte.overlays.smoothDiff` — CSS card-position transitions on layout change
- `fte.layout.familyViewSecondaryUnion` — 2-unions-max secondary expansion

**Wrapper-attribute selectors for e2e**: family-view affordances live on the *absolutely-positioned wrapper* around `PersonNode`, not on `[data-person-id]`. Use `data-expand-toggle`, `data-union-picker`, `data-on-path`, `data-add-toggle`, `data-generation-badge`, `data-silhouette`, `data-era-underline`. Scan existing aria-label selectors before settling on copy for a new affordance.

---

## Dexie + autosave

The tree store autosaves to IndexedDB on blur (and a few other triggers).
Don't add a manual Save button to anything — the user model is "your edits
just exist". The save-status pill in the title strip is the indicator.

If autosave fails, the pill goes red, *and* a toast fires
(`autosave failed: ...`). Don't add another error surface for the same event.

---

## Verification — what actually catches bugs

`pnpm verify` runs typecheck + lint + unit tests + build + server lint +
server tests. Use individual scripts during iteration:

- `pnpm typecheck` — `svelte-check`. Catches most prop-typing mistakes.
- `pnpm lint` — eslint + prettier. The `@typescript-eslint/no-unsafe-*`
  family is what bites most often when adding props or callbacks. Two
  common fixes: explicit type annotation on lambda params, or a type-guard
  helper for narrowing.
- `pnpm test:unit` — Vitest with `@testing-library/svelte`. Component tests
  live in `apps/web/tests/component/`. Most UI changes don't need a new
  test, but breaking an existing one is a real regression — read it before
  changing the assertion.

For UI work specifically: **type-checking and unit tests verify code
correctness, not feature correctness.** If you can't load it in a browser,
say so explicitly rather than claiming the task is done. The dev server
runs with `pnpm dev` (port 5173).

For visual issues (overflow, layout, color, pointer states), screenshots
beat speculation. If the user gives you a screenshot, look at it carefully
before proposing fixes — and if you're not sure what they're pointing at,
*ask*. Guessing wrong wastes more time than the question takes.

---

## Working with `notes/`

- [`notes/to-do.md`](../../../notes/to-do.md) is the active backlog. Open items use
  `- ⭕ \`priority\` \`effort\` description`. Completed items use
  `- 🔴 \`DD Month YYYY\` description` and live in the `## completed`
  section, grouped by phase / topic. Bump `total_completed` in the metadata
  block when you complete items.
- [`notes/design-issues.md`](../../../notes/design-issues.md) is a holding area for UI
  papercuts that aren't yet routed. When you fix them, *clear* them from
  here and add the completion to `to-do.md` — don't leave the description
  in both places.
- [`notes/features/keyboard-shortcuts.md`](../../../notes/features/keyboard-shortcuts.md)
  is the canonical shortcuts spec. It diverges slightly from what shipped
  (browser-reserved combos dropped); the to-do has a tooling task to
  reconcile.
- [`notes/agents.md`](../../../notes/agents.md) covers global project conventions
  (commit style, lint hygiene, etc.) — read before commits.

Don't write planning docs, decision records, or "implementation summaries"
into `notes/` unless asked. Conversation context + git history are the
record. The exception is when the user explicitly asks for one (like this
profile).

---

## Commit hygiene

- Style: `type(scope): noun phrases, comma-separated, lowercase`.
  Examples: `feat(ui): inspector with connections editor`,
  `fix(canvas): zoom slider fill tracks thumb`,
  `feat(share): copy view-link, grants list`.
- Three items max in the subject — if you have more, split the commit.
- The body explains *why*, not what. Skip the body for trivial changes.
- Commit completed work. Don't bundle unrelated in-flight changes into a
  commit you didn't author. Stage explicit files, not `-A`.

See [`notes/style/commit_style.md`](../../../notes/style/commit_style.md) for the full
rules.

---

## Common patterns to reuse

- **Popover with overflow-flip**: measure `containerEl.getBoundingClientRect()`
  in a `tick()` after open, set an `alignRight` `$state` flag, apply
  `class:left-0={!alignRight} class:right-0={alignRight}`. See `DateInput.svelte`.
- **Discriminated-union list with dividers / headers / etc.**: define a type
  guard `function isDivider(x): x is Divider`, branch with `{#if isDivider(x)}`
  in the `{#each}`. See `ContextMenu.svelte`.
- **Per-component error → toast bridge**: callback prop `onerror?: ((msg:
  string) => void) | undefined`, wired from `App.svelte` via
  `onerror={(msg: string) => toasts.push(msg, "error")}`. Keep the explicit
  `: string` annotation on the lambda — eslint's `no-unsafe-argument` doesn't
  trust the inferred type through Svelte's prop inference.
- **CSS custom properties from a reactive value**: `style:--val="{Math.round(x
  * 100)}%"` — Svelte re-evaluates on each `x` change. Cleaner than a JS
  oninput handler.
- **Patch type that allows undefined-deletes for optional fields**: see
  `PersonPatch` in `lib/domain/tree.ts`. Required keys stay required;
  optional keys accept `T | undefined` and `updatePerson` deletes them on
  `undefined`. Reuse this pattern for any future "partial update" type.

---

## When the user gives you a screenshot

1. Look at it before talking. Identify what you actually see vs. what you
   *think* should be there.
2. If multiple things look wrong, name them all and ask which one they
   meant. Don't pick one and just go.
3. If you can't tell what's wrong from the image alone, ask for the
   element name, the area of the canvas, or what they expected to see.

The user usually has a specific issue in mind that's obvious to them and
ambiguous to you. The cost of one clarifying question is low; the cost of
a wrong fix is replacing it with another wrong fix.
