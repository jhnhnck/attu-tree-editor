<!-- SPDX-License-Identifier: MIT -->
<!--
    phase 0 stub — position:fixed inset-0 pointer-events-none container.
    renders DockModal stub when dockStore.activeModal === "skeleton-test".
    full floating window rendering + ResizeObserver clamp in phase 1.
-->
<script lang="ts">
    import { dockStore } from "./store.svelte.js";
    import DockModal from "./DockModal.svelte";
</script>

<div
    class="pointer-events-none fixed inset-0 z-30"
    aria-hidden="true"
    data-dock-surface
>
    {#if dockStore.activeModal !== undefined}
        <!-- pointer-events-auto scoped to the modal layer so clicks outside
             the modal panel hit the backdrop, which closes. -->
        <div class="pointer-events-auto">
            <DockModal id={dockStore.activeModal} title="modal stub" />
        </div>
    {/if}
</div>
