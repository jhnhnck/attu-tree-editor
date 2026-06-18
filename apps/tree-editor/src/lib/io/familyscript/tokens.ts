/*
 * FamilyTreeEditor - FamilyScript .txt tag-letter constants (import-only since the serializer was retired)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { DisplayFlag, Gender, ParentPedi } from "$lib/domain/types";

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

/**
 * FamilyScript V/W/Q pedi codes -> domain ParentPedi.
 *
 * Spec codes: b biological / a adopted / d guardian / s step / f foster /
 *             r surrogate / g godparent / o other.
 *
 * Only the codes that land on an existing `ParentPedi` value are mapped.
 * `s`, `d`, `g`, `r`, `o` have no canonical equivalent yet; phase-3 callers
 * default to `birth` and emit a finding so the data is still importable.
 */
export const FS_PEDI_FROM_CODE: Record<string, ParentPedi> = {
    b: "birth",
    a: "adopted",
    f: "foster",
};

export interface FsHeader {
    /** Verbatim # comment lines from the top of the file. */
    lines: string[];
}

/** Tail tokens of a couple record we don't have a domain slot for. */
export interface FsCoupleExtras {
    tag: string;
    value: string;
}
