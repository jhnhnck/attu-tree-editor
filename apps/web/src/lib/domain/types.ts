/*
 * FamilyTreeEditor - core domain types shared by importers, editor, and serializers
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { HaracalndeDateData } from "$lib/date/HaracalndeDate";

export type PersonId = string;
/**
 * Legacy single-character gender code. Pre-3.2.0 trees stored this directly
 * on `Person.gender`; post-3.2.0 the canonical home is the `GenderStruct`
 * but the legacy code is retained as a union member so test fixtures and
 * old-format imports keep typechecking. Use `legacyGenderCode(person)` from
 * `personIdentity.ts` to read it from a `Person` regardless of which form
 * is in flight.
 */
export type Gender = "m" | "f" | "u";
export type DisplayFlag = "z0" | "z1";

/**
 * Assigned sex at birth (Phase 5; schema 3.2.0). Open-ended for fictional
 * cases (sealed envelopes, ritual ungendering, ambiguous magical origins);
 * absence implies cisgender — see `getInferredAssignedAtBirth`.
 */
export type AssignedAtBirth = "AMAB" | "AFAB" | "UAAB";

/**
 * Gender record (Phase 5; schema 3.2.0). Replaces the legacy
 * `Gender` single-character code. `identity` is the canonical user-set
 * identity (open string — `male` / `female` / `unknown` are the canonical
 * migration values, but the field accepts free-form text for fictional /
 * non-binary identities); `assignedAtBirth` is independent of identity
 * for trans / intersex records. `fluid` defaults to `false`. Cisgender
 * is the inferred default when only `identity` or only `assignedAtBirth`
 * is set — see `personIdentity.ts` helpers.
 */
export interface GenderStruct {
    /** open string; canonical migration values are "male" | "female" | "unknown" */
    identity: string;
    pronouns?: string;
    assignedAtBirth?: AssignedAtBirth;
    fluid?: boolean;
}

/**
 * `Person.kind` (Phase 5; schema 3.2.0). Open string drives card frame +
 * tone in the cardDecorator. Canonical values consumed by `decorate` are
 * `biological`, `mechanical`, `spirit`, `collective`, `concept`; other
 * strings pass through verbatim (e.g. `chimera`, `golem`, `hive`).
 */
export type PersonKind = string;

/**
 * Origin record (Phase 5; schema 3.2.0). How a person came into being.
 * `kind` drives the cardDecorator corner-glyph; `cause` and `date` are
 * free-form context (e.g. "summoned by ritual X" + date of summoning).
 * Canonical glyph-mapped values are `born`, `cloned`, `hatched`,
 * `summoned`, `awoken`, `manufactured`; other strings have no glyph but
 * round-trip through GEDCOM and the inspector.
 */
export type OriginKind = string;

export interface Origin {
    kind: OriginKind;
    cause?: string;
    date?: HaracalndeDateData;
}

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
    /**
     * Schema 3.2.0 transitional union: accepts either the legacy
     * single-character code (`'m' | 'f' | 'u'`) or the new `GenderStruct`.
     * The migration normalises legacy codes to structs on read, but the
     * type stays a union so pre-3.2.0 test fixtures and importer outputs
     * continue to typecheck unchanged. Read through `legacyGenderCode` /
     * `getIdentity` from `personIdentity.ts` — never branch on the field
     * directly.
     */
    gender: Gender | GenderStruct;
    birth?: HaracalndeDateData;
    death?: HaracalndeDateData;
    occupation?: string;
    location?: string;
    locationOrigin?: string;
    /** open string (e.g. "human", "dragon", "chimera"). Phase 5; schema 3.2.0. */
    species?: string;
    /** see `PersonKind`. Phase 5; schema 3.2.0. */
    kind?: PersonKind;
    /** see `Origin`. Phase 5; schema 3.2.0. */
    origin?: Origin;
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

/**
 * Group classification (Phase 6a; schema 3.3.0). Open string — the 7
 * canonical kinds (`dynasty`, `house`, `clan`, `household`, `faction`,
 * `order`, `covenant`) drive the inspector kind-picker and the
 * renderer's default tone; non-canonical strings round-trip but pick
 * the `band` default frame style.
 */
export type GroupKind = string;

/**
 * How a group's frame renders on the canvas. `hull` is a convex hull
 * around the members' card positions (semi-transparent fill); `band` is
 * a vertical lane down a slice of the canvas tinted with the group's
 * colour; `ribbon` is a generation-spanning header bar at the top of
 * the group's rank range.
 */
export type GroupFrameStyle = "hull" | "band" | "ribbon";

/**
 * Optional armorial blazon — free-form text the inspector exposes,
 * reserved for a future image-binding flow.
 */
export interface GroupArmorial {
    description?: string;
    blobId?: string;
}

/**
 * Optional frame styling override. Absent → the renderer picks
 * sensible defaults based on `kind` (dynasty / house → hull;
 * faction / order / covenant → band; clan → ribbon; household → hull).
 */
export interface GroupFrameOverride {
    style?: GroupFrameStyle;
    color?: string;
}

/**
 * A named group (dynasty, house, clan, household, faction, order,
 * covenant). Phase 6a (schema 3.3.0) lands the data + rendering;
 * Phase 8 sweeps documentation + GEDCOM `_TREES_GROUP` extension.
 */
export interface Group {
    id: string;
    name: string;
    kind: GroupKind;
    memberIds: PersonId[];
    founderId?: PersonId;
    armorial?: GroupArmorial;
    frame?: GroupFrameOverride;
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
     * Named groups: dynasties, houses, clans, households, factions,
     * orders, covenants (Phase 6a; schema 3.3.0). Renders as a frame
     * (hull / band / ribbon) behind the cards. Optional so existing
     * Tree literals stay valid; absence is treated as the empty list.
     */
    groups?: Group[];
    /**
     * Local edit counter, monotonically incremented by the tree store on
     * every user-driven mutation (set / update / reset / undo / redo).
     * Distinct from the server-side revision tracked by `syncStore.revision`,
     * which is set only after a successful round-trip with the API.
     */
    editRev: number;
    updatedAt: number;
}
