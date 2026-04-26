<!--
    FamilyTreeEditor - top-level shell: title strip + menu bar + canvas + editor dialog
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onMount } from "svelte";
    import {
        FilePlus,
        FolderOpen,
        Save,
        Upload,
        Download,
        Trash2,
        Undo2,
        Redo2,
        Search,
        Command,
        Settings,
        Maximize2,
        ZoomIn,
        ZoomOut,
        Hand,
        MousePointer2,
        Focus,
        Home as HomeIcon,
        UserPlus,
        Heart,
        Baby,
        UserPlus2,
        SidebarOpen,
        Pencil,
        Crown,
        BarChart3,
        RefreshCw,
        Keyboard,
        Info,
        HelpCircle,
        Share2,
        Shield,
        TreePine,
    } from "@lucide/svelte";

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
    import { authStore } from "$lib/state/auth.svelte";
    import { syncStore } from "$lib/state/sync.svelte";
    import { onUnauthorized, trees as treesApi } from "$lib/api/client";
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
    import { installShortcuts, type ShortcutBinding } from "$lib/keyboard";
    import { SHORTCUTS } from "$lib/shortcuts";

    import TreeCanvas from "$lib/components/tree/TreeCanvas.svelte";
    import PersonEditor from "$lib/components/editor/PersonEditor.svelte";
    import Toasts from "$lib/components/ui/Toasts.svelte";
    import ContextMenu, { type ContextMenuItem } from "$lib/components/ui/ContextMenu.svelte";
    import RecentTrees from "$lib/components/shell/RecentTrees.svelte";
    import AuthBar from "$lib/components/shell/AuthBar.svelte";
    import ShareDialog from "$lib/components/shell/ShareDialog.svelte";
    import AdminPanel from "$lib/components/shell/AdminPanel.svelte";
    import MenuBar from "$lib/components/shell/MenuBar.svelte";
    import type { MenuConfig, MenuEntry } from "$lib/components/shell/menu";
    import ShortcutsOverlay from "$lib/components/help/ShortcutsOverlay.svelte";
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
    let showShare = $state(false);
    let showAdmin = $state(false);
    let showHelp = $state(false);

    // read-only mode: set when loading a tree via /view/<uuid> route
    let readOnly = $state(false);

    // hidden file input we trigger from File > Import (or Mod+I)
    let importInputEl: HTMLInputElement | undefined = $state();

    // inline-rename state for the title in the title strip
    let titleEl: HTMLInputElement | undefined = $state();
    let titleDraft = $state("");
    let titleEditing = $state(false);

    async function refreshRecents(): Promise<void> {
        recents = await listTrees(20);
    }

    const autosaver = makeAutosaver({
        onError: (msg) => toasts.push(`autosave failed: ${msg}`, "error"),
        onSaved: () => {
            void refreshRecents();
            syncStore.onLocalSave(treeStore.tree);
        },
    });

    onUnauthorized(() => {
        authStore.clear();
    });

    onMount(async () => {
        const viewMatch = /\/view\/([^/?#]+)/.exec(window.location.pathname);
        if (viewMatch?.[1]) {
            await loadViewRoute(viewMatch[1]);
            firstLoadComplete = true;
            return;
        }

        await authStore.fetch();

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

    async function loadViewRoute(treeId: string): Promise<void> {
        readOnly = true;
        if (!authStore.user) await authStore.fetch();
        if (!authStore.user) {
            toasts.push("sign in to view this tree", "info", 0);
            return;
        }
        try {
            const r = await treesApi.get(treeId);
            treeStore.hydrate(r.blob as ReturnType<typeof createTree>);
            syncStore.setRevision(r.revision);
            toasts.push(`viewing: ${r.name || "untitled"} (read-only)`, "info", 5000);
        } catch {
            toasts.push("could not load that tree (no access or not found)", "error");
        }
    }

    $effect(() => {
        const tree = treeStore.tree;
        const dirty = treeStore.dirty;
        if (!firstLoadComplete) return;
        if (!dirty) return;
        if (readOnly) return;
        autosaver.schedule(tree);
    });

    $effect(() => {
        if (syncStore.mode === "conflict" && syncStore.conflict) {
            toasts.push(
                "save conflict: another client wrote a newer version. your local version is preserved.",
                "error",
                0,
            );
        }
    });

    async function loadFromRecents(id: string): Promise<void> {
        await autosaver.flush();
        const r = await loadTree(id);
        if (!r.ok) {
            console.error("[tree] load failed %s:", id, r.error);
            toasts.push(`could not load tree: ${r.error}`, "error");
            return;
        }
        portraitUrls.clear();
        readOnly = false;
        treeStore.hydrate(r.value);
        // drop any save the autosave $effect may have queued for the previous
        // tree while loadTree was awaiting; hydrate sets dirty=false so the
        // effect won't re-fire, but a debounced timer from before the load
        // can still be in flight
        autosaver.cancel();
        syncStore.setRevision(1);
        await setSetting(SETTING_KEYS.lastOpenedTreeId, id);
        console.info("[tree] loaded %s (%s)", r.value.name || "untitled", id);
        toasts.push(`loaded ${r.value.name || "untitled"}`, "info", 3000);
    }

    async function startNewTree(): Promise<void> {
        await autosaver.flush();
        portraitUrls.clear();
        readOnly = false;
        treeStore.reset(emptyTree());
        console.info("[tree] new tree");
        toasts.push("started a new tree", "info", 3000);
    }

    async function removeTree(id: string): Promise<void> {
        await deletePersistedTree(id);
        console.info("[tree] deleted %s", id);
        toasts.push("tree deleted", "info", 3000);
        if (treeStore.tree.id === id) {
            treeStore.reset(emptyTree());
        }
        await refreshRecents();
    }

    async function deleteCurrentTree(): Promise<void> {
        const id = treeStore.tree.id;
        if (!confirm(`Delete "${treeStore.tree.name || "untitled"}"? This can't be undone.`))
            return;
        await removeTree(id);
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
        const linkedOne = linkParent(tree, newId, id);
        if (!linkedOne.ok) {
            toasts.push(linkedOne.error, "error");
            return;
        }
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

    function addUnattached(): void {
        const t = treeStore.tree;
        const { tree, id: newId } = addPerson(t, blankPerson());
        treeStore.set(tree);
        selection.openEditor(newId);
    }

    function deletePerson(id: PersonId): void {
        treeStore.update((t) => {
            const next = removePerson(t, id);
            if (next.rootId === id) {
                const fallback = Object.keys(next.people)[0];
                return fallback ? { ...next, rootId: fallback } : next;
            }
            return next;
        });
        if (selection.selectedPersonId === id) selection.select(undefined);
    }

    function menuItems(personId: PersonId): ContextMenuItem[] {
        if (readOnly)
            return [{ label: "edit person", onclick: () => selection.openEditor(personId) }];
        return [
            { label: "edit person", onclick: () => selection.openEditor(personId) },
            { label: "add parent", onclick: () => addParent(personId) },
            { label: "add partner", onclick: () => addPartner(personId) },
            { label: "add child", onclick: () => addChild(personId) },
            { label: "delete person", onclick: () => deletePerson(personId) },
        ];
    }

    function triggerImport(): void {
        importInputEl?.click();
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
                const count = Object.keys(r.value.tree.people).length;
                treeStore.reset(r.value.tree);
                toasts.push(`loaded ${String(count)} people from ${file.name}`, "success");
            } else if (format === "gedcom") {
                const text = new TextDecoder().decode(bytes);
                const r = parseGedcom(text);
                if (!r.ok) {
                    toasts.push(`import failed: ${r.error}`, "error");
                    return;
                }
                const count = Object.keys(r.value.tree.people).length;
                treeStore.reset(r.value.tree);
                toasts.push(`loaded ${String(count)} people from ${file.name}`, "success");
            } else if (format === "familyscript") {
                const text = new TextDecoder().decode(bytes);
                const r = parseFamilyScript(text);
                if (!r.ok) {
                    toasts.push(`import failed: ${r.error}`, "error");
                    return;
                }
                const count = Object.keys(r.value.tree.people).length;
                treeStore.reset(r.value.tree);
                toasts.push(`loaded ${String(count)} people from ${file.name}`, "success");
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
        if (readOnly) return;
        treeStore.update((t) => updatePerson(t, id, patch));
    }

    async function forceSave(): Promise<void> {
        await autosaver.flush();
        toasts.push("saved", "info", 1500);
    }

    function startTitleEdit(): void {
        if (readOnly) return;
        titleDraft = treeStore.tree.name;
        titleEditing = true;
        queueMicrotask(() => {
            titleEl?.focus();
            titleEl?.select();
        });
    }

    function commitTitle(): void {
        if (!titleEditing) return;
        const next = titleDraft.trim() || "untitled";
        if (next !== treeStore.tree.name) {
            treeStore.update((t) => ({ ...t, name: next, updatedAt: Date.now() }));
        }
        titleEditing = false;
    }

    function cancelTitle(): void {
        titleEditing = false;
        titleDraft = treeStore.tree.name;
    }

    function onTitleKey(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            e.preventDefault();
            commitTitle();
        } else if (e.key === "Escape") {
            e.preventDefault();
            cancelTitle();
        }
    }

    function focusedPerson(): PersonId | undefined {
        return selection.selectedPersonId;
    }

    function withSelected(fn: (id: PersonId) => void, requireMsg = "select a person first"): void {
        const id = focusedPerson();
        if (!id) {
            toasts.push(requireMsg, "info", 1500);
            return;
        }
        fn(id);
    }

    function stub(name: string): void {
        console.warn("[shortcut] not wired yet:", name);
        toasts.push(`${name} — coming soon`, "info", 1500);
    }

    // single source of truth for action wiring; menu items + shortcuts both reference these
    const actions: Record<string, () => void> = {
        "app.undo": () => treeStore.undo(),
        "app.redo": () => treeStore.redo(),
        "app.save": () => void forceSave(),
        "app.new": () => void startNewTree(),
        "app.open": () => stub("Open dialog"),
        "app.import": () => triggerImport(),
        "app.export": () => onExport(),
        "app.settings": () => stub("Settings"),
        "app.help": () => (showHelp = true),
        "view.fit": () => stub("Fit to window"),
        "view.zoom100": () => stub("Zoom to 100%"),
        "view.fitSelection": () => stub("Fit selection"),
        "view.focus": () => stub("Focus selection"),
        "view.handTool": () => stub("Hand tool"),
        "view.selectTool": () => stub("Select tool"),
        "view.zoomIn": () => stub("Zoom in"),
        "view.zoomOut": () => stub("Zoom out"),
        "view.centerRoot": () => stub("Center on root"),
        "select.clear": () => selection.select(undefined),
        "select.edit": () => withSelected((id) => selection.openEditor(id)),
        "select.delete": () => withSelected((id) => deletePerson(id)),
        "select.duplicate": () => stub("Duplicate"),
        "person.addChild": () => withSelected((id) => addChild(id)),
        "person.addPartner": () => withSelected((id) => addPartner(id)),
        "person.addParent": () => withSelected((id) => addParent(id)),
        "person.addUnattached": () => addUnattached(),
        "palette.findPerson": () => stub("Find person"),
        "palette.commands": () => stub("Command palette"),
        "tree.rename": () => startTitleEdit(),
        "tree.setRoot": () =>
            withSelected((id) => {
                treeStore.update((t) => ({ ...t, rootId: id }));
                toasts.push("root updated", "info", 1500);
            }),
        "tree.delete": () => void deleteCurrentTree(),
        "tree.statistics": () => stub("Statistics"),
        "tree.resetLayout": () => stub("Reset layout"),
        "view.toggleInspector": () => stub("Inspector"),
    };

    const bindings: ShortcutBinding[] = SHORTCUTS.flatMap((s) => {
        const action = actions[s.actionId];
        if (!action) return [];
        const main: ShortcutBinding = { combo: s.combo, scope: s.scope, action };
        if (s.alt) {
            return [main, { combo: s.alt, scope: s.scope, action }];
        }
        return [main];
    });

    installShortcuts(bindings);

    // helper to look up the primary combo for an action so menu items render the same shortcut
    function comboFor(actionId: string): string | undefined {
        return SHORTCUTS.find((s) => s.actionId === actionId)?.combo;
    }

    const fileMenu = $derived<MenuConfig>({
        label: "File",
        items: [
            {
                label: "New tree",
                icon: FilePlus,
                shortcut: comboFor("app.new"),
                onclick: actions["app.new"],
            },
            {
                label: "Open tree…",
                icon: FolderOpen,
                shortcut: comboFor("app.open"),
                onclick: actions["app.open"],
            },
            "divider",
            {
                label: "Save",
                icon: Save,
                shortcut: comboFor("app.save"),
                onclick: actions["app.save"],
            },
            {
                label: "Import…",
                icon: Upload,
                shortcut: comboFor("app.import"),
                onclick: actions["app.import"],
            },
            {
                label: "Export .gdz",
                icon: Download,
                shortcut: comboFor("app.export"),
                onclick: actions["app.export"],
            },
            "divider",
            {
                label: "Delete this tree…",
                icon: Trash2,
                danger: true,
                onclick: actions["tree.delete"],
            },
        ] satisfies MenuEntry[],
    });

    const editMenu = $derived<MenuConfig>({
        label: "Edit",
        items: [
            {
                label: "Undo",
                icon: Undo2,
                shortcut: comboFor("app.undo"),
                disabled: !treeStore.canUndo,
                onclick: actions["app.undo"],
            },
            {
                label: "Redo",
                icon: Redo2,
                shortcut: comboFor("app.redo"),
                disabled: !treeStore.canRedo,
                onclick: actions["app.redo"],
            },
            "divider",
            {
                label: "Find person…",
                icon: Search,
                shortcut: comboFor("palette.findPerson"),
                onclick: actions["palette.findPerson"],
            },
            {
                label: "Command palette…",
                icon: Command,
                shortcut: comboFor("palette.commands"),
                onclick: actions["palette.commands"],
            },
            "divider",
            {
                label: "Settings…",
                icon: Settings,
                shortcut: comboFor("app.settings"),
                onclick: actions["app.settings"],
            },
        ] satisfies MenuEntry[],
    });

    const viewMenu = $derived<MenuConfig>({
        label: "View",
        items: [
            {
                label: "Fit to window",
                icon: Maximize2,
                shortcut: comboFor("view.fit"),
                onclick: actions["view.fit"],
            },
            {
                label: "Zoom to 100%",
                icon: ZoomIn,
                shortcut: comboFor("view.zoom100"),
                onclick: actions["view.zoom100"],
            },
            {
                label: "Fit selection",
                shortcut: comboFor("view.fitSelection"),
                onclick: actions["view.fitSelection"],
            },
            {
                label: "Focus selection",
                icon: Focus,
                shortcut: comboFor("view.focus"),
                onclick: actions["view.focus"],
            },
            "divider",
            {
                label: "Zoom in",
                icon: ZoomIn,
                shortcut: comboFor("view.zoomIn"),
                onclick: actions["view.zoomIn"],
            },
            {
                label: "Zoom out",
                icon: ZoomOut,
                shortcut: comboFor("view.zoomOut"),
                onclick: actions["view.zoomOut"],
            },
            "divider",
            {
                label: "Hand tool",
                icon: Hand,
                shortcut: comboFor("view.handTool"),
                onclick: actions["view.handTool"],
            },
            {
                label: "Select tool",
                icon: MousePointer2,
                shortcut: comboFor("view.selectTool"),
                onclick: actions["view.selectTool"],
            },
            "divider",
            {
                label: "Show inspector",
                icon: SidebarOpen,
                onclick: actions["view.toggleInspector"],
            },
        ] satisfies MenuEntry[],
    });

    const insertMenu = $derived<MenuConfig>({
        label: "Insert",
        items: [
            {
                label: "Add child of selected",
                icon: Baby,
                shortcut: comboFor("person.addChild"),
                onclick: actions["person.addChild"],
            },
            {
                label: "Add partner of selected",
                icon: Heart,
                shortcut: comboFor("person.addPartner"),
                onclick: actions["person.addPartner"],
            },
            {
                label: "Add parent of selected",
                icon: UserPlus,
                shortcut: comboFor("person.addParent"),
                onclick: actions["person.addParent"],
            },
            {
                label: "Add unattached person",
                icon: UserPlus2,
                shortcut: comboFor("person.addUnattached"),
                onclick: actions["person.addUnattached"],
            },
        ] satisfies MenuEntry[],
    });

    const treeMenu = $derived<MenuConfig>({
        label: "Tree",
        items: [
            {
                label: "Rename tree…",
                icon: Pencil,
                onclick: actions["tree.rename"],
            },
            {
                label: "Set selected as root",
                icon: Crown,
                onclick: actions["tree.setRoot"],
            },
            {
                label: "Statistics…",
                icon: BarChart3,
                onclick: actions["tree.statistics"],
            },
            "divider",
            {
                label: "Reset layout",
                icon: RefreshCw,
                onclick: actions["tree.resetLayout"],
            },
            "divider",
            {
                label: "Center on root",
                icon: HomeIcon,
                shortcut: comboFor("view.centerRoot"),
                onclick: actions["view.centerRoot"],
            },
        ] satisfies MenuEntry[],
    });

    const helpMenu = $derived<MenuConfig>({
        label: "Help",
        items: [
            {
                label: "Keyboard shortcuts",
                icon: Keyboard,
                shortcut: comboFor("app.help"),
                onclick: actions["app.help"],
            },
            {
                label: "About",
                icon: Info,
                onclick: () => stub("About"),
            },
        ] satisfies MenuEntry[],
    });

    const menus = $derived<MenuConfig[]>(
        readOnly
            ? [viewMenu, helpMenu]
            : [fileMenu, editMenu, viewMenu, insertMenu, treeMenu, helpMenu],
    );

    const syncLabel = $derived(
        syncStore.mode === "syncing"
            ? "syncing…"
            : syncStore.mode === "conflict"
              ? "conflict"
              : null,
    );
</script>

<div class="bg-canvas text-fg flex h-dvh flex-col">
    <header class="border-line bg-canvas-elev flex flex-col border-b">
        <!-- title strip -->
        <div class="flex items-center gap-3 px-3 py-1">
            <TreePine size={18} class="text-accent shrink-0" aria-label="family tree editor" />
            {#if titleEditing}
                <input
                    bind:this={titleEl}
                    bind:value={titleDraft}
                    class="bg-canvas border-accent text-fg rounded border px-1.5 py-0.5 text-sm font-medium outline-none"
                    onblur={commitTitle}
                    onkeydown={onTitleKey}
                    aria-label="tree title"
                />
            {:else}
                <button
                    type="button"
                    class="text-fg hover:bg-canvas truncate rounded px-1.5 py-0.5 text-sm font-medium select-text"
                    onclick={startTitleEdit}
                    title={readOnly ? treeStore.tree.name : "click to rename"}
                    disabled={readOnly}
                >
                    {treeStore.tree.name || "untitled"}
                </button>
            {/if}
            {#if readOnly}
                <span class="text-fg-muted text-xs">(read-only)</span>
            {/if}
            <div class="ml-auto flex items-center gap-2">
                {#if syncLabel}
                    <span class="text-fg-muted text-xs">{syncLabel}</span>
                {/if}
                <AuthBar onSignedIn={() => void authStore.fetch()} />
            </div>
        </div>

        <!-- menu bar + actions -->
        <div class="border-line flex items-center gap-1 border-t px-2 py-0.5">
            <MenuBar {menus} />

            <div class="ml-auto flex items-center gap-0.5">
                {#if !readOnly}
                    <RecentTrees
                        listings={recents}
                        activeId={treeStore.tree.id}
                        onpick={(id: string) => void loadFromRecents(id)}
                        onnew={() => void startNewTree()}
                        ondelete={(id: string) => void removeTree(id)}
                    />

                    <button
                        type="button"
                        class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40"
                        title="Undo (Ctrl+Z)"
                        aria-label="Undo"
                        disabled={!treeStore.canUndo}
                        onclick={() => treeStore.undo()}
                    >
                        <Undo2 size={16} />
                    </button>
                    <button
                        type="button"
                        class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40"
                        title="Redo (Ctrl+Y)"
                        aria-label="Redo"
                        disabled={!treeStore.canRedo}
                        onclick={() => treeStore.redo()}
                    >
                        <Redo2 size={16} />
                    </button>
                {/if}

                {#if authStore.user && !readOnly}
                    <button
                        type="button"
                        class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded"
                        title="Share"
                        aria-label="Share"
                        onclick={() => (showShare = !showShare)}
                    >
                        <Share2 size={16} />
                    </button>
                {/if}

                {#if authStore.user?.role === "admin"}
                    <button
                        type="button"
                        class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded"
                        title="Admin"
                        aria-label="Admin"
                        onclick={() => (showAdmin = !showAdmin)}
                    >
                        <Shield size={16} />
                    </button>
                {/if}

                <button
                    type="button"
                    class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded"
                    title="Keyboard shortcuts (?)"
                    aria-label="Keyboard shortcuts"
                    onclick={() => (showHelp = true)}
                >
                    <HelpCircle size={16} />
                </button>
            </div>
        </div>
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

    {#if showShare}
        <ShareDialog treeId={treeStore.tree.id} onClose={() => (showShare = false)} />
    {/if}

    {#if showAdmin}
        <AdminPanel onClose={() => (showAdmin = false)} />
    {/if}

    {#if showHelp}
        <ShortcutsOverlay onclose={() => (showHelp = false)} />
    {/if}

    <!-- hidden file input for File > Import / Mod+I -->
    <input
        bind:this={importInputEl}
        type="file"
        class="sr-only"
        accept=".txt,.ged,.gedcom,.gdz,.zip"
        onchange={onImport}
        data-testid="import-input"
    />
</div>
