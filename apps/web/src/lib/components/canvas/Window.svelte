<!-- SPDX-License-Identifier: MIT -->
<!--
    canvas-window-manager Window primitive (phase 0). the ONLY chrome
    contract for floating canvas surfaces (debug menu, stats popover,
    save-status popover, family-view debug panels, future ones).

    titlebar layout (controls left-to-right: pop/dock, minimize, close):
      docked:      `title  [pop-out ↗]  [minimize ⌃]  [close ×]`
      popped-out:  `title  [re-dock ↙]  [minimize ⌃]  [close ×]`

    body-expansion-state model (phase-0 spike; recorded verbatim in
    `.claude/plans/canvas-window-manager/spike-window-contract.md`):
      - caller owns `expanded: boolean` (mirrors the pre-migration
        chrome-pill contract)
      - Window reads `forcedCollapse` from the registry's DockRenderCtx,
        which DockRegistration's snippet receives as an argument
      - pop-out implicitly forces `expanded=true` — querying
        `windowManager.isPoppedOut(id)` and OR-ing it into the
        effective expansion. when popped-out the body always renders
        regardless of the caller's `expanded` value

    three branches:
      1. docked + expanded=false + not forced: body hidden (pill-only)
      2. docked + expanded=true + not forced: body shown
      3. forced collapse OR popped out: forced wins (forcedCollapse
         hides body; popOut shows body) — forced-collapse and pop-out
         are mutually exclusive in practice because the dock hides
         popped-out entries via the same filter

    boundary contract:
      caller wraps <Window> INSIDE <DockRegistration kind="window">,
      not the other way around. Window NEVER calls register()
      internally — top-level snippet declarations aren't addressable
      from a script $effect (that's why DockRegistration exists in
      the first place).

    titlebar click (anywhere not on a control button) calls
    windowManager.focus(id) so the accent treatment + the dock's
    focusedAt-desc tiebreaker both update on the same event.

    drag-to-move (phase 1): when the window is popped out, the
    titlebar accepts pointerdown → setPointerCapture →
    pointermove (moveTo via windowManager) → pointerup. drag is
    suppressed when not popped out so docked titlebars only fire
    the focus-on-click handler. the pointerdown handler also calls
    `stopPropagation` + `preventDefault` so the canvas pan + card-
    selection pipelines never see the event, and brings the window
    to the top of the z-band on press so dragging the lower window
    in a stack still raises it.
