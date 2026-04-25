/*
 * FamilyTreeEditor - tiny Result<T,E> for parser and validator boundaries
 * licensed under the MIT license; see LICENSE.md for full text
 */

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
