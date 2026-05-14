/*
 * FamilyTreeEditor - schema version registry and migration runner (semver)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { err, ok, type Result } from "$lib/utils/result";

/**
 * Schema versions are semver strings `MAJOR.MINOR.PATCH`. A major bump means
 * a breaking shape change (e.g. `parentIds[]` replaces `motherId`/`fatherId`).
 * A minor bump means an additive change (e.g. add an optional field). Patch
 * bumps are for bugfixes in the migration logic itself.
 *
 * The runner accepts both modern semver-stamped bundles and legacy
 * integer-stamped bundles (today's `1` reads as `"1.0.0"`); on write we
 * always emit semver strings.
 */
export type SchemaVersion = string;

/**
 * The version this build writes on save. Bumped whenever the on-disk shape
 * of `Tree` changes in a way that needs migration. Each bump is paired with
 * a `Migration` in the registry below.
 */
export const CURRENT_SCHEMA_VERSION: SchemaVersion = "2.0.0";

export interface Migration {
    from: SchemaVersion;
    to: SchemaVersion;
    description: string;
    migrate: (raw: unknown) => unknown;
}

const identity = (raw: unknown): unknown => raw;

/**
 * 1.0.0 → 2.0.0 migration body. Walks every person and populates
 * `parentIds` from the legacy `motherId` / `fatherId` fields:
 *   - `motherId` (if set) → ParentRef with role=mother, pedi=birth
 *   - `fatherId` (if set) → ParentRef with role=father, pedi=birth
 * Persons that already carry a `parentIds` array (e.g. written by a
 * newer build that round-tripped through this build) are left alone so
 * we don't clobber data we don't understand.
 * Phase 2b: legacy fields are deleted from the in-memory record after
 * the array is populated; readers must use `getParents(person)`.
 */
function migrateParentIdsV1ToV2(raw: unknown): unknown {
    if (!raw || typeof raw !== "object") return raw;
    const tree = raw as { people?: Record<string, unknown> };
    if (!tree.people || typeof tree.people !== "object") return raw;
    for (const person of Object.values(tree.people)) {
        if (!person || typeof person !== "object") continue;
        const p = person as {
            motherId?: string;
            fatherId?: string;
            parentIds?: { personId: string; role?: string; pedi?: string }[];
        };
        if (!Array.isArray(p.parentIds) || p.parentIds.length === 0) {
            const newParents: { personId: string; role: string; pedi: string }[] = [];
            if (typeof p.motherId === "string" && p.motherId.length > 0) {
                newParents.push({ personId: p.motherId, role: "mother", pedi: "birth" });
            }
            if (typeof p.fatherId === "string" && p.fatherId.length > 0) {
                newParents.push({ personId: p.fatherId, role: "father", pedi: "birth" });
            }
            p.parentIds = newParents;
        }
        delete p.motherId;
        delete p.fatherId;
    }
    return raw;
}

/**
 * Phase 0 of the relationship-vocabulary plan registers identity stubs for
 * every queued schema bump. Each later phase replaces its body with a real
 * data transform. Until `CURRENT_SCHEMA_VERSION` bumps, none of these are
 * actually walked at runtime — they exist so the registry shape is fixed
 * and the migration chain is testable end-to-end.
 */
export const migrations: Migration[] = [
    {
        from: "1.0.0",
        to: "2.0.0",
        description: "parentIds[] replaces motherId/fatherId (Phase 2b)",
        migrate: migrateParentIdsV1ToV2,
    },
    {
        from: "2.0.0",
        to: "3.0.0",
        description: "UnionRecord replaces CoupleRecord (Phase 3)",
        migrate: identity,
    },
    {
        from: "3.0.0",
        to: "3.1.0",
        description: "add tree.relationships[] overlay (Phase 4)",
        migrate: identity,
    },
    {
        from: "3.1.0",
        to: "3.2.0",
        description: "gender struct + species + kind + origin (Phase 5)",
        migrate: identity,
    },
    {
        from: "3.2.0",
        to: "3.3.0",
        description: "add tree.groups[] (Phase 6a)",
        migrate: identity,
    },
    {
        from: "3.3.0",
        to: "3.4.0",
        description: "add tree.sibshipDecorators[] + Person.birthOrder (Phase 6b)",
        migrate: identity,
    },
];

export interface MigrationResult<T> {
    value: T;
    appliedMigrations: { from: SchemaVersion; to: SchemaVersion; description: string }[];
    /** Present when the bundle was minor-newer than this build but compatible. */
    forwardCompatWarning?: string;
}

interface ParsedVersion {
    major: number;
    minor: number;
    patch: number;
}

/**
 * Accepts modern semver strings ("1.2.3"), legacy integer stamps (`1` →
 * `1.0.0`), or `undefined` (treated as the original `1.0.0`). Throws-by-
 * way-of-Result on malformed input.
 */
