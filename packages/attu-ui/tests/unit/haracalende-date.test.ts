import { describe, expect, it } from "vitest";
import { HaracalndeDate } from "$lib/date/HaracalndeDate";

describe("HaracalndeDate", () => {
    it("round-trips through FamilyScript", () => {
        const raw = "01870715";
        const result = HaracalndeDate.parseFamilyScript(raw);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const date = result.value;
        expect(date).not.toBeNull();
        expect(date!.toFamilyScript()).toBe(raw);
    });
});
