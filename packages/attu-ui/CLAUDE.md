# CLAUDE.md

AttuUI: shared Svelte 5 + Tailwind v4 component library for the Attu Project apps (tree-editor, attu-editor, and future projects). includes the HaracalndeDate calendar type. published as a pnpm workspace package consumed by sibling repos.

## canonical guides

- [notes/agents.md](notes/agents.md) - architecture, package structure, coding conventions, component authoring patterns. read this first.

## hard rules (do not bend)

1. no `git push` or prod deploy without explicit ask.
2. no committed secrets.
3. no `git commit` without explicit instruction in the current turn.
4. no tree-editor domain logic (family trees, GEDCOM, layout engines) — this is a generic UI library.
5. HaracalndeDate lives here; do not duplicate it in consumer repos.
6. **worker-safe imports:** any file that runs inside a web worker (e.g. tree-editor's `layout.worker.ts` via domain types) must import from `@attu/ui/pure`, not `@attu/ui`. the `@attu/ui` barrel re-exports Svelte components; Vite's worker bundler cannot process `.svelte` files and will fail with a parse error. `@attu/ui/pure` (`src/lib/pure.ts`) re-exports only pure TypeScript utilities (Result, HaracalndeDate, date helpers). keep `pure.ts` in sync with any new pure-TS utility added to the barrel.

## style

lowercase inline comments, no trailing periods. regular dashes, never em-dashes. american english. spaces for indentation. brief over long.

## skills

project-specific skills under `.claude/skills/` are canonical when they diverge from the notes above. load by name.