-->
<script lang="ts">
    import { type Snippet } from "svelte";
    import {
        ArrowDownLeft,
        ArrowDownRight,
        ArrowUpLeft,
        ArrowUpRight,
        ChevronDown,
        ChevronUp,
        X,
    } from "@lucide/svelte";
    import { windowManager } from "./windowManager.svelte";
    import { dockConfig } from "./dockConfig.svelte";

    interface Props {
        // stable id used to read forcedCollapse / focus state / pop-out
        // state from the singletons. matches the id the caller passes
        // to <DockRegistration kind="window" id="...">.
        id: string;
        // sibling pill id paired with this window for visual link +
        // "minimize to here" hint. when the window IS its own trigger
        // (current family-view debug panels), pillId === id; the
        // spike doc spells this case out so callers don't get confused.
        pillId: string;
        // titlebar text.
        title: string;
        // caller-owned user-collapse state. mirrors the prop the pre-
        // migration chrome-pill component took.
        expanded: boolean;
        // dock-managed forced-collapse flag forwarded from the
        // DockRegistration render context (kind="window" snippets
        // receive `{ forcedCollapse }` the same way panel snippets do).
        forcedCollapse?: boolean;
        // caller's "user toggled collapse" handler. titlebar chev-up
        // forwards here.
        onToggleExpanded: () => void;
        // when false, omits the close (×) button. save-status is the
        // canonical non-closing window; phase 1 will add the full
        // closeable prop to all windows.
        closeable?: boolean;
        // optional close handler that runs after the × routes through
        // windowManager.closeWindow(id) for pop-out cleanup. most windows
        // leave this undefined now that open-state lives uniformly in
        // windowManager.openedWindows (the debug menu's old caller-owned
        // `debugMenuOpen` flag was merged into isOpen("debug-menu") in
        // canvas-window-manager phase 2).
        onClose?: () => void;
        // body snippet — caller renders everything inside. Window owns
        // ONLY chrome.
        body: Snippet;
    }

    let {
        id,
        pillId,
        title,
        expanded,
        forcedCollapse = false,
        onToggleExpanded,
        closeable = true,
        onClose,
        body,
    }: Props = $props();

    // derived expansion: pop-out forces expanded; forced-collapse
    // hides regardless of expanded. matches the three-branch model
    // from the spike doc.
    const poppedOut = $derived(windowManager.isPoppedOut(id));
    const effectiveExpanded = $derived(poppedOut ? true : forcedCollapse ? false : expanded);
    const focused = $derived(windowManager.focusedWindowId === id);

    // taskbar model (phase 6): anchor-aware control icons. the minimize
    // chevron points toward the anchored edge (up for top corners, down for
    // bottom corners). the pop-out diagonal points AWAY from the anchor
    // (toward the open canvas); re-dock flips it back toward the anchor.
    const corner = $derived(dockConfig.corner);
    const isTop = $derived(corner === "tl" || corner === "tr");
    const isLeft = $derived(corner === "tl" || corner === "bl");
    const MinimizeIcon = $derived(isTop ? ChevronUp : ChevronDown);
    // pop-out diagonal points to the corner diagonally opposite the anchor:
    // tl→down-right, tr→down-left, bl→up-right, br→up-left. re-dock points
    // back toward the anchor.
    const PopOutIcon = $derived(
        isTop ? (isLeft ? ArrowDownRight : ArrowDownLeft) : isLeft ? ArrowUpRight : ArrowUpLeft,
    );
    const ReDockIcon = $derived(
        isTop ? (isLeft ? ArrowUpLeft : ArrowUpRight) : isLeft ? ArrowDownLeft : ArrowDownRight,
    );

    // active-window highlight is a brief flash on becoming-focused, not a
    // persistent accent. the flash re-plays on EVERY focus event for this
    // window, including re-focusing the already-focused one, by tracking
    // windowManager.focusGen (bumped on every focus() call) rather than the
    // bare `focused` derived (cc1-3). `focused` stays a stable data-* attr
    // for e2e. the css @keyframes plays while `flashFocused` is true.
    let flashFocused = $state(false);
    let flashTimer: ReturnType<typeof setTimeout> | undefined;
    let lastFlashGen = 0;
    $effect(() => {
        const gen = windowManager.focusGen;
        if (focused && gen !== lastFlashGen) {
            lastFlashGen = gen;
            flashFocused = true;
            clearTimeout(flashTimer);
            flashTimer = setTimeout(() => {
                flashFocused = false;
            }, 300);
        }
    });
    // clear any pending flash timer on unmount only (a separate effect with
    // no reactive reads, so its cleanup runs at destroy — NOT on every
    // focusGen tick, which would prematurely kill an in-flight flash when a
    // sibling window steals focus).
    $effect(() => () => clearTimeout(flashTimer));

    // body wrapper id for aria-controls; testids are owned by the
    // caller's body snippet (it carries `data-testid="debug-panel"`
    // etc.), so Window itself only carries an `id="${id}-body"` for
    // the wrapper.
    const bodyId = $derived(`${id}-body`);

    function onTitlebarClick(): void {
        // record the focus event regardless of expansion state — even
        // a collapsed window can be the "most recently interacted"
        // one (matters for the dock's focusedAt-desc tiebreaker when
        // multiple windows share a priority bucket).
        windowManager.focus(id);
    }

    function onToggleExpandedClick(e: MouseEvent): void {
        // stop propagation so the titlebar click handler doesn't also
        // fire — focus tracking is a separate concern from the minimize
        // toggle.
        e.stopPropagation();
        windowManager.focus(id);
        // a popped-out window is forced-expanded (effectiveExpanded pins
        // true while poppedOut), so toggling the caller's expanded flag
        // alone is a no-op — minimize appeared broken in undocked mode.
        // re-dock first so the collapse actually lands: the window drops
        // back into the dock and the toggle below minimizes it to its pill.
        if (poppedOut) windowManager.redock(id);
        onToggleExpanded();
    }

    function onPopOutClick(e: MouseEvent): void {
        e.stopPropagation();
        if (poppedOut) {
            windowManager.redock(id);
        } else {
            windowManager.popOut(id);
        }
    }

    function onCloseClick(e: MouseEvent): void {
        e.stopPropagation();
        // close = remove from openedWindows; App.svelte's {#if isOpen}
        // gate will unmount the DockRegistration on the next tick. also
        // redocks any pop-out so no orphan state lingers.
        windowManager.closeWindow(id);
        // windows gated on caller-owned state (debug menu) flip their
        // own flag here, since they don't live in openedWindows.
        onClose?.();
    }

    // ---------- drag-to-move (popped-out only) ----------
    // titlebar pointer state. drag activates only when the window is
    // popped out; docked windows ignore pointermove. the offsets
    // capture the pointer's position inside the popped-out wrapper at
    // press time so dragging tracks the press point instead of
    // snapping the top-left to the cursor.
    //
    // listener model: pointerdown fires on the titlebar button itself;
    // pointermove + pointerup are attached to the document during the
    // active drag so the pointer can leave the titlebar (drag across
    // cards) and still drive the move math. setPointerCapture on a
    // <button> in some platforms loses the capture on the first
    // pointermove that escapes the bounds; the document-level
    // listener is the robust workaround that also matches how every
    // other drag handler in the codebase wires up.
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let dragging = false;

    // resolve the canvas-host rect once per drag — we read it in
    // pointermove to convert the page-space pointer coords back into
    // host-local coords for windowManager.moveTo. cached at pointerdown
    // so a host resize mid-drag doesn't shift the reference frame.
    let hostRect: DOMRect | null = null;
    // wrapper size used to clamp; captured at pointerdown.
    let wrapperW = 0;
    let wrapperH = 0;
    // active pointer id so the document-level handlers can ignore
    // events from sibling pointers (multi-touch gestures).
    let activePointerId: number | null = null;

    function onDocPointerMove(e: PointerEvent): void {
        if (!dragging || !hostRect) return;
        if (activePointerId !== null && e.pointerId !== activePointerId) return;
        const x = e.clientX - hostRect.left - dragOffsetX;
        const y = e.clientY - hostRect.top - dragOffsetY;
        windowManager.moveTo(id, x, y, wrapperW, wrapperH);
        e.preventDefault();
    }

    function onDocPointerUp(e: PointerEvent): void {
        if (!dragging) return;
        if (activePointerId !== null && e.pointerId !== activePointerId) return;
        dragging = false;
        hostRect = null;
        activePointerId = null;
        document.removeEventListener("pointermove", onDocPointerMove, true);
        document.removeEventListener("pointerup", onDocPointerUp, true);
        document.removeEventListener("pointercancel", onDocPointerUp, true);
        e.preventDefault();
    }

    function onTitlebarPointerDown(e: PointerEvent): void {
        // primary button / primary touch only — middle/right click and
        // multi-touch gestures stay out of the drag pipeline.
        if (e.button !== undefined && e.button !== 0) return;
        // do not consume pointerdown on the chrome controls (collapse,
        // pop-out, close). otherwise the preventDefault below would
        // suppress the synthetic click that re-docks / closes the
        // window — click never fires after a preventDefault'd pointer-
        // down. closest() against the original target so spans + svgs
        // both qualify. applies to both the floating + docked branches.
        const eventTarget = e.target as Element | null;
        if (eventTarget?.closest(".fte-window-control")) return;

        if (poppedOut) {
            // ---- floating: drag-to-move (phase 1) ----
            // resolve the popped-out wrapper (the WindowOverlay-rendered
            // [data-popout-wrapper] ancestor) so we can clamp against its
            // measured bbox rather than the 320x150 default.
            const target = e.currentTarget as HTMLElement;
            const wrapper = target.closest<HTMLElement>("[data-popout-wrapper]");
            const host = target.closest<HTMLElement>("[data-canvas-host]");
            if (!wrapper || !host) return;

            const wrapperRect = wrapper.getBoundingClientRect();
            hostRect = host.getBoundingClientRect();
            wrapperW = wrapperRect.width;
            wrapperH = wrapperRect.height;
            // pointer position inside the wrapper at press time.
            dragOffsetX = e.clientX - wrapperRect.left;
            dragOffsetY = e.clientY - wrapperRect.top;
            dragging = true;
            activePointerId = e.pointerId;

            // raise the window to the top of the z-band on press — dragging
            // the lower window in a stack must promote it before the visible
            // move starts.
            windowManager.bringToFront(id);
            windowManager.focus(id);

            // attach the move/up listeners on the document in capture
            // phase so the canvas pan / card selection pipelines never
            // see the same pointer stream during the drag.
            document.addEventListener("pointermove", onDocPointerMove, true);
            document.addEventListener("pointerup", onDocPointerUp, true);
            document.addEventListener("pointercancel", onDocPointerUp, true);

            // stop the pointerdown from reaching the canvas pan handler or
            // card-selection plumbing.
            e.stopPropagation();
            e.preventDefault();
            return;
        }

        // ---- docked: plain focus-on-click ----
        // taskbar model (phase 6): a docked titlebar no longer initiates
        // reorder — that gesture moved to the taskbar pills (the dock owns
        // it inline now). a docked titlebar pointerdown does nothing here;
        // the separate onclick handler records focus. no stopPropagation /
        // preventDefault so the click still lands.
    }
