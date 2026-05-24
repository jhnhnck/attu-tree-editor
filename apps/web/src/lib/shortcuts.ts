/*
 * FamilyTreeEditor - shortcut definitions; single source of truth for bindings + help overlay
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * matches the spec in notes/features/keyboard-shortcuts.md. each entry is a
 * (group, combo, label, actionId) tuple. a separate action map in App.svelte
 * supplies the run() functions; this file stays UI-agnostic so it can be
 * imported by both the runtime binder and the static help overlay.
 */

import type { ShortcutScope } from "./keyboard";

export type ShortcutGroup = "Canvas" | "Selection" | "Add Relatives" | "Search & Command" | "App";

export interface ShortcutDef {
    group: ShortcutGroup;
    combo: string;
    /** alternate combo (e.g. macOS-friendly fallback for Insert) */
    alt?: string;
    label: string;
    actionId: string;
    scope?: ShortcutScope;
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
    "App",
    "Canvas",
    "Selection",
    "Add Relatives",
    "Search & Command",
];

export const SHORTCUTS: readonly ShortcutDef[] = [
    // App
    { group: "App", combo: "Mod+Z", label: "Undo", actionId: "app.undo", scope: "global" },
    {
        group: "App",
        combo: "Mod+Shift+Z",
        alt: "Mod+Y",
        label: "Redo",
        actionId: "app.redo",
        scope: "global",
    },
    { group: "App", combo: "Mod+S", label: "Save", actionId: "app.save", scope: "global" },
    // "New tree" intentionally has no shortcut: Mod+N is reserved by browsers (new window)
    // and cannot be intercepted. Users invoke it via File > New tree.
    { group: "App", combo: "Mod+O", label: "Open tree…", actionId: "app.open", scope: "global" },
    { group: "App", combo: "Mod+I", label: "Import…", actionId: "app.import", scope: "global" },
    { group: "App", combo: "Mod+E", label: "Export", actionId: "app.export", scope: "global" },
    { group: "App", combo: "Mod+,", label: "Settings…", actionId: "app.settings", scope: "global" },
    { group: "App", combo: "?", label: "Keyboard shortcuts", actionId: "app.help" },

    // Canvas
    {
        group: "Canvas",
        combo: "Mod+0",
        label: "Fit to window",
        actionId: "view.fit",
        scope: "global",
    },
    // "Zoom to 100%" intentionally has no shortcut: Mod+1 is intercepted by Chrome/Firefox
    // for tab switching. Users invoke it via View > Zoom to 100%.
    { group: "Canvas", combo: "Shift+1", label: "Fit selection", actionId: "view.fitSelection" },
    { group: "Canvas", combo: "F", label: "Focus selection", actionId: "view.focus" },
    { group: "Canvas", combo: "H", label: "Hand tool", actionId: "view.handTool" },
    { group: "Canvas", combo: "V", label: "Select tool", actionId: "view.selectTool" },
    { group: "Canvas", combo: "+", label: "Zoom in", actionId: "view.zoomIn" },
    { group: "Canvas", combo: "-", label: "Zoom out", actionId: "view.zoomOut" },
    { group: "Canvas", combo: "Home", label: "Center on root", actionId: "view.centerRoot" },

    // Selection
    {
        group: "Selection",
        combo: "Esc",
        label: "Deselect / dismiss",
        actionId: "select.clear",
        scope: "global",
    },
    { group: "Selection", combo: "Enter", label: "Open editor", actionId: "select.edit" },
    { group: "Selection", combo: "Delete", label: "Delete selected", actionId: "select.delete" },
    { group: "Selection", combo: "Backspace", label: "Delete selected", actionId: "select.delete" },
    {
        group: "Selection",
        combo: "Mod+D",
        label: "Duplicate selected",
        actionId: "select.duplicate",
        scope: "global",
    },

    // Add Relatives
    {
        group: "Add Relatives",
        combo: "Insert",
        alt: "Mod+Enter",
        label: "Add child",
        actionId: "person.addChild",
    },
    {
        group: "Add Relatives",
        combo: "Shift+Insert",
        label: "Add partner",
        actionId: "person.addPartner",
    },
    {
        group: "Add Relatives",
        combo: "Mod+Insert",
        alt: "Mod+Shift+Enter",
        label: "Add parent",
        actionId: "person.addParent",
        scope: "global",
    },
    // "Add unattached person" intentionally has no shortcut: Mod+Shift+N is reserved by
    // browsers (private/incognito window). Users invoke it via Insert > Add unattached.

    // Search & Command
    {
        group: "Search & Command",
        combo: "Mod+P",
        label: "Find person…",
        actionId: "palette.findPerson",
        scope: "global",
    },
    {
        group: "Search & Command",
        combo: "/",
        label: "Find person…",
        actionId: "palette.findPerson",
    },
    {
        group: "Search & Command",
        combo: "Mod+Shift+P",
        label: "Command palette…",
        actionId: "palette.commands",
        scope: "global",
    },
];

/** group the shortcuts for the help overlay. */
export function groupedShortcuts(): readonly {
    group: ShortcutGroup;
    items: readonly ShortcutDef[];
}[] {
    return SHORTCUT_GROUPS.map((group) => ({
        group,
        items: SHORTCUTS.filter((s) => s.group === group),
    }));
}
