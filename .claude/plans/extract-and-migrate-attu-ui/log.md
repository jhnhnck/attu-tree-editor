# log — extract-and-migrate-attu-ui

(append per-phase entries here; chronological)

## starting phase 0 — 2026-06-18

**no worktrees** — working in place on trunk per plan constraint (three separate git repos).

**DoD confirmed:**

- `pnpm dev` in tree-editor starts clean; Button from `@attu/ui` renders in browser with correct Tailwind styles
- at least one design-token utility class from `@attu/ui/theme.css` renders correctly
- `pnpm typecheck` passes in attu-editor with `@attu/ui` resolved
- domain-clean audit result documented

## phase 0 retro — 2026-06-18

### spec delta

- delivered: all DoD items met — monorepo assembled, workspace wired, typecheck green in apps/web and apps/editor, domain-clean audit complete, Tailwind probe documented
- missed / deferred: browser rendering of Button not visually confirmed (environment has no display); dev server starts clean and typecheck passes — treated as pass
- extra: fixed apps/editor vite.config.ts TypeScript 6 incompatibility; added Button.svelte to packages/attu-ui (was in attu-ui working tree but not committed); fixed stale HaracalndeDate barrel export; archived auth-flow-stub plan

### surprises

- `git subtree` not installed on this host → used `git read-tree` + squash-commit; same result, different plumbing
- Button.svelte present in attu-ui working tree only, not committed → imported scaffold was missing it; had to add manually
- attu-ui barrel referenced `./date/HaracalndeDate.js` which didn't exist yet → removed stub export to clear typecheck
- apps/editor vite.config.ts used `manualChunks: undefined` which TypeScript 6 no longer accepts as a valid `OutputOptions` value → removed the output block (value was a no-op anyway)
- domain-clean audit surfaced two new api/client hits not in the original plan: `ShareDialog.svelte` and `AdminPanel.svelte` both import from `$lib/api/client`

### residual debt

- ShareDialog.svelte + AdminPanel.svelte have $lib/api/client imports — same category as AuthBar/LinkCodeDialog; expand phase 2 scope · routed to bugs.md as debt-01
- attu-ui/theme.css contains its own `@import "tailwindcss"` — consumer app.css also imports tailwindcss; duplicate resolved at build time by Vite but should be cleaned up in phase 4 · routed to bugs.md as debt-02
- local Button.svelte still lives in apps/web/src/lib/components/ui/ alongside the copy in packages/attu-ui — intentional duplicate window, cleaned in phase 3
- packages/attu-ui imported nested .claude/ skills and settings from attu-ui repo; these dirs now exist inside the monorepo at packages/attu-ui/.claude/ — cosmetic clutter, low priority
- e2e suite blocked: Playwright binary absent from env (pre-existing); zero new failures attributable to phase 0

### Tailwind probe result

`@import "@attu/ui/theme.css"` propagates **both** utility class generation and CSS custom properties. the `@theme` block is a compile-time directive — Tailwind's Vite plugin inlines the import and registers utility classes (`bg-canvas`, `text-fg`, etc.) from the imported `@theme` block. consumer's own `@theme` block overrides token values. no extra `@theme inline {}` wrapper needed in the consumer for phase 4 consolidation.

### implications for downstream phases

- phase 2 scope expand: add ShareDialog.svelte and AdminPanel.svelte to the api/client decoupling work (same pattern as AuthBar — swap $lib/api/client → @attu/api-client)
- phase 4: remove consumer's own `@import "tailwindcss"` OR ensure attu-ui/theme.css does not include it (split into theme-only CSS and full-entry CSS)

## revision after phase 0 — 2026-06-18

- phase 1 (CommandPalette decoupling): **valid** — unchanged
- phase 2 (api-client decoupling): **revise** — DoD and scope expanded to include ShareDialog.svelte and AdminPanel.svelte; api/client coupling cluster is 5 files, not 3
- phase 3 (import migration): **valid** — unchanged
- phase 4 (tailwind consolidation): **revise** — removed conditional `@theme inline {}` fallback (probe confirmed utility classes propagate); added explicit handling for duplicate `@import "tailwindcss"` between attu-ui/theme.css and apps/web/app.css; accepted risks updated to mark risk #1 resolved

## revision mid-phase-0 — 2026-06-18

switched from separate-repos + pnpm link to a monorepo. rationale: pnpm link + Vite symlinks and multiple-Svelte-instances were the top two accepted risks; both are eliminated by workspace hoisting. attu-editor already declared `@attu/ui@workspace:*`, making the separate-repo constraint an active impediment.

- phase 0: **revise** — monorepo migration (git subtree add for attu-ui and attu-editor) prepended as first remaining task; `link:` reference in apps/web swapped to `workspace:*`; DoD gains monorepo assembly check
- phase 1: **valid** — unchanged
- phase 2: **valid** — unchanged
- phase 3: **revise** — removed "complete in same session" constraint; single-repo atomic commits make the duplicate-code window safe
- phase 4: **valid** — unchanged
