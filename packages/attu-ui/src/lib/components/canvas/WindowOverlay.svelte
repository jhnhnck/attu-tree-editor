<!-- SPDX-License-Identifier: MIT -->
<!--
    canvas-window-manager overlay (phase 0). mounts once inside the
    canvas-host (sibling of CanvasChromeDock) and renders every
    popped-out Window absolutely positioned inside the host.

    iteration: `popOutStates ∩ registry.idsByKind("window")`. orphan
    ids — registry entries that have unmounted (e.g. family-view
    panels disappearing on engine swap) — drop automatically because
    they no longer appear in idsByKind, even if the windowManager
    still has them in popOutStates. the popOutStates entries
    themselves stay until something explicitly redocks them; that
    is intentional so an engine flip + flip-back restores the popped-
    out window in its prior slot. (revisit if it surprises users.)

    wrapper carriage:
      - data-canvas-window root (already on Window.svelte) NOT on the
        positioning wrapper, to keep WindowOverlay's contract clear
      - data-canvas-chrome IS NOT set on the positioning wrapper
        (phase-0 probe verdict; see plan log § "verdict B"). the
        invariant is pinned by `popoutChromeInsets.test.ts`.

    bbox follow: a ResizeObserver on the canvas-host calls
    `windowManager.clampAll` whenever the host resizes (sheet-
    inspector open/close, window resize). the observer reads each
    popped-out wrapper's measured size so the clamp uses the live
    bbox, not the 320×150 default.
-->
<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import { itemsForCorner, type DockRenderSnippet } from "./dockRegistry.svelte";
    import { windowManager } from "./windowManager.svelte";

    interface WindowItem {
        id: string;
        render: DockRenderSnippet;
    }

    let hostEl: HTMLElement | undefined = $state();
    let overlayEl: HTMLDivElement | undefined = $state();

    // resolve the canvas-host once the overlay element mounts. the
    // overlay is a child of the host (placed inside the host in
    // App.svelte), so `closest` gets there directly.
    $effect(() => {
        const el = overlayEl;
        if (!el) return;
        const host = el.closest<HTMLElement>("[data-canvas-host]") ?? undefined;
        hostEl = host;
        windowManager.setHostElement(host ?? null);
        return () => {
            windowManager.setHostElement(null);
        };
    });

    // wire a ResizeObserver on the host so clamp follows on
    // sheet-inspector open / close / window resize. reads each
    // popped-out wrapper's live size from the dom so the clamp uses
    // the natural bbox, not the 320x150 default.
    $effect(() => {
        const host = hostEl;
        const overlay = overlayEl;
        if (!host || !overlay) return;
        const ro = new ResizeObserver(() => {
            const sizes = new Map<string, { w: number; h: number }>();
            const wrappers = overlay.querySelectorAll<HTMLElement>("[data-window-id]");
            for (const w of wrappers) {
                const id = w.getAttribute("data-window-id");
                if (!id) continue;
                const r = w.getBoundingClientRect();
                sizes.set(id, { w: r.width, h: r.height });
            }
            untrack(() => windowManager.clampAll(sizes));
        });
        ro.observe(host);
        return () => ro.disconnect();
    });

    onDestroy(() => {
        windowManager.setHostElement(null);
    });

    // iterate every corner the registry tracks. windows can live in
    // any corner (matches the dock's per-corner mounting model) but
    // phase 0 only mounts the bl corner of the dock; popped-out
    // windows escape the dock entirely so they don't care about
    // corner.
    const windowItems = $derived.by<WindowItem[]>(() => {
        // pull from all four corners; pop-out is corner-agnostic.
        const out: WindowItem[] = [];
        for (const corner of ["bl", "tl", "tr", "br"] as const) {
            for (const item of itemsForCorner(corner)) {
                if (item.kind === "window") out.push({ id: item.id, render: item.render });
            }
        }
        return out;
    });

    // the rendered list: every item where popOutStates HAS the id.
    // joining popOutStates with the registry produces the orphan-
    // cleanup behaviour automatically — registry ids that have
    // unmounted simply don't appear here.
    const renderable = $derived(windowItems.filter((it) => windowManager.popOutStates.has(it.id)));
</script>

<div
    bind:this={overlayEl}
    class="pointer-events-none absolute inset-0"
    data-testid="canvas-window-overlay"
>
    {#each renderable as it (it.id)}
        {@const state = windowManager.popOutStates.get(it.id)}
        {#if state}
            <div
                class="pointer-events-auto absolute fte-window-popout"
                style="left: {String(state.x)}px; top: {String(state.y)}px; z-index: {String(
                    state.z,
                )};"
                data-window-id={it.id}
                data-popout-wrapper
            >
                {@render it.render({ forcedCollapse: false })}
            </div>
        {/if}
    {/each}
</div>

<style>
    /* popped-out wrapper. since canvas-chrome-v2 phase 1, the surface
       (background + border + radius + blur) lives on .fte-window-stack
       inside, shared by docked and floating forms. the wrapper only adds
       the floating affordance: a drop shadow and an upper width bound.
       border-radius here just shapes the shadow to match the stack. */
    .fte-window-popout {
        border-radius: 0.375rem;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        max-width: 24rem;
    }
</style>
