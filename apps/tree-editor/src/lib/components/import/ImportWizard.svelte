<!--
    FamilyTreeEditor - Import wizard: drag-drop a file, set a tree name,
    choose replace-or-merge, confirm with the Import button.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { Upload, FileText, X } from "@lucide/svelte";
    import { Button, dockStore } from "@attu/ui";
    import { composeImports } from "$lib/io/import/composeImports";
    import { importFile, type ImportPayload } from "$lib/io/importFile";
    import { persistImportPayload, type ImportApplyMode } from "$lib/io/persistImportPayload";
    import type { Tree } from "$lib/domain/types";
    import type { TreeStore } from "$lib/state/tree.svelte";

    interface Props {
        store: TreeStore;
        currentTree: Tree | undefined;
        /** the host knows whether the active tree is a real user-edited one
         *  vs the placeholder seed. when false, the replace/merge radio is
         *  hidden and the wizard treats this as a fresh import. */
        currentTreeDirty: boolean;
        initialFile?: File | undefined;
        onsuccess: (info: { treeId: string; sourceFormat: string; count: number }) => void;
        onfailure?: ((message: string) => void) | undefined;
        /** invoked when the user picks "replace" while a tree is open; the
         *  host saves the current tree first, then this wizard applies the
         *  import. resolves once the host considers the save complete. */
        onsaveCurrent?: (() => Promise<void>) | undefined;
    }

    const {
        store,
        currentTree,
        currentTreeDirty,
        initialFile,
        onsuccess,
        onfailure,
        onsaveCurrent,
    }: Props = $props();

    interface Row {
        id: string;
        file: File;
        payload?: ImportPayload;
        error?: string;
    }

    let rowSeq = 0;
    function newRowId(): string {
        rowSeq += 1;
        return `r${String(rowSeq)}`;
    }

    let rows = $state<Row[]>([]);
    let treeName = $state("");
    // when no tree is open (or only the empty seed), "replace" is the only
    // sensible mode and the radio is hidden
    let mode = $state<"replace" | "merge">("replace");
    let busy = $state(false);
    let dragHover = $state(false);

    const hasOpenTree = $derived(currentTreeDirty);
    const parsedRows = $derived(rows.filter((r) => r.payload !== undefined));
    const canImport = $derived(parsedRows.length > 0 && !busy);

    async function addFile(file: File): Promise<void> {
        const id = newRowId();
        // append a placeholder row (parsing...) and reassign so $derived
        // recomputes immediately
        rows = [...rows, { id, file }];
        const result = await importFile(file);
        const final: Row = result.ok
            ? { id, file, payload: result.value }
            : { id, file, error: result.error };
        // replace by id so the new payload propagates through $derived even
        // if the Svelte 5 proxy makes the placeholder object reference shift.
        rows = rows.map((r) => (r.id === id ? final : r));
        if (result.ok && !treeName) treeName = result.value.tree.name;
    }

    function removeRow(id: string): void {
        rows = rows.filter((r) => r.id !== id);
        if (rows.length === 0) treeName = "";
    }

    async function onDrop(e: DragEvent): Promise<void> {
        e.preventDefault();
        dragHover = false;
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        for (const file of Array.from(files)) await addFile(file);
    }

    function onDragOver(e: DragEvent): void {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        dragHover = true;
    }

    function onDragLeave(): void {
        dragHover = false;
    }

    async function onBrowse(e: Event): Promise<void> {
        const input = e.currentTarget as HTMLInputElement;
        const picked = input.files;
        if (!picked) return;
        for (const file of Array.from(picked)) await addFile(file);
        input.value = "";
    }

    async function onImport(): Promise<void> {
        if (!canImport) return;
        const payloads = parsedRows
            .map((r) => r.payload)
            .filter((p): p is ImportPayload => p !== undefined);
        if (payloads.length === 0) return;
        busy = true;
        try {
            // user clarified: "replace" means save the current tree first,
            // then open the new one. The host owns the autosave/flush.
            if (mode === "replace" && hasOpenTree && onsaveCurrent) {
                await onsaveCurrent();
            }
            // fold multi-file imports into one payload before persisting.
            // single-file imports pass through unchanged.
            const composed = composeImports(payloads);
            const applyMode: ImportApplyMode =
                mode === "merge" && hasOpenTree && currentTree
                    ? { kind: "merge", into: currentTree }
                    : { kind: "replace" };
            const result = await persistImportPayload({
                payload: composed.payload,
                treeName,
                mode: applyMode,
                store,
            });
            onsuccess({
                treeId: result.treeId,
                sourceFormat: composed.payload.sourceFormat,
                count: composed.payload.count,
            });
            dockStore.closeDialog();
        } catch (e) {
            onfailure?.(String(e));
            busy = false;
        }
    }

    $effect(() => {
        if (initialFile) void addFile(initialFile);
    });
