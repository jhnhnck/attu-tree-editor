/*
 * FamilyTreeEditor - tiny smoke test for the family-view unit helpers.
 *
 * Keeps `pickLeftRight` / `leftmostAtRank` honest about their tie-break
 * rule (personId asc on equal x) so a later "fix" that switches to a
 * different tie-break doesn't silently land. The crossing-min pass in
 * phase 2 will rely on this exact tie-break to keep assertions stable.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { leftmostAtRank, pickLeftRight } from "../../_helpers/family-view";
import type { FamilyViewLayout, FamilyViewNode } from "$lib/layout/engines/family-view/types";

function makeLayout(nodes: readonly FamilyViewNode[]): FamilyViewLayout {
    const map = new Map<string, FamilyViewNode>();
    for (const n of nodes) map.set(n.personId, n);
    return {
        focus: nodes[0]?.personId ?? "",
        nodes: map,
        anchors: [],
        edges: [],
        badges: [],
        bbox: { width: 0, height: 0 },
        hasMoreChildren: new Set(),
        hasMoreParents: new Set(),
        canCollapse: new Set(),
        autoCollapsed: new Set(),
        multiUnionMates: new Map(),
    };
}

describe("pickLeftRight", () => {
    it("sorts ids by placed x ascending", () => {
        const layout = makeLayout([
            { personId: "a", rank: 0, x: 10, y: 0 },
            { personId: "b", rank: 0, x: 0, y: 0 },
            { personId: "c", rank: 0, x: 5, y: 0 },
        ]);
        expect(pickLeftRight(layout, ["a", "b", "c"])).toEqual(["b", "c", "a"]);
    });

    it("breaks ties on equal x with personId.localeCompare", () => {
        const layout = makeLayout([
            { personId: "zebra", rank: 0, x: 5, y: 0 },
            { personId: "apple", rank: 0, x: 5, y: 0 },
            { personId: "mango", rank: 0, x: 5, y: 0 },
        ]);
        expect(pickLeftRight(layout, ["zebra", "apple", "mango"])).toEqual([
            "apple",
            "mango",
            "zebra",
        ]);
    });

    it("throws when an id is missing from layout.nodes", () => {
        const layout = makeLayout([{ personId: "a", rank: 0, x: 0, y: 0 }]);
        expect(() => pickLeftRight(layout, ["a", "missing"])).toThrow(/missing/);
    });
});

describe("leftmostAtRank", () => {
    it("returns the leftmost at the requested rank", () => {
        const layout = makeLayout([
            { personId: "a", rank: 0, x: 10, y: 0 },
            { personId: "b", rank: 0, x: 0, y: 0 },
            { personId: "c", rank: -1, x: -50, y: -10 },
        ]);
        expect(leftmostAtRank(layout, 0)).toBe("b");
        expect(leftmostAtRank(layout, -1)).toBe("c");
    });

    it("breaks ties on equal x with personId.localeCompare", () => {
        const layout = makeLayout([
            { personId: "zebra", rank: 0, x: 5, y: 0 },
            { personId: "apple", rank: 0, x: 5, y: 0 },
        ]);
        expect(leftmostAtRank(layout, 0)).toBe("apple");
    });

    it("returns undefined when the rank has no placed nodes", () => {
        const layout = makeLayout([{ personId: "a", rank: 0, x: 0, y: 0 }]);
        expect(leftmostAtRank(layout, 99)).toBeUndefined();
    });
});
