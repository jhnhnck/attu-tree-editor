<!--
    FamilyTreeEditor - Open tree body: searchable list + preview + open/delete
    body-only component: wrapped in DockModal by the caller.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onMount } from "svelte";
    import { FolderOpen, Search, Trash2, Link as LinkIcon } from "@lucide/svelte";
    import { loadTree, type TreeListing } from "$lib/persistence/trees";
    import type { Tree } from "$lib/domain/types";
    import { Button, dockStore } from "@attu/ui";

    interface Props {
        listings: readonly TreeListing[];
        activeId: string | undefined;
        onpick: (id: string) => void;
        ondelete: (id: string) => Promise<void> | void;
        onnotice?: ((msg: string) => void) | undefined;
    }

    const { listings, activeId, onpick, ondelete, onnotice }: Props = $props();

    let query = $state("");
    let userPickedId = $state<string | undefined>(undefined);
    let userCleared = $state(false);
    // selection: explicit user pick wins, else fall back to active tree if in
    // the listings, else the first (most-recent) row. derived so a delete that
    // shrinks `listings` re-evaluates without us needing to wire a $effect.
    const selectedId = $derived<string | undefined>(
        userCleared
            ? userPickedId
            : (userPickedId ?? listings.find((l) => l.id === activeId)?.id ?? listings[0]?.id),
    );
    // session cache so reselecting a row doesn't refetch
    const previewCache = new Map<string, Tree>();
    let previewing = $state(false);
    let previewError = $state<string | undefined>(undefined);
    let previewTree = $state<Tree | undefined>(undefined);

    onMount(() => {
        if (selectedId) void loadPreview(selectedId);
    });

    const filtered = $derived(
        listings.filter((t) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return (t.name || "untitled").toLowerCase().includes(q);
        }),
    );

    async function loadPreview(id: string): Promise<void> {
        const cached = previewCache.get(id);
        if (cached) {
            previewTree = cached;
            previewError = undefined;
            previewing = false;
            return;
        }
        previewing = true;
        previewError = undefined;
        previewTree = undefined;
        const r = await loadTree(id);
        previewing = false;
        if (!r.ok) {
            previewError = r.error;
            return;
        }
        previewCache.set(id, r.value.tree);
        previewTree = r.value.tree;
    }

    function selectRow(id: string): void {
        userPickedId = id;
        userCleared = false;
        void loadPreview(id);
    }

    function fmtRel(ts: number): string {
        const ms = Date.now() - ts;
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${String(s)}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${String(m)}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${String(h)}h ago`;
        const d = Math.floor(h / 24);
        return `${String(d)}d ago`;
    }

    function fullName(p: { given: string; surname?: string }): string {
        return [p.given, p.surname].filter(Boolean).join(" ").trim() || "(unnamed)";
    }

    const previewSummary = $derived.by(() => {
        if (!previewTree) return undefined;
        const people = Object.values(previewTree.people);
        const root = previewTree.people[previewTree.rootId];
        const samples = people.slice(0, 3);
        return {
            count: people.length,
            rootName: root ? fullName(root) : undefined,
            samples: samples.map(fullName),
        };
    });

    function openSelected(): void {
        if (!selectedId) return;
        onpick(selectedId);
        dockStore.closeModal();
    }

    async function deleteSelected(): Promise<void> {
        const id = selectedId;
        if (!id) return;
        const t = listings.find((x) => x.id === id);
        if (!t) return;
        if (!confirm(`Delete "${t.name || "untitled"}"? This can't be undone.`)) return;
        await ondelete(id);
        previewCache.delete(id);
        // pick the next listing if any
        const remaining = listings.filter((x) => x.id !== id);
        const next = remaining[0]?.id;
        userPickedId = next;
        userCleared = true;
        if (next) void loadPreview(next);
        else previewTree = undefined;
    }

    function openFromUrl(): void {
        onnotice?.("Open from URL — coming soon");
    }
</script>

<div
    class="text-fg flex h-[70vh] w-full max-w-3xl flex-col"
    data-testid="open-dialog"
