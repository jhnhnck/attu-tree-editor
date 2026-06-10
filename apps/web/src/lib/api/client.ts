/*
 * typed fetch wrapper for the attu tree api.
 * surfaces 401 → triggers sign-in; 409 → conflict; other errors → thrown.
 * all requests use credentials:'include' so the httponly session cookie is sent.
 */

import type {
    GrantListResponse,
    GrantRequest,
    GrantResponse,
    LinkCheckResponse,
    LinkStartResponse,
    MeResponse,
    TreeConflictResponse,
    TreeCreateRequest,
    TreeCreateResponse,
    TreeListResponse,
    TreeResponse,
    TreeSaveRequest,
    TreeSaveResponse,
    AdminUserListResponse,
    AdminUserListing,
    AdminUserUpdateRequest,
} from "@attu/api-client";
import { authStub } from "$lib/api/auth-stub";

export type { TreeConflictResponse };

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

export class ConflictError extends ApiError {
    constructor(public readonly conflict: TreeConflictResponse) {
        super(409, "revision conflict");
    }
}

let _onUnauthorized: (() => void) | undefined;

export function onUnauthorized(handler: () => void): void {
    _onUnauthorized = handler;
}

// vite injects BASE_URL from `base` in vite.config.ts (`/trees/` in prod, `/` in
// dev). prefixing every request with it keeps cookies (path=/trees/) attached
// and routes through caddy's /trees/ mount.
const API_PREFIX = import.meta.env.BASE_URL.replace(/\/$/, "");

function isDryRun(): boolean {
    try {
        return localStorage.getItem("fte.debug.authDryRun") === "true";
    } catch {
        return false;
    }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(API_PREFIX + path, {
        method,
        credentials: "include",
        headers: body !== undefined ? { "content-type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : null,
    });

    if (res.status === 401) {
        _onUnauthorized?.();
        throw new ApiError(401, "not authenticated");
    }

    if (res.status === 409) {
        const conflict = (await res.json()) as TreeConflictResponse;
        throw new ConflictError(conflict);
    }

    if (!res.ok) {
        let detail = res.statusText;
        try {
            const err: unknown = await res.json();
            if (typeof err === "object" && err !== null && "detail" in err) {
                detail = String((err as Record<string, unknown>)["detail"]);
            }
        } catch {
            // ignore parse error
        }
        throw new ApiError(res.status, detail);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

export const auth = {
    start: (): Promise<LinkStartResponse> =>
        isDryRun() ? authStub.start() : req<LinkStartResponse>("POST", "/api/auth/start"),
    check: (): Promise<LinkCheckResponse> =>
        isDryRun() ? authStub.check() : req<LinkCheckResponse>("GET", "/api/auth/check"),
    logout: (): Promise<void> =>
        isDryRun() ? authStub.logout() : req<void>("POST", "/api/auth/logout"),
    me: (): Promise<MeResponse> =>
        isDryRun() ? authStub.me() : req<MeResponse>("GET", "/api/auth/me"),
};

// ---------------------------------------------------------------------------
// trees
// ---------------------------------------------------------------------------

export const trees = {
    list: () => req<TreeListResponse>("GET", "/api/trees"),
    create: (body: TreeCreateRequest) => req<TreeCreateResponse>("POST", "/api/trees", body),
    get: (id: string) => req<TreeResponse>("GET", `/api/trees/${id}`),
    save: (id: string, body: TreeSaveRequest) =>
        req<TreeSaveResponse>("PUT", `/api/trees/${id}`, body),
    delete: (id: string) => req<void>("DELETE", `/api/trees/${id}`),
    addGrant: (id: string, body: GrantRequest) =>
        req<GrantResponse>("POST", `/api/trees/${id}/grants`, body),
    listGrants: (id: string) => req<GrantListResponse>("GET", `/api/trees/${id}/grants`),
    revokeGrant: (treeId: string, userId: string) =>
        req<void>("DELETE", `/api/trees/${treeId}/grants/${userId}`),
};

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------

export const admin = {
    listUsers: (page = 1) => req<AdminUserListResponse>("GET", `/api/admin/users?page=${page}`),
    updateUser: (id: string, body: AdminUserUpdateRequest) =>
        req<AdminUserListing>("PUT", `/api/admin/users/${id}`, body),
    deleteUser: (id: string) => req<void>("DELETE", `/api/admin/users/${id}`),
};

// re-export convenience types used in components
export type {
    AdminUserListing,
    GrantListing,
    MeResponse,
    TreeListing,
    TreeResponse,
} from "@attu/api-client";
