/**
 * hand-written types until `pnpm gen:api` regenerates from the live server.
 * run `pnpm gen:api` to overwrite with the generated schema.d.ts import.
 */

export type Role = "owner" | "editor" | "viewer";
export type UserRole = "admin" | "user";

export interface LinkStartResponse {
    code: string;
    expires_at: string;
}

export interface LinkCheckResponse {
    status: "pending" | "ok" | "expired" | "not_found";
}

export interface MeResponse {
    id: string;
    discord_id: string;
    discord_username: string;
    display_name: string;
    role: UserRole;
}

export interface TreeListing {
    id: string;
    name: string;
    role: Role;
    revision: number;
    updated_at: string;
}

export interface TreeListResponse {
    trees: TreeListing[];
}

export interface TreeCreateRequest {
    name?: string;
    blob?: unknown;
    schema_version?: number;
}

export interface TreeCreateResponse {
    id: string;
    revision: number;
}

export interface TreeResponse {
    id: string;
    name: string;
    owner_id: string;
    schema_version: number;
    blob: unknown;
    revision: number;
    updated_at: string;
    role: Role;
}

export interface TreeSaveRequest {
    name?: string | null;
    blob?: unknown;
    schema_version?: number | null;
    expected_revision: number;
}

export interface TreeSaveResponse {
    revision: number;
    updated_at: string;
}

export interface TreeConflictResponse {
    server_revision: number;
    server_blob: unknown;
    server_updated_at: string;
}

export interface GrantRequest {
    discord_id: string;
    role: "viewer" | "editor";
}

export interface GrantResponse {
    user_id: string;
    role: string;
}

export interface GrantListing {
    user_id: string;
    discord_id: string;
    display_name: string;
    role: "viewer" | "editor";
}

export interface GrantListResponse {
    grants: GrantListing[];
}

export interface AdminUserListing {
    id: string;
    discord_id: string;
    discord_username: string;
    display_name: string;
    role: UserRole;
    created_at: string;
    deleted_at: string | null;
}

export interface AdminUserListResponse {
    users: AdminUserListing[];
    total: number;
}

export interface AdminUserUpdateRequest {
    display_name?: string;
}

// ---------------------------------------------------------------------------
// fetch client
// ---------------------------------------------------------------------------

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

// consumers call setApiPrefix(import.meta.env.BASE_URL.replace(/\/$/, "")) at startup.
// default is "" (relative paths — works in dev and tests).
let _apiPrefix = "";

export function setApiPrefix(prefix: string): void {
    _apiPrefix = prefix;
}

function isDryRun(): boolean {
    try {
        return localStorage.getItem("fte.debug.authDryRun") === "true";
    } catch {
        return false;
    }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(_apiPrefix + path, {
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
// auth stub (dev dry-run mode — fte.debug.authDryRun localStorage flag)
// ---------------------------------------------------------------------------

export const DRY_RUN_USER: MeResponse = {
    id: "dry-run-user",
    discord_id: "0",
    discord_username: "dry-run",
    display_name: "Debug User (dry-run)",
    role: "admin",
};

// polls before transitioning from "pending" → outcome (~6s at the 2s poll interval)
const PENDING_POLLS = 3;
let _checkCount = 0;

function _dryRunOutcome(): "ok" | "expired" | "not_found" {
    try {
        const v = localStorage.getItem("fte.debug.authDryRunOutcome");
        if (v === "expired" || v === "not_found") return v;
    } catch {
        // ignore
    }
    return "ok";
}

const authStub = {
    start(): Promise<LinkStartResponse> {
        _checkCount = 0;
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        return Promise.resolve({ code: "DRY-RUN", expires_at: expiresAt });
    },
    check(): Promise<LinkCheckResponse> {
        if (_checkCount < PENDING_POLLS) {
            _checkCount++;
            return Promise.resolve({ status: "pending" });
        }
        return Promise.resolve({ status: _dryRunOutcome() });
    },
    me(): Promise<MeResponse> {
        return Promise.resolve({ ...DRY_RUN_USER });
    },
    logout(): Promise<void> {
        return Promise.resolve();
    },
};

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
