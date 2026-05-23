# pre-mortem — portrait cropper rewrite (23 May 2026)

**bottom line:** proceed with revisions.

four risks survive the adversarial pass without a probe in the current draft (exif behavior, ios safari multi-touch in dialog, cropperjs-removal rollback, golden-snapshot determinism). all four can be retired with phase-0 probes or explicit rollback criteria; none invalidate the architecture. fold the additions below into phase 0 + the affected phases, then phase 1 may start.

## risks

- **[high] operational** — phase 0 deletes `cropperjs` from `package.json`+`pnpm-lock.yaml` as a one-way commit; if phase 1+ uncovers a blocker (multi-touch broken on ios, exif wrong), the project is stuck with a degenerate center-crop and no path back to a working selection-rect cropper.
  - probe: split phase 0 into 0a (wire new dialog with cropperjs still installed; both paths buildable behind a `?cropper=legacy` query flag) and 0b (delete cropperjs only after phase 1 + an ios touch probe pass). 0a→1→0b ordering keeps the dep deletion revertable until interaction risk is retired.
- **[medium] premise / dependency** — the plan assumes `createImageBitmap(blob, { imageOrientation: "from-image" })` returns a bitmap whose `width`/`height` are already swapped for exif orientation 6/8, so `natW/natH` "come straight off the bitmap". if the spec interprets this differently (or if a green-browser implementation diverges), the entire output pipeline rotates wrong and phase 2's "12-megapixel iphone exif-6 → clean webp" dod fails.
  - probe: in phase 0, drop a known exif-6 fixture (iphone portrait shot, dimensions known) onto the dialog with `console.log(bitmap.width, bitmap.height)`. yes if dims are swapped; no if not. one afternoon. write the result into this file before closing phase 0.
