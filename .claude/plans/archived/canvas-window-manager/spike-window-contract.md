# Window contract spike — paper-first, four hardest callers

phase 0, recorded BEFORE any code lands. pivot criterion fires if prop count >5 (excluding `id`, which DockRegistration provides), or a context provider is needed, or any caller needs per-caller chrome rules.

## the contract

```ts
interface WindowProps {
    // pairing back to the trigger pill, used by Window to (a) coordinate the focus accent,
    // (b) signal "minimize to here" target, (c) let the caller route click-into-pill to
    // re-open. DockRegistration provides Window's own `id` already; `pillId` names the
    // sibling pill id whose visibility/visual link is paired with this window.
    pillId: string;
    // titlebar text. `title  [chev-down]  [chev-right]  [×]` docked,
    // `[chev-left]` replaces `[chev-right]` when popped-out.
    title: string;
    // caller-owned user-collapse state. Window reads forcedCollapse from the registry
    // directly (no prop needed). pop-out implicitly forces expanded=true (handled inside
    // Window by inspecting windowManager.popOutStates).
    expanded: boolean;
    // caller's "user toggled collapse" handler. Window forwards titlebar-chev-down clicks
    // here. close (×) reuses the same handler with the convention that the caller can
    // collapse OR fully unmount the window; both reach the same flip.
    onToggleExpanded: () => void;
    // body snippet. caller renders everything inside. Window owns ONLY chrome.
    body: Snippet;
}
```

**count: 5 props** (`pillId`, `title`, `expanded`, `onToggleExpanded`, `body`).

`id` comes from `<DockRegistration kind="window" id="...">` wrapping the `<Window>` call site, NOT from a prop. Window never calls `register()` internally — see phase-0 boundary decision below.

## verbatim sketch against four hardest callers

### caller 1 — debug menu (current largest sectioned body, in App.svelte:2391-2710)

```svelte
<DockRegistration
    id="debug-menu"
    corner="bl"
    priority={300}
    kind="window"
    forceCollapsible={false}
    pillId="debug-toggle"
    render={debugMenuWindow}
/>
{#snippet debugMenuWindow(_ctx: { forcedCollapse: boolean })}
    <Window
        pillId="debug-toggle"
        title="Debug · Ctrl+Shift+D"
        expanded={debugOpen}
        onToggleExpanded={() => (debugOpen = !debugOpen)}
        body={debugMenuBody}
    />
{/snippet}
{#snippet debugMenuBody()}
    <!-- ALL existing debug-menu content (sections, toggles, ~720px tall) lives here
         unchanged. data-testid="debug-panel" stays on the inner wrapper. -->
{/snippet}
```

prop set: { pillId, title, expanded, onToggleExpanded, body }. 5/5.
nothing about chrome rules: forceCollapsible threads via DockRegistration as today.

### caller 2 — stats popover (trigger-pill back-channel via pillId + caller-owned selectedMetric)

```svelte
<!-- the stats pill itself, registered as kind="pill" (priority 20), reads
     selectedMetric to choose what to display. that pill IS the "configurable pill"
     from issue #8. the Window registered alongside (kind="window", priority 25)
     opens when statsPopoverOpen flips true; pillId="stats" pairs them. -->
<DockRegistration id="stats" corner="bl" priority={20} kind="pill" render={statsPillSnippet} />
<DockRegistration
    id="stats-window"
    corner="bl"
    priority={25}
    kind="window"
    forceCollapsible={false}
    pillId="stats"
    render={statsWindow}
/>
{#snippet statsWindow(_ctx)}
    <Window
        pillId="stats"
        title="Stats"
        expanded={statsPopoverOpen}
        onToggleExpanded={() => (statsPopoverOpen = !statsPopoverOpen)}
        body={statsBody}
    />
{/snippet}
```

back-channel: caller owns `selectedMetric` $state. clicking a row inside `statsBody` sets it. the pill's render reads it. zero new Window props needed; closures handle the wiring (verified by the snippet-closure-identity unit test in phase 1).

prop set: { pillId, title, expanded, onToggleExpanded, body }. 5/5.

### caller 3 — family-view layout-metrics (current CanvasChromePill consumer, user-toggled collapse)

