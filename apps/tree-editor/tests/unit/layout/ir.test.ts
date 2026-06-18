/*
 * FamilyTreeEditor - tests for layout/ir.ts (IR helpers).
 *
 * Phase 3 trim: dropped the `hvLayoutToPlacedGraph` + `placedGraphToHvLayout`
 * adapter tests because (a) `hvLayoutToPlacedGraph` was deleted (no
 * consumer), and (b) `placedGraphToHvLayout` is going away in Phase 4
 * when TreeCanvas absorbs its body. PlacedGraph invariants are now
 * covered by `place.test.ts` against the actual production pipeline.
 *
 * The ghost-id helpers stay — they're the IR's only utility surface and
 * are used in production by `passes/place.ts`, `passes/route.ts`, and
 * TreeCanvas's instance-popover code.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { ghostNodeId, parseGhostNodeId } from "$lib/layout/ir";

describe("ghostNodeId / parseGhostNodeId", () => {
    it("produces and parses round-trip correctly", () => {
        const id = ghostNodeId("PERSON_A", "PERSON_B");
        const parsed = parseGhostNodeId(id);
        expect(parsed).not.toBeNull();
        expect(parsed?.ghostOf).toBe("PERSON_A");
        expect(parsed?.nearId).toBe("PERSON_B");
    });

    it("returns null for non-ghost ids", () => {
        expect(parseGhostNodeId("PERSON_A")).toBeNull();
        expect(parseGhostNodeId("")).toBeNull();
        expect(parseGhostNodeId(ROOT_ID)).toBeNull();
    });

    it("ghost prefix is recognisable", () => {
        const id = ghostNodeId("X", "Y");
        expect(id.startsWith("ghost:")).toBe(true);
        expect(id).toContain("|");
    });
});
