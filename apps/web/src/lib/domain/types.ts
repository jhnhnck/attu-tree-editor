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
