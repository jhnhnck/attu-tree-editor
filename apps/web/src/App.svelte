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
        unlinkParent,
        unlinkSpouse,
        updateCouple,
        updatePerson,
        type CouplePatch,
        type PersonPatch,
    } from "$lib/domain/tree";
    import { createTreeStore } from "$lib/state/tree.svelte";
    import { createSelectionStore } from "$lib/state/selection.svelte";
    import { createToastsStore } from "$lib/state/toasts.svelte";
    import { createPortraitUrlCache } from "$lib/state/portraitUrls.svelte";
    import { makeAutosaver } from "$lib/state/autosave";
    import { authStore } from "$lib/state/auth.svelte";
    import { syncStore } from "$lib/state/sync.svelte";
    import { onUnauthorized, trees as treesApi } from "$lib/api/client";
    import { writeBundle } from "$lib/io/bundle/write";
    import { importFile as importFileFromBytes } from "$lib/io/importFile";
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
    import type { CanvasController } from "$lib/components/tree/canvasController";
    import Inspector from "$lib/components/inspector/Inspector.svelte";
    import Toasts from "$lib/components/ui/Toasts.svelte";
    import ContextMenu, { type ContextMenuItem } from "$lib/components/ui/ContextMenu.svelte";
    import OpenDialog from "$lib/components/shell/OpenDialog.svelte";
    import AuthBar from "$lib/components/shell/AuthBar.svelte";
    import ShareDialog from "$lib/components/shell/ShareDialog.svelte";
    import AdminPanel from "$lib/components/shell/AdminPanel.svelte";
    import MenuBar from "$lib/components/shell/MenuBar.svelte";
    import type { MenuConfig, MenuEntry, IconComponent } from "$lib/components/shell/menu";
    import ShortcutsOverlay from "$lib/components/help/ShortcutsOverlay.svelte";
    import CommandPalette from "$lib/components/palette/CommandPalette.svelte";
    import {
        buildCommands,
        commandById,
        type Command as PaletteCommand,
        type CommandGroup,
    } from "$lib/components/palette/commands";
    import ZoomWidget from "$lib/components/canvas/ZoomWidget.svelte";
    import SaveStatusPill from "$lib/components/shell/SaveStatusPill.svelte";
    import type { Person, PersonId } from "$lib/domain/types";
    import { shortestPath } from "$lib/layout/graph";

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
    let showInspector = $state(true);
    let inspectorInitialTab = $state<"personal" | "connections" | "details" | "bio">("personal");

    // path tracing state
    let traceTargetId = $state<PersonId | undefined>(undefined);
    let tracePath = $derived(
        selection.selectedPersonId && traceTargetId
            ? shortestPath(treeStore.tree, selection.selectedPersonId, traceTargetId)
            : undefined
    );

    // command palette
    let showPalette = $state(false);
    let paletteMode = $state<"anything" | "commands">("anything");

    // open-tree dialog
    let showOpenDialog = $state(false);

    // drag-drop import overlay
    let isDraggingFile = $state(false);
    let dragDepth = 0;

    // canvas widget mirror state (kept in sync via callbacks from TreeCanvas)
    let canvasController = $state<CanvasController | undefined>(undefined);
    let canvasScale = $state(1);
    let canvasMode = $state<"select" | "hand">("select");

    // save-pill state
    let lastSavedAt = $state<number | undefined>(undefined);
    let lastError = $state<string | undefined>(undefined);
    let syncedFlashUntil = $state<number | undefined>(undefined);

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
        onError: (msg) => {
            lastError = msg;
            toasts.push(`autosave failed: ${msg}`, "error");
        },
        onSaved: () => {
            lastSavedAt = Date.now();
            lastError = undefined;
            void refreshRecents();
            syncStore.onLocalSave(treeStore.tree);
        },
    });

    // briefly flash the "Synced" tone after the sync store transitions back to
    // local from syncing (i.e. a successful server push)
    let prevSyncMode = $state<"local" | "syncing" | "conflict">("local");
    $effect(() => {
        const m = syncStore.mode;
        if (prevSyncMode === "syncing" && m === "local") {
            syncedFlashUntil = Date.now() + 2000;
        }
        prevSyncMode = m;
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

    type InspectorTab = "personal" | "connections" | "details" | "bio";
    type ConnectionSlot =
        | { kind: "parent"; role: "mother" | "father" }
        | { kind: "partner" }
        | { kind: "child" };

    interface MenuState {
        personId: PersonId;
        x: number;
        y: number;
    }
    let contextMenu = $state<MenuState | undefined>(undefined);

    function focusPerson(id: PersonId, tab: InspectorTab = "personal"): void {
        selection.select(id);
        showInspector = true;
        inspectorInitialTab = tab;
    }

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
        focusPerson(newId);
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
        focusPerson(newId);
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
        focusPerson(newId);
    }

    function addUnattached(): void {
        const t = treeStore.tree;
        const { tree, id: newId } = addPerson(t, blankPerson());
        treeStore.set(tree);
        focusPerson(newId);
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

    // ------- Inspector connection callbacks -------

    function setParentLink(childId: PersonId, parentId: PersonId, role: "mother" | "father"): void {
        const r = linkParent(treeStore.tree, childId, parentId, role);
        if (!r.ok) {
            toasts.push(r.error, "error");
            return;
        }
        treeStore.set(r.value);
    }

    function unsetParentLink(childId: PersonId, role: "mother" | "father"): void {
        treeStore.update((t) => unlinkParent(t, childId, role));
    }

    function addPartnerLink(aId: PersonId, bId: PersonId): void {
        const r = linkSpouse(treeStore.tree, aId, bId);
        if (!r.ok) {
            toasts.push(r.error, "error");
            return;
        }
        treeStore.set(r.value);
    }

    function removePartnerLink(aId: PersonId, bId: PersonId): void {
        treeStore.update((t) => unlinkSpouse(t, aId, bId));
    }

    function addChildLink(parentId: PersonId, childId: PersonId): void {
        const r = linkParent(treeStore.tree, childId, parentId);
        if (!r.ok) {
            toasts.push(r.error, "error");
            return;
        }
        treeStore.set(r.value);
    }

    function removeChildLink(parentId: PersonId, childId: PersonId): void {
        const child = treeStore.tree.people[childId];
        if (!child) return;
        treeStore.update((t) => {
            if (child.motherId === parentId) return unlinkParent(t, childId, "mother");
            if (child.fatherId === parentId) return unlinkParent(t, childId, "father");
            return t;
        });
    }

    function patchCouple(aId: PersonId, bId: PersonId, patch: CouplePatch): void {
        treeStore.update((t) => updateCouple(t, aId, bId, patch));
    }

    function createAndLink(forPersonId: PersonId, slot: ConnectionSlot): void {
        const t = treeStore.tree;
        const { tree: t1, id: newId } = addPerson(t, blankPerson());
        let next = t1;
        if (slot.kind === "parent") {
            const r = linkParent(next, forPersonId, newId, slot.role);
            if (r.ok) next = r.value;
        } else if (slot.kind === "partner") {
            const r = linkSpouse(next, forPersonId, newId);
            if (r.ok) next = r.value;
        } else {
            // child of forPerson, also stitched to forPerson's solo spouse if any
            const linked = linkParent(next, newId, forPersonId);
            if (linked.ok) next = linked.value;
            const parent = next.people[forPersonId];
            if (parent && parent.spouseIds.length === 1) {
                const partnerId = parent.spouseIds[0];
                if (partnerId && next.people[partnerId]) {
                    const r2 = linkParent(next, newId, partnerId);
                    if (r2.ok) next = r2.value;
                }
            }
        }
        treeStore.set(next);
        focusPerson(newId);
    }

    function duplicatePerson(id: PersonId): void {
        const src = treeStore.tree.people[id];
        if (!src) return;
        const copy: Omit<Person, "id"> = {
            given: src.given,
            surname: src.surname ? `${src.surname} (copy)` : "(copy)",
            gender: src.gender,
            spouseIds: [],
            display: src.display,
        };
        if (src.title !== undefined) copy.title = src.title;
        if (src.birth !== undefined) copy.birth = src.birth;
        if (src.death !== undefined) copy.death = src.death;
        if (src.occupation !== undefined) copy.occupation = src.occupation;
        if (src.location !== undefined) copy.location = src.location;
        if (src.wikiTitle !== undefined) copy.wikiTitle = src.wikiTitle;
        const { tree: next, id: cloneId } = addPerson(treeStore.tree, copy);
        treeStore.set(next);
        focusPerson(cloneId);
    }

    function setRootAction(id: PersonId): void {
        treeStore.update((t) => ({ ...t, rootId: id }));
        toasts.push("root updated", "info", 1500);
    }

    function menuItems(personId: PersonId): ContextMenuItem[] {
        if (readOnly) return [{ label: "edit person", onclick: () => focusPerson(personId) }];
        return [
            { label: "edit person", onclick: () => focusPerson(personId, "personal") },
            {
                label: "edit connections",
                onclick: () => focusPerson(personId, "connections"),
            },
            { divider: true },
            { label: "set as tree root", onclick: () => setRootAction(personId) },
            { label: "add parent", onclick: () => addParent(personId) },
            { label: "add partner", onclick: () => addPartner(personId) },
            { label: "add child", onclick: () => addChild(personId) },
            { divider: true },
            { label: "delete person", onclick: () => deletePerson(personId) },
        ];
    }

    function triggerImport(): void {
        importInputEl?.click();
    }

    async function importFile(file: File): Promise<void> {
        const loadingId = toasts.push(`reading ${file.name}…`, "info", 60_000);
        try {
            const r = await importFileFromBytes(file);
            if (!r.ok) {
                toasts.push(`import failed: ${r.error}`, "error");
                return;
            }
            treeStore.reset(r.value.tree);
            toasts.push(`loaded ${String(r.value.count)} people from ${file.name}`, "success");
        } catch (err) {
            toasts.push(`import error: ${String(err)}`, "error");
        } finally {
            toasts.dismiss(loadingId);
        }
    }

    async function onImport(e: Event): Promise<void> {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        try {
            await importFile(file);
        } finally {
            input.value = "";
        }
    }

    // -------- drag-drop import on canvas --------

    function dtHasFiles(dt: DataTransfer | null): boolean {
        if (!dt) return false;
        // dataTransfer.types is always a DOMStringList; "Files" present iff drop carries files
        return Array.from(dt.types).includes("Files");
    }

    function onDragEnter(e: DragEvent): void {
        if (readOnly) return;
        if (!dtHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        dragDepth += 1;
        isDraggingFile = true;
    }

    function onDragOver(e: DragEvent): void {
        if (readOnly) return;
        if (!dtHasFiles(e.dataTransfer)) return;
        // critical: cancel default so the browser doesn't navigate to file://
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }

    function onDragLeave(e: DragEvent): void {
        if (readOnly) return;
        if (!dtHasFiles(e.dataTransfer)) return;
        dragDepth -= 1;
        if (dragDepth <= 0) {
            dragDepth = 0;
            isDraggingFile = false;
        }
    }

    async function onDrop(e: DragEvent): Promise<void> {
        if (readOnly) return;
        if (!dtHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        dragDepth = 0;
        isDraggingFile = false;
        const file = e.dataTransfer?.files[0];
        if (!file) return;
        await importFile(file);
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

    function onSave(id: string, patch: PersonPatch): void {
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

    function openPalette(mode: "anything" | "commands"): void {
        paletteMode = mode;
        showPalette = true;
    }

    function withCanvas(fn: (c: CanvasController) => void, msg = "canvas not ready"): void {
        if (!canvasController) {
            toasts.push(msg, "info", 1500);
            return;
        }
        fn(canvasController);
    }

    // map the literal action ids onto handler functions in one place; commands.ts
    // reads from this bag to assemble the registry.
    const handlers = {
        appUndo: () => treeStore.undo(),
        appRedo: () => treeStore.redo(),
        appSave: () => void forceSave(),
        appNew: () => void startNewTree(),
        appOpen: () => (showOpenDialog = true),
        appImport: () => triggerImport(),
        appExport: () => onExport(),
        appSettings: () => stub("Settings"),
        appHelp: () => (showHelp = true),
        viewFit: () => withCanvas((c) => c.fit()),
        viewZoom100: () => withCanvas((c) => c.zoom100()),
        viewFitSelection: () => withCanvas((c) => c.fitSelection()),
        viewFocus: () => withCanvas((c) => c.focusSelection()),
        viewHandTool: () => withCanvas((c) => c.setMode("hand")),
        viewSelectTool: () => withCanvas((c) => c.setMode("select")),
        viewZoomIn: () => withCanvas((c) => c.zoomBy(1.25)),
        viewZoomOut: () => withCanvas((c) => c.zoomBy(0.8)),
        viewCenterRoot: () => withCanvas((c) => c.centerOnRoot()),
        viewToggleInspector: () => (showInspector = !showInspector),
        selectClear: () => selection.select(undefined),
        selectEdit: () => withSelected((id) => focusPerson(id, "personal")),
        selectDelete: () => withSelected((id) => deletePerson(id)),
        selectDuplicate: () => withSelected((id) => duplicatePerson(id)),
        personAddChild: () => withSelected((id) => addChild(id)),
        personAddPartner: () => withSelected((id) => addPartner(id)),
        personAddParent: () => withSelected((id) => addParent(id)),
        personAddUnattached: () => addUnattached(),
        paletteFindPerson: () => openPalette("anything"),
        paletteCommands: () => openPalette("commands"),
        treeRename: () => startTitleEdit(),
        treeSetRoot: () => withSelected((id) => setRootAction(id)),
        treeDelete: () => void deleteCurrentTree(),
        treeStatistics: () => stub("Statistics"),
        treeResetLayout: () => stub("Reset layout"),
    };

    // icon mapping per actionId (kept here so commands.ts stays presentation-free)
    const icons: Partial<Record<string, IconComponent>> = {
        "app.new": FilePlus,
        "app.open": FolderOpen,
        "app.save": Save,
        "app.import": Upload,
        "app.export": Download,
        "tree.delete": Trash2,
        "app.undo": Undo2,
        "app.redo": Redo2,
        "palette.findPerson": Search,
        "palette.commands": Command,
        "app.settings": Settings,
        "view.fit": Maximize2,
        "view.zoom100": ZoomIn,
        "view.focus": Focus,
        "view.zoomIn": ZoomIn,
        "view.zoomOut": ZoomOut,
        "view.handTool": Hand,
        "view.selectTool": MousePointer2,
        "view.toggleInspector": SidebarOpen,
        "person.addChild": Baby,
        "person.addPartner": Heart,
        "person.addParent": UserPlus,
        "person.addUnattached": UserPlus2,
        "tree.rename": Pencil,
        "tree.setRoot": Crown,
        "tree.statistics": BarChart3,
        "tree.resetLayout": RefreshCw,
        "view.centerRoot": HomeIcon,
        "app.help": Keyboard,
    };

    const commands = $derived<readonly PaletteCommand[]>(
        buildCommands(handlers, icons, {
            canUndo: () => treeStore.canUndo,
            canRedo: () => treeStore.canRedo,
        }),
    );

    const bindings: ShortcutBinding[] = SHORTCUTS.flatMap((s) => {
        const action = (e: KeyboardEvent): void => {
            void e;
            const cmd = commandById(commands, s.actionId);
            cmd?.run();
        };
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

    /** turn a group of commands into a MenuConfig, honouring dividerBefore hints. */
    function menuFromGroup(label: string, group: CommandGroup): MenuConfig {
        const entries: MenuEntry[] = [];
        for (const c of commands) {
            if (c.group !== group) continue;
            if (c.dividerBefore && entries.length > 0) entries.push("divider");
            const item: MenuItemDraft = { label: c.label };
            const sc = comboFor(c.id);
            if (sc !== undefined) item.shortcut = sc;
            if (c.icon !== undefined) item.icon = c.icon;
            if (c.danger) item.danger = true;
            const enabled = c.enabled ? c.enabled() : true;
            if (!enabled) item.disabled = true;
            item.onclick = () => c.run();
            entries.push(item);
        }
        return { label, items: entries };
    }

    interface MenuItemDraft {
        label: string;
        shortcut?: string;
        icon?: unknown;
        onclick?: () => void;
        disabled?: boolean;
        danger?: boolean;
    }

    const fileMenu = $derived<MenuConfig>(menuFromGroup("File", "File"));
    const editMenu = $derived<MenuConfig>(menuFromGroup("Edit", "Edit"));
    const viewMenu = $derived<MenuConfig>(menuFromGroup("View", "View"));
    const insertMenu = $derived<MenuConfig>(menuFromGroup("Insert", "Insert"));
    const treeMenu = $derived<MenuConfig>(menuFromGroup("Tree", "Tree"));
    const helpMenu = $derived<MenuConfig>({
        label: "Help",
        items: [
            ...menuFromGroup("Help", "Help").items,
            "divider",
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

    function onPalettePick(kind: "person" | "command", id: string): void {
        showPalette = false;
        if (kind === "person") {
            focusPerson(id, "personal");
            return;
        }
        const cmd = commandById(commands, id);
        cmd?.run();
    }
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
                    class="bg-canvas border-accent text-fg rounded border px-1.5 py-0.5 text-base font-semibold outline-none"
                    onblur={commitTitle}
                    onkeydown={onTitleKey}
                    aria-label="tree title"
                />
            {:else}
                <button
                    type="button"
                    class="text-fg hover:bg-canvas truncate rounded px-1.5 py-0.5 text-base font-semibold select-text"
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
                {#if !readOnly}
                    <SaveStatusPill
                        {lastSavedAt}
                        syncMode={syncStore.mode}
                        {syncedFlashUntil}
                        {lastError}
                        onretry={() => void forceSave()}
                        onconflict={() =>
                            toasts.push("save conflict — see console for details", "error")}
                        onforceSave={() => void forceSave()}
                    />
                {/if}
                <AuthBar
                    onSignedIn={() => void authStore.fetch()}
                    onerror={(msg: string) => toasts.push(msg, "error")}
                />
            </div>
        </div>

        <!-- menu bar + actions -->
        <div class="border-line flex items-center gap-1 border-t px-2 py-0.5">
            <MenuBar {menus} />

            <div class="ml-auto flex items-center gap-0.5">
                {#if !readOnly}
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

    <main
        class="relative flex flex-1 overflow-hidden"
        ondragenter={onDragEnter}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={(e) => void onDrop(e)}
    >
        <div class="relative flex-1 overflow-hidden">
            <TreeCanvas
                tree={treeStore.tree}
                selectedId={selection.selectedPersonId}
                {portraitUrls}
                onselect={(id: string) => selection.select(id)}
                ondeselect={() => selection.select(undefined)}
                onedit={(id: string) => focusPerson(id, "personal")}
                oncontextmenu={(id: string, x: number, y: number) => {
                    contextMenu = { personId: id, x, y };
                }}
                oncontroller={(c: CanvasController) => {
                    canvasController = c;
                    canvasScale = c.getScale();
                    canvasMode = c.getMode();
                }}
                onscalechange={(s: number) => (canvasScale = s)}
                onmodechange={(m: "select" | "hand") => (canvasMode = m)}
                ontoggleinspector={() => (showInspector = !showInspector)}
                traceIds={selection.selectedPersonId && traceTargetId ? [selection.selectedPersonId, traceTargetId] : undefined}
                {tracePath}
            />
            {#if canvasController}
                <ZoomWidget
                    scale={canvasScale}
                    mode={canvasMode}
                    onzoom={(n: number) => canvasController?.setScale(n)}
                    onfit={() => canvasController?.fit()}
                    onmodechange={(m: "select" | "hand") => canvasController?.setMode(m)}
                />
            {/if}
        </div>
        {#if showInspector}
            <Inspector
                tree={treeStore.tree}
                selectedId={selection.selectedPersonId}
                treeId={treeStore.tree.id}
                {portraitUrls}
                {readOnly}
                initialTab={inspectorInitialTab}
                onpatch={onSave}
                onsetParent={setParentLink}
                onunsetParent={unsetParentLink}
                onaddPartner={addPartnerLink}
                onremovePartner={removePartnerLink}
                onaddChild={addChildLink}
                onremoveChild={removeChildLink}
                oncreateAndLink={createAndLink}
                onselect={(id: string) => focusPerson(id, "personal")}
                onpatchCouple={patchCouple}
                onduplicate={duplicatePerson}
                onsetRoot={setRootAction}
                ondelete={deletePerson}
                onclose={() => (showInspector = false)}
                onerror={(msg: string) => toasts.push(msg, "error")}
                {traceTargetId}
                onsetTraceTarget={(id: PersonId | undefined) => (traceTargetId = id)}
            />
        {/if}

        {#if isDraggingFile}
            <div
                class="bg-accent/20 border-accent pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-4 border-dashed"
                data-testid="drop-overlay"
            >
                <div
                    class="bg-canvas-elev border-line text-fg rounded-lg border px-6 py-4 text-lg font-semibold shadow-xl"
                >
                    drop a .gdz / .ged / .txt file to import
                </div>
            </div>
        {/if}
    </main>

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

    {#if showPalette}
        <CommandPalette
            tree={treeStore.tree}
            {commands}
            mode={paletteMode}
            onpick={onPalettePick}
            onclose={() => (showPalette = false)}
        />
    {/if}

    {#if showOpenDialog}
        <OpenDialog
            listings={recents}
            activeId={treeStore.tree.id}
            onpick={(id: string) => void loadFromRecents(id)}
            ondelete={(id: string) => removeTree(id)}
            onclose={() => (showOpenDialog = false)}
            onnotice={(msg: string) => toasts.push(msg, "info", 2500)}
        />
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
