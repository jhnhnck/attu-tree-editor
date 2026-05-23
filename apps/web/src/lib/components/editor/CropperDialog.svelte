<!--
    FamilyTreeEditor - custom <canvas>-based image cropper (pan/zoom, exif-aware)
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy } from "svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import CropperCanvas from "$lib/components/editor/CropperCanvas.svelte";
    import { loadSourceBitmap, type SourceBitmap } from "$lib/components/editor/loadSourceBitmap";
    import { encodePortrait } from "$lib/components/editor/encodePortrait";
    import {
        extractSourceRect,
        initialCoverTransform,
        type Transform,
    } from "$lib/components/editor/cropperMath";

    interface Props {
        /** when set, the dialog opens for this source image */
        source: Blob | undefined;
        /** target output dimensions; cropper enforces 1:1 aspect by default */
        outputW?: number;
        outputH?: number;
        /** WebP quality 0..1 */
        quality?: number;
        onsave: (bytes: Uint8Array, mime: string) => void;
        onclose: () => void;
    }

    let { source, outputW = 600, outputH = 600, quality = 0.85, onsave, onclose }: Props = $props();

    // frame in the dialog is rendered at 320 css pixels (square, matches output aspect).
    // chosen to fit comfortably in a min-width 48rem dialog with margins.
    const FRAME_W = 320;
    const FRAME_H = 320;

    let dialogEl: HTMLDialogElement | undefined = $state();
    let busy = $state(false);
    let error = $state<string | undefined>(undefined);
    let bitmap = $state<SourceBitmap | undefined>(undefined);
    let lastLoaded: Blob | undefined;
    // user-mutable; the canvas updates this via $bindable as the user pans/zooms.
    // re-initialized each time a fresh bitmap is loaded.
    let transform = $state<Transform | undefined>(undefined);

    $effect(() => {
        if (!dialogEl) return;
        if (source && !dialogEl.open) {
            dialogEl.showModal();
            void loadSource(source);
        }
        if (!source && dialogEl.open) {
            dialogEl.close();
        }
    });

    async function loadSource(blob: Blob): Promise<void> {
        if (lastLoaded === blob) return;
        lastLoaded = blob;
        error = undefined;
        bitmap?.dispose();
        bitmap = undefined;
        try {
            const bm = await loadSourceBitmap(blob);
            // guard against a stale source by the time decode completes
            if (lastLoaded !== blob) {
                bm.dispose();
                return;
            }
            bitmap = bm;
            transform = initialCoverTransform(
                { w: bm.width, h: bm.height },
                { w: FRAME_W, h: FRAME_H },
                FRAME_W / 2,
                FRAME_H / 2,
            );
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
    }

    async function save(): Promise<void> {
        if (!bitmap || !transform) return;
        busy = true;
        error = undefined;
        try {
            const rect = extractSourceRect({ w: bitmap.width, h: bitmap.height }, transform, 0, 0, {
                w: FRAME_W,
                h: FRAME_H,
            });
            const { bytes, mime } = await encodePortrait(bitmap, rect, {
                outputW,
                outputH,
                quality,
            });
            onsave(bytes, mime);
            onclose();
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            busy = false;
        }
    }

    function cleanup(): void {
        bitmap?.dispose();
        bitmap = undefined;
        transform = undefined;
        lastLoaded = undefined;
    }

    onDestroy(cleanup);
</script>

<dialog
    bind:this={dialogEl}
    onclose={() => {
        cleanup();
        onclose();
    }}
    class="cropper-dialog"
    aria-labelledby="cropper-title"
>
    {#if source}
        <header class="border-line flex items-center justify-between border-b px-5 py-3">
            <h2 id="cropper-title" class="text-fg text-base font-semibold">crop portrait</h2>
            <button
                type="button"
                aria-label="close"
                onclick={() => onclose()}
                class="text-fg-muted hover:text-fg text-lg leading-none"
            >
                ×
            </button>
        </header>

        <div class="bg-canvas flex items-center justify-center p-6">
            <CropperCanvas source={bitmap} frameW={FRAME_W} frameH={FRAME_H} bind:transform />
        </div>

        {#if !bitmap && !error}
            <p class="text-fg-muted px-5 py-1 text-xs">loading image…</p>
        {/if}

        {#if error}
            <p class="px-5 py-2 text-xs text-red-400" role="alert">{error}</p>
        {/if}

        <footer class="border-line bg-canvas-elev flex justify-end gap-2 border-t px-5 py-3">
            <Button type="button" variant="ghost" onclick={() => onclose()}>
                {#snippet children()}cancel{/snippet}
            </Button>
            <Button
                type="button"
                variant="primary"
                disabled={busy || !bitmap}
                onclick={() => void save()}
            >
                {#snippet children()}{busy ? "saving…" : "save portrait"}{/snippet}
            </Button>
        </footer>
    {/if}
</dialog>

<style>
    .cropper-dialog {
        width: min(48rem, calc(100vw - 2rem));
        max-height: calc(100vh - 2rem);
        margin: auto;
        padding: 0;
        border: 1px solid var(--color-line);
        border-radius: 0.75rem;
        background: var(--color-canvas-elev);
        color: var(--color-fg);
        overflow: hidden;
    }
    .cropper-dialog::backdrop {
        background: rgb(0 0 0 / 0.55);
    }
</style>
