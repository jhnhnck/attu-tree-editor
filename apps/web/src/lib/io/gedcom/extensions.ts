/*
 * FamilyTreeEditor - GEDCOM 7 `HEAD.SCHMA` extension namespace scaffold
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * Phase 0 of the relationship-vocabulary plan
 * (notes/plans/relationship-vocabulary.md). Declares the URI namespace
 * and short-form prefix for all FamilyTree-specific GEDCOM extension
 * tags. Phase 8 of the plan upgrades the emitter from 5.5.1 to GEDCOM
 * 7 and emits this block as part of the file header:
 *
 *     0 HEAD
 *     1 GEDC
 *     2 VERS 7.0
 *     1 SCHMA
 *     2 TAG _TREES_UNION https://attuproject.org/trees/schema/v1#union
 *     2 TAG _TREES_REL   https://attuproject.org/trees/schema/v1#relationship
 *     2 TAG _TREES_GROUP https://attuproject.org/trees/schema/v1#group
 *     ...
 *
 * Until Phase 8, this module only declares the namespace. Nothing emits
 * it yet. The intent is that callers across the codebase reference the
 * single source of truth here when they wire up Phase 8's emission.
 */

/** Stable namespace URI used in `HEAD.SCHMA` registrations. */
export const TREES_SCHEMA_NAMESPACE = "https://attuproject.org/trees/schema/v1#";

/**
 * Map of short-form extension tag → URI fragment. Phase 8 emits one
 * `2 TAG <name> <URI>` line per entry. Adding a new extension is a one-
 * line change here plus the actual emit site in the serializer.
 *
 * The fragment is appended to `TREES_SCHEMA_NAMESPACE` to form the full
 * URI; the serializer concatenates them at emission time.
 */
export const TREES_EXTENSION_TAGS: ReadonlyMap<string, string> = new Map([
    // Phase 2 — schema 1.0.0 -> 2.0.0
    ["_TREES_PARENT_REF", "parent-ref"],
    // Phase 3 — schema 2.0.0 -> 3.0.0
    ["_TREES_UNION", "union"],
    ["_TREES_KIND", "union-kind"],
    ["_TREES_CLOSED", "union-closed"],
    // Phase 4 — schema 3.0.0 -> 3.1.0
    ["_TREES_REL", "relationship"],
    ["_TREES_SEVERANCE", "severance"],
    // Phase 5 — schema 3.1.0 -> 3.2.0
    ["_TREES_GENDER_IDENTITY", "gender-identity"],
    ["_TREES_PRONOUNS", "pronouns"],
    ["_TREES_ASSIGNED_SEX", "assigned-sex"],
    ["_TREES_GENDER_FLUID", "gender-fluid"],
    ["_TREES_SPECIES", "species"],
    ["_TREES_PERSON_KIND", "person-kind"],
    ["_TREES_ORIGIN_KIND", "origin-kind"],
    ["_TREES_ORIGIN_CAUSE", "origin-cause"],
    ["_TREES_ORIGIN_DATE", "origin-date"],
    // Phase 6a — schema 3.2.0 -> 3.3.0
    ["_TREES_GROUP", "group"],
    // Phase 6b — schema 3.3.0 -> 3.4.0
    ["_TREES_SIBSHIP", "sibship"],
    ["_TREES_BIRTH_ORDER", "birth-order"],
]);

/** Full URI for a short-form extension tag. Returns `undefined` for unknown tags. */
export function uriForExtensionTag(shortForm: string): string | undefined {
    const fragment = TREES_EXTENSION_TAGS.get(shortForm);
    if (fragment === undefined) return undefined;
    return `${TREES_SCHEMA_NAMESPACE}${fragment}`;
}
