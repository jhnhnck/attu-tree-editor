/*
 * FamilyTreeEditor - user-preferences rune store: theme + inspector side.
 *
 * persists to dexie via lib/persistence/settings.ts; applies side-effects
 * (writes data-theme on <html>) on every change so consumers don't have to.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { SETTING_KEYS, getSetting, setSetting } from "$lib/persistence/settings";

export type Theme = "light" | "dark" | "auto";
export type InspectorSide = "left" | "right";

const THEMES: readonly Theme[] = ["light", "dark", "auto"] as const;
const SIDES: readonly InspectorSide[] = ["left", "right"] as const;

export interface PreferencesStore {
    readonly theme: Theme;
    readonly inspectorSide: InspectorSide;
    readonly hydrated: boolean;
    setTheme(t: Theme): void;
    setInspectorSide(s: InspectorSide): void;
    /** load persisted values from dexie and apply theme to <html>. */
    hydrate(): Promise<void>;
}

function isTheme(x: unknown): x is Theme {
    return typeof x === "string" && (THEMES as readonly string[]).includes(x);
}

function isSide(x: unknown): x is InspectorSide {
    return typeof x === "string" && (SIDES as readonly string[]).includes(x);
}

function applyTheme(t: Theme): void {
    const html = document.documentElement;
    if (t === "auto") html.removeAttribute("data-theme");
    else html.setAttribute("data-theme", t);
}

export function createPreferencesStore(): PreferencesStore {
    let theme = $state<Theme>("auto");
    let inspectorSide = $state<InspectorSide>("right");
    let hydrated = $state(false);

    return {
        get theme() {
            return theme;
        },
        get inspectorSide() {
            return inspectorSide;
        },
        get hydrated() {
            return hydrated;
        },
        setTheme(t): void {
            theme = t;
            applyTheme(t);
            void setSetting(SETTING_KEYS.theme, t);
        },
        setInspectorSide(s): void {
            inspectorSide = s;
            void setSetting(SETTING_KEYS.inspectorSide, s);
        },
        async hydrate(): Promise<void> {
            const [t, s] = await Promise.all([
                getSetting<unknown>(SETTING_KEYS.theme),
                getSetting<unknown>(SETTING_KEYS.inspectorSide),
            ]);
            if (isTheme(t)) theme = t;
            if (isSide(s)) inspectorSide = s;
            applyTheme(theme);
            hydrated = true;
        },
    };
}
