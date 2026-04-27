<!--
    FamilyTreeEditor - <dialog>-based image cropper, lazy-imports cropperjs v2
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy } from "svelte";
    import Button from "$lib/components/ui/Button.svelte";

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

    let dialogEl: HTMLDialogElement | undefined = $state();
    let imgEl: HTMLImageElement | undefined = $state();
    let busy = $state(false);
    let cropperReady = $state(false);
    let error = $state<string | undefined>(undefined);
    let imageUrl = $state<string | undefined>(undefined);

    // Narrow interface for the cropperjs v2 Cropper class methods we call.
    // v2 uses web components; getCropperImage().$ready() waits for the image
    // to load, and getCropperSelection().$toCanvas() returns the cropped canvas.
    interface CropperImageEl {
        $ready(): Promise<unknown>;
    }
    interface CropperSelectionEl {
        aspectRatio: number;
        bounded: boolean;
        $toCanvas(opts?: { width?: number; height?: number }): Promise<HTMLCanvasElement>;
        $center(size?: "cover" | "contain"): CropperSelectionEl;
    }
    interface CropperV2 {
        getCropperImage(): CropperImageEl | null;
        getCropperSelection(): CropperSelectionEl | null;
        destroy(): void;
    }
    let cropper: CropperV2 | undefined;

    $effect(() => {
        if (!dialogEl) return;
        if (source && !dialogEl.open) {
            dialogEl.showModal();
            void initCropper();
        }
        if (!source && dialogEl.open) {
            dialogEl.close();
        }
    });

    async function initCropper(): Promise<void> {
        if (!source) return;
        if (cropper) {
            cropper.destroy();
            cropper = undefined;
        }
        if (imageUrl) {
            URL.revokeObjectURL(imageUrl);
            imageUrl = undefined;
        }
        error = undefined;
        cropperReady = false;
        try {
            imageUrl = URL.createObjectURL(source);
            // wait one frame so the <img bind:this> has rendered
            await new Promise((r) => requestAnimationFrame(() => r(undefined)));
            if (!imgEl) return;

            // cropperjs v2 — no CSS import needed, styles are in web components
            const mod = (await import("cropperjs")) as unknown as {
                default: new (el: HTMLImageElement) => CropperV2;
            };
            const c = new mod.default(imgEl);

            // wait for the image element inside the cropper to finish loading
            await c.getCropperImage()?.$ready();

            // lock to square (or caller's ratio), constrain to canvas bounds,
            // and expand the initial selection to fill the image
            const sel = c.getCropperSelection();
            if (sel) {
                sel.aspectRatio = outputW / outputH;
                sel.bounded = true;
                sel.$center("contain");
            }

            cropper = c;
            cropperReady = true;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
    }

    async function save(): Promise<void> {
        if (!cropper || !cropperReady) return;
        busy = true;
        error = undefined;
        try {
            // $toCanvas crops the selected region and scales to the output size
            const canvas = await cropper.getCropperSelection()?.$toCanvas({
                width: outputW,
                height: outputH,
            });
            if (!canvas) {
                error = "could not crop image";
                return;
            }
            const blob: Blob | null = await new Promise((resolve) =>
                canvas.toBlob(resolve, "image/webp", quality),
            );
            if (!blob) {
                error = "could not encode webp";
                return;
            }
            const bytes = new Uint8Array(await blob.arrayBuffer());
            onsave(bytes, "image/webp");
            onclose();
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            busy = false;
        }
    }

    function cleanup(): void {
        if (cropper) {
            cropper.destroy();
            cropper = undefined;
        }
        if (imageUrl) {
            URL.revokeObjectURL(imageUrl);
            imageUrl = undefined;
        }
        cropperReady = false;
    }

    onDestroy(cleanup);
</script>

<!-- cropperjs v2 uses web components with encapsulated shadow-DOM styles;
     no external <link> or CSS import is needed -->

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

        <div class="bg-canvas flex min-h-80 items-center justify-center p-3">
            {#if imageUrl}
                <img bind:this={imgEl} src={imageUrl} alt="" class="block max-h-full max-w-full" />
            {:else}
                <p class="text-fg-muted text-sm">loading...</p>
            {/if}
        </div>

        {#if !cropperReady && !error}
            <p class="text-fg-muted px-5 py-1 text-xs">initialising cropper…</p>
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
                disabled={busy || !cropperReady}
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
