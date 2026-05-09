<!--
    FamilyTreeEditor - canvas zoom pill (bottom-right). slider is log-scale 10..500%
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { Maximize2 } from "@lucide/svelte";

    interface Props {
        scale: number;
        onzoom: (next: number) => void;
        onfit: () => void;
    }

    let { scale, onzoom, onfit }: Props = $props();

    const MIN = 0.1;
    const MAX = 5.0;
    const LOG_MIN = Math.log(MIN);
    const LOG_MAX = Math.log(MAX);
    const ZOOM_STEPS = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 5.0];

    function stepUp(current: number): number {
        const clamped = clamp(current, MIN, MAX);
        return ZOOM_STEPS.find((s) => s > clamped + 0.001) ?? MAX;
    }
    function stepDown(current: number): number {
        const clamped = clamp(current, MIN, MAX);
        return [...ZOOM_STEPS].reverse().find((s) => s < clamped - 0.001) ?? MIN;
    }

    let editing = $state(false);
    let editValue = $state("");
    let editEl: HTMLInputElement | undefined = $state();

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
        onzoom(sliderToScale(v / 1000));
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
        onzoom(clamp(n / 100, MIN, MAX));
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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="zoom-widget pointer-events-auto absolute right-3 bottom-3 z-30 flex items-center gap-2 rounded-full border px-2 py-1 backdrop-blur"
    aria-label="zoom controls"
>
    <button
        type="button"
        class="text-fg-muted hover:text-fg flex h-7 w-7 items-center justify-center rounded font-mono text-base"
        title="Zoom out"
        aria-label="zoom out"
        onclick={() => onzoom(stepDown(scale))}
    >
        −
    </button>

    <input
        type="range"
        min="0"
        max="1000"
        value={String(Math.round(scaleToSlider(scale) * 1000))}
        oninput={onSliderInput}
        class="zoom-slider h-1.5 w-32 appearance-none rounded"
        style:--val="{Math.round(scaleToSlider(scale) * 100)}%"
        aria-label="zoom level"
    />

    <button
        type="button"
        class="text-fg-muted hover:text-fg flex h-7 w-7 items-center justify-center rounded font-mono text-base"
        title="Zoom in"
        aria-label="zoom in"
        onclick={() => onzoom(stepUp(scale))}
    >
        +
    </button>

    {#if editing}
        <input
            bind:this={editEl}
            bind:value={editValue}
            onblur={commitEdit}
            onkeydown={onEditKey}
            class="bg-canvas border-line text-fg w-14 rounded border px-1 py-0.5 text-center font-mono text-xs outline-none"
            type="text"
            inputmode="numeric"
            aria-label="exact zoom percent"
        />
    {:else}
        <button
            type="button"
            class="text-fg-muted hover:text-fg w-14 text-center font-mono text-xs"
            title="Click to set exact zoom"
            aria-label="zoom percent (click to edit)"
            onclick={startEdit}
        >
            {Math.round(scale * 100)}%
        </button>
    {/if}

    <button
        type="button"
        class="text-fg-muted hover:text-fg flex h-7 items-center gap-1 rounded px-1.5 text-xs"
        title="Fit (Ctrl+0)"
        aria-label="fit to window"
        onclick={onfit}
    >
        <Maximize2 size={14} />
        Fit
    </button>
</div>

<style>
    .zoom-widget {
        background-color: color-mix(in srgb, var(--color-canvas-elev) 80%, transparent);
        border-color: var(--color-line);
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
