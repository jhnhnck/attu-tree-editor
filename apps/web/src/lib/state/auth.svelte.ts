/*
 * auth state: current user + sign-in trigger
 */

import type { MeResponse } from "$lib/api/client";
import { auth } from "$lib/api/client";

export interface AuthStore {
    readonly user: MeResponse | null;
    readonly loading: boolean;
    fetch(): Promise<void>;
    clear(): void;
}

function createAuthStore(): AuthStore {
    let user = $state<MeResponse | null>(null);
    let loading = $state(false);

    return {
        get user() {
            return user;
        },
        get loading() {
            return loading;
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
    };
}

export const authStore = createAuthStore();
