<script lang="ts">
    import {
        Shell,
        ContextMenu,
        dockStore,
        DockCorner,
        DockItem,
        DockWindow,
        DockSurface,
        DockModal,
    } from "@attu/ui";
    import type { MenuConfig, ContextMenuItem } from "@attu/ui";
    import {
        BookOpen,
        Undo2,
        Redo2,
        FilePlus,
        FolderOpen,
        Save,
        Download,
        History,
        Info,
        Scissors,
        Copy,
        Clipboard,
        Search,
        Replace,
        Bold,
        Italic,
        Strikethrough,
        Superscript,
        Subscript,
        Code,
        Link2,
        ExternalLink,
        List,
        ListOrdered,
        Indent,
        Outdent,
        Table,
        BookMarked,
        Eye,
        ZoomIn,
        ZoomOut,
        WrapText,
        AlignLeft,
        Focus,
        BarChart3,
        Settings,
        Keyboard,
        HelpCircle,
        Flag,
    } from "@lucide/svelte";
    import Editor from "./lib/Editor.svelte";
    import Toolbar from "./lib/Toolbar.svelte";
    import SelectionBar from "./lib/SelectionBar.svelte";
    import SettingsModal from "./lib/SettingsModal.svelte";
    import ShortcutsOverlay from "./lib/ShortcutsOverlay.svelte";

    let { title: pageTitle }: { title: string } = $props();

    let editor:
        | {
              undoEdit: () => void;
              redoEdit: () => void;
              getCursorCoords: () => { x: number; y: number } | null;
          }
        | undefined;

    let selectionCoords = $state<{ x: number; y: number } | null>(null);
    let hasSelection = $state(false);

    function handleSelectionChange(hasSelection_: boolean) {
        hasSelection = hasSelection_;
        selectionCoords = hasSelection_ && editor ? editor.getCursorCoords() : null;
    }

    type ContextType =
        | "selection"
        | "wikilink"
        | "external-link"
        | "template"
        | "reference"
        | "table"
        | "image";

    let contextMenu = $state<{ type: ContextType; x: number; y: number } | null>(null);

    function handleContextMenu(ctx: { type: ContextType; x: number; y: number }) {
        contextMenu = ctx;
    }

    const D: ContextMenuItem = { divider: true };
    const stub = () => {};

    const contextMenuItems = $derived<readonly ContextMenuItem[]>(
        !contextMenu
            ? []
            : contextMenu.type === "selection"
              ? [
                    { label: "Cut", onclick: stub, disabled: !hasSelection },
                    { label: "Copy", onclick: stub, disabled: !hasSelection },
                    { label: "Paste", onclick: stub },
                    { label: "Paste as plain text", onclick: stub },
                    D,
                    { label: "Bold", onclick: stub },
                    { label: "Italic", onclick: stub },
                    { label: "Wikilink…", onclick: stub },
                    { label: "Wrap in nowiki", onclick: stub },
                    { label: "Toggle comment", onclick: stub },
                    D,
                    { label: "Find…", onclick: stub },
                    { label: "Replace…", onclick: stub },
                ]
              : contextMenu.type === "wikilink"
                ? [
                      { label: "Open page (new tab)", onclick: stub },
                      { label: "Edit link…", onclick: stub },
                      { label: "Remove link (keep display text)", onclick: stub },
                      { label: "Copy link target", onclick: stub },
                  ]
                : contextMenu.type === "external-link"
                  ? [
                        { label: "Open in new tab", onclick: stub },
                        { label: "Edit link…", onclick: stub },
                        { label: "Remove link", onclick: stub },
                        { label: "Copy URL", onclick: stub },
                    ]
                  : contextMenu.type === "template"
                    ? [
                          { label: "Edit template parameters…", onclick: stub },
                          { label: "View template documentation", onclick: stub },
                          { label: "Substitute (subst:)", onclick: stub },
                          { label: "Remove template", onclick: stub },
                      ]
                    : contextMenu.type === "reference"
                      ? [
                            { label: "Edit reference…", onclick: stub },
                            { label: "Convert to named reference…", onclick: stub },
                            { label: "Reuse this reference", onclick: stub },
                            { label: "Remove reference", onclick: stub },
                        ]
                      : contextMenu.type === "table"
                        ? [
                              { label: "Insert row above", onclick: stub },
                              { label: "Insert row below", onclick: stub },
                              D,
                              { label: "Insert column left", onclick: stub },
                              { label: "Insert column right", onclick: stub },
                              D,
                              { label: "Delete row", onclick: stub },
                              { label: "Delete column", onclick: stub },
                              { label: "Delete table", onclick: stub },
                              D,
                              { label: "Table properties…", onclick: stub },
                              { label: "Copy table as wikitext", onclick: stub },
                          ]
                        : [
                              // image
                              { label: "View file page (new tab)", onclick: stub },
                              { label: "Edit image options…", onclick: stub },
                              { label: "Replace image…", onclick: stub },
                              { label: "Remove image", onclick: stub },
                          ],
    );

    // dock corner — persisted to localStorage
    const WIKI_DOCK_CORNER_LS_KEY = "wiki.dock.corner";
    function readCornerPref(): "bl" | "tl" | "tr" | "br" {
        try {
            const raw =
                typeof localStorage === "undefined"
                    ? null
                    : localStorage.getItem(WIKI_DOCK_CORNER_LS_KEY);
            if (raw === "bl" || raw === "tl" || raw === "tr" || raw === "br") return raw;
        } catch {
            // ignore
        }
        return "bl";
    }
    let corner = $state<"bl" | "tl" | "tr" | "br">(readCornerPref());
    $effect(() => {
        try {
            if (typeof localStorage !== "undefined")
                localStorage.setItem(WIKI_DOCK_CORNER_LS_KEY, corner);
        } catch {
            // ignore
        }
    });

    const menus: MenuConfig[] = [
        {
            label: "File",
            items: [
                { label: "New page…", icon: FilePlus, onclick: () => {} },
                { label: "Open page…", icon: FolderOpen, onclick: () => {} },
                { label: "Open sandbox", onclick: () => {} },
                "divider",
                { label: "Save…", icon: Save, shortcut: "Ctrl+S", onclick: () => {} },
                { label: "Save minor edit…", shortcut: "Ctrl+Shift+S", onclick: () => {} },
                "divider",
                { label: "Download wikitext", icon: Download, onclick: () => {} },
                { label: "Print / export PDF", onclick: () => {} },
                "divider",
                { label: "Page history", icon: History, onclick: () => {} },
                { label: "Page info", icon: Info, onclick: () => {} },
                { label: "What links here", onclick: () => {} },
            ],
        },
        {
            label: "Edit",
            items: [
                { label: "Undo", icon: Undo2, shortcut: "Ctrl+Z", onclick: () => {} },
                { label: "Redo", icon: Redo2, shortcut: "Ctrl+Y", onclick: () => {} },
                "divider",
                { label: "Cut", icon: Scissors, shortcut: "Ctrl+X", onclick: () => {} },
                { label: "Copy", icon: Copy, shortcut: "Ctrl+C", onclick: () => {} },
                { label: "Paste", icon: Clipboard, shortcut: "Ctrl+V", onclick: () => {} },
                { label: "Paste as plain text", shortcut: "Ctrl+Shift+V", onclick: () => {} },
                "divider",
                { label: "Select all", shortcut: "Ctrl+A", onclick: () => {} },
                "divider",
                { label: "Find…", icon: Search, shortcut: "Ctrl+F", onclick: () => {} },
                { label: "Find & replace…", icon: Replace, shortcut: "Ctrl+H", onclick: () => {} },
                { label: "Go to line…", shortcut: "Ctrl+G", onclick: () => {} },
                "divider",
                { label: "Toggle comment", shortcut: "Ctrl+/", onclick: () => {} },
                { label: "Wrap in nowiki", onclick: () => {} },
            ],
        },
        {
            label: "Insert",
            items: [
                // links — most common wiki insert action
                { label: "Wikilink…", icon: Link2, shortcut: "Ctrl+K", onclick: () => {} },
                {
                    label: "External link…",
                    icon: ExternalLink,
                    shortcut: "Ctrl+Shift+K",
                    onclick: () => {},
                },
                "divider",
                // headings — H2 and H3 cover 90% of article structure
                { label: "Heading 2", onclick: () => {} },
                { label: "Heading 3", onclick: () => {} },
                {
                    label: "More headings",
                    submenu: [
                        { label: "Heading 4", onclick: () => {} },
                        { label: "Heading 5", onclick: () => {} },
                        { label: "Heading 6", onclick: () => {} },
                        "divider",
                        { label: "Horizontal rule", onclick: () => {} },
                        { label: "Block quote", onclick: () => {} },
                        { label: "Preformatted block", onclick: () => {} },
                    ],
                },
                "divider",
                // lists
                { label: "Bullet list item", icon: List, onclick: () => {} },
                { label: "Numbered list item", icon: ListOrdered, onclick: () => {} },
                {
                    label: "More lists",
                    submenu: [
                        { label: "Definition term / definition", onclick: () => {} },
                        "divider",
                        { label: "Increase indent", icon: Indent, onclick: () => {} },
                        { label: "Decrease indent", icon: Outdent, onclick: () => {} },
                    ],
                },
                "divider",
                // content objects
                { label: "Table…", icon: Table, onclick: () => {} },
                { label: "Image / file…", onclick: () => {} },
                { label: "Template…", shortcut: "Ctrl+T", onclick: () => {} },
                {
                    label: "More templates",
                    submenu: [
                        { label: "Infobox…", onclick: () => {} },
                        { label: "Magic word…", onclick: () => {} },
                        { label: "Parser function…", onclick: () => {} },
                    ],
                },
                { label: "Reference / citation…", onclick: () => {} },
                {
                    label: "More references",
                    submenu: [
                        { label: "Named reference…", onclick: () => {} },
                        { label: "Reuse reference…", onclick: () => {} },
                        { label: "References list", onclick: () => {} },
                    ],
                },
                { label: "Special character…", onclick: () => {} },
                "divider",
                // auxiliary / infrequent
                {
                    label: "Other",
                    submenu: [
                        { label: "Redirect…", onclick: () => {} },
                        { label: "Anchor / bookmark", onclick: () => {} },
                        "divider",
                        { label: "Gallery", onclick: () => {} },
                        { label: "File link", onclick: () => {} },
                        "divider",
                        { label: "Math formula…", onclick: () => {} },
                        { label: "Signature", onclick: () => {} },
                        { label: "Table of contents", onclick: () => {} },
                        { label: "Timestamp", onclick: () => {} },
                    ],
                },
            ],
        },
        {
            label: "Format",
            items: [
                { label: "Bold", icon: Bold, shortcut: "Ctrl+B", onclick: () => {} },
                { label: "Italic", icon: Italic, shortcut: "Ctrl+I", onclick: () => {} },
                { label: "Bold + italic", onclick: () => {} },
                "divider",
                { label: "Strikethrough", icon: Strikethrough, onclick: () => {} },
                { label: "Superscript", icon: Superscript, shortcut: "Ctrl+.", onclick: () => {} },
                { label: "Subscript", icon: Subscript, shortcut: "Ctrl+,", onclick: () => {} },
                "divider",
                { label: "Inline code", icon: Code, shortcut: "Ctrl+`", onclick: () => {} },
                { label: "Computer block", onclick: () => {} },
                { label: "Nowiki span", onclick: () => {} },
                "divider",
                { label: "Remove markup", onclick: () => {} },
            ],
        },
        {
            label: "View",
            items: [
                { label: "Preview", icon: Eye, shortcut: "Ctrl+P", onclick: () => {} },
                { label: "Side-by-side", onclick: () => {} },
                { label: "Wikitext diff", onclick: () => {} },
                "divider",
                { label: "Line numbers", onclick: () => {} },
                { label: "Word wrap", icon: WrapText, onclick: () => {} },
                { label: "Minimap", onclick: () => {} },
                { label: "Syntax highlighting theme", onclick: () => {} },
                "divider",
                {
                    label: "Zoom",
                    submenu: [
                        { label: "Zoom in", icon: ZoomIn, shortcut: "Ctrl+=", onclick: () => {} },
                        { label: "Zoom out", icon: ZoomOut, shortcut: "Ctrl+-", onclick: () => {} },
                        { label: "Reset zoom", shortcut: "Ctrl+0", onclick: () => {} },
                    ],
                },
                "divider",
                { label: "Zen mode", icon: Focus, shortcut: "Ctrl+Shift+F", onclick: () => {} },
                { label: "Full-width editor", icon: AlignLeft, onclick: () => {} },
            ],
        },
        {
            label: "Page",
            items: [
                { label: "Categories…", onclick: () => {} },
                { label: "Watchlist", icon: Flag, onclick: () => {} },
                "divider",
                { label: "Move / rename…", onclick: () => {} },
                { label: "Protect…", disabled: true },
                { label: "Delete…", disabled: true, danger: true },
                "divider",
                { label: "Page logs", onclick: () => {} },
                { label: "Related changes", onclick: () => {} },
                "divider",
                { label: "Permanent link", onclick: () => {} },
                { label: "Cite this page", onclick: () => {} },
            ],
        },
        {
            label: "Tools",
            items: [
                { label: "Word count", icon: BarChart3, onclick: () => {} },
                { label: "Check wikilinks", onclick: () => {} },
                { label: "Spellcheck language…", onclick: () => {} },
                "divider",
                {
                    label: "Preferences…",
                    icon: Settings,
                    onclick: () => dockStore.openModal("settings"),
                },
            ],
        },
        {
            label: "Help",
            items: [
                { label: "Wikitext reference", icon: BookMarked, onclick: () => {} },
                {
                    label: "Keyboard shortcuts",
                    icon: Keyboard,
                    shortcut: "Ctrl+?",
                    onclick: () => dockStore.openModal("shortcuts"),
                },
                "divider",
                { label: "Report an issue", onclick: () => {} },
                { label: "About", icon: HelpCircle, onclick: () => {} },
            ],
        },
    ];
