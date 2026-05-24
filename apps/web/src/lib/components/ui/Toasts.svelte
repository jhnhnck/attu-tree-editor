<!--
    FamilyTreeEditor - top-center stack of toast notifications
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { ToastsStore } from "$lib/state/toasts.svelte";

    interface Props {
        store: ToastsStore;
    }

    let { store }: Props = $props();
</script>

<!--
    anchored top-center to avoid overlapping the inspector when it docks right.
    z-30 puts the toast above canvas chrome but below interactive overlays
    (menus z-40, modals / context menus z-50) so a lingering toast never
    steals a click meant for an open menu or dialog. the toast body still
    re-enables pointer-events-auto for the dismiss button.
-->
<div
    class="pointer-events-none fixed top-12 left-1/2 z-30 flex w-80 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-col gap-2"
    aria-live="polite"
    aria-atomic="false"
>
    {#each store.toasts as t (t.id)}
        <div
            role={t.kind === "error" ? "alert" : "status"}
            class="toast pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-lg backdrop-blur"
            class:toast-info={t.kind === "info"}
            class:toast-success={t.kind === "success"}
            class:toast-error={t.kind === "error"}
        >
            <span class="flex-1 leading-snug">{t.message}</span>
            <button
                type="button"
                aria-label="dismiss notification"
                onclick={() => store.dismiss(t.id)}
                class="text-fg-muted hover:text-fg -mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-base leading-none"
            >
                ×
            </button>
        </div>
    {/each}
</div>

<style>
    .toast {
        animation: toast-in 180ms ease-out;
    }
    .toast-info,
    .toast-success {
        background: color-mix(in srgb, var(--color-canvas-elev) 92%, transparent);
        border-color: var(--color-line);
        color: var(--color-fg);
    }
    .toast-error {
        background: color-mix(in srgb, hsl(0 60% 20%) 92%, transparent);
        border-color: hsl(0 60% 50%);
        color: hsl(0 0% 95%);
    }
    @keyframes toast-in {
        from {
            opacity: 0;
            transform: translateY(-4px);
        }
        to {
            opacity: 1;
            transform: none;
        }
    }
</style>
