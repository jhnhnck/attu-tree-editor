/*
 * FamilyTreeEditor - active layout engine kind + persistence helpers.
 *
 * Two distinct settings:
 *   1. `selectedEngine` (Dexie) - the engine the user last actively chose
 *      this session. Hydrated on mount; updated when the user switches.
 *   2. `fte.defaultEngine` (localStorage) - the per-browser fallback used
 *      when Dexie has no `selectedEngine` row (first run after install,
 *      after clearing app data, etc.). Lets a user who prefers the
 *      layered engine pin it as their default without server round-trips.
 *      Documented in Phase 0 of `notes/plans/family-view.md`.
 *
 * `fte.*` is the project-wide localStorage namespace; tests clear all
 * keys matching that prefix in their `beforeEach`.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { SETTING_KEYS, getSetting, setSetting } from "$lib/persistence/settings";

/** Engines the UI can pick. Keep in sync with the engine ids in `engine.ts`. */
export type EngineKind = "family-view" | "layered" | "hyperbolic";

/** Built-in default; overridden by `fte.defaultEngine` if present. */
export const BUILTIN_DEFAULT_ENGINE: EngineKind = "family-view";

const VALID: ReadonlySet<string> = new Set<EngineKind>(["family-view", "layered", "hyperbolic"]);

/** localStorage key for the per-browser default-engine preference. */
export const DEFAULT_ENGINE_LS_KEY = "fte.defaultEngine";

export function isEngineKind(v: unknown): v is EngineKind {
    return typeof v === "string" && VALID.has(v);
}

/**
 * Read the per-browser default-engine preference. Safe to call in any
 * environment — returns `BUILTIN_DEFAULT_ENGINE` if localStorage is
 * unavailable (SSR, tests without jsdom) or the value is invalid.
 */
export function readDefaultEngine(): EngineKind {
    try {
        const raw =
            typeof localStorage === "undefined"
                ? null
                : localStorage.getItem(DEFAULT_ENGINE_LS_KEY);
        return isEngineKind(raw) ? raw : BUILTIN_DEFAULT_ENGINE;
    } catch {
        return BUILTIN_DEFAULT_ENGINE;
    }
}

/** Write the per-browser default-engine preference. */
export function writeDefaultEngine(kind: EngineKind): void {
    try {
        if (typeof localStorage !== "undefined") {
            localStorage.setItem(DEFAULT_ENGINE_LS_KEY, kind);
        }
    } catch {
        // ignore — quota / disabled storage is non-fatal
    }
}

/**
 * Re-export under the historical name for callers that haven't moved to
 * `readDefaultEngine()`. The constant now resolves the live localStorage
 * value; existing consumers (App.svelte's `selectedEngine = DEFAULT_ENGINE`
 * fallback) get the desired override behaviour without source edits.
 */
export const DEFAULT_ENGINE: EngineKind = readDefaultEngine();

export async function loadEngineSetting(): Promise<EngineKind> {
    const v = await getSetting<string>(SETTING_KEYS.selectedEngine);
    return isEngineKind(v) ? v : readDefaultEngine();
}

export async function saveEngineSetting(kind: EngineKind): Promise<void> {
    await setSetting(SETTING_KEYS.selectedEngine, kind);
}