</script>

<svelte:window
    onkeydown={(e: KeyboardEvent) => {
        if (e.key === "?" && e.ctrlKey && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            dockStore.openModal("shortcuts");
        }
    }}
/>

<Shell title={pageTitle || "untitled"} {menus}>
    {#snippet logo()}
        <BookOpen size={18} strokeWidth={2} class="text-accent shrink-0" />
    {/snippet}
    {#snippet toolbar()}
        <Toolbar />
    {/snippet}
    {#snippet overlays()}
        <SelectionBar coords={selectionCoords} />
        {#if contextMenu}
            <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                items={contextMenuItems}
                onclose={() => (contextMenu = null)}
            />
        {/if}
        <DockSurface />
    {/snippet}

    <!-- editor + dock chrome -->
    <div class="relative flex min-h-0 flex-1 overflow-hidden">
        <Editor
            bind:this={editor}
            onselectionchange={handleSelectionChange}
            oncontextmenu={handleContextMenu}
        />

        <!-- dock corner renders all registered pills and windows -->
        <DockCorner {corner} />

        <!-- save-status pill -->
        {#snippet savePillRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <button
                type="button"
                class="fte-pill"
                aria-pressed={dockStore.isExpanded("save-window")}
                onclick={() => dockStore.pillClick("save-window")}
                data-testid="wiki-save-pill"
            >
                saved
            </button>
        {/snippet}
        {#snippet saveWindowRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <DockWindow id="save-window" title="save">
                {#snippet body()}
                    <div class="fte-window-row mb-2"><span>Last saved</span><span>—</span></div>
                    <button
                        type="button"
                        class="fte-window-button pointer-events-none opacity-50"
                        disabled
                    >
                        Save now
                    </button>
                {/snippet}
            </DockWindow>
        {/snippet}
        <DockItem
            id="wiki-save"
            kind="pill"
            {corner}
            priority={10}
            windowId="save-window"
            render={savePillRender}
        />
        <DockItem
            id="save-window"
            kind="window"
            {corner}
            priority={15}
            title="save"
            render={saveWindowRender}
        />

        <!-- stats pill -->
        {#snippet statsPillRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <button
                type="button"
                class="fte-pill"
                aria-pressed={dockStore.isExpanded("stats-window")}
                onclick={() => dockStore.pillClick("stats-window")}
                data-testid="wiki-stats-pill"
            >
                — words
            </button>
        {/snippet}
        {#snippet statsWindowRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <DockWindow id="stats-window" title="statistics">
                {#snippet body()}
                    <div class="fte-window-row"><span>Words</span><span>—</span></div>
                    <div class="fte-window-row"><span>Characters</span><span>—</span></div>
                    <div class="fte-window-row"><span>Sections</span><span>—</span></div>
                    <div class="fte-window-row"><span>Wikilinks</span><span>—</span></div>
                    <div class="fte-window-row"><span>External links</span><span>—</span></div>
                    <div class="fte-window-row"><span>Templates</span><span>—</span></div>
                    <div class="fte-window-row"><span>References</span><span>—</span></div>
                {/snippet}
            </DockWindow>
        {/snippet}
        <DockItem
            id="wiki-stats"
            kind="pill"
            {corner}
            priority={20}
            windowId="stats-window"
            render={statsPillRender}
        />
        <DockItem
            id="stats-window"
            kind="window"
            {corner}
            priority={25}
            title="statistics"
            render={statsWindowRender}
        />

        <!-- preview pill -->
        {#snippet previewPillRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <button
                type="button"
                class="fte-pill"
                aria-pressed={dockStore.isExpanded("preview-window")}
                onclick={() => dockStore.pillClick("preview-window")}
                data-testid="wiki-preview-pill"
            >
                preview off
            </button>
        {/snippet}
        {#snippet previewWindowRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <DockWindow id="preview-window" title="preview">
                {#snippet body()}
                    <p class="text-xs text-fg-muted">work in progress</p>
                {/snippet}
            </DockWindow>
        {/snippet}
        <DockItem
            id="wiki-preview"
            kind="pill"
            {corner}
            priority={30}
            windowId="preview-window"
            render={previewPillRender}
        />
        <DockItem
            id="preview-window"
            kind="window"
            {corner}
            priority={35}
            title="preview"
            render={previewWindowRender}
        />

        <!-- editor mode pill -->
        {#snippet modePillRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <button
                type="button"
                class="fte-pill"
                aria-pressed={dockStore.isExpanded("mode-window")}
                onclick={() => dockStore.pillClick("mode-window")}
                data-testid="wiki-mode-pill"
            >
                source
            </button>
        {/snippet}
        {#snippet modeWindowRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <DockWindow id="mode-window" title="editor mode">
                {#snippet body()}
                    <p class="text-xs text-fg-muted">work in progress</p>
                {/snippet}
            </DockWindow>
        {/snippet}
        <DockItem
            id="wiki-mode"
            kind="pill"
            {corner}
            priority={40}
            windowId="mode-window"
            render={modePillRender}
        />
        <DockItem
            id="mode-window"
            kind="window"
            {corner}
            priority={45}
            title="editor mode"
            render={modeWindowRender}
        />

        <!-- modal: preferences -->
        {#snippet settingsModalRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <DockModal id="settings" title="Preferences" size="lg">
                {#snippet children()}
                    <SettingsModal />
                {/snippet}
            </DockModal>
        {/snippet}
        <DockItem
            id="settings"
            kind="modal"
            {corner}
            priority={0}
            title="Preferences"
            render={settingsModalRender}
        />

        <!-- modal: keyboard shortcuts -->
        {#snippet shortcutsModalRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <DockModal id="shortcuts" title="Keyboard Shortcuts">
                {#snippet children()}
                    <ShortcutsOverlay />
                {/snippet}
            </DockModal>
        {/snippet}
        <DockItem
            id="shortcuts"
            kind="modal"
            {corner}
            priority={0}
            title="Keyboard Shortcuts"
            render={shortcutsModalRender}
        />
    </div>
</Shell>
