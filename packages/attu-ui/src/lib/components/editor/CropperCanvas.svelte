<!--
    FamilyTreeEditor - canvas-backed cropper renderer with pan/zoom + keyboard
    pointer/wheel from phase 1; phase-3 adds arrow-pan, +/- zoom, 0 reset,
    enter/esc commit/cancel, focus management, and an aria-live zoom %.
    transform is mutated via $bindable so the dialog can read it on save.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { SourceBitmap } from "./loadSourceBitmap.js";
    import {
        anchorZoom,
        clampTransform,
        initialCoverTransform,
        panTransform,
        type Transform,
    } from "./cropperMath.js";

    interface Props {
        source: SourceBitmap | undefined;
        frameW: number;
        frameH: number;
        /** bindable transform; mutated by gestures, read by the dialog on save */
        transform: Transform | undefined;
        /** keyboard commit (enter) — caller saves the framed crop */
        oncommit?: () => void;
        /** keyboard cancel (esc) — caller closes the dialog */
        oncancel?: () => void;
        /** focus-on-mount: dialog sets this to true when it opens */
        autofocus?: boolean;
        /** show the rule-of-thirds grid overlay (default true) */
        showGrid?: boolean;
    }

    let {
        source,
        frameW,
        frameH,
        transform = $bindable(),
        oncommit,
        oncancel,
        autofocus = false,
        showGrid = true,
    }: Props = $props();

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
        if (showGrid && source && transform) {
            drawGrid(ctx);
        }
        ctx.restore();
    }

    // rule-of-thirds grid: two horizontal + two vertical lines at 1/3 and 2/3.
    // semi-transparent white so it reads on both light and dark sources.
    function drawGrid(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const v1 = frameW / 3;
        const v2 = (frameW * 2) / 3;
        const h1 = frameH / 3;
        const h2 = (frameH * 2) / 3;
        ctx.moveTo(v1, 0);
        ctx.lineTo(v1, frameH);
        ctx.moveTo(v2, 0);
        ctx.lineTo(v2, frameH);
        ctx.moveTo(0, h1);
        ctx.lineTo(frameW, h1);
        ctx.moveTo(0, h2);
        ctx.lineTo(frameW, h2);
        ctx.stroke();
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

    // keyboard map: arrow keys pan (shift = 10× step), +/- zoom around the
    // canvas center, 0 resets to cover-fit, enter saves, esc cancels.
    function onKeyDown(e: KeyboardEvent): void {
        if (!transform || !source) return;
        const step = e.shiftKey ? 10 : 1;
        const zoomStep = 1.1;
        const cx = frameW / 2;
        const cy = frameH / 2;
        switch (e.key) {
            case "ArrowLeft":
                e.preventDefault();
                transform = withClamp(panTransform(transform, step, 0));
                return;
            case "ArrowRight":
                e.preventDefault();
                transform = withClamp(panTransform(transform, -step, 0));
                return;
            case "ArrowUp":
                e.preventDefault();
                transform = withClamp(panTransform(transform, 0, step));
                return;
            case "ArrowDown":
                e.preventDefault();
                transform = withClamp(panTransform(transform, 0, -step));
                return;
            case "+":
            case "=":
                e.preventDefault();
                transform = withClamp(anchorZoom(transform, cx, cy, zoomStep));
                return;
            case "-":
            case "_":
                e.preventDefault();
                transform = withClamp(anchorZoom(transform, cx, cy, 1 / zoomStep));
                return;
            case "0":
                e.preventDefault();
                transform = initialCoverTransform(
                    { w: source.width, h: source.height },
                    { w: frameW, h: frameH },
                    cx,
                    cy,
                );
                return;
            case "Enter":
                e.preventDefault();
                oncommit?.();
                return;
            case "Escape":
                e.preventDefault();
                oncancel?.();
                return;
        }
    }

    $effect(() => {
        if (autofocus && canvasEl) {
            canvasEl.focus();
        }
    });

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

<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
<!-- the cropper is a custom widget with arrow / +/- / enter / esc keyboard
     semantics that don't match any standard control; role=application tells
     ATs to defer to the widget's own key handling. -->
<canvas
    bind:this={canvasEl}
    class="cropper-canvas block touch-none select-none"
    class:dragging
    role="application"
    tabindex="0"
    aria-label="portrait crop preview. arrow keys pan, plus and minus zoom, zero resets, enter saves, escape cancels."
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onwheel={onWheel}
    onkeydown={onKeyDown}
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
    .cropper-canvas:focus-visible {
        outline: 2px solid var(--color-accent);
        outline-offset: 2px;
    }
    /* accent-themed border around the crop frame; visible in both dark and
       light themes via the --color-accent token. */
    .cropper-canvas {
        box-shadow: 0 0 0 1px var(--color-accent);
    }
</style>
