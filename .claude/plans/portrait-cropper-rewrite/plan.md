# portrait cropper rewrite

## context

the current portrait crop dialog (`apps/web/src/lib/components/editor/CropperDialog.svelte`) is a thin wrapper around `cropperjs v2`. it has three problems that compound:

1. **renders wrong** — cropperjs v2 doesn't auto-scale its image to fill the host container, so the source displays at its natural (often tiny) size in the middle of a huge dialog with the crop selection box barely visible (see the screenshot the user shared).
2. **un-themable** — cropperjs v2 uses web components with shadow-dom encapsulated styles. we can't restyle handles, the dim mask, the grid, or the selection border to match the app's tailwind v4 theme tokens.
3. **wrong interaction model** — for a fixed-aspect portrait crop, modern UIs (instagram, ios photos, react-easy-crop) use pan-and-zoom with a fixed centered frame. cropperjs gives us a draggable selection rect, which is heavier on touch and unfamiliar in 2026.

we also have entry-side friction: the only way to add a portrait is the tiny "upload" button. no drag-and-drop, no clipboard paste, and large phone photos with exif rotation render sideways (canvas ignores `image-orientation: from-image`).

intended outcome: a custom 5-phase build that ships a polished pan-and-zoom cropper, accepts drag-drop and paste on the portrait slot, handles big rotated phone uploads correctly, works keyboard-only, and removes the `cropperjs` dependency entirely.

## goals

- replace the cropperjs dialog with a custom svelte 5 + canvas cropper that uses pan-and-zoom (drag, pinch, wheel, slider); ship a measurably nicer interaction than today
- accept drag-and-drop onto the portrait slot and clipboard paste, in addition to the existing file picker
- correctly handle exif-rotated phone photos up to 12 megapixels; emit a clean ≤ 50 kb webp at 600×600
- full keyboard a11y: tab into the canvas, arrow-pan, `+`/`-` zoom, `enter` saves, `esc` cancels; aria-live zoom percentage
- remove `cropperjs` from `apps/web/package.json` and `pnpm-lock.yaml` (≈ 41 kb lazy chunk gone, no shadow-dom theming pain)

## non-goals

- multiple aspect ratios exposed in the ui (props will be parameterized, but no per-crop ratio picker)
- rotation, flip, or "straighten" controls
- color / brightness / filter adjustments
- separate thumbnail blob variant (the single 600×600 master continues to serve all display sizes)
- migration of existing portraits (already 600×600 webp; nothing to convert)
- heic ingestion (delegated to the browser's built-in image decoder; if the browser can't decode it, we surface the error)

## constraints

- evergreen browsers only — safari ≥ 16.4 (march 2023), firefox ≥ 113 (may 2023), recent chromium
- no new runtime dependencies; the goal is to *delete* a dep, not swap one for another
- preserve the public contract of `CropperDialog.svelte` (props interface unchanged) — `PortraitField.svelte` and `PersonalTab.svelte` should not need touch beyond the phase-2 entry ergonomics
- existing visual e2e goldens under `apps/web/tests/e2e/visual-*.spec.ts` must still pass
- svelte 5 runes (`$state`/`$derived`/`$effect`/`$props`), tailwind v4 theme tokens, native `<dialog>` + `showModal()` — match the conventions established in `TreeCanvas.svelte` and `CropperDialog.svelte`
- output: `image/webp` at quality 0.85, default 600×600 (configurable via `outputW`/`outputH` props)

## accepted risks

pre-mortem (`pre-mortem.md`) surfaced five residual risks worth folding in: (1) the `cropperjs` deletion is one-way, so phase 0 is now split — 0a wires the new dialog with cropperjs still installed, 0b deletes it only after phase 1 + an ios multi-touch probe pass; (2) `createImageBitmap({ imageOrientation: "from-image" })` returning dimensionally-correct bitmaps for exif-6 is load-bearing for the whole pipeline — phase 0 now includes a probe with a real iphone fixture and records the result inline; (3) `<canvas>`-in-`<dialog>` multi-touch on ios safari has documented quirks — phase 0 also probes this on real hardware before phase 1 commits to the pan/zoom design; (4) phase 2 originally bundled four substantively different unknowns (events + image pipeline) — split into 2a (entry) + 2b (image pipeline); (5) playwright visual goldens on canvas content are flaky — phase 0 captures a placeholder golden to validate the harness before phase 4 invests in real ones. evergreen-browser cliffs (`OffscreenCanvas.convertToBlob`, firefox < 113 `createImageBitmap`) remain covered by runtime feature checks and `<canvas>.toBlob`/`<img>` fallback paths.

