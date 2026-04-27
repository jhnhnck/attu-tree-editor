<!--
    FamilyTreeEditor - thumbnail + upload control for a person's portrait
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { User } from "@lucide/svelte";
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
            // prime the cache before onchange so the derived re-evaluates
            // synchronously to the URL rather than waiting for an async DB re-read
            portraitUrls.prime(id, URL.createObjectURL(new Blob([bytes.slice()], { type: mime })));
            onchange(id);
        } catch (e) {
            onerror?.(e instanceof Error ? e.message : String(e));
        }
    }

    function onRemove(): void {
        onchange(undefined);
    }
</script>

<div class="flex flex-col gap-2">
    <div class="bg-canvas border-line aspect-square w-full overflow-hidden rounded border">
        {#if url}
            <img src={url} alt="" class="h-full w-full object-cover" />
        {:else}
            <div class="text-fg-muted flex h-full w-full flex-col items-center justify-center gap-2">
                <User size={40} strokeWidth={1.25} />
                <span class="text-[10px]">no portrait</span>
            </div>
        {/if}
    </div>
    <div class="flex gap-1.5">
        <button
            type="button"
            onclick={pickFile}
            class="text-fg bg-canvas border-line hover:border-accent inline-flex items-center rounded border px-2 py-1 text-xs"
        >
            {currentBlobId ? "replace" : "upload"}
        </button>
        {#if currentBlobId}
            <button
                type="button"
                onclick={onRemove}
                class="text-fg-muted bg-canvas border-line hover:border-accent hover:text-fg inline-flex items-center rounded border px-2 py-1 text-xs"
            >
                clear
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
