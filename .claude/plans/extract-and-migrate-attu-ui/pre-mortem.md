# pre-mortem — extract-and-migrate-attu-ui

**Bottom line:** proceed with revisions

### Risks

- [high] premise — `@attu/ui@workspace:*` in attu-editor uses pnpm's workspace protocol, which requires attu-ui to be listed in attu-editor's `pnpm-workspace.yaml`; `pnpm link` alone does not satisfy `workspace:*` and a cold `pnpm install` will fail · probe: in phase 0, run `pnpm install` clean in attu-editor after adding attu-ui via symlink to `packages/`; confirm resolution before any other phase-0 work
- [high] scope — `AuthBar.svelte`, `LinkCodeDialog.svelte`, and `state/auth.svelte.ts` all import from `$lib/api/client`; the source plan marks them "no changes needed before move" but these imports break on extraction; `$lib/api/client` does not exist in attu-ui · probe: before phase 2 copies these files, confirm whether `@attu/api-client` (the tree-editor workspace package) can serve as a peer dep of attu-ui; if yes, the refactor is a path change; if no, the components need prop/context refactoring for auth callbacks
- [high] integration — Vite may not follow pnpm-link symlinks without `resolve.preserveSymlinks: true` in vite.config.ts; importing a linked Svelte package can also trigger "multiple Svelte instances" if the linked copy brings its own svelte dep · probe: in phase 0, run `pnpm dev` in tree-editor after linking attu-ui; confirm Button renders in browser with no "multiple Svelte instances" console error
- [medium] dependency — Tailwind v4 `@import "@attu/ui/theme.css"` propagates CSS custom properties but may not enable Tailwind utility-class generation for tokens defined only in the imported file; the Tailwind scanner must also see the token definitions to emit utilities · probe: in phase 0, verify that a custom-color utility class (e.g., `bg-primary`) from attu-ui's theme.css renders correctly in tree-editor's dev build
- [medium] scope — phase 2 combines three distinct work streams (api-client refactoring, dialog conversions, mass file copy) in one phase; if any single stream reveals unexpected complexity it blocks the entire phase · mitigation: add a pivot criterion — if any stream takes more than one session to complete, split the phase via plan-revise
- [low] operational — between phase 2 (copy to attu-ui) and phase 3 (delete from tree-editor), the same components live in two places; a bug fix applied to one copy won't propagate to the other · mitigation: phases 2 and 3 must be completed in the same session

### Walking-skeleton check

Phase 0 is a real walking skeleton (attu-ui → tree-editor → attu-editor). Gap: the original DoD said only "pnpm typecheck passes" — not a browser render check. Typecheck alone misses Vite symlink issues and Tailwind class resolution. Revised DoD requires `pnpm dev` + browser render + Tailwind token probe before phase 0 can close.

### Phase-order revisions

| original | proposed | reason |
|---|---|---|
| phase 2: dialog conversion then file extraction | phase 2: api-client decoupling first, then dialog conversion, then file extraction | api-client refactoring in AuthBar/LinkCodeDialog/auth.svelte.ts must complete before those files are copied; doing it in the same phase preserves atomicity |
| (no explicit ordering) | phases 2 and 3 completed in same session | trunk has duplicate code between copy (phase 2) and deletion (phase 3); multi-session gap is an operational risk |

### Definition-of-done additions

- phase 0 — add: `pnpm install` succeeds clean in attu-editor after workspace.yaml + symlink setup; Button renders in browser; Tailwind token probe passes; domain-clean audit result documented
- phase 1 — add pivot criterion: if more than two new props required to decouple CommandPalette, run plan-revise
- phase 2 — add: each converted dialog smoke-tested for focus trap, Escape, and ::backdrop before file copy begins; pivot criterion if any additional domain dependency found
- phase 3 — add: 5-minute browser smoke-test of all three views (layered, family-view, hyperbolic) before phase closes; do not mark done on typecheck alone
