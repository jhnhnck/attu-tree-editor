/*
 * stub auth API used when fte.debug.authDryRun is active.
 *
 * simulates the full discord-oauth flow without hitting the backend:
 *   start() → returns a synthetic link code
 *   check() → returns "pending" for a few polls, then the configured outcome
 *   me()    → returns DRY_RUN_USER
 *   logout() → resolves immediately
 *
 * error-branch opt-in: set localStorage["fte.debug.authDryRunOutcome"]
 *   to "expired" or "not_found" before clicking "sign in". default is "ok".
 */

import type { LinkCheckResponse, LinkStartResponse, MeResponse } from "@attu/api-client";

export const DRY_RUN_USER: MeResponse = {
    id: "dry-run-user",
    discord_id: "0",
    discord_username: "dry-run",
    display_name: "Debug User (dry-run)",
    role: "admin",
};

// polls before transitioning from "pending" → outcome (~6s at the 2s poll interval)
const PENDING_POLLS = 3;

let checkCount = 0;

function outcome(): "ok" | "expired" | "not_found" {
    try {
        const v = localStorage.getItem("fte.debug.authDryRunOutcome");
        if (v === "expired" || v === "not_found") return v;
    } catch {
        // ignore
    }
    return "ok";
}

export const authStub = {
    start(): Promise<LinkStartResponse> {
        checkCount = 0;
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        return Promise.resolve({ code: "DRY-RUN", expires_at: expiresAt });
    },
    check(): Promise<LinkCheckResponse> {
        if (checkCount < PENDING_POLLS) {
            checkCount++;
            return Promise.resolve({ status: "pending" });
        }
        return Promise.resolve({ status: outcome() });
    },
    me(): Promise<MeResponse> {
        return Promise.resolve({ ...DRY_RUN_USER });
    },
    logout(): Promise<void> {
        return Promise.resolve();
    },
};
