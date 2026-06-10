# pre-mortem — canvas-chrome-v2

**bottom line: proceed with phase 0 with three mandatory probes before phase 1 can start.**

## risks

**[high] force-collapse test retirement** — `canvas-chrome-dock.spec.ts` tests `n, o, p, q` assert specific force-collapse behavior. removing `measureAndForceCollapse` without retiring these tests breaks `pnpm verify` at the phase 0 boundary. mitigation: retire all four atomically in the same commit that removes the machinery. no deferral permitted.

**[high] `overflow-y: clip` + absolute children** — `clip` does not establish a BFC; absolutely-positioned children that escape the dock's stacking context may not clip. phase 0 must include a browser proof (inline test or manual smoke on a cramped viewport) before phase 1 starts. fallback: `overflow: hidden` (may disrupt absolute tooltips inside the dock — document if switched).

**[high] state machine e2e test seeding** — 15+ e2e assertions reference pill testids (`save-status-pill`, `stats-pill`, `debug-pill`) and expect them visible unconditionally on page load. phase 2 makes all windows start closed; those tests break unless `fte.dock.openedWindows` is seeded in `beforeEach` via `page.addInitScript`. phase 2 DoD enumerates every affected test before implementation starts.

**[med] walking skeleton incomplete** — phase 0 as originally scoped adds the state data structure but never exercises the full pill-click interaction. added to DoD: one e2e that exercises the complete `closed → open (via View > Panels) → persisted → close (via X) → persisted-as-closed` round-trip on the stats window.

**[med] cornerStyle for tl** — `cornerStyle` in CanvasChromeDock only handles `bl` (inspector-sheet-height var lift). for `tl`, `cornerClass["tl"] = "top-3 left-3 ..."` provides the top anchor via Tailwind; `cornerStyle` returns `""` for non-`bl` corners. confirm tl renders at the correct offset and that the inspector-sheet-height var is inapplicable to tl (correct — sheet lifts from the bottom, not the top).

**[med] persistent focus badge migration** — `fte-window-titlebar-focused` is a persistent CSS class today; e2e asserts `data-focused="true"` persists. phase 1 keeps the `data-focused` attribute and switches only the CSS from a persistent border-color to a `@keyframes` flash — existing attribute assertions keep passing.

**[med] stats-window registration race** — `fte.dock.openedWindows` may list `"stats-window"` but stats DockRegistration only mounts after the layout worker completes (~100ms post-mount). resolution: `isOpen(id)` check happens at the `{#if}` gate, so the window simply waits for both conditions (isOpen AND layoutStats). no flash; document as intentional in phase 2.

**[med] drag coexistence (phase 4)** — Window.svelte's floating-window drag attaches `document.addEventListener("pointermove", ..., true)` in capture phase. dock-reorder drag is on docked windows (poppedOut=false guard returns early), so single-pointer devices are safe. phase 4 adds a `pointerId` discriminator to guard multi-touch edge cases.

**[low] lucide icon names** — before phase 1 code is written, confirm `ArrowUpRight`, `ArrowDownLeft`, `ChevronUp`, `X` are exact export names in `@lucide/svelte`. `X` may be `XIcon` or `Close` in some lucide versions.

**[low] drag-to-reorder priority vs order field** — dockRegistry sorts on `priority asc, focusedAt desc, id`. phase 4 adds `order: number` (default 0) as a final tiebreaker; reorder within a priority bucket works without mutating the 0-99/100-199 priority convention.

## phase-order notes

- force-collapse e2e retirement must happen atomically in phase 0, not deferred
- the View > Panels minimal UI must land in phase 0 (walking-skeleton e2e needs an entry point to open closed windows); the polished version is phase 3
- phase 3 (corner config) is blocked until phase 0 lifts the `bl`-only guard to `tl`-only; phase 0 changes corner in the existing App.svelte mount (single mount, new corner)
