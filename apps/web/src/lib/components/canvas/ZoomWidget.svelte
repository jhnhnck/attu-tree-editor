<!--
    FamilyTreeEditor - canvas zoom pill (bottom-right). slider is log-scale 10..500%
    auto-fades after a couple seconds idle; back on hover/focus. hidden on touch.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { Hand, Maximize2, MousePointer2 } from "@lucide/svelte";

    type Mode = "select" | "hand";

    interface Props {
        scale: number;
        mode: Mode;
        onzoom: (next: number) => void;
        onfit: () => void;
        onmodechange: (next: Mode) => void;
    }

    let { scale, mode, onzoom, onfit, onmodechange }: Props = $props();

    const MIN = 0.1;
    const MAX = 5.0;
    const LOG_MIN = Math.log(MIN);
    const LOG_MAX = Math.log(MAX);

    let editing = $state(false);
    let editValue = $state("");
    let editEl: HTMLInputElement | undefined = $state();
    let visible = $state(true);
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const IDLE_MS = 2000;

    function clamp(n: number, lo: number, hi: number): number {
        return Math.max(lo, Math.min(hi, n));
    }

    function scaleToSlider(s: number): number {
        const c = clamp(s, MIN, MAX);
        return (Math.log(c) - LOG_MIN) / (LOG_MAX - LOG_MIN);
    }

    function sliderToScale(t: number): number {
        const c = clamp(t, 0, 1);
        return Math.exp(LOG_MIN + c * (LOG_MAX - LOG_MIN));
    }

    function onSliderInput(e: Event): void {
        const v = Number((e.currentTarget as HTMLInputElement).value);
        const next = sliderToScale(v / 1000);
        onzoom(next);
        bumpVisible();
    }

    function startEdit(): void {
        editValue = String(Math.round(scale * 100));
        editing = true;
        queueMicrotask(() => {
            editEl?.focus();
            editEl?.select();
        });
    }

    function commitEdit(): void {
        const n = Number(editValue);
        if (!Number.isFinite(n) || n <= 0) {
            editing = false;
            return;
        }
        const next = clamp(n / 100, MIN, MAX);
        onzoom(next);
        editing = false;
    }

    function onEditKey(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            e.preventDefault();
            commitEdit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            editing = false;
        }
    }

    function bumpVisible(): void {
        visible = true;
        if (idleTimer !== undefined) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            visible = false;
        }, IDLE_MS);
    }

    onMount(() => {
        bumpVisible();
    });
    onDestroy(() => {
        if (idleTimer !== undefined) clearTimeout(idleTimer);
    });

    // re-show + reset idle timer whenever the scale prop changes (e.g. wheel zoom)
    $effect(() => {
        void scale;
        bumpVisible();
    });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="zoom-widget pointer-events-auto absolute right-3 bottom-3 z-30 flex items-center gap-2 rounded-full border px-2 py-1 backdrop-blur"
    class:visible
    onmouseenter={bumpVisible}
    onfocusin={bumpVisible}
    aria-label="zoom controls"
>
    <button
        type="button"
        class="text-fg-muted hover:text-fg flex h-6 w-6 items-center justify-center rounded font-mono text-base"
        title="Zoom out"
        aria-label="zoom out"
        onclick={() => {
            onzoom(clamp(scale * 0.8, MIN, MAX));
            bumpVisible();
        }}
    >
        −
    </button>

    <input
        type="range"
        min="0"
        max="1000"
        value={String(Math.round(scaleToSlider(scale) * 1000))}
        oninput={onSliderInput}
        class="zoom-slider h-1 w-32 appearance-none rounded"
        style:--val="{Math.round(scaleToSlider(scale) * 100)}%"
        aria-label="zoom level"
    />

    <button
        type="button"
        class="text-fg-muted hover:text-fg flex h-6 w-6 items-center justify-center rounded font-mono text-base"
        title="Zoom in"
        aria-label="zoom in"
        onclick={() => {
            onzoom(clamp(scale * 1.25, MIN, MAX));
            bumpVisible();
        }}
    >
        +
    </button>

    {#if editing}
        <input
            bind:this={editEl}
            bind:value={editValue}
            onblur={commitEdit}
            onkeydown={onEditKey}
            class="bg-canvas border-line text-fg w-12 rounded border px-1 py-0.5 text-center font-mono text-[11px] outline-none"
            type="text"
            inputmode="numeric"
            aria-label="exact zoom percent"
        />
    {:else}
        <button
            type="button"
            class="text-fg-muted hover:text-fg w-12 text-center font-mono text-[11px]"
            title="Click to set exact zoom"
            aria-label="zoom percent (click to edit)"
            onclick={startEdit}
        >
            {Math.round(scale * 100)}%
        </button>
    {/if}

    <button
        type="button"
        class="text-fg-muted hover:text-fg flex h-6 items-center gap-1 rounded px-1.5 text-[11px]"
        title="Fit (Ctrl+0)"
        aria-label="fit to window"
        onclick={() => {
            onfit();
            bumpVisible();
        }}
    >
        <Maximize2 size={12} />
        Fit
    </button>

    <button
        type="button"
        class="hover:text-fg flex h-6 w-6 items-center justify-center rounded"
        class:text-accent={mode === "hand"}
        class:text-fg-muted={mode === "select"}
        title={mode === "hand"
            ? "Hand tool (H) — click for select"
            : "Select tool (V) — click for hand"}
        aria-label={mode === "hand" ? "switch to select tool" : "switch to hand tool"}
        aria-pressed={mode === "hand"}
        onclick={() => {
            onmodechange(mode === "hand" ? "select" : "hand");
            bumpVisible();
        }}
    >
        {#if mode === "hand"}
            <Hand size={12} />
        {:else}
            <MousePointer2 size={12} />
        {/if}
    </button>
</div>

<style>
    .zoom-widget {
        background-color: color-mix(in srgb, var(--color-canvas-elev) 80%, transparent);
        border-color: var(--color-line);
        opacity: 0.35;
        transition: opacity 200ms ease-out;
    }
    .zoom-widget:hover,
    .zoom-widget:focus-within,
    .zoom-widget.visible {
        opacity: 1;
    }
    .zoom-slider {
        background: linear-gradient(
            to right,
            var(--color-accent) 0%,
            var(--color-accent) var(--val, 50%),
            var(--color-line) var(--val, 50%),
            var(--color-line) 100%
        );
    }
    .zoom-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 9999px;
        background: var(--color-accent);
        cursor: pointer;
        border: 2px solid var(--color-canvas-elev);
    }
    .zoom-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border-radius: 9999px;
        background: var(--color-accent);
        cursor: pointer;
        border: 2px solid var(--color-canvas-elev);
    }
    @media (pointer: coarse) {
        .zoom-widget {
            display: none;
        }
    }
</style>
