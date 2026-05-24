/*
 * FamilyTreeEditor - composeImports: n-way ImportPayload fold via the
 * existing pairwise mergeTrees. Phase-5 DoD: fold order determines the
 * result; portraits accumulate across sources with personIds remapped
 * through each step's bIdMap.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { composeImports } from "$lib/io/import/composeImports";
import { createTree } from "$lib/domain/tree";
import type { ImportPayload } from "$lib/io/importFile";
import type { Person, Tree } from "$lib/domain/types";

function makeTree(rootGiven: string, rootSurname: string, idHint: string): Tree {
    const root: Omit<Person, "id"> = {
        given: rootGiven,
        surname: rootSurname,
        gender: "u",
        spouseIds: [],
        display: "z1",
    };
    return { ...createTree(`${rootGiven}'s tree`, root), id: `tree-${idHint}` };
}

function payloadFor(
    tree: Tree,
    format: ImportPayload["sourceFormat"] = "familyscript",
    portraits: ImportPayload["portraits"] = [],
): ImportPayload {
    return {
        tree,
        portraits,
        sourceFormat: format,
        count: Object.keys(tree.people).length,
    };
}

describe("composeImports", () => {
    it("passes a single payload through unchanged", () => {
        const tree = makeTree("Alice", "Smith", "a");
        const payload = payloadFor(tree);
        const { payload: out, findings } = composeImports([payload]);
        expect(out).toBe(payload);
        expect(findings).toEqual([]);
    });

    it("folds two disjoint payloads into a union of people", () => {
        const a = makeTree("Alice", "Smith", "a");
        const b = makeTree("Bob", "Jones", "b");
        const out = composeImports([payloadFor(a), payloadFor(b)]).payload;
        const givens = Object.values(out.tree.people).map((p) => p.given);
        expect(givens).toContain("Alice");
        expect(givens).toContain("Bob");
        expect(out.count).toBe(Object.keys(out.tree.people).length);
    });

    it("accumulates portraits across sources and remaps to surviving person ids", () => {
        const a = makeTree("Alice", "Smith", "a");
        const b = makeTree("Bob", "Jones", "b");
        const bRoot = b.rootId;
        const out = composeImports([
            payloadFor(a, "familyscript", []),
            payloadFor(b, "familyecho-html", [
                { personId: bRoot, ext: "jpg", bytes: new Uint8Array([1]) },
            ]),
        ]).payload;
        expect(out.portraits.length).toBe(1);
        const portraitTarget = out.portraits[0]?.personId;
        // portrait personId is whatever the merge mapped bRoot to; the only
        // requirement is that it points at a real person in the merged tree
        expect(portraitTarget).toBeDefined();
        if (!portraitTarget) return;
        expect(out.tree.people[portraitTarget]).toBeDefined();
    });

    it("is deterministic - identical inputs in the same order produce the same tree id map", () => {
        const a = makeTree("A", "x", "a");
        const b = makeTree("B", "x", "b");
        const c = makeTree("C", "x", "c");
        const r1 = composeImports([payloadFor(a), payloadFor(b), payloadFor(c)]).payload;
        const r2 = composeImports([payloadFor(a), payloadFor(b), payloadFor(c)]).payload;
        expect(Object.keys(r1.tree.people).sort()).toEqual(Object.keys(r2.tree.people).sort());
    });
});
