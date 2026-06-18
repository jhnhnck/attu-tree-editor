import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ConflictError, auth, onUnauthorized, setApiPrefix } from "../../src/index.js";

const fetchMock = vi.fn();
beforeAll(() => {
    vi.stubGlobal("fetch", fetchMock);
});
beforeEach(() => {
    fetchMock.mockReset();
});
afterEach(() => {
    setApiPrefix("");
});

function jsonRes(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "Status",
        json: () => Promise.resolve(body),
    } as unknown as Response;
}

describe("ApiError", () => {
    it("stores status and message", () => {
        const e = new ApiError(500, "server error");
        expect(e.status).toBe(500);
        expect(e.message).toBe("server error");
        expect(e).toBeInstanceOf(Error);
    });
});

describe("ConflictError", () => {
    it("carries conflict payload and status 409", () => {
        const payload = { server_revision: 3, server_blob: {}, server_updated_at: "2026-01-01T00:00:00Z" };
        const e = new ConflictError(payload);
        expect(e.status).toBe(409);
        expect(e.conflict).toBe(payload);
        expect(e).toBeInstanceOf(ApiError);
    });
});

describe("onUnauthorized", () => {
    it("fires registered handler on 401 response", async () => {
        const handler = vi.fn();
        onUnauthorized(handler);
        fetchMock.mockResolvedValueOnce(jsonRes(401, {}));
        await expect(auth.check()).rejects.toBeInstanceOf(ApiError);
        expect(handler).toHaveBeenCalledOnce();
    });
});

describe("setApiPrefix", () => {
    it("prefixes all outgoing request URLs", async () => {
        setApiPrefix("/trees");
        const user = { id: "u1", discord_id: "d1", discord_username: "u", display_name: "U", role: "user" };
        fetchMock.mockResolvedValueOnce(jsonRes(200, user));
        await auth.me();
        expect(fetchMock).toHaveBeenCalledWith("/trees/api/auth/me", expect.anything());
    });
});
