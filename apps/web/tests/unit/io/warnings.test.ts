/*
 * FamilyTreeEditor - export warnings
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { fieldsDroppedFor } from "$lib/io/warnings";
import type { Tree } from "$lib/domain/types";

function tree(overrides: Partial<Tree> = {}): Tree {
    return {
        id: "x",
        name: "x",
        rootId: "AAAAA",
        people: {},
        couples: [],
        rev: 0,
        updatedAt: 0,
        ...overrides,
    };
}

describe("fieldsDroppedFor", () => {
    it("clean tree produces no warnings", () => {
        expect(fieldsDroppedFor(tree(), "gedzip")).toEqual([]);
        expect(fieldsDroppedFor(tree(), "json")).toEqual([]);
    });

    it("z0 + gedzip target → faded warning", () => {
        const t = tree({
            people: {
                AAAAA: {
                    id: "AAAAA",
                    given: "A",
                    surname: "",
                    gender: "u",
                    spouseIds: [],
                    display: "z0",
                },
            },
        });
        const w = fieldsDroppedFor(t, "gedzip");
        expect(w.find((x) => x.field === "display")?.affectedPersonIds).toEqual(["AAAAA"]);
    });

    it("locationOrigin + gedzip → q-tag warning", () => {
        const t = tree({
            people: {
                AAAAA: {
                    id: "AAAAA",
                    given: "A",
                    surname: "",
                    gender: "u",
                    spouseIds: [],
                    display: "z1",
                    locationOrigin: "Deram",
                },
            },
        });
        const w = fieldsDroppedFor(t, "gedzip");
        expect(w.some((x) => x.field === "locationOrigin")).toBe(true);
    });

    it("portrait + gedzip target → no portrait warning (gedzip carries it)", () => {
        const t = tree({
            people: {
                AAAAA: {
                    id: "AAAAA",
                    given: "A",
                    surname: "",
                    gender: "u",
                    spouseIds: [],
                    display: "z1",
                    portraitBlobId: "blob1",
                },
            },
        });
        const w = fieldsDroppedFor(t, "gedzip");
        expect(w.some((x) => x.field === "portrait")).toBe(false);
    });

    it("json target produces no warnings even with all special fields", () => {
        const t = tree({
            couples: [{ leftId: "A", rightId: "B", unionIndex: 2, childIds: [] }],
            people: {
                AAAAA: {
                    id: "AAAAA",
                    given: "A",
                    surname: "",
                    gender: "u",
                    spouseIds: [],
                    display: "z0",
                    locationOrigin: "Deram",
                    wikiTitle: "Some Page",
                    portraitBlobId: "blob1",
                },
            },
        });
        expect(fieldsDroppedFor(t, "json")).toEqual([]);
    });
});
