/*
 * FamilyTreeEditor - phase 4 DoD: every new optional Person slot
 * (nickname, suffix, surnameAtBirth, givenAtBirth, birthPlace, deathPlace)
 * survives a GEDCOM serialize -> parse round-trip.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { serializeGedcom } from "$lib/io/gedcom/serialize";
import type { Person, Tree } from "$lib/domain/types";

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(`expected ok, got err: ${r.error}`);
    return r.value;
}

function richPerson(): Person {
    return {
        id: "AAAAA",
        given: "Mary",
        surname: "Smith",
        gender: { identity: "female" },
        spouseIds: [],
        display: "z1",
        nickname: "Molly",
        suffix: "Jr",
        givenAtBirth: "Maria",
        surnameAtBirth: "Jones",
        birth: { era: "PC", year: 1820, month: 4, day: 12 },
        birthPlace: "Arkaran",
        death: { era: "PC", year: 1895, month: 11, day: 3 },
        deathPlace: "Perat",
    };
}

function makeTree(): Tree {
    return {
        id: "test",
        name: "phase-4 round-trip",
        rootId: "AAAAA",
        people: { AAAAA: richPerson() },
        couples: [],
        editRev: 0,
        updatedAt: 0,
    };
}

describe("phase 4: new Person slots round-trip through GEDCOM", () => {
    it("nickname / suffix / birthPlace / deathPlace / surnameAtBirth / givenAtBirth all survive", () => {
        const tree = makeTree();
        const text = serializeGedcom(tree, {});
        const reparsed = unwrap(parseGedcom(text));
        // parser allocates fresh person ids via hashed xref; locate the
        // single re-imported person by given/surname pair
        const p = Object.values(reparsed.tree.people).find(
            (x) => x.given === "Mary" && x.surname === "Smith",
        );
        expect(p).toBeDefined();
        if (!p) return;
        expect(p.nickname).toBe("Molly");
        expect(p.suffix).toBe("Jr");
        expect(p.surnameAtBirth).toBe("Jones");
        expect(p.givenAtBirth).toBe("Maria");
        expect(p.birthPlace).toBe("Arkaran");
        expect(p.deathPlace).toBe("Perat");
    });

    it("emits BIRT block when only birthPlace is set (no birth date)", () => {
        const tree = makeTree();
        const person = tree.people["AAAAA"];
        if (!person) throw new Error("setup");
        delete person.birth;
        delete person.death;
        delete person.deathPlace;
        const text = serializeGedcom(tree, {});
        // serializer joins with \r\n; the regex below matches both EOL styles
        expect(text).toMatch(/1 BIRT\r?\n2 PLAC Arkaran/);
        const reparsed = unwrap(parseGedcom(text));
        const p = Object.values(reparsed.tree.people).find(
            (x) => x.given === "Mary" && x.surname === "Smith",
        );
        expect(p?.birthPlace).toBe("Arkaran");
        expect(p?.birth).toBeUndefined();
    });
});
