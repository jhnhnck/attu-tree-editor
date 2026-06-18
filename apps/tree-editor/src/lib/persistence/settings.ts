/*
 * FamilyTreeEditor - persistence/settings.ts: typed kv access on Dexie's settings table
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { getDb, type FamilyTreeDb } from "$lib/persistence/db";

export const SETTING_KEYS = {
    lastOpenedTreeId: "lastOpenedTreeId",
    wikiBaseUrl: "wikiBaseUrl",
    theme: "theme",
    inspectorSide: "inspectorSide",
    /** Active layout engine: "layered" (default) or "hyperbolic" (Phase 5 stub). */
    selectedEngine: "selectedEngine",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export async function getSetting<T = unknown>(
    key: SettingKey,
    db: FamilyTreeDb = getDb(),
): Promise<T | undefined> {
    const row = await db.settings.get(key);
    return row?.value as T | undefined;
}

export async function setSetting(
    key: SettingKey,
    value: unknown,
    db: FamilyTreeDb = getDb(),
): Promise<void> {
    await db.settings.put({ key, value });
}

export async function deleteSetting(key: SettingKey, db: FamilyTreeDb = getDb()): Promise<void> {
    await db.settings.delete(key);
}
