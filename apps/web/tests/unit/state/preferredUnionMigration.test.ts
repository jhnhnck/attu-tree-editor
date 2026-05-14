/*
 * FamilyTreeEditor - preferred-union localStorage migration tests.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migratePreferredUnion } from "$lib/state/preferredUnionMigration";
import type { Tree } from "$lib/domain/types";

function makeTree(id: string): Tree {
    return {
        id,
        name: "fixture",
        rootId: "p1",
        people: {
            p1: {
                id: "p1",
                given: "P",
                surname: "1",
                gender: "u",
                spouseIds: ["p2"],
                display: "z1",
            },
            p2: {
                id: "p2",
                given: "P",
                surname: "2",
                gender: "u",
                spouseIds: ["p1", "p3"],
                display: "z1",
            },
            p3: {
                id: "p3",
                given: "P",
                surname: "3",
                gender: "u",
                spouseIds: ["p2"],
                display: "z1",
            },
        },
        couples: [
            { leftId: "p1", rightId: "p2", childIds: [], unionIndex: 0 },
            { leftId: "p2", rightId: "p3", childIds: [], unionIndex: 1 },
        ],
        unions: [
            { id: "u-0", partnerIds: ["p1", "p2"], childIds: [] },
            { id: "u-1", partnerIds: ["p2", "p3"], childIds: [] },
        ],
        editRev: 0,
        updatedAt: 0,
    };
}

describe("migratePreferredUnion", () => {
    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(() => {
        localStorage.clear();
    });

    it("no-ops with no legacy keys and writes the sentinel", () => {
        const tree = makeTree("t-empty");
        const after = migratePreferredUnion(tree);
        expect(after).toBe(tree);
        expect(localStorage.getItem("fte.migrations.preferred-union.v1:t-empty")).toBe("done");
    });

    it("translates a legacy primary-union key into UnionRecord.preferredBy", () => {
        const tree = makeTree("t-prefer");
        localStorage.setItem(
            "fte.family-view.primary-union.v1:t-prefer:p2",
            JSON.stringify({ byPerson: { p2: 1 } }),
        );
        const after = migratePreferredUnion(tree);
        expect(after).not.toBe(tree);
        // p2 preferred union is at coupleIndex 1 (with p3)
        expect(after.unions?.[1]?.preferredBy).toEqual({ p2: true });
        expect(after.unions?.[0]?.preferredBy).toBeUndefined();
    });

    it("first key wins when a person appears in multiple focus contexts", () => {
        const tree = makeTree("t-collapse");
        // two focus keys with conflicting preferences for p2
        localStorage.setItem(
            "fte.family-view.primary-union.v1:t-collapse:focusA",
            JSON.stringify({ byPerson: { p2: 0 } }),
        );
        localStorage.setItem(
            "fte.family-view.primary-union.v1:t-collapse:focusB",
            JSON.stringify({ byPerson: { p2: 1 } }),
        );
        const after = migratePreferredUnion(tree);
        // exactly one of the unions should claim p2; the other shouldn't
        const claimed = (after.unions ?? []).filter((u) => u.preferredBy?.p2 === true);
        expect(claimed).toHaveLength(1);
    });

    it("is idempotent via the sentinel", () => {
        const tree = makeTree("t-idem");
        localStorage.setItem(
            "fte.family-view.primary-union.v1:t-idem:p2",
            JSON.stringify({ byPerson: { p2: 1 } }),
        );
        const first = migratePreferredUnion(tree);
        // second call must observe the sentinel and short-circuit
        const second = migratePreferredUnion(first);
        expect(second).toBe(first);
    });

    it("ignores legacy keys for unrelated tree ids", () => {
        const tree = makeTree("t-mine");
        localStorage.setItem(
            "fte.family-view.primary-union.v1:t-other:p2",
            JSON.stringify({ byPerson: { p2: 1 } }),
        );
        const after = migratePreferredUnion(tree);
        expect(after).toBe(tree);
        // sentinel is still written so we don't rescan
        expect(localStorage.getItem("fte.migrations.preferred-union.v1:t-mine")).toBe("done");
    });

    it("ignores out-of-range coupleIndex", () => {
        const tree = makeTree("t-bounds");
        localStorage.setItem(
            "fte.family-view.primary-union.v1:t-bounds:p2",
            JSON.stringify({ byPerson: { p2: 99 } }),
        );
        const after = migratePreferredUnion(tree);
        expect(after).toBe(tree);
    });

    it("ignores entries where personId isn't part of the targeted couple", () => {
        const tree = makeTree("t-mismatch");
        // p1 isn't in couple 1 (which is p2/p3) - drop it
        localStorage.setItem(
            "fte.family-view.primary-union.v1:t-mismatch:p1",
            JSON.stringify({ byPerson: { p1: 1 } }),
        );
        const after = migratePreferredUnion(tree);
        expect(after).toBe(tree);
    });
});
