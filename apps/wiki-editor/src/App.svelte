<script lang="ts">
    import { Shell } from "@attu/ui";
    import type { MenuConfig } from "@attu/ui";
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

    let { title: pageTitle }: { title: string } = $props();

    let editor: { undoEdit: () => void; redoEdit: () => void } | undefined;

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
                {
                    label: "Headings & blocks",
                    submenu: [
                        { label: "Heading 2", onclick: () => {} },
                        { label: "Heading 3", onclick: () => {} },
                        { label: "Heading 4", onclick: () => {} },
                        { label: "Heading 5", onclick: () => {} },
                        { label: "Heading 6", onclick: () => {} },
                        "divider",
                        { label: "Horizontal rule", onclick: () => {} },
                        { label: "Block quote", onclick: () => {} },
                        { label: "Preformatted block", onclick: () => {} },
                    ],
                },
                {
                    label: "Links",
                    submenu: [
                        {
                            label: "Wikilink…",
                            icon: Link2,
                            shortcut: "Ctrl+K",
                            onclick: () => {},
                        },
                        {
                            label: "External link…",
                            icon: ExternalLink,
                            shortcut: "Ctrl+Shift+K",
                            onclick: () => {},
                        },
                        { label: "Redirect…", onclick: () => {} },
                        { label: "Anchor / bookmark", onclick: () => {} },
                    ],
                },
                {
                    label: "Lists",
                    submenu: [
                        { label: "Bullet list item", icon: List, onclick: () => {} },
                        { label: "Numbered list item", icon: ListOrdered, onclick: () => {} },
                        { label: "Definition term / definition", onclick: () => {} },
                        "divider",
                        { label: "Increase indent", icon: Indent, onclick: () => {} },
                        { label: "Decrease indent", icon: Outdent, onclick: () => {} },
                    ],
                },
                {
                    label: "Tables",
                    submenu: [{ label: "Table…", icon: Table, onclick: () => {} }],
                },
                {
                    label: "References",
                    submenu: [
                        { label: "Reference / citation…", onclick: () => {} },
                        { label: "Named reference…", onclick: () => {} },
                        { label: "Reuse reference…", onclick: () => {} },
                        { label: "References list", onclick: () => {} },
                    ],
                },
                {
                    label: "Templates",
                    submenu: [
                        { label: "Template…", shortcut: "Ctrl+T", onclick: () => {} },
                        { label: "Infobox…", onclick: () => {} },
                        { label: "Magic word…", onclick: () => {} },
                        { label: "Parser function…", onclick: () => {} },
                    ],
                },
                {
                    label: "Media",
                    submenu: [
                        { label: "Image / file…", onclick: () => {} },
                        { label: "Gallery", onclick: () => {} },
                        { label: "File link", onclick: () => {} },
                    ],
                },
                {
                    label: "Other",
                    submenu: [
                        { label: "Math formula…", onclick: () => {} },
                        { label: "Special character…", onclick: () => {} },
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
                { label: "Zoom in", icon: ZoomIn, shortcut: "Ctrl+=", onclick: () => {} },
                { label: "Zoom out", icon: ZoomOut, shortcut: "Ctrl+-", onclick: () => {} },
                { label: "Reset zoom", shortcut: "Ctrl+0", onclick: () => {} },
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
    {#snippet tools()}
        <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded text-fg hover:bg-canvas"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            onclick={() => {
                if (editor) editor.undoEdit();
            }}
        >
            <Undo2 size={17} strokeWidth={2.5} />
        </button>
        <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded text-fg hover:bg-canvas"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            onclick={() => {
                if (editor) editor.redoEdit();
            }}
        >
            <Redo2 size={17} strokeWidth={2.5} />
        </button>
    {/snippet}
    <Editor bind:this={editor} />
</Shell>