</script>

<div
    class="fte-window-stack"
    data-canvas-window
    data-window-id={id}
    data-pill-id={pillId}
    data-popped-out={poppedOut ? "true" : "false"}
    data-focused={focused ? "true" : "false"}
    data-forced-collapse={forcedCollapse ? "true" : undefined}
>
    <!-- titlebar. clickable anywhere not on a control button to set focus. -->
    <button
        type="button"
        class="fte-window-titlebar"
        class:fte-window-titlebar-focused={flashFocused}
        class:fte-window-titlebar-popped={poppedOut}
        onclick={onTitlebarClick}
        onpointerdown={onTitlebarPointerDown}
        data-testid={`${id}-titlebar`}
        aria-label={`${title} window titlebar`}
    >
        <span class="fte-window-title">{title}</span>
        <span class="fte-window-controls">
            <!-- control order: pop/dock, minimize, close (left to right) -->
            <span
                role="button"
                tabindex="0"
                class="fte-window-control fte-window-control-popdock"
                title={poppedOut ? "re-dock" : "pop out"}
                aria-label={poppedOut ? "re-dock" : "pop out"}
                data-testid={`${id}-popout`}
                onclick={onPopOutClick}
                onkeydown={(e: KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPopOutClick(e as unknown as MouseEvent);
                    }
                }}
            >
                {#if poppedOut}
                    <ReDockIcon size={10} strokeWidth={2.5} />
                {:else}
                    <PopOutIcon size={10} strokeWidth={2.5} />
                {/if}
            </span>
            <span
                role="button"
                tabindex="0"
                class="fte-window-control fte-window-control-minimize"
                title="minimize"
                aria-label="minimize"
                data-testid={`${id}-collapse`}
                onclick={onToggleExpandedClick}
                onkeydown={(e: KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleExpandedClick(e as unknown as MouseEvent);
                    }
                }}
            >
                <MinimizeIcon size={10} strokeWidth={2.5} />
            </span>
            {#if closeable}
                <span
                    role="button"
                    tabindex="0"
                    class="fte-window-control fte-window-control-close"
                    title="close"
                    aria-label="close"
                    data-testid={`${id}-close`}
                    onclick={onCloseClick}
                    onkeydown={(e: KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onCloseClick(e as unknown as MouseEvent);
                        }
                    }}
                >
                    <X size={10} strokeWidth={2.5} />
                </span>
            {/if}
        </span>
    </button>

    <!-- body wrapper always renders so callers' testids stay queryable
         from e2e regardless of expansion state. when collapsed, the
         wrapper is empty + display:none so it takes no layout space. -->
    <div
        id={bodyId}
        class="fte-window-body"
        class:fte-window-body-collapsed={!effectiveExpanded}
        data-collapsed={effectiveExpanded ? "false" : "true"}
    >
        {#if effectiveExpanded}{@render body()}{/if}
    </div>
</div>

<style>
    /* outer stack is the window surface: titlebar header on top, a single
       border-top divider, then the body. docked + popped-out windows share
       this surface; the popout wrapper only adds a drop shadow. the body
       paints no box of its own - the stack frosts the canvas behind it. */
    .fte-window-stack {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0;
        width: var(--fte-window-width);
        border-radius: 0.375rem;
        border: 1px solid var(--color-line);
        background: color-mix(in srgb, var(--color-canvas-elev) 80%, transparent);
        backdrop-filter: blur(4px);
        overflow: hidden;
    }

    /* floating windows let content grow past the docked width */
    .fte-window-stack[data-popped-out="true"] {
        width: auto;
        min-width: var(--fte-window-width);
    }

    .fte-window-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem;
        border: none;
        background: transparent;
        color: var(--color-fg-muted);
        font-size: 0.75rem;
        line-height: 1rem;
        cursor: pointer;
        transition: color 120ms ease-out;
        min-height: 1.75rem;
    }

    .fte-window-titlebar:hover {
        color: var(--color-fg);
    }

    /* active-window highlight: a brief accent flash on becoming focused,
       not a persistent accent. `flashFocused` toggles the class for 300ms;
       the keyframe tints the titlebar then fades to transparent. the
       prefers-reduced-motion rule in app.css zeroes the duration. */
    @keyframes fte-window-flash {
        0% {
            background-color: color-mix(in srgb, var(--color-accent) 22%, transparent);
        }
        100% {
            background-color: transparent;
        }
    }
    .fte-window-titlebar-focused {
        animation: fte-window-flash 300ms ease-out;
    }

    /* popped-out state: titlebar is a drag handle. `touch-action: none`
       so mobile browsers don't pre-empt the pointer with a native pan
       gesture mid-drag (the cause of pointercancel on Pixel 7 the DoD
       calls out). cursor flips to grab/grabbing so the affordance reads. */
    .fte-window-titlebar-popped {
        touch-action: none;
        cursor: grab;
    }
    .fte-window-titlebar-popped:active {
        cursor: grabbing;
    }

    .fte-window-title {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: left;
        text-transform: lowercase;
    }

    .fte-window-controls {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        flex: 0 0 auto;
    }

    /* each control is a small circular chip with a semantic fill colour;
       the icon inside renders at stroke 2.5. hover darkens by 20%. chip
       size is rem-based so it tracks the 110% root scale. */
    .fte-window-control {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 0.875rem;
        height: 0.875rem;
        padding: 0;
        border: none;
        border-radius: 9999px;
        color: var(--color-fg);
        cursor: pointer;
        transition: filter 120ms ease-out;
    }

    /* phase 6: size the control icon in rem so it scales with the 110% root
       like its chip, instead of the fixed px baked in by lucide's size prop
       (which left the icon undersized in the scaled-up chip). 0.625rem keeps
       the icon-to-chip ratio it had at 100% (10px in a 14px chip). */
    .fte-window-control :global(svg) {
        width: 0.625rem;
        height: 0.625rem;
    }

    .fte-window-control:hover {
        filter: brightness(0.8);
    }

    /* semantic fills match tailwind neutral-600 / amber-600 / red-700 at
       40% alpha: neutral pop/dock, amber minimize, red close. */
    .fte-window-control-popdock {
        background-color: rgb(82 82 82 / 0.4);
    }
    .fte-window-control-minimize {
        background-color: rgb(217 119 6 / 0.4);
    }
    .fte-window-control-close {
        background-color: rgb(185 28 28 / 0.4);
    }

    .fte-window-body {
        display: block;
        padding: 0.5rem;
        border-top: 1px solid var(--color-line);
        overflow: auto;
    }
    .fte-window-body-collapsed {
        display: none;
    }
</style>
