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

no phase reordered, rewritten, inserted, or deleted. next: **phase 1 — pan/zoom interaction**.

## starting phase 1 — 2026-05-23

- worktree: `.claude/worktrees/portrait-cropper-rewrite-phase1` (distinct path because phase 0a's worktree is being preserved per user instruction)
- branch: `phase/portrait-cropper-rewrite/1` (off `phase/portrait-cropper-rewrite/0a` @ `f5d5578`)
- scope re-confirmed against `plan.md`. no drift; pan/zoom math is built on top of phase 0a's `cropperMath.ts` and `CropperCanvas.svelte`.
- DoD (cross-phase shape):
  1. desktop drag-pan moves the image under a still crop frame; wheel-zoom anchored to the cursor; min zoom = cover, max zoom = 4×.
  2. touch one-finger drag-pan and two-finger pinch-zoom (centroid-anchored).
  3. image always covers the crop frame across every gesture combination.
  4. saved output matches what's framed at commit time.
  5. existing 600×600 portraits render unchanged through `PortraitUrlCache.get(blobId)` — integration check at end of phase.
- **open risk:** multi-touch hardware probe still pending (phase 0a bug log). phase 1 ships and verifies on desktop unconditionally; mobile-pinch path is implemented per spec but the "tester on a touch device" half of the DoD remains unverified until the probe lands. rollback criterion (drop `<dialog>` for a custom overlay) stays armed.
- merge gate: deferred per user instruction (`do not merge`). worktree + branch will be left in place after step 5.

no phase reordered, rewritten, inserted, or deleted. phase 0a marked "closed (code) / open (hardware probes + golden baseline routed to bugs.md)". next: **phase 1 — pan/zoom interaction**.

## phase 1 retro — 2026-05-23

**what landed vs spec**
- math: `panTransform`, `anchorZoom`, `clampTransform` in `cropperMath.ts` with 6 new unit cases (12 total, all pass). `MAX_ZOOM_MULTIPLE` exported as the named constant for cover×4 max.
- interaction: single-pointer pan, two-pointer centroid-anchored pinch-zoom (incremental factor pattern keeps each move close to 1.0), wheel-zoom anchored to the cursor with `ctrl/no-ctrl` intensities matching `TreeCanvas`. `setPointerCapture` on each pointerdown — capture redirects move/up events even off-canvas, so no window-level listeners needed.
- cursor states: `grab` default, `grabbing` while `dragging` flag is set.
- cover-clamp: an explicit `$effect` re-clamps when the source swaps, so a fresh bitmap can never start outside its cover bounds.
- dialog change: transform demoted from `$derived(bitmap)` to `$state`, seeded in `loadSource` alongside the bitmap. cleanup resets it. public props unchanged.

**what was not closed (open risk)**
- DoD parts (2) and "tester on a touch device" — multi-touch hardware probe still pending from phase 0a. mobile-pinch code is implemented per spec but unverified on real ios safari. rollback criterion (custom-overlay fallback) stays armed.
- integration check item (5) — existing portraits render unchanged through `PortraitUrlCache.get(blobId)`. verified by construction (no code along that path changed) rather than by a live click-through. could become a live e2e flow once the placeholder spec is upgraded out of `test.skip`.

**surprises**
- typecheck caught an unused `pinchStartScale` variable on the first run. the incremental-factor pattern (reset baseline each move) doesn't need a saved scale; original sketch did and i forgot to clean it up. small but illustrative of the cost of carrying premature state.
- prettier picked up enough formatting drift on the touched files (notably the dialog) to be worth a `pnpm format` pass before lint. consider adding an editorconfig nudge in future setup notes.
- bundle delta from the phase: +1.79 kB (524.63 → 526.42 kB) for the gesture handlers + math. inside the 500 kB warning band already, so no new noise.

**residual debt**
- no new bug-log entries from phase 1. all blockers carry over from phase 0a (hardware probes, golden baseline, `visual-path-highlight` deferred).
- the `$bindable` transform + the cover-clamp `$effect` could plausibly thrash if a future phase makes the dialog write transform on every prop change. note for phase 4: be careful adding theming controls that touch the transform.

## revision after phase 1 — 2026-05-23

plan shape unchanged. phase 0b (cropperjs removal) is the next phase by plan order but remains gated on the hardware probes returning green — those have not been run. if probes are still pending when phase-loop resumes, **propose skipping 0b and starting phase 2a (entry ergonomics)**, leaving 0b for after the probes land. 2a does not depend on 0b.

no phase reordered, rewritten, inserted, or deleted. bugs.md carries the same three open items from phase 0a. next (by plan): **phase 0b — cropperjs removal**, gated on probes. alternative (if probes still pending): **phase 2a — entry ergonomics**.

## starting phase 2a — 2026-05-23

- worktree: `.claude/worktrees/portrait-cropper-rewrite-phase2a`
- branch: `phase/portrait-cropper-rewrite/2a` (off `phase/portrait-cropper-rewrite/1` @ `5d55a27`)
- per user direction (`complete all of phase 2`), phase 0b is skipped for now and remains gated on hardware probes.
- scope re-confirmed against `plan.md`. 2a touches only `PortraitField.svelte` and a new component test. no contract changes outside that file.
- DoD (cross-phase shape):
  1. drop an image file onto the portrait slot → cropper opens. drop a non-image or > 20 mb file → inline error, dialog does not open.
  2. paste an image from system clipboard (focus-gated on the field) → cropper opens. firefox degradation tolerated for cross-app paste.
  3. existing file picker still works.
  4. `border-accent ring-2 ring-accent/40` hover state visible during drag-over.
  5. component test covers drop / paste / non-image / oversize.
- merge gate: deferred per user instruction (`do not merge`). worktree + branch will be left in place after step 5.

## phase 2a retro — 2026-05-23

**what landed vs spec**
- `PortraitField.svelte` now hosts a Files-only drag target (`ondragover` with a `dataTransfer.types` pre-flight so non-file drags don't steal the dropEffect) and a window-level focus-gated paste target. shared `admitSource` gate validates mime + size; clear inline error copy for non-image and oversize (>20 mb) cases. drag-hover ring uses tailwind v4 tokens (`border-accent` + `accent/40` ring).
- 6-case component test (drop happy + non-image + oversize; paste happy + unfocused-ignored + non-image silent). dialog mocked at module level because jsdom doesn't implement `<dialog>.showModal()`.
- all gates green: typecheck, lint, 921/921 unit, build.

**surprises**
- jsdom doesn't ship `ClipboardEvent`. swapped to a generic `Event` with a stamped `clipboardData` property — works fine and is honest about what the test actually probes.
- svelte v5 a11y lint requires a role on any element with drag handlers. solved with `role="region" aria-label="portrait"`. ergonomic side effect: screen readers now announce the field by name.
- the focus-gate uses `focusin`/`focusout` on the root div + `tabindex="-1"`. simpler than I expected — no global event-target dance needed because the field's buttons live inside the same container.

**residual debt**
- no new bug-log entries. phase-0a items still carry over (hardware probes, golden baseline, `visual-path-highlight` deferred).
- the placeholder e2e (`tests/e2e/portrait-crop.spec.ts`) still `test.skip`s on a fresh shell — phase 2a didn't fix that. lifting the skip is naturally a phase-3 / phase-4 task once the spec can reach the inspector field.

## revision after phase 2a — 2026-05-23

plan shape unchanged. next phase per plan order is **2b — image pipeline (exif + downscale)**. no reorders, rewrites, inserts, or deletes. bugs.md carries the same three open items.

## starting phase 2b — 2026-05-23

- worktree: `.claude/worktrees/portrait-cropper-rewrite-phase2b`
- branch: `phase/portrait-cropper-rewrite/2b` (off `phase/portrait-cropper-rewrite/2a` @ `4a43209`)
- scope re-confirmed against `plan.md`. 2b touches `loadSourceBitmap.ts` (feature-detected `<img>` fallback) and `encodePortrait.ts` (2-step downscale). plus a unit test exercising the `<img>` fallback against a known exif-6 fixture.
- DoD:
  1. 12-mp iphone exif-6 fixture decodes correctly rotated and produces a clean ≤ 50 kb webp via `createImageBitmap({ imageOrientation: "from-image" })`.
  2. firefox < 113 (which historically returns un-rotated `createImageBitmap`) is detected via the fallback path and renders correctly. unit-test asserts the fallback path is exercised against a known fixture.
  3. for src/out > 2 (e.g. 4000 × 4000 source → 600 × 600 output), the 2-step downscale produces visibly cleaner output than single-pass `drawImage`. verified by encoding the test fixture twice (single + two-step) and asserting the two-step output isn't smaller than a degenerate baseline (smoke check).
- rollback criterion: if exif rotation produces wrong dims on any real-device fixture, degrade the entry surface to "file picker only" (turn drop/paste off via a config flag) — do not roll back the dialog itself.
- merge gate: deferred per user instruction (`do not merge`). worktree + branch will be left in place after step 5.

## phase 2b retro — 2026-05-23

**what landed vs spec**
- `loadSourceBitmap` now feature-detects the `imageOrientation:"from-image"` option by round-tripping a tiny embedded exif-6 jpeg (8×4 source; honored = 4×8). result cached as a session-level promise. fallback path (`<img>.naturalWidth/Height`) is the unconditional route when the probe returns false.
- `encodePortrait` two-step downscale: when `max(sw/outW, sh/outH) > 2`, route through an intermediate canvas at `min(4, ratio/2) × out`. degrades to single-pass when the intermediate 2d context isn't available.
- 4-case unit suite covering probe-says-no skips `createImageBitmap`, probe reset reversible, single-draw at threshold, two-step above threshold. 925 unit tests total all pass.
- `__setOrientationProbe` test hook + `DOWNSCALE_RATIO_THRESHOLD` const exposed for tests.

**what was not closed (open risk)**
- DoD part (1) — actual ≤ 50 kb webp output for a 12-mp exif-6 jpeg is not asserted in unit tests because jsdom doesn't implement OffscreenCanvas, real `<canvas>` 2d contexts, or webp encoding. the assertion is structural (routing through the right code path) rather than pixel-perfect. real verification needs the playwright e2e + a real iphone fixture.
- DoD part (3) — "visibly cleaner output than single-pass" is by-eye on a real high-contrast image. unit test asserts routing only. phase 4 visual goldens are the right place to verify pixel quality.

**surprises**
- jsdom's `<canvas>` is a near-empty stub: `getContext("2d")` returns null. exposing a meaningful unit test required runtime-patching `HTMLCanvasElement.prototype.getContext` to a fake context object. cleanly restored in `finally`.
- `vi.spyOn(globalThis, "createImageBitmap")` fails when the property doesn't exist on globalThis (jsdom doesn't ship it). switched to manual `(globalThis as any).createImageBitmap = fn` with a delete in the cleanup.
- typecheck caught a real bug: a `HTMLCanvasElement | OffscreenCanvas` union doesn't narrow on `.getContext` calls because the OffscreenCanvas overload returns a wider type. split the branches; each side has a precise context type.

**residual debt**
- no new bug-log entries. the phase-0a items (hardware probes × 2, golden baseline, `visual-path-highlight` deferred) all still apply; the exif-6 probe page output now has a counterpart in the unit test, but doesn't substitute for the real-device probe.

## revision after phase 2b — 2026-05-23

plan shape unchanged. next by plan order: **phase 3 — keyboard + a11y** (gated only on the placeholder e2e baseline, which doesn't block). no reorders, rewrites, inserts, or deletes. bugs.md carries the same three items.

phase 2 (a+b) is complete per user request.

## starting phase 0b — 2026-05-23

- worktree: `.claude/worktrees/portrait-cropper-rewrite-phase0b`
- branch: `phase/portrait-cropper-rewrite/0b` (off `phase/portrait-cropper-rewrite/2b` @ `1600111`)
- **gate-override:** plan rollback criterion says 0b should only run after hardware probes return green. probes are still pending; user explicitly asked to proceed. risk: if a probe returns "no" later, we'll need to re-add cropperjs to recover the legacy path. blast radius is contained to this branch — easy to revert. recorded here so future me knows what to undo.
- scope: delete `cropperjs` from `apps/web/package.json`; delete `CropperDialogLegacy.svelte`; remove the `?cropper=legacy` branch and the `CropperDialogLegacy` import from `CropperDialog.svelte`. run `pnpm install` to update the lockfile.
- DoD:
  1. `grep -c cropperjs pnpm-lock.yaml` returns 0.
  2. `grep -rn cropperjs apps/web/src` returns nothing.
  3. lazy chunk previously containing cropperjs (≈ 41 kb minified) is gone from `pnpm build` output.
  4. `pnpm verify` passes.
- merge gate: deferred per user instruction (`do not merge`). worktree + branch will be left in place after step 5.

## phase 0b retro — 2026-05-23

**what landed vs spec**
- cropperjs removed from `apps/web/package.json`; lockfile updated; `grep -c cropperjs pnpm-lock.yaml = 0`; `grep -rn cropperjs apps/web/src = nothing`.
- `CropperDialogLegacy.svelte` deleted; `CropperDialog.svelte` lost its `useLegacy` branch and the `CropperDialogLegacy` import. 394 lines deleted vs 48 added.
- bundle delta: the 41.04 kB `cropper.esm.raw-*` lazy chunk is gone. main bundle effectively unchanged (the legacy dialog was already lazy).
- `pnpm verify`-equivalent (typecheck + lint + 925 unit + build) all green.

**surprises**
- none. one focused commit; cleanest phase yet. the lazy chunk going away matched the plan estimate (≈ 41 kb minified) exactly.

**residual debt**
- the gate-override risk lives on: if the multi-touch hardware probe later returns "no", there's no path back to a working selection-rect cropper without `git revert d3693a9` (plus a `pnpm install` to restore the lockfile entry). recorded in the commit message so the recovery is one git command. the probe + golden-baseline items in `bugs.md` stay open (now gating later phases, not 0b).

## revision after phase 0b — 2026-05-23

plan shape unchanged. update bug-log: the hardware-probe item is no longer "gates phase 0b" since 0b has shipped under the user's gate-override; reframe as a *rollback gate* (if probe returns "no", revert d3693a9). next: **phase 3 — keyboard + a11y**.

## starting phase 3 — 2026-05-23

- worktree: `.claude/worktrees/portrait-cropper-rewrite-phase3`
- branch: `phase/portrait-cropper-rewrite/3` (off `phase/portrait-cropper-rewrite/0b` @ `ce1c490`)
- scope re-confirmed against `plan.md`. 3 touches `CropperCanvas.svelte` (keyboard handlers, `role="application"`, `aria-label`, `tabindex="0"`), `CropperDialog.svelte` (focus management on open/close + aria-live zoom % readout), and `PortraitField.svelte` (stable ref on the "replace" button for focus return). plus a focus-stability component test.
- DoD:
  1. keyboard-only flow: tab into the dialog, arrow keys pan (shift = 10× step), `+`/`-` zoom (anchored at canvas center), `0` reset, `enter` saves, `esc` cancels.
  2. focus moves to the canvas on dialog open; on close, focus returns to the "replace" button.
  3. axe-core reports no new violations on the dialog.
  4. zoom % is announced through an `aria-live` region (throttled / debounced to ~250 ms).
  5. **focus-stability check** (per pre-mortem risk #6): swapping `personId` on `PortraitField` while the dialog is open and then closing it does not leak focus to `document.body`. component test asserts this.
- merge gate: deferred per user instruction (`do not merge`). worktree + branch will be left in place after step 5.

## phase 3 retro — 2026-05-23

**what landed vs spec**
- keyboard map in `CropperCanvas.svelte`: ArrowLeft/Right/Up/Down pan (shift = 10× step), `+`/`=` and `-`/`_` zoom around canvas center, `0` reset to cover-fit, `Enter` saves via `oncommit`, `Esc` cancels via `oncancel`.
- `tabindex="0"`, `role="application"` (with deliberate `svelte-ignore` because the widget's keyboard semantics don't match any standard control), descriptive `aria-label`, focus-visible accent outline.
- `autofocus` prop on the canvas; dialog raises `canvasAutofocus = true` on open. cleanup resets so re-opens re-trigger focus.
- `coverScale`-relative zoom % derived in the dialog. `<output aria-live="polite">` updates after a 250 ms debounce. visible footer reads the live percent.
- `PortraitField.svelte` captures a stable `replaceBtn` ref and restores focus on `onDialogClose`. dev warning if the ref is stale.
- new component test asserts `document.activeElement !== document.body` after a personId swap + dialog close. dialog mock upgraded to capture props so `onclose` can fire synthetically.
- pnpm typecheck + lint + 926 unit tests + build all green.

**what was not closed (open risk)**
- DoD part (3) — "axe-core reports no new violations" is not asserted programmatically. axe-core isn't wired into the unit-test suite. relevant DoD bar is met via the manual changes (role, aria-label, focus-visible, aria-live, tabindex); a real axe check belongs in the playwright e2e once that spec lifts its skip. routed in residual debt rather than as a regression.

**surprises**
- svelte 5 a11y lint says `<canvas>` cannot have `role="application"`. spec-wise that's overly strict — the cropper genuinely is an application widget — so suppressed with an inline `svelte-ignore` and a comment explaining why. would have been a real bug if the rule had stopped me from doing the right thing.
- vi.mock of CropperDialog needed an upgrade: a plain no-op factory worked for prior tests but had to record the props bag so the focus-stability test could fire `onclose` synthetically. svelte 5's component factory signature `(anchor, props)` is what the runtime hands you; recording `props.onclose` is enough.
- chose `coverScale`-relative zoom % (100 = cover, 400 = max) rather than absolute scale-as-percent. easier to describe to a user; matches the "min zoom = cover, max zoom = 4×" framing in phase 1.

**residual debt**
- axe-core not in unit-test loop. add when wiring the playwright e2e for the cropper dialog (probably in phase 4, alongside the visual goldens).
- liveZoom debounce timer is module-scoped — if a future phase introduces multiple dialog instances on the same page, they'll fight over the timer. not currently a concern (singleton dialog) but worth a note.

## revision after phase 3 — 2026-05-23

plan shape unchanged. all of phases 0a, 1, 0b, 2a, 2b, 3 are now closed (with the known open gates routed in bugs.md). next: **phase 4 — polish + theming**. bugs.md carries the same three open items.
