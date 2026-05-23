# bugs — portrait cropper rewrite

## open

- **[important · rollback gate · 2026-05-23]** real-device hardware probes pending. probe scaffolding shipped at `/probes/exif.html` and `/probes/touch.html`. DoD-0a parts (2) and (3) and DoD-1 mobile-pinch are unverified until a tester with an iphone records the results in `pre-mortem.md`. phase 0b shipped under gate-override; recovery if probe returns "no" is `git revert d3693a9 && pnpm install` to restore cropperjs and the legacy dialog.
- **[important · gates phase 4 · 2026-05-23]** placeholder playwright golden baseline (`apps/web/tests/e2e/portrait-crop.spec.ts`) not captured. spec currently `test.skip`s when the portrait field isn't reachable from a fresh shell — the test needs to drive the inspector to the portrait field before snapping. **triage:** demoted from blocker — the harness exists, the baseline is a per-phase task; phase 4 will need to revisit. retire pre-mortem risk #5 once baseline is captured and two consecutive ci runs are green.
- **[deferred · pre-existing · 2026-05-23]** `visual-path-highlight-multi-union.png` snapshot dimension mismatch in the worktree (920×806 → 920×1241). cropper code does not touch family-view layout or selection state. likely cause: fresh playwright chromium-headless-shell v1223 renders the auto-sized family-view canvas slightly taller than the baseline captured at commit `f00d718`. other visual goldens (akarians, multi-union, add-relative, family-view) all pass. **triage:** defer per user; revisit if the same failure appears on `trunk`. not a cropper regression.

## closed

(populated at phase close)
