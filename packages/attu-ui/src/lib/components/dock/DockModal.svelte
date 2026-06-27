<!-- SPDX-License-Identifier: MIT -->
<!--
    phase 1 — full modal chrome. adds:
      Escape key closes (stopPropagation so other overlays aren't affected)
      onopen callback (called after mount)
      backdrop click closes (retained from phase 0)
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import { dockStore } from "./store.svelte.js";

    interface Props {
        id: string;
        title?: string;
        size?: "md" | "lg";
        children?: Snippet;
        onopen?: () => void;
    }

    let { id, title, size = "md", children, onopen }: Props = $props();

    function close(): void {
        dockStore.closeModal();
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
    data-modal-id={id}
    onkeydown={onkeydown}
>
    <div class="modal-header">
        <span class="text-sm font-medium text-fg">{title ?? id}</span>
        <button
            type="button"
            class="fte-icon-btn"
            aria-label="close"
            onclick={close}
        >×</button>
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
        inset: 0;
        z-index: 51;
        display: flex;
        flex-direction: column;
        margin: auto;
        width: max-content;
        max-width: min(36rem, calc(100vw - 2rem));
        max-height: calc(100vh - 4rem);
        border-radius: 0.5rem;
        border: 1px solid var(--color-line);
        background: var(--color-canvas-elev);
        pointer-events: auto;
        overflow: hidden;
    }

    .modal-panel[data-size="lg"] {
        max-width: min(48rem, calc(100vw - 2rem));
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid var(--color-line);
        min-height: 2.5rem;
    }

    .modal-body {
        padding: 0.75rem;
        overflow-y: auto;
    }

    .fte-icon-btn {
        width: 1.5rem;
        height: 1.5rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--color-fg-muted);
        cursor: pointer;
        border-radius: 0.25rem;
        font-size: 1rem;
        line-height: 1;
    }

    .fte-icon-btn:hover {
        background: var(--color-line);
        color: var(--color-fg);
    }
</style>
