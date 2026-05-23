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

## phase 0a retro — 2026-05-23

**what landed vs spec**
- new `CropperDialog.svelte` (canvas + native `<dialog>`, degenerate cover-center) is the default; legacy cropperjs path preserved as `CropperDialogLegacy.svelte`, reachable via `?cropper=legacy`. public props contract preserved verbatim.
- three new pure modules: `cropperMath.ts` (6 unit tests, all pass), `loadSourceBitmap.ts` (createImageBitmap + `<img>` fallback), `encodePortrait.ts` (OffscreenCanvas.convertToBlob + `<canvas>.toBlob` fallback).
- placeholder playwright spec laid down with a deterministic 4×4 png fixture (`tests/fixtures/portrait-blue.png`) so phase 4 has a baseline to update.
- probe scaffolding pages shipped at `/probes/exif.html` and `/probes/touch.html` to retire pre-mortem risks #2 and #3 against real iphone hardware.
- pre-mortem updated with a "probe results" section pre-formatted to receive the hardware outputs.
- `pnpm verify` (typecheck + lint + lint:no-hyperbolic-imports + unit + build + server:lint + server:test) all green.

**what was not closed in code (routed to bug log)**
- DoD parts (2) and (3) — hardware probes require a tester with a real iphone; scaffolding exists, results don't.
- DoD part (4) — placeholder visual golden baseline not captured; the spec currently `test.skip`s when the portrait field isn't reachable from a fresh shell. ci verification (run-twice-green) also pending.

**surprises**
- `notes/examples/` is gitignored, so the worktree's checkout was missing the large fixtures that several unit tests symlink in via `tests/fixtures/Akarians.{ged,txt}`. one-off fix: symlink `notes/examples` into the worktree root. unit tests went from 5 failed to 0 failed once symlinked. **downstream-implication:** future phases that spin up a fresh worktree will hit the same. consider documenting in `notes/agents.md` or adding the symlink dance to a phase-loop bootstrap helper.
- pre-existing visual golden `path-highlight-multi-union` fails in the worktree (920×806 → 920×1241). cropper code does not touch family-view layout or selection state; cause is almost certainly environmental (fresh playwright chromium-headless-shell v1223, post-rebase baseline at `f00d718`). other visual goldens (akarians, multi-union, add-relative, family-view) pass. routed to bug log; **deferred per user**.
- the `?cropper=legacy` escape hatch in `CropperDialog.svelte` is built but reachable only via url. consider whether to add a dev-only toggle in the menu bar for easier ab-testing during phase 1. tentatively no — the url flag is sufficient and the legacy path is going away in phase 0b.

**residual debt**
- two phase-0a blockers still open in `bugs.md` (hardware probes + golden baseline). these gate phase 0b (cropperjs deletion) but not phase 1 (pan/zoom on desktop is unaffected; mobile path-zoom verification is what waits on the multi-touch probe).
- 1 unclear regression (`visual-path-highlight` snapshot). likely pre-existing; deferred.

## revision after phase 0a — 2026-05-23

per user direction, phase 1 starts immediately without waiting for hardware probes. plan shape unchanged; only the bug-log dispositions move:

- two hardware-probe items demoted from "blocker (phase 0a DoD)" to "important (gates phase 0b)"; the multi-touch probe remains a constraint on phase 1's mobile DoD but does not block phase 1 from starting.
- golden-baseline item demoted from "blocker (phase 0a DoD)" to "important (gates phase 4)" — the harness exists; capturing the baseline is per-phase work.
- `visual-path-highlight` regression triaged as "deferred / pre-existing" pending verification on `trunk`. not a cropper regression.

no phase reordered, rewritten, inserted, or deleted. phase 0a marked "closed (code) / open (hardware probes + golden baseline routed to bugs.md)". next: **phase 1 — pan/zoom interaction**.
