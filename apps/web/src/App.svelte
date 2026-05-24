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
        Layers,
        CircleDot,
        Network,
        Bug,
    } from "@lucide/svelte";

    import {
        addGroup,
        addGroupMember,
        addPerson,
        addRelationship,
        addSibshipDecorator,
        addSibshipMember,
        addUnionPartner,
        createTree,
        getParents,
        linkParent,
        linkParentRef,
        linkSpouse,
        removeGroup,
        removeGroupMember,
        removePerson,
        removeRelationship,
        removeSibshipDecorator,
        removeSibshipMember,
        removeUnionPartner,
        setPreferredUnion,
        unlinkParent,
        unlinkParentByPersonId,
        unlinkSpouse,
        updateCouple,
        updateGroup,
        updateParentRef,
        updatePerson,
        updateRelationship,
        updateSibshipDecorator,
        updateUnion,
        type CouplePatch,
        type GroupPatch,
        type PersonPatch,
        type RelationshipPatch,
        type SibshipPatch,
        type UnionPatch,
    } from "$lib/domain/tree";
    import { displayName } from "$lib/layout/kinship";
    import { migratePreferredUnion } from "$lib/state/preferredUnionMigration";
    import { createTreeStore } from "$lib/state/tree.svelte";
    import { createSelectionStore } from "$lib/state/selection.svelte";
    import { createToastsStore } from "$lib/state/toasts.svelte";
    import { createProgressStore } from "$lib/state/progress.svelte";
    import { createPortraitUrlCache } from "$lib/state/portraitUrls.svelte";
    import { createPreferencesStore } from "$lib/state/preferences.svelte";
    import { makeAutosaver } from "$lib/state/autosave";
    import { authStore } from "$lib/state/auth.svelte";
    import { syncStore } from "$lib/state/sync.svelte";
    import { onUnauthorized, trees as treesApi } from "$lib/api/client";
    import { writeBundle } from "$lib/io/bundle/write";
    import ImportWizard from "$lib/components/import/ImportWizard.svelte";
    import {
        deleteTree as deletePersistedTree,
        listTrees,
        loadTree,
        type TreeListing,
    } from "$lib/persistence/trees";
    import { SETTING_KEYS, getSetting, setSetting } from "$lib/persistence/settings";
    import { installShortcuts, type ShortcutBinding } from "$lib/keyboard";
    import { SHORTCUTS } from "$lib/shortcuts";
    import type { DebugLayerOptions } from "$lib/components/tree/debugTypes";

    import TreeCanvas from "$lib/components/tree/TreeCanvas.svelte";
    import HyperbolicCanvas from "$lib/components/tree/HyperbolicCanvas.svelte";
    import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
    import { onFinding } from "$lib/domain/findings";
    import type { CanvasController } from "$lib/components/tree/canvasController";
    import {
        DEFAULT_ENGINE,
        loadEngineSetting,
        saveEngineSetting,
        writeDefaultEngine,
        type EngineKind,
    } from "$lib/state/engine";
    import Inspector from "$lib/components/inspector/Inspector.svelte";
    import ProgressStrip from "$lib/components/shell/ProgressStrip.svelte";
    import Toasts from "$lib/components/ui/Toasts.svelte";
    import ContextMenu, { type ContextMenuItem } from "$lib/components/ui/ContextMenu.svelte";
    import OpenDialog from "$lib/components/shell/OpenDialog.svelte";
    import AuthBar from "$lib/components/shell/AuthBar.svelte";
    import ShareDialog from "$lib/components/shell/ShareDialog.svelte";
    import AboutDialog from "$lib/components/shell/AboutDialog.svelte";
    import AdminPanel from "$lib/components/shell/AdminPanel.svelte";
    import SettingsDialog from "$lib/components/shell/SettingsDialog.svelte";
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
    import {
        DESIGN_CARD_WIDTH_PX,
        computeDisplayPercent,
    } from "$lib/components/canvas/zoomDisplay";
    import SaveStatusPill from "$lib/components/shell/SaveStatusPill.svelte";
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
    const progress = createProgressStore();
    const portraitUrls = createPortraitUrlCache();
    const prefs = createPreferencesStore();

    let recents = $state<TreeListing[]>([]);
    let firstLoadComplete = $state(false);
    let showShare = $state(false);
    let showAbout = $state(false);
    let showAdmin = $state(false);
    let showHelp = $state(false);
    let showSettings = $state(false);

    // debug overlay state
    let debugOpen = $state(false);
    let debugPillHidden = $state(false);
    let debugLayers = $state<DebugLayerOptions>({
        showGrid: false,
        showNodeBounds: true,
        showSegmentIds: false,
        showGhostArrows: true,
        showComponentBounds: true,
        showHops: false,
        showOverlapPairs: false,
        exposeTreeDebug: false,
        // Phase 3 additions
        showCycleNodes: false,
        showBondCentroidDelta: false,
        showOrphanBadge: false,
        showRankGutterLabels: false,
        showLastEditHalo: false,
    });
    // Phase 3: most recent layout-pass timings (from the worker) + last
    // mutated person id (for the last-edit halo). Both reset when the
    // engine swaps or tree loads, but otherwise persist across renders.
    let debugTimings = $state<
        import("$lib/layout/engines/layered-hv").LayeredEngineTimings | undefined
    >(undefined);
    let debugLastEditedId = $state<PersonId | undefined>(undefined);
    // Phase 3: dump/load tree JSON textarea state (separate $state so the
    // user's draft survives toggling the panel).
    let debugDumpJson = $state("");
    // Bottom-left bar shell state. Mirrored up from TreeCanvas via
    // onlayoutstats so the stats pill can share the row with the debug
    // toolbox pill (and any future shell chrome).
    let layoutStats = $state<
        { totalPeople: number; components: number; isolated: number } | undefined
    >(undefined);
    let showInspector = $state(true);
    let inspectorInitialTab = $state<"personal" | "connections" | "details" | "bio">("personal");

    // debug overlay derived
    let debugOptions = $derived(debugOpen ? { layers: debugLayers } : undefined);

    // command palette
    let showPalette = $state(false);
    let paletteMode = $state<"anything" | "commands">("anything");

    // open-tree dialog
    let showOpenDialog = $state(false);

    // import wizard
    let showImportWizard = $state(false);
    let importInitialFile = $state<File | undefined>(undefined);

    // drag-drop import overlay
    let isDraggingFile = $state(false);
    let dragDepth = 0;

    // canvas widget mirror state (kept in sync via callbacks from TreeCanvas)
    let canvasController = $state<CanvasController | undefined>(undefined);
    let canvasScale = $state(1);
    let canvasMode = $state<"select" | "hand">("select");

    // Active layout engine — Phase 0 walking-skeleton stub. The picker
    // mounts either TreeCanvas (layered) or HyperbolicCanvas (empty disk,
    // proband at centre) based on this. Hydrated from settings on mount;
    // changes persist immediately.
    let selectedEngine = $state<EngineKind>(DEFAULT_ENGINE);

    // stats pill is a layered-engine concept (cluster + isolated counts);
    // family-view / hyperbolic have no cluster analogue so the pill stays
    // layered-only by design. the debug pill is engine-agnostic.
    let statsPillVisible = $derived(selectedEngine === "layered" && layoutStats !== undefined);

    // engine-compatibility for debug-panel toggles. layered-only toggles
    // target layered IR (positions, ghosts, segments, ranks, placedGraph)
    // and silently no-op on other engines — disable them in the panel so
    // the user sees they aren't applicable here. runtime actions: `copy
    // snapshot` reads the layered placedGraph; `dump` / `load` / `force
    // conflict` are engine-agnostic; `expose __treeDebug` is honored by
    // the layered and hyperbolic canvases but not by family-view.
    let layeredOnlyToggleKeys = $derived(
        new Set<keyof DebugLayerOptions>([
            "showGrid",
            "showNodeBounds",
            "showSegmentIds",
            "showComponentBounds",
            "showGhostArrows",
            "showHops",
            "showOverlapPairs",
            "showCycleNodes",
            "showBondCentroidDelta",
            "showOrphanBadge",
            "showRankGutterLabels",
            "showLastEditHalo",
        ]),
    );
    let isLayered = $derived(selectedEngine === "layered");
    let exposeTreeDebugSupported = $derived(
        selectedEngine === "layered" || selectedEngine === "hyperbolic",
    );
    let copySnapshotSupported = $derived(selectedEngine === "layered");

    // Phase 6 (family-view): path-highlight overlay toggle. Defaults to
    // `true` (Phase 3 ships on-by-default); persisted to localStorage so
    // the choice survives reload. Drives the View menu's "Overlay: path
    // highlight" checkmark and gates FamilyViewCanvas's `pathHighlight`
    // prop. Read inline rather than via a separate module — single
    // boolean with no other consumer.
    const PATH_HIGHLIGHT_LS_KEY = "fte.overlays.pathHighlight";
    function readPathHighlightPref(): boolean {
        try {
            const raw =
                typeof localStorage === "undefined"
                    ? null
                    : localStorage.getItem(PATH_HIGHLIGHT_LS_KEY);
            // null → default on (no stored choice yet)
            // anything but "false" → on (defensive vs. malformed values)
            return raw !== "false";
        } catch {
            return true;
        }
    }
    function writePathHighlightPref(on: boolean): void {
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(PATH_HIGHLIGHT_LS_KEY, on ? "true" : "false");
            }
        } catch {
            // ignore — quota / disabled storage is non-fatal
        }
    }
    let pathHighlightEnabled = $state(readPathHighlightPref());

    // Visual fix-up plan phase 0/4: generation-badge overlay master switch.
    // Phase 0 wired the prop + storage key with default true. Phase 4
    // flipped the default to false and added the View-menu command.
    // Mirrors path-highlight, except null reads as off.
    const GEN_BADGE_LS_KEY = "fte.overlays.generationBadge";
    function readGenerationBadgePref(): boolean {
        try {
            const raw =
                typeof localStorage === "undefined" ? null : localStorage.getItem(GEN_BADGE_LS_KEY);
            // null → default off (no stored choice; phase 4 default)
            // only "true" reads as on
            return raw === "true";
        } catch {
            return false;
        }
    }
    function writeGenerationBadgePref(on: boolean): void {
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(GEN_BADGE_LS_KEY, on ? "true" : "false");
            }
        } catch {
            // ignore — quota / disabled storage is non-fatal
        }
    }
    let generationBadgeEnabled = $state(readGenerationBadgePref());

    // Wave-2 phase 0b: zoom-100% semantic flag. Default true; null
    // reads as on for parity with `fte.overlays.pathHighlight`. when
    // true, the ZoomWidget's % readout is derived from a sample
    // card's measured CSS width / `--fte-design-card-width` (320 px);
    // when false, falls back to raw `Math.round(scale * 100)`. on a
    // 1× DPR display at 100% browser zoom the two are identical;
    // semantic mode only diverges (honestly) when browser zoom is
    // active. no UI toggle — rollback path is to flip the read
    // fallback below to `false`.
    const SEMANTIC_100_LS_KEY = "fte.zoom.semantic100";
    function readSemantic100Pref(): boolean {
        try {
            const raw =
                typeof localStorage === "undefined"
                    ? null
                    : localStorage.getItem(SEMANTIC_100_LS_KEY);
            return raw !== "false";
        } catch {
            return true;
        }
    }
    let semantic100Enabled = $state(readSemantic100Pref());

    // Sample-card measurement for the ZoomWidget readout. `undefined`
    // means "no measurable card on canvas right now" → fallback path.
    // Re-sampled in a $effect below whenever `canvasScale` or the
    // engine changes (cards are remounted on engine swap).
    let measuredCardWidthPx = $state<number | undefined>(undefined);

    // Wave-2 phase 0b: sample any visible `[data-person-id]` card's
    // CSS-pixel width and feed it to `computeDisplayPercent`. Re-runs
    // when `canvasScale` or `selectedEngine` changes — engine swap
    // remounts the entire card tree. `DESIGN_CARD_WIDTH_PX` is asserted
    // as a sanity check: if a future commit drifts the constant, the
    // assertion failure points here (no silent semantic shift).
    $effect(() => {
        void canvasScale;
        void selectedEngine;
        if (typeof document === "undefined") return;
        const sample = document.querySelector("[data-person-id]");
        if (!sample) {
            measuredCardWidthPx = undefined;
            return;
        }
        const w = sample.getBoundingClientRect().width;
        measuredCardWidthPx = w > 0 ? w : undefined;
    });

    let zoomDisplayPercent = $derived(
        computeDisplayPercent({
            scale: canvasScale,
            semantic100: semantic100Enabled,
            measuredCardWidthPx,
        }),
    );
    // referenced in dev-only consistency check; kept alongside the
    // sampler so the constant import isn't dropped if the assertion is
    // removed.
    void DESIGN_CARD_WIDTH_PX;

    // Wave-2 phase 2: family-view crossing-minimisation. Default `true`;
    // null reads as on for parity with `fte.overlays.pathHighlight`. The
    // pass is monotone (see `computeLayout`'s gate) so flipping the flag
    // off only matters for power-users who want to disable the extra
    // candidate-layout pass entirely, e.g. while profiling. No UI toggle —
    // the rollback path is to flip the read fallback below to `false`.
    const CROSSING_MIN_LS_KEY = "fte.layout.familyViewCrossingMin";
    function readCrossingMinPref(): boolean {
        try {
            const raw =
                typeof localStorage === "undefined"
                    ? null
                    : localStorage.getItem(CROSSING_MIN_LS_KEY);
            return raw !== "false";
        } catch {
            return true;
        }
    }
    let crossingMinEnabled = $state(readCrossingMinPref());

    // Wave-2 phase 3: smooth-diff animation flag. Default `true`; null
    // reads as on for parity with `fte.overlays.pathHighlight`. Gates
    // FamilyViewCanvas's `smoothDiff` prop, which toggles a CSS
    // `transition` on card / badge `transform`. Rollback path is to
    // flip the read fallback below to `false`; users who prefer
    // reduced motion already get jump-cut behaviour via the global
    // `prefers-reduced-motion: reduce` rule in `app.css`. No UI
    // toggle today — same precedent as `crossingMin` and `semantic100`.
    const SMOOTH_DIFF_LS_KEY = "fte.overlays.smoothDiff";
    function readSmoothDiffPref(): boolean {
        try {
            const raw =
                typeof localStorage === "undefined"
                    ? null
                    : localStorage.getItem(SMOOTH_DIFF_LS_KEY);
            return raw !== "false";
        } catch {
            return true;
        }
    }
    let smoothDiffEnabled = $state(readSmoothDiffPref());

    // Wave-2 phase 4: secondary-union expansion flag. Default `true`;
    // null reads as on for parity with the other wave-2 phase-internal
    // flags. Gates FamilyViewCanvas's `secondaryUnion` prop, which
    // toggles the picker menu's "show alongside" / "hide" actions and
    // (when off) reverts to wave-1's swap-only behaviour. Rollback
    // path is to flip the read fallback to `false`. No UI toggle —
    // same precedent as `smoothDiff` / `crossingMin` / `semantic100`.
    const SECONDARY_UNION_LS_KEY = "fte.layout.familyViewSecondaryUnion";
    function readSecondaryUnionPref(): boolean {
        try {
            const raw =
                typeof localStorage === "undefined"
                    ? null
                    : localStorage.getItem(SECONDARY_UNION_LS_KEY);
            return raw !== "false";
        } catch {
            return true;
        }
    }
    let secondaryUnionEnabled = $state(readSecondaryUnionPref());

    // relationship-vocabulary phase 4: per-overlay-kind toggles. each
    // localStorage key defaults on (`null` → on); anything but `"false"`
    // reads as on. mirrors PATH_HIGHLIGHT_LS_KEY's defensive shape.
    const SWORN_BONDS_LS_KEY = "fte.overlays.swornBonds";
    const TRANSFORMATIONS_LS_KEY = "fte.overlays.transformations";
    const SEVERANCES_LS_KEY = "fte.overlays.severances";
    function readBoolPref(key: string): boolean {
        try {
            const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(key);
            return raw !== "false";
        } catch {
            return true;
        }
    }
    function writeBoolPref(key: string, on: boolean): void {
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(key, on ? "true" : "false");
            }
        } catch {
            // quota / disabled storage non-fatal
        }
    }
    let swornBondsEnabled = $state(readBoolPref(SWORN_BONDS_LS_KEY));
    let transformationsEnabled = $state(readBoolPref(TRANSFORMATIONS_LS_KEY));
    let severancesEnabled = $state(readBoolPref(SEVERANCES_LS_KEY));

    // relationship-vocabulary phase 6a: group-frames toggle.
    const GROUP_FRAMES_LS_KEY = "fte.overlays.groupFrames";
    let groupFramesEnabled = $state(readBoolPref(GROUP_FRAMES_LS_KEY));

    // relationship-vocabulary phase 6b: consanguinity toggle (COI badge +
    // duplicate-ancestor tint). Default off — surfaces only when the user
    // opts in via the View menu.
    const CONSANGUINITY_LS_KEY = "fte.overlays.consanguinity";
    let consanguinityEnabled = $state(readBoolPref(CONSANGUINITY_LS_KEY));

    // save-pill state
    let lastSavedAt = $state<number | undefined>(undefined);
    let lastError = $state<string | undefined>(undefined);
    let syncedFlashUntil = $state<number | undefined>(undefined);

    // read-only mode: set when loading a tree via /view/<uuid> route
    let readOnly = $state(false);

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

    // Runtime findings (e.g. schema-overflow attempts) surface as toasts.
    // Phase 4 replaces the toast path with a structured server finding when
    // the spike outcome supports it; the listener stays the same.
    onMount(() => {
        return onFinding((f) => {
            toasts.push(f.detail, "info", 2500);
        });
    });

    onMount(async () => {
        // hydrate user prefs first so theme + inspector side are applied before
        // any sub-components mount; theme uses prefers-color-scheme until then
        await prefs.hydrate();

        // engine selection is independent of tree contents; hydrate before the
        // canvas mounts so the right component renders on first paint.
        try {
            selectedEngine = await loadEngineSetting();
        } catch {
            selectedEngine = DEFAULT_ENGINE;
        }

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
                if (r.ok) treeStore.hydrate(migratePreferredUnion(r.value));
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
            treeStore.hydrate(migratePreferredUnion(r.blob as ReturnType<typeof createTree>));
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
        treeStore.hydrate(migratePreferredUnion(r.value));
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
        | { kind: "parent-extra" }
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

    function addSibling(id: PersonId): void {
        const t = treeStore.tree;
        const anchor = t.people[id];
        if (!anchor) return;
        // a sibling shares at least one parent; without any parent there's
        // nothing to attach the new person to. the context-menu entry is
        // disabled in this case, so this is a defensive guard.
        const refs = getParents(anchor);
        if (refs.length === 0) {
            toasts.push("cannot add sibling: anchor has no parent to share", "error");
            return;
        }
        const { tree, id: newId } = addPerson(t, blankPerson());
        let next = tree;
        // mirror the anchor's parent refs (role + pedi preserved) so the new
        // sibling sits in the same sibship under the same parents
        for (const ref of refs) {
            const linked = linkParentRef(next, newId, { ...ref });
            if (!linked.ok) {
                toasts.push(linked.error, "error");
                return;
            }
            next = linked.value;
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

    function addParentRefLink(childId: PersonId, ref: import("$lib/domain/types").ParentRef): void {
        const r = linkParentRef(treeStore.tree, childId, ref);
        if (!r.ok) {
            toasts.push(r.error, "error");
            return;
        }
        treeStore.set(r.value);
    }

    function unsetParentLinkById(childId: PersonId, parentId: PersonId): void {
        treeStore.update((t) => unlinkParentByPersonId(t, childId, parentId));
    }

    function updateParentRefLink(
        childId: PersonId,
        parentId: PersonId,
        patch: {
            role?: import("$lib/domain/types").ParentRole;
            pedi?: import("$lib/domain/types").ParentPedi;
        },
    ): void {
        treeStore.update((t) => updateParentRef(t, childId, parentId, patch));
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
        const ref = getParents(child).find((r) => r.personId === parentId);
        if (!ref) return;
        const role: "mother" | "father" = ref.role === "father" ? "father" : "mother";
        treeStore.update((t) => unlinkParent(t, childId, role));
    }

    function patchCouple(aId: PersonId, bId: PersonId, patch: CouplePatch): void {
        treeStore.update((t) => updateCouple(t, aId, bId, patch));
    }

    function addUnionPartnerLink(unionId: string, personId: PersonId): void {
        const r = addUnionPartner(treeStore.tree, unionId, personId);
        if (!r.ok) {
            toasts.push(r.error, "error");
            return;
        }
        treeStore.set(r.value);
    }

    function removeUnionPartnerLink(unionId: string, personId: PersonId): void {
        treeStore.update((t) => removeUnionPartner(t, unionId, personId));
    }

    function patchUnion(unionId: string, patch: UnionPatch): void {
        treeStore.update((t) => updateUnion(t, unionId, patch));
    }

    function setPreferredUnionLink(unionId: string, personId: PersonId, preferred: boolean): void {
        treeStore.update((t) => setPreferredUnion(t, unionId, personId, preferred));
    }

    function addRelationshipLink(
        rel: Omit<import("$lib/domain/types").Relationship, "id"> & { id?: string },
    ): void {
        treeStore.update((t) => addRelationship(t, rel).tree);
    }

    function removeRelationshipLink(relId: string): void {
        treeStore.update((t) => removeRelationship(t, relId));
    }

    function patchRelationship(relId: string, patch: RelationshipPatch): void {
        treeStore.update((t) => updateRelationship(t, relId, patch));
    }

    function addGroupLink(
        g: Omit<import("$lib/domain/types").Group, "id"> & { id?: string },
    ): void {
        treeStore.update((t) => addGroup(t, g).tree);
    }

    function removeGroupLink(groupId: string): void {
        treeStore.update((t) => removeGroup(t, groupId));
    }

    function patchGroup(groupId: string, patch: GroupPatch): void {
        treeStore.update((t) => updateGroup(t, groupId, patch));
    }

    function addGroupMemberLink(groupId: string, personId: PersonId): void {
        treeStore.update((t) => addGroupMember(t, groupId, personId));
    }

    function removeGroupMemberLink(groupId: string, personId: PersonId): void {
        treeStore.update((t) => removeGroupMember(t, groupId, personId));
    }

    function addSibshipDecoratorLink(
        d: Omit<import("$lib/domain/types").SibshipDecorator, "id"> & { id?: string },
    ): void {
        treeStore.update((t) => addSibshipDecorator(t, d).tree);
    }

    function removeSibshipDecoratorLink(id: string): void {
        treeStore.update((t) => removeSibshipDecorator(t, id));
    }

    function patchSibshipDecorator(id: string, patch: SibshipPatch): void {
        treeStore.update((t) => updateSibshipDecorator(t, id, patch));
    }

    function addSibshipMemberLink(id: string, personId: PersonId): void {
        treeStore.update((t) => addSibshipMember(t, id, personId));
    }

    function removeSibshipMemberLink(id: string, personId: PersonId): void {
        treeStore.update((t) => removeSibshipMember(t, id, personId));
    }

    function createAndLinkUnionPartner(unionId: string): void {
        const t = treeStore.tree;
        const { tree: t1, id: newId } = addPerson(t, blankPerson());
        const r = addUnionPartner(t1, unionId, newId);
        if (!r.ok) {
            toasts.push(r.error, "error");
            return;
        }
        treeStore.set(r.value);
        focusPerson(newId);
    }

    function createAndLink(forPersonId: PersonId, slot: ConnectionSlot): void {
        const t = treeStore.tree;
        const { tree: t1, id: newId } = addPerson(t, blankPerson());
        let next = t1;
        if (slot.kind === "parent") {
            const r = linkParent(next, forPersonId, newId, slot.role);
            if (r.ok) next = r.value;
        } else if (slot.kind === "parent-extra") {
            const r = linkParentRef(next, forPersonId, {
                personId: newId,
                role: "parent",
                pedi: "birth",
            });
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
        // resolve the name after the update so the toast reflects the just-promoted person
        const name = displayName(treeStore.tree, id);
        toasts.push(`${name} is now the tree root`, "info", 2500);
    }

    function menuItems(personId: PersonId): ContextMenuItem[] {
        if (readOnly) return [{ label: "edit person", onclick: () => focusPerson(personId) }];
        // a sibling needs a shared parent; disable the entry when the
        // anchor has none and surface the reason via a hover tooltip
        const anchor = treeStore.tree.people[personId];
        const hasParent = anchor ? getParents(anchor).length > 0 : false;
        const items: ContextMenuItem[] = [
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
            hasParent
                ? { label: "add sibling", onclick: () => addSibling(personId) }
                : {
                      label: "add sibling",
                      onclick: () => {},
                      disabled: true,
                      title: "add a parent first - a sibling shares at least one parent",
                  },
            { divider: true },
            { label: "delete person", onclick: () => deletePerson(personId) },
        ];
        return items;
    }

    function triggerImport(): void {
        importInitialFile = undefined;
        showImportWizard = true;
    }

    async function onImportSuccess(info: {
        treeId: string;
        sourceFormat: string;
        count: number;
    }): Promise<void> {
        // a fresh import must update lastOpenedTreeId so a reload restores
        // the imported tree instead of the previously-opened one.
        await setSetting(SETTING_KEYS.lastOpenedTreeId, info.treeId);
        toasts.push(`imported ${String(info.count)} people from ${info.sourceFormat}`, "success");
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

    function onDrop(e: DragEvent): void {
        if (readOnly) return;
        if (!dtHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        dragDepth = 0;
        isDraggingFile = false;
        const file = e.dataTransfer?.files[0];
        if (!file) return;
        importInitialFile = file;
        showImportWizard = true;
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
        debugLastEditedId = id;
    }

    // Phase 3 debug-toolbox runtime actions ----------------------------------

    async function copyLayoutSnapshot(): Promise<void> {
        const handle = window.__treeDebug;
        if (!handle) {
            toasts.push("expose __treeDebug first", "info", 2000);
            return;
        }
        // Routed/placed graphs include Maps that JSON.stringify drops.
        // Materialise them to plain objects so the snapshot survives the
        // clipboard round-trip.
        const placed = handle.placedGraph;
        const payload = {
            tree: { id: treeStore.tree.id, editRev: treeStore.tree.editRev },
            timings: handle.timings,
            warnings: handle.warnings,
            cycleNodes: handle.cycleNodes,
            placed: placed
                ? {
                      bbox: placed.bbox,
                      ranks: placed.ranks,
                      nodes: Array.from(placed.nodes.entries()),
                      x: Array.from(placed.x.entries()),
                      y: Array.from(placed.y.entries()),
                  }
                : null,
            segments: handle.rawSegments,
        };
        try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            toasts.push("layout snapshot copied", "info", 1500);
        } catch {
            toasts.push("clipboard write failed", "error");
        }
    }

    function dumpTreeJson(): void {
        debugDumpJson = JSON.stringify(treeStore.tree, null, 2);
    }

    function loadTreeJson(): void {
        try {
            const parsed = JSON.parse(debugDumpJson) as unknown;
            if (!parsed || typeof parsed !== "object") {
                toasts.push("invalid tree json", "error");
                return;
            }
            treeStore.reset(parsed as typeof treeStore.tree);
            toasts.push("tree loaded from textarea", "info", 1500);
        } catch (err) {
            toasts.push(
                `load failed: ${err instanceof Error ? err.message : String(err)}`,
                "error",
            );
        }
    }

    function forceConflict(): void {
        const rev = syncStore.revision;
        if (rev === null || rev <= 0) {
            toasts.push("force-conflict needs a signed-in synced tree", "info", 2000);
            return;
        }
        syncStore.setRevision(rev - 1);
        toasts.push(
            `revision rolled back to ${String(rev - 1)} — next save will 409`,
            "info",
            2500,
        );
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

    async function switchEngine(kind: EngineKind): Promise<void> {
        if (selectedEngine === kind) return;
        selectedEngine = kind;
        // Both canvases now expose their own controller via `oncontroller`.
        // Drop the previous reference; the newly-mounted canvas re-publishes
        // on its `onMount` so menu actions retarget without delay.
        canvasController = undefined;
        try {
            await saveEngineSetting(kind);
        } catch (e) {
            toasts.push(`failed to persist engine: ${String(e)}`, "error", 2500);
        }
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
        appSettings: () => (showSettings = true),
        appHelp: () => (showHelp = true),
        viewFit: () => withCanvas((c) => c.fit()),
        viewZoom100: () => withCanvas((c) => c.zoom100()),
        viewFitSelection: () => withCanvas((c) => c.fitSelection()),
        viewFocus: () => withCanvas((c) => c.focusSelection()),
        viewHandTool: () => withCanvas((c) => c.setMode("hand")),
        viewSelectTool: () => withCanvas((c) => c.setMode("select")),
        viewZoomIn: () => withCanvas((c) => c.zoomBy(1.25)),
        viewZoomOut: () => withCanvas((c) => c.zoomBy(0.8)),
        viewCenterRoot: () => {
            // center the viewport on root and also select it - users
            // usually want both (e.g. to start editing or path-tracing
            // from the root after a long pan away)
            withCanvas((c) => c.centerOnRoot());
            const rid = treeStore.tree.rootId;
            if (rid) selection.select(rid);
        },
        viewToggleInspector: () => (showInspector = !showInspector),
        viewEngineFamilyView: () => void switchEngine("family-view"),
        viewEngineLayered: () => void switchEngine("layered"),
        viewEngineHyperbolic: () => void switchEngine("hyperbolic"),
        viewSetCurrentEngineAsDefault: () => {
            // Phase 6: writes the active engine to fte.defaultEngine so a
            // fresh first-run picks it up. The active engine is whatever
            // `selectedEngine` reads as right now; toast confirms which
            // engine just won the default slot so the user knows the
            // command applied to the right one.
            writeDefaultEngine(selectedEngine);
            toasts.push(`${selectedEngine} is the new default engine`, "success", 2000);
        },
        viewOverlayPathHighlightToggle: () => {
            // Phase 6: real toggle. Flips the local state + persists the
            // preference, so the View menu's check tracks live and a
            // reload restores the user's choice.
            pathHighlightEnabled = !pathHighlightEnabled;
            writePathHighlightPref(pathHighlightEnabled);
        },
        viewOverlayGenerationBadgeToggle: () => {
            // Visual fix-up phase 4: flip + persist, mirrors path-highlight.
            generationBadgeEnabled = !generationBadgeEnabled;
            writeGenerationBadgePref(generationBadgeEnabled);
        },
        // Phase 4 overlay toggles — flip + persist + show toast.
        viewOverlaySwornBondsToggle: () => {
            swornBondsEnabled = !swornBondsEnabled;
            writeBoolPref(SWORN_BONDS_LS_KEY, swornBondsEnabled);
        },
        viewOverlayTransformationsToggle: () => {
            transformationsEnabled = !transformationsEnabled;
            writeBoolPref(TRANSFORMATIONS_LS_KEY, transformationsEnabled);
        },
        viewOverlaySeverancesToggle: () => {
            severancesEnabled = !severancesEnabled;
            writeBoolPref(SEVERANCES_LS_KEY, severancesEnabled);
        },
        viewOverlayGroupFramesToggle: () => {
            groupFramesEnabled = !groupFramesEnabled;
            writeBoolPref(GROUP_FRAMES_LS_KEY, groupFramesEnabled);
        },
        viewOverlayConsanguinityStub: () => {
            consanguinityEnabled = !consanguinityEnabled;
            writeBoolPref(CONSANGUINITY_LS_KEY, consanguinityEnabled);
        },
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
        "view.engineFamilyView": Network,
        "view.engineLayered": Layers,
        "view.engineHyperbolic": CircleDot,
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
            engineFamilyViewActive: () => selectedEngine === "family-view",
            engineLayeredActive: () => selectedEngine === "layered",
            overlayPathHighlightActive: () => pathHighlightEnabled,
            overlayGenerationBadgeActive: () => generationBadgeEnabled,
            overlaySwornBondsActive: () => swornBondsEnabled,
            overlayTransformationsActive: () => transformationsEnabled,
            overlaySeverancesActive: () => severancesEnabled,
            overlayGroupFramesActive: () => groupFramesEnabled,
            overlayConsanguinityActive: () => consanguinityEnabled,
            engineHyperbolicActive: () => selectedEngine === "hyperbolic",
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

    // debug shortcut (not shown in help overlay)
    bindings.push({
        combo: "Ctrl+Shift+D",
        scope: "global" as const,
        action: () => {
            debugOpen = !debugOpen;
        },
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
            // toggleable items (those declaring a `checked` callback) pass the
            // live boolean through so Menu.svelte can render an explicit off-
            // state indicator; non-toggle items leave `checked` undefined
            if (c.checked) item.checked = c.checked();
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
        checked?: boolean;
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
                onclick: () => (showAbout = true),
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
            canvasController?.focusSelection();
            return;
        }
        const cmd = commandById(commands, id);
        cmd?.run();
    }
</script>

<div class="bg-canvas text-fg flex h-dvh flex-col">
    <header class="border-line bg-canvas-elev flex h-9 items-center gap-0.5 border-b px-2">
        <!-- identity -->
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="25"
            viewBox="1749 135 438 489"
            class="mr-1 shrink-0"
            aria-label="family tree editor"
        >
            <polygon
                fill="var(--color-tree-trunk)"
                stroke="var(--color-line)"
                stroke-width="12"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-miterlimit="10"
                points="2149.367,368.782 2139.871,359.289 2008.219,478.622 1996.79,322.486 1975.788,322.486 1961.608,516.185 1858.209,424.05 1848.711,433.542 1958.628,556.899 1954.167,617.83 2018.409,617.83 2011.329,521.102"
            />
            <path
                fill="#0ea5e9"
                stroke="#0369a1"
                stroke-width="12"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-miterlimit="10"
                d="M2083.975,238.967c0,70.953-26.738,97.688-97.687,97.688c-70.949,0-97.687-26.735-97.687-97.688c0-70.952,26.738-97.687,97.687-97.687C2057.237,141.281,2083.975,168.015,2083.975,238.967z"
            />
            <path
                fill="#f43f5e"
                stroke="#be123c"
                stroke-width="12"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-miterlimit="10"
                d="M1915.633,404.205c0,58.393-22.005,80.395-80.394,80.395c-58.39,0-80.395-22.002-80.395-80.395c0-58.392,22.005-80.395,80.395-80.395C1893.628,323.811,1915.633,345.813,1915.633,404.205z"
            />
            <path
                fill="#fbbf24"
                stroke="#d97706"
                stroke-width="12"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-miterlimit="10"
                d="M2181.424,388.904c0,42.997-16.204,59.198-59.197,59.198c-42.994,0-59.197-16.201-59.197-59.198c0-42.996,16.204-59.197,59.197-59.197C2165.22,329.707,2181.424,345.908,2181.424,388.904z"
            />
        </svg>
        {#if titleEditing}
            <input
                bind:this={titleEl}
                bind:value={titleDraft}
                class="bg-canvas border-accent text-fg rounded border px-1.5 py-0.5 text-sm font-semibold outline-none"
                onblur={commitTitle}
                onkeydown={onTitleKey}
                aria-label="tree title"
            />
        {:else}
            <button
                type="button"
                class="text-fg hover:bg-canvas truncate rounded px-1.5 py-0.5 text-sm font-semibold select-text"
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

        <div class="border-line mx-1.5 h-5 w-px shrink-0 border-l"></div>

        <!-- menus -->
        <MenuBar {menus} />

        <div class="border-line mx-1.5 h-5 w-px shrink-0 border-l"></div>

        <!-- tools -->
        {#if !readOnly}
            <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded"
                class:text-accent={canvasMode === "select"}
                class:text-fg-muted={canvasMode !== "select"}
                title="Select tool (V)"
                aria-label="select tool"
                aria-pressed={canvasMode === "select"}
                onclick={() => handlers.viewSelectTool()}
            >
                <MousePointer2 size={15} />
            </button>
            <!-- Hand tool button removed: behaves the same as Select for
                 the current canvas, so it's redundant chrome. Shortcut H
                 + the Mod-drag pan in canvas still work. -->
            {#if canvasController && (selectedEngine === "layered" || selectedEngine === "family-view")}
                <ZoomWidget
                    scale={canvasScale}
                    displayPercent={zoomDisplayPercent}
                    onzoom={(n: number) => canvasController?.setScale(n)}
                    onfit={() => canvasController?.fit()}
                />
            {/if}
            <div class="border-line mx-0.5 h-5 w-px shrink-0 border-l"></div>
            <button
                type="button"
                class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40"
                title="Delete selected (Del)"
                aria-label="Delete selected"
                disabled={!selection.selectedPersonId}
                onclick={() => handlers.selectDelete()}
            >
                <Trash2 size={15} />
            </button>
            <button
                type="button"
                class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                disabled={!treeStore.canUndo}
                onclick={() => treeStore.undo()}
            >
                <Undo2 size={15} />
            </button>
            <button
                type="button"
                class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
                disabled={!treeStore.canRedo}
                onclick={() => treeStore.redo()}
            >
                <Redo2 size={15} />
            </button>
            {#if authStore.user}
                <button
                    type="button"
                    class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded"
                    title="Share"
                    aria-label="Share"
                    onclick={() => (showShare = !showShare)}
                >
                    <Share2 size={15} />
                </button>
            {/if}
        {/if}
        {#if authStore.user?.role === "admin"}
            <button
                type="button"
                class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded"
                title="Admin"
                aria-label="Admin"
                onclick={() => (showAdmin = !showAdmin)}
            >
                <Shield size={15} />
            </button>
        {/if}
        <button
            type="button"
            class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            onclick={() => (showHelp = true)}
        >
            <HelpCircle size={15} />
        </button>

        <!-- auth (save-status pill mounts in the bottom-left chrome bar) -->
        <div class="ml-auto">
            <AuthBar
                onSignedIn={() => void authStore.fetch()}
                onerror={(msg: string) => toasts.push(msg, "error")}
            />
        </div>
    </header>

    <main
        class="relative flex flex-1 overflow-clip"
        class:flex-row-reverse={prefs.inspectorSide === "left"}
        ondragenter={onDragEnter}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
    >
        <div class="relative flex-1 overflow-clip">
            <ProgressStrip {progress} />
            {#if selectedEngine === "hyperbolic"}
                <HyperbolicCanvas
                    tree={treeStore.tree}
                    selectedId={selection.selectedPersonId}
                    onselect={(id: string) => selection.select(id)}
                    ondeselect={() => selection.select(undefined)}
                    oncontroller={(c: CanvasController) => {
                        canvasController = c;
                        canvasScale = c.getScale();
                        canvasMode = c.getMode();
                    }}
                />
            {:else if selectedEngine === "family-view"}
                <FamilyViewCanvas
                    tree={treeStore.tree}
                    selectedId={selection.selectedPersonId}
                    pathHighlight={pathHighlightEnabled}
                    showGenerationBadge={generationBadgeEnabled}
                    showOverlaySwornBonds={swornBondsEnabled}
                    showOverlayTransformations={transformationsEnabled}
                    showOverlaySeverances={severancesEnabled}
                    showGroupFrames={groupFramesEnabled}
                    showConsanguinity={consanguinityEnabled}
                    crossingMin={crossingMinEnabled}
                    smoothDiff={smoothDiffEnabled}
                    secondaryUnion={secondaryUnionEnabled}
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
                    onlayoutstats={(s: {
                        totalPeople: number;
                        components: number;
                        isolated: number;
                    }) => (layoutStats = s)}
                    onaddRelative={(anchorId: PersonId, kind: "parent" | "partner" | "child") => {
                        if (kind === "parent") addParent(anchorId);
                        else if (kind === "partner") addPartner(anchorId);
                        else addChild(anchorId);
                    }}
                />
            {:else}
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
                    {debugOptions}
                    ontimings={(t: import("$lib/layout/engines/layered-hv").LayeredEngineTimings) =>
                        (debugTimings = t)}
                    lastEditedId={debugLastEditedId}
                    onlayoutstats={(s: {
                        totalPeople: number;
                        components: number;
                        isolated: number;
                    }) => (layoutStats = s)}
                />
            {/if}
            <!-- ZoomWidget moved out of the canvas into the toolbar; the
                 toolbar slot mounts its trigger button + popover. -->

            <!-- Shell bottom-left bar: save-status pill (writable trees),
                 stats pill (layered engine only — family-view / hyperbolic
                 have no cluster analogue), and the debug toolbox pill
                 (lucide Bug, all engines, visible unless the user hides it
                 from the panel). Built as a flex row so future pills slot
                 in without rewiring positions. -->
            {#if !readOnly || statsPillVisible || !debugPillHidden}
                <div
                    class="pointer-events-none absolute bottom-3 left-3 z-30 flex items-center gap-2"
                    data-testid="canvas-bottom-bar"
                    data-canvas-chrome
                >
                    {#if !readOnly}
                        <div class="pointer-events-auto">
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
                        </div>
                    {/if}
                    {#if statsPillVisible && layoutStats}
                        <button
                            type="button"
                            class="fte-pill pointer-events-auto cursor-pointer font-mono"
                            title={layoutStats.components > 1
                                ? `${String(layoutStats.components)} clusters` +
                                  (layoutStats.isolated > 0
                                      ? ` + ${String(layoutStats.isolated)} isolated`
                                      : "")
                                : undefined}
                            onclick={() => (showInspector = !showInspector)}
                            data-testid="stats-pill"
                        >
                            {String(layoutStats.totalPeople)} people
                            {#if layoutStats.components > 1 || layoutStats.isolated > 0}
                                <span class="text-amber-400"
                                    >· {String(
                                        layoutStats.components,
                                    )}{#if layoutStats.isolated > 0}+{String(
                                            layoutStats.isolated,
                                        )}{/if} clusters</span
                                >
                            {/if}
                        </button>
                    {/if}
                    {#if !debugPillHidden}
                        <button
                            type="button"
                            class="fte-pill fte-pill-icon pointer-events-auto"
                            aria-label="toggle debug panel"
                            title="debug panel (Ctrl+Shift+D)"
                            data-testid="debug-pill"
                            onclick={() => (debugOpen = !debugOpen)}
                        >
                            <Bug class="h-3 w-3" />
                        </button>
                    {/if}
                </div>
            {/if}
            {#if debugOpen}
                <!-- Phase 3 (layered-and-tooling plan): sectioned debug
                     panel at bottom-left, anchored above the stats pill.
                     Sections: layout / routing / diagnostics / runtime.
                     Each toggle is a button-style chip (matches the
                     Connections-tab convention for married/primary). -->
                <div
                    class="pointer-events-auto absolute bottom-14 left-3 z-40 max-h-[80vh] w-72 overflow-y-auto rounded-lg border border-line bg-canvas-elev/95 px-3 py-2 text-fg text-xs font-mono shadow-xl backdrop-blur"
                    role="dialog"
                    aria-label="debug overlay controls"
                    data-testid="debug-panel"
                    data-canvas-chrome
                >
                    <div class="mb-2 flex items-center justify-between gap-4">
                        <span
                            class="text-[10px] font-semibold uppercase tracking-wider text-fg-muted"
                            >Debug · Ctrl+Shift+D</span
                        >
                        <button
                            type="button"
                            onclick={() => (debugOpen = false)}
                            aria-label="close"
                            class="text-fg-muted hover:text-fg flex h-4 w-4 items-center justify-center text-xs"
                            >×</button
                        >
                    </div>

                    <!-- layout section (layered-only overlays) -->
                    <div class="mb-2">
                        <div
                            class="mb-1 flex items-baseline gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-fg-muted"
                        >
                            <span>layout</span>
                            {#if !isLayered}
                                <span class="font-normal normal-case tracking-normal opacity-70"
                                    >(layered-only)</span
                                >
                            {/if}
                        </div>
                        <div class="flex flex-wrap gap-1">
                            {#each [["showGrid", "grid"], ["showNodeBounds", "node bounds"], ["showSegmentIds", "segment ids"], ["showComponentBounds", "components"]] as const as [key, label] (key)}
                                <button
                                    type="button"
                                    class="border-line text-fg-muted hover:text-fg rounded border px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-fg-muted"
                                    class:text-accent={debugLayers[key]}
                                    class:border-accent={debugLayers[key]}
                                    disabled={layeredOnlyToggleKeys.has(key) && !isLayered}
                                    title={layeredOnlyToggleKeys.has(key) && !isLayered
                                        ? "layered engine only"
                                        : undefined}
                                    onclick={() => (debugLayers[key] = !debugLayers[key])}
                                    data-testid={`debug-toggle-${key}`}
                                >
                                    {label}
                                </button>
                            {/each}
                        </div>
                    </div>

                    <!-- routing section (layered-only overlays) -->
                    <div class="mb-2">
                        <div
                            class="mb-1 flex items-baseline gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-fg-muted"
                        >
                            <span>routing</span>
                            {#if !isLayered}
                                <span class="font-normal normal-case tracking-normal opacity-70"
                                    >(layered-only)</span
                                >
                            {/if}
                        </div>
                        <div class="flex flex-wrap gap-1">
                            {#each [["showGhostArrows", "ghost arrows"], ["showHops", "bridge hops"], ["showOverlapPairs", "overlap pairs"]] as const as [key, label] (key)}
                                <button
                                    type="button"
                                    class="border-line text-fg-muted hover:text-fg rounded border px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-fg-muted"
                                    class:text-accent={debugLayers[key]}
                                    class:border-accent={debugLayers[key]}
                                    disabled={layeredOnlyToggleKeys.has(key) && !isLayered}
                                    title={layeredOnlyToggleKeys.has(key) && !isLayered
                                        ? "layered engine only"
                                        : undefined}
                                    onclick={() => (debugLayers[key] = !debugLayers[key])}
                                    data-testid={`debug-toggle-${key}`}
                                >
                                    {label}
                                </button>
                            {/each}
                        </div>
                    </div>

                    <!-- diagnostics section (Phase 3 new, layered-only overlays) -->
                    <div class="mb-2">
                        <div
                            class="mb-1 flex items-baseline gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-fg-muted"
                        >
                            <span>diagnostics</span>
                            {#if !isLayered}
                                <span class="font-normal normal-case tracking-normal opacity-70"
                                    >(layered-only)</span
                                >
                            {/if}
                        </div>
                        <div class="flex flex-wrap gap-1">
                            {#each [["showCycleNodes", "cycle nodes"], ["showBondCentroidDelta", "bond/centroid Δ"], ["showOrphanBadge", "orphans"], ["showRankGutterLabels", "rank labels"], ["showLastEditHalo", "last-edit halo"]] as const as [key, label] (key)}
                                <button
                                    type="button"
                                    class="border-line text-fg-muted hover:text-fg rounded border px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-fg-muted"
                                    class:text-accent={debugLayers[key]}
                                    class:border-accent={debugLayers[key]}
                                    disabled={layeredOnlyToggleKeys.has(key) && !isLayered}
                                    title={layeredOnlyToggleKeys.has(key) && !isLayered
                                        ? "layered engine only"
                                        : undefined}
                                    onclick={() => (debugLayers[key] = !debugLayers[key])}
                                    data-testid={`debug-toggle-${key}`}
                                >
                                    {label}
                                </button>
                            {/each}
                        </div>
                    </div>

                    <!-- runtime section -->
                    <div class="mb-2">
                        <div
                            class="mb-1 text-[9px] font-semibold uppercase tracking-wider text-fg-muted"
                        >
                            runtime
                        </div>
                        <div class="flex flex-wrap gap-1">
                            <button
                                type="button"
                                class="border-line text-fg-muted hover:text-fg rounded border px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-fg-muted"
                                class:text-accent={debugLayers.exposeTreeDebug}
                                class:border-accent={debugLayers.exposeTreeDebug}
                                disabled={!exposeTreeDebugSupported}
                                title={exposeTreeDebugSupported
                                    ? undefined
                                    : "layered / hyperbolic engines only"}
                                onclick={() =>
                                    (debugLayers.exposeTreeDebug = !debugLayers.exposeTreeDebug)}
                                data-testid="debug-toggle-exposeTreeDebug"
                            >
                                expose __treeDebug
                            </button>
                            <button
                                type="button"
                                class="border-line text-fg-muted hover:text-fg rounded border px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-fg-muted"
                                disabled={!copySnapshotSupported}
                                onclick={() => void copyLayoutSnapshot()}
                                data-testid="debug-copy-snapshot"
                                title={copySnapshotSupported
                                    ? "copy placed IR + segments to clipboard as JSON"
                                    : "layered engine only"}
                            >
                                copy snapshot
                            </button>
                            <button
                                type="button"
                                class="border-line text-fg-muted hover:text-fg rounded border px-1.5 py-0.5"
                                onclick={forceConflict}
                                disabled={syncStore.revision === null || syncStore.revision <= 0}
                                data-testid="debug-force-conflict"
                                title="bump server revision to trigger the 409 conflict UI on next save (requires sign-in + a synced tree)"
                            >
                                force conflict
                            </button>
                        </div>
                        <!-- dump / load tree JSON -->
                        <textarea
                            class="border-line bg-canvas mt-1.5 h-16 w-full resize-none rounded border px-1 py-0.5 text-[10px] font-mono"
                            placeholder="paste tree JSON, then click load; or click dump to populate"
                            bind:value={debugDumpJson}
                            data-testid="debug-dump-textarea"
                        ></textarea>
                        <div class="mt-1 flex gap-1">
                            <button
                                type="button"
                                class="border-line text-fg-muted hover:text-fg rounded border px-1.5 py-0.5"
                                onclick={dumpTreeJson}
                                data-testid="debug-dump-json"
                            >
                                dump
                            </button>
                            <button
                                type="button"
                                class="border-line text-fg-muted hover:text-fg rounded border px-1.5 py-0.5"
                                onclick={loadTreeJson}
                                data-testid="debug-load-json"
                            >
                                load
                            </button>
                        </div>
                    </div>

                    <!-- pill hide -->
                    <div class="mt-2 border-t border-line/30 pt-1.5">
                        <button
                            type="button"
                            class="text-fg-muted hover:text-fg text-[10px]"
                            onclick={() => (debugPillHidden = !debugPillHidden)}
                        >
                            {debugPillHidden ? "show bug pill" : "permanently hide bug pill"}
                        </button>
                    </div>
                </div>

                <!-- Phase 3 corner readouts (top-right of canvas) -->
                <div
                    class="text-fg-muted bg-canvas-elev/90 border-line pointer-events-none absolute top-3 right-3 z-40 rounded-md border px-2 py-1 text-[10px] font-mono"
                    data-testid="debug-corner-readouts"
                    data-canvas-chrome
                >
                    {#if debugTimings}
                        <div>
                            layer {debugTimings.layer.toFixed(1)} · order {debugTimings.order.toFixed(
                                1,
                            )} · place {debugTimings.place.toFixed(1)} · route {debugTimings.route.toFixed(
                                1,
                            )} = <span class="text-fg">{debugTimings.total.toFixed(1)} ms</span>
                        </div>
                    {/if}
                    <div>
                        editRev <span class="text-fg">{treeStore.tree.editRev}</span>
                        · {Object.keys(treeStore.tree.people).length} people
                    </div>
                </div>
            {/if}
        </div>
        {#if showInspector}
            <Inspector
                tree={treeStore.tree}
                selectedId={selection.selectedPersonId}
                treeId={treeStore.tree.id}
                {portraitUrls}
                {readOnly}
                side={prefs.inspectorSide}
                initialTab={inspectorInitialTab}
                onpatch={onSave}
                onsetParent={setParentLink}
                onunsetParent={unsetParentLink}
                onaddParentRef={addParentRefLink}
                onunsetParentById={unsetParentLinkById}
                onupdateParentRef={updateParentRefLink}
                onaddPartner={addPartnerLink}
                onremovePartner={removePartnerLink}
                onaddChild={addChildLink}
                onremoveChild={removeChildLink}
                oncreateAndLink={createAndLink}
                onselect={(id: string) => focusPerson(id, "personal")}
                onpatchCouple={patchCouple}
                onaddUnionPartner={addUnionPartnerLink}
                onremoveUnionPartner={removeUnionPartnerLink}
                onpatchUnion={patchUnion}
                onsetPreferredUnion={setPreferredUnionLink}
                oncreateAndLinkUnionPartner={createAndLinkUnionPartner}
                onaddRelationship={addRelationshipLink}
                onremoveRelationship={removeRelationshipLink}
                onpatchRelationship={patchRelationship}
                onaddGroup={addGroupLink}
                onremoveGroup={removeGroupLink}
                onpatchGroup={patchGroup}
                onaddGroupMember={addGroupMemberLink}
                onremoveGroupMember={removeGroupMemberLink}
                onaddSibshipDecorator={addSibshipDecoratorLink}
                onremoveSibshipDecorator={removeSibshipDecoratorLink}
                onpatchSibshipDecorator={patchSibshipDecorator}
                onaddSibshipMember={addSibshipMemberLink}
                onremoveSibshipMember={removeSibshipMemberLink}
                onduplicate={duplicatePerson}
                onsetRoot={setRootAction}
                ondelete={deletePerson}
                onclose={() => (showInspector = false)}
                onerror={(msg: string) => toasts.push(msg, "error")}
                onfocus={() => withCanvas((c) => c.focusSelection())}
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

    {#if showAbout}
        <AboutDialog onClose={() => (showAbout = false)} />
    {/if}

    {#if showAdmin}
        <AdminPanel onClose={() => (showAdmin = false)} />
    {/if}

    {#if showHelp}
        <ShortcutsOverlay onclose={() => (showHelp = false)} />
    {/if}

    {#if showSettings}
        <SettingsDialog {prefs} onclose={() => (showSettings = false)} />
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

    {#if showImportWizard}
        <ImportWizard
            store={treeStore}
            currentTree={treeStore.tree}
            currentTreeDirty={treeStore.dirty}
            initialFile={importInitialFile}
            onclose={() => {
                showImportWizard = false;
                importInitialFile = undefined;
            }}
            onsuccess={(info: { treeId: string; sourceFormat: string; count: number }) =>
                void onImportSuccess(info)}
            onfailure={(msg) => toasts.push(`import failed: ${msg}`, "error")}
            onsaveCurrent={async () => {
                await autosaver.flush();
            }}
        />
    {/if}
</div>
