/*
 * FamilyTreeEditor - core domain types shared by importers, editor, and serializers
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { HaracalndeDateData } from "$lib/date/HaracalndeDate";

export type PersonId = string;
export type Gender = "m" | "f" | "u";
export type DisplayFlag = "z0" | "z1";

/**
 * Role on a parent linkage. `mother` / `father` are the legacy gender-
 * driven roles; `parent` is the gender-neutral form; `progenitor` is for
 * fictional / non-traditional cases (e.g. a clone parent, a magical
 * source). Optional — when absent, the role is unknown.
 */
export type ParentRole =
    | "mother"
    | "father"
    | "parent"
    | "progenitor"
    | "donor"
    | "surrogate"
    | "social";

/**
 * Pedigree kind on a parent linkage. `birth` is the default for legacy
 * tree data (every entry created from `motherId` / `fatherId` gets this).
 * The non-`birth` variants drive the relationship-vocabulary stroke
 * palette in Phase 2b+ (dashed = adopted/sealed, dotted = foster, etc.).
 */
export type ParentPedi =
    | "birth"
    | "adopted"
    | "foster"
    | "sealed"
    | "chosen"
    | "magical"
    | "cloned"
    | "hatched"
    | "summoned"
    | "manufactured";

/**
 * One entry in `Person.parentIds`. The schema bump 1.0.0 → 2.0.0
 * replaces the binary `motherId` / `fatherId` fields with an unbounded
 * array of these. Phase 2a (this turn) ships `parentIds` as a
 * coexisting field; legacy fields stay readable. Phase 2b migrates
 * every consumer and removes the legacy fields.
 */
export interface ParentRef {
    personId: PersonId;
    role?: ParentRole;
    pedi?: ParentPedi;
}

export interface Person {
    id: PersonId;
    given: string;
    surname: string;
    title?: string;
    gender: Gender;
    birth?: HaracalndeDateData;
    death?: HaracalndeDateData;
    occupation?: string;
    location?: string;
    locationOrigin?: string;
    /**
     * @deprecated Phase 2a of the relationship-vocabulary plan introduces
     * `parentIds` as the canonical parent linkage. Legacy reads still
     * resolve `motherId` via `getParents(person)`. Phase 2b removes this
     * field from the type entirely.
     */
    motherId?: PersonId;
    /**
     * @deprecated See `motherId`. Phase 2b removes.
     */
    fatherId?: PersonId;
    /**
     * Canonical parent list (Phase 2a +). Populated from legacy
     * `motherId` / `fatherId` by the 1.0.0 → 2.0.0 migration. New tree
     * mutations populate this AND keep the legacy fields in sync until
     * Phase 2b drops them. Optional in 2a so existing Person literals
     * (test fixtures, importers) don't need a `parentIds: []` line yet;
     * Phase 2b promotes to required and removes the legacy fields.
     * Use `getParents(person)` to read in a forward-compatible way.
     */
    parentIds?: ParentRef[];
    spouseIds: PersonId[];
    anchorParentId?: PersonId;
    display: DisplayFlag;
    wikiTitle?: string;
    portraitBlobId?: string;
}

export interface CoupleRecord {
    leftId: PersonId;
    rightId: PersonId;
    unionIndex: number;
    childIds: PersonId[];
    /** date of marriage (GEDCOM `1 MARR / 2 DATE`) when known */
    marriageDate?: HaracalndeDateData;
    /**
     * FamilyEcho's `_PRIMARY Y/N` flag - whether this is the spouse's
     * primary marriage. defaults to true for new couples; preserved on
     * round-trip so the wiki side can still surface a "main marriage".
     */
    isPrimary?: boolean;
    /**
     * FamilyEcho's `_CURRENT Y/N` flag - whether the marriage is ongoing
     * (vs ended / divorced / widowed). preserved on round-trip.
     */
    isCurrent?: boolean;
}

export interface Tree {
    id: string;
    name: string;
    rootId: PersonId;
    people: Record<PersonId, Person>;
    couples: CoupleRecord[];
    /**
     * Local edit counter, monotonically incremented by the tree store on
     * every user-driven mutation (set / update / reset / undo / redo).
     * Distinct from the server-side revision tracked by `syncStore.revision`,
     * which is set only after a successful round-trip with the API.
     */
    editRev: number;
    updatedAt: number;
}