## phase 0a — walking skeleton + probes
**status:** closed (code) / open (hardware probes + golden baseline routed to `bugs.md`) — branch `phase/portrait-cropper-rewrite/0a`, not merged per user instruction
**definition of done:** (1) a user opens the person inspector, clicks "upload", picks an image, the new custom dialog opens, clicks "save portrait", and the cropped 600×600 webp lands in the inspector thumbnail *and* the tree-node card; `cropperjs` is **still installed** but no longer the default code path. (2) the exif-orientation-6 probe is recorded inline in this plan file: `createImageBitmap(blob, { imageOrientation: "from-image" })` on a known iphone fixture — does the returned `bitmap.width`/`bitmap.height` reflect the *rotated* (display) dimensions? yes/no + evidence link. (3) the ios safari `<canvas>`-in-`<dialog>` multi-touch probe is recorded same way: pinch gesture inside a stub modal produces two `pointerdown` events with `pointerType === "touch"` and distinct `pointerId`s. (4) a placeholder playwright golden of the degenerate dialog runs green twice consecutively in ci. (5) `pnpm verify` passes; existing visual goldens still pass. rollback criterion: if either probe (2) or (3) returns "no", pause before phase 1 and revisit the pan/zoom architecture — it may need to drop `<dialog>` or change input model.
**scope:** rewrite `CropperDialog.svelte` internals from scratch — `<canvas>`-based, native `<dialog>`, public props unchanged. introduce `CropperCanvas.svelte` (canvas + render loop only, no interaction yet), `cropperMath.ts` (pure-function math), `loadSourceBitmap.ts` (`createImageBitmap` with `<img>` fallback), `encodePortrait.ts` (`OffscreenCanvas.convertToBlob` with `<canvas>.toBlob` fallback). degenerate behavior: image is loaded at "cover" scale and centered; no pan, no zoom; save extracts that exact centered region. run the two probes on real hardware and write the results into `pre-mortem.md` alongside the risk they retire. lay down `apps/web/tests/e2e/portrait-crop.spec.ts` with a single placeholder golden of the degenerate dialog so phase 4 has a baseline to update.
**retires the unknown:** does the contract survive a from-scratch rewrite, and do the two browser-side premises (exif rotation + ios multi-touch) actually hold?

## phase 1 — pan/zoom interaction
**status:** closed (desktop) / open (mobile-pinch verification gated on ios multi-touch probe) — branch `phase/portrait-cropper-rewrite/1`, not merged per user instruction
**definition of done:** a tester on desktop can drag-pan the image, wheel-zoom anchored to the cursor, and see the crop frame stay still while the image moves under it. a tester on a touch device can one-finger drag-pan and two-finger pinch-zoom anchored to the centroid. across all gestures, the image always covers the crop frame (no exposed canvas inside the frame); min zoom = cover, max zoom = 4×. saved output matches what's framed at commit time. **integration check:** existing portraits already stored as 600×600 webp blobs render unchanged in both the inspector thumbnail and the tree-node card after the new dialog is wired — `PortraitUrlCache.get(blobId)` behavior unchanged. rollback criterion: if multi-touch on real ios hardware can't be made reliable inside `<dialog>`, fall back to a custom-overlay implementation (lose the native dialog focus-trap; gain reliable pointer events) before continuing.
**scope:** wire pointer handlers in `CropperCanvas.svelte` (single-pointer pan, two-pointer pinch with `setPointerCapture` on both, window-level `pointermove`/`pointerup` listeners). add wheel handler (`e.ctrlKey ? 0.0045 : 0.0018` intensity per `TreeCanvas.svelte:676-725`). implement `anchorZoom(cx, cy, factor)` and `clampTransform()` in `cropperMath.ts` with unit tests. rAF-throttled render loop with dirty flag. cursor changes (`grab`/`grabbing`). `touch-action: none` on the canvas. validate on real ios hardware before closing.
**retires the unknown:** does our pointer math feel right on real touch hardware, and does the cover-clamp logic survive every gesture combination?

## phase 0b — cropperjs removal
**status:** closed — branch `phase/portrait-cropper-rewrite/0b`, not merged per user instruction. gate-override accepted; recovery is `git revert d3693a9 && pnpm install`
**definition of done:** `cropperjs` is removed from `apps/web/package.json`; `pnpm install` updates the lockfile; `grep -c cropperjs pnpm-lock.yaml` returns `0`; the lazy chunk previously containing cropperjs is gone (bundle-size delta ≈ −41 kb minified, verified via `pnpm build` + `du`). `pnpm verify` and all e2e tests pass. only entered after phase 1 closes green and the ios multi-touch probe from phase 0a returned yes.
**scope:** delete the dep, run install, verify bundle and tests. one focused commit. if anything regresses, revert this commit and continue work on a separate branch — phases 2–4 do not depend on cropperjs being gone.
**retires the unknown:** does removing the dep cause any unexpected regression in build, bundle, or runtime that phases 0a + 1 didn't surface?

