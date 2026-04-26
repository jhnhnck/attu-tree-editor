/*
 * FamilyTreeEditor - FamilyScript .txt tag-letter constants (import-only since the serializer was retired)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { DisplayFlag, Gender } from "$lib/domain/types";

export const FS_PERSON_TAGS = [
    "i",
    "^",
    "g",
    "p",
    "z",
    "b",
    "d",
    "m",
    "f",
    "s",
    "l",
    "q",
    "T",
    "j",
    "V",
] as const;

export type FsPersonTag = (typeof FS_PERSON_TAGS)[number];

export const FS_GENDER_FROM_CODE: Record<string, Gender> = { m: "m", f: "f", u: "u" };
export const FS_DISPLAY_FROM_CODE: Record<string, DisplayFlag> = { "0": "z0", "1": "z1" };

export interface FsHeader {
    /** Verbatim # comment lines from the top of the file. */
    lines: string[];
}

/** Tail tokens of a couple record we don't have a domain slot for. */
export interface FsCoupleExtras {
    tag: string;
    value: string;
}
