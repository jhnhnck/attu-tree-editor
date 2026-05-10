/*
 * FamilyTreeEditor - command registry; one place to declare every action.
 * the menu bar, command palette, and shortcut binder all read from this list.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { IconComponent } from "$lib/components/shell/menu";

export type CommandGroup =
    | "File"
    | "Edit"
    | "View"
    | "Insert"
    | "Tree"
    | "Help"
    | "Selection"
    | "Other";

export interface Command {
    /** matches actionId in shortcuts.ts */
    id: string;
    label: string;
    group: CommandGroup;
    /** primary combo, looked up via formatCombo for display */
    shortcut?: string | undefined;
    icon?: IconComponent | undefined;
    /** disable hint for menus / palette */
    enabled?: (() => boolean) | undefined;
    /** divider hint before this entry in the parent menu */
    dividerBefore?: boolean | undefined;
    /** danger styling in menus */
    danger?: boolean | undefined;
    run: () => void;
}

/**
 * build the registry from a callback bag so App.svelte can inject the actual
 * action functions while keeping the command metadata declarative.
 */
export interface CommandHandlers {
    appUndo: () => void;
    appRedo: () => void;
    appSave: () => void;
    appNew: () => void;
    appOpen: () => void;
    appImport: () => void;
    appExport: () => void;
    appSettings: () => void;
    appHelp: () => void;
    viewFit: () => void;
    viewZoom100: () => void;
    viewFitSelection: () => void;
    viewFocus: () => void;
    viewHandTool: () => void;
    viewSelectTool: () => void;
    viewZoomIn: () => void;
    viewZoomOut: () => void;
    viewCenterRoot: () => void;
    viewToggleInspector: () => void;
    viewEngineLayered: () => void;
    viewEngineHyperbolic: () => void;
    selectClear: () => void;
    selectEdit: () => void;
    selectDelete: () => void;
    selectDuplicate: () => void;
    personAddChild: () => void;
    personAddPartner: () => void;
    personAddParent: () => void;
    personAddUnattached: () => void;
    paletteFindPerson: () => void;
    paletteCommands: () => void;
    treeRename: () => void;
    treeSetRoot: () => void;
    treeDelete: () => void;
    treeStatistics: () => void;
    treeResetLayout: () => void;
}

export interface CommandEnabledFlags {
    canUndo?: () => boolean;
    canRedo?: () => boolean;
}