- **[medium] integration / expertise** — `<canvas>` inside a native `<dialog>` on ios safari has documented quirks with multi-touch event delivery (the dialog backdrop can intercept; `touch-action: none` on canvas isn't always enough). if pinch-zoom doesn't fire correctly inside the modal, phase 1's mobile dod is unreachable without a dialog-pattern rewrite (e.g., custom overlay instead of `<dialog>`), which would invalidate phase 0's contract preservation.
  - probe: in phase 0, ship a minimal canvas-in-dialog page (stub: just log `pointerdown`/`pointermove` with `pointerType` and `pointerId`); test on a real iphone or browserstack ios safari 17+. two-finger pinch must produce two distinct pointer streams with `pointerType === "touch"` inside the dialog. one afternoon. yes/no with evidence (screenshot + console capture) before phase 1 starts.
- **[medium] scope** — phase 2 bundles drag-drop, clipboard paste, exif handling, and 2-step downscale into one phase. that's four substantively different unknowns (browser events, browser events, image pipeline, image pipeline). if any one slips, the phase blocks on the others.
  - probe: split phase 2 into 2a (entry surface: drag-drop + paste + size guard) and 2b (image pipeline: exif + downscale). 2a touches `PortraitField.svelte` only; 2b touches `loadSourceBitmap.ts` + `encodePortrait.ts` only. they can land in either order and a failure in one doesn't block the other.
- **[medium] operational** — phase 4 captures playwright visual goldens for the dialog. goldens on a dialog with `<canvas>` content are notoriously flaky: anti-aliased text rasterization differs cross-os, focus rings appear/disappear under playwright's headless mode, dialog backdrop blur varies by browser engine. without an explicit determinism strategy, this lands a flaky test on main.
  - probe: in phase 0, attempt a placeholder golden of the dialog (degenerate cropper, fixed-resolution viewport, `prefersReducedMotion: reduce`). if it's stable across two consecutive playwright runs in ci, the strategy is sound. if not, define a tolerance band or mask the canvas region before phase 4 invests in real goldens.
- **[medium] integration** — focus handoff between `PortraitField.svelte`'s "replace" button and the dialog canvas requires a stable `bind:this` ref on the button. if the parent re-renders mid-dialog (e.g., user switches person via the navigator while the cropper is open), the ref goes stale and the post-close focus restore lands on `document.body`.
  - probe: in phase 3, add a component test that opens the dialog, swaps the `personId` prop on `PortraitField`, closes the dialog, and asserts the focused element is *not* `document.body`. fail-loudly behavior (warn in console) is acceptable; silent loss of focus is not.
- **[low] dependency** — firefox < 113 returns `createImageBitmap` un-rotated. the plan says "fallback to `<img>` which always respects exif". `<img>` decodes are async and exif handling depends on `image-orientation: from-image` css being applied, which inside an `OffscreenCanvas` drawImage call is *not* automatic.
  - probe: phase-2 unit test that decodes a known exif-6 fixture via the `<img>` fallback path and asserts the dimensions of the resulting source rect. low cost; surfaces the gotcha if real.
- **[low] performance** — no measured budget for `createImageBitmap` decode latency on the 12-mp iphone target. typical chromium decodes in < 100 ms but no guarantee. user perceives "click upload → dialog opens" as the slowest step.
  - probe: phase-2 log `performance.now()` around the bitmap decode in dev; if > 500 ms on a target laptop, add a loading spinner to phase 0 instead of deferring to phase 4.
- **[low] scope** — phase 0 deletes `cropperjs` from the lockfile; that requires a `pnpm install` step + commit. easy to miss if the implementer treats `package.json` as the only file.
  - probe: phase 0 dod gains a literal check: `grep -c cropperjs pnpm-lock.yaml` returns `0`.

## walking-skeleton check

phase 0 mostly works as a walking skeleton (file picker → dialog → canvas → encode → putblob → urlcache → display). gaps:

- drag-drop, paste, keyboard, visual-goldens are deferred. of these, only the visual-goldens harness is a genuine *new layer* — drag-drop and paste are alternate paths into the same `pendingSource` state and keyboard is an alternate path through `CropperCanvas`. **proposed addition: capture a placeholder playwright golden in phase 0** (even of just the degenerate dialog) to prove the snapshot harness works on this surface. updates land in phase 4.
- exif and ios-multi-touch probes (above) are walking-skeleton *probes*, not stubs — they belong in phase 0.

verdict: walking skeleton is acceptable with one addition (placeholder golden) and the two probes. otherwise sound.

## phase-order revisions

| original | proposed | reason |
|---|---|---|
| phase 0 — wire new dialog and delete `cropperjs` in the same phase | phase 0a — wire new dialog (cropperjs still installed); phase 0b — delete cropperjs (runs after phase 1 + ios touch probe pass) | dep removal is one-way; deferring it past the riskiest interaction work keeps a revert path available |
| phase 2 — drag-drop + paste + exif + downscale (4 unknowns bundled) | phase 2a — entry surface (drag-drop + paste + size guard); phase 2b — image pipeline (exif + downscale) | decouples browser-event work from image-pipeline work; failure in one doesn't block the other |
| (none) | phase 0 — exif + ios-multi-touch + golden-harness probes | retires the three highest-residual unknowns before phase 1 starts |

after revision, the phase list reads: 0a (probes + skeleton with cropperjs still installed) → 1 (pan/zoom) → 0b (cropperjs deletion) → 2a (entry) → 2b (pipeline) → 3 (a11y) → 4 (polish).

## definition-of-done additions

- **phase 0a** — add: (a) exif-orientation-6 probe result recorded in `pre-mortem.md` (one line: "exif probe — `createImageBitmap` returns swapped dims: yes / no, evidence: <screenshot link>"); (b) ios safari `<canvas>`-in-`<dialog>` multi-touch probe result recorded same way; (c) placeholder playwright golden of the degenerate dialog runs green twice consecutively on ci; (d) `grep -c cropperjs pnpm-lock.yaml` is deferred to phase 0b — phase 0a only ensures the new path is built and selected by default; (e) rollback criterion: if either probe fails (a) or (b), pause and revisit before phase 1 — pan/zoom architecture may need to change.
- **phase 1** — add: integration check that existing portraits (already-stored 600×600 webp blobs) still render unchanged in both the inspector thumbnail and the tree-node card after the new dialog is wired; `PortraitUrlCache.get(blobId)` behavior is unaffected.
- **phase 0b** — entirely new phase: delete `cropperjs` from `apps/web/package.json` and run `pnpm install`; `grep -c cropperjs pnpm-lock.yaml` returns `0`; `pnpm verify` passes; bundle-size delta verified (≈ −41 kb on the lazy chunk). only entered after phase 1 closes and the ios touch probe is green.
- **phase 2a** — split: drag-drop + paste + size guard only; dod = dropping a non-image or > 20 mb file shows inline error and doesn't open the dialog; image drop opens the dialog with the current (basic) `loadSourceBitmap` behavior.
- **phase 2b** — split: exif via `createImageBitmap({ imageOrientation: "from-image" })` with `<img>` fallback; 2-step downscale when src/out > 2; dod = the 12-mp iphone exif-6 fixture from the phase-0 probe produces a dimensionally-correct, clean ≤ 50 kb webp; rollback criterion: if exif rotation produces wrong dims on any real-device fixture, the entry surface degrades to "file picker only" (drop/paste handlers off) until a fix lands, rather than rolling back the new dialog.
- **phase 3** — add: component test asserts that swapping `personId` on `PortraitField` while the dialog is open does not leak focus to `document.body` on dialog close.
- **phase 4** — add: visual goldens *update* the phase-0a baseline rather than introducing the harness for the first time; tolerance band documented in the spec file.

## probe results

phase 0a ships scaffolding for both hardware probes; the results below must be filled in by a tester with a real iphone before phase 0a is allowed to close and before phase 1 starts (rollback criterion gate). open the probe pages on the device, follow the on-screen instructions, and paste the "RESULT" line emitted by the page.

### exif-orientation probe (risk #2)
- probe page: `/probes/exif.html` (served by `vite preview` from `apps/web/public/probes/`)
- expected: `createImageBitmap(blob, { imageOrientation: "from-image" })` on an iphone exif-6 portrait returns `bitmap.width × bitmap.height` matching the visually-rotated dimensions (e.g. 3024 × 4032 for a typical portrait shot held vertically).
- RESULT: **pending hardware probe** (paste the page output here; expected format: "createImageBitmap(from-image) returned dims that match / do not match the visually-rotated photo. ua=…")

### ios safari multi-touch in <dialog> probe (risk #3)
- probe page: `/probes/touch.html` (served by `vite preview` from `apps/web/public/probes/`)
- expected: two-finger pinch inside the stub `<dialog>` produces two `pointerdown` events with distinct `pointerId`s and `pointerType === "touch"`.
- RESULT: **pending hardware probe** (paste the page output here; expected format: "multi-touch inside <dialog> delivered N distinct pointerIds. ua=…")

### placeholder visual golden harness (risk #5)
- spec: `apps/web/tests/e2e/portrait-crop.spec.ts`
- expected: spec runs green twice consecutively in ci before phase 4 invests in real goldens.
- RESULT: **pending ci verification** (baseline snapshot not yet captured; run `pnpm -F web exec playwright test portrait-crop --update-snapshots` once locally, then verify two clean ci runs in a row).
