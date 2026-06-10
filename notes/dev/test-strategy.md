# test-strategy

decisions backing the structural-invariant test floor introduced by the `ui-invariant-tests` plan. complements `notes/dev/testing.md` (which describes the layers); this file records the *why* behind the geometry-test approach and per-engine mount caveats.

added: 2026-05-26 (phase 0 walking skeleton). last revised: 2026-05-27 (phase 7 close).

---

## chrome-geometry approach: (a) jsdom + mocked layout

chosen approach: **(a) jsdom + per-test `getBoundingClientRect` mocks + a stacking-context-aware `document.elementFromPoint` stub**.

rationale: the load-bearing chrome-geometry bug is [620ce7c](../bugs.md) (union picker trapped behind sibling cards by a `transform: translate3d` stacking context). approach (a)'s `elementFromPoint` stub reads `style.transform` / `style.zIndex` and walks the stacking-context chain, so a pointer aimed at the picker correctly resolves to *sibling* with the buggy dom and to *picker* with the post-fix dom. this was verified via the phase-0 probe (observations recorded in the probes summary section below) and promoted to the skeleton spec `apps/web/tests/component/chrome-geometry-picker.test.ts`. infra cost: zero - no new dependency, no new runner, runs under the existing `pnpm test:unit`.

rejected: **(b) real-browser runner (vitest browser mode / `@playwright/experimental-ct-svelte` / happy-dom)**.

- vitest browser mode is the cheapest of the three (~5s launch overhead per `vitest run`, needs chromium in ci) but adds infra we don't yet need.
- `@playwright/experimental-ct-svelte` would introduce a second test runner and config; reserved for the day vitest browser mode proves unreliable.
- happy-dom does not implement CSS layout either, so it does not solve the same problem the (a) stub solves with mocks. *not* a free upgrade.

trigger to revisit: a chrome-geometry regression in the wild that approach (a)'s stub cannot model. at that point, switch the affected spec to vitest browser mode and keep the rest on jsdom. the ranked option list is in the probes summary section below.

---

## hyperbolic-canvas mount under jsdom: unblocked (phase 5)

`HyperbolicCanvas.svelte` mounts cleanly under jsdom once the phase-1b global shims (`ResizeObserver` + `IntersectionObserver` + `matchMedia`) are in place. the original blocker was `new ResizeObserver(...)` in the first `$effect` throwing `ReferenceError`; nothing further needed a shim (no canvas2d or getComputedStyle reads in the mount path). re-probed in phase 5 and confirmed; the parity matrix now has live hyperbolic cells where the capability is engine-agnostic, with `expectedSkip` reserved for capabilities the engine intentionally lacks (e.g. semantic-100% zoom — hyperbolic uses Möbius transforms, not euclidean scale).

## tree-canvas (layered engine) mount under jsdom: blocked

`TreeCanvas.svelte` does **not** mount cleanly in jsdom. it spawns a `Worker` from `apps/web/src/lib/layout/layout.worker.ts` and jsdom does not implement the Worker constructor. there is no cheap shim — the worker is the layout pass, not a peripheral. implication: the parity-matrix layered-engine column either substitutes `FamilyViewCanvas` as a stand-in for engine-agnostic capabilities or marks the cell `expectedSkip` with the Worker rationale. App-level mounts (debug pill, debug-toggle visibility) pull the worker in transitively, so those rows skip for layered.

---

## how to write a new chrome-geometry test

1. mount a minimal harness (real svelte component or hand-built `innerHTML`) that includes the parent stacking-context creator (`transform`, `position`+`z-index`, `opacity<1`, `filter`, etc.) and every sibling that competes for the same hit point.
2. assign known rects to every relevant element with the `setRect(el, {x,y,w,h})` pattern in `chrome-geometry-picker.test.ts` (one-liner that overrides `getBoundingClientRect`).
3. install the stacking-context-aware `document.elementFromPoint` stub from the same file. **restore it in `afterEach`** or other specs will see your stub.
4. call `document.elementFromPoint(x, y)` at a point inside *both* the surface and the competing sibling - the collision point is what makes the test catch regressions, not just present-shape.
5. assert `hit === surface`. paired pre-fix / post-fix tests make the regression target explicit and let `bugs.md`-driven historical replays compare the two.

when a second spec needs the stub, promote `setRect` + `makeStackingAwareElementFromPoint` to `apps/web/tests/component/_harness/geometry.ts` and import from there. that promotion landed in phase 2 — the canonical helper now lives at `apps/web/tests/component/_harness/stackingContextHitTest.ts` (see next section).

---

## chrome-geometry primitive: `stackingContextHitTest`

