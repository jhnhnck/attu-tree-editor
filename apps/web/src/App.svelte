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
        Users,
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
        LaptopMinimal,
        LaptopMinimalCheck,
        Cloud,
        CloudCheck,
        CloudOff,
        CloudUpload,
        AlertCircle,
        AlertTriangle,
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
    import { migratePreferredUnion } from "$lib/state/preferredUnionMigration";
    import { createTreeStore } from "$lib/state/tree.svelte";
    import {
        createSelectionStore,
        readPersistedSelection,
        writePersistedSelection,
    } from "$lib/state/selection.svelte";
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
    import type {
        DebugLayerOptions,
        FamilyViewDebugLayerOptions,
    } from "$lib/components/tree/debugTypes";

    import TreeCanvas from "$lib/components/tree/TreeCanvas.svelte";
    import HyperbolicCanvas from "$lib/components/tree/HyperbolicCanvas.svelte";
    import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
    import { onFinding } from "$lib/domain/findings";
    import { descendantsOf } from "$lib/domain/tree";
    import { computeAncestorOverlap, formatCoi } from "$lib/domain/consanguinity";
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
    import CanvasChromeDock from "$lib/components/canvas/CanvasChromeDock.svelte";
    import { windowManager, NON_CLOSING_IDS } from "$lib/components/canvas/windowManager.svelte";
    import { dockConfig } from "$lib/components/canvas/dockConfig.svelte";
    import type { DockCorner } from "$lib/components/canvas/dockRegistry.svelte";
    import WindowOverlay from "$lib/components/canvas/WindowOverlay.svelte";
    import Window from "$lib/components/canvas/Window.svelte";
    import DockRegistration from "$lib/components/canvas/DockRegistration.svelte";
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
    // persist the currently-selected person id keyed by tree id so a reload
    // restores the inspector's focus. restoration is done eagerly right
    // after each `treeStore.hydrate(...)` call via `restoreSelectionForCurrentTree`;
    // the effect below only handles writes. the bootstrap-window guard
    // skips the write on first paint so we don't clobber a stored value
    // before the initial hydrate runs.
    $effect(() => {
        const treeId = treeStore.tree.id;
        const selectedId = selection.selectedPersonId;
        if (!firstLoadComplete) return;
        writePersistedSelection(treeId, selectedId);
    });
    function restoreSelectionForCurrentTree(): void {
        const tree = treeStore.tree;
        const persisted = readPersistedSelection(tree.id);
        // clear any in-memory selection first; the previously-loaded tree's
        // selected id has no meaning under the new tree's id-space, and the
        // persistence $effect would otherwise write that stale id under the
        // new tree's storage key.
        if (persisted !== undefined && tree.people[persisted]) {
            selection.select(persisted);
        } else {
            // gate restoration on the loaded tree actually containing that
            // id; if it doesn't (or no value was stored), drop the key and
            // clear selection so the inspector doesn't keep pointing at a
            // person from the previous tree.
            selection.select(undefined);
            if (persisted !== undefined) {
                writePersistedSelection(tree.id, undefined);
            }
        }
    }
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

    // debug overlay state. canvas-window-manager phase 3 splits these
    // two flags apart:
    //   - debugMode: localStorage-persisted master switch. gates the
    //     debug pill's visibility AND every debug-effect overlay
    //     (layered + family-view debugOptions derivations). flipped
    //     from the help menu and from the menu body's "disable debug
    //     mode" button. parallels authDryRunEnabled's persistence
    //     pattern (fte.debug.authDryRun) — plain boolean, no schema
    //     version, debug-flag precedent documented in agents.md.
    //   - debug-menu open-state: owned by windowManager.isOpen("debug-menu")
    //     since canvas-chrome-v2 phase 2 (one state machine for every dock
    //     window). debug-menu is in windowManager's non-persisted set, so it
    //     still does NOT survive a reload; closing the menu (titlebar × or
    //     Ctrl+Shift+D off) leaves debugMode on so the overlays keep
    //     rendering. the icon-pill aria-pressed reads isOpen; the × routes
    //     through windowManager.closeWindow directly (no parallel flag).
    const DEBUG_MODE_LS_KEY = "fte.debug.mode";
    function readDebugModePref(): boolean {
        try {
            const raw =
                typeof localStorage === "undefined"
                    ? null
                    : localStorage.getItem(DEBUG_MODE_LS_KEY);
            return raw === "true";
        } catch {
            return false;
        }
    }
    function writeDebugModePref(on: boolean): void {
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(DEBUG_MODE_LS_KEY, on ? "true" : "false");
            }
        } catch {
            // ignore - quota / disabled storage is non-fatal
        }
    }
    let debugMode = $state(readDebugModePref());
    // persist debugMode whenever it flips. distinct from authDryRun's
    // call-inline pattern because debugMode is toggled from multiple
    // sites (help menu, "disable debug mode" button in menu body)
    // and a centralised $effect avoids missing a writer at any toggle
    // surface.
    $effect(() => {
        writeDebugModePref(debugMode);
    });

    // the sheet-mode inspector bridge resolves the canvas-host via
    // its own DOM query (Inspector.svelte's `findCanvasHost()`
    // walks up to <main> and querySelector('[data-canvas-host]')),
    // so App.svelte no longer needs to track the element ref.
    // the previous `canvasHostEl` $state + `bind:this` lived here
    // for the debug-menu css-var bridge (`--debug-menu-bottom` /
    // `--debug-menu-height`), which deleted when the menu moved
    // into the canvas-chrome dock.

    // auth dry-run debug toggle. localStorage-persisted so the flag
    // survives reloads. when on, auth API calls in client.ts are routed
    // through the stub in auth-stub.ts: clicking "sign in" opens the
    // LinkCodeDialog with a fake code, polls resolve to "ok" after ~6s,
    // and authStore.user becomes DRY_RUN_USER via the normal fetch() path.
    const AUTH_DRY_RUN_LS_KEY = "fte.debug.authDryRun";
    function readAuthDryRunPref(): boolean {
        try {
            const raw =
                typeof localStorage === "undefined"
                    ? null
                    : localStorage.getItem(AUTH_DRY_RUN_LS_KEY);
            return raw === "true";
        } catch {
            return false;
        }
    }
    function writeAuthDryRunPref(on: boolean): void {
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(AUTH_DRY_RUN_LS_KEY, on ? "true" : "false");
            }
        } catch {
            // ignore - quota / disabled storage is non-fatal
        }
    }
    let authDryRunEnabled = $state(readAuthDryRunPref());
    // keep the auth store in sync with the toggle. setDryRun(false) also
    // clears any active stub session so the UI returns to signed-out state.
    $effect(() => {
        authStore.setDryRun(authDryRunEnabled);
    });

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
    // family-view subset mirrored up from FamilyViewCanvas via onsubsetchange
    // so the debug panel can render the off-subset section inline in its own
    // column instead of as a floating panel on the canvas
    let familyViewSubset = $state<import("$lib/layout/engines/family-view").RankedSubset | null>(
        null,
    );
    let showInspector = $state(true);
    let inspectorInitialTab = $state<"personal" | "connections" | "bio">("personal");
    // stats popover: anchored to the people pill in the bottom-left chrome
    // bar. shows editRev (always), and per-person COI + descendant count
    // when a person is selected. canvas-window-manager phase 2 migrated
    // the popover body into a Window (kind="window" priority=25
    // forceCollapsible=false). canvas-chrome-v2 phase 2: expanded-state is
    // owned by windowManager (single source of truth for docked minimize /
    // restore), so this is a derived view of isExpanded; writes go through
    // setExpanded / toggleExpanded.
    const statsPopoverOpen = $derived(windowManager.isExpanded("stats-window"));
    // canvas-window-manager phase 4: configurable stats pill. clicking
    // a row in the stats Window writes its key here; the trigger pill
    // branches on it to render the chosen metric. "people" is the
    // default and survives a missing selection (rows that need a
    // selectedPersonId fall back to the people count). rev moved to
    // the save-status Window, so it doesn't appear in this enum.
    let selectedMetric = $state<"people" | "clusters" | "descendants" | "coi">("people");
    $effect(() => {
        if (!statsPopoverOpen) return;
        const onPointerDown = (e: PointerEvent): void => {
            const target = e.target as Element | null;
            if (!target) return;
            // keep open when the click lands inside the stats Window
            // (docked OR popped-out) or its trigger pill.
            const window = target.closest('[data-window-id="stats-window"]');
            const pill = target.closest('[data-testid="stats-pill"]');
            if (window || pill) return;
            windowManager.setExpanded("stats-window", false);
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    });
    // save-status popover state, lifted from SaveStatusPill in
    // canvas-window-manager phase 0. mirrored as the expanded prop on
    // the save-status Window (kind="window" priority=15
    // forceCollapsible=false).
    //
    // phase-1 regression fix: the pre-migration SaveStatusPill carried
    // its own outside-click-close listener. the migration dropped that
    // listener; we re-wire it here so clicking outside the save-status
    // Window (titlebar OR body) flips popoverOpen=false, matching the
    // pre-migration UX. when the window pops out, its body is rendered
    // in the WindowOverlay; the check walks ancestors looking for the
    // window root carrier (data-window-id="save-status-window") OR the
    // trigger pill so clicks on either keep the popover open.
    //
    // canvas-chrome-v2 phase 2: derived from windowManager.isExpanded (the
    // single source of truth); writes go through setExpanded.
    const savePopoverOpen = $derived(windowManager.isExpanded("save-status-window"));
    $effect(() => {
        if (!savePopoverOpen) return;
        const onPointerDown = (e: PointerEvent): void => {
            const target = e.target as Element | null;
            if (!target) return;
            // keep open when the click lands inside the save-status
            // Window (docked OR popped-out) or its trigger pill.
            const window = target.closest('[data-window-id="save-status-window"]');
            const pill = target.closest('[data-testid="save-status-pill"]');
            if (window || pill) return;
            windowManager.setExpanded("save-status-window", false);
        };
        // capture phase so we run before per-component handlers that
        // might stopPropagation on the bubble.
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    });
    let selectedDescendantCount = $derived.by(() => {
        const sid = selection.selectedPersonId;
        if (!sid || !statsPopoverOpen) return undefined;
        return [...descendantsOf(treeStore.tree, sid)].length;
    });
    let selectedCoi = $derived.by(() => {
        const sid = selection.selectedPersonId;
        if (!sid || !statsPopoverOpen) return undefined;
        return computeAncestorOverlap(treeStore.tree, sid).coi;
    });

    // debug overlay derived. gated on debugMode (the master switch), NOT on
    // the debug-menu open-state. canvas-window-manager phase 3 split:
    // closing the debug menu must NOT clear the overlays — debug effects
    // keep rendering until the user flips debug mode off explicitly.
    let debugOptions = $derived(debugMode ? { layers: debugLayers } : undefined);

    // off-subset groups for the debug panel's family-view section. lifted
    // out of FamilyViewDebugOverlay so the list renders inline in the same
    // column as the toggle chips instead of as a fixed corner overlay.
    const OFF_SUBSET_REASON_ORDER = [
        "secondary-union-not-expanded",
        "non-primary-partner",
        "rank-cutoff",
        "auto-collapsed",
        "unreachable",
    ] as const;
    function offSubsetReasonLabel(
        r: import("$lib/layout/engines/family-view").RejectionReason,
    ): string {
        switch (r) {
            case "rank-cutoff":
                return "rank cutoff";
            case "non-primary-partner":
                return "non-primary partner";
            case "secondary-union-not-expanded":
                return "secondary not expanded";
            case "auto-collapsed":
                return "auto collapsed";
            case "unreachable":
                return "unreachable";
        }
    }
    let offSubsetByReason = $derived.by(() => {
        const out = new Map<import("$lib/layout/engines/family-view").RejectionReason, string[]>();
        for (const r of OFF_SUBSET_REASON_ORDER) out.set(r, []);
        if (!familyViewSubset) return out;
        for (const [pid, reason] of familyViewSubset.rationale) {
            out.get(reason)?.push(pid);
        }
        for (const ids of out.values()) ids.sort();
        return out;
    });
    let offSubsetTotal = $derived.by(() => {
        let total = 0;
        for (const ids of offSubsetByReason.values()) total += ids.length;
        return total;
    });
    function offSubsetNameOf(pid: string): string {
        const p = treeStore.tree.people[pid];
        if (!p) return pid;
        const name = `${p.given} ${p.surname}`.trim();
        return name.length > 0 ? name : pid;
    }

    // family-view debug layer state — distinct interface from
    // `DebugLayerOptions` because the family-view engine has its own
    // overlay geometry (no segment grammar / placedGraph). phase 0
    // ships the walking-skeleton toggles; phases 1-5 extend the set.
    let familyViewDebugLayers = $state<FamilyViewDebugLayerOptions>({
        exposeFamilyDebug: false,
        showVisibleSubset: false,
        // phase 1 connectivity overlays
        showOrphanBadge: false,
        showEdgeRoles: false,
        showOffSubsetPeople: false,
        showSecondaryUnionState: false,
        // phase 2 multi-union geometry
        showMultiUnionManifold: false,
        showCardCollisions: false,
        showCoupleCentroidDelta: false,
        showRankGutterLabels: false,
        // phase 3 navigation diagnostics
        logFocusEvents: false,
        showViewportFitTarget: false,
        showOffSubsetWarning: false,
        showPendingRecenter: false,
        // phase 4 coi inspector
        showCoiBreakdown: false,
        showDuplicateAncestors: false,
        // phase 5 polish + parity + metrics
        showGrid: false,
        showNodeBounds: false,
        showLastEditHalo: false,
        showLayoutMetrics: false,
    });
    // family-view debug overlays — same debugMode gate as the layered
    // engine's debugOptions above.
    let familyViewDebugOptions = $derived(
        debugMode ? { layers: familyViewDebugLayers } : undefined,
    );

    // ---------- phase 3: family-view navigation diagnostics ----------
    //
    // Focus-event log + pending-recenter watchdog live in App.svelte because
    // (a) selection-change origins are all here (palette, keyboard, commands,
    // inspector, card-click bubble), and (b) the canvas only sees the
    // resulting `selectedId` prop with the source info already stripped.
    // The canvas reports back via `onrecenter` so we can flip the per-event
    // `didTriggerCenterOn` flag and cancel the watchdog timer. See
    // `.claude/plans/family-view-debug/log.md` for the full call-path trace.

    interface FocusEvent {
        readonly seq: number;
        readonly ts: number;
        readonly source:
            | "palette"
            | "card-click"
            | "command"
            | "inspector"
            | "context-menu"
            | "keyboard"
            | "programmatic";
        readonly personId: PersonId | undefined;
        readonly requestedRecenter: boolean;
        didTriggerCenterOn: boolean;
    }

    // Capped at 40 entries (rolling window). The overlay panel scrolls; the
    // cap keeps the array allocations bounded on long sessions where every
    // selection change pushes an event.
    const FOCUS_EVENT_CAP = 40;
    let focusEventSeq = 0;
    let focusEvents = $state<FocusEvent[]>([]);

    // The phase-3 watchdog: when a selection event is recorded with
    // `requestedRecenter`, start a 200ms timer. If `onrecenter` fires
    // first, clear the timer and mark the event as triggered. If the
    // timer fires first, the canvas overlay's red corner badge lights up
    // by reading `recenterMissedId` / `recenterMissedReason`.
    const PENDING_RECENTER_MS = 200;
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;
    let recenterMissedId = $state<PersonId | undefined>(undefined);
    let recenterFlashSeq = $state(0);

    function recordFocusEvent(
        source: FocusEvent["source"],
        personId: PersonId | undefined,
        requestedRecenter: boolean,
    ): void {
        // toggle-gated: zero work when the overlay isn't asking for it.
        if (!familyViewDebugLayers.logFocusEvents && !familyViewDebugLayers.showPendingRecenter)
            return;
        focusEventSeq += 1;
        const entry: FocusEvent = {
            seq: focusEventSeq,
            ts: Date.now(),
            source,
            personId,
            requestedRecenter,
            didTriggerCenterOn: false,
        };
        focusEvents = [entry, ...focusEvents].slice(0, FOCUS_EVENT_CAP);
        if (requestedRecenter && personId !== undefined) {
            // arm the watchdog: if no `onrecenter` callback fires within
            // 200ms, surface a red badge.
            if (pendingTimer !== undefined) clearTimeout(pendingTimer);
            recenterMissedId = undefined;
            const missingId = personId;
            void entry.seq;
            pendingTimer = setTimeout(() => {
                pendingTimer = undefined;
                recenterMissedId = missingId;
            }, PENDING_RECENTER_MS);
        }
    }

    function onCanvasRecenter(id: PersonId): void {
        // canvas fired `recenterOn`; cancel the watchdog and mark the
        // most-recent event as triggered. flash counter bumps to drive
        // the green border pulse on the overlay.
        if (pendingTimer !== undefined) {
            clearTimeout(pendingTimer);
            pendingTimer = undefined;
        }
        recenterMissedId = undefined;
        recenterFlashSeq += 1;
        // mark the most-recent matching event (search head of array — it's
        // capped at 40, so the linear scan is cheap)
        const idx = focusEvents.findIndex((e) => e.personId === id && !e.didTriggerCenterOn);
        if (idx >= 0) {
            const entry = focusEvents[idx]!;
            const updated: FocusEvent = { ...entry, didTriggerCenterOn: true };
            const next = focusEvents.slice();
            next[idx] = updated;
            focusEvents = next;
        }
    }

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

    // stats pill mounts in the bottom-left chrome bar whenever the active
    // engine emits onlayoutstats (layered + family-view today; hyperbolic
    // doesn't yet). cluster + isolated counts are layered-only — family-view
    // reports components=1 / isolated=0 so the pill renders as a compact
    // "N people" with no cluster suffix. the debug pill is engine-agnostic.
    let statsPillVisible = $derived(
        (selectedEngine === "layered" || selectedEngine === "family-view") &&
            layoutStats !== undefined,
    );

    // engine-compatibility for debug-panel runtime actions. layered-only
    // overlay toggles live inside an `isLayered` gate in the panel markup
    // now (family-view debug overlay plan phase 0), so the per-key
    // disabled-list isn't needed any more. runtime actions: `copy
    // snapshot` reads the layered placedGraph; `dump` / `load` / `force
    // conflict` are engine-agnostic; `expose __treeDebug` is honored by
    // the layered and hyperbolic canvases (family-view has its own
    // `exposeFamilyDebug` toggle in the family-view section).
    let isLayered = $derived(selectedEngine === "layered");
    // engine-gated panel sections: layered toggles only show in layered
    // mode, family-view toggles only in family-view mode, hyperbolic
    // gets no engine-specific section yet. shared runtime controls (copy
    // snapshot / dump / load / force conflict / expose handle) stay
    // visible in every mode.
    let isFamilyView = $derived(selectedEngine === "family-view");
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
                if (r.ok) {
                    treeStore.hydrate(migratePreferredUnion(r.value.tree));
                    lastSavedAt = r.value.savedAt;
                    restoreSelectionForCurrentTree();
                }
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
            restoreSelectionForCurrentTree();
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
        treeStore.hydrate(migratePreferredUnion(r.value.tree));
        lastSavedAt = r.value.savedAt;
        restoreSelectionForCurrentTree();
        // drop any save the autosave $effect may have queued for the previous
        // tree while loadTree was awaiting; hydrate sets dirty=false so the
        // effect won't re-fire, but a debounced timer from before the load
        // can still be in flight
        autosaver.cancel();
        syncStore.setRevision(1);
        await setSetting(SETTING_KEYS.lastOpenedTreeId, id);
        console.info("[tree] loaded %s (%s)", r.value.tree.name || "untitled", id);
        toasts.push(`loaded ${r.value.tree.name || "untitled"}`, "info", 3000);
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

    type InspectorTab = "personal" | "connections" | "bio";
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

    function focusPerson(
        id: PersonId,
        tab: InspectorTab = "personal",
        source: FocusEvent["source"] = "programmatic",
    ): void {
        selection.select(id);
        showInspector = true;
        inspectorInitialTab = tab;
        // phase-3 family-view debug: log every selection change. caller
        // signals whether it intends to follow up with a recenter via the
        // dedicated palette / command paths; this 3-liner itself never
        // calls `canvasController.focusSelection`, so default to no
        // recenter request and let the caller record one separately when
        // it does follow up.
        recordFocusEvent(source, id, false);
    }

    function blankPerson(surname?: string): Omit<Person, "id"> {
        return {
            given: "New",
            surname: surname ?? "Person",
            gender: "u",
            spouseIds: [],
            display: "z1",
        };
    }

    function addParent(id: PersonId): void {
        const t = treeStore.tree;
        const { tree, id: newId } = addPerson(t, blankPerson(t.people[id]?.surname));
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
        const { tree, id: newId } = addPerson(t, blankPerson(t.people[id]?.surname));
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
        const { tree, id: newId } = addPerson(t, blankPerson(t.people[id]?.surname));
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

    // brief relative-time formatter for the save-status Window body
    // (canvas-window-manager phase 0). mirrors the fmtRel that lived
    // inside SaveStatusPill pre-migration; kept simple — the body
    // re-renders on `lastSavedAt` change so a 10s tick interval here
    // would be redundant noise.
    function fmtRelSimple(ts: number): string {
        const ms = Math.max(0, Date.now() - ts);
        const s = Math.floor(ms / 1000);
        if (s < 5) return "just now";
        if (s < 60) return `${String(s)}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${String(m)}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${String(h)}h ago`;
        const d = Math.floor(h / 24);
        return `${String(d)}d ago`;
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
        viewFocus: () => {
            // phase-3 family-view debug: the `viewFocus` command path
            // also requests a recenter; log it with the selected id so
            // the watchdog can arm and the panel records the source.
            const sid = selection.selectedPersonId;
            if (sid !== undefined) recordFocusEvent("command", sid, true);
            withCanvas((c) => c.focusSelection());
        },
        viewHandTool: () => withCanvas((c) => c.setMode("hand")),
        viewSelectTool: () => withCanvas((c) => c.setMode("select")),
        viewZoomIn: () => withCanvas((c) => c.zoomBy(1.25)),
        viewZoomOut: () => withCanvas((c) => c.zoomBy(0.8)),
        viewCenterRoot: () => {
            // center the viewport on root and also select it - users
            // usually want both (e.g. to start editing or path-tracing
            // from the root after a long pan away)
            const rid = treeStore.tree.rootId;
            if (rid) canvasController?.centerOnPerson(rid);
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
        personAddSibling: () => withSelected((id) => addSibling(id)),
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
        "person.addSibling": Users,
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
            // mirror the canvas context menu's disabled state: sibling
            // needs a selected anchor with at least one parent ref
            personAddSiblingEnabled: () => {
                const sid = selection.selectedPersonId;
                if (!sid) return false;
                const anchor = treeStore.tree.people[sid];
                if (!anchor) return false;
                return getParents(anchor).length > 0;
            },
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
            toggleDebugMenu();
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
    // canvas-chrome-v2 phase 3: dock corner picker. radio-style — exactly
    // one corner is active; selecting persists via dockConfig (fte.dock.corner).
    const DOCK_CORNER_ITEMS: ReadonlyArray<{ corner: DockCorner; label: string }> = [
        { corner: "tl", label: "dock corner: top-left" },
        { corner: "tr", label: "dock corner: top-right" },
        { corner: "bl", label: "dock corner: bottom-left" },
        { corner: "br", label: "dock corner: bottom-right" },
    ];

    // canvas-chrome-v2 phase 3: the full Panels section — every dock window,
    // listed in dock-priority order with a static label (the live window
    // titles carry dynamic suffixes we don't want in the menu). the 5
    // family-view debug panels appear even though they are non-persisted:
    // this is the ONLY way to reopen one after its titlebar × closes it
    // (bugs.md cc2-1). save-status is non-closing so its row is disabled.
    const DOCK_PANEL_ENTRIES: ReadonlyArray<{ id: string; label: string }> = [
        { id: "save-status-window", label: "save status" },
        { id: "stats-window", label: "stats" },
        { id: "debug-menu", label: "debug menu" },
        { id: "family-view-debug-off-subset-warning", label: "off-subset warning" },
        { id: "family-view-debug-recenter-missed", label: "recenter missed" },
        { id: "family-view-debug-coi-breakdown", label: "coi breakdown" },
        { id: "family-view-debug-focus-log", label: "focus log" },
        { id: "family-view-debug-layout-metrics", label: "layout metrics" },
    ];

    // suffix the menu label with the window's docked sub-state so the
    // Panels section reflects windowState, not just open/closed.
    function panelMenuLabel(id: string, base: string): string {
        const st = windowManager.windowState(id);
        if (st === "docked-minimized") return `${base} (minimized)`;
        if (st === "floating") return `${base} (floating)`;
        return base;
    }

    function toggleDockPanel(id: string): void {
        if (windowManager.isOpen(id)) windowManager.closeWindow(id);
        else windowManager.openWindow(id);
    }

    const viewMenu = $derived<MenuConfig>({
        label: "View",
        items: [
            ...menuFromGroup("View", "View").items,
            "divider",
            ...DOCK_CORNER_ITEMS.map((c) => ({
                label: c.label,
                checked: dockConfig.corner === c.corner,
                onclick: () => dockConfig.setCorner(c.corner),
            })),
            "divider",
            ...DOCK_PANEL_ENTRIES.map((p) => ({
                label: panelMenuLabel(p.id, p.label),
                checked: windowManager.isOpen(p.id),
                disabled: NON_CLOSING_IDS.has(p.id),
                onclick: () => toggleDockPanel(p.id),
            })),
        ] satisfies MenuEntry[],
    });
    const insertMenu = $derived<MenuConfig>(menuFromGroup("Insert", "Insert"));
    const treeMenu = $derived<MenuConfig>(menuFromGroup("Tree", "Tree"));
    // help-menu Debug mode toggle: master switch for the debug surface
    // (pill + overlays + menu visibility). flipping off atomically
    // closes the debug-menu Window too — if the user disables debug mode
    // while the menu is open, the menu auto-closes. flipping on does NOT open
    // the menu (the icon-pill click + Ctrl+Shift+D still own the open
    // gesture). decision recorded in the phase 3 retro.
    function toggleDebugMode(): void {
        debugMode = !debugMode;
        if (!debugMode) windowManager.closeWindow("debug-menu");
    }
    // open/close toggle for the debug-menu Window. owns the open gesture
    // (icon-pill click + Ctrl+Shift+D); the menu's open-state lives in
    // windowManager (non-persisted) so isOpen drives the registration gate.
    function toggleDebugMenu(): void {
        if (windowManager.isOpen("debug-menu")) windowManager.closeWindow("debug-menu");
        else windowManager.openWindow("debug-menu");
    }
    const helpMenu = $derived<MenuConfig>({
        label: "Help",
        items: [
            ...menuFromGroup("Help", "Help").items,
            "divider",
            {
                label: "Debug mode",
                checked: debugMode,
                onclick: toggleDebugMode,
            },
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
            // phase-3 family-view debug: palette is THE silent-no-op
            // canary. record selection with `requestedRecenter=true`
            // BEFORE calling focusPerson (which records its own
            // selection event), then arm the watchdog manually here.
            // `focusPerson` records source=palette but with
            // recenter=false; we patch the most-recent entry below.
            focusPerson(id, "personal", "palette");
            // upgrade the just-recorded event to requestedRecenter=true
            // and arm the watchdog. doing this after focusPerson keeps
            // the event ordering stable in the panel.
            armPaletteRecenterWatchdog(id);
            // use the id-taking centerOnPerson rather than focusSelection
            // so we don't race the prop update — the canvas still sees
            // the old `selectedId` on this same tick, so focusSelection
            // would centre on the previous selection. centerOnPerson
            // takes the new id explicitly and also handles off-subset
            // (family-view falls back to focusOverride, layered shifts
            // pan to the matching position).
            canvasController?.centerOnPerson(id);
            return;
        }
        const cmd = commandById(commands, id);
        cmd?.run();
    }

    /**
     * Phase-3 family-view debug helper: upgrades the most-recent
     * `focusPerson`-logged event to `requestedRecenter=true` and arms
     * the 200ms watchdog. Used by callsites that follow `focusPerson`
     * with a `canvasController.focusSelection()`. Cheap no-op when the
     * debug toggles are off.
     */
    function armPaletteRecenterWatchdog(id: PersonId): void {
        if (!familyViewDebugLayers.logFocusEvents && !familyViewDebugLayers.showPendingRecenter)
            return;
        if (focusEvents.length === 0) return;
        const head = focusEvents[0]!;
        if (head.personId !== id) return;
        const updated: FocusEvent = { ...head, requestedRecenter: true };
        const next = focusEvents.slice();
        next[0] = updated;
        focusEvents = next;
        if (pendingTimer !== undefined) clearTimeout(pendingTimer);
        recenterMissedId = undefined;
        void head.seq;
        const missingId = id;
        pendingTimer = setTimeout(() => {
            pendingTimer = undefined;
            recenterMissedId = missingId;
        }, PENDING_RECENTER_MS);
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
                <MousePointer2 size={17} strokeWidth={2.5} />
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
                <Trash2 size={17} strokeWidth={2.5} />
            </button>
            <button
                type="button"
                class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                disabled={!treeStore.canUndo}
                onclick={() => treeStore.undo()}
            >
                <Undo2 size={17} strokeWidth={2.5} />
            </button>
            <button
                type="button"
                class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
                disabled={!treeStore.canRedo}
                onclick={() => treeStore.redo()}
            >
                <Redo2 size={17} strokeWidth={2.5} />
            </button>
            {#if authStore.user}
                <button
                    type="button"
                    class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded"
                    title="Share"
                    aria-label="Share"
                    onclick={() => (showShare = !showShare)}
                >
                    <Share2 size={17} strokeWidth={2.5} />
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
                <Shield size={17} strokeWidth={2.5} />
            </button>
        {/if}
        <button
            type="button"
            class="text-fg hover:bg-canvas flex h-7 w-7 items-center justify-center rounded"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            onclick={() => (showHelp = true)}
        >
            <HelpCircle size={17} strokeWidth={2.5} />
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
        class="relative flex min-h-0 flex-1 overflow-clip"
        class:flex-row-reverse={prefs.inspectorSide === "left"}
        ondragenter={onDragEnter}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
    >
        <div class="relative flex-1 overflow-clip" data-canvas-host>
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
                    onselect={(id: string) => {
                        // phase-3 family-view debug: card-click selection
                        // is a no-recenter event. log it so the focus-
                        // events panel shows source attribution.
                        recordFocusEvent("card-click", id, false);
                        selection.select(id);
                        // if the new selection sits outside the current
                        // family-view subset (e.g. an inspector-link click
                        // landed on a non-primary partner of the focus),
                        // ask the canvas to centre on it. recenterOn falls
                        // back to shifting focusOverride when the id has
                        // no rendered node, so the subset rebuilds around
                        // the new person instead of leaving the canvas
                        // showing the previous focus. uses centerOnPerson
                        // (id-taking) rather than focusSelection so it
                        // doesn't race the prop update with stale
                        // selectedId on this same tick.
                        if (familyViewSubset && !familyViewSubset.visible.has(id)) {
                            canvasController?.centerOnPerson(id);
                        }
                    }}
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
                    onsubsetchange={(
                        subset: import("$lib/layout/engines/family-view").RankedSubset | null,
                    ) => (familyViewSubset = subset)}
                    onaddRelative={(anchorId: PersonId, kind: "parent" | "partner" | "child") => {
                        if (kind === "parent") addParent(anchorId);
                        else if (kind === "partner") addPartner(anchorId);
                        else addChild(anchorId);
                    }}
                    onrecenter={onCanvasRecenter}
                    pendingRecenterSeq={recenterFlashSeq}
                    recenterMissedFor={recenterMissedId}
                    debugOptions={familyViewDebugOptions}
                    focusEventsForOverlay={focusEvents}
                    lastEditedId={debugLastEditedId}
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

            <!-- canvas-chrome dock: registry-driven bottom-left container.
                 every pill and family-view debug panel anchored to this
                 corner flows through the dock via $derived itemsForCorner
                 lookups. it carries data-canvas-chrome so fitToView accounts
                 for the docked items as overlay chrome. -->
            <CanvasChromeDock corner={dockConfig.corner} />

            <!-- canvas-window-manager overlay: hosts popped-out Windows
                 above the canvas at z-30..z-49. mounts once inside the
                 canvas-host so popped-out windows live in host-local
                 coordinates and clamp follows host resize via a
                 ResizeObserver. orphan ids (registry entries that
                 unmount, e.g. family-view panels on engine swap) drop
                 automatically because the overlay iterates
                 popOutStates ∩ idsByKind("window"). -->
            <WindowOverlay />

            <!-- save-status snippet — registered at priority 10 (lowest
                 in the always-visible status band, so it sits flush at the
                 bottom of the corner stack via flex-col-reverse). the
                 popover body has migrated to a sibling Window (kind=
                 "window" priority=15 forceCollapsible=false); the pill
                 only renders the trigger button now. -->
            {#snippet saveStatusSnippet()}
                <SaveStatusPill
                    {lastSavedAt}
                    syncMode={syncStore.mode}
                    {syncedFlashUntil}
                    {lastError}
                    dirty={treeStore.dirty}
                    remoteConfigured={authStore.user !== null}
                    popoverOpen={savePopoverOpen}
                    onPopoverToggle={() => windowManager.pillClick("save-status-window")}
                    onretry={() => void forceSave()}
                    onconflict={() =>
                        toasts.push("save conflict — see console for details", "error")}
                />
            {/snippet}
            <!-- save-status Window body. three rows:
                   - local: glyph + state text (dexie persistence)
                   - remote: glyph + state text (server sync)
                   - runtime: editRev + last layout-pass timings (debug only)
                 the runtime row only renders when debugMode === true. it
                 absorbs the two pieces of data that previously lived in the
                 standalone debug-timings pill (deleted in canvas-window-
                 manager phase 4). data-testid="save-status-popover" stays
                 on the outer wrapper so e2e queries keep resolving. -->
            {#snippet saveStatusBody()}
                <div data-testid="save-status-popover" role="dialog" aria-label="save details">
                    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                        <dt class="text-fg-muted">local</dt>
                        <dd
                            class="text-fg flex items-center gap-1.5"
                            data-testid="save-status-row-local"
                        >
                            <span class={treeStore.dirty ? "text-amber-400" : "text-emerald-400"}>
                                {#if treeStore.dirty}
                                    <LaptopMinimal size={12} />
                                {:else}
                                    <LaptopMinimalCheck size={12} />
                                {/if}
                            </span>
                            <span>
                                {treeStore.dirty
                                    ? "unsaved changes"
                                    : lastSavedAt === undefined
                                      ? "saved"
                                      : `saved · ${fmtRelSimple(lastSavedAt)}`}
                            </span>
                        </dd>
                        <dt class="text-fg-muted">remote</dt>
                        <dd
                            class="text-fg flex items-center gap-1.5"
                            data-testid="save-status-row-remote"
                        >
                            <span
                                class={syncStore.mode === "conflict"
                                    ? "text-amber-400"
                                    : lastError
                                      ? "text-rose-400"
                                      : syncStore.mode === "syncing"
                                        ? "text-amber-400"
                                        : syncedFlashUntil !== undefined &&
                                            syncedFlashUntil > Date.now()
                                          ? "text-sky-400"
                                          : "text-fg-muted"}
                            >
                                {#if syncStore.mode === "conflict"}
                                    <AlertTriangle size={12} />
                                {:else if lastError}
                                    <AlertCircle size={12} />
                                {:else if syncStore.mode === "syncing"}
                                    <CloudUpload size={12} />
                                {:else if syncedFlashUntil !== undefined && syncedFlashUntil > Date.now()}
                                    <CloudCheck size={12} />
                                {:else if authStore.user !== null}
                                    <Cloud size={12} />
                                {:else}
                                    <CloudOff size={12} />
                                {/if}
                            </span>
                            <span>
                                {#if syncStore.mode === "conflict"}
                                    conflict
                                {:else if lastError}
                                    failed
                                {:else if syncStore.mode === "syncing"}
                                    syncing
                                {:else if authStore.user === null}
                                    not configured
                                {:else}
                                    idle
                                {/if}
                            </span>
                        </dd>
                        {#if debugMode}
                            <!-- runtime row: editRev + last layout-pass duration.
                                 these two readouts used to live in a standalone
                                 debug-timings pill at priority 40 in the bl
                                 dock; canvas-window-manager phase 4 relocated
                                 them here so the always-visible chrome is no
                                 longer cluttered while debug mode is on. -->
                            <dt class="text-fg-muted">runtime</dt>
                            <dd
                                class="text-fg flex items-center gap-2 font-mono"
                                data-testid="save-status-row-runtime"
                            >
                                <span class="text-fg-muted">editRev</span>
                                <span data-testid="save-status-edit-rev"
                                    >{String(treeStore.tree.editRev)}</span
                                >
                                {#if debugTimings}
                                    <span class="text-fg-muted">·</span>
                                    <span data-testid="save-status-debug-timings"
                                        >{debugTimings.total.toFixed(1)} ms</span
                                    >
                                {/if}
                            </dd>
                        {/if}
                        {#if lastError}
                            <dt class="text-rose-400">error</dt>
                            <dd class="text-rose-400 wrap-break-word">{lastError}</dd>
                        {/if}
                    </dl>
                    <button
                        type="button"
                        class="fte-window-button mt-3"
                        onclick={() => {
                            windowManager.setExpanded("save-status-window", false);
                            void forceSave();
                        }}
                    >
                        Force save
                    </button>
                </div>
            {/snippet}
            {#snippet saveStatusWindow(_ctx: { forcedCollapse: boolean })}
                <Window
                    id="save-status-window"
                    pillId="save-status"
                    title="save"
                    expanded={savePopoverOpen}
                    forcedCollapse={false}
                    closeable={false}
                    onToggleExpanded={() => windowManager.toggleExpanded("save-status-window")}
                    body={saveStatusBody}
                />
            {/snippet}
            {#if !readOnly && windowManager.isOpen("save-status-window")}
                <DockRegistration
                    id="save-status"
                    corner={dockConfig.corner}
                    priority={10}
                    kind="pill"
                    windowId="save-status-window"
                    render={saveStatusSnippet}
                />
                <DockRegistration
                    id="save-status-window"
                    corner={dockConfig.corner}
                    priority={15}
                    kind="window"
                    forceCollapsible={false}
                    render={saveStatusWindow}
                />
            {/if}

            <!-- canvas-window-manager phase 4: the standalone debug-timings
                 pill (was at priority 40 with data-testid="debug-corner-
                 readouts") deletes here. its two pieces of data — editRev
                 and debugTimings.total — relocate to the save-status
                 Window's runtime row (gated by debugMode), so the always-
                 visible chrome is no longer cluttered with debug values
                 while debug mode is on. -->

            <!-- stats pill, registered at priority 20. trigger button only —
                 the popover body migrated to a sibling Window (kind="window"
                 priority=25 forceCollapsible=false) in canvas-window-manager
                 phase 2. canvas-window-manager phase 4 makes the pill text
                 configurable: clicking a row in the stats Window body sets
                 `selectedMetric`, which this snippet branches on. people is
                 the default; rows that need a selection fall back to the
                 people count when no person is selected. -->
            {#snippet statsPillSnippet()}
                {#if layoutStats}
                    <button
                        type="button"
                        class="fte-pill cursor-pointer font-mono"
                        title={selectedMetric === "clusters"
                            ? "clusters (click to switch metric)"
                            : selectedMetric === "descendants"
                              ? "selected descendants (click to switch metric)"
                              : selectedMetric === "coi"
                                ? "selected coi (click to switch metric)"
                                : "people (click to switch metric)"}
                        aria-pressed={statsPopoverOpen}
                        aria-haspopup="dialog"
                        aria-expanded={statsPopoverOpen}
                        onclick={() => windowManager.pillClick("stats-window")}
                        data-testid="stats-pill"
                        data-selected-metric={selectedMetric}
                    >
                        {#if selectedMetric === "clusters" && layoutStats.components > 1}
                            <span class="text-amber-400"
                                >{String(
                                    layoutStats.components,
                                )}{#if layoutStats.isolated > 0}+{String(layoutStats.isolated)}{/if}
                                clusters</span
                            >
                        {:else if selectedMetric === "descendants" && selection.selectedPersonId}
                            <span
                                >{selectedDescendantCount === undefined
                                    ? "—"
                                    : String(selectedDescendantCount)} descendants</span
                            >
                        {:else if selectedMetric === "coi" && selection.selectedPersonId}
                            <span
                                >coi {selectedCoi !== undefined && selectedCoi > 0
                                    ? formatCoi(selectedCoi)
                                    : "—"}</span
                            >
                        {:else}
                            {String(layoutStats.totalPeople)} people
                        {/if}
                    </button>
                {/if}
            {/snippet}
            <!-- stats Window body. each row is a button — clicking it sets
                 `selectedMetric` and (for the always-visible metrics) keeps
                 the popover open. the row tagged as the currently selected
                 metric carries aria-pressed=true + accent styling so users
                 can see which value the pill is reflecting. rev moved to
                 the save-status Window's runtime row in phase 4. -->
            {#snippet statsBody()}
                {#if layoutStats}
                    <div
                        class="text-fg flex flex-col gap-0.5 font-mono"
                        role="dialog"
                        aria-label="tree stats"
                        data-testid="stats-popover"
                    >
                        <button
                            type="button"
                            class={[
                                "fte-window-row rounded px-1.5 py-0.5 text-left",
                                selectedMetric === "people"
                                    ? "bg-accent/10 text-accent"
                                    : "hover:bg-canvas-elev",
                            ]}
                            aria-pressed={selectedMetric === "people"}
                            onclick={() => (selectedMetric = "people")}
                            data-testid="stats-row-people"
                        >
                            <span>people</span>
                            <span>{String(layoutStats.totalPeople)}</span>
                        </button>
                        {#if layoutStats.components > 1}
                            <button
                                type="button"
                                class={[
                                    "fte-window-row rounded px-1.5 py-0.5 text-left",
                                    selectedMetric === "clusters"
                                        ? "bg-accent/10 text-accent"
                                        : "hover:bg-canvas-elev",
                                ]}
                                aria-pressed={selectedMetric === "clusters"}
                                onclick={() => (selectedMetric = "clusters")}
                                data-testid="stats-row-clusters"
                            >
                                <span>clusters</span>
                                <span class="text-amber-400"
                                    >{String(
                                        layoutStats.components,
                                    )}{#if layoutStats.isolated > 0}+{String(
                                            layoutStats.isolated,
                                        )}{/if}</span
                                >
                            </button>
                        {/if}
                        {#if selection.selectedPersonId}
                            <div class="mt-1 border-t border-line pt-1 text-fg-muted">selected</div>
                            <button
                                type="button"
                                class={[
                                    "fte-window-row rounded px-1.5 py-0.5 text-left",
                                    selectedMetric === "descendants"
                                        ? "bg-accent/10 text-accent"
                                        : "hover:bg-canvas-elev",
                                ]}
                                aria-pressed={selectedMetric === "descendants"}
                                onclick={() => (selectedMetric = "descendants")}
                                data-testid="stats-row-descendants"
                            >
                                <span>descendants</span>
                                <span
                                    >{selectedDescendantCount === undefined
                                        ? "—"
                                        : String(selectedDescendantCount)}</span
                                >
                            </button>
                            <button
                                type="button"
                                class={[
                                    "fte-window-row rounded px-1.5 py-0.5 text-left",
                                    selectedMetric === "coi"
                                        ? "bg-accent/10 text-accent"
                                        : "hover:bg-canvas-elev",
                                ]}
                                aria-pressed={selectedMetric === "coi"}
                                onclick={() => (selectedMetric = "coi")}
                                data-testid="stats-row-coi"
                            >
                                <span>coi</span>
                                <span
                                    >{selectedCoi !== undefined && selectedCoi > 0
                                        ? formatCoi(selectedCoi)
                                        : "—"}</span
                                >
                            </button>
                        {/if}
                    </div>
                {/if}
            {/snippet}
            {#snippet statsWindow(_ctx: { forcedCollapse: boolean })}
                <Window
                    id="stats-window"
                    pillId="stats"
                    title="stats"
                    expanded={statsPopoverOpen}
                    forcedCollapse={false}
                    onToggleExpanded={() => windowManager.toggleExpanded("stats-window")}
                    body={statsBody}
                />
            {/snippet}
            {#if statsPillVisible && layoutStats && windowManager.isOpen("stats-window")}
                <DockRegistration
                    id="stats"
                    corner={dockConfig.corner}
                    priority={20}
                    kind="pill"
                    windowId="stats-window"
                    render={statsPillSnippet}
                />
                <DockRegistration
                    id="stats-window"
                    corner={dockConfig.corner}
                    priority={25}
                    kind="window"
                    forceCollapsible={false}
                    render={statsWindow}
                />
            {/if}

            <!-- phase 1 migration: debug-icon (bug) pill. all engines.
                 canvas-window-manager phase 3: visibility now derives
                 from debugMode (the master switch flipped from the
                 help menu's "Debug mode" toggle). registered at
                 priority 30 so it sorts after stats (20); the
                 standalone debug-timings pill (was at priority 40)
                 deleted in canvas-window-manager phase 4. -->
            {#snippet debugIconSnippet()}
                <button
                    type="button"
                    class="fte-pill fte-pill-icon"
                    aria-label="toggle debug panel"
                    title="debug panel (Ctrl+Shift+D)"
                    data-testid="debug-pill"
                    aria-pressed={windowManager.isOpen("debug-menu")}
                    onclick={() => toggleDebugMenu()}
                >
                    <Bug size={12} />
                </button>
            {/snippet}
            {#if debugMode}
                <DockRegistration
                    id="debug-toggle"
                    corner={dockConfig.corner}
                    priority={30}
                    kind="pill"
                    windowId="debug-menu"
                    render={debugIconSnippet}
                />
            {/if}
            <!-- debug menu — canvas-window-manager phase 2 migrated this
                 surface from kind="panel" to kind="window" so it shares the
                 Window primitive's titlebar (collapse / pop-out / close)
                 with every other floating canvas surface. priority 300,
                 forceCollapsible=false retained — opting out of force-
                 collapse keeps the menu at its full measured height
                 (primary control surface beats glance-and-go status)
                 while the rest of the bl stack collapses around it on
                 cramped viewports. close (×) on the Window's titlebar
                 routes through windowManager.closeWindow("debug-menu"),
                 unmounting the registration; the custom inline
                 `Debug · Ctrl+Shift+D ×` titlebar that lived inside the
                 body deleted in this migration.

                 sections: layout / routing / diagnostics / runtime.
                 each toggle is a button-style chip (matches the
                 connections-tab convention for married/primary). the
                 height clamp uses a viewport-aware min so the menu
                 shrinks on small viewports without overrunning the
                 dock's cap — 80vh on tall viewports, otherwise
                 `100vh - inspector sheet height - 16rem` to leave
                 room for the dock's pill row + at least one expanded
                 debug panel below the menu on cramped desktop
                 viewports, while still being tight enough at 480x600
                 that overflow engages the dock's force-collapse pass. -->
            {#snippet debugMenuBody()}
                <div
                    class="pointer-events-auto max-h-[min(80vh,calc(100vh-var(--inspector-sheet-height,0px)-16rem))] overflow-y-auto text-fg text-xs font-mono"
                    role="dialog"
                    aria-label="debug overlay controls"
                    data-testid="debug-panel"
                >
                    <!-- top-right "disable debug mode" — distinct from
                         the Window titlebar's × (which only closes the
                         menu while leaving debugMode on). this button
                         flips the master switch off so the pill +
                         overlays + menu all retire in one click. -->
                    <div class="mb-1 flex justify-end">
                        <button
                            type="button"
                            class="text-fg-muted hover:text-fg text-[10px]"
                            onclick={() => {
                                debugMode = false;
                                windowManager.closeWindow("debug-menu");
                            }}
                            data-testid="debug-disable"
                        >
                            disable debug mode
                        </button>
                    </div>
                    <!-- layered-engine sections: only visible while the
                         layered engine is mounted. family-view + hyperbolic
                         get their own section blocks below; shared runtime
                         controls (further down) stay visible in every mode. -->
                    {#if isLayered}
                        <!-- layout section (layered-only overlays) -->
                        <div class="mb-2">
                            <div class="fte-window-section">
                                <span>layout</span>
                            </div>
                            <div class="flex flex-wrap gap-1">
                                {#each [["showGrid", "grid"], ["showNodeBounds", "node bounds"], ["showSegmentIds", "segment ids"], ["showComponentBounds", "components"]] as const as [key, label] (key)}
                                    <button
                                        type="button"
                                        class={[
                                            "rounded border px-1.5 py-0.5",
                                            debugLayers[key]
                                                ? "border-accent text-accent bg-accent/10"
                                                : "border-line text-fg-muted hover:text-fg",
                                        ]}
                                        aria-pressed={debugLayers[key]}
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
                            <div class="fte-window-section">
                                <span>routing</span>
                            </div>
                            <div class="flex flex-wrap gap-1">
                                {#each [["showGhostArrows", "ghost arrows"], ["showHops", "bridge hops"], ["showOverlapPairs", "overlap pairs"]] as const as [key, label] (key)}
                                    <button
                                        type="button"
                                        class={[
                                            "rounded border px-1.5 py-0.5",
                                            debugLayers[key]
                                                ? "border-accent text-accent bg-accent/10"
                                                : "border-line text-fg-muted hover:text-fg",
                                        ]}
                                        aria-pressed={debugLayers[key]}
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
                            <div class="fte-window-section">
                                <span>diagnostics</span>
                            </div>
                            <div class="flex flex-wrap gap-1">
                                {#each [["showCycleNodes", "cycle nodes"], ["showBondCentroidDelta", "bond/centroid Δ"], ["showOrphanBadge", "orphans"], ["showRankGutterLabels", "rank labels"], ["showLastEditHalo", "last-edit halo"]] as const as [key, label] (key)}
                                    <button
                                        type="button"
                                        class={[
                                            "rounded border px-1.5 py-0.5",
                                            debugLayers[key]
                                                ? "border-accent text-accent bg-accent/10"
                                                : "border-line text-fg-muted hover:text-fg",
                                        ]}
                                        aria-pressed={debugLayers[key]}
                                        onclick={() => (debugLayers[key] = !debugLayers[key])}
                                        data-testid={`debug-toggle-${key}`}
                                    >
                                        {label}
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- family-view section: only visible while the
                         family-view engine is mounted. phase 0 walking
                         skeleton ships two toggles; phases 1-5 extend. -->
                    {#if isFamilyView}
                        <div class="mb-2" data-testid="debug-section-family-view">
                            <div class="fte-window-section">
                                <span>family-view</span>
                            </div>
                            <div class="flex flex-wrap gap-1">
                                {#each [["showVisibleSubset", "visible subset"], ["exposeFamilyDebug", "expose __treeDebug"], ["showOrphanBadge", "orphan badge"], ["showEdgeRoles", "edge roles"], ["showOffSubsetPeople", "off-subset people"], ["showSecondaryUnionState", "secondary-union state"], ["showMultiUnionManifold", "multi-union manifold"], ["showCardCollisions", "card collisions"], ["showCoupleCentroidDelta", "couple/centroid Δ"], ["showRankGutterLabels", "rank labels"], ["logFocusEvents", "focus events"], ["showViewportFitTarget", "viewport/target"], ["showOffSubsetWarning", "off-subset warning"], ["showPendingRecenter", "pending recenter"], ["showCoiBreakdown", "coi breakdown"], ["showDuplicateAncestors", "duplicate ancestors"], ["showGrid", "grid"], ["showNodeBounds", "node bounds"], ["showLastEditHalo", "last-edit halo"], ["showLayoutMetrics", "layout metrics"]] as const as [key, label] (key)}
                                    <button
                                        type="button"
                                        class={[
                                            "rounded border px-1.5 py-0.5",
                                            familyViewDebugLayers[key]
                                                ? "border-accent text-accent bg-accent/10"
                                                : "border-line text-fg-muted hover:text-fg",
                                        ]}
                                        aria-pressed={familyViewDebugLayers[key]}
                                        onclick={() =>
                                            (familyViewDebugLayers[key] =
                                                !familyViewDebugLayers[key])}
                                        data-testid={`debug-toggle-fv-${key}`}
                                    >
                                        {label}
                                    </button>
                                {/each}
                            </div>

                            <!-- off-subset list, surfaced inline so it sits
                                 in the debug menu's column instead of as a
                                 floating fixed-position panel on the canvas.
                                 visible only when the showOffSubsetPeople
                                 toggle is on. -->
                            {#if familyViewDebugLayers.showOffSubsetPeople && familyViewSubset}
                                <div
                                    class="mt-2 border-t border-line/30 pt-1.5"
                                    data-testid="family-view-debug-off-subset-panel"
                                >
                                    <div class="fte-window-section justify-between">
                                        <span>off-subset</span>
                                        <span data-testid="family-view-debug-off-subset-total"
                                            >{offSubsetTotal}</span
                                        >
                                    </div>
                                    {#if offSubsetTotal === 0}
                                        <div class="text-[10px] text-fg-muted">
                                            every person in tree is visible
                                        </div>
                                    {:else}
                                        {#each OFF_SUBSET_REASON_ORDER as reason (reason)}
                                            {@const ids = offSubsetByReason.get(reason) ?? []}
                                            {#if ids.length > 0}
                                                <div class="mt-1 text-[10px]" data-reason={reason}>
                                                    <div class="flex justify-between text-accent">
                                                        <span>{offSubsetReasonLabel(reason)}</span>
                                                        <span>{ids.length}</span>
                                                    </div>
                                                    <ul class="m-0 mt-0.5 list-none p-0">
                                                        {#each ids.slice(0, 20) as pid (pid)}
                                                            <li data-person-id={pid}>
                                                                {offSubsetNameOf(pid)}
                                                            </li>
                                                        {/each}
                                                        {#if ids.length > 20}
                                                            <li class="text-fg-muted">
                                                                +{ids.length - 20} more
                                                            </li>
                                                        {/if}
                                                    </ul>
                                                </div>
                                            {/if}
                                        {/each}
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <!-- runtime section -->
                    <div class="mb-2">
                        <div class="fte-window-section">runtime</div>
                        <div class="flex flex-wrap gap-1">
                            <button
                                type="button"
                                class={[
                                    "rounded border px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-fg-muted",
                                    debugLayers.exposeTreeDebug
                                        ? "border-accent text-accent bg-accent/10"
                                        : "border-line text-fg-muted hover:text-fg",
                                ]}
                                aria-pressed={debugLayers.exposeTreeDebug}
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

                    <!-- shell section: session/auth shims for ui testing -->
                    <div class="mb-2">
                        <div class="fte-window-section">shell</div>
                        <div class="flex flex-wrap gap-1">
                            <button
                                type="button"
                                class={[
                                    "rounded border px-1.5 py-0.5",
                                    authDryRunEnabled
                                        ? "border-accent text-accent bg-accent/10"
                                        : "border-line text-fg-muted hover:text-fg",
                                ]}
                                aria-pressed={authDryRunEnabled}
                                onclick={() => {
                                    authDryRunEnabled = !authDryRunEnabled;
                                    writeAuthDryRunPref(authDryRunEnabled);
                                }}
                                data-testid="debug-toggle-authDryRun"
                                title="synthesise a client-side session so protected-action gating flows without discord linking. backend calls still 401."
                            >
                                auth dry-run
                            </button>
                        </div>
                    </div>
                </div>
            {/snippet}
            {#snippet debugMenuWindow(_ctx: { forcedCollapse: boolean })}
                <Window
                    id="debug-menu"
                    pillId="debug-toggle"
                    title="Debug · Ctrl+Shift+D"
                    expanded={true}
                    forcedCollapse={false}
                    onToggleExpanded={() => windowManager.closeWindow("debug-menu")}
                    body={debugMenuBody}
                />
            {/snippet}
            {#if windowManager.isOpen("debug-menu")}
                <DockRegistration
                    id="debug-menu"
                    corner={dockConfig.corner}
                    priority={300}
                    kind="window"
                    forceCollapsible={false}
                    render={debugMenuWindow}
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