```svelte
<DockRegistration
    id="family-view-debug-layout-metrics"
    corner="bl"
    priority={230}
    kind="window"
    pillId="family-view-debug-layout-metrics"
    render={layoutMetricsWindow}
/>
{#snippet layoutMetricsWindow(_ctx)}
    <Window
        pillId="family-view-debug-layout-metrics"
        title="layout"
        expanded={!collapsed.layoutMetrics}
        onToggleExpanded={() => toggleCollapsed("layoutMetrics")}
        body={layoutMetricsBody}
    />
{/snippet}
```

today the trigger pill is `CanvasChromePill`'s pill button (label `"layout"` + status text). post-migration, the Window itself carries the trigger (it IS the dock entry). the `pillId` field is here for visual pairing — if a future plan wants to split trigger and body across two dock slots (as stats does), the field is already wired; for layout-metrics today `pillId === id` and the pill+window collapse into one dock slot.

→ **decision: pillId may equal the Window's own id when the window IS its own trigger.** spelled out so callers don't get confused.

prop set: { pillId, title, expanded, onToggleExpanded, body }. 5/5.

### caller 4 — coi-breakdown (tabular body + the bug in issue 1)

```svelte
<DockRegistration
    id="family-view-debug-coi-breakdown"
    corner="bl"
    priority={220}
    kind="window"
    pillId="family-view-debug-coi-breakdown"
    render={coiBreakdownWindow}
/>
{#snippet coiBreakdownWindow(_ctx)}
    <Window
        pillId="family-view-debug-coi-breakdown"
        title="coi"
        expanded={!collapsed.coiBreakdown}
        onToggleExpanded={() => toggleCollapsed("coiBreakdown")}
        body={coiBreakdownBody}
    />
{/snippet}
```

status text (`coiDisplayed`) lives inside the body now or as titlebar suffix; the existing `family-view-debug-coi-breakdown-status` testid hooks the value. that's a phase-2 mapping concern, not a Window-contract concern.

prop set: { pillId, title, expanded, onToggleExpanded, body }. 5/5.

## things explicitly NOT in the contract

- `forceCollapsible` — already lives on `DockRegistration`. not duplicated.
- `popOutDisabled` — instead, derive from `windowManager` having no entry for the id (e.g. some windows never pop out at all = no entry ever inserted; the caller doesn't need to disable the UI control because the click is a no-op on a window that's never `popOut()`'d). if a future caller needs to grey out the chevron-right control, add it then.
- `controls?: Snippet` — extra titlebar buttons. NONE of the four hardest callers need it. defer to a follow-up plan.
- `focused?: boolean` — focus state is derived from `windowManager.focusedWindowId === id`, not a prop. Window reads it from the runtime directly.

## body-expansion-state model (chosen)

per pre-mortem high-risk #5:

- **caller owns `expanded: boolean`** (mirrors today's `CanvasChromePill.expanded`).
- **Window reads `forcedCollapse` from the registry directly** (via the snippet ctx the registry already passes when DockRegistration's snippet receives a `{ forcedCollapse }` arg). Window does NOT take a `forcedCollapse` prop.
- **pop-out implicitly forces `expanded=true`** — Window queries `windowManager.popOutStates.has(id)` and OR-s it into its effective expansion. when popped-out the body always renders regardless of the caller's `expanded` value (the user dragged this aside to see it).

three branches:
1. docked + `expanded=false` + not forced: body hidden (pill-only)
2. docked + `expanded=true` + not forced: body shown
3. forced collapse OR popped out: forced wins (`forcedCollapse` hides body; `popOut` shows body)

forced-collapse and pop-out are mutually exclusive in practice — popping out hides the dock entry (per `CanvasChromeDock` filter), and only docked entries can be force-collapsed. Window asserts this invariant only via the conditional; the test below covers all three branches.

## Window ↔ dockRegistry boundary (chosen)

per pre-mortem "what's missing" §1 and DoD bullet 7:

> caller wraps `<Window>` inside `<DockRegistration kind="window" ...>`, NOT the other way around. Window component never calls `register()` internally.

reason: top-level `{#snippet ...}` declarations are template-scoped and not addressable from `$effect`. DockRegistration is intentionally a snippet-registration shim. Window swallowing registration would force callers off the snippet pattern.

documented in `DockRegistration.svelte`'s jsdoc when phase 0 lands.

## pivot check

| caller | prop count | context provider? | per-caller chrome? |
|---|---|---|---|
| debug menu | 5 | no | no |
| stats popover | 5 | no | no |
| family-view layout-metrics | 5 | no | no |
| coi-breakdown | 5 | no | no |

**verdict: contract passes pivot. proceed with implementation.**
