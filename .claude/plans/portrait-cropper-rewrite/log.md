# log — portrait cropper rewrite

(append per-phase entries here; chronological. `phase-retro` writes `## phase N retro` sections; `plan-revise` writes `## revision after phase N` sections.)

## starting phase 0a — 2026-05-23

- worktree: `.claude/worktrees/portrait-cropper-rewrite`
- branch: `phase/portrait-cropper-rewrite/0a` (off `trunk` @ `04c5de7`)
- scope re-confirmed against `plan.md` (post-pre-mortem split into 0a/0b, 2a/2b). no drift since 23 may 2026.
- DoD (cross-phase shape):
  1. user upload → new custom dialog opens → "save portrait" lands a 600×600 webp in inspector thumbnail **and** tree-node card. `cropperjs` still installed; no longer the default path.
  2. exif-orientation-6 probe result recorded inline (real iphone fixture; `createImageBitmap({ imageOrientation: "from-image" })` width/height swapped — yes/no + evidence).
  3. ios safari `<canvas>`-in-`<dialog>` multi-touch probe result recorded same way (two `pointerdown`s with distinct `pointerId`s and `pointerType === "touch"`).
  4. placeholder playwright golden of the degenerate dialog runs green twice consecutively in ci.
  5. `pnpm verify` passes; existing visual goldens still pass.
- rollback criterion (from plan): if probe (2) or (3) returns "no", pause before phase 1 — pan/zoom architecture may need rework (drop `<dialog>` or change input model).
- merge gate: deferred per user instruction (`do not merge`). worktree + branch will be left in place after step 5.
