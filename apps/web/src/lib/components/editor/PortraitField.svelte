<!--
    FamilyTreeEditor - thumbnail + upload control for a person's portrait
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { putBlob } from "$lib/persistence/blobs";
    import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";
    import CropperDialog from "$lib/components/editor/CropperDialog.svelte";

    interface Props {
        treeId: string;
        personId: string;
        currentBlobId: string | undefined;
        portraitUrls: PortraitUrlCache;
        /** called with the new blob id (or undefined to clear) */
        onchange: (blobId: string | undefined) => void;
        onerror?: (msg: string) => void;
    }

    let { treeId, personId, currentBlobId, portraitUrls, onchange, onerror }: Props = $props();

    let pendingSource = $state<Blob | undefined>(undefined);
    let inputEl: HTMLInputElement | undefined = $state();

    let url = $derived(portraitUrls.get(currentBlobId));

    function pickFile(): void {
        inputEl?.click();
    }

    function onFile(e: Event): void {
        const t = e.currentTarget as HTMLInputElement;
        const f = t.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) {
            onerror?.(`expected an image file, got ${f.type || "unknown"}`);
            t.value = "";
            return;
        }
        pendingSource = f;
        t.value = ""; // allow picking the same file again later
    }

    async function onCropped(bytes: Uint8Array, mime: string): Promise<void> {
        try {
            const id = await putBlob({ treeId, personId, mime, bytes });
            onchange(id);
        } catch (e) {
            onerror?.(e instanceof Error ? e.message : String(e));
        }
    }

    function onRemove(): void {
        onchange(undefined);
    }
</script>

<div class="flex items-start gap-3">
    <div class="bg-canvas border-line aspect-square w-20 shrink-0 overflow-hidden rounded border">
        {#if url}
            <img src={url} alt="" class="h-full w-full object-cover" />
        {:else}
            <span class="text-fg-muted flex h-full w-full items-center justify-center text-[10px]">
                no portrait
            </span>
        {/if}
    </div>
    <div class="flex flex-col gap-1.5">
        <button
            type="button"
            onclick={pickFile}
            class="text-fg bg-canvas border-line hover:border-accent inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
        >
            {currentBlobId ? "replace..." : "upload..."}
        </button>
        {#if currentBlobId}
            <button
                type="button"
                onclick={onRemove}
                class="text-fg-muted hover:text-fg text-left text-xs underline-offset-2 hover:underline"
            >
                remove portrait
            </button>
        {/if}
    </div>
    <input bind:this={inputEl} type="file" class="sr-only" accept="image/*" onchange={onFile} />
</div>

<CropperDialog
    source={pendingSource}
    onsave={(bytes: Uint8Array, mime: string) => void onCropped(bytes, mime)}
    onclose={() => (pendingSource = undefined)}
/>
