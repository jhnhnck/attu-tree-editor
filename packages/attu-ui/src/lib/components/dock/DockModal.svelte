<!-- SPDX-License-Identifier: MIT -->
<!--
    phase 0 stub — fixed centered panel with close button.
    backdrop click closes; Escape and onopen added in phase 1.
    global .fte-modal-* theme tokens added to theme.css in phase 1.
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import { dockStore } from "./store.svelte.js";

    interface Props {
        id: string;
        title?: string;
        children?: Snippet;
        onopen?: () => void;
    }

    let { id, title, children }: Props = $props();

    function close(): void {
        dockStore.closeModal();
    }
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
    role="dialog"
    aria-modal="true"
    aria-label={title ?? id}
    data-modal-id={id}
>
    <div class="modal-header">
        <span class="text-sm font-medium text-fg">{title ?? id}</span>
        <button
            type="button"
            class="fte-window-button"
            style="width: auto; padding: 0.125rem 0.375rem;"
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
</style>