export function buildCommands(
    h: CommandHandlers,
    icons: Partial<Record<string, IconComponent>>,
    enabled: CommandEnabledFlags = {},
): readonly Command[] {
    return [
        // File
        { id: "app.new", label: "New tree", group: "File", icon: icons["app.new"], run: h.appNew },
        {
            id: "app.open",
            label: "Open tree…",
            group: "File",
            icon: icons["app.open"],
            run: h.appOpen,
        },
        {
            id: "app.save",
            label: "Save",
            group: "File",
            dividerBefore: true,
            icon: icons["app.save"],
            run: h.appSave,
        },
        {
            id: "app.import",
            label: "Import…",
            group: "File",
            icon: icons["app.import"],
            run: h.appImport,
        },
        {
            id: "app.export",
            label: "Export .gdz",
            group: "File",
            icon: icons["app.export"],
            run: h.appExport,
        },
        {
            id: "tree.delete",
            label: "Delete this tree…",
            group: "File",
            dividerBefore: true,
            danger: true,
            icon: icons["tree.delete"],
            run: h.treeDelete,
        },

        // Edit
        {
            id: "app.undo",
            label: "Undo",
            group: "Edit",
            icon: icons["app.undo"],
            enabled: enabled.canUndo,
            run: h.appUndo,
        },
        {
            id: "app.redo",
            label: "Redo",
            group: "Edit",
            icon: icons["app.redo"],
            enabled: enabled.canRedo,
            run: h.appRedo,
        },
        {
            id: "palette.findPerson",
            label: "Find person…",
            group: "Edit",
            dividerBefore: true,
            icon: icons["palette.findPerson"],
            run: h.paletteFindPerson,
        },
        {
            id: "palette.commands",
            label: "Command palette…",
            group: "Edit",
            icon: icons["palette.commands"],
            run: h.paletteCommands,
        },
        {
            id: "app.settings",
            label: "Settings…",
            group: "Edit",
            dividerBefore: true,
            icon: icons["app.settings"],
            run: h.appSettings,
        },

        // View
        {
            id: "view.fit",
            label: "Fit to window",
            group: "View",
            icon: icons["view.fit"],
            run: h.viewFit,
        },
        {
            id: "view.zoom100",
            label: "Zoom to 100%",
            group: "View",
            icon: icons["view.zoom100"],
            run: h.viewZoom100,
        },
        {
            id: "view.fitSelection",
            label: "Fit selection",
            group: "View",
            run: h.viewFitSelection,
        },
        {
            id: "view.focus",
            label: "Focus selection",
            group: "View",
            icon: icons["view.focus"],
            run: h.viewFocus,
        },
        {
            id: "view.zoomIn",
            label: "Zoom in",
            group: "View",
            dividerBefore: true,
            icon: icons["view.zoomIn"],
            run: h.viewZoomIn,
        },
        {
            id: "view.zoomOut",
            label: "Zoom out",
            group: "View",
            icon: icons["view.zoomOut"],
            run: h.viewZoomOut,
        },
        {
            id: "view.handTool",
            label: "Hand tool",
            group: "View",
            dividerBefore: true,
            icon: icons["view.handTool"],
            run: h.viewHandTool,
        },
        {
            id: "view.selectTool",
            label: "Select tool",
            group: "View",
            icon: icons["view.selectTool"],
            run: h.viewSelectTool,
        },
        {
            id: "view.toggleInspector",
            label: "Show inspector",
            group: "View",
            dividerBefore: true,
            icon: icons["view.toggleInspector"],
            run: h.viewToggleInspector,
        },
        {
            id: "view.engineLayered",
            label: "Use layered engine",
            group: "View",
            dividerBefore: true,
            icon: icons["view.engineLayered"],
            run: h.viewEngineLayered,
        },
        {
            id: "view.engineHyperbolic",
            label: "Use hyperbolic engine (Phase 5 stub)",
            group: "View",
            icon: icons["view.engineHyperbolic"],
            run: h.viewEngineHyperbolic,
        },

        // Insert
        {
            id: "person.addChild",
            label: "Add child of selected",
            group: "Insert",
            icon: icons["person.addChild"],
            run: h.personAddChild,
        },
        {
            id: "person.addPartner",
            label: "Add partner of selected",
            group: "Insert",
            icon: icons["person.addPartner"],
            run: h.personAddPartner,
        },
        {
            id: "person.addParent",
            label: "Add parent of selected",
            group: "Insert",
            icon: icons["person.addParent"],
            run: h.personAddParent,
        },
        {
            id: "person.addUnattached",
            label: "Add unattached person",
            group: "Insert",
            icon: icons["person.addUnattached"],
            run: h.personAddUnattached,
        },

        // Tree
        {
            id: "tree.rename",
            label: "Rename tree…",
            group: "Tree",
            icon: icons["tree.rename"],
            run: h.treeRename,
        },
        {
            id: "tree.setRoot",
            label: "Set selected as root",
            group: "Tree",
            icon: icons["tree.setRoot"],
            run: h.treeSetRoot,
        },
        {
            id: "tree.statistics",
            label: "Statistics…",
            group: "Tree",
            icon: icons["tree.statistics"],
            run: h.treeStatistics,
        },
        {
            id: "tree.resetLayout",
            label: "Reset layout",
            group: "Tree",
            dividerBefore: true,
            icon: icons["tree.resetLayout"],
            run: h.treeResetLayout,
        },
        {
            id: "view.centerRoot",
            label: "Center on root",
            group: "Tree",
            dividerBefore: true,
            icon: icons["view.centerRoot"],
            run: h.viewCenterRoot,
        },

        // Selection
        {
            id: "select.edit",
            label: "Edit selected person",
            group: "Selection",
            run: h.selectEdit,
        },
        {
            id: "select.duplicate",
            label: "Duplicate selected",
            group: "Selection",
            run: h.selectDuplicate,
        },
        {
            id: "select.delete",
            label: "Delete selected",
            group: "Selection",
            danger: true,
            run: h.selectDelete,
        },
        {
            id: "select.clear",
            label: "Deselect",
            group: "Selection",
            run: h.selectClear,
        },

        // Help
        {
            id: "app.help",
            label: "Keyboard shortcuts",
            group: "Help",
            icon: icons["app.help"],
            run: h.appHelp,
        },
    ];
}

/** look up a command by id; returns undefined if none. */
export function commandById(commands: readonly Command[], id: string): Command | undefined {
    return commands.find((c) => c.id === id);
}
