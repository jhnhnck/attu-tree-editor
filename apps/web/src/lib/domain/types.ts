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

/**
 * @deprecated Replaced by `UnionRecord` at schema 3.0.0. Kept for the
 * Phase 3a transition so the ~20 downstream consumers (gedcom, merge,
 * route, layer, place, family-view, inspector, etc.) can migrate to
 * `getUnions(tree)` incrementally in Phase 3b. New writes via
 * `linkSpouse` / `updateCouple` still populate this field alongside
 * `unions[]`; Phase 3b drops the legacy write and Phase 3c (or later)
 * deletes the field entirely.
 */
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

/**
 * Kind of union, driving downstream stroke style and inspector copy.
 * `romantic` is the default for legacy couples post-migration; the
 * others are non-traditional bond types from the relationship-
 * vocabulary design study (§3, §4). Optional — when absent the union
 * is treated as `romantic` for legacy compatibility.
 */
export type UnionKind = "romantic" | "civil" | "religious" | "ritual" | "cohabit" | "sworn";

/**
 * Canonical union record. Replaces `CoupleRecord` at schema 3.0.0:
 * - `partnerIds: PersonId[]` of arbitrary cardinality (1+); legacy
 *   pair-couples migrate to a 2-element array.
 * - `id: string` replaces `unionIndex: number` for stable referencing
 *   across N-partner mutations.
 * - `kind` / `closed` / `preferredBy` / `name` are net-new fields the
 *   migration does not populate; they emerge from new domain ops and
 *   the Phase 3c inspector UI.
 */
export interface UnionRecord {
    id: string;
    partnerIds: PersonId[];
    /** kind of union; legacy migration leaves this undefined (= romantic by default) */
    kind?: UnionKind;
    /**
     * True if the union is a closed N-partner group (polyfidelitous);
     * false / undefined means the partners may have bonds outside the
     * union (open polycule, common-law cohabit, etc.). Legacy pair-
     * couples migrate with `closed` undefined; the renderer treats this
     * as "implicit pair" rather than reading the absence as meaningful.
     */
    closed?: boolean;
    /**
     * Per-partner preferred-union flag. Used by family-view's
     * preferred-union UI (Phase 6 commitment 7). Migrated as `undefined`;
     * the localStorage → domain migration lands in Phase 3c when the
     * inspector UI grows the toggle.
     */
    preferredBy?: Record<PersonId, boolean>;
    childIds: PersonId[];
    /** date of union start (GEDCOM `1 MARR / 2 DATE`) when known */
    marriageDate?: HaracalndeDateData;
    /** legacy FamilyEcho `_PRIMARY Y/N` flag, preserved on round-trip */
    isPrimary?: boolean;
    /** legacy FamilyEcho `_CURRENT Y/N` flag, preserved on round-trip */
    isCurrent?: boolean;
    /** chosen household / family name (e.g. surname-after-marriage) */
    name?: string;
}

/**
 * Kind of relationship overlay (Phase 4). Not modelled by the rank-and-
 * bus skeleton; rendered as overlay segments that route independently
 * of the standard parent / partner / sibling layout. Drives the
 * relationship-vocabulary stroke palette downstream (chained for sworn
 * bonds, wavy for transformations / reincarnations, doubled-slash for
 * severances, etc.).
 */
export type RelationshipKind =
    | "sworn-bond"
    | "oath-sibling"
    | "blood-brother"
    | "master-apprentice"
    | "covenant"
    | "transformed-from"
    | "reincarnated-as"
    | "merged-from"
    | "split-into"
    | "alias-of"
    | "severed"
    | "estranged"
    | "exiled"
    | "disowned";

export interface Relationship {
    id: string;
    kind: RelationshipKind;
    sourceIds: PersonId[];
    targetIds: PersonId[];
    cause?: string;
    date?: HaracalndeDateData;
    notes?: string;
}

export interface Tree {
    id: string;
    name: string;
    rootId: PersonId;
    people: Record<PersonId, Person>;
    /**
     * @deprecated Replaced by `unions[]` at schema 3.0.0. Phase 3a writers
     * keep this in sync with `unions[]`; readers should use
     * `getUnions(tree)` which prefers `unions[]` and derives from
     * `couples` only as a fallback.
     */
    couples: CoupleRecord[];
    /**
     * Canonical union list. Populated by the 2.0.0 → 3.0.0 schema
     * migration from `couples`. Optional in 3a so existing Tree
     * literals (test fixtures, importer outputs that pre-date Phase 3a)
     * still typecheck. Use `getUnions(tree)` to read; the helper
     * derives from `couples` when this field is absent or empty.
     */
    unions?: UnionRecord[];
    /**
     * Overlay relationships (Phase 4; schema 3.1.0). Sworn bonds,
     * transformations, severances, alias-of, etc. — relationships that
     * are not part of the rank-and-bus skeleton. Rendered as overlay
     * segments routed independently of the standard layout.
     */
    relationships?: Relationship[];
    /**
     * Local edit counter, monotonically incremented by the tree store on
     * every user-driven mutation (set / update / reset / undo / redo).
     * Distinct from the server-side revision tracked by `syncStore.revision`,
     * which is set only after a successful round-trip with the API.
     */
    editRev: number;
    updatedAt: number;
}