## phase 2a — entry ergonomics
**status:** closed — branch `phase/portrait-cropper-rewrite/2a`, not merged per user instruction
**definition of done:** dragging an image file onto the portrait slot opens the cropper dialog (with whatever exif handling phase 0a shipped — improved in 2b). pasting an image from the system clipboard works in chromium and safari (firefox degraded acceptably; a paste-from-app outside the browser may not deliver `image/*` and that's tolerated). dropping a non-image file or one over 20 mb shows a clear inline error and does not open the dialog. the existing file picker still works. visual hover state (`border-accent ring-2 ring-accent/40`) appears during drag-over.
**scope:** extend `PortraitField.svelte` to be a drop target (`ondragover`/`ondrop`) and a paste target (window-level `paste` listener gated on the field having focus). size guard (`> 20 mb → onerror`). dragHover state for visual feedback. component test covering drop, paste, non-image, oversize.
**retires the unknown:** is the entry surface forgiving enough to not require user education, and does the focus-gated paste listener avoid conflicts with paste elsewhere in the inspector?

## phase 2b — image pipeline (exif + downscale)
**status:** closed (routing + tests) / open (real-device 12-mp webp size assertion, deferred to phase 4 visual goldens or hardware probe) — branch `phase/portrait-cropper-rewrite/2b`, not merged per user instruction
**definition of done:** a 12-megapixel iphone jpeg with exif orientation 6 (the fixture used in the phase-0a probe) opens correctly rotated and produces a clean 600×600 webp under 50 kb. the same fixture in firefox (which historically returns un-rotated `createImageBitmap`) is detected via the fallback path and renders correctly. for sources where src/out > 2 (e.g. a 4000×4000 crop → 600×600 output), the 2-step downscale produces visibly cleaner output than single-pass `drawImage` (verified by eye on a high-contrast test image). rollback criterion: if exif rotation produces wrong dims on any real-device fixture, degrade the entry surface to "file picker only" (turn drop/paste off via a config flag) until a fix lands — do *not* roll back the dialog itself.
**scope:** swap `loadSourceBitmap` to `createImageBitmap(blob, { imageOrientation: "from-image" })` with feature-detected `<img>` fallback for firefox < 113. add 2-step downscale in `encodePortrait` via `createImageBitmap(bitmap, sx, sy, sw, sh, { resizeWidth, resizeHeight, resizeQuality: "high" })`. unit test decoding the exif-6 fixture through the `<img>` fallback path and asserting source-rect dimensions.
**retires the unknown:** do real-world photos (huge, rotated) actually produce clean output across the green-browser cliff?

## phase 3 — keyboard + a11y
**status:** closed (manual a11y rules + focus-stability test passing) / open (axe-core not yet wired into unit loop; routed to phase 4) — branch `phase/portrait-cropper-rewrite/3`, not merged per user instruction
**definition of done:** a keyboard-only user can tab into the dialog, frame a portrait using arrow keys (pan) and `+`/`-` (zoom), reset with `0`, save with `enter`, cancel with `esc` — without touching the mouse. focus moves to the canvas on dialog open and returns to the "replace" button on close. axe-core reports no new violations on the dialog. a screen reader announces zoom percentage changes (throttled, debounced). **focus-stability check:** a component test opens the dialog, swaps the `personId` prop on `PortraitField`, closes the dialog, and asserts the focused element is not `document.body` (silent focus-loss on parent re-render is a regression).
**scope:** keyboard map in `CropperCanvas.svelte` (`ArrowLeft/Right/Up/Down` with `shiftKey ? 10 : 1` step; `+`/`=` / `-` zoom anchored at canvas center; `0` reset; `enter` commit; `esc` forwards to dialog). `tabindex="0"`, `role="application"`, `aria-label` on canvas. `<output aria-live="polite" class="sr-only">{zoomPct}% zoom</output>` debounced to 250 ms. focus management in `CropperDialog.svelte`'s open `$effect` and in `PortraitField.svelte`'s `onclose` callback (needs a stable ref on the "replace" button; if it's stale, warn loudly in dev). add an axe-core assertion and the focus-stability test to the component suite.
**retires the unknown:** does the keyboard interaction model actually work end-to-end, including the focus-handoff between the inspector field and the modal dialog when the parent re-renders mid-flight?

## phase 4 — polish + theming
**status:** closed (grid + outline + loading + error retry shipped) / open (axe-core + visual goldens + dim-mask outside-frame routed to bugs.md as follow-ups) — branch `phase/portrait-cropper-rewrite/4`, not merged per user instruction
**definition of done:** the dialog matches the rest of the inspector visually in both dark and light themes: dimmed mask outside the crop frame, optional rule-of-thirds grid (default on), accent-colored crop frame outline, zoom-percentage readout in the footer next to the save button. loading state shown while `createImageBitmap` is decoding a large source. decoding errors surface as inline text with a "try another image" affordance. playwright visual goldens captured for the dialog in dark + light (updating the baselines first captured in phase 0). light/dark snapshot diff under tolerance.
**scope:** add `drawMask`, `drawGrid`, `drawFrameOutline` to the render loop (reading css variables via `getComputedStyle`). loading + error state in `CropperCanvas.svelte`. zoom-percentage readout in the dialog footer. update `apps/web/tests/e2e/portrait-crop.spec.ts` (baseline spec laid down in phase 0) to assert the polished dialog visual; capture goldens in both themes.
**retires the unknown:** does it look like it belongs in this app, and are we capturing regressions via goldens going forward?
