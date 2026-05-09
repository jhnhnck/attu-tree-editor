<!--
    FamilyTreeEditor - settings dialog (theme + inspector side).

    auto-commits on change (no save/cancel, per design profile). on close,
    restores focus to the element that opened it.

    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { Sun, Moon, Monitor, PanelLeft, PanelRight, X } from "@lucide/svelte";
    import type {
        PreferencesStore,
        Theme,
        InspectorSide,
    } from "$lib/state/preferences.svelte";

    interface Props {
        prefs: PreferencesStore;
        onclose: () => void;
    }

    let { prefs, onclose }: Props = $props();

    let dialogEl: HTMLDialogElement | undefined = $state();
    const triggerEl = typeof document !== "undefined" ? document.activeElement : null;

    onMount(() => {
        dialogEl?.showModal();
    });

    onDestroy(() => {
        // restore focus to the trigger; <dialog>.close() does not auto-restore
        if (triggerEl instanceof HTMLElement) triggerEl.focus();
    });

    function close(): void {
        dialogEl?.close();
        onclose();
    }

    function onBackdrop(e: MouseEvent): void {
        // <dialog> click target is the dialog itself when clicking the backdrop
        if (e.target === dialogEl) close();
    }

    function onKey(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    }

    const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
        { value: "light", label: "light", icon: Sun },
        { value: "dark", label: "dark", icon: Moon },
        { value: "auto", label: "auto", icon: Monitor },
    ];

    const SIDE_OPTIONS: { value: InspectorSide; label: string; icon: typeof PanelLeft }[] = [
        { value: "left", label: "left", icon: PanelLeft },
        { value: "right", label: "right", icon: PanelRight },
    ];
</script>

<dialog
    bind:this={dialogEl}
    class="bg-canvas-elev text-fg border-line m-auto w-80 rounded-lg border p-0 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    onclick={onBackdrop}
    onkeydown={onKey}
    aria-label="settings"
>
    <div class="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 class="text-fg text-sm font-semibold">settings</h2>
        <button
            type="button"
            class="text-fg-muted hover:bg-canvas hover:text-fg flex h-6 w-6 items-center justify-center rounded"
            aria-label="close settings"
            onclick={close}
        >
            <X size={14} />
        </button>
    </div>

    <div class="flex flex-col gap-4 px-3 py-3">
        <fieldset>
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">
                theme
            </legend>
            <div role="radiogroup" aria-label="theme" class="flex gap-1.5">
                {#each THEME_OPTIONS as opt (opt.value)}
                    {@const Icon = opt.icon}
                    {@const active = prefs.theme === opt.value}
                    <button
                        type="button"
                        role="radio"
                        aria-checked={active}
                        class="hover:bg-canvas flex flex-1 flex-col items-center gap-1 rounded border px-2 py-2 text-xs"
                        class:border-accent={active}
                        class:text-accent={active}
                        class:border-line={!active}
                        class:text-fg-muted={!active}
                        onclick={() => prefs.setTheme(opt.value)}
                    >
                        <Icon size={14} />
                        {opt.label}
                    </button>
                {/each}
            </div>
        </fieldset>

        <fieldset>
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">
                inspector side
            </legend>
            <div role="radiogroup" aria-label="inspector side" class="flex gap-1.5">
                {#each SIDE_OPTIONS as opt (opt.value)}
                    {@const Icon = opt.icon}
                    {@const active = prefs.inspectorSide === opt.value}
                    <button
                        type="button"
                        role="radio"
                        aria-checked={active}
                        class="hover:bg-canvas flex flex-1 flex-col items-center gap-1 rounded border px-2 py-2 text-xs"
                        class:border-accent={active}
                        class:text-accent={active}
                        class:border-line={!active}
                        class:text-fg-muted={!active}
                        onclick={() => prefs.setInspectorSide(opt.value)}
                    >
                        <Icon size={14} />
                        {opt.label}
                    </button>
                {/each}
            </div>
        </fieldset>
    </div>
</dialog>
