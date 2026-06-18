/*
 * FamilyTreeEditor - Akarians fixture freeze guard (Phase 0 family-view).
 *
 * The Akarians DEMO file is the canonical 1,802-person fixture this
 * project's perf budgets, visual goldens, and e2e flows assert against.
 * Phase 0 of `notes/plans/family-view.md` freezes its SHA so any
 * accidental mutation fails CI early instead of silently shifting the
 * baselines. Phase 4 editing tests use the dedicated
 * `akarians-edit-sandbox.json` copy to mutate (when added); the
 * canonical .ged stays read-only.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

// @vitest-environment node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");
const FROZEN_SHA = resolve(process.cwd(), "tests/fixtures/akarians.sha256.txt");

describe("Akarians fixture freeze", () => {
    it("matches the frozen SHA256", () => {
        const expected = readFileSync(FROZEN_SHA, "utf8").trim();
        const actual = createHash("sha256").update(readFileSync(FIXTURE)).digest("hex");
        expect(actual).toBe(expected);
    });
});
