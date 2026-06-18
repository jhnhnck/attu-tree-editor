import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, trees } from "../../src/index.js";

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
function conflictResponse(body: unknown): Response {
    return { ok: false, status: 409, statusText: "Conflict", json: () => Promise.resolve(body) } as unknown as Response;
}

const STUB_TREE = {
    id: "t1", name: "T", owner_id: "u1", schema_version: 1,
    blob: {}, revision: 2, updated_at: "2026-01-01", role: "owner" as const,
};

describe("trees", () => {
    it("list() GETs /api/trees", async () => {
        fetchMock.mockResolvedValueOnce(ok({ trees: [STUB_TREE] }));
        const result = await trees.list();
        expect(result.trees).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledWith("/api/trees", expect.objectContaining({ method: "GET" }));
    });

    it("create() POSTs /api/trees with body", async () => {
        fetchMock.mockResolvedValueOnce(ok({ id: "t2", revision: 1 }));
        const result = await trees.create({ name: "New Tree" });
        expect(result.id).toBe("t2");
        expect(fetchMock).toHaveBeenCalledWith("/api/trees", expect.objectContaining({ method: "POST" }));
    });

    it("get() GETs /api/trees/:id", async () => {
        fetchMock.mockResolvedValueOnce(ok(STUB_TREE));
        const result = await trees.get("t1");
        expect(result.id).toBe("t1");
        expect(fetchMock).toHaveBeenCalledWith("/api/trees/t1", expect.objectContaining({ method: "GET" }));
    });

    it("save() PUTs /api/trees/:id and returns updated revision", async () => {
        fetchMock.mockResolvedValueOnce(ok({ revision: 3, updated_at: "2026-01-02" }));
        const result = await trees.save("t1", { expected_revision: 2 });
        expect(result.revision).toBe(3);
        expect(fetchMock).toHaveBeenCalledWith("/api/trees/t1", expect.objectContaining({ method: "PUT" }));
    });

    it("save() throws ConflictError on 409", async () => {
        const payload = { server_revision: 5, server_blob: {}, server_updated_at: "2026-01-01" };
        fetchMock.mockResolvedValueOnce(conflictResponse(payload));
        const err = await trees.save("t1", { expected_revision: 2 }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictError);
        expect((err as ConflictError).conflict.server_revision).toBe(5);
    });

    it("delete() DELETEs /api/trees/:id", async () => {
        fetchMock.mockResolvedValueOnce(noContent());
        await trees.delete("t1");
        expect(fetchMock).toHaveBeenCalledWith("/api/trees/t1", expect.objectContaining({ method: "DELETE" }));
    });

    it("addGrant() POSTs /api/trees/:id/grants", async () => {
        fetchMock.mockResolvedValueOnce(ok({ user_id: "u2", role: "viewer" }));
        const result = await trees.addGrant("t1", { discord_id: "d2", role: "viewer" });
        expect(result.user_id).toBe("u2");
        expect(fetchMock).toHaveBeenCalledWith("/api/trees/t1/grants", expect.objectContaining({ method: "POST" }));
    });

    it("listGrants() GETs /api/trees/:id/grants", async () => {
        fetchMock.mockResolvedValueOnce(ok({ grants: [] }));
        const result = await trees.listGrants("t1");
        expect(result.grants).toEqual([]);
        expect(fetchMock).toHaveBeenCalledWith("/api/trees/t1/grants", expect.objectContaining({ method: "GET" }));
    });

    it("revokeGrant() DELETEs /api/trees/:id/grants/:userId", async () => {
        fetchMock.mockResolvedValueOnce(noContent());
        await trees.revokeGrant("t1", "u2");
        expect(fetchMock).toHaveBeenCalledWith("/api/trees/t1/grants/u2", expect.objectContaining({ method: "DELETE" }));
    });
});
