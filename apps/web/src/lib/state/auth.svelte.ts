/*
 * auth state: current user + sign-in trigger
 *
 * also hosts the "dry-run" debug shim. when `dryRun` is on and no real
 * user is signed in, `user` returns a synthetic `MeResponse` so client-
 * side gating (admin checks, "is signed in?" checks) flows through
 * without round-tripping to discord/the backend. the synthetic session
 * is in-memory only - reload restores no-session unless the debug
 * toggle is on at boot. nothing here touches the network; protected
 * actions that hit the backend with a synthetic user will still 401.
 */

import type { MeResponse } from "$lib/api/client";
import { auth } from "$lib/api/client";

export interface AuthStore {
    readonly user: MeResponse | null;
    readonly realUser: MeResponse | null;
    readonly loading: boolean;
    readonly dryRun: boolean;
    fetch(): Promise<void>;
    clear(): void;
    setDryRun(on: boolean): void;
}

// synthetic identity surfaced when dry-run is on and no real user is
// signed in. id is intentionally non-ULID-shaped so it stands out in
// logs and any accidental network payload. role is admin so dry-run
// can exercise the AdminPanel-gated paths too.
export const DRY_RUN_USER: MeResponse = {
    id: "dry-run-user",
    discord_id: "0",
    discord_username: "dry-run",
    display_name: "Debug User (dry-run)",
    role: "admin",
};

function createAuthStore(): AuthStore {
    let user = $state<MeResponse | null>(null);
    let loading = $state(false);
    let dryRun = $state(false);

    return {
        get user() {
            // real session wins; otherwise fall back to the synthetic
            // user iff dry-run is on. consumers that need to know
            // which one they got read `realUser` / `dryRun` directly.
            if (user) return user;
            if (dryRun) return DRY_RUN_USER;
            return null;
        },
        get realUser() {
            return user;
        },
        get loading() {
            return loading;
        },
        get dryRun() {
            return dryRun;
        },
        async fetch() {
            loading = true;
            try {
                user = await auth.me();
            } catch {
                user = null;
            } finally {
                loading = false;
            }
        },
        clear() {
            user = null;
        },
        setDryRun(on: boolean) {
            dryRun = on;
        },
    };
}

export const authStore = createAuthStore();