function parseVersion(v: number | string | undefined): Result<ParsedVersion, string> {
    if (v === undefined) return ok({ major: 1, minor: 0, patch: 0 });
    if (typeof v === "number") {
        if (!Number.isInteger(v) || v < 1) {
            return err(`invalid schema version: ${String(v)}`);
        }
        return ok({ major: v, minor: 0, patch: 0 });
    }
    if (typeof v !== "string") {
        return err(`invalid schema version: ${String(v)}`);
    }
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    if (!m) return err(`invalid schema version: ${v}`);
    return ok({ major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) });
}

function formatVersion(p: ParsedVersion): SchemaVersion {
    return `${String(p.major)}.${String(p.minor)}.${String(p.patch)}`;
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
}

/**
 * Walks the migration registry from the input's stamped version up to
 * `CURRENT_SCHEMA_VERSION`.
 *
 * Behaviour:
 * - **Major-newer than this build**: rejected. Older builds must not
 *   silently corrupt forward-compatible fields they don't understand.
 * - **Minor-newer than this build**: accepted with a `forwardCompatWarning`.
 *   Additive fields are preserved verbatim on subsequent saves; the
 *   renderer simply won't display them. This is the headline benefit of
 *   semver over integer versioning.
 * - **Same or older**: walks the registry; each step's `migrate(...)` is
 *   applied in order, threading the result through.
 */
export function migrateToCurrent(
    raw: unknown,
    stampedVersion: number | string | undefined,
): Result<MigrationResult<unknown>, string> {
    const inputParsed = parseVersion(stampedVersion);
    if (!inputParsed.ok) return inputParsed;
    const currentParsed = parseVersion(CURRENT_SCHEMA_VERSION);
    if (!currentParsed.ok) return currentParsed;

    const inputV = inputParsed.value;
    const currentV = currentParsed.value;

    if (inputV.major > currentV.major) {
        return err(
            `schema version ${formatVersion(inputV)} is newer than this build supports (${CURRENT_SCHEMA_VERSION}); please upgrade FamilyTreeEditor`,
        );
    }

    // Minor- or patch-newer (same major): accept with a forward-compat
    // warning. The runner doesn't walk any migrations; the bundle is
    // structurally compatible at the major version this build understands.
    if (compareVersions(inputV, currentV) > 0) {
        return ok({
            value: raw,
            appliedMigrations: [],
            forwardCompatWarning: `schema version ${formatVersion(inputV)} is minor-newer than this build (${CURRENT_SCHEMA_VERSION}); additive fields will be preserved on save but may not render`,
        });
    }

    let cur: unknown = raw;
    let curV = inputV;
    const applied: { from: SchemaVersion; to: SchemaVersion; description: string }[] = [];

    while (compareVersions(curV, currentV) < 0) {
        const curStr = formatVersion(curV);
        const step = migrations.find((m) => m.from === curStr);
        if (!step) {
            return err(`no migration registered from schema version ${curStr}`);
        }
        cur = step.migrate(cur);
        applied.push({ from: step.from, to: step.to, description: step.description });
        const nextParsed = parseVersion(step.to);
        if (!nextParsed.ok) return nextParsed;
        curV = nextParsed.value;
    }

    return ok({ value: cur, appliedMigrations: applied });
}

// ─── test helpers ────────────────────────────────────────────────────────
// Exposed for unit tests that need to walk the registered migration chain
// past `CURRENT_SCHEMA_VERSION` (e.g. the Phase 0 identity-stub round-trip).
// Not part of the public API; tests import these directly.

/** Walks the migration chain from `fromVersion` up to `toVersion` ignoring
 *  the public `CURRENT_SCHEMA_VERSION`. Use only in tests. */
export function _migrateBetween(
    raw: unknown,
    fromVersion: SchemaVersion,
    toVersion: SchemaVersion,
): Result<MigrationResult<unknown>, string> {
    const fromParsed = parseVersion(fromVersion);
    if (!fromParsed.ok) return fromParsed;
    const toParsed = parseVersion(toVersion);
    if (!toParsed.ok) return toParsed;

    let cur: unknown = raw;
    let curV = fromParsed.value;
    const applied: { from: SchemaVersion; to: SchemaVersion; description: string }[] = [];

    while (compareVersions(curV, toParsed.value) < 0) {
        const curStr = formatVersion(curV);
        const step = migrations.find((m) => m.from === curStr);
        if (!step) {
            return err(`no migration registered from schema version ${curStr}`);
        }
        cur = step.migrate(cur);
        applied.push({ from: step.from, to: step.to, description: step.description });
        const nextParsed = parseVersion(step.to);
        if (!nextParsed.ok) return nextParsed;
        curV = nextParsed.value;
    }

    return ok({ value: cur, appliedMigrations: applied });
}
