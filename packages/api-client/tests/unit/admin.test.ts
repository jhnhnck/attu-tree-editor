import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin } from "../../src/index.js";

const fetchMock = vi.fn();
beforeAll(() => {
    vi.stubGlobal("fetch", fetchMock);
});
beforeEach(() => {
    fetchMock.mockReset();
});

function ok(body: unknown): Response {
    return { ok: true, status: 200, statusText: "OK", json: () => Promise.resolve(body) } as unknown as Response;
}
function noContent(): Response {
    return { ok: true, status: 204, statusText: "No Content", json: () => Promise.resolve(undefined) } as unknown as Response;
}

const STUB_USER = {
    id: "u1", discord_id: "d1", discord_username: "dname",
    display_name: "User", role: "user" as const,
    created_at: "2026-01-01", deleted_at: null,
};

describe("admin", () => {
    it("listUsers() GETs /api/admin/users?page=1 by default", async () => {
        fetchMock.mockResolvedValueOnce(ok({ users: [STUB_USER], total: 1 }));
        const result = await admin.listUsers();
        expect(result.total).toBe(1);
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/users?page=1", expect.objectContaining({ method: "GET" }));
    });

    it("listUsers() passes explicit page number", async () => {
        fetchMock.mockResolvedValueOnce(ok({ users: [], total: 0 }));
        await admin.listUsers(3);
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/users?page=3", expect.anything());
    });

    it("updateUser() PUTs /api/admin/users/:id", async () => {
        const updated = { ...STUB_USER, display_name: "New Name" };
        fetchMock.mockResolvedValueOnce(ok(updated));
        const result = await admin.updateUser("u1", { display_name: "New Name" });
        expect(result.display_name).toBe("New Name");
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/u1", expect.objectContaining({ method: "PUT" }));
    });

    it("deleteUser() DELETEs /api/admin/users/:id", async () => {
        fetchMock.mockResolvedValueOnce(noContent());
        await admin.deleteUser("u1");
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/u1", expect.objectContaining({ method: "DELETE" }));
    });
});
