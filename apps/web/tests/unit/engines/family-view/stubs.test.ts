/*
 * FamilyTreeEditor - Phase 0 stub-existence tests.
 *
 * Every Phase 0 stub for the family-view engine: walk it, assert it
 * returns the documented empty/default value. Phase 1, 3, 5 fill the
 * bodies; these tests update to assert the new behaviour at that point.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { useExpansionState } from "$lib/layout/engines/family-view/expansion";
import { usePath } from "$lib/layout/engines/family-view/path";
import { decorate } from "$lib/layout/engines/family-view/cardDecorator";
import { emitFinding, onFinding } from "$lib/domain/findings";
import type { Person } from "$lib/domain/types";

function person(id: string, gender: Person["gender"]): Person {
    return { id, given: id, surname: "", gender, spouseIds: [], display: "z1" };
}

describe("expansion stub", () => {
    it("returns empty sets and no-op mutators", () => {
        const s = useExpansionState("t1", "p1");
        expect(s.expanded.size).toBe(0);
        expect(s.autoCollapsed.size).toBe(0);
        // No-op contract: calling does not throw.
        s.setExpanded("p2", true);
        s.reset();
        // Set is still empty (Phase 1 will change this).
        expect(s.expanded.size).toBe(0);
    });
});

describe("path-highlight degenerate cases", () => {
    // Phase 3 promotion: usePath now takes (tree, focus, selected) and
    // returns a non-empty set when a path exists. The stubs-test suite
    // covers only the degenerate cases (no tree / no selection / both
    // ids unknown); real-path coverage lives in `path.test.ts`.
    it("returns empty path-set when tree is undefined", () => {
        const p = usePath(undefined, "focus", "selected");
        expect(p.pathSet.size).toBe(0);
        expect(p.onPath("anyone")).toBe(false);
    });

    it("returns empty path-set when no selection", () => {
        const p = usePath(undefined, "focus", undefined);
        expect(p.pathSet.size).toBe(0);
        expect(p.onPath("focus")).toBe(false);
    });
});

describe("cardDecorator stub", () => {
    it("derives shape + tone from gender; everything else defaulted", () => {
        const male = decorate(person("p1", "m"));
        const female = decorate(person("p2", "f"));
        const unknown = decorate(person("p3", "u"));
        expect(male.shape).toBe("square");
        expect(female.shape).toBe("circle");
        expect(unknown.shape).toBe("diamond");
        expect(male.fillTone).toBe("sky");
        expect(female.fillTone).toBe("rose");
        expect(unknown.fillTone).toBe("amber");
        // All defaults: frame=solid, no glyphs, no underline.
        expect(male.frame).toBe("solid");
        expect(male.cornerGlyphs).toEqual([]);
        expect(male.underlineColour).toBeNull();
    });
});

describe("schema-overflow guard stub", () => {
    it("fans findings to subscribed listeners", () => {
        const received: string[] = [];
        const unsub = onFinding((f) => received.push(f.kind));
        try {
            emitFinding("multi-parent-unsupported", "v2 schema needed");
            emitFinding("schema-overflow", "test detail");
        } finally {
            unsub();
        }
        expect(received).toEqual(["multi-parent-unsupported", "schema-overflow"]);
    });

    it("unsubscribes cleanly", () => {
        let count = 0;
        const unsub = onFinding(() => {
            count += 1;
        });
        emitFinding("multi-parent-unsupported", "a");
        unsub();
        emitFinding("multi-parent-unsupported", "b");
        expect(count).toBe(1);
    });
});
