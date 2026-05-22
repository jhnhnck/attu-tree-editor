/*
 * FamilyTreeEditor - schema migration runner (semver)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import {
    _migrateBetween,
    CURRENT_SCHEMA_VERSION,
    migrateToCurrent,
    migrations,
} from "$lib/domain/schema";

describe("migrateToCurrent", () => {
    it("returns the input untouched at the current version", () => {
        const data = { schemaVersion: CURRENT_SCHEMA_VERSION, name: "x" };
        const r = migrateToCurrent(data, CURRENT_SCHEMA_VERSION);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.value).toBe(data);
        expect(r.value.appliedMigrations).toEqual([]);
    });

    it("treats undefined version as 1.0.0", () => {
        const r = migrateToCurrent({ name: "x" }, undefined);
        expect(r.ok).toBe(true);
    });

    it("accepts a legacy integer stamp (`1` reads as 1.0.0)", () => {
        const r = migrateToCurrent({ name: "x" }, 1);
        expect(r.ok).toBe(true);
    });

    it("rejects a major-newer version", () => {
        const r = migrateToCurrent({ name: "x" }, "999.0.0");
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error).toMatch(/newer than this build/);
    });

    it("accepts a minor-newer version with a forward-compat warning", () => {
        // Synthesize a minor-newer version relative to whatever CURRENT is
        // today by appending ".999.999" to CURRENT's major. CURRENT="3.0.0"
        // → "3.999.999"; future major bumps naturally track via the parse.
        const major = CURRENT_SCHEMA_VERSION.split(".")[0] ?? "1";
        const minorNewer = `${major}.999.999`;
        const r = migrateToCurrent({ name: "x" }, minorNewer);
        // Same major as CURRENT, higher minor → forward-compat accepted.
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.forwardCompatWarning).toMatch(/minor-newer/);
        expect(r.value.appliedMigrations).toEqual([]);
    });

    it("rejects a malformed semver string", () => {
        const r = migrateToCurrent({ name: "x" }, "not-a-version");
        expect(r.ok).toBe(false);
    });

    it("rejects a non-integer legacy stamp", () => {
        const r = migrateToCurrent({ name: "x" }, 1.5);
        expect(r.ok).toBe(false);
    });

    it("registers six identity-transform stubs for future schema bumps", () => {
        const expected: [string, string][] = [
            ["1.0.0", "2.0.0"],
            ["2.0.0", "3.0.0"],
            ["3.0.0", "3.1.0"],
            ["3.1.0", "3.2.0"],
            ["3.2.0", "3.3.0"],
            ["3.3.0", "3.4.0"],
        ];
        for (const [from, to] of expected) {
            const found = migrations.find((m) => m.from === from && m.to === to);
            expect(found, `migration ${from} -> ${to} should be registered`).toBeDefined();
        }
    });
});

describe("migration chain (Phase 0 identity-stub round-trip)", () => {
    it("walks every registered stub from 1.0.0 to 3.4.0 without data loss", () => {
        // The 1.0.0 → 2.0.0 step is real (Phase 2a populates parentIds);
        // the rest are identity stubs. Use _migrateBetween to walk the
        // entire chain to its current tail (3.4.0).
        const original = { name: "x", people: {}, couples: {} };
        const r = _migrateBetween(original, "1.0.0", "3.4.0");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // The non-identity 1.0.0 → 2.0.0 step mutates in place when there
        // are people to migrate; with `people: {}` there's nothing to do
        // and the same reference threads through unchanged.
        expect(r.value.value).toBe(original);
        expect(r.value.appliedMigrations.map((m) => `${m.from}->${m.to}`)).toEqual([
            "1.0.0->2.0.0",
            "2.0.0->3.0.0",
            "3.0.0->3.1.0",
            "3.1.0->3.2.0",
            "3.2.0->3.3.0",
            "3.3.0->3.4.0",
        ]);
    });
});

describe("Phase 3a migration: 2.0.0 → 3.0.0 populates unions[] from couples[]", () => {
    it("converts every CoupleRecord into a UnionRecord with deterministic id", () => {
        const v2 = {
            name: "x",
            people: {},
            couples: [
                {
                    leftId: "alice",
                    rightId: "bob",
                    unionIndex: 1,
                    childIds: ["kid1"],
                    marriageDate: { era: "PC", year: 1500, month: 6, day: 1 },
                    isPrimary: true,
                    isCurrent: true,
                },
                {
                    leftId: "alice",
                    rightId: "carol",
                    unionIndex: 2,
                    childIds: [],
                    isCurrent: false,
                },
            ],
        };
        const r = _migrateBetween(v2, "2.0.0", "3.0.0");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const migrated = r.value.value as typeof v2 & {
            unions?: { id: string; partnerIds: string[]; childIds: string[] }[];
        };
        expect(migrated.unions).toBeDefined();
        expect(migrated.unions).toHaveLength(2);
        expect(migrated.unions?.[0]).toEqual({
            id: "union-1-alice-bob",
            partnerIds: ["alice", "bob"],
            childIds: ["kid1"],
            marriageDate: { era: "PC", year: 1500, month: 6, day: 1 },
            isPrimary: true,
            isCurrent: true,
        });
        expect(migrated.unions?.[1]).toEqual({
            id: "union-2-alice-carol",
            partnerIds: ["alice", "carol"],
            childIds: [],
            isCurrent: false,
        });
        // legacy couples[] kept intact — Phase 3b sweeps readers
        expect(migrated.couples).toEqual(v2.couples);
    });

    it("leaves an already-populated unions[] alone (forward-compat)", () => {
        const alreadyV3 = {
            name: "x",
            people: {},
            couples: [{ leftId: "a", rightId: "b", unionIndex: 1, childIds: [] }],
            unions: [
                {
                    id: "custom-id",
                    partnerIds: ["a", "b", "c"],
                    childIds: [],
                    kind: "civil",
                    closed: true,
                },
            ],
        };
        const r = _migrateBetween(alreadyV3, "2.0.0", "3.0.0");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const migrated = r.value.value as typeof alreadyV3;
        expect(migrated.unions).toEqual(alreadyV3.unions);
    });

    it("handles empty couples[] cleanly", () => {
        const v2 = { name: "x", people: {}, couples: [] };
        const r = _migrateBetween(v2, "2.0.0", "3.0.0");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const migrated = r.value.value as typeof v2 & { unions?: unknown[] };
        expect(migrated.unions).toEqual([]);
    });

    it("preserves omitted optional fields (no undefined leaks)", () => {
        const v2 = {
            name: "x",
            people: {},
            couples: [{ leftId: "a", rightId: "b", unionIndex: 0, childIds: [] }],
        };
        const r = _migrateBetween(v2, "2.0.0", "3.0.0");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const u = (r.value.value as { unions: { marriageDate?: unknown; isPrimary?: unknown }[] })
            .unions[0];
        expect(u).toBeDefined();
        expect("marriageDate" in (u ?? {})).toBe(false);
        expect("isPrimary" in (u ?? {})).toBe(false);
        expect("isCurrent" in (u ?? {})).toBe(false);
    });
});

describe("Phase 5 migration: 3.1.0 → 3.2.0 normalises gender code to a struct", () => {
    it("maps every legacy m/f/u code to a GenderStruct identity", () => {
        const v3_1 = {
            name: "x",
            people: {
                a: { id: "a", gender: "m" },
                b: { id: "b", gender: "f" },
                c: { id: "c", gender: "u" },
            },
        };
        const r = _migrateBetween(v3_1, "3.1.0", "3.2.0");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const migrated = r.value.value as typeof v3_1;
        expect(migrated.people["a"]?.gender).toEqual({ identity: "male" });
        expect(migrated.people["b"]?.gender).toEqual({ identity: "female" });
        expect(migrated.people["c"]?.gender).toEqual({ identity: "unknown" });
    });

    it("leaves existing struct values alone (forward-compat)", () => {
        const v3_1 = {
            name: "x",
            people: {
                a: { id: "a", gender: { identity: "agender", fluid: true, pronouns: "they/them" } },
            },
        };
        const r = _migrateBetween(v3_1, "3.1.0", "3.2.0");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const migrated = r.value.value as typeof v3_1;
        expect(migrated.people["a"]?.gender).toEqual({
            identity: "agender",
            fluid: true,
            pronouns: "they/them",
        });
    });

    it("is idempotent — running the migration twice produces the same shape", () => {
        const v3_1 = {
            name: "x",
            people: { a: { id: "a", gender: "m" } },
        };
        const once = _migrateBetween(v3_1, "3.1.0", "3.2.0");
        expect(once.ok).toBe(true);
        if (!once.ok) return;
        const twice = _migrateBetween(once.value.value, "3.1.0", "3.2.0");
        expect(twice.ok).toBe(true);
        if (!twice.ok) return;
        const migrated = twice.value.value as typeof v3_1;
        expect(migrated.people["a"]?.gender).toEqual({ identity: "male" });
    });
});

describe("Phase 2b migration: 1.0.0 → 2.0.0 replaces legacy with parentIds", () => {
    it("converts motherId / fatherId into parentIds entries and drops legacy keys", () => {
        const v1 = {
            name: "x",
            people: {
                kid: {
                    id: "kid",
                    given: "Kid",
                    motherId: "mom",
                    fatherId: "dad",
                },
                mom: { id: "mom", given: "Mom" },
                dad: { id: "dad", given: "Dad" },
            },
            couples: [],
        };
        const r = _migrateBetween(v1, "1.0.0", "2.0.0");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const migrated = r.value.value as typeof v1;
        const kid = migrated.people["kid"] as {
            motherId?: string;
            fatherId?: string;
            parentIds?: { personId: string; role?: string; pedi?: string }[];
        };
        // Legacy fields deleted after Phase 2b lands.
        expect(kid.motherId).toBeUndefined();
        expect(kid.fatherId).toBeUndefined();
        // parentIds populated.
        expect(kid.parentIds).toEqual([
            { personId: "mom", role: "mother", pedi: "birth" },
            { personId: "dad", role: "father", pedi: "birth" },
        ]);
    });

    it("leaves existing parentIds alone (forward-compat)", () => {
        const alreadyV2 = {
            name: "x",
            people: {
                kid: {
                    id: "kid",
                    given: "Kid",
                    motherId: "old-mom",
                    fatherId: "old-dad",
                    parentIds: [
                        { personId: "new-parent-1", role: "parent", pedi: "birth" },
                        { personId: "new-parent-2", role: "parent", pedi: "adopted" },
                    ],
                },
            },
            couples: [],
        };
        const r = _migrateBetween(alreadyV2, "1.0.0", "2.0.0");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const kid = (r.value.value as typeof alreadyV2).people["kid"] as {
            parentIds: { personId: string; role: string; pedi: string }[];
        };
        // Untouched.
        expect(kid.parentIds).toEqual([
            { personId: "new-parent-1", role: "parent", pedi: "birth" },
            { personId: "new-parent-2", role: "parent", pedi: "adopted" },
        ]);
    });

    it("handles single-parent and zero-parent cases cleanly", () => {
        const v1 = {
            name: "x",
            people: {
                onlyMom: { id: "onlyMom", given: "OnlyMom", motherId: "m" },
                orphan: { id: "orphan", given: "Orphan" },
            },
            couples: [],
        };
        const r = _migrateBetween(v1, "1.0.0", "2.0.0");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const migrated = r.value.value as typeof v1;
        expect(
            (migrated.people["onlyMom"] as unknown as { parentIds: { personId: string }[] })
                .parentIds,
        ).toEqual([{ personId: "m", role: "mother", pedi: "birth" }]);
        expect(
            (migrated.people["orphan"] as unknown as { parentIds: unknown[] }).parentIds,
        ).toEqual([]);
    });
});
