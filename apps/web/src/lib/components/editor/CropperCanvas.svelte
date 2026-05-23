<!--
    FamilyTreeEditor - canvas-backed cropper renderer (phase 0a: degenerate cover-center, no interaction)
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { SourceBitmap } from "$lib/components/editor/loadSourceBitmap";
    import type { Transform } from "$lib/components/editor/cropperMath";

    interface Props {
        /** decoded source bitmap; undefined while loading or on error */
        source: SourceBitmap | undefined;
        /** crop frame dimensions in css pixels (matches output aspect) */
        frameW: number;
        frameH: number;
        /** transform applied to the source bitmap before drawing */
        transform: Transform | undefined;
    }

    let { source, frameW, frameH, transform }: Props = $props();

    let canvasEl: HTMLCanvasElement | undefined = $state();
    let dpr = $state(1);
    let frame = 0;

    // size the backing canvas to the frame at device pixel ratio so the image
    // is rendered crisply on hidpi displays. css size matches the frame.
    function resizeCanvas(): void {
        if (!canvasEl) return;
        const r = window.devicePixelRatio || 1;
        dpr = r;
        canvasEl.width = Math.round(frameW * r);
        canvasEl.height = Math.round(frameH * r);
        canvasEl.style.width = `${frameW}px`;
        canvasEl.style.height = `${frameH}px`;
        scheduleRender();
    }

    function scheduleRender(): void {
        if (frame !== 0) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            render();
        });
    }

    function render(): void {
        if (!canvasEl) return;
        const ctx = canvasEl.getContext("2d");
        if (!ctx) return;
        ctx.save();
        // clear with transparent so the host theme shows through behind transparent png sources
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        // scale to dpr so subsequent draws use css pixel coordinates
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingQuality = "high";
        if (source && transform) {
            source.draw(ctx, transform);
        }
        ctx.restore();
    }

    $effect(() => {
        // re-size whenever the frame changes
        void frameW;
        void frameH;
        resizeCanvas();
    });

    $effect(() => {
        // re-render when source or transform changes
        void source;
        void transform;
        scheduleRender();
    });
</script>

<canvas
    bind:this={canvasEl}
    class="cropper-canvas block touch-none select-none"
    aria-label="portrait crop preview"
></canvas>

<style>
    .cropper-canvas {
        background: var(--color-canvas);
        border-radius: 0.25rem;
    }
</style>
