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
 * tree data (every entry populated by the 1.0.0 → 2.0.0 migration gets
 * this). The non-`birth` variants drive the relationship-vocabulary
 * stroke palette (dashed = adopted/sealed, dotted = foster, etc.).
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
 * replaced the binary mother/father slots with an unbounded array of
 * these to support non-traditional families (single-parent, adoption,
 * surrogacy, multi-parent, polycule unions).
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
     * Canonical parent list. Populated by the 1.0.0 → 2.0.0 schema
     * migration from the now-removed `motherId` / `fatherId` fields.
     * Optional so existing Person literals without parents (test
     * fixtures, freshly-imported orphans) don't need a `parentIds: []`
     * line. Use `getParents(person)` to read in a forward-compatible
     * way (the helper still returns an empty array for missing values).
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
