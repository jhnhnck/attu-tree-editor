<!--
    FamilyTreeEditor - top-level shell: top bar + canvas + editor dialog
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onMount } from "svelte";
    import {
        addPerson,
        createTree,
        linkParent,
        linkSpouse,
        removePerson,
        updatePerson,
    } from "$lib/domain/tree";
    import { createTreeStore } from "$lib/state/tree.svelte";
    import { createSelectionStore } from "$lib/state/selection.svelte";
    import { createToastsStore } from "$lib/state/toasts.svelte";
    import { createPortraitUrlCache } from "$lib/state/portraitUrls.svelte";
    import { makeAutosaver } from "$lib/state/autosave";
    import { detectFormat } from "$lib/io/detect";
    import { parseFamilyScript } from "$lib/io/familyscript/parse";
    import { parseGedcom } from "$lib/io/gedcom/parse";
    import { readBundle } from "$lib/io/bundle/read";
    import { writeBundle } from "$lib/io/bundle/write";
    import {
        deleteTree as deletePersistedTree,
        listTrees,
        loadTree,
        type TreeListing,
    } from "$lib/persistence/trees";
    import { SETTING_KEYS, getSetting, setSetting } from "$lib/persistence/settings";
    import TreeCanvas from "$lib/components/tree/TreeCanvas.svelte";
    import PersonEditor from "$lib/components/editor/PersonEditor.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Toasts from "$lib/components/ui/Toasts.svelte";
    import ContextMenu, { type ContextMenuItem } from "$lib/components/ui/ContextMenu.svelte";
    import RecentTrees from "$lib/components/shell/RecentTrees.svelte";
    import type { Person, PersonId } from "$lib/domain/types";

    const PLACEHOLDERS = [
        { given: "Korak", surname: "Nokar", gender: "m" as const },
        { given: "Marai", surname: "Nokar", gender: "f" as const },
        { given: "Banchar", surname: "Nokar", gender: "u" as const },
    ] as const;

    function emptyTree() {
        const root = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]!;
        return createTree("untitled", { ...root, spouseIds: [], display: "z1" });
    }

    const treeStore = createTreeStore(emptyTree());
    const selection = createSelectionStore();
    const toasts = createToastsStore();
    const portraitUrls = createPortraitUrlCache();

    let recents = $state<TreeListing[]>([]);
    let firstLoadComplete = $state(false);

    async function refreshRecents(): Promise<void> {
        recents = await listTrees(20);
    }

    const autosaver = makeAutosaver({
        onError: (msg) => toasts.push(`autosave failed: ${msg}`, "error"),
        onSaved: () => {
            void refreshRecents();
        },
    });

    onMount(async () => {
        try {
            const lastId = await getSetting<string>(SETTING_KEYS.lastOpenedTreeId);
            if (lastId) {
                const r = await loadTree(lastId);
                if (r.ok) treeStore.hydrate(r.value);
            }
            await refreshRecents();
        } catch (e) {
            toasts.push(`failed to load saved trees: ${String(e)}`, "error");
        } finally {
            firstLoadComplete = true;
        }
    });

    // schedule a save whenever the user mutates the active tree
    $effect(() => {
        const tree = treeStore.tree;
        const dirty = treeStore.dirty;
        if (!firstLoadComplete) return;
        if (!dirty) return;
        autosaver.schedule(tree);
    });

    async function loadFromRecents(id: string): Promise<void> {
        await autosaver.flush();
        const r = await loadTree(id);
        if (!r.ok) {
            toasts.push(`could not load tree: ${r.error}`, "error");
            return;
        }
        portraitUrls.clear();
        treeStore.hydrate(r.value);
        await setSetting(SETTING_KEYS.lastOpenedTreeId, id);
        toasts.push(`loaded ${r.value.name || "untitled"}`, "info", 3000);
    }

    async function startNewTree(): Promise<void> {
        await autosaver.flush();
        portraitUrls.clear();
        treeStore.reset(emptyTree());
        toasts.push("started a new tree", "info", 3000);
    }

    async function removeTree(id: string): Promise<void> {
        await deletePersistedTree(id);
        toasts.push("tree deleted", "info", 3000);
        if (treeStore.tree.id === id) {
            treeStore.reset(emptyTree());
        }
        await refreshRecents();
    }

    let editorPerson = $derived<Person | undefined>(
        selection.editorOpenFor ? treeStore.tree.people[selection.editorOpenFor] : undefined,
    );

    interface MenuState {
        personId: PersonId;
        x: number;
        y: number;
    }
    let contextMenu = $state<MenuState | undefined>(undefined);

    function blankPerson(): Omit<Person, "id"> {
        return {
            given: "New",
            surname: "Person",
            gender: "u",
            spouseIds: [],
            display: "z1",
        };
    }

    function addParent(id: PersonId): void {
        const t = treeStore.tree;
        const { tree, id: newId } = addPerson(t, blankPerson());
        const linked = linkParent(tree, id, newId);
        if (!linked.ok) {
            toasts.push(linked.error, "error");
            return;
        }
        treeStore.set(linked.value);
        selection.openEditor(newId);
    }

    function addPartner(id: PersonId): void {
        const t = treeStore.tree;
        const { tree, id: newId } = addPerson(t, blankPerson());
        const linked = linkSpouse(tree, id, newId);
        if (!linked.ok) {
            toasts.push(linked.error, "error");
            return;
        }
        treeStore.set(linked.value);
        selection.openEditor(newId);
    }

    function addChild(id: PersonId): void {
        const t = treeStore.tree;
        const parent = t.people[id];
        if (!parent) return;
        const { tree, id: newId } = addPerson(t, blankPerson());
        // attribute the new child to the parent
        const linkedOne = linkParent(tree, newId, id);
        if (!linkedOne.ok) {
            toasts.push(linkedOne.error, "error");
            return;
        }
        // if the parent has exactly one partner, default the new child to that
        // couple too. avoids relatives-tree's "parent in two distinct families"
        // crash and matches what the user almost always wants in a 2-parent tree.
        let next = linkedOne.value;
        if (parent.spouseIds.length === 1) {
            const partnerId = parent.spouseIds[0];
            if (partnerId && partnerId !== id && next.people[partnerId]) {
                const linkedTwo = linkParent(next, newId, partnerId);
                if (linkedTwo.ok) next = linkedTwo.value;
            }
        }
        treeStore.set(next);
        selection.openEditor(newId);
    }

    function deletePerson(id: PersonId): void {
        treeStore.update((t) => {
            const next = removePerson(t, id);
            // if we just deleted the root, reassign rootId to any surviving person
            if (next.rootId === id) {
                const fallback = Object.keys(next.people)[0];
                return fallback ? { ...next, rootId: fallback } : next;
            }
            return next;
        });
        if (selection.selectedPersonId === id) selection.select(undefined);
    }

    function menuItems(personId: PersonId): ContextMenuItem[] {
        return [
            { label: "edit person", onclick: () => selection.openEditor(personId) },
            { label: "add parent", onclick: () => addParent(personId) },
            { label: "add partner", onclick: () => addPartner(personId) },
            { label: "add child", onclick: () => addChild(personId) },
            { label: "delete person", onclick: () => deletePerson(personId) },
        ];
    }

    async function onImport(e: Event): Promise<void> {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const loadingId = toasts.push(`reading ${file.name}…`, "info", 60_000);
        try {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const format = detectFormat({
                filename: file.name,
                firstBytes: bytes.subarray(0, 8),
                firstChars: new TextDecoder().decode(bytes.subarray(0, 32)),
            });

            if (format === "gedzip") {
                const r = readBundle(bytes);
                if (!r.ok) {
                    toasts.push(`import failed: ${r.error}`, "error");
                    return;
                }
                treeStore.reset(r.value.tree);
                toasts.push(
                    `loaded ${String(Object.keys(r.value.tree.people).length)} people from ${file.name}`,
                    "success",
                );
            } else if (format === "gedcom") {
                const text = new TextDecoder().decode(bytes);
                const r = parseGedcom(text);
                if (!r.ok) {
                    toasts.push(`import failed: ${r.error}`, "error");
                    return;
                }
                treeStore.reset(r.value.tree);
                toasts.push(
                    `loaded ${String(Object.keys(r.value.tree.people).length)} people from ${file.name}`,
                    "success",
                );
            } else if (format === "familyscript") {
                const text = new TextDecoder().decode(bytes);
                const r = parseFamilyScript(text);
                if (!r.ok) {
                    toasts.push(`import failed: ${r.error}`, "error");
                    return;
                }
                treeStore.reset(r.value.tree);
                toasts.push(
                    `loaded ${String(Object.keys(r.value.tree.people).length)} people from ${file.name}`,
                    "success",
                );
            } else {
                toasts.push(`unrecognized file format: ${file.name}`, "error");
            }
        } catch (err) {
            toasts.push(`import error: ${String(err)}`, "error");
        } finally {
            toasts.dismiss(loadingId);
            input.value = "";
        }
    }

    function onExport(): void {
        const bytes = writeBundle({ tree: treeStore.tree });
        const blob = new Blob([new Uint8Array(bytes)], {
            type: "application/vnd.familysearch.gedcom+zip",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${treeStore.tree.name || "tree"}.gdz`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function onSave(id: string, patch: Partial<Person>): void {
        treeStore.update((t) => updatePerson(t, id, patch));
    }
</script>

<div class="bg-canvas text-fg flex h-dvh flex-col">
    <header class="border-line bg-canvas-elev flex items-center gap-2 border-b px-3 py-2">
        <h1 class="text-fg mr-auto text-sm font-semibold tracking-wide">family tree editor</h1>

        <Button
            type="button"
            variant="ghost"
            disabled={!treeStore.canUndo}
            onclick={() => treeStore.undo()}
        >
            {#snippet children()}undo{/snippet}
        </Button>
        <Button
            type="button"
            variant="ghost"
            disabled={!treeStore.canRedo}
            onclick={() => treeStore.redo()}
        >
            {#snippet children()}redo{/snippet}
        </Button>

        <RecentTrees
            listings={recents}
            activeId={treeStore.tree.id}
            onpick={(id: string) => void loadFromRecents(id)}
            onnew={() => void startNewTree()}
            ondelete={(id: string) => void removeTree(id)}
        />

        <label
            class="text-fg hover:bg-canvas focus-within:outline-accent inline-flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm font-medium focus-within:outline-2"
        >
            import
            <input
                type="file"
                class="sr-only"
                accept=".txt,.ged,.gedcom,.gdz,.zip"
                onchange={onImport}
                data-testid="import-input"
            />
        </label>

        <Button type="button" variant="primary" onclick={onExport}>
            {#snippet children()}export .gdz{/snippet}
        </Button>
    </header>

    <main class="flex-1 overflow-hidden">
        <TreeCanvas
            tree={treeStore.tree}
            selectedId={selection.selectedPersonId}
            {portraitUrls}
            onselect={(id: string) => selection.select(id)}
            ondeselect={() => selection.select(undefined)}
            onedit={(id: string) => selection.openEditor(id)}
            oncontextmenu={(id: string, x: number, y: number) => {
                contextMenu = { personId: id, x, y };
            }}
        />
    </main>

    <PersonEditor
        person={editorPerson}
        treeId={treeStore.tree.id}
        {portraitUrls}
        onsave={onSave}
        onerror={(msg: string) => toasts.push(msg, "error")}
        onclose={() => selection.closeEditor()}
    />
    <Toasts store={toasts} />
    {#if contextMenu}
        <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={menuItems(contextMenu.personId)}
            onclose={() => (contextMenu = undefined)}
        />
    {/if}
</div>
