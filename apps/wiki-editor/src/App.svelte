<script lang="ts">
    import { Shell, ContextMenu } from "@attu/ui";
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
    import WikiEditorPills from "./lib/WikiEditorPills.svelte";

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
                { label: "Preferences…", icon: Settings, onclick: () => {} },
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
                    onclick: () => {},
                },
                "divider",
                { label: "Report an issue", onclick: () => {} },
                { label: "About", icon: HelpCircle, onclick: () => {} },
            ],
        },
    ];
</script>

<Shell title={pageTitle || "untitled"} {menus}>
    {#snippet logo()}
        <BookOpen size={18} strokeWidth={2} class="text-accent shrink-0" />
    {/snippet}
    {#snippet toolbar()}
        <Toolbar />
    {/snippet}
    {#snippet dock()}
        <WikiEditorPills />
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
    {/snippet}
    <Editor
        bind:this={editor}
        onselectionchange={handleSelectionChange}
        oncontextmenu={handleContextMenu}
    />
</Shell>
