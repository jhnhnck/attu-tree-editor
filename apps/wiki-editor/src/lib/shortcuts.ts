export interface ShortcutGroup {
    category: string;
    rows: readonly { keys: string; action: string }[];
}

export const SHORTCUTS: readonly ShortcutGroup[] = [
    {
        category: "File / save",
        rows: [
            { keys: "Ctrl+S", action: "save (opens edit summary dialog)" },
            { keys: "Ctrl+Shift+S", action: "save minor edit" },
            { keys: "Ctrl+P", action: "toggle preview" },
        ],
    },
    {
        category: "Edit",
        rows: [
            { keys: "Ctrl+Z", action: "undo" },
            { keys: "Ctrl+Y / Ctrl+Shift+Z", action: "redo" },
            { keys: "Ctrl+X / C / V", action: "cut / copy / paste" },
            { keys: "Ctrl+Shift+V", action: "paste as plain text" },
            { keys: "Ctrl+A", action: "select all" },
            { keys: "Ctrl+F", action: "find" },
            { keys: "Ctrl+H", action: "find & replace" },
            { keys: "Ctrl+G", action: "go to line" },
            { keys: "Ctrl+/", action: "toggle comment" },
        ],
    },
    {
        category: "Format",
        rows: [
            { keys: "Ctrl+B", action: "bold" },
            { keys: "Ctrl+I", action: "italic" },
            { keys: "Ctrl+K", action: "wikilink" },
            { keys: "Ctrl+Shift+K", action: "external link" },
            { keys: "Ctrl+.", action: "superscript" },
            { keys: "Ctrl+,", action: "subscript" },
            { keys: "Ctrl+`", action: "inline code" },
        ],
    },
    {
        category: "Structure",
        rows: [
            { keys: "Ctrl+2 – Ctrl+6", action: "heading level 2–6 (wraps current line)" },
            { keys: "Tab", action: "increase indent (inside list)" },
            { keys: "Shift+Tab", action: "decrease indent" },
            { keys: "Ctrl+Shift+.", action: "increase indent (outside list context)" },
            { keys: "Ctrl+Shift+,", action: "decrease indent" },
        ],
    },
    {
        category: "Navigation",
        rows: [
            { keys: "Ctrl+Home / End", action: "jump to document start / end" },
            { keys: "Ctrl+↑ / ↓", action: "prev / next section heading" },
            { keys: "F3 / Shift+F3", action: "find next / previous" },
        ],
    },
    {
        category: "View",
        rows: [
            { keys: "Ctrl+=", action: "zoom in" },
            { keys: "Ctrl+−", action: "zoom out" },
            { keys: "Ctrl+0", action: "reset zoom" },
            { keys: "Ctrl+Shift+F", action: "zen / focus mode" },
            { keys: "Ctrl+?", action: "keyboard shortcuts overlay" },
        ],
    },
    {
        category: "Wiki-specific",
        rows: [
            { keys: "Alt+Shift+S", action: "insert signature (~~~~)" },
            { keys: "Alt+Shift+T", action: "insert timestamp" },
            { keys: "Ctrl+Shift+C", action: "word count popover" },
            { keys: "Ctrl+T", action: "insert template…" },
        ],
    },
];
