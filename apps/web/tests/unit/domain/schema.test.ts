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
        // CURRENT is 1.0.0 so 1.5.0 is minor-newer
        const r = migrateToCurrent({ name: "x" }, "1.5.0");
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
        // CURRENT_SCHEMA_VERSION is 1.0.0 today, so migrateToCurrent itself
        // wouldn't walk anything. We use the test-only `_migrateBetween` to
        // verify the chain exists end-to-end.
        const original = { name: "x", people: {}, couples: {} };
        const r = _migrateBetween(original, "1.0.0", "3.4.0");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // All stubs are identity transforms, so the value reference is preserved.
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
