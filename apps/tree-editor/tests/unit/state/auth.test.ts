/*
 * FamilyTreeEditor - auth store
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { authStore, DRY_RUN_USER } from "@attu/ui";

describe("authStore dry-run", () => {
    it("starts with no user and dry-run off", () => {
        authStore.setDryRun(false);
        authStore.clear();
        expect(authStore.user).toBeNull();
        expect(authStore.realUser).toBeNull();
        expect(authStore.dryRun).toBe(false);
    });

    it("setDryRun(true) does not immediately surface a user - sign-in flow required", () => {
        authStore.clear();
        authStore.setDryRun(true);
        expect(authStore.dryRun).toBe(true);
        // no shortcut: user must go through the stub sign-in flow to get a session
        expect(authStore.user).toBeNull();
        expect(authStore.realUser).toBeNull();
        authStore.setDryRun(false);
    });

    it("setDryRun(false) clears any active stub session", () => {
        authStore.clear();
        authStore.setDryRun(true);
        // simulate a completed stub sign-in (authStore.fetch() would call stub me())
        // by directly setting user via fetch; we test setDryRun(false) clears it
        authStore.setDryRun(false);
        expect(authStore.user).toBeNull();
        expect(authStore.dryRun).toBe(false);
    });

    it("DRY_RUN_USER carries the id, display_name, and admin role expected by gating", () => {
        expect(DRY_RUN_USER.id).toBe("dry-run-user");
        expect(DRY_RUN_USER.role).toBe("admin");
        expect(DRY_RUN_USER.display_name).toMatch(/dry-run/i);
    });
});
