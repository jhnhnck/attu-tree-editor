# bugs — extract-and-migrate-attu-ui

## open

- [important] debt-05: Playwright browser binary absent; e2e suite cannot run → defer · pre-existing env gap; needs `pnpm exec playwright install` outside this session; not introduced by this plan

## patterns observed

phase 2 audit uncovered a secondary cluster of missed extractions (utils/result.ts, menu.ts, keyboard.ts, editor utilities) — all stem from the phase 0 domain-clean grep only covering $lib/domain / $lib/layout / $lib/state / $lib/api patterns; intra-components imports were not scanned. phase 3 import migration should confirm no further $lib patterns remain in extracted copies before deleting originals.

phase 3 revealed a new constraint class: web worker build contexts cannot process Svelte files even via workspace packages; pure-TS utilities need a separate export subpath. this pattern will recur if new utilities are added to `@attu/ui` and used in worker-visible code paths.

## closed

- [important] debt-01: ShareDialog.svelte + AdminPanel.svelte import $lib/api/client → closed in phase 2 · all 5 api/client-coupled files now import from @attu/api-client
- [nit] debt-03: duplicate files in tree-editor that now exist in attu-ui → closed in phase 3 · all originals deleted; auth-stub.ts deleted
- [nit] debt-02: duplicate @import "tailwindcss" in app.css → closed in phase 4 · removed; attu-ui/theme.css is now the sole source
- [nit] debt-06: `@attu/ui/pure` subpath constraint undocumented → closed in phase 4 · documented in packages/attu-ui/CLAUDE.md rule #6
- [nit] debt-04: packages/attu-ui/.claude/ nested dirs → removed manually · `rm -rf packages/attu-ui/.claude`
