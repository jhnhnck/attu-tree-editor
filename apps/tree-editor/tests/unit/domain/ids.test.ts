/*
 * FamilyTreeEditor - id generator and validator
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { generateId, isValidId, ROOT_ID } from "$lib/domain/ids";

describe("isValidId", () => {
    it("accepts the START sentinel", () => {
        expect(isValidId(ROOT_ID)).toBe(true);
    });
    it("accepts arbitrary 5-char alphanumerics", () => {
        expect(isValidId("AG333")).toBe(true);
        expect(isValidId("ABCDE")).toBe(true);
        expect(isValidId("00000")).toBe(true);
    });
    it("rejects lowercase", () => {
        expect(isValidId("start")).toBe(false);
    });
    it("rejects wrong length", () => {
        expect(isValidId("ABCDE6")).toBe(false);
        expect(isValidId("ABCD")).toBe(false);
    });
    it("rejects punctuation", () => {
        expect(isValidId("ABCD-")).toBe(false);
        expect(isValidId("AB CD")).toBe(false);
    });
});

describe("generateId", () => {
    it("returns a 5-char alphanumeric string", () => {
        const id = generateId(new Set());
        expect(id).toMatch(/^[A-Z0-9]{5}$/);
    });

    it("never collides over 1000 invocations", () => {
        const seen = new Set<string>();
        for (let i = 0; i < 1000; i += 1) {
            const id = generateId(seen);
            expect(seen.has(id)).toBe(false);
            seen.add(id);
        }
    });

    it("retries on collision via the injected random source", () => {
        // first call returns all zeros (id "AAAAA"), second call returns all ones (id "BBBBB")
        let call = 0;
        const fakeRandom = (out: Uint8Array): void => {
            const fillByte = call === 0 ? 0 : 1;
            for (let i = 0; i < out.length; i += 1) out[i] = fillByte;
            call += 1;
        };
        const taken = new Set<string>(["AAAAA"]);
        const id = generateId(taken, fakeRandom);
        expect(id).toBe("BBBBB");
        expect(call).toBe(2);
    });

    it("throws when the injected source keeps returning a colliding id", () => {
        const fakeRandom = (out: Uint8Array): void => {
            for (let i = 0; i < out.length; i += 1) out[i] = 0;
        };
        const taken = new Set<string>(["AAAAA"]);
        expect(() => generateId(taken, fakeRandom)).toThrow(/keyspace likely saturated/);
    });
});
