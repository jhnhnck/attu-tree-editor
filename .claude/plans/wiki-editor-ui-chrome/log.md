# log — wiki-editor-ui-chrome

## starting phase 0 — 2026-06-21

worktree: opted out (working in place on trunk)

**confirmed DoD:**
- all 8 top-level menus (File, Edit, Insert, Format, View, Page, Tools, Help) open on click
- all items from `ui-outline.md` present with correct labels, dividers, groupings
- selecting any item closes the menu
- Insert menu section header approach: disabled MenuItem items as section labels (approach a)
- `pnpm typecheck` clean

## phase 0 retro — 2026-06-21

### spec delta
- delivered: all 8 menus, all items from ui-outline.md, correct dividers and groupings, section headers as disabled items, admin items disabled, lint + typecheck clean
- missed / deferred: none
- extra: fixed pre-existing lint failure (`bind:this` unsafe-call) that predates this phase; dist/ files reformatted by prettier (pre-existing, no .prettierignore)

### surprises
- `let editor: Editor` → lint still sees method calls as `any` even after explicit annotation → fixed by explicit interface `{ undoEdit: () => void; redoEdit: () => void }` (same pattern tree-editor uses for `shellRef`)
- `ReturnType<typeof Editor>` assumed to give instance type → ESLint's type checker still resolved methods as `any` → didn't work; had to use a hand-written interface
- Prettier reformatted `dist/` files → no `.prettierignore` exists in wiki-editor → minor friction, not a bug

### residual debt
- `let editor: { undoEdit... }` manual interface must stay in sync with Editor.svelte exports · routed to bugs.md: fixed when wiki-editor-text-editor properly types the component
- no `.prettierignore` in wiki-editor → dist/ gets checked and reformatted on every lint run · routed to bugs.md
- no e2e harness for wiki-editor yet · deferred to wiki-editor-build-pipeline or standalone

### implications for downstream phases
- wiki-editor-text-editor must establish the canonical bind:this type (or switch to props-based API) so App.svelte's editor interface doesn't drift

## revision after phase 0 — 2026-06-21

- phase 1 (primary toolbar + selection bar): revise — added constraint that App.svelte's `let editor` interface must include `getCursorCoords`; pattern from phase 0 locks the approach
- phase 2 (pills dock): unchanged
- phase 3 (right-click context menus): revise — pinned listener placement to inside Editor.svelte via `view.dom` onMount, with `oncontextmenu` prop callback; `view.posAtCoords()` cannot be accessed from App.svelte without exposing view, and that would repeat the phase 0 typing problem
- phase 4 (settings modal + shortcuts overlay): unchanged

## phase 0 addendum — 2026-06-21 (post-retro UX fixes)

two UX issues surfaced after retro via screenshot comparison against google docs:

1. **no flyout submenus** — Insert menu was 50 flat items with disabled section headers. fix: added `submenu?: readonly MenuEntry[]` to `MenuItem` in `@attu/ui/menu.ts`; updated `Menu.svelte` to render `ChevronRight` indicator and a hover-triggered flyout panel; restructured Insert menu in `App.svelte` to 8 submenu items.
2. **menus overflow viewport** — `max-h-[calc(100vh-3rem)] overflow-y-auto` added to main dropdown. discovered: `overflow-y: auto` causes computed `overflow-x: auto` (CSS spec), which clips absolutely-positioned flyouts extending to the right.

two additional fixes from live browser testing:

3. **flyout opened left / hovered closed immediately** — `position:fixed` flyout was outside the parent `div[role="none"]`'s hover area, so `onmouseleave` fired the instant the cursor moved toward it. fix: flyout is now a **sibling** to the scrollable dropdown div (not inside it), using `position:absolute` relative to the outer `.relative` wrapper. left = `dropdownEl.offsetWidth`; top = `itemRect.top - outerEl.getBoundingClientRect().top`. 100ms close-delay (`scheduleClose`/`cancelClose`) lets the cursor travel from trigger to flyout without flicker.
4. **Insert menu redesign** — all-flyout structure made everything one click too deep. refactored to mostly first-level: Wikilink, Ext link, H2, H3, Bullet, Numbered, Table, Image, Template, Reference, Special char at top; H4-H6+blocks in "More headings", definition+indent in "More lists", infobox/magic/parser in "More templates", named/reuse/ref-list in "More references", infrequent items in "Other". View menu: Zoom in/out/reset collapsed into "Zoom" flyout.

**commits on trunk:** 8f752d5, 349f993, 15eb003