</script>

<div class="flex flex-col gap-4" data-testid="import-wizard">
            <!-- drop zone -->
            <div
                class="border-line flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed px-4 py-8 transition-colors"
                class:border-accent={dragHover}
                class:bg-canvas={!dragHover}
                role="region"
                aria-label="file drop zone"
                ondrop={onDrop}
                ondragover={onDragOver}
                ondragleave={onDragLeave}
                data-testid="import-drop-zone"
            >
                <Upload size={20} class="text-fg-muted" />
                <p class="text-fg-muted text-xs">drop files here, or</p>
                <label class="text-accent hover:underline cursor-pointer text-xs">
                    browse
                    <input
                        type="file"
                        class="sr-only"
                        accept=".txt,.ged,.gedcom,.gdz,.zip,.html,.htm"
                        onchange={onBrowse}
                        data-testid="import-browse"
                    />
                </label>
                <p class="text-fg-muted text-[10px]">
                    familyscript .txt &middot; gedcom .ged &middot; gedzip .gdz &middot; family echo
                    .html
                </p>
            </div>

            <!-- file rows -->
            {#if rows.length > 0}
                <ul class="flex flex-col gap-1" data-testid="import-rows">
                    {#each rows as row (row.id)}
                        <li
                            class="border-line bg-canvas flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
                            class:border-red-500={row.error !== undefined}
                            data-testid="import-row"
                        >
                            <FileText size={14} class="text-fg-muted shrink-0" />
                            <span class="flex-1 truncate" title={row.file.name}
                                >{row.file.name}</span
                            >
                            {#if row.payload}
                                <span class="text-fg-muted shrink-0 font-mono text-[10px] uppercase"
                                    >{row.payload.sourceFormat}</span
                                >
                                <span class="text-fg-muted shrink-0"
                                    >{row.payload.count} people</span
                                >
                                {#if row.payload.portraits.length > 0}
                                    <span class="text-fg-muted shrink-0"
                                        >{row.payload.portraits.length} portraits</span
                                    >
                                {/if}
                            {:else if row.error}
                                <span class="shrink-0 text-red-500">{row.error}</span>
                            {:else}
                                <span class="text-fg-muted shrink-0 italic">parsing…</span>
                            {/if}
                            <button
                                type="button"
                                class="text-fg-muted hover:text-fg shrink-0"
                                aria-label="remove"
                                onclick={() => removeRow(row.id)}
                                disabled={busy}
                            >
                                <X size={12} />
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}

            <!-- name field -->
            {#if parsedRows.length > 0}
                <label class="flex flex-col gap-1 text-xs">
                    <span class="text-fg-muted">tree name</span>
                    <input
                        type="text"
                        class="border-line bg-canvas focus:border-accent rounded border px-2 py-1.5 text-sm outline-none"
                        bind:value={treeName}
                        placeholder="imported tree"
                        spellcheck="false"
                        data-testid="import-name"
                    />
                </label>
            {/if}

            <!-- replace / merge radio (only when a tree is already open) -->
            {#if hasOpenTree && parsedRows.length > 0}
                <fieldset class="flex flex-col gap-1 text-xs">
                    <legend class="text-fg-muted">target</legend>
                    <label class="flex items-center gap-2">
                        <input
                            type="radio"
                            name="import-mode"
                            value="replace"
                            bind:group={mode}
                            data-testid="import-mode-replace"
                        />
                        <span>save current and open the imported tree</span>
                    </label>
                    <label class="flex items-center gap-2">
                        <input
                            type="radio"
                            name="import-mode"
                            value="merge"
                            bind:group={mode}
                            data-testid="import-mode-merge"
                        />
                        <span>merge into the current tree</span>
                    </label>
                </fieldset>
            {/if}

    <footer class="border-line flex items-center justify-end gap-2 border-t px-5 py-3">
        <Button onclick={() => dockStore.closeDialog()} disabled={busy}>cancel</Button>
        <span data-testid="import-confirm-wrap">
            <Button variant="primary" onclick={onImport} disabled={!canImport}>import</Button>
        </span>
    </footer>
</div>
