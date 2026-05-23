/*
 * FamilyTreeEditor - 5-char alphanumeric id generator matching FamilyScript shape
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";

export const ROOT_ID = "START";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ALPHABET_SIZE = ALPHABET.length;
const ID_LENGTH = 5;
const ID_PATTERN = /^[A-Z0-9]{5}$/;
const COLLISION_RETRY_LIMIT = 8;

// rejection-sampling threshold: largest multiple of ALPHABET_SIZE that fits in a byte
const REJECTION_THRESHOLD = Math.floor(256 / ALPHABET_SIZE) * ALPHABET_SIZE;

type RandomSource = (out: Uint8Array<ArrayBuffer>) => void;

const defaultRandom: RandomSource = (out) => {
    crypto.getRandomValues(out);
};

export function isValidId(id: string): boolean {
    return ID_PATTERN.test(id);
}

/**
 * Generates a fresh 5-char [A-Z0-9] id not present in `existing`.
 *
 * Uses crypto-grade randomness with rejection sampling to avoid the modulo bias
 * a naive `% 36` would introduce. Caller passes any Set-shaped collection of
 * already-claimed ids; falls back to a custom random source for tests.
 */
export function generateId(
    existing: ReadonlySet<string>,
    random: RandomSource = defaultRandom,
): PersonId {
    for (let attempt = 0; attempt < COLLISION_RETRY_LIMIT; attempt += 1) {
        const id = sampleId(random);
        if (!existing.has(id)) return id;
    }
    throw new Error(
        `generateId: ${String(COLLISION_RETRY_LIMIT)} collisions in a row; keyspace likely saturated`,
    );
}

function sampleId(random: RandomSource): string {
    const chars: string[] = [];
    // pull bytes in a small buffer; rejection-sample each one
    const buffer = new Uint8Array(ID_LENGTH * 2);
    while (chars.length < ID_LENGTH) {
        random(buffer);
        for (let i = 0; i < buffer.length && chars.length < ID_LENGTH; i += 1) {
            const byte = buffer[i];
            if (byte === undefined || byte >= REJECTION_THRESHOLD) continue;
            chars.push(ALPHABET[byte % ALPHABET_SIZE] ?? "A");
        }
    }
    return chars.join("");
}
