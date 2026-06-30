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
    import { createWikiPreferencesStore, type Theme as WikiTheme, type DockCorner as WikiDockCorner } from "./lib/state/preferences.svelte.js";

    let { title: pageTitle }: { title: string } = $props();

    let editor: EditorBinding | undefined = $state();

    interface EditorBinding {
        undoEdit: () => void;
        redoEdit: () => void;
        getCursorCoords: () => { x: number; y: number } | null;
        applyBold: () => void;
        applyItalic: () => void;
        applyBoldItalic: () => void;
        applyStrikethrough: () => void;
        applySuperscript: () => void;
        applySubscript: () => void;
        applyInlineCode: () => void;
        applyNowiki: () => void;
        applyHeading: (level: 2 | 3 | 4 | 5 | 6) => void;
        applyBulletList: () => void;
        applyNumberedList: () => void;
        applyIndent: () => void;
        applyOutdent: () => void;
        applyBlockquote: () => void;
        applyHorizontalRule: () => void;
        applyPreformatted: () => void;
        applyClearBlockMarkup: () => void;
    }

    let selectionCoords = $state<{ x: number; y: number } | null>(null);
    let hasSelection = $state(false);

    function handleSelectionChange(hasSelection_: boolean) {
        hasSelection = hasSelection_;
        selectionCoords = hasSelection_ && editor ? editor.getCursorCoords() : null;
    }

    type ContextType =
        "selection" | "wikilink" | "external-link" | "template" | "reference" | "table" | "image";

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

    const prefs = createWikiPreferencesStore();
    prefs.hydrate();
    const corner = $derived(prefs.corner);

    // snapshot/revert for settings dialog discard
    type WikiSettingsSnapshot = {
        theme: WikiTheme; corner: WikiDockCorner;
        fontFamily: string; fontSize: string; tabSize: string; syntaxTheme: string;
        lineWrap: boolean; lineNumbers: boolean; minimap: boolean;
        bracketMatching: boolean; trimTrailingWhitespace: boolean;
        autosaveEnabled: boolean; autosaveInterval: string; autosaveStorage: string;
        previewMode: string; previewTrigger: string; previewTheme: string;
    };
    let wikiSettingsSnapshot = $state<WikiSettingsSnapshot | null>(null);

    function snapshotWikiSettings(): void {
        wikiSettingsSnapshot = {
            theme: prefs.theme, corner: prefs.corner,
            fontFamily: prefs.fontFamily, fontSize: prefs.fontSize,
            tabSize: prefs.tabSize, syntaxTheme: prefs.syntaxTheme,
            lineWrap: prefs.lineWrap, lineNumbers: prefs.lineNumbers,
            minimap: prefs.minimap, bracketMatching: prefs.bracketMatching,
            trimTrailingWhitespace: prefs.trimTrailingWhitespace,
            autosaveEnabled: prefs.autosaveEnabled, autosaveInterval: prefs.autosaveInterval,
            autosaveStorage: prefs.autosaveStorage, previewMode: prefs.previewMode,
            previewTrigger: prefs.previewTrigger, previewTheme: prefs.previewTheme,
        };
    }

    function revertWikiSettings(): void {
        const s = wikiSettingsSnapshot;
        if (!s) return;
        prefs.setTheme(s.theme); prefs.setCorner(s.corner);
        prefs.setFontFamily(s.fontFamily); prefs.setFontSize(s.fontSize);
        prefs.setTabSize(s.tabSize); prefs.setSyntaxTheme(s.syntaxTheme);
        prefs.setLineWrap(s.lineWrap); prefs.setLineNumbers(s.lineNumbers);
        prefs.setMinimap(s.minimap); prefs.setBracketMatching(s.bracketMatching);
        prefs.setTrimTrailingWhitespace(s.trimTrailingWhitespace);
        prefs.setAutosaveEnabled(s.autosaveEnabled);
        prefs.setAutosaveInterval(s.autosaveInterval);
        prefs.setAutosaveStorage(s.autosaveStorage);
        prefs.setPreviewMode(s.previewMode); prefs.setPreviewTrigger(s.previewTrigger);
        prefs.setPreviewTheme(s.previewTheme);
        wikiSettingsSnapshot = null;
    }

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
                { label: "heading 2", onclick: () => editor?.applyHeading(2) },
                { label: "heading 3", onclick: () => editor?.applyHeading(3) },
                {
                    label: "more headings",
                    submenu: [
                        { label: "heading 4", onclick: () => editor?.applyHeading(4) },
                        { label: "heading 5", onclick: () => editor?.applyHeading(5) },
                        { label: "heading 6", onclick: () => editor?.applyHeading(6) },
                        "divider",
                        { label: "horizontal rule", onclick: () => editor?.applyHorizontalRule() },
                        { label: "block quote", onclick: () => editor?.applyBlockquote() },
                        { label: "preformatted block", onclick: () => editor?.applyPreformatted() },
                    ],
                },
                "divider",
                // lists
                { label: "bullet list item", icon: List, onclick: () => editor?.applyBulletList() },
                {
                    label: "numbered list item",
                    icon: ListOrdered,
                    onclick: () => editor?.applyNumberedList(),
                },
                {
                    label: "more lists",
                    submenu: [
                        { label: "definition term / definition", onclick: () => {} },
                        "divider",
                        {
                            label: "increase indent",
                            icon: Indent,
                            onclick: () => editor?.applyIndent(),
                        },
                        {
                            label: "decrease indent",
                            icon: Outdent,
                            onclick: () => editor?.applyOutdent(),
                        },
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
                {
                    label: "bold",
                    icon: Bold,
                    shortcut: "Ctrl+B",
                    onclick: () => editor?.applyBold(),
                },
                {
                    label: "italic",
                    icon: Italic,
                    shortcut: "Ctrl+I",
                    onclick: () => editor?.applyItalic(),
                },
                { label: "bold + italic", onclick: () => editor?.applyBoldItalic() },
                "divider",
                {
                    label: "strikethrough",
                    icon: Strikethrough,
                    onclick: () => editor?.applyStrikethrough(),
                },
                {
                    label: "superscript",
                    icon: Superscript,
                    shortcut: "Ctrl+.",
                    onclick: () => editor?.applySuperscript(),
                },
                {
                    label: "subscript",
                    icon: Subscript,
                    shortcut: "Ctrl+,",
                    onclick: () => editor?.applySubscript(),
                },
                "divider",
                {
                    label: "inline code",
                    icon: Code,
                    shortcut: "Ctrl+`",
                    onclick: () => editor?.applyInlineCode(),
                },
                { label: "computer block", onclick: () => {} },
                { label: "nowiki span", onclick: () => editor?.applyNowiki() },
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
        <Toolbar {editor} />
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
            <DockDialog id="settings" title="Preferences" size="lg"
                onopen={snapshotWikiSettings}
                onsave={() => { wikiSettingsSnapshot = null; }}
                ondiscard={revertWikiSettings}
            >
                {#snippet children()}
                    <SettingsModal {prefs} />
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
