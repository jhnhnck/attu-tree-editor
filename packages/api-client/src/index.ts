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
    role?: UserRole;
    display_name?: string;
}