>
    <div class="flex flex-1 overflow-hidden">
        <!-- left pane: search + list -->
        <div class="border-line flex w-1/2 flex-col border-r">
            <div class="border-line border-b px-3 py-2">
                <label
                    class="border-line bg-canvas focus-within:border-accent flex items-center gap-2 rounded border px-2 py-1.5"
                >
                    <Search size={14} class="text-fg-muted shrink-0" />
                    <input
                        type="text"
                        class="text-fg placeholder:text-fg-muted flex-1 bg-transparent text-sm outline-none"
                        placeholder="search trees…"
                        bind:value={query}
                        spellcheck="false"
                        autocomplete="off"
                        aria-label="search trees"
                    />
                </label>
            </div>

            <div class="flex-1 overflow-y-auto">
                {#if filtered.length === 0}
                    <p class="text-fg-muted px-3 py-6 text-center text-xs italic">
                        {listings.length === 0
                            ? "no saved trees yet"
                            : "no trees match your search"}
                    </p>
                {:else}
                    <ul>
                        {#each filtered as t (t.id)}
                            <li>
                                <button
                                    type="button"
                                    data-testid="open-row"
                                    data-tree-id={t.id}
                                    class="border-line hover:bg-canvas/60 flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left"
                                    class:bg-accent={t.id === selectedId}
                                    class:text-canvas={t.id === selectedId}
                                    onclick={() => selectRow(t.id)}
                                    ondblclick={() => {
                                        selectRow(t.id);
                                        openSelected();
                                    }}
                                >
                                    <div class="flex w-full items-center gap-2">
                                        <span class="line-clamp-1 flex-1 text-sm font-medium">
                                            {t.name || "(untitled)"}
                                        </span>
                                        <!-- placeholder sync dot; per-tree status not tracked yet -->
                                        <span
                                            aria-hidden="true"
                                            class="bg-fg-muted/60 h-1.5 w-1.5 shrink-0 rounded-full"
                                            title="sync state unknown"
                                        ></span>
                                    </div>
                                    <span
                                        class="font-mono text-[10px]"
                                        class:text-fg-muted={t.id !== selectedId}
                                        class:text-canvas={t.id === selectedId}
                                    >
                                        {String(t.personCount)} people · {fmtRel(t.updatedAt)}
                                    </span>
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        </div>

        <!-- right pane: preview -->
        <div class="flex w-1/2 flex-col overflow-y-auto px-5 py-4" data-testid="open-preview">
            {#if !selectedId}
                <p class="text-fg-muted text-xs italic">select a tree to preview</p>
            {:else if previewing}
                <p class="text-fg-muted text-xs">loading…</p>
            {:else if previewError}
                <p class="text-error text-xs">preview failed: {previewError}</p>
            {:else if previewSummary}
                {@const t = listings.find((x) => x.id === selectedId)}
                <h3 class="text-fg mb-1 text-sm font-semibold">
                    {t?.name || "(untitled)"}
                </h3>
                <p class="text-fg-muted mb-3 text-xs">
                    {String(previewSummary.count)} people
                    {#if t}
                        · updated {fmtRel(t.updatedAt)}
                    {/if}
                </p>

                {#if previewSummary.rootName}
                    <dl class="text-fg mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        <dt class="text-fg-muted">root</dt>
                        <dd>{previewSummary.rootName}</dd>
                    </dl>
                {/if}

                {#if previewSummary.samples.length > 0}
                    <div class="text-xs">
                        <p class="text-fg-muted mb-1">sample people</p>
                        <ul class="space-y-0.5">
                            {#each previewSummary.samples as name (name)}
                                <li class="text-fg">{name}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            {/if}
        </div>
    </div>

    <footer
        class="border-line flex items-center justify-between gap-2 border-t px-5 py-3 text-sm"
    >
        <button
            type="button"
            class="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 text-xs"
            onclick={openFromUrl}
            data-testid="open-from-url"
        >
            <LinkIcon size={12} />
            open from URL…
        </button>

        <div class="flex items-center gap-2">
            <Button
                type="button"
                variant="danger"
                disabled={!selectedId}
                onclick={() => void deleteSelected()}
            >
                {#snippet children()}
                    <Trash2 size={14} class="mr-1" />
                    delete
                {/snippet}
            </Button>
            <Button type="button" variant="ghost" onclick={() => dockStore.closeModal()}>
                {#snippet children()}cancel{/snippet}
            </Button>
            <Button
                type="button"
                variant="primary"
                disabled={!selectedId}
                onclick={openSelected}
            >
                {#snippet children()}
                    <FolderOpen size={14} class="mr-1" />
                    open
                {/snippet}
            </Button>
        </div>
    </footer>
</div>
