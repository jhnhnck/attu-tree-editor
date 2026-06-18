/*
 * auth state: current user + sign-in trigger
 *
 * the "dry-run" flag signals that the auth API calls in client.ts are
 * being routed through the stub in auth-stub.ts. toggling it on shows
 * the "sign in" button as usual; the user must click through the
 * LinkCodeDialog to get a session. toggling it off clears any stub
 * session so the UI returns to the signed-out state.
 */

import type { MeResponse } from "@attu/api-client";
import { auth } from "@attu/api-client";
export { DRY_RUN_USER } from "@attu/api-client";

export interface AuthStore {
    readonly user: MeResponse | null;
    readonly realUser: MeResponse | null;
    readonly loading: boolean;
    readonly dryRun: boolean;
    fetch(): Promise<void>;
    clear(): void;
    setDryRun(on: boolean): void;
}

function createAuthStore(): AuthStore {
    let user = $state<MeResponse | null>(null);
    let loading = $state(false);
    let dryRun = $state(false);

    return {
        get user() {
            return user;
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
            if (!on) user = null; // clear any stub session when the toggle is turned off
            dryRun = on;
        },
    };
}

export const authStore = createAuthStore();
