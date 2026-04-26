<!--
    FamilyTreeEditor - top-level shell: top bar + canvas + editor dialog
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { addPerson, createTree, linkParent, linkSpouse, updatePerson } from "$lib/domain/tree";
    import { createTreeStore } from "$lib/state/tree.svelte";
    import { createSelectionStore } from "$lib/state/selection.svelte";
    import { createToastsStore } from "$lib/state/toasts.svelte";
    import { detectFormat } from "$lib/io/detect";
    import { parseFamilyScript } from "$lib/io/familyscript/parse";
    import { parseGedcom } from "$lib/io/gedcom/parse";
    import { readBundle } from "$lib/io/bundle/read";
    import { writeBundle } from "$lib/io/bundle/write";
    import TreeCanvas from "$lib/components/tree/TreeCanvas.svelte";
    import PersonEditor from "$lib/components/editor/PersonEditor.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Toasts from "$lib/components/ui/Toasts.svelte";
    import ContextMenu, { type ContextMenuItem } from "$lib/components/ui/ContextMenu.svelte";
    import type { Person, PersonId } from "$lib/domain/types";

    function emptyTree() {
        return createTree("untitled", {
            given: "Root",
            surname: "",
            gender: "u",
            spouseIds: [],
            display: "z1",
        });
    }

    const treeStore = createTreeStore(emptyTree());
    const selection = createSelectionStore();
    const toasts = createToastsStore();

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
        const { tree, id: newId } = addPerson(t, blankPerson());
        const linked = linkParent(tree, newId, id);
        if (!linked.ok) {
            toasts.push(linked.error, "error");
            return;
        }
        treeStore.set(linked.value);
        selection.openEditor(newId);
    }

    function menuItems(personId: PersonId): ContextMenuItem[] {
        return [
            { label: "edit person", onclick: () => selection.openEditor(personId) },
            { label: "add parent", onclick: () => addParent(personId) },
            { label: "add partner", onclick: () => addPartner(personId) },
            { label: "add child", onclick: () => addChild(personId) },
        ];
    }

    async function onImport(e: Event): Promise<void> {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
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
        input.value = "";
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
            onselect={(id: string) => selection.select(id)}
            onedit={(id: string) => selection.openEditor(id)}
            oncontextmenu={(id: string, x: number, y: number) => {
                contextMenu = { personId: id, x, y };
            }}
        />
    </main>

    <PersonEditor person={editorPerson} onsave={onSave} onclose={() => selection.closeEditor()} />
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
