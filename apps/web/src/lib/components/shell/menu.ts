/*
 * FamilyTreeEditor - shared types for Menu / MenuBar (extracted to avoid svelte module re-export cycles)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Component } from "svelte";

/**
 * Lucide icons are `Component<LucideProps, ...>` whose default generics include
 * `any`, which trips eslint's no-unsafe-* rules anywhere we touch the value.
 * Storing as `unknown` here and casting at the single render site (Menu.svelte)
 * keeps the rest of the surface clean and explicit about where the `any` lives.
 */
export type IconComponent = Component<Record<string, unknown>>;

export interface MenuItem {
    label: string;
    shortcut?: string | undefined;
    icon?: unknown;
    onclick?: (() => void) | undefined;
    disabled?: boolean | undefined;
    danger?: boolean | undefined;
    /**
     * Tri-state toggle indicator on the trailing edge:
     *   - `true`  - render a filled check (item is on)
     *   - `false` - render an outlined empty box (item is off but toggleable)
     *   - omitted - render nothing (not a toggle)
     * used for both radio-style choices (e.g. active layout engine) and
     * persistent on/off toggles (e.g. View > Overlay: path highlight). the
     * outlined off-state was added so the user can tell at a glance which
     * overlays are off without scanning for the absence of a checkmark.
     */
    checked?: boolean | undefined;
}

export type MenuEntry = MenuItem | "divider";

export interface MenuConfig {
    label: string;
    items: readonly MenuEntry[];
}
