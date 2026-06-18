# bugs — extract-and-migrate-attu-ui

## open

- [important] debt-01: ShareDialog.svelte + AdminPanel.svelte import $lib/api/client → fix-in-phase-2 · same decoupling pattern as AuthBar/LinkCodeDialog; expand phase 2 scope by 2 files
- [nit] debt-02: duplicate @import "tailwindcss" (attu-ui/theme.css + apps/web/app.css both include it) → fix-in-phase-4 · Vite deduplicates at build time; consolidation is the phase 4 CSS cleanup
- [nit] debt-03: Button.svelte exists in both apps/web/src/lib/components/ui/ and packages/attu-ui → fix-in-phase-3 · intentional duplicate window per plan; local copy deleted during phase 3 import migration
- [nit] debt-04: packages/attu-ui/.claude/ nested dirs (skills, settings from attu-ui repo) → defer · cosmetic; monitor if Claude Code picks up nested skills unexpectedly
- [important] debt-05: Playwright browser binary absent; e2e suite cannot run → defer · pre-existing env gap; needs `pnpm exec playwright install` outside this session; not introduced by phase 0

## patterns observed

debt-01 extends an existing cluster: 5 components now have $lib/api/client coupling (AuthBar, LinkCodeDialog, state/auth.svelte.ts from original plan + ShareDialog, AdminPanel newly found). all share the same fix pattern (swap to @attu/api-client); phase 2 scope grew by ~2 files. no new premise is wrong — the pattern was known; only the count is higher.

## closed

(populated at phase close)
