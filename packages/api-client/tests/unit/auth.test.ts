import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DRY_RUN_USER, auth } from "../../src/index.js";

const fetchMock = vi.fn();
beforeAll(() => {
    vi.stubGlobal("fetch", fetchMock);
});
beforeEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
});

function ok(body: unknown): Response {
    return { ok: true, status: 200, statusText: "OK", json: () => Promise.resolve(body) } as unknown as Response;
}
function noContent(): Response {
    return { ok: true, status: 204, statusText: "No Content", json: () => Promise.resolve(undefined) } as unknown as Response;
}

describe("auth (live mode)", () => {
    it("start() POSTs to /api/auth/start", async () => {
        const resp = { code: "abc123", expires_at: "2026-01-01T00:00:00Z" };
        fetchMock.mockResolvedValueOnce(ok(resp));
        const result = await auth.start();
        expect(result).toEqual(resp);
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/start", expect.objectContaining({ method: "POST" }));
    });

    it("check() GETs /api/auth/check", async () => {
        fetchMock.mockResolvedValueOnce(ok({ status: "ok" }));
        const result = await auth.check();
        expect(result.status).toBe("ok");
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/check", expect.objectContaining({ method: "GET" }));
    });

    it("me() GETs /api/auth/me", async () => {
        const user = { id: "u1", discord_id: "d1", discord_username: "dname", display_name: "User", role: "user" };
        fetchMock.mockResolvedValueOnce(ok(user));
        const result = await auth.me();
        expect(result.id).toBe("u1");
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ method: "GET" }));
    });

    it("logout() POSTs to /api/auth/logout and resolves void", async () => {
        fetchMock.mockResolvedValueOnce(noContent());
        await auth.logout();
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    });
});

describe("auth (dry-run mode)", () => {
    beforeEach(() => {
        localStorage.setItem("fte.debug.authDryRun", "true");
    });

    it("start() returns DRY-RUN code without hitting fetch", async () => {
        const result = await auth.start();
        expect(result.code).toBe("DRY-RUN");
        expect(typeof result.expires_at).toBe("string");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("me() returns DRY_RUN_USER without hitting fetch", async () => {
        const result = await auth.me();
        expect(result).toEqual(DRY_RUN_USER);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("logout() resolves without hitting fetch", async () => {
        await auth.logout();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("check() returns pending at first then transitions to ok", async () => {
        await auth.start(); // resets internal counter
        const statuses: string[] = [];
        let result;
        do {
            result = await auth.check();
            statuses.push(result.status);
        } while (result.status === "pending");
        expect(statuses.length).toBeGreaterThan(1); // at least one pending before resolving
        expect(statuses.slice(0, -1).every((s) => s === "pending")).toBe(true);
        expect(statuses.at(-1)).toBe("ok");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
