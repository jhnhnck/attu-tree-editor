<script lang="ts">
    import {
        Shell,
        ContextMenu,
        dockStore,
        DockCorner,
        DockEntry,
        DockSurface,
        DockDialog,
        SaveStatusPill,
        StatsPill,
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
                    { label: "cut", onclick: stub, disabled: !hasSelection },
                    { label: "copy", onclick: stub, disabled: !hasSelection },
                    { label: "paste", onclick: stub },
                    { label: "paste as plain text", onclick: stub },
                    D,
                    { label: "bold", onclick: stub },
                    { label: "italic", onclick: stub },
                    { label: "wikilink…", onclick: stub },
                    { label: "wrap in nowiki", onclick: stub },
                    { label: "toggle comment", onclick: stub },
                    D,
                    { label: "find…", onclick: stub },
                    { label: "replace…", onclick: stub },
                ]
              : contextMenu.type === "wikilink"
                ? [
                      { label: "open page (new tab)", onclick: stub },
                      { label: "edit link…", onclick: stub },
                      { label: "remove link (keep display text)", onclick: stub },
                      { label: "copy link target", onclick: stub },
                  ]
                : contextMenu.type === "external-link"
                  ? [
                        { label: "open in new tab", onclick: stub },
                        { label: "edit link…", onclick: stub },
                        { label: "remove link", onclick: stub },
                        { label: "copy url", onclick: stub },
                    ]
                  : contextMenu.type === "template"
                    ? [
                          { label: "edit template parameters…", onclick: stub },
                          { label: "view template documentation", onclick: stub },
                          { label: "substitute (subst:)", onclick: stub },
                          { label: "remove template", onclick: stub },
                      ]
                    : contextMenu.type === "reference"
                      ? [
                            { label: "edit reference…", onclick: stub },
                            { label: "convert to named reference…", onclick: stub },
                            { label: "reuse this reference", onclick: stub },
                            { label: "remove reference", onclick: stub },
                        ]
                      : contextMenu.type === "table"
                        ? [
                              { label: "insert row above", onclick: stub },
                              { label: "insert row below", onclick: stub },
                              D,
                              { label: "insert column left", onclick: stub },
                              { label: "insert column right", onclick: stub },
                              D,
                              { label: "delete row", onclick: stub },
                              { label: "delete column", onclick: stub },
                              { label: "delete table", onclick: stub },
                              D,
                              { label: "table properties…", onclick: stub },
                              { label: "copy table as wikitext", onclick: stub },
                          ]
                        : [
                              // image
                              { label: "view file page (new tab)", onclick: stub },
                              { label: "edit image options…", onclick: stub },
                              { label: "replace image…", onclick: stub },
                              { label: "remove image", onclick: stub },
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
            label: "file",
            items: [
                { label: "new page…", icon: FilePlus, onclick: () => {} },
                { label: "open page…", icon: FolderOpen, onclick: () => {} },
                { label: "open sandbox", onclick: () => {} },
                "divider",
                { label: "save…", icon: Save, shortcut: "Ctrl+S", onclick: () => {} },
                { label: "save minor edit…", shortcut: "Ctrl+Shift+S", onclick: () => {} },
                "divider",
                { label: "download wikitext", icon: Download, onclick: () => {} },
                { label: "print / export pdf", onclick: () => {} },
                "divider",
                { label: "page history", icon: History, onclick: () => {} },
                { label: "page info", icon: Info, onclick: () => {} },
                { label: "what links here", onclick: () => {} },
            ],
        },
        {
            label: "edit",
            items: [
                { label: "undo", icon: Undo2, shortcut: "Ctrl+Z", onclick: () => {} },
                { label: "redo", icon: Redo2, shortcut: "Ctrl+Y", onclick: () => {} },
                "divider",
                { label: "cut", icon: Scissors, shortcut: "Ctrl+X", onclick: () => {} },
                { label: "copy", icon: Copy, shortcut: "Ctrl+C", onclick: () => {} },
                { label: "paste", icon: Clipboard, shortcut: "Ctrl+V", onclick: () => {} },
                { label: "paste as plain text", shortcut: "Ctrl+Shift+V", onclick: () => {} },
                "divider",
                { label: "select all", shortcut: "Ctrl+A", onclick: () => {} },
                "divider",
                { label: "find…", icon: Search, shortcut: "Ctrl+F", onclick: () => {} },
                { label: "find & replace…", icon: Replace, shortcut: "Ctrl+H", onclick: () => {} },
                { label: "go to line…", shortcut: "Ctrl+G", onclick: () => {} },
                "divider",
                { label: "toggle comment", shortcut: "Ctrl+/", onclick: () => {} },
                { label: "wrap in nowiki", onclick: () => {} },
            ],
        },
        {
            label: "insert",
            items: [
                // links — most common wiki insert action
                { label: "wikilink…", icon: Link2, shortcut: "Ctrl+K", onclick: () => {} },
                {
                    label: "external link…",
                    icon: ExternalLink,
                    shortcut: "Ctrl+Shift+K",
                    onclick: () => {},
                },
                "divider",
                // headings — H2 and H3 cover 90% of article structure
                { label: "heading 2", onclick: () => {} },
                { label: "heading 3", onclick: () => {} },
                {
                    label: "more headings",
                    submenu: [
                        { label: "heading 4", onclick: () => {} },
                        { label: "heading 5", onclick: () => {} },
                        { label: "heading 6", onclick: () => {} },
                        "divider",
                        { label: "horizontal rule", onclick: () => {} },
                        { label: "block quote", onclick: () => {} },
                        { label: "preformatted block", onclick: () => {} },
                    ],
                },
                "divider",
                // lists
                { label: "bullet list item", icon: List, onclick: () => {} },
                { label: "numbered list item", icon: ListOrdered, onclick: () => {} },
                {
                    label: "more lists",
                    submenu: [
                        { label: "definition term / definition", onclick: () => {} },
                        "divider",
                        { label: "increase indent", icon: Indent, onclick: () => {} },
                        { label: "decrease indent", icon: Outdent, onclick: () => {} },
                    ],
                },
                "divider",
                // content objects
                { label: "table…", icon: Table, onclick: () => {} },
                { label: "image / file…", onclick: () => {} },
                { label: "template…", shortcut: "Ctrl+T", onclick: () => {} },
                {
                    label: "more templates",
                    submenu: [
                        { label: "infobox…", onclick: () => {} },
                        { label: "magic word…", onclick: () => {} },
                        { label: "parser function…", onclick: () => {} },
                    ],
                },
                { label: "reference / citation…", onclick: () => {} },
                {
                    label: "more references",
                    submenu: [
                        { label: "named reference…", onclick: () => {} },
                        { label: "reuse reference…", onclick: () => {} },
                        { label: "references list", onclick: () => {} },
                    ],
                },
                { label: "special character…", onclick: () => {} },
                "divider",
                // auxiliary / infrequent
                {
                    label: "other",
                    submenu: [
                        { label: "redirect…", onclick: () => {} },
                        { label: "anchor / bookmark", onclick: () => {} },
                        "divider",
                        { label: "gallery", onclick: () => {} },
                        { label: "file link", onclick: () => {} },
                        "divider",
                        { label: "math formula…", onclick: () => {} },
                        { label: "signature", onclick: () => {} },
                        { label: "table of contents", onclick: () => {} },
                        { label: "timestamp", onclick: () => {} },
                    ],
                },
            ],
        },
        {
            label: "format",
            items: [
                { label: "bold", icon: Bold, shortcut: "Ctrl+B", onclick: () => {} },
                { label: "italic", icon: Italic, shortcut: "Ctrl+I", onclick: () => {} },
                { label: "bold + italic", onclick: () => {} },
                "divider",
                { label: "strikethrough", icon: Strikethrough, onclick: () => {} },
                { label: "superscript", icon: Superscript, shortcut: "Ctrl+.", onclick: () => {} },
                { label: "subscript", icon: Subscript, shortcut: "Ctrl+,", onclick: () => {} },
                "divider",
                { label: "inline code", icon: Code, shortcut: "Ctrl+`", onclick: () => {} },
                { label: "computer block", onclick: () => {} },
                { label: "nowiki span", onclick: () => {} },
                "divider",
                { label: "remove markup", onclick: () => {} },
            ],
        },
        {
            label: "view",
            items: [
                { label: "preview", icon: Eye, shortcut: "Ctrl+P", onclick: () => {} },
                { label: "side-by-side", onclick: () => {} },
                { label: "wikitext diff", onclick: () => {} },
                "divider",
                { label: "line numbers", onclick: () => {} },
                { label: "word wrap", icon: WrapText, onclick: () => {} },
                { label: "minimap", onclick: () => {} },
                { label: "syntax highlighting theme", onclick: () => {} },
                "divider",
                {
                    label: "zoom",
                    submenu: [
                        { label: "zoom in", icon: ZoomIn, shortcut: "Ctrl+=", onclick: () => {} },
                        { label: "zoom out", icon: ZoomOut, shortcut: "Ctrl+-", onclick: () => {} },
                        { label: "reset zoom", shortcut: "Ctrl+0", onclick: () => {} },
                    ],
                },
                "divider",
                { label: "zen mode", icon: Focus, shortcut: "Ctrl+Shift+F", onclick: () => {} },
                { label: "full-width editor", icon: AlignLeft, onclick: () => {} },
            ],
        },
        {
            label: "page",
            items: [
                { label: "categories…", onclick: () => {} },
                { label: "watchlist", icon: Flag, onclick: () => {} },
                "divider",
                { label: "move / rename…", onclick: () => {} },
                { label: "protect…", disabled: true },
                { label: "delete…", disabled: true, danger: true },
                "divider",
                { label: "page logs", onclick: () => {} },
                { label: "related changes", onclick: () => {} },
                "divider",
                { label: "permanent link", onclick: () => {} },
                { label: "cite this page", onclick: () => {} },
            ],
        },
        {
            label: "tools",
            items: [
                { label: "word count", icon: BarChart3, onclick: () => {} },
                { label: "check wikilinks", onclick: () => {} },
                { label: "spellcheck language…", onclick: () => {} },
                "divider",
                {
                    label: "preferences…",
                    icon: Settings,
                    onclick: () => dockStore.openDialog("settings"),
                },
            ],
        },
        {
            label: "help",
            items: [
                { label: "wikitext reference", icon: BookMarked, onclick: () => {} },
                {
                    label: "keyboard shortcuts",
                    icon: Keyboard,
                    shortcut: "Ctrl+?",
                    onclick: () => dockStore.openDialog("shortcuts"),
                },
                "divider",
                { label: "report an issue", onclick: () => {} },
                { label: "about", icon: HelpCircle, onclick: () => {} },
            ],
        },
    ];
