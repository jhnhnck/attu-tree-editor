<!-- SPDX-License-Identifier: MIT -->
<!--
    phase 1 — full dialog chrome. adds:
      Escape key closes (stopPropagation so other overlays aren't affected)
      onopen callback (called after mount)
      backdrop click closes (retained from phase 0)
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import { X, Check } from "@lucide/svelte";
    import { dockStore } from "./store.svelte.js";

    interface Props {
        id: string;
        title?: string;
        size?: "md" | "lg";
        children?: Snippet;
        onopen?: () => void;
        onsave?: () => void;
        ondiscard?: () => void;
    }

    let { id, title, size = "md", children, onopen, onsave, ondiscard }: Props = $props();

    function close(): void {
        dockStore.closeDialog();
    }

    function onkeydown(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.stopPropagation();
            close();
        }
    }

    $effect(() => {
        onopen?.();
    });
</script>

<!-- backdrop -->
<div
    class="modal-backdrop"
    role="presentation"
    aria-hidden="true"
    onclick={close}
></div>

<!-- panel -->
<div
    class="modal-panel"
    data-size={size}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={title ?? id}
    data-dialog-id={id}
    onkeydown={onkeydown}
>
    <div class="modal-header">
        <span class="text-xs text-fg-muted lowercase">{title ?? id}</span>
        <div class="flex items-center gap-1">
            {#if onsave}
                <button
                    type="button"
                    class="fte-window-control fte-window-control-confirm"
                    data-dialog-control
                    aria-label="save"
                    onclick={() => { onsave?.(); close(); }}
                ><Check size={10} strokeWidth={2.5} /></button>
            {/if}
            <button
                type="button"
                class="fte-window-control fte-window-control-close"
                data-dialog-control
                aria-label="close"
                onclick={() => { ondiscard?.(); close(); }}
            ><X size={10} strokeWidth={2.5} /></button>
        </div>
    </div>
    {#if children}
        <div class="modal-body">
            {@render children()}
        </div>
    {/if}
</div>

<style>
    .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 50;
        background: rgb(0 0 0 / 0.5);
        backdrop-filter: blur(4px);
        pointer-events: auto;
    }

    .modal-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 51;
        display: flex;
        flex-direction: column;
        width: max-content;
        max-width: min(36rem, calc(100vw - 2rem));
        max-height: calc(100vh - 4rem);
        border-radius: 0.375rem;
        border: 1px solid var(--color-line);
        background: var(--color-canvas-elev);
        pointer-events: auto;
        overflow: hidden;
    }

    .modal-panel[data-size="lg"] {
        max-width: min(48rem, calc(100vw - 2rem));
    }

    .modal-header {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.25rem 0.5rem;
        border-bottom: 1px solid var(--color-line);
        min-height: 1.75rem;
    }

    .modal-body {
        flex: 1 1 auto;
        min-height: 0;
        padding: 0.75rem;
        overflow-y: auto;
    }


</style>
