# debug-menu open lag — phase-0 baseline analysis

**Substitution recorded.** A real Firefox Profiler `.json.gz` capture
against the live dev server was NOT produced in this phase-0 pass —
the sub-agent environment can't drive a real Firefox session. The
phase-0 DoD called for "root cause class named in plan log"; the
file you would expect at `debug-menu-open-lag-baseline.json.gz` is
intentionally absent. A future operator with a real browser session
should:

1. Open the app, with the dev tools profiler armed.
2. Click the bug-pill `[D]` to open the debug menu.
3. Stop the profile, export the `.json.gz`, drop it at
   `notes/profiles/debug-menu-open-lag-baseline.json.gz`.
4. Run `firefox-profiling-analyzer/analyze.py` against the capture
   to confirm the named root-cause class below.

## Root-cause class named — by code inspection

The plan's accepted risk #4 listed two strong candidates. Without a
real capture the call needs to be made by code reading; here is the
verdict.

**Named root cause: snippet-identity churn through DockRegistration's
second `$effect` plus a long fan-out of `$derived` consumers off
`debugOpen` / `debugOptions` / `familyViewDebugOptions`.**

Two specific load-bearing flips fire on every `debugOpen = true`:

### 1. DockRegistration's second `$effect` allocates a fresh `next` object every render

Today's code (DockRegistration.svelte:81-86):

```ts
$effect(() => {
    const next = { corner, priority, kind, render, forceCollapsible, focusedAt };
    untrack(() => updateItem(id, next));
});
```

`render` is the snippet identity, which is stable across renders of
the same parent. `corner` / `priority` / `kind` / `forceCollapsible`
are scalars. BUT the `next` literal allocates fresh every effect run,
and `updateItem` writes the new object into the SvelteMap. That
triggers every `$derived` reading the map (the dock's
`itemsForCorner`, the WindowOverlay's `windowItems`, the dock's
`forceCollapsed` consumers, anything that reads the items list at
all) to re-derive. For 8+ registered items in the bl corner (save-
status, debug-toggle, save-status-window, stats, debug-timings,
debug-menu, demo-A, demo-B, family-view debug panels…) this snowballs
each into its own forced-collapse + render-snippet re-evaluation.

### 2. `debugOptions` and `familyViewDebugOptions` allocate new objects on every `debugOpen` flip

App.svelte:345 and :427:

```ts
let debugOptions = $derived(debugOpen ? { layers: debugLayers } : undefined);
let familyViewDebugOptions = $derived(debugOpen ? { layers: familyViewDebugLayers } : undefined);
```

Both produce fresh object identities on every read, which fan out
into every canvas consumer (`TreeCanvas`, `FamilyViewCanvas`) and
their inner layout + paint passes. The reverse-flip (closing the
menu) is just as expensive.

### Cross-class secondary contributors (less load-bearing but visible)

- The `debug-menu` panel snippet body (App.svelte around line 2398-
  2861) is large (~720px of sectioned content). Its first mount on
  `debugOpen=true` runs the full snippet body's `$derived` chain
  cold; lazy mounting (via `{#if debugOpen}` inside the snippet
  rather than gating the DockRegistration) wouldn't move the work.
- Lucide icon imports are dynamic per-icon under `@lucide/svelte`;
  the first open imports + compiles every icon used inside the
  menu. Subsequent opens are fast — implies the slow first-open is
  partly icon paint cost.

## Phase-4 fix shape (does NOT land in phase 0)

Based on the named class:

1. **Memo the DockRegistration `next` object** — wrap in an
   `untrack(() => ({ ... }))` derived so the literal recomputes only
   when one of its fields actually changes. Switch `updateItem` to a
   shallow-diff write that bails when none of the patch fields
   changed value.
2. **Stabilize debugOptions identity** — change to
   `debugOpen ? debugOptionsStable : undefined` where
   `debugOptionsStable` is a constant object (or memoed via
   `$derived` against the layer values, not against `debugOpen`).
3. **Investigate the icon cold-import** — possible mitigation: tree-
   shake to a single pre-imported icon set, or use the static
   `@lucide/svelte/icons` direct paths.

## Phase-4 evidence checklist (after fix)

- Re-run the firefox profile against the post-fix build, save as
  `notes/profiles/debug-menu-open-lag-after.json.gz`.
- Open-menu latency p50 should drop below 50ms on chromium at
  1440x900.
- A vitest unit test (or playwright benchmark) opens the menu and
  asserts `performance.now()` delta < 50ms.

## Why we accept this without the capture

The phase-0 pre-mortem (`pre-mortem.md`) listed debug-menu lag as a
high-severity gap with two candidate root causes already named. The
deferred firefox capture only confirms WHICH of the two dominates;
the phase-4 fix shape covers both. The risk of misnaming the root
class is bounded: phase 4 captures the post-fix profile, and if it
still shows lag, the residual contributor gets named there.
