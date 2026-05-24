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

    // upper bound on incoming files. matches the inline error copy below.
    const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

    let pendingSource = $state<Blob | undefined>(undefined);
    let inputEl: HTMLInputElement | undefined = $state();
    // hover ring during drag-over; cleared on dragleave/drop.
    let dragHover = $state(false);
    // focus gate for the window-level paste listener so we don't intercept
    // pastes elsewhere in the inspector or document.
    let focused = $state(false);
    let rootEl: HTMLDivElement | undefined = $state();
    // stable ref on the upload/replace button so we can return focus there
    // after the cropper dialog closes. used by onDialogClose(); guarded for
    // staleness because a parent re-render (e.g., personId swap) can replace
    // the button mid-flight, leaving the ref pointing at a detached node.
    let replaceBtn: HTMLButtonElement | undefined = $state();

    let url = $derived(portraitUrls.get(currentBlobId));

    function pickFile(): void {
        inputEl?.click();
    }

    // shared admission gate: validates a candidate Blob/File and either opens
    // the cropper (returning true) or routes an error through onerror.
    function admitSource(f: Blob | File | null | undefined, label: string): boolean {
        if (!f) return false;
        if (!f.type.startsWith("image/")) {
            onerror?.(`expected an image ${label}, got ${f.type || "unknown"}`);
            return false;
        }
        if (f.size > MAX_SOURCE_BYTES) {
            const mb = (f.size / (1024 * 1024)).toFixed(1);
            onerror?.(`image is too large (${mb} mb, max 20 mb)`);
            return false;
        }
        pendingSource = f;
        return true;
    }

    function onFile(e: Event): void {
        const t = e.currentTarget as HTMLInputElement;
        const ok = admitSource(t.files?.[0], "file");
        if (!ok) {
            t.value = "";
            return;
        }
        t.value = ""; // allow picking the same file again later
    }

    function onDragOver(e: DragEvent): void {
        // only meaningful when a file is being dragged; pre-flight via dataTransfer.types
        if (!e.dataTransfer) return;
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        dragHover = true;
    }

    function onDragLeave(): void {
        dragHover = false;
    }

    function onDrop(e: DragEvent): void {
        dragHover = false;
        if (!e.dataTransfer) return;
        const f = e.dataTransfer.files?.[0];
        if (!f) return;
        e.preventDefault();
        admitSource(f, "drop");
    }

    // window-level paste listener: only handles paste when the field has focus,
    // so other inspector inputs keep their default paste behavior.
    function onPaste(e: ClipboardEvent): void {
        if (!focused) return;
        if (!e.clipboardData) return;
        for (const item of e.clipboardData.items) {
            if (item.kind === "file" && item.type.startsWith("image/")) {
                const f = item.getAsFile();
                if (admitSource(f, "paste")) {
                    e.preventDefault();
                }
                return;
            }
        }
    }

    function onFocusIn(): void {
        focused = true;
    }

    function onFocusOut(e: FocusEvent): void {
        // re-check on the next tick: focus may have moved to a child element.
        const next = e.relatedTarget as Node | null;
        if (next && rootEl?.contains(next)) return;
        focused = false;
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

    // restore focus to the upload/replace button when the cropper dialog closes
    // so the keyboard user lands somewhere meaningful. if the stable ref has
    // gone stale (parent re-rendered, e.g., personId swapped while open), warn
    // loudly in dev rather than silently leaking focus to document.body —
    // matches pre-mortem risk #6.
    function onDialogClose(): void {
        pendingSource = undefined;
        if (replaceBtn && replaceBtn.isConnected) {
            replaceBtn.focus();
        } else if (import.meta.env.DEV) {
            console.warn(
                "PortraitField: replace-button ref stale on dialog close; focus not restored",
            );
        }
    }
</script>

<svelte:window onpaste={onPaste} />

<!-- compact layout: 80px square thumbnail with buttons stacked beside it.
     keeps drag/drop + paste over the whole region (thumb + buttons). -->
<div
    bind:this={rootEl}
    class="flex items-start gap-3"
    tabindex="-1"
    role="region"
    aria-label="portrait"
    onfocusin={onFocusIn}
    onfocusout={onFocusOut}
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
>
    <button
        type="button"
        onclick={pickFile}
        aria-label={currentBlobId ? "replace portrait" : "upload portrait"}
        class="bg-canvas border-line hover:border-accent h-20 w-20 flex-none overflow-hidden rounded border transition-shadow focus:outline-none focus-visible:border-accent"
        class:drag-hover={dragHover}
    >
        {#if url}
            <img src={url} alt="" class="h-full w-full object-cover" />
        {:else}
            <div
                class="text-fg-muted flex h-full w-full flex-col items-center justify-center gap-1"
            >
                <User size={28} strokeWidth={1.25} />
                <span class="text-[9px] leading-none">no portrait</span>
            </div>
        {/if}
    </button>
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <button
            bind:this={replaceBtn}
            type="button"
            onclick={pickFile}
            class="text-fg bg-canvas border-line hover:border-accent inline-flex w-fit items-center rounded border px-2 py-1 text-xs"
        >
            {currentBlobId ? "replace" : "upload"}
        </button>
        {#if currentBlobId}
            <button
                type="button"
                onclick={onRemove}
                class="text-fg-muted bg-canvas border-line hover:border-accent hover:text-fg inline-flex w-fit items-center rounded border px-2 py-1 text-xs"
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
    onclose={onDialogClose}
/>

<style>
    .drag-hover {
        border-color: var(--color-accent);
        box-shadow: 0 0 0 2px rgb(from var(--color-accent) r g b / 0.4);
    }
</style>
