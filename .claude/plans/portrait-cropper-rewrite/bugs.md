# bugs — portrait cropper rewrite

## open

- **[blocker · phase 0a · 2026-05-23]** real-device probes deferred to a human tester. probe scaffolding shipped at `/probes/exif.html` and `/probes/touch.html`. DoD parts (2) and (3) cannot be closed until a tester with an iphone records the results in `pre-mortem.md`. phase 1 must not start until both probes return green per the plan's rollback criterion.
- **[blocker · phase 0a · 2026-05-23]** placeholder playwright golden baseline (`apps/web/tests/e2e/portrait-crop.spec.ts`) not yet captured. requires one local `pnpm -F web exec playwright test portrait-crop --update-snapshots` run + commit of the snapshot, then two consecutive green ci runs to retire pre-mortem risk #5. DoD part (4).

## closed

(populated at phase close)
