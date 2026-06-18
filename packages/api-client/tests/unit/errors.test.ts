import { describe, expect, it } from "vitest";
import { ConflictError } from "../../src/index.js";

describe("ConflictError", () => {
    it("carries conflict payload and status 409", () => {
        const payload = {
            server_revision: 3,
            server_blob: { people: [] },
            server_updated_at: "2026-01-01T00:00:00Z",
        };
        const err = new ConflictError(payload);
        expect(err.status).toBe(409);
        expect(err.conflict).toBe(payload);
        expect(err).toBeInstanceOf(Error);
    });
});
