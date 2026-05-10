/*
 * FamilyTreeEditor - active layout engine kind + persistence helpers.
 *
 * The engine selection is a single string in the `settings` table keyed by
 * `selectedEngine`. App.svelte hydrates it on mount and persists changes.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { SETTING_KEYS, getSetting, setSetting } from "$lib/persistence/settings";

/** Engines the UI can pick. Keep in sync with the engine ids in `engine.ts`. */
export type EngineKind = "layered" | "hyperbolic";

export const DEFAULT_ENGINE: EngineKind = "layered";

const VALID: ReadonlySet<string> = new Set<EngineKind>(["layered", "hyperbolic"]);

export function isEngineKind(v: unknown): v is EngineKind {
    return typeof v === "string" && VALID.has(v);
}

export async function loadEngineSetting(): Promise<EngineKind> {
    const v = await getSetting<string>(SETTING_KEYS.selectedEngine);
    return isEngineKind(v) ? v : DEFAULT_ENGINE;
}

export async function saveEngineSetting(kind: EngineKind): Promise<void> {
    await setSetting(SETTING_KEYS.selectedEngine, kind);
}
