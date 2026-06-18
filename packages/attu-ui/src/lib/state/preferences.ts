/*
 * type definitions for the preferences store.
 * the full implementation (with Dexie persistence) lives in tree-editor's
 * $lib/state/preferences.svelte.ts and imports these types from @attu/ui.
 */

export type Theme = "light" | "dark" | "auto";
export type InspectorSide = "left" | "right";

export interface PreferencesStore {
    readonly theme: Theme;
    readonly inspectorSide: InspectorSide;
    readonly hydrated: boolean;
    setTheme(t: Theme): void;
    setInspectorSide(s: InspectorSide): void;
    hydrate(): Promise<void>;
}
