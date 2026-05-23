# Ship readiness — portrait cropper rewrite (2026-05-23)

State as of `phase/portrait-cropper-rewrite/4` tip (`3878669`). Seven phase branches, none merged to `trunk` per standing user instruction (`do not merge`). Prerequisites green:

- `pnpm verify` — typecheck + lint + lint:no-hyperbolic-imports + 926 unit + build + server:lint + 69 server tests, all pass.
- `integration-check` — 24/24 chromium e2e (excluding the deferred `visual-path-highlight`) pass; 2 skip cleanly.
- `code-review` — no uncommitted changes (the `notes/examples` symlink is a local fixture-hack, gitignored upstream).

### Blockers
- **iOS Safari multi-touch probe never run** — phase 0a probe scaffolding at `/probes/touch.html`, results pending in `pre-mortem.md`. `cropperjs` is already removed (phase 0b shipped under gate-override). If pinch-zoom doesn't deliver two distinct `pointerId`s inside a native `<dialog>` on iOS Safari, mobile users lose zoom in the cropper. Prior release supplied this via cropperjs. **Recovery if it fails:** `git revert d3693a9 && pnpm install` to restore the legacy dialog. **Effort:** 1 afternoon — a tester opens `/probes/touch.html` on an iPhone 16.4+, records the result in `pre-mortem.md`. If green, this blocker downgrades to closed; if red, then either the dialog architecture changes (drop `<dialog>` for a custom overlay) or the cropperjs removal reverts.
- **exif-orientation-6 probe never run on real hardware** — paired probe at `/probes/exif.html`. The image pipeline (`loadSourceBitmap.ts`) has a built-in feature-probe that round-trips a synthetic exif-6 jpeg through `createImageBitmap({ imageOrientation: "from-image" })`; if it fails, the `<img>` fallback path takes over unconditionally. Hardware verification still required to confirm the path works on real iPhone photos (size, exif chunk layout, decoder quirks). **Recovery if it fails:** degrade the entry surface to "file picker only" per the plan's rollback criterion. **Effort:** 1 afternoon, paired with the multi-touch probe on the same tester.

### Deferred
- **[medium]** placeholder playwright e2e (`apps/web/tests/e2e/portrait-crop.spec.ts`) currently `test.skip`s on a fresh shell because it can't reach the portrait field. baseline never captured; pre-mortem risk #5 unretired. unblocks axe-core wiring + dark/light visual goldens once lifted. naturally needs a per-test path that imports a tree fixture, selects a person, opens the inspector → portrait field → upload → snap the dialog. one focused PR.
- **[low]** `visual-path-highlight-multi-union.png` snapshot fails in fresh playwright environment (920×806 expected, 920×1241 received). Cropper code does not touch family-view layout or path-highlight; almost certainly environmental — fresh chromium-headless-shell v1223 rendering the auto-sized family-view canvas slightly taller than the baseline captured at commit `f00d718`. Verify on `trunk` before treating as cropper-caused.
- **[low]** "dimmed mask outside the crop frame" — requires canvas-vs-frame geometry rewrite of phase 0a/1 (frame-rect plumbing through `clampTransform`, `extractSourceRect`, and every pointer handler). Scoped down in phase 4. The current cover-fit + rule-of-thirds + accent outline + spinner + error retry is a functional Instagram-class experience without it. Revisit if product signal shows users miss the outside-frame context view.
- **[low]** axe-core not wired into unit-test loop. Phase 3 punted to phase 4; phase 4 punted to whenever the placeholder e2e baseline lifts. Manual a11y rules in place (role=application + aria-label + tabindex + focus-visible + aria-live zoom % + focus-stability test) cover the substantive bar; axe is incremental.

### Verdict
**ship** (user override on the mobile-probe blocker, 2026-05-23).

Original verdict was `no-ship until: iOS Safari multi-touch hardware probe and exif-orientation probe return green`. Classification rule that triggered the blocker call: **regression** — prior release supplied mobile cropping via cropperjs; removing cropperjs without verifying the replacement works on iOS Safari is a potential regression for mobile users.

User override during `/pre-merge`: "mobile interface is incomplete, non-blocking issue." The mobile-probe items demote to `follow-up · high` and migrate into the project's durable trackers (bugs.md) rather than gating the merge. Pre-merge proceeds.

The cropper's code shape is sound — unit + component tests cover the math, image pipeline, drop/paste/size guard, focus-stability; the integration check passes; the dependency footprint dropped (cropperjs gone, no new runtime dep added); a11y and theming are honest.