`apps/web/tests/component/_harness/stackingContextHitTest.ts` exports three helpers, all imported together by every chrome-geometry spec:

- `setRect(el, {x,y,w,h})` — overrides one element's `getBoundingClientRect` with a fixed rect. per-element, unlike `mountWithHostRect` which paints the whole prototype.
- `makeStackingAwareElementFromPoint(root)` — returns a replacement `document.elementFromPoint` that walks `root`, collects every element whose mocked rect contains `(x, y)`, ranks them by an outermost-stacking-context-first chain of `(z-index, dom-order)`, and returns the topmost. parents with `style.transform != none` or an explicit `style.zIndex` create a stacking context (the css subset family-view uses).
- `captureElementFromPoint()` — snapshot the live binding before installing the stub, so afterEach can restore it.

usage:

```ts
import { afterEach, beforeEach } from "vitest";
import {
    setRect,
    makeStackingAwareElementFromPoint,
    captureElementFromPoint,
} from "./_harness/stackingContextHitTest";

let orig: ((x: number, y: number) => Element | null) | null = null;

beforeEach(() => {
    orig = captureElementFromPoint();
});
afterEach(() => {
    if (orig) document.elementFromPoint = orig;
});

it("picker wins over sibling card", () => {
    // mount the surface, setRect every relevant element, then:
    document.elementFromPoint = makeStackingAwareElementFromPoint(canvas);
    expect(document.elementFromPoint(300, 240)).toBe(picker);
});
```

restore the original `document.elementFromPoint` in `afterEach` or sibling specs see the stub.

---

## `selectAndPersist` vs `$effect` modelling

vitest's `*.test.ts` glob excludes `.svelte.ts` files, which is where svelte 5 runes (`$state`, `$effect`) live. specs that need to observe an `$effect`-driven side effect — selection persisting to localStorage on change, for example — cannot import the runed module directly. the working pattern: model the wiring as an explicit function pair in the test file (`selectAndPersist(id)` that sets the store *and* writes to storage), document inline that production wires the same data contract via `$effect`, and assert the contract not the wiring. see `selection-reload.test.ts` for the canonical use of this pattern. tests against the data contract still catch the regression they exist to catch; tests against the `$effect` itself would need a full `App.svelte` mount and are not worth the cost.

---

## probes summary (phase 0 + phase 5)

four `_probes/` files were used to retire load-bearing unknowns during the plan; their observations are recorded here and the files are deleted. probes are point-in-time experiments — they go stale once the question they answered is settled.

- **chrome-geometry approach (a) — jsdom + layout mocks (phase 0).** the historical `620ce7c` translate3d stacking-context trap *is* detectable in jsdom: per-element `getBoundingClientRect` mocks plus an `elementFromPoint` stub that walks the stacking-context chain (treating `style.transform != none` and an explicit `style.zIndex` as context creators) returns the buggy sibling for the pre-fix dom and the picker for the post-fix dom. ~80 lines, no new dependency. promoted into `chrome-geometry-picker.test.ts` and the shared `stackingContextHitTest.ts` helper.
- **chrome-geometry approach (b) — real-browser runner survey (phase 0).** three options ranked cheapest-first if (a) ever stops working: `@vitest/browser` with playwright provider (~5s launch, same `vi.*` API, single config change), `@playwright/experimental-ct-svelte` (second runner, full real-browser layout), `happy-dom` (does not implement css layout, so does not solve the layout problem — *not* a free upgrade). trigger to revisit: a chrome-geometry regression in the wild that approach (a) cannot model.
- **hyperbolic-canvas mount (phase 0 → phase 5 re-probe).** under bare jsdom: `ReferenceError: ResizeObserver is not defined` from the first `$effect`. under the phase-1b global shims: mounts cleanly, no further blocker. enabled live hyperbolic cells in the parity matrix.
- **tree-canvas mount (phase 5).** under jsdom (with shims): `Worker is not defined` from the layout pipeline. no cheap shim — the worker *is* the layout pass. parity-matrix layered cells either substitute `FamilyViewCanvas` for engine-agnostic capabilities or carry `expectedSkip` with the Worker rationale.

---

## meta-guidelines

- **"smoke" e2e specs are an anti-pattern when a unit test already covers the behavior.** `inspector-more-actions-smoke.spec.ts` (deleted phase 1c) duplicated every `Inspector.test.ts` assertion with the same userEvent driver; the only e2e-only signal (clipboard contents) was explicitly skipped. if a unit test feels insufficient, fix the unit test rather than add a parallel e2e.
- **probe files don't belong in the long-term suite.** they answer one question, then their observation is point-in-time. fold the lesson into this doc and delete the probe.
