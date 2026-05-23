<!--
    FamilyTreeEditor - canvas-backed cropper renderer with pan/zoom (phase 1)
    single-pointer pan, two-pointer pinch-zoom (centroid-anchored), wheel-zoom
    (cursor-anchored). transform is mutated in place via $bindable so the
    dialog can read it for the encode step.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { SourceBitmap } from "$lib/components/editor/loadSourceBitmap";
    import {
        anchorZoom,
        clampTransform,
        panTransform,
        type Transform,
    } from "$lib/components/editor/cropperMath";

    interface Props {
        source: SourceBitmap | undefined;
        frameW: number;
        frameH: number;
        /** bindable transform; mutated by gestures, read by the dialog on save */
        transform: Transform | undefined;
    }

    let { source, frameW, frameH, transform = $bindable() }: Props = $props();

    let canvasEl: HTMLCanvasElement | undefined = $state();
    let dpr = $state(1);
    let dragging = $state(false);
    let renderHandle = 0;

    // active pointers — keyed by pointerId. tracks css-pixel canvas coordinates.
    const pointers = new Map<number, { x: number; y: number }>();
    // baseline pinch distance, refreshed at the start of a two-pointer gesture and
    // on each move so the per-frame factor stays close to 1.0.
    let pinchStartDist = 0;

    function size(): { w: number; h: number } {
        return { w: frameW, h: frameH };
    }

    function withClamp(next: Transform): Transform {
        if (!source) return next;
        return clampTransform({ w: source.width, h: source.height }, size(), next);
    }

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
        if (renderHandle !== 0) return;
        renderHandle = requestAnimationFrame(() => {
            renderHandle = 0;
            render();
        });
    }

    function render(): void {
        if (!canvasEl) return;
        const ctx = canvasEl.getContext("2d");
        if (!ctx) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingQuality = "high";
        if (source && transform) {
            source.draw(ctx, transform);
        }
        ctx.restore();
    }

    // map a pointer event to canvas-local css-pixel coords
    function localPos(e: PointerEvent): { x: number; y: number } {
        if (!canvasEl) return { x: 0, y: 0 };
        const rect = canvasEl.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function centroid(): { x: number; y: number } {
        let sx = 0;
        let sy = 0;
        for (const p of pointers.values()) {
            sx += p.x;
            sy += p.y;
        }
        const n = pointers.size || 1;
        return { x: sx / n, y: sy / n };
    }

    function pinchDistance(): number {
        const it = pointers.values();
        const a = it.next().value;
        const b = it.next().value;
        if (!a || !b) return 0;
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function onPointerDown(e: PointerEvent): void {
        if (!canvasEl) return;
        canvasEl.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, localPos(e));
        dragging = true;
        if (pointers.size === 2) {
            pinchStartDist = pinchDistance() || 1;
        }
    }

    function onPointerMove(e: PointerEvent): void {
        if (!transform) return;
        const prev = pointers.get(e.pointerId);
        if (!prev) return;
        const next = localPos(e);
        pointers.set(e.pointerId, next);

        if (pointers.size === 1) {
            // single-pointer pan
            const dx = next.x - prev.x;
            const dy = next.y - prev.y;
            transform = withClamp(panTransform(transform, dx, dy));
        } else if (pointers.size === 2) {
            // pinch-zoom anchored at the centroid (and pan via centroid drift)
            const c = centroid();
            const dist = pinchDistance() || pinchStartDist;
            const factor = dist / pinchStartDist;
            // reset baseline incrementally so factor stays close to 1.0
            pinchStartDist = dist;
            transform = withClamp(anchorZoom(transform, c.x, c.y, factor));
        }
    }

    function onPointerUp(e: PointerEvent): void {
        if (canvasEl?.hasPointerCapture(e.pointerId)) {
            canvasEl.releasePointerCapture(e.pointerId);
        }
        pointers.delete(e.pointerId);
        if (pointers.size < 2) {
            pinchStartDist = 0;
        }
        if (pointers.size === 0) dragging = false;
    }

    function onWheel(e: WheelEvent): void {
        if (!transform || !canvasEl) return;
        e.preventDefault();
        const rect = canvasEl.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        // intensity per TreeCanvas.svelte conventions: ctrl-wheel = trackpad
        // pinch / coarser; bare wheel = mouse-wheel / finer.
        const intensity = e.ctrlKey ? 0.0045 : 0.0018;
        const factor = Math.exp(-e.deltaY * intensity);
        transform = withClamp(anchorZoom(transform, cx, cy, factor));
    }

    $effect(() => {
        void frameW;
        void frameH;
        resizeCanvas();
    });

    $effect(() => {
        void source;
        void transform;
        scheduleRender();
    });

    // re-clamp on source change so a freshly loaded bitmap never starts outside
    // its cover bounds (e.g., a swap from a portrait to a landscape source).
    $effect(() => {
        if (source && transform) {
            const clamped = withClamp(transform);
            if (
                clamped.scale !== transform.scale ||
                clamped.tx !== transform.tx ||
                clamped.ty !== transform.ty
            ) {
                transform = clamped;
            }
        }
    });
</script>

<canvas
    bind:this={canvasEl}
    class="cropper-canvas block touch-none select-none"
    class:dragging
    aria-label="portrait crop preview"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onwheel={onWheel}
></canvas>

<style>
    .cropper-canvas {
        background: var(--color-canvas);
        border-radius: 0.25rem;
        cursor: grab;
    }
    .cropper-canvas.dragging {
        cursor: grabbing;
    }
</style>
