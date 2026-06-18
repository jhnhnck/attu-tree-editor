/*
 * AttuUI - palette item contract; consumed by CommandPalette in tree-editor
 * (and eventually any palette host that mounts CommandPalette from @attu/ui)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Component } from "svelte";

export interface PaletteItem {
    id: string;
    label: string;
    /** secondary display text — person id for people rows, keyboard shortcut or group for commands */
    detail?: string;
    kind: "person" | "command";
    icon?: Component<Record<string, unknown>> | undefined;
    enabled?: (() => boolean) | undefined;
    action: () => void;
}
