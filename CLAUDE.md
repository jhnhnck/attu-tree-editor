# CLAUDE.md

FamilyTreeEditor: client-side svelte 5 + vite + tailwind v4 spa for editing family trees in the [Attu Project](https://attuproject.org) wiki universe, backed by a thin fastapi + sqlite service. lives at `devel/FamilyTreeEditor/` inside attu-wiki-dev.

## canonical guides

- [notes/agents.md](notes/agents.md) - architecture, configuration tiers, coding conventions, testing layout, design decisions, patterns and pitfalls. read this first.
- [notes/dev/process.md](notes/dev/process.md) - the phased-plan / phase-loop / ship-gate development process and which skills to invoke at each step.

## hard rules (do not bend)

1. no `git push` or prod deploy without explicit ask.
2. no committed secrets. `data/` is gitignored; secrets live in `data/trees-config.toml` `[secrets]`.
3. in-universe dates use `HaracalndeDate`, never `Date`.
4. permissive schema: validate-as-finding, never reject - the fiction includes time travel, self-couples, polygamy, ancestral cycles, asexual reproduction. see `agents.md` §8.1.
5. only export format is GEDZIP `.gdz`. `.ged` and FamilyScript `.txt` are import-only. see `agents.md` §8.2.
6. every persisted artifact carries `schemaVersion`; bumping `CURRENT_SCHEMA_VERSION` requires a `Migration` in `domain/schema.ts`. see `agents.md` §8.3.

## style

lowercase inline comments, no trailing periods. regular dashes, never em-dashes. american english. spaces for indentation. brief over long.

## skills

project-specific skills under `.claude/skills/` are canonical when they diverge from the notes above. load by name.