</script>

<svelte:window
    onkeydown={(e: KeyboardEvent) => {
        if (e.key === "?" && e.ctrlKey && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            dockStore.openDialog("shortcuts");
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

        <!-- save-status pill (shared attu-ui component) -->
        <SaveStatusPill pillId="wiki-save" panelId="save-window" {corner} priority={10} />

        <!-- stats pill (shared attu-ui component) -->
        <StatsPill
            pillId="wiki-stats"
            panelId="stats-window"
            {corner}
            priority={20}
            rows={[
                { label: "words", value: "-" },
                { label: "characters", value: "-" },
                { label: "sections", value: "-" },
                { label: "wikilinks", value: "-" },
                { label: "external links", value: "-" },
                { label: "templates", value: "-" },
                { label: "references", value: "-" },
            ]}
        />

        <!-- modal: preferences -->
        {#snippet settingsModalRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <DockDialog id="settings" title="Preferences" size="lg">
                {#snippet children()}
                    <SettingsModal />
                {/snippet}
            </DockDialog>
        {/snippet}
        <DockEntry
            id="settings"
            kind="dialog"
            {corner}
            priority={0}
            title="Preferences"
            render={settingsModalRender}
        />

        <!-- modal: keyboard shortcuts -->
        {#snippet shortcutsModalRender(_ctx: import("@attu/ui").DockRenderCtx)}
            <DockDialog id="shortcuts" title="Keyboard Shortcuts">
                {#snippet children()}
                    <ShortcutsOverlay />
                {/snippet}
            </DockDialog>
        {/snippet}
        <DockEntry
            id="shortcuts"
            kind="dialog"
            {corner}
            priority={0}
            title="Keyboard Shortcuts"
            render={shortcutsModalRender}
        />
    </div>
</Shell>
