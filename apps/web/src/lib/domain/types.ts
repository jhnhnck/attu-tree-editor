/*
 * FamilyTreeEditor - core domain types shared by importers, editor, and serializers
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { HaracalndeDateData } from "$lib/date/HaracalndeDate";

export type PersonId = string;
export type Gender = "m" | "f" | "u";
export type DisplayFlag = "z0" | "z1";

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
    motherId?: PersonId;
    fatherId?: PersonId;
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
    rev: number;
    updatedAt: number;
}
