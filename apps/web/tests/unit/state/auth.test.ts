/*
 * FamilyTreeEditor - auth store dry-run debug shim
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { authStore, DRY_RUN_USER } from "$lib/state/auth.svelte";

describe("authStore dry-run", () => {
    it("starts with no user and dry-run off", () => {
        // module-level singleton; ensure the test sees the freshly-imported
        // default state. setDryRun(false) is a no-op when already false.
        authStore.setDryRun(false);
        authStore.clear();
        expect(authStore.user).toBeNull();
        expect(authStore.realUser).toBeNull();
        expect(authStore.dryRun).toBe(false);
    });

    it("setDryRun(true) surfaces a synthetic user when no real user is signed in", () => {
        authStore.clear();
        authStore.setDryRun(true);
        expect(authStore.dryRun).toBe(true);
        expect(authStore.user).toEqual(DRY_RUN_USER);
        // the real-session getter still reads as empty - dry-run only
        // shims the effective `user`
        expect(authStore.realUser).toBeNull();
        // tidy up so later tests don't see the synthetic
        authStore.setDryRun(false);
    });

    it("synthetic user carries the id, display_name, and admin role expected by gating", () => {
        // documents the contract for consumers that check role / display_name
        expect(DRY_RUN_USER.id).toBe("dry-run-user");
        expect(DRY_RUN_USER.role).toBe("admin");
        expect(DRY_RUN_USER.display_name).toMatch(/dry-run/i);
    });

    it("setDryRun(false) removes the synthetic user", () => {
        authStore.clear();
        authStore.setDryRun(true);
        expect(authStore.user).not.toBeNull();
        authStore.setDryRun(false);
        expect(authStore.user).toBeNull();
        expect(authStore.dryRun).toBe(false);
    });
});
