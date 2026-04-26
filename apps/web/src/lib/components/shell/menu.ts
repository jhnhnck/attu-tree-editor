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
}

export type MenuEntry = MenuItem | "divider";

export interface MenuConfig {
    label: string;
    items: readonly MenuEntry[];
}
