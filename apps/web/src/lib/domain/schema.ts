/*
 * FamilyTreeEditor - schema version registry and migration runner
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { err, ok, type Result } from "$lib/utils/result";

/**
 * Bumped whenever the on-disk shape of `Tree` changes in a way that is not
 * a transparent superset (e.g. renaming a field, replacing motherId+fatherId
 * with parentIds[], removing a flag). Each bump must ship with a Migration.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Migrations are pure data transformations applied left-to-right when an
 * imported file's stamped version is older than CURRENT_SCHEMA_VERSION.
 * They take and return loosely-typed JSON; the migrated result is then handed
 * to the parser/validator which enforces the latest type shape.
 */
export interface Migration {
    from: number;
    to: number;
    description: string;
    migrate: (raw: unknown) => unknown;
}

export const migrations: Migration[] = [
    // when v2 lands (e.g. parentIds[] replacing motherId/fatherId), append:
    //   { from: 1, to: 2, description: "...", migrate: (raw) => ... }
];

export interface MigrationResult<T> {
    value: T;
    appliedMigrations: { from: number; to: number; description: string }[];
}

/**
 * Walks the migration registry from the input's stamped version up to
 * CURRENT_SCHEMA_VERSION. Refuses to load files stamped newer than us so a
 * user running an older build doesn't silently corrupt forward-compatible
 * fields they don't understand.
 */
export function migrateToCurrent(
    raw: unknown,
    stampedVersion: number | undefined,
): Result<MigrationResult<unknown>, string> {
    const v = stampedVersion ?? 1;
    if (!Number.isInteger(v) || v < 1) {
        return err(`invalid schema version: ${String(stampedVersion)}`);
    }
    if (v > CURRENT_SCHEMA_VERSION) {
        return err(
            `schema version ${String(v)} is newer than this build supports (${String(CURRENT_SCHEMA_VERSION)}); please upgrade FamilyTreeEditor`,
        );
    }

    let cur: unknown = raw;
    let curVersion = v;
    const applied: { from: number; to: number; description: string }[] = [];

    while (curVersion < CURRENT_SCHEMA_VERSION) {
        const step = migrations.find((m) => m.from === curVersion);
        if (!step) {
            return err(`no migration registered from schema version ${String(curVersion)}`);
        }
        cur = step.migrate(cur);
        applied.push({ from: step.from, to: step.to, description: step.description });
        curVersion = step.to;
    }

    return ok({ value: cur, appliedMigrations: applied });
}
