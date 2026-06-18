# bugs — extract-and-migrate-attu-ui

## open

- [nit] debt-02: duplicate @import "tailwindcss" (attu-ui/theme.css + apps/tree-editor/src/app.css both include it) → fix-in-phase-4 · Vite deduplicates at build time; consolidation is the phase 4 CSS cleanup
- [nit] debt-03: duplicate files in tree-editor that now exist in attu-ui (all extracted files + auth-stub.ts) → fix-in-phase-3 · intentional duplicate window per plan; local copies deleted during phase 3 import migration
- [nit] debt-04: packages/attu-ui/.claude/ nested dirs (skills, settings from attu-ui repo) → defer · cosmetic; monitor if Claude Code picks up nested skills unexpectedly
- [important] debt-05: Playwright browser binary absent; e2e suite cannot run → defer · pre-existing env gap; needs `pnpm exec playwright install` outside this session; not introduced by phase 0

## patterns observed

phase 2 audit uncovered a secondary cluster of missed extractions (utils/result.ts, menu.ts, keyboard.ts, editor utilities) — all stem from the phase 0 domain-clean grep only covering $lib/domain / $lib/layout / $lib/state / $lib/api patterns; intra-components imports were not scanned. phase 3 import migration should confirm no further $lib patterns remain in extracted copies before deleting originals.

## closed

- [important] debt-01: ShareDialog.svelte + AdminPanel.svelte import $lib/api/client → closed in phase 2 · all 5 api/client-coupled files now import from @attu/api-client
